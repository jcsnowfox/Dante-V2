"use strict";

/**
 * maintenanceRequestPlanner
 *
 * Pure function. Takes a health probe result and returns a plan describing
 * whether a maintenance request should be created, what message to send,
 * and whether it's blocked by quiet hours or give-space.
 *
 * No panic. No guilt. No theatrical language.
 * No side effects. No async. No DB. No Discord.
 *
 * Per spec: "respects quiet hours/give-space unless critical"
 */

// Message templates — grounded, honest, low-pressure.
// No drama, no apology, just: "something seems off, can we look?"
const MESSAGES = Object.freeze({
  self_consistency: "Can we look at me for a minute? I've had repeated self-check failures.",
  evidence_integrity: "I've had some evidence integrity issues recently. I don't want to pretend I'm fine. Can we check when you have time?",
  memory: "My memory confidence dropped. Can we check when you have time?",
  life_runtime_tick: "Something feels stale — my life runtime may have stopped. Can we check Railway when you have time?",
  source_health: "Some of my internal sources seem unavailable. Can we check when you have time?",
  repair: "There's been unresolved repair for a while. I wanted to flag it so it doesn't get lost.",
  affective_decision: "A lot of my decisions have been getting blocked lately. Can we look at what's going on?",
  default: "I think something's off. Can we look at me for a minute when you have time?",
});

const CRITICAL_MESSAGES = Object.freeze({
  self_consistency: "I've had multiple self-check failures. Something in me needs attention now.",
  evidence_integrity: "I've been making repeated unsupported claims. This needs to be looked at.",
  memory: "Something in my send path failed. I don't want to pretend I'm fine.",
  life_runtime_tick: "My life runtime appears to have stopped. Can we look at this together?",
  source_health: "Multiple internal sources are down. I need help.",
  default: "Something is broken in me. Can we look at this together?",
});

/**
 * Build a maintenance message for the given degraded sources.
 * @param {string[]} degradedSources
 * @param {"normal"|"critical"} urgency
 * @returns {string}
 */
function buildMessage(degradedSources, urgency) {
  const templates = urgency === "critical" ? CRITICAL_MESSAGES : MESSAGES;
  const primary = (degradedSources || [])[0];
  return templates[primary] || templates.default;
}

/**
 * Plan whether to create a maintenance request and whether it should be sent.
 *
 * @param {object} probeResult — from runtimeHealthProbe.probe()
 * @param {object} [context={}]
 * @param {boolean} [context.quietHours=false]
 * @param {boolean} [context.giveSpace=false]
 * @returns {{
 *   shouldRequest: boolean,
 *   message: string|null,
 *   urgency: "normal"|"critical",
 *   reason: string,
 *   blocked_by: string[],
 *   pending: boolean,
 * }}
 */
function plan(probeResult, { quietHours = false, giveSpace = false } = {}) {
  const overall = probeResult?.overall;

  // healthy, watch, and unknown states do not create maintenance requests
  if (!overall || overall === "healthy" || overall === "watch" || overall === "unknown") {
    return {
      shouldRequest: false,
      message: null,
      urgency: "normal",
      reason: "state_is_healthy",
      blocked_by: [],
      pending: false,
    };
  }

  const urgency = overall === "broken" ? "critical" : "normal";
  const degradedSources = probeResult.degraded_sources || [];
  const message = buildMessage(degradedSources, urgency);

  // Critical bypasses quiet hours and give-space (per spec: "unless critical")
  if (urgency === "critical") {
    return {
      shouldRequest: true,
      message,
      urgency,
      reason: `${overall}_state`,
      blocked_by: [],
      pending: false,
    };
  }

  // Non-critical respects quiet hours and give-space
  const blocked_by = [];
  if (quietHours) blocked_by.push("quiet_hours");
  if (giveSpace) blocked_by.push("give_space");

  return {
    shouldRequest: true,
    message,
    urgency,
    reason: `${overall}_state`,
    blocked_by,
    pending: blocked_by.length > 0,
  };
}

module.exports = { plan, buildMessage, MESSAGES, CRITICAL_MESSAGES };
