"use strict";

const { ITEM_TYPES, ITEM_STATUSES, CERTAINTY_LEVELS, PRIORITY_LEVELS } = require("./continuityTypes");

/**
 * Future Event Extractor
 *
 * Detects owner statements about upcoming events:
 *   "I'm going camping on Friday."
 *   "I have the dentist Tuesday."
 *   "I'll upload the repo tomorrow."
 *
 * Certainty levels:
 *   definite → creates follow-up loop
 *   likely   → creates soft follow-up loop
 *   maybe    → creates low-priority loop
 *   vague    → no follow-up (stored as preference or memory)
 */

const EVENT_PATTERNS = [
  // Medical/health appointments
  { re: /\b(dentist|doctor|gp|therapist|physio|hospital|appointment|checkup|check.?up)\b/i, topic: "appointment", sensitivity: "sensitive", priority: "medium" },
  // Travel / away
  { re: /\b(camping|hiking|holiday|vacation|trip|travelling|traveling|away|flight|ferry)\b/i, topic: "travel", sensitivity: "normal", priority: "medium" },
  // Social
  { re: /\b(wedding|birthday|party|dinner|event|concert|festival)\b/i, topic: "social_event", sensitivity: "normal", priority: "low" },
  // Work
  { re: /\b(meeting|interview|presentation|deadline|launch|demo|sprint|stand.?up)\b/i, topic: "work_event", sensitivity: "normal", priority: "medium" },
  // Personal tasks
  { re: /\b(hair|haircut|salon|spa|gym|workout|run|exercise)\b/i, topic: "personal_task", sensitivity: "normal", priority: "low" },
  // Upload/deploy/test tasks
  { re: /\b(upload|deploy|push|test|restart|rebuild|reinstall|migrate)\b/i, topic: "technical_task", sensitivity: "normal", priority: "medium" },
];

const DEFINITE_PATTERNS = [
  /\bi('m| am) (going|heading|travelling|flying|driving|doing|having|getting|testing|uploading|sending)\b/i,
  /\bi have (a |the |my )?\w+\s+(on|at|this|next)\b/i,
  /\bthis (monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|week|morning|afternoon|evening|night)\b/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\btonight\b/i,
  /\btomorrow\b/i,
  /\bnext week\b/i,
];

const LIKELY_PATTERNS = [
  /\bi (should|plan to|intend to|expect to|might|may)\b/i,
  /\bprobably\b/i,
  /\bi think i('ll| will)\b/i,
];

const MAYBE_PATTERNS = [
  /\bmaybe\b/i,
  /\bpossibly\b/i,
  /\bif (i|we|things)\b/i,
  /\bdepends\b/i,
  /\bnot sure if\b/i,
];

const VAGUE_PATTERNS = [
  /\bsomeday\b/i,
  /\bone day\b/i,
  /\bat some point\b/i,
  /\beventually\b/i,
];

function detectCertainty(message) {
  if (VAGUE_PATTERNS.some((re) => re.test(message))) return CERTAINTY_LEVELS.VAGUE;
  if (MAYBE_PATTERNS.some((re) => re.test(message))) return CERTAINTY_LEVELS.MAYBE;
  if (LIKELY_PATTERNS.some((re) => re.test(message))) return CERTAINTY_LEVELS.LIKELY;
  if (DEFINITE_PATTERNS.some((re) => re.test(message))) return CERTAINTY_LEVELS.DEFINITE;
  return null; // no event signal
}

function detectEventTopic(message) {
  for (const pat of EVENT_PATTERNS) {
    if (pat.re.test(message)) return pat;
  }
  return null;
}

function extractFollowUpDate(message) {
  const now = new Date();
  const lower = message.toLowerCase();

  if (/\btonight\b/.test(lower)) {
    const d = new Date(now); d.setHours(23, 0, 0, 0);
    return new Date(d.getTime() + 8 * 60 * 60 * 1000); // follow up tomorrow morning
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now); d.setDate(d.getDate() + 2); d.setHours(10, 0, 0, 0);
    return d;
  }
  if (/\bthis weekend\b/.test(lower) || /\bsaturday\b/.test(lower) || /\bsunday\b/.test(lower)) {
    const d = new Date(now); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(10, 0, 0, 0);
    return d; // follow up Monday
  }

  const dayMap = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
  for (const [day, num] of Object.entries(dayMap)) {
    if (lower.includes(day)) {
      const d = new Date(now);
      const diff = (num - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff + 1); // follow up day after
      d.setHours(10, 0, 0, 0);
      return d;
    }
  }

  if (/\bnext week\b/.test(lower)) {
    const d = new Date(now); d.setDate(d.getDate() + 9); d.setHours(10, 0, 0, 0);
    return d;
  }

  return null;
}

async function extractFutureEvent({
  store,
  config,
  message = "",
  sourceMessageId = "",
  sourceChannelId = "",
  logger,
}) {
  if (!config.continuity_enabled || !config.future_followups_enabled) return null;
  if (!message || message.length < 8) return null;

  const certainty = detectCertainty(message);
  if (!certainty || certainty === CERTAINTY_LEVELS.VAGUE) return null;

  const eventMatch = detectEventTopic(message);
  if (!eventMatch) return null;

  try {
    const followUpAfter = extractFollowUpDate(message);

    // definite/likely get follow-up loops; maybe gets a low-priority loop
    const status = certainty === CERTAINTY_LEVELS.MAYBE
      ? ITEM_STATUSES.WAITING
      : (followUpAfter ? ITEM_STATUSES.WAITING : ITEM_STATUSES.OPEN);

    const item = await store.create({
      type: ITEM_TYPES.FUTURE_EVENT,
      title: `${capitalise(eventMatch.topic.replace(/_/g, " "))} mentioned`,
      summary: `Owner: "${message.slice(0, 200)}"`,
      sourceMessageId,
      sourceChannelId,
      sourceText: message.slice(0, 500),
      status,
      priority: certainty === CERTAINTY_LEVELS.DEFINITE
        ? eventMatch.priority
        : certainty === CERTAINTY_LEVELS.LIKELY ? "low" : "background",
      certainty,
      sensitivity: eventMatch.sensitivity,
      followUpAfter: followUpAfter || null,
      nextAction: followUpAfter
        ? `Ask how the ${eventMatch.topic.replace(/_/g, " ")} went.`
        : "Monitor for outcome mention.",
      createdBy: "system",
      metadata: { event_topic: eventMatch.topic },
    });

    if (item) {
      logger?.info("[continuity] extracted future_event", {
        id: item.id, topic: eventMatch.topic, certainty, followUpAfter,
      });
    }
    return item;
  } catch (err) {
    logger?.warn("[continuity] futureEventExtractor error", { error: err?.message });
    return null;
  }
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { extractFutureEvent, detectCertainty, detectEventTopic, extractFollowUpDate };
