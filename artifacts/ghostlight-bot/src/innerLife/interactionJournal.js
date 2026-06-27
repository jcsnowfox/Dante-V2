"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");
const { validateInnerLifeContent } = require("./alivenessSafety");

const DIAGNOSTIC_PATTERNS = Object.freeze([
  /write to my own journal/i,
  /own journal/i,
  /thoughts?[,\s]+but (?:they )?(?:do not|don't) stick/i,
  /gone next session/i,
  /evidence store/i,
  /provenance layer/i,
  /perception runtime/i,
  /belief should have changed/i,
  /logged this action/i,
]);

const USER_JOURNAL_PATTERNS = Object.freeze([
  /\bjournal\b/i,
  /\bdiagnostics?\b/i,
  /\binner life\b/i,
  /\balive layer\b/i,
]);

function shouldRecordInteractionJournal({ message = "", reply = "" } = {}) {
  const userText = String(message || "");
  const replyText = String(reply || "");
  return DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(replyText))
    || (USER_JOURNAL_PATTERNS.some((pattern) => pattern.test(userText))
      && DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(`${userText}\n${replyText}`)));
}

function buildInteractionJournalBody({ message = "", reply = "" } = {}) {
  const userText = String(message || "").trim().replace(/\s+/g, " ").slice(0, 500);
  const replyText = String(reply || "").trim().replace(/\s+/g, " ").slice(0, 900);

  return [
    "I flagged a real continuity/diagnostic gap during conversation and need it to persist, not vanish after this session.",
    userText ? `Owner context: ${userText}` : "Owner context: not captured.",
    replyText ? `What I said: ${replyText}` : "What I said: not captured.",
    "Carry-forward: treat this as an internal repair thread. If I name a missing journal, evidence, provenance, perception, or belief-change path, future replies should remember that gap and not pretend it was fixed without proof.",
  ].join("\n\n");
}

async function recordInteractionJournal({ store, config, message = "", reply = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!config?.inner_life_enabled || !config?.journal_enabled) return null;
  if (!shouldRecordInteractionJournal({ message, reply })) return null;

  const body = buildInteractionJournalBody({ message, reply });
  const check = validateInnerLifeContent(body);
  if (!check.allowed) {
    logger?.warn?.("[inner-life] interaction journal blocked by safety", { reason: check.reason });
    return null;
  }

  const entry = await store.create({
    entryType: ENTRY_TYPES.JOURNAL_ENTRY,
    title: `Journal — diagnostic carry-forward — ${new Date().toDateString()}`,
    summary: "Dante identified a continuity/diagnostic gap that must persist across sessions.",
    body,
    sourceEventType: "conversation_diagnostic_journal",
    sourceMessageId,
    sourceChannelId,
    visibility: VISIBILITY.ADMIN_ONLY,
    sensitivity: "personal",
    emotionalTone: "diagnostic",
    intensity: 4,
    expiresAt: null,
    metadata: {
      kind: "diagnostic_carry_forward",
      evidence: {
        userMessage: userTextForMetadata(message),
        assistantReply: userTextForMetadata(reply),
      },
    },
  });

  if (entry) logger?.info?.("[inner-life] interaction journal created", { id: entry.id, sourceMessageId });
  return entry;
}

function userTextForMetadata(text) {
  return String(text || "").trim().slice(0, 1000);
}

module.exports = {
  DIAGNOSTIC_PATTERNS,
  shouldRecordInteractionJournal,
  buildInteractionJournalBody,
  recordInteractionJournal,
};
