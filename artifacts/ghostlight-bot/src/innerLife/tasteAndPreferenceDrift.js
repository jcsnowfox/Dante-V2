"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");
const { validateInnerLifeContent } = require("./alivenessSafety");

const TASTE_SIGNALS = [
  { type: "like", pattern: /(i love|i like|that'?s? great|keep doing that|more of that|do that again)/i, extract: null },
  { type: "dislike", pattern: /(i hate|i don't like|that'?s? annoying|stop doing|don't do that|less of)/i, extract: null },
  { type: "preference_format", pattern: /(in (bullet|list)|step by step|numbered|as a table|shorter|longer|more detail|less detail)/i, extract: true },
  { type: "preference_tone", pattern: /(more (casual|formal|warm|dry|direct|playful|serious)|less (formal|casual|warm|stiff))/i, extract: true },
];

async function captureTasteMarker({ store, config, message = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!message) return null;

  const signal = TASTE_SIGNALS.find((s) => s.pattern.test(message));
  if (!signal) return null;

  const summary = `Taste signal (${signal.type}): detected in message`;
  const body = `Taste note: owner sent a ${signal.type} signal. Pattern matched: ${signal.pattern.source.slice(0, 60)}. Use this to calibrate future responses.`;

  const check = validateInnerLifeContent(body);
  if (!check.allowed) return null;

  const entry = await store.create({
    entryType: ENTRY_TYPES.TASTE_MARKER,
    title: `Taste: ${signal.type}`,
    summary,
    body,
    sourceEventType: "inbound_message",
    sourceMessageId,
    sourceChannelId,
    visibility: VISIBILITY.PRIVATE,
    emotionalTone: "steady",
    intensity: 2,
    expiresAt: null, // taste markers persist
    metadata: { tasteType: signal.type },
  });

  logger?.debug("[inner-life] taste marker stored", { type: signal.type, id: entry?.id });
  return entry;
}

module.exports = { captureTasteMarker, TASTE_SIGNALS };
