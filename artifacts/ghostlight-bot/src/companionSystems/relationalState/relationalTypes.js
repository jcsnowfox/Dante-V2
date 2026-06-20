/**
 * relationalTypes
 *
 * Static vocabulary for the Relational State Engine. No behaviour is defined
 * here — only the closed sets of relational signals, expression modes, desire
 * types and repair types, plus the deterministic mappings from a signal to the
 * owner config flag that gates it and to its default decay rate.
 *
 * Nothing in this file enables behaviour. Every signal still has to pass the
 * owner settings gate + expression gate before it can influence a reply.
 */

// The relational signals the appraisal engine can detect (spec Phase 4).
const RELATIONAL_SIGNALS = Object.freeze([
  "trust",
  "closeness",
  "distance",
  "repair_needed",
  "warmth",
  "affection",
  "longing",
  "hurt",
  "annoyance",
  "frustration",
  "anger",
  "guilt",
  "remorse",
  "protectiveness",
  "desire",
  "want",
  "boundary_pressure",
  "conflict_tension",
  "relief",
  "reconnection",
  "avoidance",
  "guardedness",
]);

// The only ways the engine may surface a relational signal (spec Phase 5).
const EXPRESSION_MODES = Object.freeze([
  "internal_only",
  "subtle_expression",
  "direct_expression",
  "repair_expression",
  "boundary_expression",
  "no_expression",
]);

// Internal pulls the companion may feel. None of these execute an action — they
// are stored as internal desires only and always require external permission
// (spec Phase 8).
const DESIRE_TYPES = Object.freeze([
  "reconnect",
  "repair",
  "comfort",
  "protect",
  "follow_up",
  "create_media",
  "send_voice",
  "suggest_music",
  "ask_permission",
  "write_private_note",
  "wait",
  "do_nothing",
]);

const REPAIR_TYPES = Object.freeze([
  "direct_apology",
  "behavior_correction",
  "acknowledgement",
  "offer",
]);

// Which owner config flag must be enabled for a signal to be tracked/expressed.
// Anything not listed falls back to the general emotion_tracking_enabled flag.
const SIGNAL_CONFIG_FLAG = Object.freeze({
  trust: "trust_tracking_enabled",
  closeness: "closeness_tracking_enabled",
  warmth: "closeness_tracking_enabled",
  affection: "closeness_tracking_enabled",
  reconnection: "closeness_tracking_enabled",
  relief: "closeness_tracking_enabled",
  distance: "distance_tracking_enabled",
  avoidance: "distance_tracking_enabled",
  guardedness: "distance_tracking_enabled",
  longing: "longing_tracking_enabled",
  hurt: "hurt_tracking_enabled",
  annoyance: "annoyance_tracking_enabled",
  frustration: "annoyance_tracking_enabled",
  anger: "annoyance_tracking_enabled",
  conflict_tension: "annoyance_tracking_enabled",
  guilt: "guilt_remorse_tracking_enabled",
  remorse: "guilt_remorse_tracking_enabled",
  repair_needed: "repair_tracking_enabled",
  boundary_pressure: "boundary_tracking_enabled",
  desire: "desire_tracking_enabled",
  want: "wants_tracking_enabled",
  protectiveness: "emotion_tracking_enabled",
});

// Per-signal decay rate (fraction lost per hour). Fast signals fade quickly;
// slow signals persist; guilt/remorse never decay on their own — they persist
// until a repair attempt addresses them (spec Phase 9).
const SIGNAL_DECAY_RATE = Object.freeze({
  annoyance: 0.4,
  frustration: 0.35,
  relief: 0.4,
  conflict_tension: 0.3,
  anger: 0.15,
  longing: 0.2,
  distance: 0.1,
  avoidance: 0.1,
  guardedness: 0.1,
  hurt: 0.05,
  guilt: 0,
  remorse: 0,
  repair_needed: 0,
  trust: 0.01,
  closeness: 0.02,
  warmth: 0.25,
  affection: 0.1,
  protectiveness: 0.1,
  boundary_pressure: 0.2,
  desire: 0.2,
  want: 0.3,
  reconnection: 0.4,
});

// Signals that persist until they are explicitly resolved/repaired.
const PERSIST_UNTIL_RESOLVED = Object.freeze(["guilt", "remorse", "repair_needed"]);

const VALID_RELATIONAL_DEPTHS = Object.freeze(["off", "light", "realistic", "intense"]);

function isRelationalSignal(id) {
  return RELATIONAL_SIGNALS.includes(id);
}

function isExpressionMode(id) {
  return EXPRESSION_MODES.includes(id);
}

function isDesireType(id) {
  return DESIRE_TYPES.includes(id);
}

function signalTrackingFlag(signalId) {
  return SIGNAL_CONFIG_FLAG[signalId] || "emotion_tracking_enabled";
}

function signalDecayRate(signalId) {
  const rate = SIGNAL_DECAY_RATE[signalId];
  return typeof rate === "number" ? rate : 0.1;
}

module.exports = {
  RELATIONAL_SIGNALS,
  EXPRESSION_MODES,
  DESIRE_TYPES,
  REPAIR_TYPES,
  SIGNAL_CONFIG_FLAG,
  SIGNAL_DECAY_RATE,
  PERSIST_UNTIL_RESOLVED,
  VALID_RELATIONAL_DEPTHS,
  isRelationalSignal,
  isExpressionMode,
  isDesireType,
  signalTrackingFlag,
  signalDecayRate,
};
