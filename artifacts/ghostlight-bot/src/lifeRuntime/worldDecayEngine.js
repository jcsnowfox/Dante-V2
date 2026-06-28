"use strict";

/**
 * worldDecayEngine
 *
 * Pure functions. No state. No async. No Discord sender.
 *
 * Applies per-domain confidence decay to world model beliefs.
 * Different domains decay at different rates — availability decays fast,
 * relationship warmth decays slow.
 *
 * CORE LAW: Unknown stays unknown. When confidence decays below UNKNOWN_THRESHOLD,
 *           the belief is marked stale rather than deleted — callers decide what
 *           to do with stale beliefs.
 *
 * Decay formula:
 *   periods = ageMs / thresholdMs
 *   decayedConfidence = confidence - (periods * STALENESS_DECAY_RATE)
 *   clamped to [0, confidence]
 *
 * Example (jenna.availability, threshold 30 min, rate 0.06):
 *   90%  at T=0h  →  66%  at T=2h  →  18%  at T=6h  →  stale (UNKNOWN)
 */

const { AVAILABILITY_DECAY_RATE } = require("./availabilityConfidenceResolver");

const UNKNOWN_THRESHOLD    = 0.20;
const STALENESS_DECAY_RATE = 0.06;

// Per-key decay rate overrides — jenna.availability uses the canonical rate
// shared with perceptionConfidenceResolver so both systems agree.
const DECAY_RATE_OVERRIDES = Object.freeze({
  "jenna.availability":   AVAILABILITY_DECAY_RATE, // 0.15 — canonical rate
  "jenna.likely_sleeping": 0.08,
  "jenna.current_channel": AVAILABILITY_DECAY_RATE,
});

// Per-domain staleness thresholds.
// 0 means the signal never decays (always recomputed from clock / pure inference).
const DECAY_THRESHOLDS_MS = Object.freeze({
  "jenna.availability":             30  *  60 * 1000,
  "jenna.likely_busy":              45  *  60 * 1000,
  "jenna.likely_sleeping":           4  *  60 * 60 * 1000,
  "jenna.likely_working":            2  *  60 * 60 * 1000,
  "jenna.likely_with_family":        4  *  60 * 60 * 1000,
  "jenna.likely_upset":              2  *  60 * 60 * 1000,
  "jenna.likely_happy":              2  *  60 * 60 * 1000,
  "jenna.likely_overloaded":         3  *  60 * 60 * 1000,
  "jenna.recent_emotional_state":    4  *  60 * 60 * 1000,
  "jenna.repair_state":             24  *  60 * 60 * 1000,
  "jenna.give_space_state":          6  *  60 * 60 * 1000,
  "jenna.current_channel":          30  *  60 * 1000,
  "jenna.last_meaningful_contact":  12  *  60 * 60 * 1000,
  "dante.runtime_health":           60  *  60 * 1000,
  "dante.self_confidence":           4  *  60 * 60 * 1000,
  "dante.maintenance_needed":        2  *  60 * 60 * 1000,
  "dante.current_needs":            60  *  60 * 1000,
  "dante.current_capabilities":      4  *  60 * 60 * 1000,
  "dante.degraded_capabilities":     4  *  60 * 60 * 1000,
  "relationship.warmth":             7  * 24 * 60 * 60 * 1000,
  "relationship.trust":              7  * 24 * 60 * 60 * 1000,
  "relationship.repair_progress":   24  *  60 * 60 * 1000,
  "relationship.recent_conflicts":  24  *  60 * 60 * 1000,
  "relationship.romantic_weather":   4  *  60 * 60 * 1000,
  "relationship.conversation_satisfaction": 2 * 60 * 60 * 1000,
  // Environment signals are always fresh — no decay
  "environment.quiet_hours":          0,
  "environment.season":               0,
  "environment.platform":             0,
  // Second Life presence decays quickly
  "second_life.presence":           30  *  60 * 1000,
});

/**
 * getDecayThreshold
 * Returns the staleness threshold in milliseconds for a given belief key.
 * Defaults to 1 hour for unknown keys.
 */
function getDecayThreshold(key) {
  if (key in DECAY_THRESHOLDS_MS) return DECAY_THRESHOLDS_MS[key];
  return 60 * 60 * 1000; // 1h fallback
}

/**
 * applyDecayToBelief
 * Applies staleness decay to a single belief based on its key and age.
 *
 * @param {object} belief - { value, confidence, source, timestamp, evidence_ids, conflict, stale }
 * @param {string} key    - domain key (e.g. "jenna.availability")
 * @param {Date}   now
 * @returns {object} decayed belief (new object — pure)
 */
function applyDecayToBelief(belief, key, now) {
  if (!belief) return belief;

  const threshold = getDecayThreshold(key);

  // No decay for threshold=0 (environment signals)
  if (threshold === 0) return { ...belief, stale: false };

  const nowMs  = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const thenMs = belief.timestamp ? new Date(belief.timestamp).getTime() : 0;
  const ageMs  = Math.max(0, nowMs - thenMs);

  if (ageMs === 0) return belief;

  const rate             = DECAY_RATE_OVERRIDES[key] ?? STALENESS_DECAY_RATE;
  const periods          = ageMs / threshold;
  const decayAmount      = periods * rate;
  const decayedConf      = Math.max(0, belief.confidence - decayAmount);
  const stale            = decayedConf < UNKNOWN_THRESHOLD;

  return {
    ...belief,
    confidence: decayedConf,
    stale,
  };
}

/**
 * applyDecayToModel
 * Applies staleness decay to every belief in the belief map.
 *
 * @param {object} beliefMap - { [key]: belief }
 * @param {Date}   now
 * @returns {object} new belief map with decayed confidences (pure)
 */
function applyDecayToModel(beliefMap, now) {
  if (!beliefMap) return {};
  const result = Object.create(null);
  for (const [key, belief] of Object.entries(beliefMap)) {
    result[key] = applyDecayToBelief(belief, key, now);
  }
  return result;
}

module.exports = {
  applyDecayToBelief,
  applyDecayToModel,
  getDecayThreshold,
  DECAY_THRESHOLDS_MS,
  DECAY_RATE_OVERRIDES,
  STALENESS_DECAY_RATE,
  UNKNOWN_THRESHOLD,
};
