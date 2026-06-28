"use strict";

/**
 * selfInspectionPreludeBuilder
 *
 * Pure function. Returns a compact prelude warning line when Dante's runtime
 * is not healthy, or null when everything is fine.
 *
 * No side effects. No async. No DB. No Discord.
 */

/**
 * Build a compact prelude warning from a health probe result.
 *
 * @param {object|null} probeResult — from runtimeHealthProbe.probe()
 * @returns {string|null}
 */
function buildSelfInspectionPrelude(probeResult) {
  if (!probeResult) return null;
  const { overall, degraded_sources = [] } = probeResult;

  if (!overall || overall === "healthy" || overall === "watch" || overall === "unknown") return null;

  if (overall === "broken") {
    const src = degraded_sources[0];
    if (src === "self_consistency") {
      return "[internal] My self-consistency checks have failed repeatedly. Something in me may need attention.";
    }
    if (src === "evidence_integrity") {
      return "[internal] I've made repeated unsupported claims. I need to be careful about what I assert right now.";
    }
    if (src === "life_runtime_tick") {
      return "[internal] My life runtime appears to have stopped ticking. Something may be wrong.";
    }
    if (src === "memory") {
      return "[internal] My memory retrieval is failing. I may not have accurate recall right now.";
    }
    return `[internal] Something critical in me is broken (${src || "unknown source"}). I should not pretend I'm fine.`;
  }

  // degraded
  if (degraded_sources.length === 0) {
    return "[internal] Something in my runtime feels off. Worth noting.";
  }
  if (degraded_sources.length === 1) {
    const src = degraded_sources[0];
    const labels = {
      self_consistency: "self-consistency",
      evidence_integrity: "evidence integrity",
      life_runtime_tick: "life runtime tick",
      memory: "memory retrieval",
      source_health: "internal source health",
      repair: "repair state",
      affective_decision: "decision layer",
    };
    return `[internal] My ${labels[src] || src} appears degraded. Worth checking.`;
  }
  return `[internal] Multiple runtime sources appear degraded (${degraded_sources.slice(0, 3).join(", ")}). Worth checking.`;
}

module.exports = { buildSelfInspectionPrelude };
