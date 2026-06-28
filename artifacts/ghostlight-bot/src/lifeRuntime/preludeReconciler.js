"use strict";

/**
 * preludeReconciler
 *
 * Canonical prompt-diet composer for overlapping presence/world signals.
 * Emits at most one line per fact category: availability, repair, runtime health,
 * and quiet hours. No confidence percentages or source metadata are surfaced.
 */

const { AVAILABILITY } = require("./presenceInterpreter");
const { BELIEF_SURFACE_THRESHOLD } = require("./worldBeliefResolver");

const MAX_LINE_LENGTH = 160;

function reconcilePresencePrelude({
  worldModelContext    = null,
  perceptionContext    = null,
  selfInspectionContext = null,
  consequenceContext   = null,
} = {}) {
  const lines = [];

  const giveSpaceActive = _detectGiveSpace(worldModelContext, perceptionContext, consequenceContext);
  if (giveSpaceActive) {
    lines.push("Availability: Jenna asked for space");
  } else {
    const availabilityLine = _reconcileAvailability(worldModelContext, perceptionContext);
    if (availabilityLine) lines.push(availabilityLine);
  }

  const activeConsequence = _hasActiveConsequence(consequenceContext);
  if (!activeConsequence) {
    const repairLine = _reconcileRepairFromWorldModel(worldModelContext);
    if (repairLine) lines.push(repairLine);
  }

  if (!selfInspectionContext?.preludeWarning) {
    const healthLine = _reconcileHealth(worldModelContext, perceptionContext);
    if (healthLine) lines.push(healthLine);
  }

  if (perceptionContext?.worldState?.environment?.quiet_hours) {
    lines.push("Quiet: quiet hours");
  }

  if (!lines.length) return null;
  return lines.map(line => line.slice(0, MAX_LINE_LENGTH)).join("\n");
}

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

  let wmValue = null, wmConf = 0;
  if (wm && Number.isFinite(wm.confidence) && wm.confidence >= BELIEF_SURFACE_THRESHOLD && !wm.stale && wm.value && wm.value !== "unknown") {
    wmValue = String(wm.value).replace(/_/g, " ");
    wmConf  = wm.confidence;
  }

  let pcValue = null, pcConf = 0;
  if (pc?.availability && pc.availability !== AVAILABILITY.UNKNOWN) {
    const raw = pc._confidence ?? 0;
    if (raw >= BELIEF_SURFACE_THRESHOLD) {
      pcValue = pc.availability;
      pcConf  = raw;
    }
  }

  if (!wmValue && !pcValue) return null;
  if (wmValue && !pcValue) return _formatAvailability(wmValue, false);
  if (!wmValue && pcValue) return _formatAvailability(String(pcValue).replace(/_/g, " "), false);

  const wmNorm = wmValue.toLowerCase().replace(/\s+/g, "_");
  const pcNorm = String(pcValue).toLowerCase().replace(/\s+/g, "_");
  if (wmNorm === pcNorm) return _formatAvailability(wmValue, false);

  const conflictConf = Math.max(0, Math.min(wmConf, pcConf) - 0.15);
  if (conflictConf < BELIEF_SURFACE_THRESHOLD) return "Availability: Jenna uncertain";
  return _formatAvailability(wmValue, true);
}

function _formatAvailability(label, uncertain) {
  const normal = String(label || "").replace(/_/g, " ");
  if (normal === "give space") return "Availability: Jenna asked for space";
  if (normal === "asleep") return "Availability: Jenna likely asleep";
  if (normal === "unavailable") return "Availability: Jenna offline";
  const suffix = uncertain ? ", uncertain" : "";
  return `Availability: Jenna ${normal}${suffix}`;
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
  return `Repair: ${String(repair.value).replace(/_/g, " ")}`;
}

function _reconcileHealth(worldModelContext, perceptionContext) {
  const wmHealth = worldModelContext?.worldModel?.dante?.runtime_health;
  if (wmHealth?.value === "degraded" && Number.isFinite(wmHealth.confidence) && wmHealth.confidence >= BELIEF_SURFACE_THRESHOLD && !wmHealth.stale) {
    return "Runtime health: degraded";
  }
  const pcHealth = perceptionContext?.worldState?.dante?.runtime_health;
  if (pcHealth === "degraded") return "Runtime health: degraded";
  return null;
}

module.exports = { reconcilePresencePrelude };
