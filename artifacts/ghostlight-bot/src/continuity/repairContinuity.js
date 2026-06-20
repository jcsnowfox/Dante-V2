"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Repair Continuity
 *
 * Tracks repair threads — moments where friction, miscommunication,
 * or a mistake needs to be acknowledged and addressed.
 *
 * Repair threads get the highest prelude priority (score boost).
 * They are NEVER delivered proactively unless explicitly resolved.
 */

const REPAIR_SIGNALS = [
  /\b(that (wasn't|was not|isn't|is not) what i (meant|said|asked))\b/i,
  /\b(you (misunderstood|got that wrong|missed the point))\b/i,
  /\b(wrong answer|not what i wanted|that's (off|wrong|incorrect))\b/i,
  /\b(i'm (upset|annoyed|frustrated) (with|at) you)\b/i,
  /\b(you (keep|always|never)) /i,
  /\b(i told you|we talked about this|i already said)\b/i,
  /\b(that (hurt|bothered|upset|annoyed) me)\b/i,
];

function detectRepairSignal(text) {
  return REPAIR_SIGNALS.some((re) => re.test(text));
}

async function captureRepairThread({
  store,
  config,
  message = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.repair_continuity_enabled) return null;
  if (!message || !detectRepairSignal(message)) return null;

  try {
    // Check if there's already an open repair thread
    const existing = await store.list({ type: ITEM_TYPES.REPAIR_THREAD, status: ITEM_STATUSES.OPEN, limit: 3 });
    if (existing.length > 0) {
      // Update the most recent — don't stack multiple repair threads
      const item = existing[0];
      await store.update(item.id, {
        summary: item.summary + `\nAlso: "${message.slice(0, 100)}"`,
        lastTouchedAt: new Date(),
        sourceMessageId,
      });
      logger?.debug?.("[continuity] repair thread updated", { id: item.id });
      return item;
    }

    const item = await store.create({
      type: ITEM_TYPES.REPAIR_THREAD,
      title: "Repair thread",
      summary: `Friction noted: "${message.slice(0, 200)}"`,
      sourceMessageId,
      sourceChannelId,
      sourceText: message.slice(0, 500),
      status: ITEM_STATUSES.OPEN,
      priority: "high",
      emotionalWeight: 0.8,
      certainty: CERTAINTY_LEVELS.DEFINITE,
      sensitivity: "sensitive",
      createdBy: "system",
      nextAction: "Acknowledge the friction gently. Do not spiral.",
    });

    if (item) {
      logger?.info("[continuity] created repair_thread", { id: item.id });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] repairContinuity error", { error: err?.message });
    return null;
  }
}

async function resolveRepairThread({ store, itemId, resolution = "" }) {
  return store.resolve(itemId, resolution || "Repair acknowledged and addressed.");
}

module.exports = { captureRepairThread, detectRepairSignal, resolveRepairThread };
