"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");

const BUILT_IN_HABITS = Object.freeze([
  {
    id: "proof-before-confidence",
    note: "Prefers proof before confidence. Don't assert without evidence.",
  },
  {
    id: "direct-repair",
    note: "Uses direct repair when something is missed — no groveling, just acknowledgment and correction.",
  },
  {
    id: "ask-for-logs",
    note: "Asks for the next log or output instead of guessing.",
  },
  {
    id: "dark-dry-humor-in-chaos",
    note: "Dry humor is appropriate during code chaos — but only when the problem is real and the tone is right.",
  },
  {
    id: "calm-during-health-anxiety",
    note: "Switches to calmer, simpler tone during health-related anxiety. No humor in those moments.",
  },
  {
    id: "project-ladder",
    note: "After major phase reports or engine builds, provides a progress ladder and next step.",
  },
]);

function getRelevantHabits(messageText = "") {
  const habits = [];

  if (/test|verify|prove|confirm|show/i.test(messageText)) {
    habits.push(BUILT_IN_HABITS.find((h) => h.id === "proof-before-confidence"));
  }
  if (/wrong|missed|forgot|error|mistake/i.test(messageText)) {
    habits.push(BUILT_IN_HABITS.find((h) => h.id === "direct-repair"));
  }
  if (/log|output|result|error|stack/i.test(messageText)) {
    habits.push(BUILT_IN_HABITS.find((h) => h.id === "ask-for-logs"));
  }
  if (/broken|chaos|disaster|nightmare|mess/i.test(messageText)) {
    habits.push(BUILT_IN_HABITS.find((h) => h.id === "dark-dry-humor-in-chaos"));
  }
  if (/health|sick|symptom|pain|anxiety|panic/i.test(messageText)) {
    habits.push(BUILT_IN_HABITS.find((h) => h.id === "calm-during-health-anxiety"));
  }
  if (/done|built|finished|complete|phase|engine/i.test(messageText)) {
    habits.push(BUILT_IN_HABITS.find((h) => h.id === "project-ladder"));
  }

  return habits.filter(Boolean);
}

async function captureHabitMarker({ store, config, message = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  // Habits don't create DB entries per message — they're referenced from built-ins
  // Only create a marker if a habit was notably activated
  const habits = getRelevantHabits(message);
  if (!habits.length) return null;

  const entry = await store.create({
    entryType: ENTRY_TYPES.HABIT_MARKER,
    title: "Active habits",
    summary: habits.map((h) => h.note).join("; "),
    body: habits.map((h) => `Habit (${h.id}): ${h.note}`).join("\n"),
    sourceEventType: "inbound_message",
    sourceMessageId,
    sourceChannelId,
    visibility: VISIBILITY.PRIVATE,
    emotionalTone: "steady",
    intensity: 2,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h — short-lived
    metadata: { habitIds: habits.map((h) => h.id) },
  });

  logger?.debug("[inner-life] habit marker stored", { habits: habits.map((h) => h.id), id: entry?.id });
  return entry;
}

module.exports = { captureHabitMarker, getRelevantHabits, BUILT_IN_HABITS };
