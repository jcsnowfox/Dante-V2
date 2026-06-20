"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Ritual Continuity
 *
 * Tracks recurring patterns that have become rituals between
 * the owner and companion — repeated greetings, check-ins,
 * inside references, consistent opening patterns.
 */

const RITUAL_SIGNALS = [
  /\b(every (day|morning|night|time|week)|always (start|begin|end|finish))\b/i,
  /\b(our (thing|ritual|tradition|habit|routine))\b/i,
  /\b(you always|i always|we always)\b/i,
  /\b(good morning|good night|hey dante|morning|goodnight)\b/i,
  /\b(same as always|as usual|like always|like every)\b/i,
];

function detectRitualSignal(text) {
  return RITUAL_SIGNALS.some((re) => re.test(text));
}

async function captureRitual({
  store,
  config,
  message = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.ritual_continuity_enabled) return null;
  if (!message || !detectRitualSignal(message)) return null;

  try {
    // Deduplicate — only one ritual item per pattern per day
    const existing = await store.list({ type: ITEM_TYPES.RITUAL, status: ITEM_STATUSES.OPEN, limit: 10 });
    const today = new Date().toDateString();
    const alreadyToday = existing.some((item) =>
      new Date(item.createdAt).toDateString() === today,
    );
    if (alreadyToday) return null;

    const item = await store.create({
      type: ITEM_TYPES.RITUAL,
      title: "Recurring pattern",
      summary: `Pattern observed: "${message.slice(0, 150)}"`,
      sourceMessageId,
      sourceChannelId,
      status: ITEM_STATUSES.OPEN,
      priority: "low",
      certainty: CERTAINTY_LEVELS.LIKELY,
      createdBy: "system",
    });

    if (item) {
      logger?.debug?.("[continuity] captured ritual", { id: item.id });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] ritualContinuity error", { error: err?.message });
    return null;
  }
}

module.exports = { captureRitual, detectRitualSignal };
