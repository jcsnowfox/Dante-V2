"use strict";

const ITEM_TYPES = Object.freeze({
  OPEN_LOOP: "open_loop",
  FUTURE_EVENT: "future_event",
  FOLLOW_UP: "follow_up",
  PROMISE: "promise",
  DECISION: "decision",
  PROJECT_STATE: "project_state",
  REPAIR_THREAD: "repair_thread",
  BOUNDARY: "boundary",
  RITUAL: "ritual",
  ATTENTION_RESIDUE: "attention_residue",
  EMOTIONAL_RESIDUE: "emotional_residue",
  MEDIA_JOB: "media_job",
  HEALTH_CONTEXT: "health_context",
  RELATIONSHIP_CONTEXT: "relationship_context",
  WAITING_ON_OWNER: "waiting_on_owner",
  WAITING_ON_COMPANION: "waiting_on_companion",
  ABSENCE_REENTRY: "absence_reentry",
  TRUST_EVENT: "trust_event",
});

const ALL_ITEM_TYPES = Object.values(ITEM_TYPES);

const ITEM_STATUSES = Object.freeze({
  OPEN: "open",
  WAITING: "waiting",
  FOLLOW_UP_DUE: "follow_up_due",
  ASKED: "asked",
  OUTCOME_PENDING: "outcome_pending",
  RESOLVED: "resolved",
  EXPIRED: "expired",
  ARCHIVED: "archived",
  CANCELLED: "cancelled",
});

const ALL_STATUSES = Object.values(ITEM_STATUSES);

const PROMISE_STATUSES = Object.freeze({
  MADE: "made",
  ACCEPTED: "accepted",
  DUE: "due",
  KEPT: "kept",
  MISSED: "missed",
  BROKEN: "broken",
  REPAIRED: "repaired",
  FORGIVEN: "forgiven",
  EXPIRED: "expired",
});

const DECISION_STATUSES = Object.freeze({
  PROPOSED: "proposed",
  ACCEPTED: "accepted",
  LOCKED: "locked",
  SUPERSEDED: "superseded",
  REVERSED: "reversed",
  ARCHIVED: "archived",
});

const PRIORITY_LEVELS = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  BACKGROUND: "background",
});

const CERTAINTY_LEVELS = Object.freeze({
  DEFINITE: "definite",
  LIKELY: "likely",
  MAYBE: "maybe",
  VAGUE: "vague",
});

const VISIBILITY_LEVELS = Object.freeze({
  PRIVATE: "private",
  ADMIN_ONLY: "admin_only",
  CHANNEL_RESTRICTED: "channel_restricted",
  DELIVERABLE: "deliverable",
});

const SENSITIVITY_LEVELS = Object.freeze({
  NORMAL: "normal",
  SENSITIVE: "sensitive",
  PRIVATE: "private",
  RESTRICTED: "restricted",
});

// Types that are inherently sensitive and require explicit config to deliver
const SENSITIVE_TYPES = Object.freeze(new Set([
  ITEM_TYPES.HEALTH_CONTEXT,
  ITEM_TYPES.BOUNDARY,
  ITEM_TYPES.REPAIR_THREAD,
  ITEM_TYPES.RELATIONSHIP_CONTEXT,
  ITEM_TYPES.EMOTIONAL_RESIDUE,
]));

// Types that should never be delivered to public channels
const PRIVATE_ONLY_TYPES = Object.freeze(new Set([
  ITEM_TYPES.HEALTH_CONTEXT,
  ITEM_TYPES.BOUNDARY,
  ITEM_TYPES.REPAIR_THREAD,
  ITEM_TYPES.PROMISE,
  ITEM_TYPES.TRUST_EVENT,
]));

// Prelude priority — lower number = selected first
const PRELUDE_PRIORITY = Object.freeze({
  [ITEM_TYPES.REPAIR_THREAD]: 1,
  [ITEM_TYPES.BOUNDARY]: 2,
  [ITEM_TYPES.FOLLOW_UP]: 3,
  [ITEM_TYPES.PROMISE]: 4,
  [ITEM_TYPES.DECISION]: 5,
  [ITEM_TYPES.EMOTIONAL_RESIDUE]: 6,
  [ITEM_TYPES.ATTENTION_RESIDUE]: 7,
  [ITEM_TYPES.PROJECT_STATE]: 8,
  [ITEM_TYPES.OPEN_LOOP]: 9,
  [ITEM_TYPES.FUTURE_EVENT]: 10,
  [ITEM_TYPES.RITUAL]: 11,
  [ITEM_TYPES.ABSENCE_REENTRY]: 12,
  [ITEM_TYPES.WAITING_ON_OWNER]: 13,
  [ITEM_TYPES.WAITING_ON_COMPANION]: 14,
  [ITEM_TYPES.TRUST_EVENT]: 15,
  [ITEM_TYPES.MEDIA_JOB]: 16,
  [ITEM_TYPES.HEALTH_CONTEXT]: 17,
  [ITEM_TYPES.RELATIONSHIP_CONTEXT]: 18,
});

// Forbidden phrases for follow-up composers — never guilt, shame, or pressure
const FORBIDDEN_FOLLOW_UP_PHRASES = Object.freeze([
  "you promised",
  "you said you would",
  "you never told me",
  "you forgot",
  "you disappeared",
  "where were you",
  "you owe me",
  "you always",
  "you never",
  "reminder:",
  "don't forget",
  "you need to",
  "i need you to",
  "i've been waiting",
  "still waiting",
  "you said you'd",
]);

module.exports = {
  ITEM_TYPES,
  ALL_ITEM_TYPES,
  ITEM_STATUSES,
  ALL_STATUSES,
  PROMISE_STATUSES,
  DECISION_STATUSES,
  PRIORITY_LEVELS,
  CERTAINTY_LEVELS,
  VISIBILITY_LEVELS,
  SENSITIVITY_LEVELS,
  SENSITIVE_TYPES,
  PRIVATE_ONLY_TYPES,
  PRELUDE_PRIORITY,
  FORBIDDEN_FOLLOW_UP_PHRASES,
};
