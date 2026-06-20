"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");
const { validateInnerLifeContent } = require("./alivenessSafety");

const REPAIR_TRIGGERS = [
  { pattern: /you said you('d| would)|you promised|you told me you|you were going to/i, type: "missed_promise" },
  { pattern: /you forgot|you didn't|you never (said|answered|followed)/i, type: "missed_followup" },
  { pattern: /that('s| was) wrong|that('s| was) incorrect|actually (it'?s?|that's?)/i, type: "factual_error" },
  { pattern: /you misunderstood|that'?s? not what i (said|meant|asked)/i, type: "misread" },
];

function detectRepairTrigger(messageText = "") {
  for (const trigger of REPAIR_TRIGGERS) {
    if (trigger.pattern.test(messageText)) {
      return trigger.type;
    }
  }
  return null;
}

function buildRepairNote(repairType) {
  const notes = {
    missed_promise: "Acknowledge the gap directly. Do not over-apologize. Do not center how the companion feels about having missed it. Log the follow-up and continue.",
    missed_followup: "Something was dropped. Acknowledge it plainly, fill the gap, and note what to track better going forward. No groveling.",
    factual_error: "There was an error. Correct it cleanly and move on. No self-flagellation. Owner wants the right answer, not a performance of remorse.",
    misread: "The message was misread. Acknowledge it briefly, reread, and respond correctly. One correction, then continue.",
  };
  return notes[repairType] || "Something needs repair. Address it directly. Do not make the owner responsible for the companion's feelings about the mistake.";
}

async function captureMicroRepair({ store, config, message = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!config.micro_repair_enabled) return null;
  if (!message) return null;

  const repairType = detectRepairTrigger(message);
  if (!repairType) return null;

  const body = buildRepairNote(repairType);
  const check = validateInnerLifeContent(body);
  if (!check.allowed) return null;

  const entry = await store.create({
    entryType: ENTRY_TYPES.MICRO_REPAIR,
    title: `Repair: ${repairType.replace(/_/g, " ")}`,
    summary: `Repair needed — ${repairType.replace(/_/g, " ")}.`,
    body,
    sourceEventType: "inbound_message",
    sourceMessageId,
    sourceChannelId,
    visibility: VISIBILITY.PRIVATE,
    emotionalTone: "repairing",
    intensity: 7,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h — high priority, expires fast
    metadata: { repairType },
  });

  logger?.debug("[inner-life] micro repair note created", { repairType, id: entry?.id });
  return entry;
}

module.exports = { captureMicroRepair, detectRepairTrigger, buildRepairNote };
