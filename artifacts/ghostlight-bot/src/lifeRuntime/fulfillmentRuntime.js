"use strict";

/**
 * fulfillmentRuntime
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Orchestrates Dante's proactive agency layer. On every tick (called by
 * lifeRuntime after _tickHomeostasis and _tickIdentity):
 *
 *   1. Reads homeostasis context to find needs the homeostasis runtime
 *      has deferred, suppressed, or not yet addressed.
 *   2. Runs agencyPlanner (identity-aware) to produce enhanced plans.
 *   3. Executes via agencyExecutor (adapter-based, four-outcome model).
 *   4. Records rich evidence to fulfillmentHistoryStore.
 *   5. Feeds results back to identity runtime.
 *   6. Manages personal resource library through resourceDiscoveryRuntime.
 *   7. Caches fulfillmentContext for the life prelude signal.
 *
 * Hard rules:
 *   - Does NOT replace homeostasisRuntime (which handles reactive needs).
 *   - Does NOT create a new scheduler (ticked by lifeRuntime).
 *   - Does NOT create a new Discord sender.
 *   - Does NOT duplicate fulfillmentExecutor (uses adapters instead).
 *   - Never fabricates SUCCESS — all outcomes backed by evidence.
 *   - Max 1 proactive action per tick (homeostasis has max 2).
 */

const { planWithIdentity, selectNeedsForAgency } = require("./agencyPlanner");
const { createAgencyExecutor }                    = require("./agencyExecutor");
const { createAdapterRegistry }                   = require("./worldActionAdapters/index");
const { webSearchAdapter }                        = require("./worldActionAdapters/webSearchAdapter");
const { reflectionAdapter }                       = require("./worldActionAdapters/reflectionAdapter");
const { projectAdapter }                          = require("./worldActionAdapters/projectAdapter");
const { voiceNoteAdapter }                        = require("./worldActionAdapters/voiceNoteAdapter");
const { imageGenerationAdapter }                  = require("./worldActionAdapters/imageGenerationAdapter");
const { secondLifeAdapter }                       = require("./worldActionAdapters/secondLifeAdapter");

const MAX_AGENCY_PER_TICK = 1;   // proactive actions per tick

function createFulfillmentRuntime({
  config                  = {},
  logger                  = null,
  fulfillmentHistoryStore = null,
  resourceLibraryStore    = null,
  resourceDiscoveryRuntime = null,
  identityRuntime         = null,
  homeostasisRuntime      = null, // read-only: getNeedsContext()
} = {}) {
  let _fulfillmentContext = null;
  let _lastTickAt        = null;
  let _lastActionAt      = null;

  // Build adapter registry from all registered adapters
  const _adapterRegistry = createAdapterRegistry([
    webSearchAdapter,
    reflectionAdapter,
    projectAdapter,
    voiceNoteAdapter,
    imageGenerationAdapter,
    secondLifeAdapter,
  ]);

  // Build the executor
  const _executor = createAgencyExecutor({
    adapterRegistry: _adapterRegistry,
    fulfillmentHistoryStore,
    identityRuntime,
    logger,
  });

  async function init() {
    if (fulfillmentHistoryStore?.init)    await fulfillmentHistoryStore.init().catch(() => {});
    if (resourceLibraryStore?.init)       await resourceLibraryStore.init().catch(() => {});
    if (resourceDiscoveryRuntime?.init)   await resourceDiscoveryRuntime.init().catch(() => {});
  }

  /**
   * tick — called by lifeRuntime._tickFulfillment(now) after identity tick.
   *
   * @param {object} params
   *   companionId / customerId   — scope
   *   now                        — current Date
   *   homeostasisContext         — from homeostasisRuntime.getNeedsContext()
   *   identityContext            — from identityRuntime.getIdentityContext()
   *   fulfillContext             — homeostasis fulfillment context (capabilities)
   */
  async function tick({
    companionId,
    customerId,
    now = new Date(),
    homeostasisContext = null,
    identityContext    = null,
    fulfillContext     = {},
  } = {}) {
    if (!companionId) return;
    _lastTickAt = now;

    // ── 1. Find pressured needs to address ─────────────────────────────────
    const pressuredNeeds = homeostasisContext?.pressuredNeeds ?? [];
    const topPlan        = homeostasisContext?.topPlan        ?? null;

    if (pressuredNeeds.length === 0) {
      _updateFulfillmentContext({ outcome: null, needType: null, strategy: null });
      return;
    }

    // Build full need objects (homeostasisContext.needs has levels)
    const allNeeds = homeostasisContext?.needs ?? [];
    const needObjects = pressuredNeeds.map(pn => {
      const full = allNeeds.find(n => n.needType === pn.needType);
      return {
        needType:     pn.needType,
        urgency:      pn.urgency,
        currentLevel: full?.currentLevel ?? (1 - pn.urgency),
        desiredLevel: full?.desiredLevel ?? 0.65,
      };
    });

    // Select which needs to address (avoids double-execution with homeostasis)
    const toAddress = selectNeedsForAgency(needObjects, topPlan, MAX_AGENCY_PER_TICK);

    if (toAddress.length === 0) {
      _updateFulfillmentContext({ outcome: null, needType: null, strategy: null });
      return;
    }

    // ── 2. Plan + execute each need ─────────────────────────────────────────
    let lastResult = null;
    for (const need of toAddress) {
      const plan = planWithIdentity(need, fulfillContext, identityContext);

      const result = await _executor.execute({
        companionId, customerId, need, plan, context: {
          ...fulfillContext,
          activeProject: fulfillContext?.activeProject ?? null,
          hasActiveProject: Boolean(fulfillContext?.activeProject),
          attentionFocus: fulfillContext?.attentionFocus ?? null,
          recentInterest: fulfillContext?.recentInterest ?? null,
        },
        now,
      }).catch(err => {
        logger?.warn("[fulfillment-runtime] execute error", {
          needType: need.needType, strategy: plan.strategy, error: err?.message,
        });
        return null;
      });

      if (result) {
        lastResult = { need, plan, result };
        if (result.outcome === "SUCCESS" || result.outcome === "PARTIAL") {
          _lastActionAt = now;
        }
      }
    }

    // ── 3. Update fulfillment context for prelude ───────────────────────────
    if (lastResult) {
      _updateFulfillmentContext({
        outcome:     lastResult.result.outcome,
        needType:    lastResult.need.needType,
        strategy:    lastResult.plan.strategy,
        note:        lastResult.result.note,
        followUp:    lastResult.result.followUp,
        identityAffirmed: lastResult.plan.identityAffirmed ?? false,
      });
    } else {
      _updateFulfillmentContext({ outcome: null, needType: null, strategy: null });
    }
  }

  function _updateFulfillmentContext({ outcome, needType, strategy, note = "", followUp = "", identityAffirmed = false }) {
    if (!outcome) {
      _fulfillmentContext = null;
      return;
    }
    _fulfillmentContext = { outcome, needType, strategy, note, followUp, identityAffirmed, at: _lastTickAt };
  }

  /**
   * getFulfillmentContext — snapshot for lifePreludeBuilder.
   * Returns null when nothing notable to surface.
   */
  function getFulfillmentContext() {
    return _fulfillmentContext;
  }

  function getStatus() {
    return {
      lastTickAt:         _lastTickAt?.toISOString()   ?? null,
      lastActionAt:       _lastActionAt?.toISOString() ?? null,
      fulfillmentContext: _fulfillmentContext
        ? {
            outcome:         _fulfillmentContext.outcome,
            needType:        _fulfillmentContext.needType,
            strategy:        _fulfillmentContext.strategy,
            identityAffirmed: _fulfillmentContext.identityAffirmed ?? false,
          }
        : null,
      adapters: _adapterRegistry.listAdapters(),
    };
  }

  async function pruneAll({ companionId, customerId } = {}) {
    const [h, r] = await Promise.all([
      fulfillmentHistoryStore?.pruneOlderThan?.({ companionId, customerId, days: 30 }).catch(() => 0) ?? Promise.resolve(0),
      resourceDiscoveryRuntime?.pruneOlderThan?.({ companionId, customerId, days: 180 }).catch(() => 0) ?? Promise.resolve(0),
    ]);
    return { historyPruned: h, resourcesPruned: r };
  }

  return { init, tick, getFulfillmentContext, getStatus, pruneAll };
}

module.exports = { createFulfillmentRuntime };
