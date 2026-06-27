"use strict";

/**
 * relationshipWeatherBridge
 *
 * Life Runtime 5.0 — Relational Consequences.
 *
 * Connects consequence events to the relationship weather. It owns its own
 * delta table so it stays correct even if the weather engine's internals
 * change, and it never replaces the weather engine — it only calls the
 * engine's existing `applyShift`, which already caps every dimension at
 * MAX_DELTA per call. That cap is what guarantees weather moves *gradually*:
 * even a major rupture nudges the weather, it never snaps it.
 *
 * If no relationshipWeatherEngine is provided, the bridge degrades to a
 * compatible no-op (returns null) so future relationship runtime work can
 * slot an engine in later without changing any call sites.
 */

// Per-event weather deltas. Positive = increase that dimension.
// Mirrors the Phase 4 spec: hurt lowers comfort/playfulness, raises distance
// and repair; repair_completed warms comfort/trust but pointedly does NOT
// restore playfulness (that recovers later, on its own, via the weather tick).
const WEATHER_DELTAS = Object.freeze({
  hurt_detected:         { comfort: -0.03, playfulness: -0.03, distance:  0.03, repair:  0.03 },
  conflict:              { comfort: -0.03, playfulness: -0.03, distance:  0.03, repair:  0.03, trust: -0.02 },
  disappointment:        { comfort: -0.02, playfulness: -0.02, distance:  0.02, repair:  0.03, trust: -0.02 },
  pushback_landed_badly: { comfort: -0.02, playfulness: -0.02, distance:  0.02, repair:  0.02 },
  boundary_crossed:      { comfort: -0.02, distance:  0.03, repair:  0.03, trust: -0.03 },
  trust_damage:          { trust:  -0.03, distance:  0.02, repair:  0.03 },
  promise_broken:        { trust:  -0.03, repair:  0.03, distance:  0.02 },
  overwhelm_detected:    { distance:  0.02, repair:  0.02, playfulness: -0.02 },
  give_space_requested:  { distance:  0.02, playfulness: -0.02 },
  unresolved_tension:    { distance:  0.02, repair:  0.02, comfort: -0.01 },
  misread:               { distance:  0.01, repair:  0.01 },
  shared_loss:           { comfort:  0.01, distance: -0.01, trust:  0.01, playfulness: -0.02 },

  // Repair progression
  repair_started:        { distance: -0.02, comfort:  0.005 },   // urgency (repair) stays
  repair_completed:      { comfort:  0.02, trust:  0.01 },        // playfulness intentionally absent
  forgiveness:           { comfort:  0.02, distance: -0.02, repair: -0.02 },

  // Positive / warming
  promise_kept:          { trust:  0.02, comfort:  0.02 },
  deep_affection:        { comfort:  0.02, distance: -0.02, playfulness:  0.01 },
  shared_victory:        { comfort:  0.02, sharedMomentum:  0.02, trust:  0.01 },
  trust_growth:          { trust:  0.02, comfort:  0.01 },
});

// Severity scales the requested delta. The engine still caps each dimension at
// MAX_DELTA, so "major" simply pushes harder against that ceiling — gradual,
// never a jump.
const SEVERITY_SCALE = Object.freeze({ minor: 0.5, moderate: 1.0, major: 1.5 });

function deltasFor(eventType) {
  return WEATHER_DELTAS[eventType] ? { ...WEATHER_DELTAS[eventType] } : null;
}

function scaleDeltas(deltas, severity) {
  const scale = SEVERITY_SCALE[severity] ?? 1.0;
  const out = {};
  for (const [k, v] of Object.entries(deltas)) out[k] = v * scale;
  return out;
}

function createRelationshipWeatherBridge({ relationshipWeatherEngine = null, logger = null } = {}) {
  const available = Boolean(relationshipWeatherEngine?.applyShift);

  /**
   * applyForEvent — apply the weather deltas for a single consequence event.
   * Returns the updated weather, or null when no engine is wired (compatible
   * no-op for future relationship runtime).
   */
  async function applyForEvent({ companionId, customerId, eventType, severity = "moderate" }) {
    const base = deltasFor(eventType);
    if (!base) return null;
    if (!available) return null;
    const deltas = scaleDeltas(base, severity);
    try {
      return await relationshipWeatherEngine.applyShift({ companionId, customerId, deltas });
    } catch (err) {
      logger?.warn?.("[weather-bridge] applyForEvent failed", { error: err?.message, eventType });
      return null;
    }
  }

  /**
   * summarize — safe, human-readable weather summary for status/prelude.
   * Never exposes raw scores.
   */
  async function summarize({ companionId, customerId }) {
    if (!relationshipWeatherEngine?.getWeather) return null;
    try {
      const w = await relationshipWeatherEngine.getWeather({ companionId, customerId });
      return w?.weatherSummary ?? null;
    } catch { return null; }
  }

  return { applyForEvent, summarize, deltasFor, available, WEATHER_DELTAS, SEVERITY_SCALE };
}

module.exports = {
  createRelationshipWeatherBridge,
  WEATHER_DELTAS,
  SEVERITY_SCALE,
  deltasFor,
};
