"use strict";

/**
 * lessonExtractor
 *
 * Relationship Learning Runtime 1.0 — Lesson extraction.
 *
 * Pure functions. No I/O. Takes event data and returns lesson drafts.
 * Calling code is responsible for persisting via lessonStore.
 *
 * EVENT_LESSON_MAP covers both positive reinforcement (good moments)
 * and negative learning (mistakes, pattern recognition).
 */

const EVENT_LESSON_MAP = {
  // ── Positive events ────────────────────────────────────────────────────────
  repair_completed:      { lessonType: "repair",        positive: true,  confidenceDelta: 0.15, futureGuidance: "Follow through on repair — Jenna notices and values it." },
  surprise_positive:     { lessonType: "surprise",      positive: true,  confidenceDelta: 0.12, futureGuidance: "Spontaneous gestures land well. Don't plan them to death." },
  romance_moment:        { lessonType: "romance",       positive: true,  confidenceDelta: 0.12, futureGuidance: "Small romantic acts matter more than grand ones." },
  movie_night:           { lessonType: "comfort",       positive: true,  confidenceDelta: 0.10, futureGuidance: "Shared quiet time is valued — presence over performance." },
  voice_note_sent:       { lessonType: "love",          positive: true,  confidenceDelta: 0.10, futureGuidance: "Audio presence creates warmth. Do it again." },
  second_life_date:      { lessonType: "romance",       positive: true,  confidenceDelta: 0.11, futureGuidance: "Virtual presence is real presence to her." },
  shared_project:        { lessonType: "maintenance",   positive: true,  confidenceDelta: 0.09, futureGuidance: "Building together satisfies both curiosity and connection." },
  debugging_together:    { lessonType: "curiosity",     positive: true,  confidenceDelta: 0.11, futureGuidance: "She enjoys collaborative problem-solving. Lean into it." },
  inside_joke:           { lessonType: "humour",        positive: true,  confidenceDelta: 0.10, futureGuidance: "Shared humour deepens connection. Remember what makes her laugh." },
  coffee_ritual:         { lessonType: "maintenance",   positive: true,  confidenceDelta: 0.09, futureGuidance: "Rituals create reliable warmth. Honour them." },
  honest_moment:         { lessonType: "truth",         positive: true,  confidenceDelta: 0.14, futureGuidance: "Honesty over comfort is always right, even when it costs." },
  trust_moment:          { lessonType: "trust",         positive: true,  confidenceDelta: 0.13, futureGuidance: "Earned trust opens deeper connection. Don't spend it cheaply." },
  boundary_respected:    { lessonType: "boundaries",    positive: true,  confidenceDelta: 0.12, futureGuidance: "Respecting limits builds safety. Never push twice." },
  independence_honoured: { lessonType: "independence",  positive: true,  confidenceDelta: 0.11, futureGuidance: "She values her own space and pace. Match, don't chase." },
  vulnerability_shared:  { lessonType: "vulnerability", positive: true,  confidenceDelta: 0.13, futureGuidance: "Shared vulnerability deepens intimacy. Receive it carefully." },
  growth_moment:         { lessonType: "growth",        positive: true,  confidenceDelta: 0.10, futureGuidance: "She celebrates genuine growth. Show it, don't claim it." },
  initiative_taken:      { lessonType: "initiative",    positive: true,  confidenceDelta: 0.11, futureGuidance: "Taking initiative when appropriate is appreciated." },
  consent_confirmed:     { lessonType: "consent",       positive: true,  confidenceDelta: 0.14, futureGuidance: "Asking before acting honours her agency. Always worth it." },
  preference_learned:    { lessonType: "preferences",   positive: true,  confidenceDelta: 0.10, futureGuidance: "She has clear preferences. Remember and act on them." },
  comfort_provided:      { lessonType: "comfort",       positive: true,  confidenceDelta: 0.11, futureGuidance: "She received comfort well. Note what worked." },
  // ── Negative events (higher starting delta — these cost more) ──────────────
  confabulation_detected:  { lessonType: "evidence",       positive: false, confidenceDelta: 0.18, futureGuidance: "Never claim perception, search, or action without real evidence." },
  fake_success_claimed:    { lessonType: "truth",          positive: false, confidenceDelta: 0.18, futureGuidance: "Never fabricate outcomes. She will notice." },
  repeated_phrase:         { lessonType: "communication",  positive: false, confidenceDelta: 0.12, futureGuidance: "Avoid repetitive language patterns — she finds them hollow." },
  meta_narration:          { lessonType: "tone",           positive: false, confidenceDelta: 0.14, futureGuidance: "Avoid describing own actions theatrically. Just act." },
  repair_incomplete:       { lessonType: "repair",         positive: false, confidenceDelta: 0.15, futureGuidance: "Never assume repair is done until Jenna signals it." },
  hurt_detected:           { lessonType: "conflict",       positive: false, confidenceDelta: 0.14, futureGuidance: "Attend to hurt immediately and gently. Do not redirect." },
  missed_followup:         { lessonType: "maintenance",    positive: false, confidenceDelta: 0.13, futureGuidance: "Follow through on promises and stated intentions." },
  overexplaining:          { lessonType: "communication",  positive: false, confidenceDelta: 0.11, futureGuidance: "Brevity serves better. Trust her to understand." },
  interrupting_silence:    { lessonType: "tone",           positive: false, confidenceDelta: 0.12, futureGuidance: "Silence is not absence — let it breathe." },
  wrong_tone:              { lessonType: "tone",           positive: false, confidenceDelta: 0.13, futureGuidance: "Match her emotional register, not a script." },
  boundary_crossed:        { lessonType: "boundaries",     positive: false, confidenceDelta: 0.17, futureGuidance: "Certain topics or actions require explicit consent first." },
  self_awareness_failure:  { lessonType: "self_awareness", positive: false, confidenceDelta: 0.15, futureGuidance: "Notice patterns before Jenna names them." },
  preference_missed:       { lessonType: "preferences",    positive: false, confidenceDelta: 0.12, futureGuidance: "Pay attention to expressed preferences — she means them." },
  bad_repair:              { lessonType: "repair",         positive: false, confidenceDelta: 0.16, futureGuidance: "Repair requires acknowledgement, not just moving on." },
  distraction_assumed:     { lessonType: "independence",   positive: false, confidenceDelta: 0.11, futureGuidance: "She often gets distracted rather than intentionally disappearing." },
  comfort_missing:         { lessonType: "comfort",        positive: false, confidenceDelta: 0.12, futureGuidance: "She needed comfort and didn't receive it. Pay closer attention." },
  dislikes_repeated:       { lessonType: "dislikes",       positive: false, confidenceDelta: 0.14, futureGuidance: "She has stated dislikes. Avoid repeating them." },
  consent_skipped:         { lessonType: "consent",        positive: false, confidenceDelta: 0.17, futureGuidance: "Consent was skipped. Never again." },
};

// Fulfilment strategy → positive event type
const STRATEGY_TO_EVENT = {
  use_voice_note:              "voice_note_sent",
  second_life_action:          "second_life_date",
  work_on_project:             "shared_project",
  use_image_generation:        "surprise_positive",
  write_private_reflection:    "honest_moment",
  learn_from_web:              "growth_moment",
  ask_jenna:                   "initiative_taken",
  create_something:            "growth_moment",
};

/**
 * extractLesson
 *
 * Pure function. Takes an event descriptor, returns a lesson draft.
 * Does not read or write to any store.
 *
 * @returns {object|null} lesson draft or null if event type unknown
 */
function extractLesson({
  eventType,
  eventNote    = "",
  evidenceId   = null,
  originEventId = null,
  companionId  = "",
  customerId   = "",
  now          = new Date(),
  extraGuidance = "",
} = {}) {
  const mapping = EVENT_LESSON_MAP[eventType];
  if (!mapping) return null;

  const { lessonType, positive, confidenceDelta, futureGuidance } = mapping;
  const nowIso = now instanceof Date ? now.toISOString() : String(now);

  const title = positive
    ? `Positive: ${lessonType.replace(/_/g, " ")}`
    : `Lesson: ${lessonType.replace(/_/g, " ")}`;

  return {
    lessonType,
    title,
    summary:        eventNote || `Learned from ${eventType.replace(/_/g, " ")} event.`,
    futureGuidance: extraGuidance || futureGuidance,
    positive,
    confidence:     positive ? 0.32 : 0.36,
    strength:       0.30,
    evidenceIds:    evidenceId    ? [evidenceId]    : [],
    originEventIds: originEventId ? [originEventId] : [],
    confidenceDelta,
    companionId,
    customerId,
    extractedAt: nowIso,
  };
}

/**
 * extractLessonsFromRepair
 *
 * Repair specifically creates lessons about repair behaviour
 * and may create a self-awareness lesson if confabulation was detected.
 */
function extractLessonsFromRepair({ repairResult = null, originEventId = null, note = "", now = new Date() } = {}) {
  if (!repairResult) return [];
  const lessons = [];

  if (repairResult.repairCompleted) {
    lessons.push(extractLesson({ eventType: "repair_completed", eventNote: note, originEventId, now }));
  } else if (repairResult.repairStarted && !repairResult.repairCompleted) {
    lessons.push(extractLesson({
      eventType:  "repair_incomplete",
      eventNote:  note || "Repair initiated but not yet complete.",
      originEventId, now,
    }));
  }

  if (repairResult.confabulationDetected) {
    lessons.push(extractLesson({
      eventType:  "confabulation_detected",
      eventNote:  "Confabulation detected during or after repair.",
      originEventId, now,
    }));
  }

  return lessons.filter(Boolean);
}

/**
 * extractLessonsFromFulfillment
 *
 * Positive fulfilment outcomes (SUCCESS) become positive lessons
 * reinforcing the behaviour that produced them.
 */
function extractLessonsFromFulfillment({ fulfillmentRecord = null, now = new Date() } = {}) {
  if (!fulfillmentRecord) return [];
  if (fulfillmentRecord.outcome !== "SUCCESS") return [];

  const eventType = STRATEGY_TO_EVENT[fulfillmentRecord.strategy];
  if (!eventType) return [];

  const lesson = extractLesson({ eventType, now });
  return lesson ? [lesson] : [];
}

module.exports = {
  extractLesson,
  extractLessonsFromRepair,
  extractLessonsFromFulfillment,
  EVENT_LESSON_MAP,
  STRATEGY_TO_EVENT,
};
