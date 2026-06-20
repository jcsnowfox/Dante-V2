"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Boundary Continuity
 *
 * Tracks boundaries the owner has expressed.
 * Boundaries always score high in the prelude selector.
 * NEVER proactively delivered — prelude awareness only.
 *
 * Safety: boundary items are private-only types.
 */

const BOUNDARY_SIGNALS = [
  /\b(don't (want|like|ask|mention|bring up|talk about)|please don't)\b/i,
  /\b(not comfortable with|not okay with|that bothers me|that upsets me)\b/i,
  /\b(boundary|limit|off limits|off.limits|no go|no-go)\b/i,
  /\b(stop (asking|mentioning|bringing up)|i've asked you (not to|to stop))\b/i,
  /\b(private|personal|none of your business|keep that between us)\b/i,
  /\b(that topic is|we don't talk about|i don't discuss)\b/i,
];

function detectBoundarySignal(text) {
  return BOUNDARY_SIGNALS.some((re) => re.test(text));
}

async function captureBoundary({
  store,
  config,
  message = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.boundary_continuity_enabled) return null;
  if (!message || !detectBoundarySignal(message)) return null;

  try {
    const item = await store.create({
      type: ITEM_TYPES.BOUNDARY,
      title: "Boundary noted",
      summary: `Owner expressed: "${message.slice(0, 200)}"`,
      sourceMessageId,
      sourceChannelId,
      sourceText: message.slice(0, 500),
      status: ITEM_STATUSES.OPEN,
      priority: "high",
      emotionalWeight: 0.9,
      certainty: CERTAINTY_LEVELS.DEFINITE,
      sensitivity: "sensitive",
      visibility: "private",
      createdBy: "system",
      nextAction: "Respect this boundary — do not probe, ask, or reference it proactively.",
    });

    if (item) {
      logger?.info("[continuity] created boundary", { id: item.id });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] boundaryContinuity error", { error: err?.message });
    return null;
  }
}

module.exports = { captureBoundary, detectBoundarySignal };
