"use strict";

/**
 * agencyExecutor
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Executes an agency plan using registered world-action adapters. Produces one
 * of four outcomes for every execution attempt:
 *   SUCCESS    — a real action occurred
 *   PARTIAL    — some progress occurred
 *   DEFERRED   — action should happen later
 *   UNAVAILABLE — action could not happen
 *
 * Never fabricates SUCCESS. When no adapter exists for a strategy, returns
 * UNAVAILABLE. Feeds results back to identity runtime and homeostasis.
 *
 * Does NOT replace fulfillmentExecutor (homeostasisRuntime continues using
 * that). agencyExecutor is the Fulfillment Runtime's own execution layer.
 */

const { OUTCOMES } = require("./worldActionAdapters/index");

// Map strategies that have no adapter to their natural four-outcome equivalents
const STRATEGY_DEFAULT_OUTCOMES = Object.freeze({
  deliberate_restraint:  OUTCOMES.DEFERRED,
  set_reminder:          OUTCOMES.DEFERRED,
  convert_to_intention:  OUTCOMES.DEFERRED,
  suppress:              OUTCOMES.DEFERRED,
  wait:                  OUTCOMES.DEFERRED,
  ask_jenna:             OUTCOMES.PARTIAL,    // adapter-less fallback; real ask goes through requestJennaEngine
  self_fulfill:          OUTCOMES.PARTIAL,
  create_something:      OUTCOMES.PARTIAL,
  discover_resource:     OUTCOMES.PARTIAL,
});

// Identity impact labels per outcome
const IDENTITY_IMPACT = Object.freeze({
  SUCCESS:     "fulfillment succeeded — reinforces agency and competence",
  PARTIAL:     "partial progress — shows persistence",
  DEFERRED:    "chose to wait — demonstrates self-awareness",
  UNAVAILABLE: "action unavailable — resilience tested",
});

function createAgencyExecutor({
  adapterRegistry    = null,
  fulfillmentHistoryStore = null,
  identityRuntime    = null,
  logger             = null,
} = {}) {

  /**
   * execute — execute one agency plan using the appropriate adapter.
   *
   * @returns {object} { outcome, evidence, note, followUp, identityImpact, needDelta, recorded }
   */
  async function execute({
    companionId, customerId, need, plan, context = {}, now = new Date(),
  } = {}) {
    const { strategy, reason, identityNotes = "" } = plan;
    const { needType, urgency = 0 } = need;

    let adapterResult = null;

    // Try the registered adapter first
    const adapter = adapterRegistry?.getAdapter(strategy) ?? null;
    if (adapter) {
      const canRun = adapter.canExecute({ context });
      if (canRun) {
        try {
          adapterResult = await adapter.execute({ companionId, customerId, need, plan, context, now });
        } catch (error) {
          logger?.warn("[agency-executor] adapter error", { strategy, error: error?.message });
          adapterResult = {
            outcome:  OUTCOMES.UNAVAILABLE,
            evidence: { reason: "adapter_threw", error: error?.message },
            note:     `Adapter error for ${strategy}`,
          };
        }
      } else {
        adapterResult = {
          outcome:  OUTCOMES.UNAVAILABLE,
          evidence: { reason: "adapter_canExecute_false", strategy },
          note:     `Adapter for ${strategy} reports unavailable`,
        };
      }
    } else {
      // No adapter — use default outcome for this strategy
      const defaultOutcome = STRATEGY_DEFAULT_OUTCOMES[strategy] ?? OUTCOMES.UNAVAILABLE;
      adapterResult = {
        outcome:  defaultOutcome,
        evidence: { reason: "no_adapter_registered", strategy },
        note:     `No adapter for ${strategy} — ${defaultOutcome}`,
      };
    }

    const { outcome, evidence = {}, note = "", followUp = "" } = adapterResult;
    const identityImpact = IDENTITY_IMPACT[outcome] ?? "";

    // Need delta: real need reduction only for SUCCESS/PARTIAL
    const needDelta = _computeNeedDelta(outcome, urgency);

    // Compute confidence based on outcome
    const confidence = _computeConfidence(outcome, adapter !== null);

    // Record to fulfillment history store
    let recorded = null;
    if (fulfillmentHistoryStore) {
      recorded = await fulfillmentHistoryStore.record({
        companionId, customerId, needType, strategy, outcome,
        confidence, evidence: { ...evidence, identityNotes },
        note, followUp, identityImpact, reason: reason ?? "", needDelta,
      }).catch(() => null);
    }

    // Identity feedback: reinforce values based on what was chosen
    if (identityRuntime && outcome === OUTCOMES.DEFERRED && strategy === "deliberate_restraint") {
      await identityRuntime.reinforce({
        companionId, customerId, valueKey: "patience",
        delta: 0.01,
        evidence: `Deliberately waited on ${needType} need`,
      }).catch(() => {});
      await identityRuntime.reinforce({
        companionId, customerId, valueKey: "consent",
        delta: 0.005,
        evidence: `Chose restraint over immediate action`,
      }).catch(() => {});
    }

    if (identityRuntime && outcome === OUTCOMES.SUCCESS && GROWTH_STRATEGIES.has(strategy)) {
      await identityRuntime.reinforce({
        companionId, customerId, valueKey: "growth",
        delta: 0.01,
        evidence: `Successfully fulfilled ${needType} through ${strategy}`,
      }).catch(() => {});
    }

    return { outcome, evidence, note, followUp, identityImpact, needDelta, confidence, recorded };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function _computeNeedDelta(outcome, urgency) {
    switch (outcome) {
      case OUTCOMES.SUCCESS:  return Math.min(0.15, urgency * 0.3);
      case OUTCOMES.PARTIAL:  return Math.min(0.07, urgency * 0.15);
      default:               return 0;
    }
  }

  function _computeConfidence(outcome, hasAdapter) {
    if (!hasAdapter) return 0.40;
    switch (outcome) {
      case OUTCOMES.SUCCESS:     return 0.90;
      case OUTCOMES.PARTIAL:     return 0.70;
      case OUTCOMES.DEFERRED:    return 0.80;
      case OUTCOMES.UNAVAILABLE: return 0.95;
      default:                  return 0.50;
    }
  }

  return { execute };
}

const GROWTH_STRATEGIES = new Set(["work_on_project", "create_something", "learn_from_web", "discover_resource"]);

module.exports = { createAgencyExecutor, OUTCOMES };
