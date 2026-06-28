"use strict";

/**
 * worldModelPreludeBuilder
 *
 * Pure functions. No state. No async. No Discord sender.
 *
 * Builds a compact world model prelude signal (≤200 chars) for injection
 * into the life prelude. Shows what Dante currently believes about his world,
 * without narrating it or fabricating missing state.
 *
 * CORE LAW: Only surface beliefs that are above the BELIEF_SURFACE_THRESHOLD.
 *            Never invent a signal when no evidence exists.
 */

const { BELIEF_SURFACE_THRESHOLD } = require("./worldBeliefResolver");

/**
 * buildWorldModelSignal
 * Builds a compact signal string from a structured world model.
 *
 * @param {object|null} worldModel - structured world model from worldModelRuntime
 * @returns {string|null} compact signal ≤200 chars, or null if nothing surfaceable
 */
function buildWorldModelSignal(worldModel) {
  if (!worldModel) return null;

  const parts = [];

  // ── Jenna availability ────────────────────────────────────────────────────
  const avail = worldModel.jenna?.availability;
  if (avail && Number.isFinite(avail.confidence) && avail.confidence >= BELIEF_SURFACE_THRESHOLD && avail.value && avail.value !== "unknown" && !avail.stale) {
    const pct   = Math.round(avail.confidence * 100);
    const label = String(avail.value).replace(/_/g, " ");
    parts.push(`Jenna ${label} (${pct}%)`);
  }

  // ── Give space ────────────────────────────────────────────────────────────
  const giveSpace = worldModel.jenna?.give_space_state;
  if (giveSpace?.value === true && Number.isFinite(giveSpace.confidence) && giveSpace.confidence >= BELIEF_SURFACE_THRESHOLD && !giveSpace.stale) {
    parts.push("Give space active");
  }

  // ── Relationship repair ───────────────────────────────────────────────────
  const repair = worldModel.relationship?.repair_progress;
  if (repair && Number.isFinite(repair.confidence) && repair.confidence >= BELIEF_SURFACE_THRESHOLD && !repair.stale) {
    const repairLabel = repair.value === "stable" ? "Repair stable"
      : repair.value ? `Repair ${repair.value}`
      : null;
    if (repairLabel) parts.push(repairLabel);
  }

  // ── Dante health (only surface degraded — healthy is the default) ─────────
  const health = worldModel.dante?.runtime_health;
  if (health?.value === "degraded" && Number.isFinite(health.confidence) && health.confidence >= BELIEF_SURFACE_THRESHOLD && !health.stale) {
    parts.push("Runtime degraded");
  }

  if (!parts.length) return null;

  return `World: ${parts.join("; ")}`.slice(0, 200);
}

/**
 * buildWorldModelPrelude
 * Wrapper that accepts a worldModelContext object (from worldModelRuntime.getWorldModelContext()).
 *
 * @param {object|null} worldModelContext - { worldModel, preludeSignal, lastUpdatedAt }
 * @returns {string|null}
 */
function buildWorldModelPrelude(worldModelContext) {
  if (!worldModelContext) return null;
  return buildWorldModelSignal(worldModelContext.worldModel ?? null);
}

module.exports = {
  buildWorldModelSignal,
  buildWorldModelPrelude,
};
