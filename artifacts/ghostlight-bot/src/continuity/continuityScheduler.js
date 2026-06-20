"use strict";

const { canDeliverProactively } = require("./continuitySafety");
const { isQuietHours } = require("./continuityConfig");
const { planDueFollowUps } = require("./followUpPlanner");
const { composeFollowUp } = require("./followUpComposer");
const { ITEM_STATUSES } = require("./continuityTypes");

/**
 * Continuity Scheduler
 *
 * Runs on a periodic tick. Finds due follow-ups, respects config
 * and quiet hours, and delivers through the approved path if proactive
 * follow-ups are enabled.
 *
 * Proactive delivery requires:
 * - config.proactive_followups_enabled = true
 * - Not quiet hours
 * - Under daily cap
 * - Approved channel
 * - Safety gate passes
 *
 * Prelude-only mode: if proactive is disabled but owner messages,
 * due items are injected into prelude by the engine — scheduler
 * only handles the proactive path.
 *
 * Success requires a message_id. Failure must include exact reason.
 */

function createContinuityScheduler({ store, config, deliverFn, logger }) {
  let intervalId = null;
  const TICK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  async function tick() {
    try {
      if (!config.continuity_enabled) return;
      if (!config.proactive_followups_enabled) {
        logger?.debug?.("[continuity] proactive blocked: proactive_followups_enabled=false");
        return;
      }

      if (isQuietHours(config)) {
        logger?.debug?.("[continuity] proactive blocked: quiet hours");
        return;
      }

      const promoted = await planDueFollowUps({ store, config, logger });
      if (!promoted.length) return;

      const todayCount = await store.countTodayFollowUps();
      const cap = config.max_followups_per_day ?? 2;
      if (todayCount >= cap) {
        logger?.debug?.("[continuity] proactive blocked: daily cap reached", { cap, todayCount });
        return;
      }

      let sent = 0;
      for (const item of promoted) {
        if (todayCount + sent >= cap) break;

        // Safety gate
        const gate = canDeliverProactively({ item, config, logger });
        if (!gate.allowed) {
          logger?.info("[continuity] proactive blocked", { id: item.id, reason: gate.reason });
          continue;
        }

        if (!deliverFn) {
          logger?.debug?.("[continuity] no deliverFn — proactive delivery skipped", { id: item.id });
          continue;
        }

        const seed = Number(item.id) % 100;
        const text = composeFollowUp({ item, config, seed });
        if (!text) continue;

        try {
          const result = await deliverFn({ text, item });
          if (result?.messageId) {
            // Mark asked with exact message id
            await store.update(item.id, {
              status: ITEM_STATUSES.ASKED,
              askedAt: new Date(),
              metadata: {
                ...(item.metadata || {}),
                ask_count: (Number(item.metadata?.ask_count) || 0) + 1,
                last_sent_message_id: result.messageId,
              },
            });
            logger?.info("[continuity] proactive sent", {
              id: item.id, messageId: result.messageId,
            });
            sent++;
          } else {
            logger?.warn("[continuity] delivery failed: no messageId returned", { id: item.id });
            await store.update(item.id, {
              metadata: {
                ...(item.metadata || {}),
                last_delivery_failure: "No messageId returned from deliverFn",
                last_failure_at: new Date().toISOString(),
              },
            });
          }
        } catch (deliveryErr) {
          const reason = deliveryErr?.message || String(deliveryErr);
          logger?.warn("[continuity] delivery failed", { id: item.id, reason });
          await store.update(item.id, {
            metadata: {
              ...(item.metadata || {}),
              last_delivery_failure: reason,
              last_failure_at: new Date().toISOString(),
            },
          });
        }
      }
    } catch (err) {
      logger?.warn("[continuity] scheduler tick error", { error: err?.message });
    }
  }

  function start() {
    if (intervalId) return;
    intervalId = setInterval(tick, TICK_INTERVAL_MS);
    logger?.debug?.("[continuity] scheduler started");
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      logger?.debug?.("[continuity] scheduler stopped");
    }
  }

  return { start, stop, tick };
}

module.exports = { createContinuityScheduler };
