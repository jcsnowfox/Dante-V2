"use strict";

const { ITEM_TYPES, ITEM_STATUSES, PROMISE_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Promise Ledger
 *
 * Tracks:
 * - Companion promises ("I'll ask you Monday") — accountability-required
 * - Owner promises — treated gently, not accusatorially
 *
 * promise_maker: "companion" | "owner"
 *
 * Companion broken promise repair style:
 *   Acknowledge → Own it → Brief explanation only if useful →
 *   Repair → Prevent recurrence → Do NOT spiral
 */

// Companion promise patterns: things the companion says it will do
const COMPANION_PROMISE_PATTERNS = [
  /\bi('ll| will) (ask|check|follow up|remind|look|send|note|log|come back to|get back to)\b/i,
  /\blet me (remember|note|check|look into)\b/i,
  /\bi('ll| will) (mention|bring that up|bring it up)\b/i,
  /\bi('m| am) (noting|logging|keeping track)\b/i,
];

// Owner promise patterns: things owner says they'll do
const OWNER_PROMISE_PATTERNS = [
  /\bi('ll| will) (send|upload|share|post|commit|push|test|try|check|fix|finish|update|do)\b/i,
  /\bi('m| am) going to (send|upload|share|post|commit|push|try)\b/i,
  /\bi promise\b/i,
  /\bi'll get (it|that|back to you) (done|sorted)\b/i,
];

function detectCompanionPromise(text) {
  return COMPANION_PROMISE_PATTERNS.some((re) => re.test(text));
}

function detectOwnerPromise(text) {
  return OWNER_PROMISE_PATTERNS.some((re) => re.test(text));
}

async function captureCompanionPromise({
  store,
  config,
  responseText = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.promise_ledger_enabled) return null;
  if (!responseText || !detectCompanionPromise(responseText)) return null;

  try {
    const title = responseText.slice(0, 100).replace(/\s+/g, " ").trim();
    const item = await store.create({
      type: ITEM_TYPES.PROMISE,
      title,
      summary: `Companion promised: "${responseText.slice(0, 300)}"`,
      sourceMessageId,
      sourceChannelId,
      sourceText: responseText.slice(0, 500),
      status: ITEM_STATUSES.OPEN,
      priority: "medium",
      certainty: CERTAINTY_LEVELS.DEFINITE,
      createdBy: "companion",
      metadata: {
        promise_maker: "companion",
        promise_receiver: "owner",
        promise_text: responseText.slice(0, 200),
        promise_status: PROMISE_STATUSES.MADE,
      },
    });
    if (item) {
      logger?.info("[continuity] created promise (companion)", { id: item.id });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] captureCompanionPromise error", { error: err?.message });
    return null;
  }
}

async function captureOwnerPromise({
  store,
  config,
  message = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.promise_ledger_enabled) return null;
  if (!message || !detectOwnerPromise(message)) return null;

  try {
    const title = message.slice(0, 100).replace(/\s+/g, " ").trim();
    const item = await store.create({
      type: ITEM_TYPES.PROMISE,
      title,
      summary: `Owner mentioned: "${message.slice(0, 300)}"`,
      sourceMessageId,
      sourceChannelId,
      sourceText: message.slice(0, 500),
      status: ITEM_STATUSES.OPEN,
      priority: "low",
      certainty: CERTAINTY_LEVELS.LIKELY,
      createdBy: "owner",
      metadata: {
        promise_maker: "owner",
        promise_receiver: "companion",
        promise_text: message.slice(0, 200),
        promise_status: PROMISE_STATUSES.MADE,
      },
    });
    if (item) {
      logger?.info("[continuity] created promise (owner)", { id: item.id });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] captureOwnerPromise error", { error: err?.message });
    return null;
  }
}

async function markPromiseKept({ store, itemId, note = "" }) {
  return store.update(itemId, {
    status: ITEM_STATUSES.RESOLVED,
    resolution: note || "Promise kept.",
    resolvedAt: new Date(),
    metadata: undefined, // merge handled in caller
  });
}

async function markPromiseMissed({ store, itemId }) {
  return store.update(itemId, {
    status: ITEM_STATUSES.OUTCOME_PENDING,
    metadata: undefined, // updated by caller
  });
}

async function markPromiseRepaired({ store, itemId, repairText = "" }) {
  return store.update(itemId, {
    status: ITEM_STATUSES.RESOLVED,
    resolution: repairText || "Promise repaired.",
    resolvedAt: new Date(),
  });
}

module.exports = {
  captureCompanionPromise,
  captureOwnerPromise,
  detectCompanionPromise,
  detectOwnerPromise,
  markPromiseKept,
  markPromiseMissed,
  markPromiseRepaired,
};
