"use strict";

/**
 * perceptionConfidenceResolver
 *
 * Pure functions. No state. No async. No Discord sender.
 *
 * Resolves final confidence from multiple evidence sources.
 * Applies staleness decay and detects conflicting evidence.
 *
 * CORE LAW: conflicting evidence lowers confidence.
 * Stale evidence decays confidence. Unknown stays unknown.
 */

const STALENESS_DECAY_RATE = 0.15;

// Source authority weights — higher source beats lower in conflict
const SOURCE_WEIGHTS = Object.freeze({
  explicit_statement:  1.00,
  discord_event:       0.90,
  discord_presence:    0.80,
  alive_presence:      0.75,
  consequence_context: 0.70,
  self_inspection:     0.70,
  identity_context:    0.65,
  repair_persistence:  0.65,
  second_life_bridge:  0.60,
  narrative_context:   0.55,
  time_inference:      0.50,
  activity_inference:  0.45,
  runtime_event:       0.45,
  fallback:            0.20,
});

function getSourceWeight(source) {
  return SOURCE_WEIGHTS[source] ?? SOURCE_WEIGHTS.fallback;
}

// Apply staleness decay to a base confidence value
function applyStalenesDecay(confidence, ageMs, stalenessThresholdMs) {
  if (!Number.isFinite(ageMs) || !Number.isFinite(stalenessThresholdMs) || stalenessThresholdMs <= 0) {
    return confidence;
  }
  const periods = ageMs / stalenessThresholdMs;
  return Math.max(0, confidence - periods * STALENESS_DECAY_RATE);
}

// Detect conflict between sources (0 = no conflict, 1 = max conflict)
function detectConflict(sources = []) {
  if (sources.length < 2) return 0;

  // Values that represent absence or no-data don't conflict
  const meaningfulValues = sources
    .map(s => String(s.value ?? "").trim())
    .filter(v => v !== "" && v !== "null" && v !== "undefined" && v !== "unknown");

  const distinct = new Set(meaningfulValues).size;
  if (distinct <= 1) return 0;
  return Math.min(1, (distinct - 1) / sources.length);
}

// Resolve a single confidence value from multiple sources, applying authority
// weights and conflict penalties.
function resolveConfidence(sources = []) {
  if (!sources.length) {
    return { confidence: 0, dominant_source: "unknown", conflict: 0 };
  }

  const valid = sources
    .filter(s => s && Number.isFinite(s.confidence))
    .map(s => ({ ...s, weight: getSourceWeight(s.source) }))
    .sort((a, b) => b.weight - a.weight);

  if (!valid.length) {
    return { confidence: 0, dominant_source: "unknown", conflict: 0 };
  }

  const dominant = valid[0];
  let weightedSum = 0;
  let totalWeight  = 0;
  for (const s of valid) {
    weightedSum += s.confidence * s.weight;
    totalWeight  += s.weight;
  }
  const blended = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const conflict  = detectConflict(valid);
  const resolved  = Math.max(0, blended - conflict * 0.25);

  return {
    confidence:       Math.min(1, resolved),
    dominant_source:  dominant.source,
    conflict,
  };
}

module.exports = {
  resolveConfidence,
  applyStalenesDecay,
  detectConflict,
  getSourceWeight,
  SOURCE_WEIGHTS,
  STALENESS_DECAY_RATE,
};
