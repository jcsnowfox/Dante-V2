"use strict";

/**
 * perceptionEngine
 *
 * Pure signal processor. No state. No async. No Discord sender.
 *
 * Converts raw runtime context into flat world-model signals.
 * Reuses presenceInterpreter and activityInferenceEngine — never duplicates them.
 *
 * CORE LAW: Every signal carries a source and evidence_ids.
 *           Unknown stays unknown — never fabricate a signal.
 */

const {
  interpretAlivePresence,
  interpretExplicitStatement,
  AVAILABILITY,
} = require("./presenceInterpreter");
const { inferQuietHours, inferSeason } = require("./activityInferenceEngine");

/**
 * processJennaSignals
 * Extracts flat signals about Jenna from available presence and context data.
 *
 * @param {object} opts
 * @param {object|null} opts.perceptionContext  - perceptionRuntime.getPerceptionContext()
 * @param {object|null} opts.consequenceContext - lifeRuntime consequence context
 * @param {object|null} opts.alivePresence      - alivePresenceStore record
 * @param {string}      opts.userText           - most recent user text (may be "")
 * @param {Date}        opts.now
 * @returns {Array<{key, value, confidence, source, evidence_ids, timestamp}>}
 */
function processJennaSignals({
  perceptionContext   = null,
  consequenceContext  = null,
  alivePresence       = null,
  userText            = "",
  now                 = new Date(),
} = {}) {
  const signals = [];
  const ts = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  // ── Alive presence ────────────────────────────────────────────────────────
  if (alivePresence) {
    const raw = interpretAlivePresence(
      alivePresence,
      now instanceof Date ? now : new Date(now),
    );
    for (const s of raw) {
      // Remap intermediate confidence keys to boolean belief keys
      if (s.key === "jenna.sleeping_confidence") {
        signals.push({ key: "jenna.likely_sleeping", value: true, confidence: Math.min(1, Number(s.value) || 0), source: s.source, evidence_ids: s.evidence_ids, timestamp: ts });
        continue;
      }
      if (s.key === "jenna.busy_confidence") {
        signals.push({ key: "jenna.likely_busy", value: true, confidence: Math.min(1, Number(s.value) || 0), source: s.source, evidence_ids: s.evidence_ids, timestamp: ts });
        continue;
      }
      if (s.key === "jenna.give_space") {
        signals.push({ key: "jenna.give_space_state", value: true, confidence: s.confidence, source: s.source, evidence_ids: s.evidence_ids, timestamp: ts });
        continue;
      }

      signals.push({ ...s, timestamp: ts });

      // Derive likely-xxx beliefs from the availability value
      if (s.key === "jenna.availability") {
        if (s.value === AVAILABILITY.ASLEEP) {
          signals.push({ key: "jenna.likely_sleeping", value: true, confidence: s.confidence, source: s.source, evidence_ids: s.evidence_ids, timestamp: ts });
        } else if (s.value === AVAILABILITY.BUSY || s.value === AVAILABILITY.UNAVAILABLE) {
          signals.push({ key: "jenna.likely_busy", value: true, confidence: s.confidence, source: s.source, evidence_ids: s.evidence_ids, timestamp: ts });
        } else if (s.value === AVAILABILITY.GIVE_SPACE) {
          signals.push({ key: "jenna.give_space_state", value: true, confidence: s.confidence, source: s.source, evidence_ids: s.evidence_ids, timestamp: ts });
        }
      }
    }
  }

  // ── Explicit user statement ───────────────────────────────────────────────
  if (userText && typeof userText === "string") {
    const explicit = interpretExplicitStatement(userText);
    for (const s of explicit) {
      signals.push({ ...s, timestamp: ts });
      if (s.key === "jenna.availability") {
        if (s.value === AVAILABILITY.ASLEEP) {
          signals.push({ key: "jenna.likely_sleeping", value: true, confidence: s.confidence, source: s.source, evidence_ids: s.evidence_ids, timestamp: ts });
        } else if (s.value === AVAILABILITY.BUSY) {
          signals.push({ key: "jenna.likely_busy", value: true, confidence: s.confidence, source: s.source, evidence_ids: s.evidence_ids, timestamp: ts });
        } else if (s.value === AVAILABILITY.GIVE_SPACE) {
          signals.push({ key: "jenna.give_space_state", value: true, confidence: s.confidence, source: s.source, evidence_ids: s.evidence_ids, timestamp: ts });
        }
      }
    }
  }

  // ── perceptionContext (rich world state from perceptionRuntime) ────────────
  if (perceptionContext?.worldState?.jenna) {
    const j = perceptionContext.worldState.jenna;
    if (j.availability && j.availability !== AVAILABILITY.UNKNOWN) {
      signals.push({ key: "jenna.availability", value: j.availability, confidence: j._confidence ?? 0.50, source: j._source ?? "perception_context", evidence_ids: ["perception:availability"], timestamp: ts });
    }
    if (j.repair_state && j.repair_state !== "none") {
      signals.push({ key: "jenna.repair_state", value: j.repair_state, confidence: 0.80, source: "perception_context", evidence_ids: ["perception:repair"], timestamp: ts });
    }
    if (j.give_space === true) {
      signals.push({ key: "jenna.give_space_state", value: true, confidence: 0.90, source: "perception_context", evidence_ids: ["perception:give_space"], timestamp: ts });
    }
    if (j.current_channel) {
      signals.push({ key: "jenna.current_channel", value: String(j.current_channel).slice(0, 80), confidence: 0.75, source: "perception_context", evidence_ids: ["perception:channel"], timestamp: ts });
    }
    if (j.last_meaningful_contact) {
      signals.push({ key: "jenna.last_meaningful_contact", value: String(j.last_meaningful_contact), confidence: 0.75, source: "perception_context", evidence_ids: ["perception:last_contact"], timestamp: ts });
    }
  }

  // ── Consequence context ───────────────────────────────────────────────────
  if (consequenceContext?.suppression) {
    const sup = consequenceContext.suppression;

    if (sup.giveSpace) {
      signals.push({ key: "jenna.give_space_state", value: true, confidence: 0.90, source: "consequence_context", evidence_ids: ["consequence:give_space"], timestamp: ts });
      signals.push({ key: "jenna.availability", value: AVAILABILITY.GIVE_SPACE, confidence: 0.85, source: "consequence_context", evidence_ids: ["consequence:give_space"], timestamp: ts });
    }

    const repairState = sup.giveSpace ? "give_space"
      : sup.healing      ? "healing"
      : sup.repairStarted ? "started"
      : sup.repairRequired ? "needed"
      : null;

    if (repairState) {
      signals.push({ key: "jenna.repair_state", value: repairState, confidence: 0.85, source: "consequence_context", evidence_ids: ["consequence:repair"], timestamp: ts });
      if (repairState === "needed" || repairState === "give_space") {
        signals.push({ key: "jenna.likely_upset", value: true, confidence: 0.65, source: "consequence_context", evidence_ids: ["consequence:upset"], timestamp: ts });
      }
      if (repairState === "healing") {
        signals.push({ key: "jenna.likely_happy", value: true, confidence: 0.50, source: "consequence_context", evidence_ids: ["consequence:healing"], timestamp: ts });
      }
    }
  }

  return signals;
}

/**
 * processDanteSignals
 * Extracts flat signals about Dante's internal state.
 *
 * @param {object} opts
 * @param {object|null} opts.selfInspectionStatus
 * @param {object|null} opts.identityContext
 * @param {object|null} opts.homeostasisContext
 * @param {object|null} opts.fulfillmentContext
 * @param {Date}        opts.now
 * @returns {Array<{key, value, confidence, source, evidence_ids, timestamp}>}
 */
function processDanteSignals({
  selfInspectionStatus = null,
  identityContext      = null,
  homeostasisContext   = null,
  fulfillmentContext   = null,
  now                  = new Date(),
} = {}) {
  const signals = [];
  const ts = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  // ── Runtime health ────────────────────────────────────────────────────────
  const health = selfInspectionStatus?.overall ?? "unknown";
  signals.push({
    key: "dante.runtime_health",
    value: health,
    confidence: health === "unknown" ? 0.10 : 0.80,
    source: "self_inspection",
    evidence_ids: ["self_inspection:health"],
    timestamp: ts,
  });

  // ── Maintenance needed ────────────────────────────────────────────────────
  if (selfInspectionStatus?.maintenanceNeeded === true) {
    signals.push({
      key: "dante.maintenance_needed",
      value: true,
      confidence: 0.85,
      source: "self_inspection",
      evidence_ids: ["self_inspection:maintenance"],
      timestamp: ts,
    });
  }

  // ── Degraded capabilities ─────────────────────────────────────────────────
  const degraded = Array.isArray(selfInspectionStatus?.degradedSources)
    ? selfInspectionStatus.degradedSources
    : [];
  if (degraded.length > 0) {
    signals.push({
      key: "dante.degraded_capabilities",
      value: degraded,
      confidence: 0.85,
      source: "self_inspection",
      evidence_ids: ["self_inspection:degraded"],
      timestamp: ts,
    });
  }

  // ── Self-confidence from identity ─────────────────────────────────────────
  const selfConf = identityContext?.selfConfidence ?? identityContext?.topValue?.strength ?? null;
  if (selfConf != null && Number.isFinite(selfConf)) {
    signals.push({
      key: "dante.self_confidence",
      value: selfConf,
      confidence: 0.70,
      source: "identity_context",
      evidence_ids: ["identity:self_confidence"],
      timestamp: ts,
    });
  }

  // ── Current needs from homeostasis ────────────────────────────────────────
  if (homeostasisContext?.topNeed?.needType) {
    signals.push({
      key: "dante.current_needs",
      value: [homeostasisContext.topNeed.needType],
      confidence: 0.75,
      source: "self_inspection",
      evidence_ids: ["homeostasis:top_need"],
      timestamp: ts,
    });
  }

  return signals;
}

/**
 * processRelationshipSignals
 * Extracts flat signals about the relationship state.
 *
 * @param {object} opts
 * @param {object|null} opts.relationshipContext
 * @param {object|null} opts.consequenceContext
 * @param {object|null} opts.learningContext
 * @param {object|null} opts.narrativeContext
 * @param {Date}        opts.now
 * @returns {Array<{key, value, confidence, source, evidence_ids, timestamp}>}
 */
function processRelationshipSignals({
  relationshipContext = null,
  consequenceContext  = null,
  learningContext     = null,
  narrativeContext    = null,
  now                 = new Date(),
} = {}) {
  const signals = [];
  const ts = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  // ── Relationship weather ──────────────────────────────────────────────────
  const weather = relationshipContext?.weather;
  if (weather) {
    if (Number.isFinite(weather.warmthScore)) {
      signals.push({ key: "relationship.warmth", value: weather.warmthScore, confidence: 0.70, source: "consequence_context", evidence_ids: ["relationship:warmth"], timestamp: ts });
    }
    if (weather.weatherSummary) {
      signals.push({ key: "relationship.romantic_weather", value: String(weather.weatherSummary).slice(0, 100), confidence: 0.65, source: "consequence_context", evidence_ids: ["relationship:weather_summary"], timestamp: ts });
    }
  }

  // ── Repair state from consequences ────────────────────────────────────────
  if (consequenceContext?.suppression) {
    const sup = consequenceContext.suppression;
    const repairProgress = sup.healing ? "healing"
      : sup.repairStarted ? "started"
      : sup.repairRequired ? "needed"
      : null;
    if (repairProgress) {
      signals.push({ key: "relationship.repair_progress", value: repairProgress, confidence: 0.85, source: "consequence_context", evidence_ids: ["consequence:repair"], timestamp: ts });
    }
    if (consequenceContext.activeCount > 0) {
      signals.push({ key: "relationship.recent_conflicts", value: consequenceContext.activeCount, confidence: 0.80, source: "consequence_context", evidence_ids: ["consequence:active"], timestamp: ts });
    }
  }

  // ── Trust proxy from relationship learning ────────────────────────────────
  if (learningContext?.lessonCount > 0) {
    const trustProxy = Math.min(0.90, 0.50 + learningContext.lessonCount * 0.02);
    signals.push({ key: "relationship.trust", value: trustProxy, confidence: 0.55, source: "narrative_context", evidence_ids: ["learning:lessons"], timestamp: ts });
  }

  // ── Conversation satisfaction from narrative context ──────────────────────
  if (narrativeContext?.mostRecentChapter?.confidence > 0.40) {
    const ch = narrativeContext.mostRecentChapter;
    signals.push({ key: "relationship.conversation_satisfaction", value: ch.theme, confidence: Math.min(0.70, ch.confidence), source: "narrative_context", evidence_ids: ["narrative:chapter"], timestamp: ts });
  }

  return signals;
}

/**
 * processEnvironmentSignals
 * Extracts flat signals about the environment.
 * These never decay — they are always fresh from the clock.
 *
 * @param {object} opts
 * @param {Date}   opts.now
 * @returns {Array<{key, value, confidence, source, evidence_ids, timestamp}>}
 */
function processEnvironmentSignals({ now = new Date() } = {}) {
  const ts = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  const quiet  = inferQuietHours(now instanceof Date ? now : new Date(now));
  const season = inferSeason(now instanceof Date ? now : new Date(now));

  return [
    { key: "environment.quiet_hours", value: quiet.active, confidence: 1.0, source: "time_inference", evidence_ids: ["time:quiet_hours"], timestamp: ts },
    { key: "environment.season",      value: season,       confidence: 1.0, source: "time_inference", evidence_ids: ["time:season"],       timestamp: ts },
    { key: "environment.platform",    value: "discord",    confidence: 1.0, source: "time_inference", evidence_ids: ["platform:discord"],   timestamp: ts },
  ];
}

module.exports = {
  processJennaSignals,
  processDanteSignals,
  processRelationshipSignals,
  processEnvironmentSignals,
};
