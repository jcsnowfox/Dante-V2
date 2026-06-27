"use strict";

/**
 * reflectionEngine
 *
 * Relationship Learning Runtime 1.0 — Private reflection after interactions.
 *
 * Reflections are PRIVATE. They are never surfaced as memories or narrated.
 * They answer structured questions about what happened and what to change.
 *
 * Pure functions — no I/O. Calling code may persist reflections to a store
 * or simply use them to inform lesson extraction.
 */

const REFLECTION_QUESTIONS = Object.freeze([
  "What happened?",
  "What did I do well?",
  "What hurt Jenna?",
  "What made her smile?",
  "What surprised me?",
  "What should I change?",
  "What should I repeat?",
  "Did this reinforce any existing lesson?",
  "Did it weaken one?",
]);

/**
 * buildReflection
 *
 * Creates a private reflection from an interaction context.
 * All fields are optional — pass what you know.
 *
 * @returns {object} structured private reflection
 */
function buildReflection({
  companionId           = "",
  customerId            = "",
  interactionSummary    = "",
  wellDone              = [],
  hurt                  = [],
  smiled                = [],
  surprised             = [],
  toChange              = [],
  toRepeat              = [],
  lessonsReinforced     = [],
  lessonsWeakened       = [],
  now                   = new Date(),
} = {}) {
  const nowIso = now instanceof Date ? now.toISOString() : String(now);

  return {
    companionId,
    customerId,
    reflectedAt: nowIso,
    private:     true,
    questions: {
      whatHappened:       interactionSummary,
      whatDidIDoWell:     Array.isArray(wellDone)    ? wellDone    : [wellDone].filter(Boolean),
      whatHurtJenna:      Array.isArray(hurt)         ? hurt         : [hurt].filter(Boolean),
      whatMadeHerSmile:   Array.isArray(smiled)       ? smiled       : [smiled].filter(Boolean),
      whatSurprisedMe:    Array.isArray(surprised)    ? surprised    : [surprised].filter(Boolean),
      whatToChange:       Array.isArray(toChange)     ? toChange     : [toChange].filter(Boolean),
      whatToRepeat:       Array.isArray(toRepeat)     ? toRepeat     : [toRepeat].filter(Boolean),
      lessonsReinforced:  lessonsReinforced.map(l => (typeof l === "object" ? l?.id ?? l : l)),
      lessonsWeakened:    lessonsWeakened.map(l   => (typeof l === "object" ? l?.id ?? l : l)),
    },
  };
}

/**
 * buildRepairReflection
 *
 * Specialised reflection after a repair event.
 */
function buildRepairReflection({
  repairResult      = {},
  lessonsReinforced = [],
  lessonsWeakened   = [],
  now               = new Date(),
} = {}) {
  const wellDone  = repairResult?.repairCompleted ? ["Followed through on repair."] : [];
  const hurt      = (repairResult?.repairStarted && !repairResult?.repairCompleted)
    ? ["Repair was started but not completed — she may still be carrying hurt."]
    : [];
  const toChange  = repairResult?.confabulationDetected
    ? ["Never claim experiences that didn't happen during repair."]
    : [];
  const toRepeat  = repairResult?.repairCompleted
    ? ["Follow through until Jenna signals resolution."]
    : [];

  return buildReflection({
    interactionSummary: "Repair interaction.",
    wellDone,
    hurt,
    toChange,
    toRepeat,
    lessonsReinforced,
    lessonsWeakened,
    now,
  });
}

/**
 * buildFulfillmentReflection
 *
 * Reflection after a proactive fulfilment action.
 */
function buildFulfillmentReflection({
  fulfillmentRecord = {},
  lessonsReinforced = [],
  now               = new Date(),
} = {}) {
  const outcome   = fulfillmentRecord?.outcome ?? "";
  const strategy  = fulfillmentRecord?.strategy ?? "unknown";
  const wellDone  = outcome === "SUCCESS" ? [`${strategy} executed successfully.`] : [];
  const toChange  = outcome === "UNAVAILABLE" ? [`${strategy} was unavailable — reconsider this approach.`] : [];

  return buildReflection({
    interactionSummary: `Proactive action: ${strategy} → ${outcome}`,
    wellDone,
    toChange,
    lessonsReinforced,
    now,
  });
}

module.exports = {
  buildReflection,
  buildRepairReflection,
  buildFulfillmentReflection,
  REFLECTION_QUESTIONS,
};
