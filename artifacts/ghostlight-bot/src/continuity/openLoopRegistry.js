"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Open Loop Registry — tracks unfinished conversational threads.
 *
 * An open loop is anything that was started but not finished:
 * a topic raised and dropped, a task mentioned but not reported on,
 * a question asked but not answered.
 */

// Patterns that suggest an open loop (not closed yet)
const OPEN_SIGNALS = Object.freeze([
  /\bi('ll|'m going to|will|plan to|am going to)\b/i,
  /\bwhen i (get|finish|complete|fix|do|try|test|check|upload|send|look|sort)\b/i,
  /\blet me (know|check|see|try|look|finish|get back)\b/i,
  /\bi need to\b/i,
  /\bi haven't (done|finished|checked|tested|tried|sent|uploaded)\b/i,
  /\bstill (working on|figuring out|trying|waiting)\b/i,
  /\btodo\b/i,
  /\bto do\b/i,
  /\blater (i('ll| will)| today| tonight| tomorrow)\b/i,
]);

function hasOpenSignal(text) {
  return OPEN_SIGNALS.some((re) => re.test(text));
}

async function captureOpenLoop({
  store,
  config,
  message = "",
  recentHistory = [],
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.open_loops_enabled) return null;
  if (!message || !hasOpenSignal(message)) return null;

  // Avoid creating duplicate loops for the same message
  try {
    const existing = await store.list({ type: ITEM_TYPES.OPEN_LOOP, status: ITEM_STATUSES.OPEN, limit: 10 });
    const alreadyLogged = existing.some((item) =>
      item.sourceMessageId && item.sourceMessageId === sourceMessageId,
    );
    if (alreadyLogged) return null;

    const title = deriveLoopTitle(message);
    const item = await store.create({
      type: ITEM_TYPES.OPEN_LOOP,
      title,
      summary: `Owner mentioned: "${message.slice(0, 200)}"`,
      sourceMessageId,
      sourceChannelId,
      sourceText: message.slice(0, 500),
      status: ITEM_STATUSES.OPEN,
      priority: "low",
      certainty: CERTAINTY_LEVELS.LIKELY,
      createdBy: "system",
    });

    if (item) {
      logger?.debug?.("[continuity] created open_loop", { id: item.id });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] openLoopRegistry error", { error: err?.message });
    return null;
  }
}

function deriveLoopTitle(message) {
  const cleaned = message.replace(/\s+/g, " ").trim();
  return cleaned.length > 80 ? cleaned.slice(0, 77) + "…" : cleaned;
}

async function closeLoopIfOutcomeFound({ store, message = "", logger }) {
  // Look for outcome signals that close existing open loops
  const OUTCOME_SIGNALS = [/\bdone\b/i, /\bfinished\b/i, /\bfixed\b/i, /\bsent\b/i, /\buploaded\b/i, /\bcompleted\b/i, /\bworking now\b/i];
  const hasOutcome = OUTCOME_SIGNALS.some((re) => re.test(message));
  if (!hasOutcome) return 0;

  try {
    const openLoops = await store.list({ type: ITEM_TYPES.OPEN_LOOP, status: ITEM_STATUSES.OPEN, limit: 5 });
    let closed = 0;
    for (const loop of openLoops) {
      if (messageRelatedToLoop(message, loop)) {
        await store.resolve(loop.id, `Outcome: "${message.slice(0, 200)}"`);
        logger?.debug?.("[continuity] loop resolved", { id: loop.id });
        closed++;
      }
    }
    return closed;
  } catch {
    return 0;
  }
}

function messageRelatedToLoop(message, loop) {
  // Simple heuristic: check if any significant word from the loop title appears in the message
  const loopWords = (loop.title || loop.summary || "")
    .toLowerCase().split(/\s+/)
    .filter((w) => w.length > 4);
  const lowerMessage = message.toLowerCase();
  return loopWords.some((w) => lowerMessage.includes(w));
}

module.exports = { captureOpenLoop, closeLoopIfOutcomeFound };
