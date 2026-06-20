"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Outcome Capture
 *
 * When the owner answers a follow-up, capture the outcome
 * and close or update the loop.
 *
 * If the answer creates a NEW thread, create a child loop.
 *
 * Example:
 * Owner: "It was really fun but I was exhausted and it rained all night."
 * → Resolve camping loop with resolution.
 * → If "I got amazing photos" → create child loop for photo editing offer.
 */

const POSITIVE_SIGNALS = [/\bgood\b/i, /\bgreat\b/i, /\bfun\b/i, /\bamazing\b/i, /\bperfect\b/i, /\bnice\b/i, /\bloved it\b/i, /\bwent well\b/i];
const NEGATIVE_SIGNALS = [/\bawful\b/i, /\bterrible\b/i, /\bbad\b/i, /\bstressful\b/i, /\brain\b/i, /\bexhausted\b/i, /\btiring\b/i, /\bdifficult\b/i];
const NEW_THREAD_SIGNALS = [
  { re: /\b(photos?|pictures?|shots?)\b/i, topic: "photo followup", nextAction: "Offer help with choosing edits or making a post." },
  { re: /\b(broke|broken|injured|hurt|sick|ill)\b/i, topic: "health followup", nextAction: "Check in on recovery." },
  { re: /\b(found out|discovered|realized|learnt|learned)\b/i, topic: "new development", nextAction: "Follow up on what was found out." },
  { re: /\b(going back|returning|next time|again soon)\b/i, topic: "repeat event", nextAction: "Note interest in repeat." },
];

function detectEmotionalResult(message) {
  const pos = POSITIVE_SIGNALS.some((re) => re.test(message));
  const neg = NEGATIVE_SIGNALS.some((re) => re.test(message));
  if (pos && neg) return "mixed";
  if (pos) return "positive";
  if (neg) return "negative";
  return "neutral";
}

function detectNewThreads(message) {
  return NEW_THREAD_SIGNALS.filter((sig) => sig.re.test(message));
}

async function captureOutcome({
  store,
  config,
  message = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled) return { resolved: 0, childLoops: 0 };

  // Find items in asked/outcome_pending/follow_up_due state
  let candidates = [];
  try {
    const asked = await store.list({ status: ITEM_STATUSES.ASKED, limit: 10 });
    const due = await store.list({ status: ITEM_STATUSES.FOLLOW_UP_DUE, limit: 10 });
    const pending = await store.list({ status: ITEM_STATUSES.OUTCOME_PENDING, limit: 10 });
    candidates = [...asked, ...due, ...pending];
  } catch {
    return { resolved: 0, childLoops: 0 };
  }

  if (!candidates.length) return { resolved: 0, childLoops: 0 };

  // Simple relevance: if message is non-trivial and we have open items, take the most recent
  const relevant = candidates
    .filter((item) => messageRelatedToItem(message, item))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!relevant.length) return { resolved: 0, childLoops: 0 };

  const item = relevant[0];
  const emotionalResult = detectEmotionalResult(message);
  const resolution = `"${message.slice(0, 300)}"`;

  try {
    await store.resolve(item.id, resolution);
    await store.update(item.id, {
      metadata: {
        ...(item.metadata || {}),
        emotional_result: emotionalResult,
        resolved_message_id: sourceMessageId,
      },
    });
    logger?.info("[continuity] captured outcome", { id: item.id, emotionalResult });
  } catch (err) {
    logger?.warn("[continuity] outcome capture update failed", { error: err?.message });
    return { resolved: 0, childLoops: 0 };
  }

  // Create child loops for new threads detected in the answer
  const newThreads = detectNewThreads(message);
  let childLoops = 0;
  for (const thread of newThreads) {
    try {
      const child = await store.create({
        type: ITEM_TYPES.OPEN_LOOP,
        title: thread.topic,
        summary: `Follow-up from: "${message.slice(0, 150)}"`,
        sourceMessageId,
        sourceChannelId,
        sourceText: message.slice(0, 300),
        status: ITEM_STATUSES.OPEN,
        priority: "low",
        certainty: CERTAINTY_LEVELS.LIKELY,
        nextAction: thread.nextAction,
        createdBy: "system",
        metadata: { parent_id: item.id, event_topic: thread.topic },
      });
      if (child) {
        logger?.debug?.("[continuity] created open_loop (child)", { id: child.id, parentId: item.id });
        childLoops++;
      }
    } catch {
      // ignore child loop failures
    }
  }

  return { resolved: 1, childLoops };
}

function messageRelatedToItem(message, item) {
  const words = (item.title + " " + item.summary)
    .toLowerCase().split(/\s+/)
    .filter((w) => w.length > 4);
  const lowerMessage = message.toLowerCase();
  return words.some((w) => lowerMessage.includes(w));
}

module.exports = { captureOutcome, detectEmotionalResult, detectNewThreads };
