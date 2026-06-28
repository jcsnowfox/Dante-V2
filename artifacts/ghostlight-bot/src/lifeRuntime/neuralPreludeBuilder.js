"use strict";

/**
 * neuralPreludeBuilder
 *
 * Pure function — no async, no side effects.
 *
 * Contributes AT MOST ONE compact line to the LLM prelude, describing only the
 * COHERENCE of the system — never repeating any runtime's own summary. When
 * everything is coherent it may say so quietly; when integration confidence is
 * reduced by a conflict, it names that the confidence is reduced (not the
 * underlying fact, which the owning runtime already surfaces).
 *
 * Contract:
 *   - Returns null when there is nothing worth surfacing (healthy + no conflict
 *     + the line would add no signal).
 *   - Returns a single string ≤ 160 chars otherwise (never a list).
 *   - Never restates availability / repair / health / cognitive / emergence
 *     facts — those belong to their own builders.
 *
 * Dante ONLY.
 */

function buildNeuralPrelude({
  health = "healthy",
  conflicts = [],
  integrationConfidence = 1,
} = {}) {
  // Critical / degraded coherence problems are worth one honest line.
  if (health === "critical") {
    const c = conflicts[0];
    return _cap(`Integration: runtime coherence critical${c ? ` — ${_short(c.detail)}` : ""}`);
  }

  if (health === "degraded" || conflicts.some(c => c.severity === "high" || c.type === "impossible_combination")) {
    const c = conflicts.find(x => x.severity === "high" || x.type === "impossible_combination") || conflicts[0];
    return _cap(`Integration: confidence reduced — ${c ? _short(c.detail) : "conflicting runtime evidence"}`);
  }

  if (health === "watch" && conflicts.length) {
    const c = conflicts[0];
    return _cap(`Integration: minor inconsistency noted — ${_short(c.detail)}`);
  }

  // Healthy and coherent: surface the quiet "all coherent" line only when
  // confidence is solidly high (otherwise stay silent to avoid noise).
  if (health === "healthy" && integrationConfidence >= 0.85) {
    return "Integration: all runtime systems coherent";
  }

  return null;
}

function _short(s) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, 110);
}
function _cap(s) {
  return String(s).slice(0, 160);
}

module.exports = { buildNeuralPrelude };
