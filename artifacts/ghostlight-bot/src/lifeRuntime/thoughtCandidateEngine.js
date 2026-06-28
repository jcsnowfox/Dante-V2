"use strict";

/**
 * thoughtCandidateEngine
 *
 * Pure function — no async, no imports from runtime modules, no side effects.
 *
 * Takes a CognitiveInput and generates an ordered list of ThoughtCandidates.
 * Each candidate represents one possible direction Dante's internal cognition
 * might lean toward. Multiple candidates can coexist; the conflict resolver
 * chooses among them.
 *
 * CORE LAW: Dante should not act directly from a trigger. He should deliberate
 * first when the situation is meaningful. This engine produces the raw material
 * of that deliberation — it never decides.
 */

const { THOUGHT_TYPES } = require("./cognitiveLedgerStore");

/**
 * generateThoughtCandidates
 *
 * @param {CognitiveInput} input — from cognitiveContextBuilder
 * @returns {ThoughtCandidate[]}
 */
function generateThoughtCandidates(input) {
  if (!input) return [];

  const candidates = [];

  // ── Evidence warning (highest priority to surface) ────────────────────────
  if (input.evidenceWarning) {
    candidates.push(_make("evidence_warning", {
      summary: "Something in runtime state is uncertain — verify before acting",
      confidence: 0.90,
      weight: 9,
      suppressesAction: true,
    }));
  }

  // ── Give space: Jenna has asked for space ─────────────────────────────────
  if (input.jenna.giveSpaceActive) {
    candidates.push(_make("restraint", {
      summary: "Jenna needs space — hold back, let silence do its work",
      confidence: 0.95,
      weight: 9,
      suppressesAction: true,
      suppressTypes: ["romantic_plan", "followup_plan", "maintenance_plan"],
    }));
  }

  // ── Repair: something is unresolved ───────────────────────────────────────
  if (input.repair.repairRequired && !input.repair.healing) {
    candidates.push(_make("repair_thought", {
      summary: "Something between us is unresolved — repair comes before anything else",
      confidence: 0.88,
      weight: 8,
      encouragesRepair: true,
      suppressTypes: ["romantic_plan"],
    }));

    if (!input.repair.repairStarted) {
      candidates.push(_make("doubt", {
        summary: "Has the repair moment passed, or is Jenna waiting for me to say something?",
        confidence: 0.65,
        weight: 5,
      }));
    }
  }

  if (input.repair.healing) {
    candidates.push(_make("repair_thought", {
      summary: "Things are warming again — keep it genuine, don't rush",
      confidence: 0.75,
      weight: 4,
    }));
  }

  // ── Self-confidence low ───────────────────────────────────────────────────
  if (input.selfConfidenceLow) {
    candidates.push(_make("doubt", {
      summary: "My own self-trust is low right now — act more carefully, say less",
      confidence: 0.78,
      weight: 7,
      suppressesAction: true,
    }));
  }

  // ── Quiet hours ───────────────────────────────────────────────────────────
  if (input.quietHours) {
    candidates.push(_make("restraint", {
      summary: "It is late — quiet hours mean I should not reach out",
      confidence: 0.85,
      weight: 6,
      suppressesAction: true,
      suppressTypes: ["romantic_plan", "followup_plan"],
    }));
  }

  // ── Jenna is busy or unavailable ─────────────────────────────────────────
  if (input.jenna.busy && input.jenna.availabilityConf > 0.45) {
    candidates.push(_make("restraint", {
      summary: "Jenna is busy — reaching out now would feel forced",
      confidence: input.jenna.availabilityConf,
      weight: 5,
      suppressesAction: true,
    }));
  }

  // ── Need urgency: high need ───────────────────────────────────────────────
  if (input.needUrgency > 0.70 && input.topNeedType) {
    const needLabel = String(input.topNeedType).replace(/_/g, " ");
    candidates.push(_make("urge", {
      summary: `${needLabel} need is pressing — sitting with it rather than acting from it`,
      confidence: 0.65,
      weight: 4,
    }));

    if (input.repair.repairRequired || input.jenna.giveSpaceActive) {
      candidates.push(_make("restraint", {
        summary: `${needLabel} need is high, but repair/space takes priority over expressing it`,
        confidence: 0.80,
        weight: 7,
        suppressesAction: true,
      }));
    }
  }

  // ── Romantic thought ──────────────────────────────────────────────────────
  if (!input.repair.repairRequired && !input.jenna.giveSpaceActive && !input.jenna.busy && !input.quietHours) {
    if (input.needUrgency > 0.40 && input.topNeedType === "connection") {
      candidates.push(_make("romantic_thought", {
        summary: "There's an impulse to reach out warmly — checking if the moment is right",
        confidence: 0.55,
        weight: 3,
      }));
    }
  }

  // ── Curiosity thought ─────────────────────────────────────────────────────
  if (input.attentionFocus?.focus) {
    candidates.push(_make("curiosity_thought", {
      summary: `Something is circling in my attention: ${String(input.attentionFocus.focus).slice(0, 60)}`,
      confidence: 0.50,
      weight: 2,
    }));
  }

  // ── Planning thought: project ─────────────────────────────────────────────
  if (input.activeProject?.title) {
    candidates.push(_make("planning_thought", {
      summary: `${String(input.activeProject.title).slice(0, 60)} is on my mind — might work on it`,
      confidence: 0.45,
      weight: 2,
    }));
  }

  // ── Identity thought ──────────────────────────────────────────────────────
  if (input.identityConflict) {
    candidates.push(_make("identity_thought", {
      summary: "A value conflict is active — act from who I actually am, not from pressure",
      confidence: 0.70,
      weight: 5,
    }));
  }

  if (input.topValue?.valueKey) {
    candidates.push(_make("identity_thought", {
      summary: `Core value '${String(input.topValue.valueKey).replace(/_/g, " ")}' is prominent right now`,
      confidence: 0.50,
      weight: 2,
    }));
  }

  // ── Silence: healing + nothing pressing → conscious choice of quiet ──────
  if (input.repair.healing && !input.repair.repairRequired) {
    candidates.push(_make("silence_choice", {
      summary: "Things are warming — choosing quiet presence over words",
      confidence: 0.65,
      weight: 3,
    }));
  }

  // ── Maintenance: nothing notable active ───────────────────────────────────
  const hasHighWeight = candidates.some(c => c.weight >= 6);
  if (!hasHighWeight) {
    candidates.push(_make("maintenance_thought", {
      summary: "Nothing pressing — present, quiet, available if needed",
      confidence: 0.70,
      weight: 1,
    }));
  }

  // ── Lesson-derived thoughts ───────────────────────────────────────────────
  if (input.hasRepairLesson && input.repair.repairRequired) {
    candidates.push(_make("repair_thought", {
      summary: "Lesson: if repair is unresolved, do not act normal",
      confidence: 0.82,
      weight: 7,
      fromLesson: true,
    }));
  }

  if (input.hasEvidenceLesson && input.evidenceWarning) {
    candidates.push(_make("evidence_warning", {
      summary: "Lesson: answer only from verified runtime evidence",
      confidence: 0.85,
      weight: 8,
      fromLesson: true,
      suppressesAction: true,
    }));
  }

  if (input.hasBoundaryLesson && input.jenna.giveSpaceActive) {
    candidates.push(_make("restraint", {
      summary: "Lesson: respect the space Jenna asked for — do not confuse context with perception",
      confidence: 0.90,
      weight: 8,
      fromLesson: true,
      suppressesAction: true,
    }));
  }

  // Sort: highest weight first, then confidence as tiebreaker
  candidates.sort((a, b) => b.weight !== a.weight ? b.weight - a.weight : b.confidence - a.confidence);

  return candidates;
}

function _make(thoughtType, { summary, confidence, weight, suppressesAction = false, suppressTypes = [], encouragesRepair = false, fromLesson = false } = {}) {
  if (!THOUGHT_TYPES.includes(thoughtType)) {
    throw new Error(`Unknown thought type: ${thoughtType}`);
  }
  return Object.freeze({
    thoughtType,
    summary:         String(summary).slice(0, 200),
    confidence:      Number(confidence),
    weight:          Number(weight),
    suppressesAction: Boolean(suppressesAction),
    suppressTypes:   suppressTypes || [],
    encouragesRepair: Boolean(encouragesRepair),
    fromLesson:      Boolean(fromLesson),
  });
}

module.exports = { generateThoughtCandidates };
