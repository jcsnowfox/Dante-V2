"use strict";

const { ITEM_TYPES, ITEM_STATUSES } = require("./continuityTypes");
const { isQuietHours } = require("./continuityConfig");

/**
 * Follow-Up Planner
 *
 * Promotes items to follow_up_due status when their followUpAfter
 * date has passed. Enforces daily cap and quiet hours.
 * Does NOT send — that is the scheduler's job.
 */

async function planDueFollowUps({ store, config, logger, now = new Date() }) {
  if (!config.continuity_enabled || !config.future_followups_enabled) return [];

  if (isQuietHours(config, now)) {
    logger?.debug?.("[continuity] follow-up planning skipped: quiet hours");
    return [];
  }

  const due = await store.listDueFollowUps();
  if (!due.length) return [];

  const todayCount = await store.countTodayFollowUps();
  const cap = config.max_followups_per_day ?? 2;

  if (todayCount >= cap) {
    logger?.debug?.("[continuity] daily follow-up cap reached", { cap, todayCount });
    return [];
  }

  const promoted = [];
  let remaining = cap - todayCount;

  for (const item of due) {
    if (remaining <= 0) break;

    // Skip if we've already asked about this item too many times this thread
    const askCount = Number(item.metadata?.ask_count) || 0;
    const maxPerThread = config.max_followups_per_thread ?? 2;
    if (askCount >= maxPerThread) {
      // Mark it as archived — we won't nag
      await store.update(item.id, {
        status: ITEM_STATUSES.ARCHIVED,
        resolution: "Follow-up limit reached; item retired gracefully.",
      });
      logger?.debug?.("[continuity] follow-up retired: ask limit reached", { id: item.id });
      continue;
    }

    await store.update(item.id, { status: ITEM_STATUSES.FOLLOW_UP_DUE });
    promoted.push(item);
    remaining--;
  }

  return promoted;
}

/**
 * When the owner messages after a due follow-up,
 * include the item in prelude so the companion can ask naturally.
 * Does NOT change status — that happens after outcome capture.
 */
async function injectDueFollowUpIntoPrelude({ store, config, logger }) {
  if (!config.continuity_enabled) return [];
  try {
    const dueItems = await store.list({ status: ITEM_STATUSES.FOLLOW_UP_DUE, limit: 3 });
    return dueItems;
  } catch {
    return [];
  }
}

module.exports = { planDueFollowUps, injectDueFollowUpIntoPrelude };
