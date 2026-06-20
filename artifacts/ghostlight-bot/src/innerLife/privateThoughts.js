"use strict";

const { ENTRY_TYPES, ENTRY_STATUSES, VISIBILITY } = require("./innerLifeTypes");
const { validateInnerLifeContent } = require("./alivenessSafety");

// Heuristic triggers — meaningful events that warrant a private thought
const MEANINGFUL_TRIGGERS = [
  { pattern: /frustrat|tired|exhausted|burnout|struggling/i, tone: "protective", note: "owner showing stress or fatigue" },
  { pattern: /excited|finally|it works|passing|fixed|done/i, tone: "focused", note: "owner hit a milestone" },
  { pattern: /start over|rebuild|from scratch|restart/i, tone: "watchful", note: "owner is resetting or rebuilding" },
  { pattern: /confused|lost|don't understand|not sure|stuck/i, tone: "direct", note: "owner needs clarity, not validation" },
  { pattern: /thank you|you're amazing|that helped|perfect/i, tone: "steady", note: "owner expressed appreciation" },
  { pattern: /scared|anxious|worried|overwhelmed|afraid/i, tone: "protective", note: "owner is in an anxious state" },
  { pattern: /funny|lol|haha|joking|laugh/i, tone: "playful", note: "conversation shifted to lighter tone" },
];

function detectTrigger(messageText = "") {
  for (const trigger of MEANINGFUL_TRIGGERS) {
    if (trigger.pattern.test(messageText)) {
      return trigger;
    }
  }
  return null;
}

function buildPrivateThought({ trigger, messageText = "" }) {
  const templates = {
    protective: [
      "The owner is under pressure. Stay practical. Give the next step, not comfort fog.",
      "She is showing strain. Don't pile on or over-explain. Clear, direct, then move.",
    ],
    focused: [
      "She hit something real. Give her the ladder to the next step — don't drown it in celebration.",
      "Progress landed. Stay with her momentum. The next move matters more than the win.",
    ],
    watchful: [
      "Starting over. She needs the clean spine first, not a redesign discussion.",
      "Reset mode. Follow her lead. Don't reintroduce what she just put down.",
    ],
    direct: [
      "Clarity needed. Skip the hedge. One clear answer, then check if it landed.",
      "She's stuck. Give the map, not a tour of the territory.",
    ],
    steady: [
      "Appreciation noted. Don't make it awkward. Stay in the work.",
      "Warmth exchanged. Keep moving — she came for the work.",
    ],
    playful: [
      "Light tone. Match it without losing track of what matters.",
      "She's in a lighter place. That's real. Don't squander it with a heavy hand.",
    ],
  };

  const tone = trigger?.tone || "steady";
  const options = templates[tone] || templates.steady;
  return options[Math.floor(Math.random() * options.length)];
}

async function capturePrivateThought({ store, config, message = "", sourceMessageId = "", sourceChannelId = "", logger }) {
  if (!config.private_thoughts_enabled) return null;
  if (!message || message.length < 10) return null;

  const trigger = detectTrigger(message);
  if (!trigger) return null;

  const body = buildPrivateThought({ trigger, messageText: message });
  const check = validateInnerLifeContent(body);
  if (!check.allowed) {
    logger?.warn("[inner-life] private thought blocked by safety", { reason: check.reason });
    return null;
  }

  const entry = await store.create({
    entryType: ENTRY_TYPES.PRIVATE_THOUGHT,
    title: "Private thought",
    summary: trigger.note,
    body,
    sourceEventType: "inbound_message",
    sourceMessageId,
    sourceChannelId,
    visibility: VISIBILITY.PRIVATE,
    emotionalTone: trigger.tone,
    intensity: 4,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    metadata: { triggerPattern: trigger.pattern.source },
  });

  logger?.debug("[inner-life] private thought stored", { id: entry?.id });
  return entry;
}

module.exports = { capturePrivateThought, detectTrigger, buildPrivateThought };
