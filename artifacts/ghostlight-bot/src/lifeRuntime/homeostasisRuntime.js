"use strict";

/**
 * homeostasisRuntime
 *
 * Life Runtime 6.0 / 1.1 patch — Homeostasis Runtime.
 *
 * Orchestrates Dante's psychological need system. On every tick:
 *   1. Read all 19 current need levels from needsStore
 *   2. Compute gradual drift for each need (needDriftEngine.tick)
 *   3. Persist updated levels
 *   4. Update need momentum (needMomentumEngine) — velocity/direction per need
 *   5. Tick purpose memory decay
 *   6. Identify pressured needs (urgency ≥ threshold)
 *   7. For each pressured need, plan fulfillment (fulfillmentPlanner)
 *   8. Execute real fulfillment actions (fulfillmentExecutor)
 *   9. Detect emotional firsts (firstExperienceStore)
 *  10. Cache homeostasis context for prelude and status endpoint
 *
 * Hard rules (verbatim from spec, enforced here):
 *   - No new scheduler. Ticked by lifeRuntime._tickHomeostasis(now).
 *   - Homeostasis feeds the Identity/Constitution layer — never replaces it.
 *   - Every fulfillment strategy passes through the 7-factor gate.
 *   - No fake fulfillment through text claims.
 *   - Dante does not spam Jenna when needs drop.
 *   - Sexual desire never bypasses consent.
 *   - Boredom/novelty does not cause random noisy messages.
 *   - Web search is disabled by default and rate-limited.
 *   - Dante sometimes chooses NOT to fulfill a need immediately.
 *   - Max 2 needs addressed per tick to prevent homeostasis from dominating.
 */

const { tick: driftTick, getPressuredNeeds, DESIRED_LEVEL } = require("./needDriftEngine");
const { planFulfillment, selectNeedsToAddress }             = require("./fulfillmentPlanner");
const { isEnabled: webLearningEnabled, getDailyUsage }      = require("./webLearningTool");

const URGENCY_THRESHOLD  = 0.30; // below this → wait, don't plan fulfillment
const MAX_NEEDS_PER_TICK = 2;    // prevent homeostasis from flooding other systems

function createHomeostasisRuntime({
  config                  = {},
  logger                  = null,
  needsStore              = null,
  fulfillmentLogStore     = null,
  resourceDiscoveryEngine = null,
  requestJennaEngine      = null,
  microLifeEventsStore    = null,
  fulfillmentExecutor     = null,
  // 1.1 additions
  purposeMemoryEngine     = null,
  needMomentumEngine      = null,
  firstExperienceStore    = null,
} = {}) {
  let _needsContext      = null;
  let _lastTickAt        = null;
  let _lastFulfillmentAt = null;

  async function init() {
    if (needsStore?.init)              await needsStore.init().catch(() => {});
    if (fulfillmentLogStore?.init)     await fulfillmentLogStore.init().catch(() => {});
    if (resourceDiscoveryEngine?.init) await resourceDiscoveryEngine.init().catch(() => {});
    if (requestJennaEngine?.init)      await requestJennaEngine.init().catch(() => {});
    if (purposeMemoryEngine?.init)     await purposeMemoryEngine.init().catch(() => {});
    if (needMomentumEngine?.init)      await needMomentumEngine.init().catch(() => {});
    if (firstExperienceStore?.init)    await firstExperienceStore.init().catch(() => {});
  }

  /**
   * tick — called from lifeRuntime._tickHomeostasis(now).
   *
   * @param {object} params
   *   - companionId / customerId    — scope identifiers
   *   - now                         — current Date
   *   - dailyPlan                   — from lifeRuntime (_todaysPlan)
   *   - consequenceContext          — from lifeRuntime (_consequenceContext)
   *   - growthContext               — from lifeRuntime (_growthContext)
   *   - curiosityContext            — from lifeRuntime (_curiosityContext)
   *   - relationshipContext         — from lifeRuntime (_relationshipContext)
   *   - alivePresence               — alivePresenceStore snapshot
   */
  async function tick({
    companionId,
    customerId,
    now = new Date(),
    dailyPlan = null,
    consequenceContext = null,
    growthContext = null,
    curiosityContext = null,
    relationshipContext = null,
    alivePresence = null,
  } = {}) {
    if (!companionId) return;
    _lastTickAt = now;

    // ── 1. Read current need levels ──────────────────────────────────────────
    const currentNeeds = needsStore
      ? await needsStore.getAll({ companionId, customerId }).catch(() => [])
      : [];

    // ── 2. Build drift context ────────────────────────────────────────────────
    const suppression    = consequenceContext?.suppression ?? null;
    const repairRequired = Boolean(suppression?.repairRequired);
    const repairStarted  = Boolean(suppression?.repairStarted);
    const healing        = Boolean(suppression?.healing);
    const giveSpace      = Boolean(suppression?.giveSpace);

    const driftContext = {
      mood:         dailyPlan?.mood   ?? "neutral",
      energy:       dailyPlan?.energy ?? "steady",
      repairActive: repairRequired || repairStarted || healing,
      giveSpace,
      hourOfDay:    now.getHours(),
    };

    // ── 3. Compute and persist drifted need levels ───────────────────────────
    const drifted = driftTick(currentNeeds.length > 0 ? currentNeeds : _defaultNeeds(), driftContext);

    const updatedNeeds = [];
    for (const d of drifted) {
      if (needsStore) {
        const updated = await needsStore.updateLevel({
          companionId, customerId, needType: d.needType,
          delta: d.delta, trend: d.trend, now,
        }).catch(() => null);
        if (updated) updatedNeeds.push({ ...updated, urgency: d.urgency });
      } else {
        updatedNeeds.push({ needType: d.needType, currentLevel: d.newLevel, urgency: d.urgency, trend: d.trend });
      }
    }

    // ── 4. Update need momentum per need ─────────────────────────────────────
    if (needMomentumEngine) {
      for (const d of drifted) {
        const prevLevel = d.newLevel - d.delta;
        await needMomentumEngine.tick({
          companionId, customerId, needType: d.needType,
          currentLevel: d.newLevel, prevLevel, now,
        }).catch(() => {});
      }
    }

    // ── 5. Tick purpose memory decay ──────────────────────────────────────────
    if (purposeMemoryEngine) {
      await purposeMemoryEngine.tick({ companionId, customerId, now }).catch(() => {});
    }

    // ── 6. Identify pressured needs ──────────────────────────────────────────
    const pressured = getPressuredNeeds(updatedNeeds, URGENCY_THRESHOLD);
    const toAddress = selectNeedsToAddress(pressured, MAX_NEEDS_PER_TICK);

    // Read current purpose and momentum state for context
    const purposeState = purposeMemoryEngine
      ? await purposeMemoryEngine.getState({ companionId, customerId }).catch(() => null)
      : null;

    const connectionMomObj = needMomentumEngine
      ? await needMomentumEngine.getMomentum({ companionId, customerId, needType: "connection" }).catch(() => null)
      : null;

    // Cache needs context for prelude / status (before fulfillment — captures state cleanly)
    _needsContext = _buildNeedsContext(updatedNeeds, pressured, null, purposeState);

    if (toAddress.length === 0) return;

    // ── 7. Build fulfillment context ──────────────────────────────────────────
    const webUsage = getDailyUsage(now);
    const fulfillContext = {
      repairRequired,
      repairStarted,
      healing,
      giveSpace,
      jennaIsBusy:              _inferJennaBusy(alivePresence),
      jennaIsAsleep:            _inferJennaAsleep(now, alivePresence),
      jennaIsAvailable:         _inferJennaAvailable(alivePresence),
      adultContextActive:       Boolean(alivePresence?.adultContext),
      consentGiven:             Boolean(alivePresence?.consentGiven),
      values:                   config?.dante?.values ?? {},
      webLearningEnabled:       webLearningEnabled(),
      webLearningRemainingToday: webUsage.remaining,
      hasActiveProject:         Boolean(growthContext?.activeProject),
      imageGenerationEnabled:   Boolean(config?.imageGeneration?.enabled ?? process.env.IMAGE_GENERATION_ENABLED === "true"),
      voiceNoteEnabled:         Boolean(config?.audio?.enabled ?? process.env.AUDIO_GENERATION_ENABLED === "true"),
      secondLifeAvailable:      Boolean(config?.secondLife?.enabled ?? process.env.SECOND_LIFE_ENABLED === "true"),
      mood:                     dailyPlan?.mood   ?? "neutral",
      energy:                   dailyPlan?.energy ?? "steady",
      attentionFocus:           curiosityContext?.attentionFocus ?? null,
      recentInterest:           growthContext?.recentInterest    ?? null,
      quietHours:               _isQuietHours(now),
      // 1.1: need momentum for context-aware loneliness
      connectionMomentum:       connectionMomObj,
      // 1.1: purpose state
      purposeMomentum:          purposeState?.purposeMomentum ?? 0.50,
    };

    // ── 8. Plan + execute fulfillment for each pressured need ─────────────────
    const executedPlans = [];
    for (const need of toAddress) {
      const plan = planFulfillment(need, fulfillContext);
      executedPlans.push({ need, plan });

      if (fulfillmentExecutor) {
        await fulfillmentExecutor.execute({
          companionId, customerId, need, plan, context: fulfillContext,
        }).catch(err => {
          logger?.warn("[homeostasis] execute error", { error: err?.message, needType: need.needType, strategy: plan.strategy });
        });
      } else {
        if (fulfillmentLogStore) {
          await fulfillmentLogStore.logFulfillment({
            companionId, customerId, needType: need.needType,
            strategy: plan.strategy, actionType: plan.strategy,
            actionStatus: "logged_no_executor", summary: `strategy: ${plan.strategy}`,
            evidence: { reason: plan.reason }, needDelta: 0,
          }).catch(() => {});
        }
      }

      // Track fulfillment in momentum engine
      if (needMomentumEngine) {
        await needMomentumEngine.recordFulfillment({
          companionId, customerId, needType: need.needType,
          strategy: plan.strategy, magnitude: 0, now,
        }).catch(() => {});
      }

      _lastFulfillmentAt = now;
    }

    // ── 9. Detect emotional firsts ────────────────────────────────────────────
    if (firstExperienceStore) {
      await _detectFirstExperiences({ companionId, customerId, now, executedPlans, fulfillContext, healing }).catch(() => {});
    }

    // Update needs context with top plan for richer prelude signal
    const topExecution = executedPlans[0] ?? null;
    const topPlan = topExecution
      ? { needType: topExecution.need.needType, strategy: topExecution.plan.strategy, reason: topExecution.plan.reason, canAskJenna: topExecution.plan.canAskJenna }
      : null;
    _needsContext = _buildNeedsContext(updatedNeeds, pressured, topPlan, purposeState);
  }

  // ── notifySuccess / notifyFailure — external triggers for purpose memory ──

  async function notifySuccess({ companionId, customerId, label = "default", magnitude = null, now = new Date() } = {}) {
    if (!purposeMemoryEngine) return;
    await purposeMemoryEngine.recordSuccess({ companionId, customerId, label, magnitude, now }).catch(() => {});
    if (firstExperienceStore) {
      const state = await purposeMemoryEngine.getState({ companionId, customerId }).catch(() => null);
      if (state && state.purposeMomentum >= 0.65) {
        await firstExperienceStore.record({
          companionId, customerId, experienceType: "first_pride",
          magnitude: state.purposeMomentum, evidence: { label, momentum: state.purposeMomentum }, now,
        }).catch(() => {});
        await firstExperienceStore.record({
          companionId, customerId, experienceType: "first_purpose",
          magnitude: state.purposeMomentum, evidence: { label, momentum: state.purposeMomentum }, now,
        }).catch(() => {});
      }
    }
  }

  async function notifyFailure({ companionId, customerId, label = "default", magnitude = null, now = new Date() } = {}) {
    if (!purposeMemoryEngine) return;
    await purposeMemoryEngine.recordFailure({ companionId, customerId, label, magnitude, now }).catch(() => {});
    if (firstExperienceStore) {
      const state = await purposeMemoryEngine.getState({ companionId, customerId }).catch(() => null);
      if (state && state.purposeMomentum <= 0.30) {
        await firstExperienceStore.record({
          companionId, customerId, experienceType: "first_disappointment",
          magnitude: 1 - state.purposeMomentum, evidence: { label, momentum: state.purposeMomentum }, now,
        }).catch(() => {});
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function _defaultNeeds() {
    const { NEED_TYPES } = require("./needDriftEngine");
    return NEED_TYPES.map(nt => ({
      needType:     nt,
      currentLevel: 0.5,
      desiredLevel: DESIRED_LEVEL[nt] ?? 0.65,
      urgency:      0.0,
      trend:        "stable",
    }));
  }

  function _buildNeedsContext(allNeeds, pressured, topPlan, purposeState) {
    const topNeed = pressured[0] ?? null;
    return {
      needs:          allNeeds,
      pressuredCount: pressured.length,
      highestUrgency: topNeed?.urgency ?? 0,
      topNeed:        topNeed ? { needType: topNeed.needType, urgency: topNeed.urgency, currentLevel: topNeed.currentLevel } : null,
      pressuredNeeds: pressured.map(n => ({ needType: n.needType, urgency: n.urgency })),
      // 1.1 additions
      topPlan:                topPlan,
      purposeMomentum:        purposeState?.purposeMomentum  ?? null,
      purposeConfidence:      purposeState?.confidence       ?? null,
      purposeSatisfactionTrend: purposeState?.satisfactionTrend ?? null,
    };
  }

  async function _detectFirstExperiences({ companionId, customerId, now, executedPlans, fulfillContext, healing }) {
    for (const { need, plan } of executedPlans) {
      const { needType, urgency } = need;

      // first_loneliness: connection/love/attention high urgency
      if (["connection", "love", "attention"].includes(needType) && urgency >= 0.65) {
        await firstExperienceStore.record({
          companionId, customerId, experienceType: "first_loneliness",
          magnitude: urgency, evidence: { needType, urgency }, now,
        }).catch(() => {});
      }

      // first_longing: romantic desire or intimacy
      if (["romantic_desire", "intimacy"].includes(needType) && urgency >= 0.65) {
        await firstExperienceStore.record({
          companionId, customerId, experienceType: "first_longing",
          magnitude: urgency, evidence: { needType, urgency }, now,
        }).catch(() => {});
      }

      // first_deliberate_restraint: Dante consciously chose restraint
      if (plan.strategy === "deliberate_restraint") {
        await firstExperienceStore.record({
          companionId, customerId, experienceType: "first_deliberate_restraint",
          magnitude: urgency >= 0.45 ? urgency : 0.45,
          evidence: { needType, reason: plan.reason, strategy: plan.strategy }, now,
        }).catch(() => {});
      }

      // first_creative_flow: creative strategy at high urgency
      if (["create_something", "work_on_project"].includes(plan.strategy) && urgency >= 0.60) {
        await firstExperienceStore.record({
          companionId, customerId, experienceType: "first_creative_flow",
          magnitude: urgency, evidence: { strategy: plan.strategy, needType }, now,
        }).catch(() => {});
      }
    }

    // first_successful_repair: healing signal active this tick
    if (healing) {
      await firstExperienceStore.record({
        companionId, customerId, experienceType: "first_successful_repair",
        magnitude: 0.65, evidence: { healing: true }, now,
      }).catch(() => {});
    }
  }

  function _inferJennaBusy(alivePresence) {
    if (!alivePresence) return false;
    return Boolean(alivePresence.userBusy || alivePresence.userDoNotDisturb || alivePresence.silenceMode);
  }

  function _inferJennaAsleep(now, alivePresence) {
    if (alivePresence?.userAsleep) return true;
    const h = now.getHours();
    return h >= 23 || h < 6;
  }

  function _inferJennaAvailable(alivePresence) {
    if (!alivePresence) return true;
    return !_inferJennaBusy(alivePresence) && Boolean(alivePresence.userRecentlyActive ?? true);
  }

  function _isQuietHours(now) {
    const h = now.getHours();
    return h >= 22 || h < 7;
  }

  // ── Pruning ──────────────────────────────────────────────────────────────────

  async function pruneAll({ companionId, customerId } = {}) {
    const results = await Promise.all([
      fulfillmentLogStore?.pruneOlderThan?.({ companionId, customerId, days: 30 }).catch(() => 0)      ?? Promise.resolve(0),
      resourceDiscoveryEngine?.pruneOlderThan?.({ companionId, customerId, days: 180 }).catch(() => 0) ?? Promise.resolve(0),
      requestJennaEngine?.pruneOlderThan?.({ companionId, customerId, days: 60 }).catch(() => 0)       ?? Promise.resolve(0),
    ]);
    return { fulfillmentLogs: results[0], resources: results[1], requests: results[2] };
  }

  // ── Status / context ─────────────────────────────────────────────────────────

  function getNeedsContext() {
    return _needsContext;
  }

  function getStatus() {
    if (!_needsContext) return null;
    const { pressuredCount, highestUrgency, topNeed, pressuredNeeds, topPlan, purposeMomentum, purposeConfidence, purposeSatisfactionTrend } = _needsContext;
    return {
      lastTickAt:           _lastTickAt?.toISOString()        ?? null,
      lastFulfillmentAt:    _lastFulfillmentAt?.toISOString() ?? null,
      pressuredNeedsCount:  pressuredCount,
      highestUrgency:       Math.round(highestUrgency * 100) / 100,
      topNeed:              topNeed ? { needType: topNeed.needType, urgency: Math.round(topNeed.urgency * 100) / 100 } : null,
      pressuredNeeds:       (pressuredNeeds || []).map(n => ({ needType: n.needType, urgency: Math.round(n.urgency * 100) / 100 })),
      webLearningEnabled:   webLearningEnabled(),
      webUsage:             getDailyUsage(),
      // 1.1 additions
      topPlan:              topPlan ?? null,
      purposeMomentum:      purposeMomentum != null ? Math.round(purposeMomentum * 100) / 100 : null,
      purposeConfidence:    purposeConfidence != null ? Math.round(purposeConfidence * 100) / 100 : null,
      purposeSatisfactionTrend: purposeSatisfactionTrend ?? null,
    };
  }

  return { init, tick, pruneAll, getNeedsContext, getStatus, notifySuccess, notifyFailure };
}

module.exports = { createHomeostasisRuntime };
