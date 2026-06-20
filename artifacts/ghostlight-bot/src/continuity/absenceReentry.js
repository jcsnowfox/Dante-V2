"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Absence Re-entry
 *
 * When the owner returns after time away, generate safe re-entry context.
 *
 * Good: "Back with me. Want to pick up the continuity engine, or leave the engine room alone for a bit?"
 * Bad:  "Where were you?" / "You disappeared."
 *
 * Re-entry threshold: >4 hours since last message.
 */

const REENTRY_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

function isLikelyReentry({ lastMessageAt, now = new Date() }) {
  if (!lastMessageAt) return false;
  const gap = now.getTime() - new Date(lastMessageAt).getTime();
  return gap >= REENTRY_THRESHOLD_MS;
}

async function captureAbsenceReentry({
  store,
  config,
  lastMessageAt,
  lastContext = "",
  sourceMessageId = "",
  sourceChannelId = "",
  now = new Date(),
  logger,
}) {
  if (!config.continuity_enabled || !config.absence_reentry_enabled) return null;
  if (!isLikelyReentry({ lastMessageAt, now })) return null;

  try {
    // Don't create duplicate re-entry items for the same session
    const recent = await store.list({ type: ITEM_TYPES.ABSENCE_REENTRY, status: ITEM_STATUSES.OPEN, limit: 2 });
    const recentlyCreated = recent.some((item) => {
      const age = now.getTime() - new Date(item.createdAt).getTime();
      return age < 60 * 60 * 1000; // created within the last hour
    });
    if (recentlyCreated) return null;

    const gapMs = now.getTime() - new Date(lastMessageAt).getTime();
    const gapHours = Math.round(gapMs / (1000 * 60 * 60));

    const item = await store.create({
      type: ITEM_TYPES.ABSENCE_REENTRY,
      title: "Re-entry after absence",
      summary: lastContext
        ? `Owner returning after ~${gapHours}h. Last context: ${lastContext.slice(0, 100)}`
        : `Owner returning after ~${gapHours}h gap.`,
      sourceMessageId,
      sourceChannelId,
      status: ITEM_STATUSES.OPEN,
      priority: "medium",
      certainty: CERTAINTY_LEVELS.DEFINITE,
      createdBy: "system",
      metadata: {
        gap_hours: gapHours,
        last_message_at: lastMessageAt,
        last_context: lastContext.slice(0, 200),
      },
    });

    if (item) {
      logger?.debug?.("[continuity] captured absence_reentry", { id: item.id, gapHours });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] absenceReentry error", { error: err?.message });
    return null;
  }
}

module.exports = { captureAbsenceReentry, isLikelyReentry, REENTRY_THRESHOLD_MS };
