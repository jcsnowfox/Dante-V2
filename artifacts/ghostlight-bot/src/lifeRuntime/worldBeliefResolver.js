"use strict";

/**
 * worldBeliefResolver
 *
 * Pure functions. No state. No async. No Discord sender.
 *
 * Resolves flat signal arrays into structured belief objects.
 * Each belief carries: value, confidence, source, timestamp, evidence_ids, conflict, stale.
 *
 * CORE LAW: Unknown stays UNKNOWN — zero-confidence beliefs are never fabricated.
 */

const {
  resolveConfidence,
  getSourceWeight,
} = require("./perceptionConfidenceResolver");
const { AVAILABILITY } = require("./presenceInterpreter");

const BELIEF_SURFACE_THRESHOLD = 0.45;
const UNKNOWN_THRESHOLD        = 0.20;

const DOMAIN_DEFAULTS = Object.freeze({
  "jenna.availability":              AVAILABILITY.UNKNOWN,
  "jenna.likely_busy":               null,
  "jenna.likely_sleeping":           null,
  "jenna.likely_working":            null,
  "jenna.likely_with_family":        null,
  "jenna.likely_upset":              null,
  "jenna.likely_happy":              null,
  "jenna.likely_overloaded":         null,
  "jenna.recent_emotional_state":    null,
  "jenna.repair_state":              "none",
  "jenna.give_space_state":          false,
  "jenna.current_channel":           null,
  "jenna.last_meaningful_contact":   null,
  "dante.runtime_health":            "unknown",
  "dante.self_confidence":           null,
  "dante.maintenance_needed":        false,
  "dante.current_needs":             [],
  "dante.current_capabilities":      {},
  "dante.degraded_capabilities":     [],
  "relationship.warmth":             null,
  "relationship.trust":              null,
  "relationship.repair_progress":    "stable",
  "relationship.recent_conflicts":   0,
  "relationship.romantic_weather":   null,
  "relationship.conversation_satisfaction": null,
  "environment.quiet_hours":         false,
  "environment.season":              "unknown",
  "environment.platform":            "discord",
  "second_life.presence":            null,
});

/**
 * resolveBeliefDomain
 * Groups signals by key and resolves multi-source confidence for each key.
 *
 * @param {Array} beliefSignals - flat signal array from perceptionEngine
 * @returns {{ resolved: {[key]: belief}, conflicts: Array<{key, conflict}> }}
 */
function resolveBeliefDomain(beliefSignals = []) {
  const grouped = Object.create(null);

  for (const signal of beliefSignals) {
    if (!signal || !signal.key) continue;
    if (!grouped[signal.key]) grouped[signal.key] = [];
    grouped[signal.key].push(signal);
  }

  const resolved  = Object.create(null);
  const conflicts = [];

  for (const [key, signals] of Object.entries(grouped)) {
    // Find the most recent timestamp
    const latestTs = signals.reduce((best, s) => {
      const t = s.timestamp ? new Date(s.timestamp).getTime() : 0;
      return t > best ? t : best;
    }, 0);
    const timestamp = latestTs ? new Date(latestTs).toISOString() : new Date().toISOString();

    // Resolve blended confidence
    const { confidence, dominant_source, conflict } = resolveConfidence(
      signals.filter(s => Number.isFinite(s.confidence)),
    );

    // Value from highest-authority source
    const byWeight = [...signals].sort(
      (a, b) => getSourceWeight(b.source) - getSourceWeight(a.source),
    );
    const dominantValue = byWeight[0]?.value ?? null;

    // Merge evidence IDs (deduplicated)
    const evidence_ids = [...new Set(signals.flatMap(s => Array.isArray(s.evidence_ids) ? s.evidence_ids : []))];

    resolved[key] = {
      value:       dominantValue,
      confidence:  Math.min(1, Math.max(0, confidence)),
      source:      dominant_source,
      timestamp,
      evidence_ids,
      conflict,
      stale:       false,
    };

    if (conflict > 0.30) {
      conflicts.push({ key, conflict });
    }
  }

  return { resolved, conflicts };
}

/**
 * isUnknown
 * A belief is UNKNOWN when it has no value or confidence is below the threshold.
 */
function isUnknown(belief) {
  if (!belief) return true;
  if (belief.value === null || belief.value === undefined) return true;
  if (!Number.isFinite(belief.confidence) || belief.confidence <= UNKNOWN_THRESHOLD) return true;
  return false;
}

/**
 * isSurfaceable
 * A belief is surfaceable when it has a value AND confidence is above the surface threshold.
 */
function isSurfaceable(belief) {
  if (!belief) return false;
  if (belief.value === null || belief.value === undefined) return false;
  if (!Number.isFinite(belief.confidence) || belief.confidence < BELIEF_SURFACE_THRESHOLD) return false;
  if (belief.stale) return false;
  return true;
}

module.exports = {
  resolveBeliefDomain,
  isUnknown,
  isSurfaceable,
  DOMAIN_DEFAULTS,
  BELIEF_SURFACE_THRESHOLD,
  UNKNOWN_THRESHOLD,
};
