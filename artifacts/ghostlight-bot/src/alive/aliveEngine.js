"use strict";

/**
 * alive/aliveEngine
 *
 * Core decision engine for the Dante Alive Layer. Runs on a configurable
 * interval and evaluates whether the companion should proactively reach out,
 * based on:
 *   - Absence gap (time since the most recent user message across all channels)
 *   - Daily reach-out cap (max N intentions per UTC day)
 *   - Cooldown between successive reach-outs
 *   - Current pending intention count (avoids flooding the queue)
 *
 * Does NOT execute messages itself — it enqueues an intention in
 * intentionQueueStore and logs the decision to aliveEventsStore. The heartbeat
 * service or a separate executor consumes pending intentions.
 *
 * Config keys (all under config.alive or via env):
 *   ALIVE_ENABLED                true/false (default true)
 *   ALIVE_TICK_INTERVAL_MS       ms between assess() calls (default 15 min)
 *   ALIVE_ABSENCE_THRESHOLD_MS   ms of silence before considering reach-out (default 4 h)
 *   ALIVE_DAILY_REACH_OUT_CAP    max intentions per day (default 3)
 *   ALIVE_COOLDOWN_MS            min ms between successive reach-outs (default 2 h)
 */

const DEFAULT_TICK_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_ABSENCE_THRESHOLD_MS = 4 * 60 * 60 * 1000;
const DEFAULT_DAILY_REACH_OUT_CAP = 3;
const DEFAULT_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const INTENTION_EXPIRES_MS = 3 * 60 * 60 * 1000;

function createAliveEngine({
  config = {},
  logger = null,
  aliveEventsStore = null,
  intentionQueue = null,
  interactionPresenceStore = null,
} = {}) {
  const aliveConfig = config?.alive || {};
  const tickIntervalMs = Number(
    aliveConfig.tickIntervalMs
    || process.env.ALIVE_TICK_INTERVAL_MS
    || DEFAULT_TICK_INTERVAL_MS,
  );
  const absenceThresholdMs = Number(
    aliveConfig.absenceThresholdMs
    || process.env.ALIVE_ABSENCE_THRESHOLD_MS
    || DEFAULT_ABSENCE_THRESHOLD_MS,
  );
  const dailyCap = Number(
    aliveConfig.dailyReachOutCap
    || process.env.ALIVE_DAILY_REACH_OUT_CAP
    || DEFAULT_DAILY_REACH_OUT_CAP,
  );
  const cooldownMs = Number(
    aliveConfig.cooldownMs
    || process.env.ALIVE_COOLDOWN_MS
    || DEFAULT_COOLDOWN_MS,
  );
  const enabled = (
    aliveConfig.enabled !== false
    && process.env.ALIVE_ENABLED !== "false"
  );

  let _timer = null;
  let _lastAssessAt = null;
  let _lastResult = null;

  function getScope() {
    const companionId = config?.memory?.companionId || config?.companion?.id || "";
    const customerId = config?.memory?.userScope || "user";
    return { companionId, customerId };
  }

  async function getMostRecentUserMessageAt() {
    if (!interactionPresenceStore?.listPresence) return null;
    const { companionId, customerId } = getScope();
    try {
      const presenceList = await interactionPresenceStore.listPresence({
        user_scope: customerId,
        companion_id: companionId,
        limit: 20,
      });
      const timestamps = presenceList
        .map((p) => p.last_user_message_at)
        .filter(Boolean)
        .map((t) => new Date(t).getTime())
        .filter((t) => !Number.isNaN(t));
      return timestamps.length ? new Date(Math.max(...timestamps)) : null;
    } catch {
      return null;
    }
  }

  async function assess(now = new Date()) {
    if (!enabled) return { skipped: true, reason: "disabled" };

    const { companionId, customerId } = getScope();
    if (!companionId) return { skipped: true, reason: "no_companion_id" };

    _lastAssessAt = now;

    try {
      // 1. Daily cap
      const todayCount = aliveEventsStore
        ? await aliveEventsStore.countTodayByType({ companionId, customerId, eventType: "intention_created", now }).catch(() => 0)
        : 0;
      if (todayCount >= dailyCap) {
        _lastResult = { skipped: true, reason: "daily_cap_reached", todayCount, dailyCap };
        await aliveEventsStore?.logEvent?.({
          companionId, customerId,
          eventType: "reachout_suppressed",
          reason: "daily_cap_reached",
          decision: `${todayCount}/${dailyCap} daily cap`,
        }).catch(() => {});
        return _lastResult;
      }

      // 2. Cooldown
      const recentIntentions = aliveEventsStore
        ? await aliveEventsStore.listRecent({ companionId, customerId, limit: 1, eventType: "intention_created" }).catch(() => [])
        : [];
      const lastIntentionAt = recentIntentions[0]?.createdAt ? new Date(recentIntentions[0].createdAt) : null;
      if (lastIntentionAt && (now.getTime() - lastIntentionAt.getTime()) < cooldownMs) {
        const remainingMs = cooldownMs - (now.getTime() - lastIntentionAt.getTime());
        _lastResult = { skipped: true, reason: "cooldown_active", remainingMs };
        return _lastResult;
      }

      // 3. Absence gap
      const lastUserMessageAt = await getMostRecentUserMessageAt();
      const absenceMs = lastUserMessageAt
        ? now.getTime() - lastUserMessageAt.getTime()
        : Infinity;
      if (Number.isFinite(absenceMs) && absenceMs < absenceThresholdMs) {
        _lastResult = { skipped: true, reason: "owner_recently_active", absenceMs };
        return _lastResult;
      }

      // 4. Pending intention guard
      const pendingCount = intentionQueue
        ? await intentionQueue.countPending({ companionId, customerId }).catch(() => 0)
        : 0;
      if (pendingCount > 0) {
        _lastResult = { skipped: true, reason: "pending_intention_exists", pendingCount };
        return _lastResult;
      }

      // 5. Enqueue intention
      const absenceLabel = Number.isFinite(absenceMs)
        ? `${Math.round(absenceMs / 60000)}min`
        : "unknown";
      const reason = `absent_${absenceLabel}`;
      const expiresAt = new Date(now.getTime() + INTENTION_EXPIRES_MS);

      const intention = intentionQueue
        ? await intentionQueue.enqueue({
          companionId,
          customerId,
          intentionType: "reach_out",
          reason,
          payload: { absenceMs: Number.isFinite(absenceMs) ? absenceMs : null, todayCount },
          priority: 5,
          expiresAt,
        }).catch(() => null)
        : null;

      await aliveEventsStore?.logEvent?.({
        companionId,
        customerId,
        eventType: "intention_created",
        reason,
        decision: `reach_out after ${absenceLabel} absence (${todayCount + 1}/${dailyCap} today)`,
        payload: { intentionType: "reach_out", absenceMs: Number.isFinite(absenceMs) ? absenceMs : null, todayCount, intentionId: intention?.id ?? null },
      }).catch(() => {});

      logger?.info?.("[alive-engine] Intention enqueued", { companionId, customerId, reason, absenceLabel });
      _lastResult = { enqueued: true, intention, reason };
      return _lastResult;

    } catch (error) {
      logger?.warn?.("[alive-engine] assess() error", { error: error?.message });
      _lastResult = { skipped: true, reason: "error", error: error?.message };
      return _lastResult;
    }
  }

  function getStatus() {
    return {
      enabled,
      running: Boolean(_timer),
      lastAssessAt: _lastAssessAt?.toISOString() ?? null,
      lastResult: _lastResult ?? null,
      tickIntervalMs,
      absenceThresholdMs,
      dailyCap,
      cooldownMs,
    };
  }

  function start() {
    if (_timer || !enabled) return;
    _timer = setInterval(async () => {
      try {
        await assess(new Date());
      } catch (error) {
        logger?.warn?.("[alive-engine] Tick failed", { error: error?.message });
      }
    }, tickIntervalMs);
    logger?.info?.("[alive-engine] Started", { tickIntervalMs, absenceThresholdMs, dailyCap, cooldownMs });
  }

  function stop() {
    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }
  }

  return { assess, getStatus, start, stop };
}

module.exports = { createAliveEngine };
