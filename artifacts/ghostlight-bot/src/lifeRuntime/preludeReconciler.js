"use strict";

/**
 * preludeReconciler
 *
 * THE single canonical composer for the overlapping presence/world signals
 * in the life prelude.
 *
 * Accepts structured context from all runtimes and emits ONE reconciled
 * "World:" line. This prevents the LLM from receiving the same fact twice
 * with contradictory confidence values.
 *
 * Reconciliation rules:
 *   Availability — worldModelContext preferred; if perceptionContext agrees,
 *     use max confidence; if conflict, lower confidence and flag uncertainty;
 *     if only one source, use it.
 *
 *   Repair state — consequenceContext is authoritative (DB-backed). The
 *     narrative consequencePreludeBuilder already covers active repair in
 *     its own line; this module suppresses the technical duplicate.
 *
 *   Runtime health — selfInspection preludeWarning covers "degraded" in
 *     its own narrative line; this module suppresses the technical duplicate.
 *
 *   Quiet hours — from perceptionContext only (worldModel doesn't track it).
 *
 * CORE LAW: The LLM sees each fact ONCE. When sources conflict,
 *           lower confidence rather than list both values.
 *
 * No state. No async. No Discord sender.
 */

const { AVAILABILITY } = require("./presenceInterpreter");
const { BELIEF_SURFACE_THRESHOLD } = require("./worldBeliefResolver");

const MAX_LINE_LENGTH = 220;

/**
 * reconcilePresencePrelude
 *
 * @param {object}      opts
 * @param {object|null} opts.worldModelContext     - worldModelRuntime.getWorldModelContext()
 * @param {object|null} opts.perceptionContext     - perceptionRuntime.getPerceptionContext()
 * @param {object|null} opts.selfInspectionContext - { preludeWarning: string|null }
 * @param {object|null} opts.consequenceContext    - consequenceContext.carryover (the prelude carryover)
 * @returns {string|null} one reconciled "World: ..." line or null
 */
function reconcilePresencePrelude({
  worldModelContext    = null,
  perceptionContext    = null,
  selfInspectionContext = null,
  consequenceContext   = null,
} = {}) {
  const parts = [];

  // ─── Give space (highest priority — check before availability) ────────────
  const giveSpaceActive = _detectGiveSpace(worldModelContext, perceptionContext, consequenceContext);
  if (giveSpaceActive) {
    // consequencePreludeBuilder already emits the narrative "Jenna asked for space" line;
    // world line still surfaces "space requested" so the technical context is visible
    parts.push("Jenna: space requested");
  } else {
    // ─── Availability (worldModel preferred, conflict → uncertainty) ──────────
    const availLine = _reconcileAvailability(worldModelContext, perceptionContext);
    if (availLine) parts.push(availLine);
  }

  // ─── Repair state (consequenceContext is authoritative) ──────────────────
  // Only add technical repair if the narrative consequencePreludeBuilder WON'T fire
  // (no active consequence carryover). When consequenceContext is active, the
  // narrative line already covers repair — avoid the duplicate.
  const activeConsequence = _hasActiveConsequence(consequenceContext);
  if (!activeConsequence) {
    const repairLine = _reconcileRepairFromWorldModel(worldModelContext);
    if (repairLine) parts.push(repairLine);
  }

  // ─── Runtime health ────────────────────────────────────────────────────────
  // selfInspection.preludeWarning covers "degraded" in a narrative line.
  // Only add technical health signal if no narrative warning already fired.
  if (!selfInspectionContext?.preludeWarning) {
    const healthLine = _reconcileHealth(worldModelContext, perceptionContext);
    if (healthLine) parts.push(healthLine);
  }

  // ─── Quiet hours (perception only — no worldModel equivalent) ────────────
  if (perceptionContext?.worldState?.environment?.quiet_hours) {
    parts.push("quiet hours");
  }

  if (!parts.length) return null;

  return `World: ${parts.join("; ")}`.slice(0, MAX_LINE_LENGTH);
}

// ─────────────────────────────────────────────────────────────────────────────

function _detectGiveSpace(worldModelContext, perceptionContext, consequenceContext) {
  if (consequenceContext?.giveSpace) return true;
  const wmGs = worldModelContext?.worldModel?.jenna?.give_space_state;
  if (wmGs?.value === true && Number.isFinite(wmGs.confidence) && wmGs.confidence >= BELIEF_SURFACE_THRESHOLD && !wmGs.stale) return true;
  if (perceptionContext?.worldState?.jenna?.give_space === true) return true;
  return false;
}

function _reconcileAvailability(worldModelContext, perceptionContext) {
  const wm = worldModelContext?.worldModel?.jenna?.availability;
  const pc = perceptionContext?.worldState?.jenna;

  // Compute worldModel availability
  let wmValue = null, wmConf = 0;
  if (wm && Number.isFinite(wm.confidence) && wm.confidence >= BELIEF_SURFACE_THRESHOLD && !wm.stale && wm.value && wm.value !== "unknown") {
    wmValue = String(wm.value).replace(/_/g, " ");
    wmConf  = wm.confidence;
  }

  // Compute perception availability
  let pcValue = null, pcConf = 0;
  if (pc?.availability && pc.availability !== AVAILABILITY.UNKNOWN) {
    const raw = pc._confidence ?? 0;
    if (raw >= BELIEF_SURFACE_THRESHOLD) {
      pcValue = pc.availability;
      pcConf  = raw;
    }
  }

  // Neither source has surfaceable availability
  if (!wmValue && !pcValue) return null;

  // Only worldModel has surfaceable availability
  if (wmValue && !pcValue) {
    return _formatAvailability(wmValue, wmConf, false);
  }

  // Only perception has surfaceable availability
  if (!wmValue && pcValue) {
    const label = String(pcValue).replace(/_/g, " ");
    return _formatAvailability(label, pcConf, false);
  }

  // Both have surfaceable availability — compare values
  const wmNorm = wmValue.toLowerCase().replace(/\s+/g, "_");
  const pcNorm = String(pcValue).toLowerCase().replace(/\s+/g, "_");

  if (wmNorm === pcNorm) {
    // Agreement: use max confidence (converging evidence is stronger)
    return _formatAvailability(wmValue, Math.max(wmConf, pcConf), false);
  }

  // Conflict: lower confidence, flag uncertainty
  const conflictConf = Math.max(0, Math.min(wmConf, pcConf) - 0.15);
  if (conflictConf < BELIEF_SURFACE_THRESHOLD) {
    return "Jenna: availability uncertain";
  }
  return _formatAvailability(wmValue, conflictConf, true);
}

function _formatAvailability(label, conf, uncertain) {
  const pct = Math.round(conf * 100);
  if (label === "give space" || label === "give_space") return "Jenna: space requested";
  if (label === "asleep")                               return "Jenna: likely asleep";
  if (label === "unavailable")                          return "Jenna: offline";
  const suffix = uncertain ? ", uncertain" : "";
  return `Jenna ${label} (${pct}%${suffix})`;
}

function _hasActiveConsequence(consequenceContext) {
  if (!consequenceContext) return false;
  const { giveSpace, repairRequired, repairStarted, healing } = consequenceContext;
  return Boolean(giveSpace || repairRequired || repairStarted || healing);
}

function _reconcileRepairFromWorldModel(worldModelContext) {
  const repair = worldModelContext?.worldModel?.relationship?.repair_progress;
  if (!repair) return null;
  if (!Number.isFinite(repair.confidence) || repair.confidence < BELIEF_SURFACE_THRESHOLD) return null;
  if (repair.stale) return null;
  if (!repair.value || repair.value === "stable" || repair.value === "none") return null;
  return `Repair: ${repair.value}`;
}

function _reconcileHealth(worldModelContext, perceptionContext) {
  const wmHealth = worldModelContext?.worldModel?.dante?.runtime_health;
  if (wmHealth?.value === "degraded" && Number.isFinite(wmHealth.confidence) && wmHealth.confidence >= BELIEF_SURFACE_THRESHOLD && !wmHealth.stale) {
    return "Runtime degraded";
  }
  const pcHealth = perceptionContext?.worldState?.dante?.runtime_health;
  if (pcHealth === "degraded") {
    return "Runtime degraded";
  }
  return null;
}

module.exports = { reconcilePresencePrelude };
