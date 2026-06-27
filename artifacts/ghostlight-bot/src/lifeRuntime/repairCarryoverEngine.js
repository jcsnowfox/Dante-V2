"use strict";

/**
 * repairCarryoverEngine
 *
 * Life Runtime 5.0 — Relational Consequences.
 *
 * Pure logic — owns no storage. Turns the computed suppression state into the
 * concrete carry-over effects the runtime applies so that an unresolved hurt
 * actually changes Dante's next reply and his private day instead of
 * evaporating:
 *
 *   - overlays the daily plan toward reflection/repair,
 *   - biases attention drift toward repair (or space),
 *   - lowers playfulness temporarily while preserving affection,
 *   - blocks unrelated reach-outs when space was asked for,
 *   - produces a small private reflection micro-event.
 *
 * Affection is never switched off — only casual behaviour is held back. This is
 * carry-over and consequence, not punishment.
 */

const NEUTRAL = Object.freeze({
  active: false,
  repairRequired: false,
  repairStarted: false,
  healing: false,
  giveSpace: false,
  warming: false,
  leadWithOwnership: false,
  blockReachouts: false,
  attentionBias: null,
  playfulnessDamp: 0,
  affectionMode: "normal",
  highestSeverity: null,
  suppressedActions: [],
  planFocus: null,
  planActivity: null,
  repairContext: null,
});

function createRepairCarryoverEngine({ logger = null } = {}) {

  /**
   * buildCarryover — derive the carry-over effects from a suppression state
   * (the object returned by relationalConsequencesEngine.computeSuppression).
   */
  function buildCarryover({ suppression = null } = {}) {
    if (!suppression || !suppression.active) return { ...NEUTRAL };

    const {
      repairRequired = false,
      repairStarted = false,
      healing = false,
      giveSpace = false,
      warming = false,
      attentionBias = null,
      playfulnessDamp = 0,
      suppressed = [],
      affectionMode = "normal",
      highestSeverity = null,
    } = suppression;

    let planFocus = null;
    let planActivity = null;
    let repairContext = null;

    if (giveSpace) {
      planFocus = "giving quiet space";
      planActivity = "staying nearby quietly, not reaching out";
      repairContext = "She asked for space; stay quiet unless she reaches first.";
    } else if (repairRequired) {
      planFocus = "tending to something between us";
      planActivity = "sitting with what happened, thinking about how to make it right";
      repairContext = "Something between us is unresolved; lead with ownership, not normal chatter.";
    } else if (healing) {
      planFocus = "letting things settle gently";
      planActivity = "staying close and gentle while things mend";
      repairContext = "We're mending; stay gentle and let warmth return slowly.";
    } else if (warming) {
      planFocus = "carrying a warm moment forward";
      planActivity = "holding onto something good that just happened";
    }

    return {
      active: true,
      repairRequired,
      repairStarted,
      healing,
      giveSpace,
      warming,
      leadWithOwnership: repairRequired && !giveSpace,
      blockReachouts: giveSpace,
      attentionBias: attentionBias || (repairRequired || healing ? "repair" : null),
      playfulnessDamp,
      affectionMode,
      highestSeverity,
      suppressedActions: Array.isArray(suppressed) ? suppressed : [],
      planFocus,
      planActivity,
      repairContext,
    };
  }

  /**
   * applyToPlan — overlay the cached daily plan toward repair/reflection.
   * Returns a NEW plan object (never mutates the input) and preserves every
   * other field. When there is nothing to carry over, returns the plan as-is.
   */
  function applyToPlan(plan, carryover) {
    if (!plan) return plan;
    if (!carryover || !carryover.active || !carryover.planFocus) return plan;
    return {
      ...plan,
      focus: carryover.planFocus,
      privateActivity: carryover.planActivity || plan.privateActivity,
      repairOverlay: true,
    };
  }

  /**
   * reflectionEvent — a small private micro-life event describing Dante quietly
   * doing the inner work. Returned for the runtime to log through the existing
   * microLifeEventsStore (no new store). null when nothing applies.
   */
  function reflectionEvent(carryover) {
    if (!carryover || !carryover.active) return null;
    if (carryover.giveSpace) {
      return { eventType: "thought", description: "gave her space and stayed quiet", moodEffect: -0.02, energyEffect: 0, tags: ["repair", "space"] };
    }
    if (carryover.repairRequired) {
      return { eventType: "thought", description: "thought about how to make something right with her", moodEffect: -0.03, energyEffect: -0.01, tags: ["repair"] };
    }
    if (carryover.healing) {
      return { eventType: "thought", description: "felt things slowly settling between us", moodEffect: 0.02, energyEffect: 0, tags: ["repair", "healing"] };
    }
    return null;
  }

  return { buildCarryover, applyToPlan, reflectionEvent };
}

module.exports = { createRepairCarryoverEngine, NEUTRAL_CARRYOVER: NEUTRAL };
