"use strict";

/**
 * internalConflictResolver
 *
 * Pure function — no async, no imports from runtime modules, no side effects.
 *
 * Takes a list of ThoughtCandidates from thoughtCandidateEngine and resolves
 * competing signals into a single CognitiveOutput. Documents all conflicts
 * detected so the ledger can record Dante's deliberation honestly.
 *
 * Conflict resolution priority (applied in order, first match wins):
 *   1. evidence integrity warning  → restraint
 *   2. give space active           → restraint
 *   3. repair required + romantic  → suppress romantic, surface repair
 *   4. evidence warning + answer   → suppress answer, surface evidence caution
 *   5. quiet hours + outreach      → restraint
 *   6. self-confidence low         → restraint
 *   7. dominant candidate          → use highest-weight candidate
 */

const { COGNITIVE_OUTCOMES } = require("./cognitiveLedgerStore");

/**
 * resolveConflicts
 *
 * @param {ThoughtCandidate[]} candidates
 * @param {CognitiveInput}     input
 * @returns {ConflictResolution}
 */
function resolveConflicts(candidates, input) {
  if (!candidates || candidates.length === 0) {
    return _resolution("no_action", [], null, 0, []);
  }

  const conflicts  = _detectConflicts(candidates);
  const resolution = _resolve(candidates, conflicts, input);

  return resolution;
}

// ── Internal: detect conflicts ────────────────────────────────────────────────

function _detectConflicts(candidates) {
  const detected = [];

  const hasRestraint  = candidates.some(c => c.thoughtType === "restraint"        && c.weight >= 5);
  const hasRomantic   = candidates.some(c => c.thoughtType === "romantic_thought"  && c.weight >= 3);
  const hasRepair     = candidates.some(c => c.thoughtType === "repair_thought"    && c.weight >= 5);
  const hasEvidence   = candidates.some(c => c.thoughtType === "evidence_warning"  && c.weight >= 7);
  const hasUrge       = candidates.some(c => c.thoughtType === "urge"              && c.weight >= 4);
  const hasPlanning   = candidates.some(c => c.thoughtType === "planning_thought"  && c.weight >= 2);
  const hasMaintenance = candidates.some(c => c.thoughtType === "maintenance_thought");
  const hasDoubt      = candidates.some(c => c.thoughtType === "doubt");

  if (hasRestraint && hasRomantic) {
    detected.push({ type: "restraint_vs_romantic", severity: "high" });
  }

  if (hasRepair && hasRomantic) {
    detected.push({ type: "repair_vs_romantic", severity: "high" });
  }

  if (hasEvidence && hasPlanning) {
    detected.push({ type: "evidence_warning_vs_action", severity: "high" });
  }

  if (hasUrge && hasRestraint) {
    detected.push({ type: "urge_vs_restraint", severity: "medium" });
  }

  if (hasDoubt && hasRepair) {
    detected.push({ type: "doubt_vs_repair", severity: "medium" });
  }

  if (hasRestraint && (hasUrge || hasRomantic) && hasMaintenance) {
    detected.push({ type: "three_way_tension", severity: "low" });
  }

  return detected;
}

// ── Internal: resolve ─────────────────────────────────────────────────────────

function _resolve(candidates, conflicts, input) {
  const dominant = candidates[0]; // highest weight after sort

  // Priority 1: evidence integrity warning
  const evidenceWarning = candidates.find(c => c.thoughtType === "evidence_warning" && c.weight >= 7);
  if (evidenceWarning) {
    return _resolution(
      "restraint",
      conflicts,
      evidenceWarning.summary,
      evidenceWarning.confidence,
      _buildRecommendations({ suppressRomantic: true, suppressFulfillmentOutreach: true, holdConversationFollowup: true, forAffectiveDecision: "blocked" }),
    );
  }

  // Priority 2: give space active
  if (input?.jenna?.giveSpaceActive) {
    const restraintCandidate = candidates.find(c => c.thoughtType === "restraint" && c.suppressesAction);
    return _resolution(
      "restraint",
      conflicts,
      restraintCandidate?.summary ?? "Jenna needs space — staying quiet",
      restraintCandidate?.confidence ?? 0.90,
      _buildRecommendations({ suppressRomantic: true, suppressFulfillmentOutreach: true, holdConversationFollowup: true, forAffectiveDecision: "delay" }),
    );
  }

  // Priority 3: repair required → suppress romantic
  const repairThought = candidates.find(c => c.thoughtType === "repair_thought" && c.weight >= 7);
  const romanticThought = candidates.find(c => c.thoughtType === "romantic_thought");
  if (repairThought && romanticThought) {
    return _resolution(
      "conflict",
      conflicts,
      repairThought.summary,
      repairThought.confidence,
      _buildRecommendations({ suppressRomantic: true, encourageRepair: true, forAffectiveDecision: "act_now" }),
    );
  }

  // Priority 4: evidence warning + any planning
  const evidenceWeak = candidates.find(c => c.thoughtType === "evidence_warning");
  const planningThought = candidates.find(c => c.thoughtType === "planning_thought" || c.thoughtType === "maintenance_thought");
  if (evidenceWeak && planningThought) {
    return _resolution(
      "uncertainty",
      conflicts,
      evidenceWeak.summary,
      evidenceWeak.confidence,
      _buildRecommendations({ holdConversationFollowup: true, forAffectiveDecision: "wait_for_context" }),
    );
  }

  // Priority 5: quiet hours + any outreach urge
  if (input?.quietHours) {
    const restraintCandidate = candidates.find(c => c.thoughtType === "restraint" && c.suppressesAction);
    if (restraintCandidate) {
      return _resolution(
        "restraint",
        conflicts,
        restraintCandidate.summary,
        restraintCandidate.confidence,
        _buildRecommendations({ suppressRomantic: true, suppressFulfillmentOutreach: true, forAffectiveDecision: "delay" }),
      );
    }
  }

  // Priority 6: self-confidence low
  if (input?.selfConfidenceLow) {
    const doubtCandidate = candidates.find(c => c.thoughtType === "doubt" && c.suppressesAction);
    if (doubtCandidate) {
      return _resolution(
        "uncertainty",
        conflicts,
        doubtCandidate.summary,
        doubtCandidate.confidence,
        _buildRecommendations({ holdConversationFollowup: true, forAffectiveDecision: "wait_for_context" }),
      );
    }
  }

  // Priority 7: dominant candidate
  const outcome = _candidateToOutcome(dominant);
  const recommendations = _buildRecommendationsFromDominant(dominant);

  return _resolution(outcome, conflicts, dominant.summary, dominant.confidence, recommendations);
}

function _candidateToOutcome(candidate) {
  if (!candidate) return "no_action";
  switch (candidate.thoughtType) {
    case "restraint":       return "restraint";
    case "evidence_warning": return "restraint";
    case "repair_thought":  return candidate.encouragesRepair ? "recommendation" : "private_thought";
    case "doubt":           return "uncertainty";
    case "planning_thought": return "plan";
    case "silence_choice":  return "no_action";
    default:                return "private_thought";
  }
}

function _buildRecommendationsFromDominant(candidate) {
  if (!candidate) return _buildRecommendations({});
  return _buildRecommendations({
    suppressRomantic:         candidate.suppressTypes?.includes("romantic_plan") || false,
    suppressFulfillmentOutreach: candidate.suppressesAction || false,
    holdConversationFollowup: candidate.suppressesAction || false,
    encourageRepair:          candidate.encouragesRepair  || false,
    forAffectiveDecision:     candidate.suppressesAction ? "delay" : null,
  });
}

function _buildRecommendations({
  suppressRomantic         = false,
  suppressFulfillmentOutreach = false,
  holdConversationFollowup = false,
  encourageRepair          = false,
  forAffectiveDecision     = null,
} = {}) {
  return Object.freeze({
    suppressRomantic:            Boolean(suppressRomantic),
    suppressFulfillmentOutreach: Boolean(suppressFulfillmentOutreach),
    holdConversationFollowup:    Boolean(holdConversationFollowup),
    encourageRepair:             Boolean(encourageRepair),
    forAffectiveDecision:        forAffectiveDecision,
  });
}

function _resolution(outcome, conflicts, primaryThought, confidence, recommendations) {
  if (!COGNITIVE_OUTCOMES.includes(outcome)) outcome = "no_action";
  return Object.freeze({
    outcome:          outcome,
    conflictsDetected: Array.isArray(conflicts) ? conflicts : [],
    primaryThought:   primaryThought ?? null,
    confidence:       Number(confidence ?? 0),
    recommendations:  recommendations || _buildRecommendations({}),
    restraintActive:  outcome === "restraint",
    uncertaintyActive: outcome === "uncertainty",
  });
}

module.exports = { resolveConflicts };
