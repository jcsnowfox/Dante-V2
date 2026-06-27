"use strict";

/**
 * decisionGuidanceBuilder
 *
 * Builds one compact prelude line from a resolved decision.
 * Returns null when no guidance is needed (act_now, unknown, silent types).
 *
 * Examples:
 *   "Decision: repair is prioritized over casual romance."
 *   "Decision: Dante is choosing restraint until Jenna is available."
 *   "Decision: romantic surprise delayed by quiet hours."
 */

const OUTCOME_LINES = Object.freeze({
  blocked: {
    identity_veto: "Decision: identity boundary prevents this action.",
    unresolved_repair: "Decision: repair is prioritized over casual romance.",
    user_unavailable: "Decision: Dante is waiting until Jenna is available.",
    default: "Decision: Dante is holding back.",
  },
  delay: {
    quiet_hours: "Decision: {type} delayed by quiet hours.",
    give_space: "Decision: Dante is choosing restraint until Jenna is available.",
    user_unavailable: "Decision: Dante is choosing restraint until Jenna is available.",
    recently_sent: "Decision: Dante is pacing himself.",
    default: "Decision: Dante is choosing to wait.",
  },
  suppress: {
    conversation_naturally_ended: "Decision: the conversation reached a natural ending.",
    default: "Decision: Dante is choosing silence.",
  },
  ask_first: {
    default: "Decision: Dante wants to check in before acting.",
  },
  reflect_private: {
    default: "Decision: Dante is reflecting privately.",
  },
  wait_for_context: {
    default: "Decision: Dante is waiting for more context.",
  },
});

const TYPE_LABELS = Object.freeze({
  repair_followup: "repair follow-up",
  romantic_surprise: "romantic surprise",
  ask_jenna: "ask",
  resource_discovery: "resource sharing",
  voice_note: "voice note",
  image_gesture: "image gesture",
  project_work: "project work",
  reflection: "reflection",
  conversation_followup: "conversation follow-up",
  silence: "silence",
  restraint: "restraint",
  maintenance_request: "maintenance request",
});

function buildDecisionGuidance(decision) {
  if (!decision) return null;

  const { outcome, decision_type, blocking_reasons = [] } = decision;

  if (!outcome || outcome === "act_now" || outcome === "unknown") return null;

  const typeLabel = TYPE_LABELS[decision_type] || (decision_type || "action").replace(/_/g, " ");

  const outcomeMap = OUTCOME_LINES[outcome];
  if (!outcomeMap) return null;

  // Find the first matching blocking reason
  for (const reason of (Array.isArray(blocking_reasons) ? blocking_reasons : [])) {
    if (outcomeMap[reason]) {
      return outcomeMap[reason].replace("{type}", typeLabel);
    }
  }

  return (outcomeMap.default || null)?.replace("{type}", typeLabel) || null;
}

module.exports = { buildDecisionGuidance };
