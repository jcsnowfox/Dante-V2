"use strict";

/**
 * integrationHealthMonitor
 *
 * Pure function — no async, no side effects, no imports from runtime modules.
 *
 * Computes overall architectural health from the integration signals: coverage,
 * conflicts, dependency violations, missing/stale runtimes, event-bus health, and
 * a derived integration confidence. It reports a level — healthy / watch /
 * degraded / critical — and the reasons, so the snapshot can carry an honest
 * self-assessment. It owns nothing and changes nothing.
 *
 * Dante ONLY.
 */

const HEALTH = Object.freeze(["healthy", "watch", "degraded", "critical"]);

/**
 * computeIntegrationHealth
 *
 * @param {object} opts
 * @returns {{ health:string, integrationConfidence:number, reasons:string[] }}
 */
function computeIntegrationHealth({
  coverage = { present: 0, total: 1 },
  conflicts = [],
  violations = [],
  ownershipViolationCount = 0,
  missingRuntimeCount = 0,
  staleRuntimeCount = 0,
  eventBusHealthy = true,
} = {}) {
  const reasons = [];

  const total = Math.max(1, coverage.total || 1);
  const coverageRatio = (coverage.present || 0) / total;

  const highConflicts = conflicts.filter(c => c.severity === "high" || c.type === "impossible_combination").length;
  const medConflicts  = conflicts.filter(c => c.severity === "medium").length;
  const lowConflicts  = conflicts.filter(c => c.severity === "low").length;

  // ── Integration confidence: start from coverage, subtract for trouble ────────
  let confidence = 0.4 + 0.6 * coverageRatio;
  confidence -= 0.20 * ownershipViolationCount;
  confidence -= 0.15 * highConflicts;
  confidence -= 0.08 * medConflicts;
  confidence -= 0.03 * lowConflicts;
  confidence -= 0.10 * missingRuntimeCount;
  confidence -= 0.05 * staleRuntimeCount;
  if (!eventBusHealthy) confidence -= 0.10;
  confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(3))));

  // ── Health level: worst applicable wins ──────────────────────────────────────
  let health = "healthy";

  if (ownershipViolationCount > 0) { health = "critical"; reasons.push(`${ownershipViolationCount} ownership violation(s)`); }
  if (violations.some(v => v.type === "cycle" || v.type === "recursive_dependency" || v.type === "duplicate_ownership" || v.type === "duplicate_sender" || v.type === "duplicate_scheduler")) {
    health = "critical"; reasons.push("structural dependency violation");
  }
  if (confidence < 0.30) { health = _worse(health, "critical"); reasons.push("integration confidence critically low"); }

  if (health !== "critical") {
    if (highConflicts > 0)        { health = _worse(health, "degraded"); reasons.push(`${highConflicts} high-severity conflict(s)`); }
    if (missingRuntimeCount > 0)  { health = _worse(health, "degraded"); reasons.push(`${missingRuntimeCount} missing runtime(s)`); }
    if (!eventBusHealthy)         { health = _worse(health, "degraded"); reasons.push("event bus degraded"); }
  }

  if (health === "healthy") {
    if (medConflicts > 0)         { health = "watch"; reasons.push(`${medConflicts} medium conflict(s)`); }
    if (staleRuntimeCount > 0)    { health = "watch"; reasons.push(`${staleRuntimeCount} stale runtime(s)`); }
    if (lowConflicts > 0)         { health = "watch"; reasons.push(`${lowConflicts} minor conflict(s)`); }
    if (coverageRatio < 0.6)      { health = "watch"; reasons.push("low runtime coverage"); }
  }

  if (!reasons.length) reasons.push("all runtime systems coherent");

  return Object.freeze({ health, integrationConfidence: confidence, reasons: Object.freeze(reasons) });
}

function _worse(a, b) {
  return HEALTH.indexOf(b) > HEALTH.indexOf(a) ? b : a;
}

module.exports = { computeIntegrationHealth, HEALTH };
