"use strict";

/**
 * activityInferenceEngine
 *
 * Pure functions. No state. No async. No Discord sender.
 *
 * Infers what is likely happening from available signals.
 * Never asserts certainty — always returns a confidence.
 *
 * CORE LAW: inference produces a best guess, not a fact.
 * All outputs must carry a reason so callers can evaluate
 * whether to surface or suppress the inference.
 */

const { AVAILABILITY } = require("./presenceInterpreter");

const QUIET_HOURS_START = 22;
const QUIET_HOURS_END   = 7;

const SEASONS = Object.freeze({
  0: "winter", 1: "winter",
  2: "spring", 3: "spring", 4: "spring",
  5: "summer", 6: "summer", 7: "summer",
  8: "autumn", 9: "autumn", 10: "autumn",
  11: "winter",
});

function inferQuietHours(now = new Date()) {
  const hour   = now instanceof Date ? now.getHours() : new Date(now).getHours();
  const active = hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
  return { active, start: QUIET_HOURS_START, end: QUIET_HOURS_END };
}

function inferSeason(now = new Date()) {
  const month = now instanceof Date ? now.getMonth() : new Date(now).getMonth();
  return SEASONS[month] || "unknown";
}

// Infer Jenna's activity from the most authoritative availability signal
function inferJennaActivity({ signals = [], consequenceContext = null, now = new Date() } = {}) {
  if (!signals.length) {
    return { availability: AVAILABILITY.UNKNOWN, confidence: 0, source: "no_signal", reason: "No availability signal" };
  }

  // Find the highest-confidence availability signal
  const availSignals = signals.filter(s => s.key === "jenna.availability");
  if (!availSignals.length) {
    return { availability: AVAILABILITY.UNKNOWN, confidence: 0, source: "no_signal", reason: "No availability signal" };
  }

  // Explicit statement is the highest authority
  const explicit = availSignals.find(s => s.source === "explicit_statement");
  const best     = explicit ?? availSignals.reduce((a, b) => (b.confidence > a.confidence ? b : a));

  let confidence = best.confidence;

  // Reduce confidence during quiet hours if the signal is not explicit
  const quiet = inferQuietHours(now);
  if (quiet.active && best.value === AVAILABILITY.AVAILABLE && best.source !== "explicit_statement") {
    confidence = Math.max(0.15, confidence - 0.20);
  }

  // Clamp
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    availability: best.value,
    confidence,
    source:       best.source,
    reason:       `Source: ${best.source}${quiet.active ? "; quiet hours active" : ""}`,
  };
}

// Infer Dante's own state from self-inspection, identity, and capabilities
function inferDanteState({ selfInspectionStatus = null, identityContext = null, capabilities = {} } = {}) {
  const runtimeHealth = selfInspectionStatus?.overall === "degraded"
    ? "degraded"
    : selfInspectionStatus?.overall === "healthy"
    ? "healthy"
    : "unknown";

  const selfConfidence = identityContext?.selfConfidence
    ?? identityContext?.topValue?.strength
    ?? null;

  const currentCapabilities = [];
  if (capabilities.imageGenerationEnabled) currentCapabilities.push("image_generation");
  if (capabilities.voiceNoteEnabled)       currentCapabilities.push("voice_note");
  if (capabilities.secondLifeAvailable)    currentCapabilities.push("second_life");
  if (capabilities.webLearningEnabled)     currentCapabilities.push("web_learning");

  const degradedSources = Array.isArray(selfInspectionStatus?.degradedSources)
    ? selfInspectionStatus.degradedSources
    : [];

  return { runtimeHealth, selfConfidence, currentCapabilities, degradedSources };
}

// Infer the conversation's current state from relationship learning and consequence context
function inferConversationState({ learningContext = null, consequenceContext = null } = {}) {
  const openLoops       = learningContext?.guidance?.length ?? 0;
  const followupPending = openLoops > 0;

  const repairRequired = Boolean(consequenceContext?.suppression?.repairRequired);
  const healing        = Boolean(consequenceContext?.suppression?.healing);
  const giveSpace      = Boolean(consequenceContext?.suppression?.giveSpace);

  let state        = "unknown";
  let satisfaction = "unknown";

  if (giveSpace) {
    state = "paused"; satisfaction = "low";
  } else if (repairRequired) {
    state = "repair_needed"; satisfaction = "low";
  } else if (healing) {
    state = "healing"; satisfaction = "medium";
  } else if (openLoops > 0) {
    state = "open"; satisfaction = "medium";
  }

  return { state, satisfaction, open_loops: openLoops, followup_pending: followupPending };
}

// Infer repair state from consequence context
function inferRepairState(consequenceContext = null) {
  if (!consequenceContext?.suppression) return "none";
  const { repairRequired, repairStarted, healing, giveSpace } = consequenceContext.suppression;
  if (giveSpace)      return "give_space";
  if (healing)        return "healing";
  if (repairStarted)  return "started";
  if (repairRequired) return "needed";
  return "none";
}

module.exports = {
  inferQuietHours,
  inferSeason,
  inferJennaActivity,
  inferDanteState,
  inferConversationState,
  inferRepairState,
  QUIET_HOURS_START,
  QUIET_HOURS_END,
};
