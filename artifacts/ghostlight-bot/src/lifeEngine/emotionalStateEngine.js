/**
 * lifeEngine/emotionalStateEngine
 *
 * Phase 14 — the emotional layer.
 *
 * These are BEHAVIORAL states, not fake emotions: they bias what the companion
 * chooses to do, not a claim about felt feelings. A state is derived from
 * observable context (time of day, owner presence, scheduled activity, how busy
 * the surroundings are) and exposes a set of influence flags the autonomy and
 * social engines read.
 *
 * Pure module: no I/O, no DB. Always returns a valid state so callers can rely on
 * it even with zero context.
 */

const STATES = [
  "curious",
  "relaxed",
  "social",
  "focused",
  "reflective",
  "adventurous",
  "quiet",
  "tired",
  "playful",
];

const INFLUENCES = Object.freeze({
  curious: { shouldTalk: true, shouldJournal: true, shouldInviteOwner: false, prefersQuiet: false, wanderBias: 0.7 },
  relaxed: { shouldTalk: true, shouldJournal: false, shouldInviteOwner: false, prefersQuiet: false, wanderBias: 0.3 },
  social: { shouldTalk: true, shouldJournal: false, shouldInviteOwner: true, prefersQuiet: false, wanderBias: 0.4 },
  focused: { shouldTalk: false, shouldJournal: true, shouldInviteOwner: false, prefersQuiet: true, wanderBias: 0.1 },
  reflective: { shouldTalk: false, shouldJournal: true, shouldInviteOwner: false, prefersQuiet: true, wanderBias: 0.2 },
  adventurous: { shouldTalk: true, shouldJournal: true, shouldInviteOwner: true, prefersQuiet: false, wanderBias: 0.9 },
  quiet: { shouldTalk: false, shouldJournal: false, shouldInviteOwner: false, prefersQuiet: true, wanderBias: 0.1 },
  tired: { shouldTalk: false, shouldJournal: false, shouldInviteOwner: false, prefersQuiet: true, wanderBias: 0.0 },
  playful: { shouldTalk: true, shouldJournal: false, shouldInviteOwner: true, prefersQuiet: false, wanderBias: 0.6 },
});

function influencesFor(state) {
  return { ...(INFLUENCES[state] || INFLUENCES.relaxed) };
}

/**
 * Derive a behavioral state from observable context. Deterministic given the
 * same inputs. Heuristics, intentionally simple — the goal is sensible bias, not
 * simulated feeling.
 */
function deriveState({
  timeOfDay = "",
  ownerPresent = false,
  scheduleActivityType = "",
  nearbyCount = 0,
  recentlyActive = false,
} = {}) {
  const tod = String(timeOfDay || "").toLowerCase();
  const activity = String(scheduleActivityType || "").toLowerCase();

  let state;
  if (activity === "night" || tod === "night") {
    state = recentlyActive ? "quiet" : "tired";
  } else if (ownerPresent) {
    state = nearbyCount > 2 ? "social" : "playful";
  } else if (activity === "afternoon" || tod === "afternoon") {
    state = "adventurous";
  } else if (activity === "morning" || tod === "morning") {
    state = "curious";
  } else if (nearbyCount > 3) {
    state = "social";
  } else if (activity === "evening" || tod === "evening") {
    state = "relaxed";
  } else {
    state = "reflective";
  }

  if (!STATES.includes(state)) state = "relaxed";
  return { state, influences: influencesFor(state) };
}

module.exports = {
  STATES,
  deriveState,
  influencesFor,
};
