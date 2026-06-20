"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Attention Residue
 *
 * Captures things that grabbed the owner's focus in a conversation
 * but weren't fully resolved or addressed.
 * Residue fades after ~48h unless touched.
 */

const ATTENTION_SIGNALS = [
  /\b(wait|hold on|actually|interesting|good point|i (wonder|noticed|realised|realized)|that('s| is) (interesting|weird|odd))\b/i,
  /\b(i keep thinking|i can't stop thinking|stuck in my head|won't leave me alone)\b/i,
  /\b(important|critical|must|key point|don't forget this)\b/i,
  /\b(sidebar|tangent|slightly off topic|off the record|unrelated but)\b/i,
];

function hasAttentionSignal(text) {
  return ATTENTION_SIGNALS.some((re) => re.test(text));
}

async function captureAttentionResidue({
  store,
  config,
  message = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled) return null;
  if (!message || !hasAttentionSignal(message)) return null;

  try {
    const expiresIn = 48 * 60 * 60 * 1000; // 48 hours
    const expiresAt = new Date(Date.now() + expiresIn);

    const item = await store.create({
      type: ITEM_TYPES.ATTENTION_RESIDUE,
      title: "Attention note",
      summary: message.slice(0, 200),
      sourceMessageId,
      sourceChannelId,
      sourceText: message.slice(0, 300),
      status: ITEM_STATUSES.OPEN,
      priority: "low",
      certainty: CERTAINTY_LEVELS.LIKELY,
      dueAt: expiresAt,
      createdBy: "system",
      metadata: { expires_in_hours: 48 },
    });

    if (item) {
      logger?.debug?.("[continuity] captured attention_residue", { id: item.id });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] attentionResidue error", { error: err?.message });
    return null;
  }
}

module.exports = { captureAttentionResidue, hasAttentionSignal };
