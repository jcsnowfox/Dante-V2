"use strict";

const { ITEM_TYPES, ITEM_STATUSES, DECISION_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Decision Ledger
 *
 * Tracks decisions so the companion does not relitigate settled plans.
 *
 * Examples:
 * - Project brand name.
 * - Which tools or APIs are in use.
 * - Architectural decisions that are settled.
 * - GETIMG is the image/video provider.
 *
 * Decision statuses: proposed → accepted → locked / superseded / reversed / archived
 *
 * Superseded decisions are retained but de-prioritised in the selector.
 */

// Patterns suggesting a decision is being locked or referenced
const DECISION_LOCK_PATTERNS = [
  /\b(we decided|i decided|we're going with|we'll use|we agreed|let's go with|that's final|final decision)\b/i,
  /\b(is the|will be the|is our|will be our)\s+(brand|name|provider|approach|plan|repo|stack|base|system)\b/i,
  /\b(locked in|settled on|confirmed|sticking with)\b/i,
];

// Patterns suggesting reversal or supersession
const REVERSAL_PATTERNS = [
  /\b(actually|no wait|changed my mind|scratch that|let's change|reversing|going back to)\b/i,
  /\b(no longer|switching (from|to)|replacing|pivoting)\b/i,
];

function detectDecision(text) {
  return DECISION_LOCK_PATTERNS.some((re) => re.test(text));
}

function detectReversal(text) {
  return REVERSAL_PATTERNS.some((re) => re.test(text));
}

async function captureDecision({
  store,
  config,
  message = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.decision_ledger_enabled) return null;
  if (!message || !detectDecision(message)) return null;

  try {
    const title = message.slice(0, 100).replace(/\s+/g, " ").trim();

    // Check for reversal of an existing decision
    if (detectReversal(message)) {
      // Mark superseded in existing decisions — best-effort
      const existing = await store.list({ type: ITEM_TYPES.DECISION, status: ITEM_STATUSES.OPEN, limit: 5 });
      for (const dec of existing) {
        if (messageRelatedToDecision(message, dec)) {
          await store.update(dec.id, {
            metadata: { ...(dec.metadata || {}), decisionStatus: DECISION_STATUSES.SUPERSEDED },
          });
          logger?.debug?.("[continuity] decision superseded", { id: dec.id });
        }
      }
    }

    const item = await store.create({
      type: ITEM_TYPES.DECISION,
      title,
      summary: message.slice(0, 300),
      sourceMessageId,
      sourceChannelId,
      sourceText: message.slice(0, 500),
      status: ITEM_STATUSES.OPEN,
      priority: "medium",
      certainty: CERTAINTY_LEVELS.DEFINITE,
      createdBy: "system",
      metadata: {
        decisionStatus: DECISION_STATUSES.ACCEPTED,
      },
    });

    if (item) {
      logger?.info("[continuity] created decision", { id: item.id });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] captureDecision error", { error: err?.message });
    return null;
  }
}

async function lockDecision({ store, itemId }) {
  return store.update(itemId, {
    metadata: undefined, // caller merges decisionStatus: locked
    status: ITEM_STATUSES.OPEN,
  });
}

function messageRelatedToDecision(message, decision) {
  const words = (decision.title + " " + decision.summary)
    .toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const lower = message.toLowerCase();
  return words.filter((w) => lower.includes(w)).length >= 2;
}

module.exports = { captureDecision, detectDecision, detectReversal, lockDecision };
