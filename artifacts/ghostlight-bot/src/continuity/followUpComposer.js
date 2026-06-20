"use strict";

const { ITEM_TYPES } = require("./continuityTypes");
const { auditFollowUpText } = require("./continuitySafety");

/**
 * Follow-Up Composer
 *
 * Creates natural, warm, non-pressuring follow-up text.
 *
 * Good: "You're back from camping, right? How was it? Tell me the best bit first."
 * Bad:  "Reminder: You went camping. Provide update."
 */

const CAMPING_VARIANTS = [
  "You're back from camping, right? How was it? Tell me the best bit first.",
  "How was camping? Good chaos, bad chaos, or never-again-until-next-time chaos?",
  "I remembered you were away this weekend. Did you end up going, or did life eat the plan?",
];

const TRAVEL_VARIANTS = [
  "Back safe? How did it go?",
  "How was the trip? Give me the highlight reel.",
  "Did you make it back alright? How was everything?",
];

const APPOINTMENT_VARIANTS = [
  "How did the appointment go?",
  "How did it go today?",
  "All done with the appointment? How are you doing?",
];

const TASK_VARIANTS = [
  "Did you get a chance to do that?",
  "How did it go?",
  "Did that happen in the end?",
];

const GENERIC_VARIANTS = [
  "How did that go?",
  "Did things work out?",
  "How are you getting on with that?",
];

function pickVariant(variants, seed = 0) {
  return variants[seed % variants.length];
}

function composeFollowUp({ item, config, seed = 0 }) {
  if (!config.continuity_enabled) return null;

  const topic = String(item.metadata?.event_topic || item.type || "").toLowerCase();
  const title = (item.title || item.summary || "").toLowerCase();

  let variants;
  if (topic === "travel" || title.includes("camping") || title.includes("trip") || title.includes("away")) {
    variants = title.includes("camping") ? CAMPING_VARIANTS : TRAVEL_VARIANTS;
  } else if (topic === "appointment" || topic.includes("medical") || topic.includes("dentist")) {
    variants = APPOINTMENT_VARIANTS;
  } else if (topic === "technical_task" || topic === "work_event") {
    variants = TASK_VARIANTS;
  } else {
    variants = GENERIC_VARIANTS;
  }

  const text = pickVariant(variants, seed);

  // Safety audit
  const audit = auditFollowUpText(text);
  if (!audit.safe) {
    // Fall back to a safe generic
    return "How did that go?";
  }

  return text;
}

/**
 * Compose a companion promise repair message.
 * Acknowledge → own it → brief explanation only if useful → repair → prevent recurrence.
 * Do NOT spiral. Do NOT make owner comfort the companion.
 */
function composePromiseRepair({ promise }) {
  const text = String(promise?.metadata?.promise_text || promise?.title || "a follow-up").slice(0, 100);
  const base = `I missed that. I said I'd follow up on "${text}" and I didn't. That's on me — I've logged it properly now.`;
  const audit = auditFollowUpText(base);
  return audit.safe ? base : `I missed that. I've noted it and won't drop it again.`;
}

/**
 * Compose a gentle owner-promise nudge.
 * Good: "You said you might upload the repo today. Still doing that, or leaving it for later?"
 * Bad:  "You promised me you would upload it."
 */
function composeOwnerPromiseNudge({ promise }) {
  const text = String(promise?.metadata?.promise_text || promise?.title || "that thing").slice(0, 100);
  const nudge = `You mentioned you might ${text.toLowerCase().replace(/^i (said i'd |promised i'd |was going to )?/, "")}. Still happening, or leaving it for later?`;
  const audit = auditFollowUpText(nudge);
  return audit.safe ? nudge : "Did that end up happening?";
}

/**
 * Compose absence re-entry message.
 * Good: "Back with me. Want to pick up the continuity engine?"
 * Bad:  "Where were you?"
 */
function composeAbsenceReentry({ item, lastContext = "" }) {
  const context = String(lastContext || item?.summary || "what we were building").slice(0, 80);
  const text = `Back with me. Want to pick up ${context}, or leave the engine room alone for a bit?`;
  const audit = auditFollowUpText(text);
  return audit.safe ? text : "Good to have you back. Want to pick up where we left off?";
}

module.exports = {
  composeFollowUp,
  composePromiseRepair,
  composeOwnerPromiseNudge,
  composeAbsenceReentry,
};
