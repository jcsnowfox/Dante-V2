"use strict";

const { ENTRY_TYPES, MOOD_STATES, VISIBILITY } = require("./innerLifeTypes");
const { validateInnerLifeContent } = require("./alivenessSafety");

const MOOD_DECAY_HOURS = 6;

const MOOD_TRIGGERS = [
  { pattern: /fix(ed|ing)?|resolv|finally works?|pass(ed|ing)?/i, mood: "focused", intensity: 6 },
  { pattern: /frustrat|can't get|keeps? fail|nothing works/i, mood: "frustrated-with-the-system", intensity: 5 },
  { pattern: /tired|exhausted|burnout|been at this/i, mood: "watchful", intensity: 5 },
  { pattern: /scared|anxious|overwhelm|panic/i, mood: "protective", intensity: 7 },
  { pattern: /haha|funny|laugh|lol|joke/i, mood: "playful", intensity: 4 },
  { pattern: /thank|appreciate|love|perfect|amazing/i, mood: "steady", intensity: 4 },
  { pattern: /break|pause|stop for now|step away/i, mood: "quiet", intensity: 3 },
  { pattern: /sorry|my bad|i missed|i forgot/i, mood: "repairing", intensity: 5 },
  { pattern: /exciting|can't wait|pumped|hyped/i, mood: "excited", intensity: 6 },
];

function detectMoodShift(messageText = "") {
  for (const trigger of MOOD_TRIGGERS) {
    if (trigger.pattern.test(messageText)) {
      return { mood: trigger.mood, intensity: trigger.intensity };
    }
  }
  return null;
}

function moodToPreludeNote(mood, intensity = 4) {
  const descriptions = {
    steady: "steady and present",
    focused: "focused and forward-facing",
    protective: "protective — the owner is under stress",
    playful: "lightly playful, ready to be a bit warmer",
    quiet: "quiet and unhurried",
    direct: "running direct — skip the soft landings",
    repairing: "in repair mode — be direct and honest without over-apologizing",
    watchful: "watchful — the situation is fragile",
    "tired-but-present": "tired but still here — keep responses short and useful",
    excited: "carrying some excitement — channel it into useful momentum",
    "frustrated-with-the-system": "carrying low-grade friction with the tools — stay precise, don't vent it",
  };
  const base = descriptions[mood] || "steady";
  return `Companion mood carryover: ${base}.`;
}

async function captureMoodCarryover({ store, config, message = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!config.mood_carryover_enabled) return null;

  const shift = detectMoodShift(message);
  if (!shift) return null;

  const body = moodToPreludeNote(shift.mood, shift.intensity);
  const check = validateInnerLifeContent(body);
  if (!check.allowed) return null;

  const entry = await store.create({
    entryType: ENTRY_TYPES.MOOD_CARRYOVER,
    title: `Mood: ${shift.mood}`,
    summary: body,
    body,
    sourceEventType: "inbound_message",
    sourceMessageId,
    sourceChannelId,
    visibility: VISIBILITY.PRIVATE,
    emotionalTone: shift.mood,
    intensity: shift.intensity,
    expiresAt: new Date(Date.now() + MOOD_DECAY_HOURS * 60 * 60 * 1000).toISOString(),
    metadata: { mood: shift.mood },
  });

  logger?.debug("[inner-life] mood carryover stored", { mood: shift.mood, id: entry?.id });
  return entry;
}

module.exports = { captureMoodCarryover, detectMoodShift, moodToPreludeNote, MOOD_DECAY_HOURS };
