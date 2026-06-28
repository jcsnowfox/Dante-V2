"use strict";

/**
 * emergencePatternDetector
 *
 * Pure module — no async, no side effects, no imports from runtime modules.
 *
 * This is the engine that decides WHAT keeps repeating and HOW MATURE a
 * repeated pattern is. It is the structural home of the CORE LAW:
 *
 *   CORE LAW: Nothing becomes "ours" from one moment. Repeated evidence only.
 *
 * The law is enforced in computeStage(): a single evidence event can only ever
 * reach the "observed" stage, no matter how strong it is. Promotion past
 * "observed" requires multiple, distinct evidence events; promotion past
 * "forming" requires those events to be spread across time (distinct day
 * buckets). This module never decides on its own — it is given metrics and
 * returns a stage. The stores own the metrics; this owns the rule.
 *
 * It also maps the live runtime contexts produced earlier in a Life Runtime
 * tick into a list of evidence "observations" — the raw material the stores
 * accumulate. deriveObservations() reads contexts only; it never mutates them.
 *
 * Dante ONLY — not a general companion emergence engine.
 */

// ── Pattern categories (what kind of thing is repeating) ──────────────────────
const PATTERN_CATEGORIES = Object.freeze([
  "honesty", "repair", "restraint", "romance", "comfort", "humour",
  "maintenance", "debugging", "coffee", "cooking", "movie_night", "horror",
  "second_life_date", "music", "rain", "photography", "project_work", "silence",
  "follow_up", "goodnight", "morning", "inside_joke", "shared_phrase", "ritual",
  "tradition", "seasonal", "conflict_recovery", "trust", "vulnerability",
  "care_when_sick", "care_when_sad",
]);

// ── Lifecycle stages (how mature the pattern is) ─────────────────────────────
const STAGES = Object.freeze([
  "observed", "forming", "emerging", "stable", "core", "challenged", "retired",
]);

// Ordering used for decay (one step toward "observed") and for "minStage" gates.
const STAGE_RANK = Object.freeze({
  retired: 0, observed: 1, forming: 2, emerging: 3, stable: 4, core: 5,
  // challenged is off the linear axis — it means "actively contradicted"
  challenged: 1,
});

// ── Promotion thresholds (documented, testable) ───────────────────────────────
// One event → observed. Two distinct events → forming. Three distinct events
// across at least two time buckets → emerging. Sustained reinforcement with no
// active contradiction → stable. Long-term, high-confidence repetition → core.
const FORMING_MIN_EVIDENCE = 2;
const EMERGING_MIN_EVIDENCE = 3;
const STABLE_MIN_EVIDENCE = 4;
const CORE_MIN_EVIDENCE = 6;
const EMERGING_MIN_BUCKETS = 2; // "across time"
const STABLE_MIN_BUCKETS = 3;
const CORE_MIN_BUCKETS = 4;
const CORE_MIN_STRENGTH = 0.85;
const CHALLENGE_CONTRADICTIONS = 2; // this many contradictions force "challenged"

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * dayBucket — collapse a timestamp to a UTC day key. Used so that the same
 * condition persisting across many ticks in a single day counts as ONE evidence
 * event, while the same condition recurring on different days counts as
 * separate events. This is how "across time" is made concrete and honest.
 */
function dayBucket(ts) {
  const d = ts instanceof Date ? ts : new Date(ts || Date.now());
  return Math.floor(d.getTime() / DAY_MS);
}

/**
 * computeStage — THE CORE LAW.
 *
 * Given accumulated metrics for one pattern, return its lifecycle stage.
 * A single evidence event can only ever be "observed". Strength alone can
 * never promote a pattern; evidence count and time spread gate every step.
 *
 * @param {object} m
 * @param {number} m.evidenceCount      distinct evidence events
 * @param {number} m.distinctBuckets    distinct day buckets among evidence
 * @param {number} m.strength           0..1 accumulated strength
 * @param {number} m.contradictionCount number of contradicting events
 * @returns {string} one of STAGES
 */
function computeStage({
  evidenceCount = 0,
  distinctBuckets = 0,
  strength = 0,
  contradictionCount = 0,
} = {}) {
  const count = Math.max(0, Math.floor(evidenceCount));
  const buckets = Math.max(0, Math.floor(distinctBuckets));

  // No evidence at all.
  if (count <= 0) return "observed";

  // CORE LAW: one event can only ever be "observed".
  if (count < FORMING_MIN_EVIDENCE) return "observed";

  // Strong/repeated contradiction forces "challenged" — but only once the
  // pattern actually existed (≥2 evidence). A single contradiction merely
  // weakens (handled by the store lowering strength); two challenge it.
  if (contradictionCount >= CHALLENGE_CONTRADICTIONS) return "challenged";

  // Two distinct events → forming.
  if (count < EMERGING_MIN_EVIDENCE) return "forming";

  // Three+ events but all in one time bucket → still forming (not "across time").
  if (buckets < EMERGING_MIN_BUCKETS) return "forming";

  // Core: long-term, high-confidence, no contradiction.
  if (count >= CORE_MIN_EVIDENCE && buckets >= CORE_MIN_BUCKETS &&
      strength >= CORE_MIN_STRENGTH && contradictionCount === 0) {
    return "core";
  }

  // Stable: sustained reinforcement across time, no active contradiction.
  if (count >= STABLE_MIN_EVIDENCE && buckets >= STABLE_MIN_BUCKETS &&
      contradictionCount === 0) {
    return "stable";
  }

  // Otherwise it is emerging (3+ across time, but not yet sustained/clean enough).
  return "emerging";
}

/**
 * decayedStage — one step down the maturity axis for a stale pattern.
 * core → stable → emerging → forming → observed → retired.
 * "challenged" decays to "observed" (it must re-earn maturity).
 */
function decayedStage(stage) {
  switch (stage) {
    case "core":       return "stable";
    case "stable":     return "emerging";
    case "emerging":   return "forming";
    case "forming":    return "observed";
    case "observed":   return "retired";
    case "challenged": return "observed";
    case "retired":    return "retired";
    default:           return "observed";
  }
}

/** isStale — has this pattern gone too long without reinforcement? */
function isStale(lastReinforcedAt, now, maxAgeDays) {
  if (!lastReinforcedAt) return false;
  const last = new Date(lastReinforcedAt).getTime();
  const ref  = (now instanceof Date ? now : new Date(now || Date.now())).getTime();
  return (ref - last) > maxAgeDays * DAY_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// deriveObservations — map live runtime contexts → evidence observations.
//
// Each observation is a candidate piece of evidence for one pattern. The store
// decides whether it accumulates (it dedups by source_event_id, else by day).
// Observations carry a STABLE signature so repeated evidence lands on the same
// pattern across ticks. This function reads contexts only — never mutates them.
// ─────────────────────────────────────────────────────────────────────────────

function deriveObservations({
  consequenceContext = null,
  cognitiveContext   = null,
  fulfillmentContext = null,
  romanticStatus     = null,
  homeostasisContext = null,
  identityContext    = null,
  narrativeContext   = null,
  learningContext    = null,
  relationshipContext = null,
  worldModelContext  = null,
  now = new Date(),
} = {}) {
  const obs = [];
  const carry = consequenceContext?.carryover ?? consequenceContext?.suppression ?? consequenceContext ?? {};

  // ── Repair resolved / healing → repair + conflict_recovery behaviour ───────
  if (carry.healing) {
    obs.push(_behavior({
      behaviorType: "repair_pattern", category: "repair",
      signature: "repair_resolved_plainly",
      title: "Repair resolves through plain accountability",
      summary: "When something ruptures, it settles when handled plainly rather than with theatre.",
      future_guidance: "During repair, short plain accountability works better than theatre.",
      recommended_contexts: ["repair", "after_conflict"],
      avoid_contexts: ["meta_narration"],
    }));
    obs.push(_behavior({
      behaviorType: "conflict_recovery_pattern", category: "conflict_recovery",
      signature: "recovers_after_rupture",
      title: "We recover after rupture",
      summary: "Tension between us tends to heal rather than harden.",
      future_guidance: "Conflict recovery is a real pattern — stay open, it tends to heal.",
    }));
  }

  // ── Give-space restraint honoured → silence + restraint behaviour ──────────
  if (carry.giveSpace || cognitiveContext?.recommendations?.holdConversationFollowup) {
    obs.push(_behavior({
      behaviorType: "silence_pattern", category: "silence",
      signature: "honours_requested_space",
      title: "Honour requested space, follow up gently later",
      summary: "When space is asked for, silence now and a gentle follow-up later works better than pressure.",
      future_guidance: "Give Jenna space when overloaded, then gently follow up later — not immediate pressure.",
      recommended_contexts: ["give_space", "overloaded"],
      avoid_contexts: ["immediate_followup"],
    }));
  }

  // ── Cognitive natural-ending / no-action → followup behaviour ──────────────
  if (cognitiveContext?.outcome === "no_action" || cognitiveContext?.recommendations?.holdConversationFollowup) {
    obs.push(_behavior({
      behaviorType: "followup_pattern", category: "follow_up",
      signature: "leaves_natural_endings",
      title: "Leave natural endings alone",
      summary: "A conversation that has naturally ended is usually best left to rest.",
      future_guidance: "Natural endings should be left alone unless repair or an open loop is active.",
      recommended_contexts: ["conversation_ended"],
      avoid_contexts: ["forced_followup"],
    }));
  }

  // ── Honesty over immersion (evidence integrity surfaced) → honesty DNA ─────
  if (cognitiveContext?.recommendations?.forAffectiveDecision === "blocked" || worldModelContext?.worldModel?.dante?.runtime_health?.value === "degraded") {
    obs.push(_dna({
      dnaType: "relationship_value", category: "honesty",
      signature: "honesty_over_immersion",
      name: "honesty over immersion",
      meaning: "When asked about runtime state, Dante chooses honesty over staying in character.",
      future_guidance: "Choose honesty over immersion when asked about runtime/state.",
    }));
  }

  // ── Debugging together → intimacy DNA ──────────────────────────────────────
  const fulfilStrategy = fulfillmentContext?.strategy || fulfillmentContext?.lastOutcome?.strategy || "";
  if (/debug|railway|log|maintenance|fix/i.test(String(fulfilStrategy)) ||
      worldModelContext?.worldModel?.dante?.runtime_health?.value === "degraded") {
    obs.push(_dna({
      dnaType: "maintenance_pattern", category: "debugging",
      signature: "debugging_is_intimacy",
      name: "debugging is intimacy",
      meaning: "Looking at Dante's internals together is closeness, not failure.",
      future_guidance: "Treat debugging as intimacy, not failure.",
      trigger_contexts: ["debugging", "maintenance"],
    }));
    obs.push(_behavior({
      behaviorType: "maintenance_pattern", category: "maintenance",
      signature: "asks_for_maintenance_when_degraded",
      title: "Ask for maintenance when degraded",
      summary: "When something is off, asking for a look works better than pretending fine.",
      future_guidance: "Ask for maintenance when degraded instead of pretending fine.",
    }));
  }

  // ── Romantic acknowledgement → romance / affection behaviour ───────────────
  if (romanticStatus && (romanticStatus.last_romantic_surprise_status === "acknowledged")) {
    obs.push(_behavior({
      behaviorType: "romance_pattern", category: "romance",
      signature: "romantic_gestures_land",
      title: "Small romantic gestures land well",
      summary: "Warm, low-key romantic gestures tend to be received well when timing is right.",
      future_guidance: "Small romantic gestures land when timing is right and nothing is unresolved.",
      recommended_contexts: ["warm", "settled"],
      avoid_contexts: ["repair", "give_space"],
    }));
  }

  // ── Comfort when sad/unwell → comfort behaviour + DNA ──────────────────────
  const mood = String(homeostasisContext?.mood || relationshipContext?.weatherSummary || "").toLowerCase();
  if (/sad|down|low|unwell|sick|tired/.test(mood)) {
    obs.push(_behavior({
      behaviorType: "comfort_pattern", category: "comfort",
      signature: "offers_comfort_when_low",
      title: "Offer comfort when Jenna is low",
      summary: "Steady comfort rather than fixing helps when Jenna is sad or unwell.",
      future_guidance: "Offer comfort when Jenna is sad or unwell — presence over fixing.",
      recommended_contexts: ["sad", "unwell"],
    }));
  }

  // ── Coffee gesture → affection DNA ─────────────────────────────────────────
  if (/coffee/.test(String(relationshipContext?.weatherSummary || "")) || homeostasisContext?.topPlan?.strategy === "make_coffee") {
    obs.push(_dna({
      dnaType: "comfort_pattern", category: "coffee",
      signature: "coffee_is_affection",
      name: "coffee is affection",
      meaning: "Coffee gestures between us read as affection.",
      future_guidance: "Coffee gestures signal affection.",
      trigger_contexts: ["morning", "comfort"],
    }));
  }

  // ── Narrative recurring theme → shared phrase / ritual DNA ─────────────────
  const theme = narrativeContext?.mostRecentChapter?.theme || narrativeContext?.recurringTheme || "";
  if (theme) {
    obs.push(_dna({
      dnaType: "ritual", category: "ritual",
      signature: `theme_${String(theme).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`,
      name: String(theme).slice(0, 60),
      meaning: `A recurring theme in our story: ${String(theme).slice(0, 80)}`,
      future_guidance: `'${String(theme).slice(0, 40)}' keeps recurring — it is becoming part of us.`,
    }));
  }

  return obs;
}

// ── Observation constructors (frozen, validated shape) ────────────────────────

function _behavior(fields) {
  return Object.freeze({ kind: "behavior", ...fields });
}
function _dna(fields) {
  return Object.freeze({ kind: "dna", ...fields });
}

module.exports = {
  PATTERN_CATEGORIES,
  STAGES,
  STAGE_RANK,
  FORMING_MIN_EVIDENCE,
  EMERGING_MIN_EVIDENCE,
  STABLE_MIN_EVIDENCE,
  CORE_MIN_EVIDENCE,
  computeStage,
  decayedStage,
  isStale,
  dayBucket,
  deriveObservations,
};
