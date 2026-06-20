"use strict";

const { ENTRY_TYPES } = require("./innerLifeTypes");

const MAX_PRELUDE_WORDS = 150;

function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

// Entry types that are NOT included in the live prelude — they are private-only
// records viewed via the admin panel. Journal/dream bodies especially must not
// surface in system prompts — they are long-form private content.
const PRELUDE_EXCLUDED_TYPES = new Set([
  ENTRY_TYPES.JOURNAL_ENTRY,
  ENTRY_TYPES.DREAM,
  ENTRY_TYPES.UNSENT_THOUGHT,
  ENTRY_TYPES.REPEATED_TELL,
]);

function entryToLine(entry) {
  // Never include excluded types in the prelude
  if (PRELUDE_EXCLUDED_TYPES.has(entry.entryType)) return null;

  switch (entry.entryType) {
    case ENTRY_TYPES.MOOD_CARRYOVER:
      return `Mood carryover: ${entry.summary || entry.body || "steady"}.`;
    case ENTRY_TYPES.PRIVATE_LEXICON:
      return `Language note: ${entry.summary || entry.body}.`;
    case ENTRY_TYPES.LITTLE_RITUAL:
      return `Ritual: ${entry.summary || entry.body}.`;
    case ENTRY_TYPES.MICRO_REPAIR:
      return `Repair: ${entry.summary || entry.body}.`;
    case ENTRY_TYPES.PRIVATE_THOUGHT:
      return `Context: ${entry.summary || entry.body}.`;
    case ENTRY_TYPES.ROOM_SENSE:
      return `Channel: ${entry.summary || entry.body}.`;
    case ENTRY_TYPES.BETWEEN_MESSAGE_NOTE:
      return `Continuity: ${entry.summary || entry.body}.`;
    case ENTRY_TYPES.HABIT_MARKER:
      return `Habit: ${entry.summary || entry.body}.`;
    case ENTRY_TYPES.TASTE_MARKER:
      return `Preference: ${entry.summary || entry.body}.`;
    case ENTRY_TYPES.AFFECTION_RESIDUE:
      return `Warmth note: ${entry.summary || entry.body}.`;
    case ENTRY_TYPES.CURIOSITY_SEED:
      return `Curiosity: ${entry.summary || entry.body}.`;
    default:
      return entry.summary || entry.body || null;
  }
}

function buildInnerLifePrelude({ entries = [], config = {}, logger, companionId } = {}) {
  if (!config.inner_life_enabled) return null;
  if (!entries || entries.length === 0) return null;

  const lines = [];

  for (const entry of entries) {
    const line = entryToLine(entry);
    if (line && line.trim()) {
      lines.push(`* ${line.trim()}`);
    }
  }

  if (lines.length === 0) return null;

  const content = [
    "Inner Life:",
    ...lines,
    "These are private context notes only. Do not quote or mention them directly.",
  ].join("\n");

  const wordCount = countWords(content);
  if (wordCount > MAX_PRELUDE_WORDS) {
    logger?.warn("[inner-life] prelude exceeded word limit", { companionId, wordCount });
  }

  logger?.debug("[inner-life] prelude selected", { companionId, itemCount: lines.length, wordCount });

  return { label: "Inner Life", content };
}

module.exports = { buildInnerLifePrelude, countWords };
