"use strict";

/**
 * integrationContextBuilder
 *
 * Pure function — no async, no side effects, no imports from runtime modules.
 *
 * Builds ONE compact Integration Snapshot from the read-only outputs every other
 * runtime already produced this Life Runtime tick. It reads; it never decides,
 * never mutates, never owns. Each concept cell records WHERE the value came from
 * and HOW FRESH it is, so the nervous system can reason about coherence without
 * ever becoming a second source of truth.
 *
 * CORE LAW: Neural Integration owns nothing important. This builder copies safe,
 * compact projections of other runtimes' state — never the authoritative state
 * itself, never raw private text.
 *
 * Each cell: { value, confidence, source_runtime, timestamp, staleness }.
 *   staleness ∈ "fresh" | "stale" | "missing"  (+ ageMs when a timestamp exists)
 *
 * Dante ONLY.
 */

const STALE_MS = 10 * 60 * 1000; // a source older than 10m is "stale"

/**
 * buildIntegrationSnapshot
 *
 * @param {object} ctx — all cached runtime contexts/statuses (any may be null)
 * @returns {{ concepts: object, coverage: {present:number,total:number}, generatedAt: string }}
 */
function buildIntegrationSnapshot({
  identityContext     = null,
  homeostasisContext  = null,
  beliefsContext      = null,
  learningContext     = null,
  narrativeContext    = null,
  emergentContext     = null,
  cognitiveContext    = null,
  relationshipContext = null,
  consequenceContext  = null,
  worldModelContext   = null,
  perceptionContext   = null,
  selfInspectionStatus = null,
  fulfillmentContext  = null,
  evidenceIntegrityStatus = null,
  affectiveDecisionStatus = null,
  outputIntegrityStatus   = null,
  now = new Date(),
} = {}) {
  const ts = (now instanceof Date ? now : new Date(now || Date.now()));
  const nowIso = ts.toISOString();

  const concepts = {
    // ── Identity / self ───────────────────────────────────────────────────────
    identity: _cell(
      identityContext?.topValue?.valueKey ?? null,
      identityContext?.topValue?.strength ?? null,
      "identityRuntime", nowIso, ts, Boolean(identityContext)),

    needs: _cell(
      homeostasisContext?.topNeed?.needType ?? null,
      homeostasisContext?.highestUrgency ?? homeostasisContext?.topNeed?.urgency ?? null,
      "homeostasisRuntime", nowIso, ts, Boolean(homeostasisContext)),

    beliefs: _cell(
      beliefsContext?.count ?? identityContext?.beliefCount ?? null,
      null, "identityRuntime", nowIso, ts, Boolean(beliefsContext || identityContext)),

    lessons: _cell(
      learningContext?.lessonCount ?? null,
      null, "relationshipLearningRuntime", nowIso, ts, Boolean(learningContext)),

    narrative: _cell(
      narrativeContext?.mostRecentChapter?.theme ?? null,
      narrativeContext?.mostRecentChapter?.confidence ?? null,
      "narrativeIdentityRuntime", nowIso, ts, Boolean(narrativeContext)),

    // ── Emergent / relationship culture ───────────────────────────────────────
    emergentTraits: _cell(
      (emergentContext?.livingBehaviors ?? []).length || null,
      null, "emergentLivingBehaviorRuntime", nowIso, ts, Boolean(emergentContext)),

    livingBehaviors: _cell(
      (emergentContext?.livingBehaviors ?? []).map(b => b.behavior_type),
      null, "emergentLivingBehaviorRuntime", nowIso, ts, Boolean(emergentContext)),

    relationshipDna: _cell(
      [...new Set((emergentContext?.relationshipDna ?? []).map(d => d.dna_type))],
      null, "emergentLivingBehaviorRuntime", nowIso, ts, Boolean(emergentContext)),

    relationshipCulture: _cell(
      Boolean(emergentContext?.culture?.available),
      null, "emergentLivingBehaviorRuntime", nowIso, ts, Boolean(emergentContext)),

    // ── Cognition ─────────────────────────────────────────────────────────────
    currentThoughts: _cell(
      cognitiveContext?.thoughtCount ?? null,
      cognitiveContext?.confidence ?? null,
      "cognitiveRuntime", nowIso, ts, Boolean(cognitiveContext)),

    cognitiveState: _cell(
      cognitiveContext?.outcome ?? null,
      cognitiveContext?.confidence ?? null,
      "cognitiveRuntime", nowIso, ts, Boolean(cognitiveContext)),

    // ── Relationship state ────────────────────────────────────────────────────
    relationshipWeather: _cell(
      relationshipContext?.weatherSummary ?? null,
      null, "relationshipWeatherEngine", nowIso, ts, Boolean(relationshipContext)),

    repairState: _cell(
      _repairLabel(consequenceContext),
      null, "relationalConsequencesEngine", nowIso, ts, Boolean(consequenceContext)),

    // ── World / perception ────────────────────────────────────────────────────
    worldModel: _cell(
      worldModelContext?.worldModel?.jenna?.availability?.value ?? null,
      worldModelContext?.worldModel?.jenna?.availability?.confidence ?? null,
      "worldModelRuntime", nowIso, ts,
      Boolean(worldModelContext),
      worldModelContext?.worldModel?.jenna?.availability?.stale),

    availability: _cell(
      worldModelContext?.worldModel?.jenna?.availability?.value
        ?? perceptionContext?.worldState?.jenna?.availability ?? null,
      worldModelContext?.worldModel?.jenna?.availability?.confidence
        ?? perceptionContext?.worldState?.jenna?._confidence ?? null,
      "worldModelRuntime", nowIso, ts,
      Boolean(worldModelContext || perceptionContext)),

    // ── Health / maintenance / integrity ──────────────────────────────────────
    runtimeHealth: _cell(
      selfInspectionStatus?.self_inspection_state
        ?? worldModelContext?.worldModel?.dante?.runtime_health?.value ?? null,
      null, "selfInspectionRuntime", nowIso, ts, Boolean(selfInspectionStatus)),

    capabilities: _cell(
      fulfillmentContext?.outcome ?? null,
      null, "fulfillmentRuntime", nowIso, ts, Boolean(fulfillmentContext)),

    outstandingMaintenance: _cell(
      Boolean(selfInspectionStatus?.active_maintenance_request),
      null, "selfInspectionRuntime", nowIso, ts, Boolean(selfInspectionStatus)),

    outputIntegrity: _cell(
      outputIntegrityStatus?.lastSeverity ?? "none",
      null, "outputCorruptionDetector", nowIso, ts, true),

    evidenceIntegrity: _cell(
      evidenceIntegrityStatus?.state ?? evidenceIntegrityStatus?.last_state ?? null,
      null, "evidenceIntegrityRuntime", nowIso, ts, Boolean(evidenceIntegrityStatus)),

    affectiveDecision: _cell(
      affectiveDecisionStatus?.last_decision_outcome ?? null,
      affectiveDecisionStatus?.last_decision_confidence ?? null,
      "affectiveDecisionRuntime", nowIso, ts, Boolean(affectiveDecisionStatus)),
  };

  // Coverage = how many concept sources are actually present (not "missing").
  const total = Object.keys(concepts).length;
  const present = Object.values(concepts).filter(c => c.staleness !== "missing").length;

  return Object.freeze({
    concepts: Object.freeze(concepts),
    coverage: Object.freeze({ present, total }),
    generatedAt: nowIso,
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _cell(value, confidence, source_runtime, timestamp, ts, present, staleFlag) {
  let staleness;
  if (!present) staleness = "missing";
  else if (staleFlag === true) staleness = "stale";
  else staleness = "fresh";
  return Object.freeze({
    value: value ?? null,
    confidence: (typeof confidence === "number") ? confidence : null,
    source_runtime,
    timestamp: present ? timestamp : null,
    staleness,
  });
}

function _repairLabel(consequenceContext) {
  const s = consequenceContext?.suppression ?? consequenceContext?.carryover ?? consequenceContext ?? {};
  if (s.giveSpace) return "give_space";
  if (s.repairRequired && !s.healing) return "repair_required";
  if (s.repairStarted && !s.healing) return "repair_started";
  if (s.healing) return "healing";
  return "stable";
}

module.exports = { buildIntegrationSnapshot, STALE_MS };
