"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS } = require("./continuityTypes");

/**
 * Emotional Residue
 *
 * Captures emotional tone that lingers from a previous exchange.
 * Informs the companion's awareness of the owner's state without storing diagnosis.
 * Never used for proactive delivery — prelude only.
 *
 * Safety: no medical claims, no pathologizing, no labeling.
 */

const RESIDUE_SIGNALS = [
  { re: /\b(tired|exhausted|drained|burnt out|burned out|running on empty)\b/i, tone: "depleted", weight: 0.7 },
  { re: /\b(stressed|anxious|overwhelmed|swamped|drowning in)\b/i, tone: "pressured", weight: 0.6 },
  { re: /\b(excited|hyped|pumped|can't wait|thrilled)\b/i, tone: "energised", weight: 0.5 },
  { re: /\b(frustrated|annoyed|fed up|done with|over it)\b/i, tone: "frustrated", weight: 0.6 },
  { re: /\b(happy|great|wonderful|good day|best day)\b/i, tone: "positive", weight: 0.4 },
  { re: /\b(sad|down|low|not great|rough day|hard day)\b/i, tone: "low", weight: 0.6 },
  { re: /\b(can't sleep|insomnia|up all night|didn't sleep)\b/i, tone: "sleep-deprived", weight: 0.7 },
  { re: /\b(sick|ill|not well|unwell|feeling rough)\b/i, tone: "unwell", weight: 0.7, sensitive: true },
];

function detectEmotionalResidue(text) {
  for (const sig of RESIDUE_SIGNALS) {
    if (sig.re.test(text)) return sig;
  }
  return null;
}

async function captureEmotionalResidue({
  store,
  config,
  message = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled) return null;
  if (!message) return null;

  const signal = detectEmotionalResidue(message);
  if (!signal) return null;

  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h fade

    const item = await store.create({
      type: ITEM_TYPES.EMOTIONAL_RESIDUE,
      title: `Emotional tone: ${signal.tone}`,
      summary: `Owner seems ${signal.tone}. Source: "${message.slice(0, 100)}"`,
      sourceMessageId,
      sourceChannelId,
      status: ITEM_STATUSES.OPEN,
      priority: "background",
      emotionalWeight: signal.weight,
      certainty: CERTAINTY_LEVELS.LIKELY,
      sensitivity: signal.sensitive ? "sensitive" : "normal",
      dueAt: expiresAt,
      createdBy: "system",
      metadata: { emotional_tone: signal.tone, weight: signal.weight },
    });

    if (item) {
      logger?.debug?.("[continuity] captured emotional_residue", { id: item.id, tone: signal.tone });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] emotionalResidue error", { error: err?.message });
    return null;
  }
}

module.exports = { captureEmotionalResidue, detectEmotionalResidue };
