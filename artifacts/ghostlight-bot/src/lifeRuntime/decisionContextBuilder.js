"use strict";

const DECISION_TYPES = Object.freeze([
  "repair_followup",
  "romantic_surprise",
  "ask_jenna",
  "resource_discovery",
  "voice_note",
  "image_gesture",
  "project_work",
  "reflection",
  "conversation_followup",
  "silence",
  "restraint",
  "maintenance_request",
]);

const DECISION_OUTCOMES = Object.freeze([
  "act_now",
  "delay",
  "suppress",
  "ask_first",
  "reflect_private",
  "wait_for_context",
  "blocked",
  "unknown",
]);

/**
 * buildDecisionContext
 *
 * Assembles a single unified context snapshot from all subsystem states.
 * Pure and synchronous — all async resolution happens before calling this.
 * quietHours may be a boolean or a function(now) => boolean.
 */
function buildDecisionContext({
  homeostasisContext = null,
  identityContext = null,
  relationshipContext = null,
  relationshipLearningContext = null,
  consequenceContext = null,
  fulfillmentContext = null,
  conversationState = null,
  recentRuntimeEvents = [],
  selfConsistency = null,
  evidenceIntegrity = null,
  userAvailability = null,
  quietHours = false,
  giveSpace = false,
  recentActions = [],
  now = new Date(),
} = {}) {
  const safeNow = now instanceof Date ? now : new Date(now);
  const quietHoursActive =
    typeof quietHours === "function" ? Boolean(quietHours(safeNow)) : Boolean(quietHours);

  return {
    homeostasisContext: homeostasisContext || null,
    identityContext: identityContext || null,
    relationshipContext: relationshipContext || null,
    relationshipLearningContext: relationshipLearningContext || null,
    consequenceContext: consequenceContext || null,
    fulfillmentContext: fulfillmentContext || null,
    conversationState: conversationState || null,
    recentRuntimeEvents: Array.isArray(recentRuntimeEvents) ? recentRuntimeEvents : [],
    selfConsistency: selfConsistency || null,
    evidenceIntegrity: evidenceIntegrity || null,
    userAvailability: userAvailability || null,
    quietHours: quietHoursActive,
    giveSpace: Boolean(giveSpace),
    recentActions: Array.isArray(recentActions) ? recentActions : [],
    builtAt: safeNow.toISOString(),
  };
}

module.exports = { buildDecisionContext, DECISION_TYPES, DECISION_OUTCOMES };
