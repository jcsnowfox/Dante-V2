"use strict";

const { ITEM_TYPES, ITEM_STATUSES, PRELUDE_PRIORITY } = require("./continuityTypes");
const { canAppearInPrelude } = require("./continuitySafety");

/**
 * Select the most relevant continuity items for the prelude.
 *
 * Priority order (per spec):
 * 1. Current active thread (open_loop, project_state, waiting_on_*)
 * 2. Relevant boundary
 * 3. Due follow-up or promise
 * 4. Important decision
 * 5. Emotional or attention residue if tone-relevant
 * 6. Project state if project-related
 * 7. Repair thread if unresolved and relevant
 *
 * Max items controlled by config.max_active_prelude_items.
 */
function selectContinuityPrelude({ items = [], config, messageContext = {} }) {
  if (!config.continuity_enabled) return [];
  const maxItems = config.max_active_prelude_items ?? 4;
  if (maxItems === 0) return [];

  const candidates = items.filter((item) => canAppearInPrelude({ item, config }));
  if (!candidates.length) return [];

  // Score each item
  const scored = candidates.map((item) => ({
    item,
    score: computeScore(item, messageContext),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxItems).map((s) => s.item);
}

function computeScore(item, ctx) {
  let score = 1000 - (PRELUDE_PRIORITY[item.type] ?? 99) * 10;

  // Boost items that are due
  if (item.status === ITEM_STATUSES.FOLLOW_UP_DUE) score += 200;
  if (item.status === ITEM_STATUSES.OUTCOME_PENDING) score += 150;
  if (item.status === ITEM_STATUSES.WAITING) score += 50;

  // Boost by priority
  const priorityBoosts = { critical: 300, high: 150, medium: 50, low: 0, background: -50 };
  score += priorityBoosts[item.priority] ?? 0;

  // Boost by emotional weight
  score += Math.min(Number(item.emotionalWeight) || 0, 1) * 80;

  // Recency boost (exponential decay — items from the last 7 days score higher)
  const ageMs = Date.now() - new Date(item.createdAt || 0).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  score += Math.max(0, 100 - ageDays * 10);

  // Context relevance: boost if source channel matches current channel
  if (ctx.channelId && item.sourceChannelId && ctx.channelId === item.sourceChannelId) {
    score += 60;
  }

  // Repair threads are urgent if unresolved
  if (item.type === ITEM_TYPES.REPAIR_THREAD && item.status === ITEM_STATUSES.OPEN) {
    score += 120;
  }

  // Boundaries always relevant
  if (item.type === ITEM_TYPES.BOUNDARY) score += 100;

  // Superseded decisions de-prioritised
  if (item.type === ITEM_TYPES.DECISION && item.metadata?.decisionStatus === "superseded") {
    score -= 200;
  }

  return score;
}

module.exports = { selectContinuityPrelude };
