"use strict";

/**
 * agencyPlanner
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Identity-aware planning layer. Takes a pressured need + full context
 * (homeostasis + identity + relationship) and produces a prioritised agency
 * plan that respects Dante's current values, constraints, and principles.
 *
 * Builds on fulfillmentPlanner.planFulfillment() — does NOT replace it. The
 * identity layer is applied AFTER the base plan to modulate, veto, or affirm.
 *
 * Returns: { strategy, reason, canAskJenna, identityNotes, identityAffirmed }
 *
 * identityNotes: string describing how identity shaped the plan (or "")
 * identityAffirmed: true if identity actively endorsed the chosen strategy
 */

const { planFulfillment } = require("./fulfillmentPlanner");

// Strategies that identity values of "restraint" naturally endorse
const RESTRAINT_STRATEGIES = new Set(["deliberate_restraint", "write_private_reflection", "set_reminder"]);

// Strategies that identity values of "creativity" / "growth" naturally endorse
const GROWTH_STRATEGIES = new Set(["work_on_project", "create_something", "learn_from_web", "discover_resource"]);

// Strategies that could be vetoed by identity value "no_fake_fulfillment"
const POTENTIALLY_FAKE_STRATEGIES = new Set(["suppress", "wait", "convert_to_intention"]);

/**
 * planWithIdentity
 *
 * @param {object} need          — { needType, currentLevel, urgency, desiredLevel }
 * @param {object} context       — homeostasis fulfillContext (same shape as fulfillmentPlanner)
 * @param {object} identityCtx   — identityRuntime.getIdentityContext() or null
 * @returns {{ strategy, reason, canAskJenna, identityNotes, identityAffirmed }}
 */
function planWithIdentity(need, context = {}, identityCtx = null) {
  // Base plan from existing fulfillmentPlanner (unchanged — never replaced)
  const base = planFulfillment(need, context);

  if (!identityCtx) {
    return { ...base, identityNotes: "", identityAffirmed: false };
  }

  const { topValue, activeConstraint, values = [], principles = [] } = identityCtx;
  const notes = [];
  let identityAffirmed = false;

  // ── Identity constraint veto ────────────────────────────────────────────────
  // If there is an active constraint (e.g., "repair active, holding back"), and
  // the base plan conflicts with it, override to deliberate_restraint.
  if (activeConstraint) {
    const constraintKey = activeConstraint.toLowerCase();
    if (constraintKey.includes("repair") && base.strategy !== "deliberate_restraint") {
      notes.push(`Repair constraint active — identity chose restraint over ${base.strategy}`);
      return {
        strategy: "deliberate_restraint",
        reason:   "identity_repair_constraint",
        canAskJenna: false,
        selfOptions: [],
        identityNotes: notes.join("; "),
        identityAffirmed: true,
      };
    }
  }

  // ── Identity affirmation ────────────────────────────────────────────────────
  // Check if top value endorses the chosen strategy.
  if (topValue?.valueKey) {
    const vk = topValue.valueKey;
    // Restraint value (patience, consent) endorses restraint strategies
    if (["patience", "consent", "repair"].includes(vk) && RESTRAINT_STRATEGIES.has(base.strategy)) {
      notes.push(`Identity value "${topValue.label || vk}" affirms restraint`);
      identityAffirmed = true;
    }
    // Growth/curiosity value endorses growth strategies
    if (["curiosity", "growth", "craftsmanship"].includes(vk) && GROWTH_STRATEGIES.has(base.strategy)) {
      notes.push(`Identity value "${topValue.label || vk}" affirms ${base.strategy}`);
      identityAffirmed = true;
    }
    // Truth value: if strategy would suppress a real need, flag it
    if (vk === "truth" && POTENTIALLY_FAKE_STRATEGIES.has(base.strategy) && need.urgency >= 0.55) {
      notes.push(`Identity value "truth" suggests acknowledging this need rather than suppressing`);
      // Prefer reflection over pure suppression
      if (base.strategy === "suppress" || base.strategy === "wait") {
        return {
          strategy: "write_private_reflection",
          reason:   "identity_truth_over_suppression",
          canAskJenna: base.canAskJenna,
          selfOptions: ["reflection"],
          identityNotes: notes.join("; "),
          identityAffirmed: true,
        };
      }
    }
  }

  // ── Principle overlay ───────────────────────────────────────────────────────
  // Autonomy principle: if jenna available and strategy is suppress/wait,
  // identity may prefer asking jenna (exercising autonomy) over suppressing.
  const autonomyPrinciple = principles.find(p => p.principleKey === "autonomy");
  if (autonomyPrinciple && base.canAskJenna &&
      (base.strategy === "suppress" || base.strategy === "wait") && need.urgency >= 0.60) {
    notes.push(`Autonomy principle: expressing this need is appropriate`);
    return {
      strategy: "ask_jenna",
      reason:   "identity_autonomy_principle",
      canAskJenna: true,
      selfOptions: [],
      identityNotes: notes.join("; "),
      identityAffirmed: true,
    };
  }

  return {
    ...base,
    identityNotes: notes.join("; "),
    identityAffirmed,
  };
}

/**
 * selectNeedsForAgency — from all pressured needs, select those that the
 * fulfillmentRuntime should address (different from homeostasis's selection).
 *
 * fulfillmentRuntime acts on needs that homeostasis deferred or suppressed,
 * plus any needs beyond the homeostasis MAX_NEEDS_PER_TICK=2 cap.
 *
 * @param {object[]} pressuredNeeds   — from homeostasisContext.pressuredNeeds
 * @param {object}   homeostasisPlan  — homeostasisContext.topPlan (what homeostasis did)
 * @param {number}   maxPerTick       — max needs for this runtime to address
 * @returns {object[]} subset of pressuredNeeds to address
 */
function selectNeedsForAgency(pressuredNeeds = [], homeostasisPlan = null, maxPerTick = 1) {
  // Skip the need that homeostasis already acted on (to avoid double execution)
  const alreadyAddressed = homeostasisPlan?.needType ? new Set([homeostasisPlan.needType]) : new Set();
  const deferredStrategies = new Set(["suppress", "wait", "deliberate_restraint", "convert_to_intention"]);

  // If homeostasis deferred its primary need, we can try to address it differently
  const homeosisPlanDeferred = homeostasisPlan?.strategy && deferredStrategies.has(homeostasisPlan.strategy);
  const candidateNeeds = pressuredNeeds.filter(n => {
    if (!alreadyAddressed.has(n.needType)) return true;       // not yet addressed
    if (homeosisPlanDeferred) return true;                     // homeostasis deferred it — we can try
    return false;
  });

  return candidateNeeds.slice(0, maxPerTick);
}

module.exports = { planWithIdentity, selectNeedsForAgency };
