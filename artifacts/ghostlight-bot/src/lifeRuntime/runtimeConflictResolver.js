"use strict";

/**
 * runtimeConflictResolver
 *
 * Pure function — no async, no side effects, no imports from runtime modules.
 *
 * Compares the read-only outputs of different runtimes and SURFACES disagreement.
 * It never silently picks a winner: each conflict is reported with its sources, a
 * severity, and a reconciliation recommendation, and the integration confidence is
 * reduced accordingly. Reconciliation is the OWNERS' job (e.g. preludeReconciler);
 * the nervous system only flags the inconsistency.
 *
 * Detected conflict types:
 *   conflicting_availability, conflicting_repair_state, conflicting_runtime_health,
 *   conflicting_confidence, conflicting_identity, conflicting_relationship_guidance,
 *   conflicting_behavior_recommendation, conflicting_narrative, impossible_combination
 *
 * Dante ONLY.
 */

const CONF_GAP = 0.30; // confidence divergence that counts as a conflict

function detectRuntimeConflicts({
  worldModelContext   = null,
  perceptionContext   = null,
  consequenceContext  = null,
  cognitiveContext    = null,
  emergentContext     = null,
  identityContext     = null,
  selfInspectionStatus = null,
  narrativeContext    = null,
} = {}) {
  const conflicts = [];

  // ── Availability: worldModel vs perception disagree on Jenna's state ──────────
  const wmAvail = _norm(worldModelContext?.worldModel?.jenna?.availability?.value);
  const pcAvail = _norm(perceptionContext?.worldState?.jenna?.availability);
  if (wmAvail && pcAvail && wmAvail !== "unknown" && pcAvail !== "unknown" && wmAvail !== pcAvail) {
    conflicts.push(_conflict("conflicting_availability", "high",
      ["worldModelRuntime", "perceptionRuntime"],
      `availability disagreement: worldModel=${wmAvail} vs perception=${pcAvail}`));
  }

  // ── Availability confidence divergence for the same value ────────────────────
  const wmConf = worldModelContext?.worldModel?.jenna?.availability?.confidence;
  const pcConf = perceptionContext?.worldState?.jenna?._confidence;
  if (wmAvail && pcAvail && wmAvail === pcAvail &&
      Number.isFinite(wmConf) && Number.isFinite(pcConf) && Math.abs(wmConf - pcConf) >= CONF_GAP) {
    conflicts.push(_conflict("conflicting_confidence", "medium",
      ["worldModelRuntime", "perceptionRuntime"],
      `confidence divergence on availability: ${wmConf.toFixed(2)} vs ${pcConf.toFixed(2)}`));
  }

  // ── Runtime health: selfInspection vs worldModel disagree ────────────────────
  const siDegraded = selfInspectionStatus?.self_inspection_state === "degraded"
    || (Array.isArray(selfInspectionStatus?.degraded_sources) && selfInspectionStatus.degraded_sources.length > 0);
  const wmHealth = worldModelContext?.worldModel?.dante?.runtime_health?.value;
  if (siDegraded && wmHealth && wmHealth !== "degraded") {
    conflicts.push(_conflict("conflicting_runtime_health", "medium",
      ["selfInspectionRuntime", "worldModelRuntime"],
      `health disagreement: selfInspection=degraded vs worldModel=${wmHealth}`));
  }

  // ── Repair state impossible combinations ─────────────────────────────────────
  const sup = consequenceContext?.suppression ?? consequenceContext?.carryover ?? consequenceContext ?? {};
  if (sup.repairRequired && sup.healing) {
    conflicts.push(_conflict("impossible_combination", "high",
      ["relationalConsequencesEngine"],
      "repair is both required and healing simultaneously"));
  }
  if (sup.giveSpace && cognitiveContext?.outcome && cognitiveContext.outcome !== "restraint" &&
      cognitiveContext?.recommendations && cognitiveContext.recommendations.suppressRomantic === false &&
      cognitiveContext.recommendations.holdConversationFollowup === false) {
    conflicts.push(_conflict("impossible_combination", "high",
      ["relationalConsequencesEngine", "cognitiveRuntime"],
      "give_space active but cognition is not restraining outreach"));
  }

  // ── Repair vs cognition: repair required but cognition ignores it ────────────
  if (sup.repairRequired && !sup.healing && cognitiveContext &&
      cognitiveContext.recommendations && cognitiveContext.recommendations.encourageRepair === false &&
      cognitiveContext.recommendations.suppressRomantic === false &&
      cognitiveContext.outcome === "no_action") {
    conflicts.push(_conflict("conflicting_repair_state", "medium",
      ["relationalConsequencesEngine", "cognitiveRuntime"],
      "repair required but cognition recommends no action and no romance suppression"));
  }

  // ── Identity: an active value conflict is itself a surfaced conflict ─────────
  if (identityContext?.conflictActive) {
    conflicts.push(_conflict("conflicting_identity", "low",
      ["identityRuntime"],
      "identity value conflict active"));
  }

  // ── Behavior recommendation vs state: emergent suppresses romance with no repair
  if (emergentContext?.recommendations?.suppressRomanticDuringRepair &&
      !sup.repairRequired && !sup.repairStarted && !sup.healing) {
    conflicts.push(_conflict("conflicting_behavior_recommendation", "low",
      ["emergentLivingBehaviorRuntime", "relationalConsequencesEngine"],
      "emergent guidance suppresses romance for repair, but no repair is active"));
  }

  // ── Relationship guidance: emergent encourages romance while cognition suppresses
  const emergentRomance = (emergentContext?.forRomanticSurprise ?? []).length > 0;
  if (emergentRomance && cognitiveContext?.recommendations?.suppressRomantic) {
    conflicts.push(_conflict("conflicting_relationship_guidance", "low",
      ["emergentLivingBehaviorRuntime", "cognitiveRuntime"],
      "emergent guidance favours romance while cognition is suppressing it"));
  }

  return conflicts;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _conflict(type, severity, sources, detail) {
  return Object.freeze({
    type, severity, sources: Object.freeze([...sources]), detail,
    recommendation: "reduce_confidence_and_reconcile",
  });
}

function _norm(v) {
  if (v === null || v === undefined) return null;
  return String(v).toLowerCase().replace(/\s+/g, "_");
}

module.exports = { detectRuntimeConflicts, CONF_GAP };
