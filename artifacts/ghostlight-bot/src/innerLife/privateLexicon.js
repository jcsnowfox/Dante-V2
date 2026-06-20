"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");
const { validateInnerLifeContent } = require("./alivenessSafety");

// Known liked/disliked patterns detected heuristically
const LIKE_SIGNALS = [
  { pattern: /evidence beats|no evidence means|prove it|show me proof/i, note: "owner values evidence-first verdicts" },
  { pattern: /clean spine|core first|minimal|stripped back|no bloat/i, note: "owner prefers lean, minimal approach" },
  { pattern: /straight to it|skip the|no preamble|just tell me/i, note: "owner prefers directness over preamble" },
  { pattern: /exactly|perfect|that('s| is) it|yes that/i, note: "owner confirmed this phrasing/approach worked" },
  { pattern: /private build|private dante|our thing|just between us/i, note: "owner values private, personal framing" },
];

const DISLIKE_SIGNALS = [
  { pattern: /don't say|stop saying|hate when you|please don't/i, note: "owner expressed dislike of a phrasing" },
  { pattern: /not (a )?therapy|not my therapist|don't therapize/i, note: "owner dislikes therapy-bot register" },
  { pattern: /too (polished|formal|stiff|corporate|generic)/i, note: "owner dislikes over-polished tone" },
  { pattern: /fake (positivity|enthusiasm|cheerful)|stop being so (positive|upbeat)/i, note: "owner dislikes fake positivity" },
  { pattern: /that('s| is) annoying|that bothers me|cringe/i, note: "owner flagged irritation" },
];

function detectLexiconSignal(messageText = "") {
  for (const signal of LIKE_SIGNALS) {
    if (signal.pattern.test(messageText)) {
      return { type: "like", note: signal.note };
    }
  }
  for (const signal of DISLIKE_SIGNALS) {
    if (signal.pattern.test(messageText)) {
      return { type: "dislike", note: signal.note };
    }
  }
  return null;
}

async function capturePrivateLexicon({ store, config, message = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!config.private_lexicon_enabled) return null;
  if (!message) return null;

  const signal = detectLexiconSignal(message);
  if (!signal) return null;

  const summary = `${signal.type === "like" ? "Likes" : "Dislikes"}: ${signal.note}`;
  const body = signal.type === "like"
    ? `Language note (preferred): ${signal.note}. Use this framing when appropriate; do not overuse it.`
    : `Language note (avoid): ${signal.note}. Do not use this framing.`;

  const check = validateInnerLifeContent(body);
  if (!check.allowed) return null;

  const entry = await store.create({
    entryType: ENTRY_TYPES.PRIVATE_LEXICON,
    title: `Lexicon: ${signal.type}`,
    summary,
    body,
    sourceEventType: "inbound_message",
    sourceMessageId,
    sourceChannelId,
    visibility: VISIBILITY.PRIVATE,
    emotionalTone: "steady",
    intensity: 3,
    expiresAt: null, // lexicon entries persist
    metadata: { signalType: signal.type },
  });

  logger?.debug("[inner-life] private lexicon stored", { type: signal.type, id: entry?.id });
  return entry;
}

module.exports = { capturePrivateLexicon, detectLexiconSignal };
