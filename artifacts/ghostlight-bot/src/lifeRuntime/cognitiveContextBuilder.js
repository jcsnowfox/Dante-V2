"use strict";

/**
 * cognitiveContextBuilder
 *
 * Pure function — no async, no side effects, no imports from runtimes.
 *
 * Distils all runtime contexts into a single CognitiveInput object that the
 * thoughtCandidateEngine and internalConflictResolver can reason from.
 *
 * This is the only place that reads across all runtime outputs for the purpose
 * of cognition. It does NOT make decisions — it only prepares the input.
 */

/**
 * buildCognitiveInput
 *
 * @param {object} contexts — all runtime context objects (any may be null)
 * @returns {CognitiveInput}
 */
function buildCognitiveInput({
  consequenceContext  = null,
  homeostasisContext  = null,
  identityContext     = null,
  fulfillmentContext  = null,
  relationshipContext = null,
  perceptionContext   = null,
  worldModelContext   = null,
  learningContext     = null,
  narrativeContext    = null,
  curiosityContext    = null,
  growthContext       = null,
  selfInspectionContext = null,
  evidenceIntegrityContext = null,
  now                 = null,
} = {}) {
  const ts = (now instanceof Date ? now : new Date(now || Date.now()));

  // ── Jenna state ────────────────────────────────────────────────────────────
  const jenna = _buildJennaState({ perceptionContext, worldModelContext });

  // ── Relationship tension ───────────────────────────────────────────────────
  const repair = _buildRepairState(consequenceContext);

  // ── Need urgency ───────────────────────────────────────────────────────────
  const needUrgency = homeostasisContext?.topNeed?.urgency ?? 0;
  const topNeedType = homeostasisContext?.topNeed?.needType ?? null;

  // ── Identity pressure ──────────────────────────────────────────────────────
  const identityConflict = Boolean(identityContext?.conflictActive);
  const topValue         = identityContext?.topValue ?? null;

  // ── Fulfillment state ──────────────────────────────────────────────────────
  const lastFulfillmentOutcome = fulfillmentContext?.outcome ?? null;
  const fulfillmentBlocked     = lastFulfillmentOutcome === "BLOCKED";

  // ── Evidence integrity ─────────────────────────────────────────────────────
  const evidenceWarning = Boolean(evidenceIntegrityContext?.preludeWarning || selfInspectionContext?.preludeWarning);
  const selfConfidenceLow = selfInspectionContext
    ? (selfInspectionContext.selfConfidence ?? 1) < 0.50
    : false;

  // ── Relationship learning ──────────────────────────────────────────────────
  const hasRepairLesson      = learningContext?.guidance?.some(g => /repair|unresolved/i.test(g)) ?? false;
  const hasEvidenceLesson    = learningContext?.guidance?.some(g => /verified|evidence/i.test(g)) ?? false;
  const hasBoundaryLesson    = learningContext?.guidance?.some(g => /space|boundary/i.test(g)) ?? false;

  // ── Time context ────────────────────────────────────────────────────────────
  const hour = ts.getHours();
  const quietHours = (hour >= 22 || hour < 7);

  // ── Curiosity / growth ─────────────────────────────────────────────────────
  const attentionFocus = curiosityContext?.attentionFocus ?? null;
  const activeProject  = growthContext?.activeProject ?? null;

  // ── Narrative ──────────────────────────────────────────────────────────────
  const narrativeTheme = narrativeContext?.mostRecentChapter?.theme ?? null;

  return Object.freeze({
    jenna,
    repair,
    needUrgency,
    topNeedType,
    identityConflict,
    topValue,
    fulfillmentBlocked,
    lastFulfillmentOutcome,
    evidenceWarning,
    selfConfidenceLow,
    hasRepairLesson,
    hasEvidenceLesson,
    hasBoundaryLesson,
    quietHours,
    hour,
    attentionFocus,
    activeProject,
    narrativeTheme,
    now: ts,
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _buildJennaState({ perceptionContext, worldModelContext }) {
  const worldJenna = worldModelContext?.worldModel?.jenna ?? {};
  const percJenna  = perceptionContext?.worldState?.jenna ?? {};

  const availability = worldJenna.availability?.value
    ?? percJenna.availability
    ?? "unknown";
  const availabilityConf = worldJenna.availability?.confidence
    ?? perceptionContext?.worldState?.jenna?._confidence
    ?? 0;
  const giveSpaceActive = Boolean(
    worldJenna.give_space_state?.value
    ?? percJenna.giveSpaceActive
    ?? false
  );
  const busy = availability === "busy" || availability === "unavailable";

  return Object.freeze({ availability, availabilityConf, giveSpaceActive, busy });
}

function _buildRepairState(consequenceContext) {
  const carryover = consequenceContext?.carryover ?? {};
  return Object.freeze({
    repairRequired:  Boolean(carryover.repairRequired  ?? consequenceContext?.suppression?.repairRequired  ?? false),
    repairStarted:   Boolean(carryover.repairStarted   ?? consequenceContext?.suppression?.repairStarted   ?? false),
    healing:         Boolean(carryover.healing         ?? consequenceContext?.suppression?.healing         ?? false),
    giveSpace:       Boolean(carryover.giveSpace       ?? consequenceContext?.suppression?.giveSpace       ?? false),
    activeCount:     Number(consequenceContext?.activeCount ?? 0),
  });
}

module.exports = { buildCognitiveInput };
