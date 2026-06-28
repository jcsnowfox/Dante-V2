"use strict";

/**
 * runtimeHealthProbe
 *
 * Pure synchronous function. Takes a snapshot of available runtime statuses
 * and produces a structured health result per source.
 *
 * Health states:
 *   healthy  — operating normally
 *   watch    — worth monitoring; not yet degraded
 *   degraded — visibly unhealthy, needs attention
 *   broken   — critically unhealthy, immediate attention warranted
 *   unknown  — source is unavailable or not reporting
 *
 * No side effects. No async. No DB. No Discord.
 */

const HEALTH_STATES = Object.freeze(["healthy", "watch", "degraded", "broken", "unknown"]);

const RANK = Object.freeze({ healthy: 0, watch: 1, unknown: 1, degraded: 2, broken: 3 });

function worst(a, b) {
  return RANK[b] > RANK[a] ? b : a;
}

/**
 * Probe all available runtime sources and return a structured health result.
 *
 * @param {object} snapshot
 * @param {object|null} snapshot.selfConsistencyStatus — from selfConsistencyMonitor.getStatus()
 * @param {object|null} snapshot.evidenceIntegrityStatus — from evidenceIntegrityRuntime.getStatus()
 * @param {object|null} snapshot.lifeRuntimeStatus — from lifeRuntime.getStatus()
 * @param {object|null} snapshot.repairStatus — from repairPersistenceEngine.getStatus() or similar
 * @param {object|null} snapshot.affectiveDecisionStatus — from affectiveDecisionRuntime.getStatus()
 * @param {object|null} snapshot.sourceHealthSnapshot — from sourceHealthTracker.snapshot()
 * @param {object|null} snapshot.memoryHealth — { status: "healthy"|"degraded"|"failed", confidence?: number, reason?: string }
 * @param {Date} [snapshot.now=new Date()]
 * @returns {{ overall, sources, degraded_sources, probed_at }}
 */
function probe({
  selfConsistencyStatus = null,
  evidenceIntegrityStatus = null,
  lifeRuntimeStatus = null,
  repairStatus = null,
  affectiveDecisionStatus = null,
  sourceHealthSnapshot = null,
  memoryHealth = null,
  now = new Date(),
} = {}) {
  const ts = now instanceof Date ? now : new Date(now);
  const sources = {};

  // ── Self-consistency ────────────────────────────────────────────────────────
  if (selfConsistencyStatus !== null) {
    const sig = selfConsistencyStatus.lastSignal || selfConsistencyStatus;
    const conf = sig?.self_confidence;
    const recentLow = (selfConsistencyStatus.recentEvents || [])
      .filter(e => e?.eventType === "self_confidence_low" || e?.self_confidence === "low").length;

    if (recentLow >= 3) {
      sources.self_consistency = { state: "broken", reason: `${recentLow} consecutive self-confidence failures` };
    } else if (conf === "low") {
      sources.self_consistency = { state: "degraded", reason: sig?.reason || "self-confidence is low" };
    } else if (conf === "medium") {
      sources.self_consistency = { state: "watch", reason: sig?.reason || "self-confidence is medium" };
    } else {
      sources.self_consistency = { state: "healthy", reason: "self-confidence is high" };
    }
  } else {
    sources.self_consistency = { state: "unknown", reason: "self-consistency monitor not available" };
  }

  // ── Evidence integrity ─────────────────────────────────────────────────────
  if (evidenceIntegrityStatus !== null) {
    const violations = Number(evidenceIntegrityStatus.recentViolationCount || 0);
    const hasHighSeverity = (evidenceIntegrityStatus.recentEvents || [])
      .some(e => e?.severity === "high");

    if (violations >= 3 && hasHighSeverity) {
      sources.evidence_integrity = { state: "broken", reason: `${violations} confabulation events, high-severity detected` };
    } else if (violations >= 2 || hasHighSeverity) {
      sources.evidence_integrity = { state: "degraded", reason: `${violations} evidence integrity violations` };
    } else if (violations === 1) {
      sources.evidence_integrity = { state: "watch", reason: "one evidence integrity violation recently" };
    } else {
      sources.evidence_integrity = { state: "healthy", reason: "no recent violations" };
    }
  } else {
    sources.evidence_integrity = { state: "unknown", reason: "evidence integrity runtime not available" };
  }

  // ── Life runtime tick freshness ────────────────────────────────────────────
  if (lifeRuntimeStatus !== null) {
    const enabled = lifeRuntimeStatus.enabled !== false;
    if (!enabled) {
      sources.life_runtime_tick = { state: "unknown", reason: "life runtime is disabled" };
    } else {
      const lastTickAt = lifeRuntimeStatus.lastTickAt ? new Date(lifeRuntimeStatus.lastTickAt) : null;
      if (!lastTickAt) {
        sources.life_runtime_tick = { state: "watch", reason: "life runtime has not ticked yet" };
      } else {
        const ageMin = (ts.getTime() - lastTickAt.getTime()) / 60000;
        if (ageMin < 15) {
          sources.life_runtime_tick = { state: "healthy", reason: `last tick ${Math.round(ageMin)}m ago` };
        } else if (ageMin < 120) {
          sources.life_runtime_tick = { state: "watch", reason: `last tick ${Math.round(ageMin)}m ago` };
        } else if (ageMin < 360) {
          sources.life_runtime_tick = { state: "degraded", reason: `life runtime has not ticked in ${Math.round(ageMin / 60)}h` };
        } else {
          sources.life_runtime_tick = { state: "broken", reason: `life runtime has not ticked in over ${Math.round(ageMin / 60)}h` };
        }
      }
    }
  } else {
    sources.life_runtime_tick = { state: "unknown", reason: "life runtime status not available" };
  }

  // ── Repair state ───────────────────────────────────────────────────────────
  if (repairStatus !== null) {
    const repairRequired = Boolean(
      repairStatus.repairRequired || repairStatus.repair_followup_pending ||
      repairStatus.pending || repairStatus.active
    );
    const repeatedIgnored = Boolean(
      repairStatus.repeatedIgnoredRepair || repairStatus.repeatedly_ignored
    );
    if (repeatedIgnored) {
      sources.repair = { state: "broken", reason: "repair has been ignored repeatedly" };
    } else if (repairRequired) {
      sources.repair = { state: "watch", reason: "repair or follow-up is pending" };
    } else {
      sources.repair = { state: "healthy", reason: "no unresolved repair" };
    }
  } else {
    sources.repair = { state: "unknown", reason: "repair status not available" };
  }

  // ── Source health tracker ──────────────────────────────────────────────────
  if (sourceHealthSnapshot !== null) {
    const entries = Object.values(sourceHealthSnapshot || {});
    const unavailable = entries.filter(e => e?.status === "unavailable");
    const degradedEntries = entries.filter(e => e?.status === "degraded");

    if (entries.length === 0) {
      sources.source_health = { state: "unknown", reason: "no source health data" };
    } else if (unavailable.length >= 3) {
      sources.source_health = { state: "broken", reason: `${unavailable.length} runtime sources unavailable` };
    } else if (unavailable.length > 0 || degradedEntries.length > 1) {
      const names = [...unavailable, ...degradedEntries].map(e => e.runtime).filter(Boolean).slice(0, 3).join(", ");
      sources.source_health = { state: "degraded", reason: `degraded sources: ${names || "unknown"}` };
    } else if (degradedEntries.length === 1) {
      sources.source_health = { state: "watch", reason: `${degradedEntries[0].runtime} is degraded` };
    } else {
      sources.source_health = { state: "healthy", reason: "all tracked sources healthy" };
    }
  } else {
    sources.source_health = { state: "unknown", reason: "source health not available" };
  }

  // ── Memory health ──────────────────────────────────────────────────────────
  if (memoryHealth !== null) {
    const status = memoryHealth.status || (memoryHealth.failed ? "failed" : null);
    const confidence = Number(memoryHealth.confidence ?? 1);
    if (status === "failed" || status === "broken") {
      sources.memory = { state: "degraded", reason: memoryHealth.reason || "memory retrieval failed" };
    } else if (status === "degraded" || confidence < 0.4) {
      sources.memory = { state: "degraded", reason: memoryHealth.reason || "memory retrieval confidence is low" };
    } else if (status === "watch" || confidence < 0.65) {
      sources.memory = { state: "watch", reason: memoryHealth.reason || "memory confidence below comfortable" };
    } else {
      sources.memory = { state: "healthy", reason: "memory retrieval healthy" };
    }
  } else {
    sources.memory = { state: "unknown", reason: "memory health not available" };
  }

  // ── Affective decision ─────────────────────────────────────────────────────
  if (affectiveDecisionStatus !== null) {
    const recentBlocked = Array.isArray(affectiveDecisionStatus.recent_blocked_decisions)
      ? affectiveDecisionStatus.recent_blocked_decisions.length
      : 0;
    if (recentBlocked >= 5) {
      sources.affective_decision = { state: "watch", reason: `${recentBlocked} recent decisions blocked` };
    } else {
      sources.affective_decision = { state: "healthy", reason: "decision layer operating normally" };
    }
  } else {
    sources.affective_decision = { state: "unknown", reason: "affective decision runtime not available" };
  }

  // ── Overall state ──────────────────────────────────────────────────────────
  const states = Object.values(sources).map(s => s.state);
  const nonUnknown = states.filter(s => s !== "unknown");

  let overall;
  if (nonUnknown.length === 0) {
    overall = "unknown";
  } else {
    overall = nonUnknown.reduce(worst, "healthy");
  }

  const degraded_sources = Object.entries(sources)
    .filter(([, v]) => v.state === "degraded" || v.state === "broken")
    .map(([k]) => k);

  return {
    overall,
    sources,
    degraded_sources,
    probed_at: ts.toISOString(),
  };
}

module.exports = { probe, HEALTH_STATES };
