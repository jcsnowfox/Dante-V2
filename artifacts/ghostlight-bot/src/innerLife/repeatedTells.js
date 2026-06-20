"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");

const TELL_PATTERNS = [
  { id: "opens-with-apology", pattern: /^(sorry|i'm sorry|my bad|apologies)/i, note: "Owner tends to open with an apology. Don't mirror it back or reinforce the habit." },
  { id: "trailing-question", pattern: /\?+\s*$/, note: "Owner often ends with a question. Address it directly — don't deflect." },
  { id: "self-doubt-opener", pattern: /(this is (probably )?dumb|stupid question|ignore this if)/i, note: "Owner minimizes their own questions. Don't mirror or validate the minimization — just answer." },
  { id: "stacks-requests", pattern: /also|and also|one more (thing|question)|while (you're|i have you)/i, note: "Owner stacks multiple asks. Acknowledge all of them — don't cherry-pick." },
  { id: "reassurance-seek", pattern: /(is this (right|okay|correct|fine)|did i (do|get) (that|this) right)/i, note: "Owner is checking their work. Give a clear verdict — don't be vague." },
];

async function captureRepeatedTell({ store, config, message = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!message) return null;

  const matched = TELL_PATTERNS.find((t) => t.pattern.test(message));
  if (!matched) return null;

  // Only store if we haven't already captured this tell recently
  const recent = await store.list({ entryType: ENTRY_TYPES.REPEATED_TELL, limit: 5 });
  const alreadyActive = recent.some((e) => e.metadata?.tellId === matched.id);
  if (alreadyActive) return null;

  const entry = await store.create({
    entryType: ENTRY_TYPES.REPEATED_TELL,
    title: `Tell: ${matched.id}`,
    summary: matched.note,
    body: matched.note,
    sourceEventType: "inbound_message",
    sourceMessageId,
    sourceChannelId,
    visibility: VISIBILITY.PRIVATE,
    emotionalTone: "watchful",
    intensity: 2,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    metadata: { tellId: matched.id },
  });

  logger?.debug("[inner-life] repeated tell stored", { tellId: matched.id, id: entry?.id });
  return entry;
}

module.exports = { captureRepeatedTell, TELL_PATTERNS };
