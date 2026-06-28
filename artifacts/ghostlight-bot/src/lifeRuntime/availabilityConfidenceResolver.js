"use strict";

/**
 * availabilityConfidenceResolver
 *
 * CANONICAL availability confidence policy.
 * Shared by perceptionRuntime (via perceptionConfidenceResolver) and
 * worldModelRuntime (via worldDecayEngine) so that both systems use the
 * same decay rate for jenna.availability.
 *
 * CORE LAW: One decay rate for jenna.availability everywhere.
 *           Explicit statements always override inference.
 *           Conflicting evidence lowers confidence, not raises it.
 *
 * Before this module existed, perceptionConfidenceResolver used 0.15
 * and worldDecayEngine used 0.06 — producing different confidence values
 * for the same fact in the same prelude. This module ends that split.
 */

// Canonical decay rate per period (30 min period for jenna.availability).
// At this rate: 90% confidence decays to 30% at 2h and to 0% at 6h.
// Matches perceptionConfidenceResolver.STALENESS_DECAY_RATE exactly.
const AVAILABILITY_DECAY_RATE = 0.15;

// Period length for availability staleness
const AVAILABILITY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// Minimum confidence to surface availability in the prelude
const AVAILABILITY_SURFACE_THRESHOLD = 0.45;

// Confidence below which a belief is treated as unknown
const AVAILABILITY_UNKNOWN_THRESHOLD = 0.20;

// Source authority — shared with perceptionConfidenceResolver
const AVAILABILITY_SOURCE_WEIGHTS = Object.freeze({
  explicit_statement:  1.00,
  discord_event:       0.90,
  discord_presence:    0.80,
  alive_presence:      0.75,
  consequence_context: 0.70,
  perception_context:  0.65,
  time_inference:      0.50,
  activity_inference:  0.45,
  fallback:            0.20,
});

/**
 * resolveAvailabilityConfidence
 *
 * Resolves a single canonical availability confidence from multiple source signals.
 * Applies authority weighting and conflict penalty.
 *
 * @param {Array<{value: string, confidence: number, source: string}>} sources
 * @returns {{ value: string|null, confidence: number, conflict: number, source: string }}
 */
function resolveAvailabilityConfidence(sources = []) {
  const valid = (sources || [])
    .filter(s => s && typeof s.value === "string" && Number.isFinite(s.confidence))
    .map(s => ({ ...s, _w: AVAILABILITY_SOURCE_WEIGHTS[s.source] ?? AVAILABILITY_SOURCE_WEIGHTS.fallback }))
    .sort((a, b) => b._w - a._w);

  if (!valid.length) return { value: null, confidence: 0, conflict: 0, source: "unknown" };

  const dominant = valid[0];

  // Conflict: distinct non-unknown values across sources
  const meaningful = valid.map(s => s.value).filter(v => v && v !== "unknown");
  const distinct   = new Set(meaningful).size;
  const conflict   = distinct > 1 ? Math.min(1, (distinct - 1) / valid.length) : 0;

  // Weighted average confidence
  let sum = 0, total = 0;
  for (const s of valid) { sum += s.confidence * s._w; total += s._w; }
  const blended  = total > 0 ? sum / total : 0;
  const resolved = Math.max(0, Math.min(1, blended - conflict * 0.25));

  return { value: dominant.value, confidence: resolved, conflict, source: dominant.source };
}

/**
 * applyAvailabilityDecay
 *
 * Applies canonical staleness decay to an availability confidence value.
 *
 * @param {number} confidence  - starting confidence
 * @param {number} ageMs       - age of the signal in milliseconds
 * @param {number} [thresholdMs] - period length (defaults to AVAILABILITY_THRESHOLD_MS)
 * @returns {{ confidence: number, stale: boolean }}
 */
function applyAvailabilityDecay(confidence, ageMs, thresholdMs = AVAILABILITY_THRESHOLD_MS) {
  if (!Number.isFinite(ageMs) || !Number.isFinite(thresholdMs) || thresholdMs <= 0) {
    return { confidence, stale: false };
  }
  const periods = ageMs / thresholdMs;
  const decayed = Math.max(0, confidence - periods * AVAILABILITY_DECAY_RATE);
  return { confidence: decayed, stale: decayed < AVAILABILITY_UNKNOWN_THRESHOLD };
}

module.exports = {
  AVAILABILITY_DECAY_RATE,
  AVAILABILITY_THRESHOLD_MS,
  AVAILABILITY_SURFACE_THRESHOLD,
  AVAILABILITY_UNKNOWN_THRESHOLD,
  AVAILABILITY_SOURCE_WEIGHTS,
  resolveAvailabilityConfidence,
  applyAvailabilityDecay,
};
