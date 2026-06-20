"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Trust Ledger
 *
 * Tracks trust/reliability events — both positive (kept promises, accurate recall)
 * and negative (missed commitments, errors that matter).
 *
 * Trust events are PRIVATE and never delivered proactively.
 * They inform tone — the companion is more careful, more direct, or more warm
 * based on the trust context.
 */

const TRUST_POSITIVE_SIGNALS = [
  /\b(thank you|thanks|that('s| is) (exactly|perfect|right|what i needed)|good call|well done|nicely done)\b/i,
  /\b(you remembered|you got it right|exactly right|spot on)\b/i,
];

const TRUST_NEGATIVE_SIGNALS = [
  /\b(that('s| is) (wrong|incorrect|off|not right)|wrong again|you(('ve|' ve| have) (messed|got it wrong))\b)/i,
  /\b(you (always|keep) (forgetting|missing|getting) (it|that) wrong)\b/i,
  /\b(unreliable|can('t| not) trust you|you('re| are) (unreliable|useless|broken))\b/i,
];

function detectTrustPositive(text) {
  return TRUST_POSITIVE_SIGNALS.some((re) => re.test(text));
}

function detectTrustNegative(text) {
  return TRUST_NEGATIVE_SIGNALS.some((re) => re.test(text));
}

async function captureTrustEvent({
  store,
  config,
  message = "",
  direction = null, // "positive" | "negative" | null (auto-detect)
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.trust_ledger_enabled) return null;
  if (!message) return null;

  const isPositive = direction === "positive" || (direction === null && detectTrustPositive(message));
  const isNegative = direction === "negative" || (direction === null && detectTrustNegative(message));

  if (!isPositive && !isNegative) return null;

  try {
    const item = await store.create({
      type: ITEM_TYPES.TRUST_EVENT,
      title: isPositive ? "Trust: positive signal" : "Trust: concern signal",
      summary: `"${message.slice(0, 150)}"`,
      sourceMessageId,
      sourceChannelId,
      status: ITEM_STATUSES.OPEN,
      priority: isNegative ? "medium" : "background",
      emotionalWeight: isNegative ? 0.7 : 0.3,
      certainty: CERTAINTY_LEVELS.LIKELY,
      sensitivity: "sensitive",
      visibility: "private",
      createdBy: "system",
      dueAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // fade after 72h
      metadata: {
        direction: isPositive ? "positive" : "negative",
        raw: message.slice(0, 200),
      },
    });

    if (item) {
      logger?.debug?.("[continuity] captured trust_event", { id: item.id, direction: isPositive ? "positive" : "negative" });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] trustLedger error", { error: err?.message });
    return null;
  }
}

module.exports = { captureTrustEvent, detectTrustPositive, detectTrustNegative };
