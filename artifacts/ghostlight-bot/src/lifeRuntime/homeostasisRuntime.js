"use strict";

/**
 * homeostasisRuntime
 *
 * Life Runtime 6.0 — Homeostasis Runtime.
 *
 * Orchestrates Dante's psychological need system. On every tick:
 *   1. Read all 19 current need levels from needsStore
 *   2. Compute gradual drift for each need (needDriftEngine.tick)
 *   3. Persist updated levels
 *   4. Identify pressured needs (urgency ≥ threshold)
 *   5. For each pressured need, plan fulfillment (fulfillmentPlanner)
 *   6. Execute real fulfillment actions (fulfillmentExecutor)
 *   7. Cache homeostasis context for prelude and status endpoint
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

const URGENCY_THRESHOLD   = 0.30; // below this → wait, don't plan fulfillment
const MAX_NEEDS_PER_TICK  = 2;    // prevent homeostasis from flooding other systems

function createHomeostasisRuntime({
  config                  = {},
  logger                  = null,
  needsStore              = null,
  fulfillmentLogStore     = null,
  resourceDiscoveryEngine = null,
  requestJennaEngine      = null,
  microLifeEventsStore    = null,
  fulfillmentExecutor     = null,
} = {}) {
  let _needsContext      = null; // { needs[], pressuredCount, highestUrgency, topNeed }
  let _lastTickAt        = null;
  let _lastFulfillmentAt = null;

  async function init() {
    if (needsStore?.init)              await needsStore.init().catch(() => {});
    if (fulfillmentLogStore?.init)     await fulfillmentLogStore.init().catch(() => {});
    if (resourceDiscoveryEngine?.init) await resourceDiscoveryEngine.init().catch(() => {});
    if (requestJennaEngine?.init)      await requestJennaEngine.init().catch(() => {});
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
   *   - alivePresence               — alivePresenceStore snapshot (for Jenna availability)
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

    // ── 2. Build drift context from life runtime state ───────────────────────
    const suppression   = consequenceContext?.suppression ?? null;
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

    // ── 4. Identify pressured needs ──────────────────────────────────────────
    const pressured = getPressuredNeeds(updatedNeeds, URGENCY_THRESHOLD);
    const toAddress = selectNeedsToAddress(pressured, MAX_NEEDS_PER_TICK);

    // Cache needs context for prelude / status
    _needsContext = _buildNeedsContext(updatedNeeds, pressured);

    if (toAddress.length === 0) return;

    // ── 5. Build fulfillment context ─────────────────────────────────────────
    const webUsage = getDailyUsage(now);
    const fulfillContext = {
      // Relationship / consequence state
      repairRequired,
      repairStarted,
      healing,
      giveSpace,
      // Jenna availability — inferred from alive presence signals
      jennaIsBusy:     _inferJennaBusy(alivePresence),
      jennaIsAsleep:   _inferJennaAsleep(now, alivePresence),
      jennaIsAvailable: _inferJennaAvailable(alivePresence),
      // Adult / consent context
      adultContextActive: Boolean(alivePresence?.adultContext),
      consentGiven:       Boolean(alivePresence?.consentGiven),
      // Values (from config or identity layer — defer gracefully)
      values: config?.dante?.values ?? {},
      // Web learning
      webLearningEnabled:      webLearningEnabled(),
      webLearningRemainingToday: webUsage.remaining,
      // Project context
      hasActiveProject: Boolean(growthContext?.activeProject),
      // Capabilities
      imageGenerationEnabled: Boolean(config?.imageGeneration?.enabled ?? process.env.IMAGE_GENERATION_ENABLED === "true"),
      voiceNoteEnabled:       Boolean(config?.audio?.enabled ?? process.env.AUDIO_GENERATION_ENABLED === "true"),
      secondLifeAvailable:    Boolean(config?.secondLife?.enabled ?? process.env.SECOND_LIFE_ENABLED === "true"),
      // Plan state
      mood:   dailyPlan?.mood   ?? "neutral",
      energy: dailyPlan?.energy ?? "steady",
      // Curiosity signals (for web search query building)
      attentionFocus: curiosityContext?.attentionFocus ?? null,
      recentInterest: growthContext?.recentInterest    ?? null,
      // Quiet hours — no outreach between 22:00–07:00 local (approximated via UTC hour)
      quietHours: _isQuietHours(now),
    };

    // ── 6. Plan + execute fulfillment for each pressured need ─────────────────
    for (const need of toAddress) {
      const plan = planFulfillment(need, fulfillContext);

      if (fulfillmentExecutor) {
        await fulfillmentExecutor.execute({
          companionId, customerId, need, plan, context: fulfillContext,
        }).catch(err => {
          logger?.warn("[homeostasis] execute error", { error: err?.message, needType: need.needType, strategy: plan.strategy });
        });
      } else {
        // Fallback: log directly when executor not wired
        if (fulfillmentLogStore) {
          await fulfillmentLogStore.logFulfillment({
            companionId, customerId, needType: need.needType,
            strategy: plan.strategy, actionType: plan.strategy,
            actionStatus: "logged_no_executor", summary: `strategy: ${plan.strategy}`,
            evidence: { reason: plan.reason }, needDelta: 0,
          }).catch(() => {});
        }
      }

      _lastFulfillmentAt = now;
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

  function _buildNeedsContext(allNeeds, pressured) {
    const topNeed = pressured[0] ?? null;
    return {
      needs:          allNeeds,
      pressuredCount: pressured.length,
      highestUrgency: topNeed?.urgency ?? 0,
      topNeed:        topNeed ? { needType: topNeed.needType, urgency: topNeed.urgency, currentLevel: topNeed.currentLevel } : null,
      pressuredNeeds: pressured.map(n => ({ needType: n.needType, urgency: n.urgency })),
    };
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
    if (!alivePresence) return true; // assume available if no signal
    return !_inferJennaBusy(alivePresence) && Boolean(alivePresence.userRecentlyActive ?? true);
  }

  function _isQuietHours(now) {
    const h = now.getHours();
    return h >= 22 || h < 7;
  }

  // ── Pruning ──────────────────────────────────────────────────────────────────

  async function pruneAll({ companionId, customerId } = {}) {
    const results = await Promise.all([
      fulfillmentLogStore?.pruneOlderThan?.({ companionId, customerId, days: 30 }).catch(() => 0)     ?? Promise.resolve(0),
      resourceDiscoveryEngine?.pruneOlderThan?.({ companionId, customerId, days: 180 }).catch(() => 0) ?? Promise.resolve(0),
      requestJennaEngine?.pruneOlderThan?.({ companionId, customerId, days: 60 }).catch(() => 0)       ?? Promise.resolve(0),
    ]);
    return { fulfillmentLogs: results[0], resources: results[1], requests: results[2] };
  }

  // ── Status ───────────────────────────────────────────────────────────────────

  function getNeedsContext() {
    return _needsContext;
  }

  function getStatus() {
    if (!_needsContext) return null;
    const { pressuredCount, highestUrgency, topNeed, pressuredNeeds } = _needsContext;
    return {
      lastTickAt:       _lastTickAt?.toISOString() ?? null,
      lastFulfillmentAt: _lastFulfillmentAt?.toISOString() ?? null,
      pressuredNeedsCount: pressuredCount,
      highestUrgency:   Math.round(highestUrgency * 100) / 100,
      topNeed:          topNeed ? { needType: topNeed.needType, urgency: Math.round(topNeed.urgency * 100) / 100 } : null,
      pressuredNeeds:   (pressuredNeeds || []).map(n => ({ needType: n.needType, urgency: Math.round(n.urgency * 100) / 100 })),
      webLearningEnabled: webLearningEnabled(),
      webUsage:         getDailyUsage(),
    };
  }

  return { init, tick, pruneAll, getNeedsContext, getStatus };
}

module.exports = { createHomeostasisRuntime };
