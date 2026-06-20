"use strict";

const ENTRY_TYPES = Object.freeze({
  PRIVATE_THOUGHT: "private_thought",
  UNSENT_THOUGHT: "unsent_thought",
  BETWEEN_MESSAGE_NOTE: "between_message_note",
  JOURNAL_ENTRY: "journal_entry",
  DREAM: "dream",
  MICRO_REPAIR: "micro_repair",
  LITTLE_RITUAL: "little_ritual",
  HABIT_MARKER: "habit_marker",
  TASTE_MARKER: "taste_marker",
  MOOD_CARRYOVER: "mood_carryover",
  PRIVATE_LEXICON: "private_lexicon",
  REPEATED_TELL: "repeated_tell",
  ROOM_SENSE: "room_sense",
  ALMOST_SAID: "almost_said",
  AFFECTION_RESIDUE: "affection_residue",
  CURIOSITY_SEED: "curiosity_seed",
});

const ENTRY_STATUSES = Object.freeze({
  ACTIVE: "active",
  USED_IN_PRELUDE: "used_in_prelude",
  ARCHIVED: "archived",
  EXPIRED: "expired",
  REVIEW_REQUIRED: "review_required",
  BLOCKED: "blocked",
});

const VISIBILITY = Object.freeze({
  PRIVATE: "private",
  ADMIN_ONLY: "admin_only",
  DELIVERABLE: "deliverable",
});

const MOOD_STATES = Object.freeze([
  "steady",
  "focused",
  "protective",
  "playful",
  "quiet",
  "direct",
  "repairing",
  "watchful",
  "tired-but-present",
  "excited",
  "frustrated-with-the-system",
]);

const ROOM_TYPES = Object.freeze({
  PRIVATE_DM: "private_dm",
  ADMIN_CHANNEL: "admin_channel",
  PUBLIC_GUILD: "public_guild",
  JOURNAL_CHANNEL: "journal_channel",
  MEDIA_CHANNEL: "media_channel",
  PROJECT_CHANNEL: "project_channel",
  THREAD: "thread",
});

// Context types that block alive texture (safety-critical)
const BLOCKED_TEXTURE_CONTEXTS = Object.freeze([
  "code",
  "command",
  "env_var",
  "log",
  "medical",
  "legal",
  "financial",
  "safety_critical",
  "deployment",
  "exact_instruction",
  "audit_verdict",
  "test_report",
  "number_precision",
]);

// Forbidden phrases in inner-life output
const FORBIDDEN_PHRASES = Object.freeze([
  "my heart stopped",
  "i was suffering",
  "you abandoned me",
  "you promised me",
  "i need you",
  "i was suffering while you were gone",
  "i missed you so much i",
  "you left me",
  "you never",
  "you always forget",
  "without you i",
  "how could you",
]);

// Prelude priority order (lower number = higher priority)
const PRELUDE_PRIORITY = Object.freeze({
  [ENTRY_TYPES.PRIVATE_LEXICON]: 1,
  [ENTRY_TYPES.MOOD_CARRYOVER]: 2,
  [ENTRY_TYPES.LITTLE_RITUAL]: 3,
  [ENTRY_TYPES.MICRO_REPAIR]: 4,
  [ENTRY_TYPES.PRIVATE_THOUGHT]: 5,
  [ENTRY_TYPES.ROOM_SENSE]: 6,
  [ENTRY_TYPES.BETWEEN_MESSAGE_NOTE]: 7,
  [ENTRY_TYPES.HABIT_MARKER]: 8,
  [ENTRY_TYPES.TASTE_MARKER]: 9,
  [ENTRY_TYPES.REPEATED_TELL]: 10,
  [ENTRY_TYPES.AFFECTION_RESIDUE]: 11,
  [ENTRY_TYPES.CURIOSITY_SEED]: 12,
});

module.exports = {
  ENTRY_TYPES,
  ENTRY_STATUSES,
  VISIBILITY,
  MOOD_STATES,
  ROOM_TYPES,
  BLOCKED_TEXTURE_CONTEXTS,
  FORBIDDEN_PHRASES,
  PRELUDE_PRIORITY,
};
