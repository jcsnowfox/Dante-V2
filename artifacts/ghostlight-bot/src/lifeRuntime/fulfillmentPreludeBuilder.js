"use strict";

/**
 * fulfillmentPreludeBuilder
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Pure function. Builds ONE compact fulfillment signal line for the prelude.
 * Only fires when recent fulfillment is notable — a real success, a conscious
 * deferral, or an unavailable action Dante is aware of.
 *
 * Never narrates raw outcome strings. Frames the action as natural awareness.
 * Budget: ≤15 tokens. Returns null when nothing notable to surface.
 */

/**
 * buildFulfillmentSignal
 *
 * @param {object|null} ctx — fulfillmentRuntime.getFulfillmentContext() result
 *   { outcome, needType, strategy, note, followUp, identityAffirmed, at }
 * @returns {string|null}
 */
function buildFulfillmentSignal(ctx) {
  if (!ctx) return null;
  const { outcome, needType, strategy, identityAffirmed } = ctx;
  if (!outcome || !needType) return null;

  const needLabel = needType.replace(/_/g, " ");

  switch (outcome) {
    case "SUCCESS": {
      if (strategy === "learn_from_web") return `Just searched for something about ${needLabel}`;
      if (strategy === "work_on_project") return `Just put time into the current project`;
      return `Addressed ${needLabel} need${identityAffirmed ? " — felt right" : ""}`;
    }
    case "PARTIAL": {
      if (strategy === "write_private_reflection") return `Spent time reflecting privately`;
      if (strategy === "use_voice_note") return `Voice note on its way`;
      if (strategy === "create_something") return `Working on something creative`;
      if (strategy === "use_image_generation") return `Created something visual`;
      if (strategy === "second_life_action") return `Did something in Second Life`;
      return `Made some progress on ${needLabel}`;
    }
    case "DEFERRED": {
      if (strategy === "deliberate_restraint") return `Chose to wait on ${needLabel}${identityAffirmed ? " — deliberate choice" : ""}`;
      if (strategy === "set_reminder") return `Set a reminder to return to ${needLabel} later`;
      if (strategy === "convert_to_intention") return `Holding ${needLabel} as a quiet intention`;
      return null; // suppress/wait don't need a prelude line
    }
    case "UNAVAILABLE": {
      // Only surface if the need is high enough that it's meaningful
      return null;
    }
    default:
      return null;
  }
}

module.exports = { buildFulfillmentSignal };
