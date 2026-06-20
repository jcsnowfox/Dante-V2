"use strict";

const { ITEM_TYPES } = require("./continuityTypes");
const { selectContinuityPrelude } = require("./continuitySelector");

const MAX_PRELUDE_WORDS = 180;

function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function itemToLine(item) {
  const summary = (item.summary || item.title || "").trim();
  if (!summary) return null;

  switch (item.type) {
    case ITEM_TYPES.OPEN_LOOP:
      return `Active thread: ${summary}`;
    case ITEM_TYPES.FUTURE_EVENT:
      return `Upcoming event: ${summary}${item.followUpAfter ? ` — follow up after ${formatDate(item.followUpAfter)}` : ""}`;
    case ITEM_TYPES.FOLLOW_UP:
      return `Follow-up due: ${summary}`;
    case ITEM_TYPES.PROMISE: {
      const maker = item.metadata?.promise_maker;
      const prefix = maker === "companion" ? "Companion promised:" : "Owner mentioned:";
      return `${prefix} ${summary}`;
    }
    case ITEM_TYPES.DECISION:
      return `Decision: ${summary}`;
    case ITEM_TYPES.PROJECT_STATE:
      return `Project context: ${summary}`;
    case ITEM_TYPES.REPAIR_THREAD:
      return `Repair thread open: ${summary}`;
    case ITEM_TYPES.BOUNDARY:
      return `Boundary note: ${summary}`;
    case ITEM_TYPES.RITUAL:
      return `Ritual: ${summary}`;
    case ITEM_TYPES.ATTENTION_RESIDUE:
      return `Attention note: ${summary}`;
    case ITEM_TYPES.EMOTIONAL_RESIDUE:
      return `Emotional carry: ${summary}`;
    case ITEM_TYPES.MEDIA_JOB:
      return `Media context: ${summary}`;
    case ITEM_TYPES.WAITING_ON_OWNER:
      return `Waiting on owner: ${summary}`;
    case ITEM_TYPES.WAITING_ON_COMPANION:
      return `Companion to do: ${summary}`;
    case ITEM_TYPES.ABSENCE_REENTRY:
      return `Re-entry context: ${summary}`;
    case ITEM_TYPES.TRUST_EVENT:
      return `Trust note: ${summary}`;
    case ITEM_TYPES.HEALTH_CONTEXT:
      return `Context: ${summary}`;
    case ITEM_TYPES.RELATIONSHIP_CONTEXT:
      return `Context: ${summary}`;
    default:
      return summary;
  }
}

function formatDate(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return String(dt);
  }
}

function buildContinuityPrelude({ items = [], config = {}, messageContext = {}, logger, companionId } = {}) {
  if (!config.continuity_enabled) return null;
  if (!items || items.length === 0) return null;

  const selected = selectContinuityPrelude({ items, config, messageContext });
  if (!selected.length) return null;

  const lines = [];
  for (const item of selected) {
    const line = itemToLine(item);
    if (line && line.trim()) lines.push(`* ${line.trim()}`);
  }

  if (!lines.length) return null;

  const content = [
    "Continuity:",
    ...lines,
    "Use these as background context to shape your tone and awareness.",
  ].join("\n");

  const wordCount = countWords(content);
  if (wordCount > MAX_PRELUDE_WORDS) {
    logger?.warn("[continuity] prelude exceeded word limit", { companionId, wordCount });
  }

  logger?.debug("[continuity] selected prelude", { companionId, itemCount: lines.length, wordCount });

  return { label: "Continuity", content };
}

module.exports = { buildContinuityPrelude, countWords, itemToLine };
