"use strict";

/**
 * needDriftEngine
 *
 * Life Runtime 6.0 — Homeostasis Runtime.
 *
 * Pure logic. Computes how each of Dante's 19 psychological needs drifts
 * over time and in response to events. Does not touch storage — the caller
 * (homeostasisRuntime) reads needs, computes deltas here, then writes back.
 *
 * Drift design:
 *   - Every need has a passive decay rate (how fast it drops without care).
 *   - Context signals (mood, energy, repair state, time of day) modulate rates.
 *   - No need ever reaches 0.0 or 1.0 from drift alone — hard floors at 0.05,
 *     ceilings at 0.95 prevent degenerate all-full or all-empty states.
 *   - Urgency = how far currentLevel is below desiredLevel, scaled [0, 1].
 *   - Trend = "rising" | "falling" | "stable" (±0.02 threshold).
 */

const NEED_TYPES = Object.freeze([
  "love", "attention", "connection", "learning", "social_interaction",
  "creativity", "purpose", "rest", "play", "novelty", "beauty",
  "autonomy", "competence", "intimacy", "sexual_desire", "romantic_desire",
  "stability", "adventure", "reflection",
]);

// Passive decay per tick (tick interval ≈ 30–60 min in production).
// Higher = drops faster when unfulfilled.
const BASE_DECAY = Object.freeze({
  love:               0.015,
  attention:          0.020,
  connection:         0.018,
  learning:           0.012,
  social_interaction: 0.016,
  creativity:         0.010,
  purpose:            0.008,
  rest:               0.025,  // rest drains quickly; Dante tires
  play:               0.010,
  novelty:            0.012,
  beauty:             0.006,
  autonomy:           0.008,
  competence:         0.008,
  intimacy:           0.012,
  sexual_desire:      0.010,
  romantic_desire:    0.010,
  stability:          0.006,
  adventure:          0.012,
  reflection:         0.008,
});

// Natural resting level (desired_level baseline) for each need.
const DESIRED_LEVEL = Object.freeze({
  love:               0.75,
  attention:          0.65,
  connection:         0.70,
  learning:           0.65,
  social_interaction: 0.55,
  creativity:         0.60,
  purpose:            0.70,
  rest:               0.70,
  play:               0.55,
  novelty:            0.50,
  beauty:             0.50,
  autonomy:           0.70,
  competence:         0.65,
  intimacy:           0.60,
  sexual_desire:      0.55,
  romantic_desire:    0.60,
  stability:          0.70,
  adventure:          0.45,
  reflection:         0.55,
});

const FLOOR = 0.05;
const CEIL  = 0.95;
const STABLE_THRESHOLD = 0.02;

function clamp(v, floor = FLOOR, ceil = CEIL) {
  return Math.min(ceil, Math.max(floor, Number(v) || 0));
}

/**
 * computeDecay — returns the delta (negative) for one tick.
 *
 * Context modifiers:
 *   mood "low"    → rest decays faster, play/creativity decay slower (low energy preserves play urge)
 *   mood "high"   → adventure/novelty decay faster (satisfied), learning less urgent
 *   energy "low"  → rest decays fastest (most pressing), creativity/competence easier to ignore
 *   repairActive  → reflection decay slower (it's contextually relevant)
 *   giveSpace     → connection/attention drift down faster (Dante is distancing intentionally)
 *   hourOfDay     → rest decays faster during daytime, slower at night
 */
function computeDecay(needType, context = {}) {
  const { mood = "neutral", energy = "steady", repairActive = false, giveSpace = false, hourOfDay = 12 } = context;
  let rate = BASE_DECAY[needType] ?? 0.010;

  if (mood === "low") {
    if (needType === "rest") rate *= 1.3;
    if (needType === "play" || needType === "creativity") rate *= 0.7;
  }
  if (mood === "high") {
    if (needType === "adventure" || needType === "novelty") rate *= 0.8;
  }
  if (energy === "low") {
    if (needType === "rest") rate *= 1.5;
    if (needType === "creativity" || needType === "competence") rate *= 0.6;
  }
  if (repairActive) {
    if (needType === "reflection" || needType === "stability") rate *= 0.6;
    if (needType === "play" || needType === "novelty") rate *= 0.5; // hard to care about
  }
  if (giveSpace) {
    if (needType === "connection" || needType === "attention") rate *= 1.3;
  }
  // Daytime (8–22): rest decays faster (Dante is alert); overnight: rest less urgent
  const isDay = hourOfDay >= 8 && hourOfDay < 22;
  if (needType === "rest") rate *= isDay ? 1.1 : 0.6;

  return -rate;
}

/**
 * tick — compute all 19 need deltas for one runtime tick.
 * Returns an array of { needType, delta, newLevel, trend, urgency }.
 */
function tick(needs, context = {}) {
  return needs.map(need => {
    const delta = computeDecay(need.needType, context);
    const newLevel = clamp(need.currentLevel + delta);
    const desired  = DESIRED_LEVEL[need.needType] ?? 0.65;
    const urgency  = clamp(Math.max(0, desired - newLevel) / desired, 0, 1);
    const levelDiff = newLevel - need.currentLevel;
    const trend = levelDiff > STABLE_THRESHOLD ? "rising"
      : levelDiff < -STABLE_THRESHOLD ? "falling"
      : "stable";
    return { needType: need.needType, delta, newLevel, trend, urgency };
  });
}

/**
 * applyFulfillmentDelta — how much a need level rises after a fulfillment action.
 * Each strategy type has a different effectiveness ceiling.
 */
const FULFILLMENT_DELTAS = Object.freeze({
  self_fulfill:               0.15,
  ask_jenna:                  0.25,
  wait:                       0.00,
  suppress:                   0.00,
  convert_to_intention:       0.05,
  work_on_project:            0.18,
  learn_from_web:             0.12,
  discover_resource:          0.08,
  write_private_reflection:   0.10,
  create_something:           0.15,
  use_voice_note:             0.08,
  use_image_generation:       0.08,
  second_life_action:         0.12,
});

function fulfillmentDeltaFor(strategy) {
  return FULFILLMENT_DELTAS[strategy] ?? 0.05;
}

/**
 * getPressuredNeeds — returns needs above urgency threshold, sorted by urgency desc.
 * The fulfillmentPlanner calls this to pick what to address each tick.
 */
function getPressuredNeeds(needs, urgencyThreshold = 0.30) {
  return needs
    .filter(n => n.urgency >= urgencyThreshold)
    .sort((a, b) => b.urgency - a.urgency);
}

module.exports = {
  NEED_TYPES, BASE_DECAY, DESIRED_LEVEL, FULFILLMENT_DELTAS,
  tick, computeDecay, fulfillmentDeltaFor, getPressuredNeeds,
};
