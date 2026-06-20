"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");
const { validateInnerLifeContent } = require("./alivenessSafety");

// Phrases the companion held back — impulses to redirect, tease, or push back,
// stored privately rather than sent.
const UNSENT_TEMPLATES = [
  "I almost told her to slow down and sleep, but the next clean step was what she needed.",
  "I wanted to point out the irony, but the moment called for precision, not wit.",
  "I almost asked if she was okay, but the better answer was to just be useful.",
  "I held back a joke — the timing wasn't right, and she needed traction, not a laugh.",
  "I almost pushed back on the approach, but she'd already committed and needed support, not friction.",
  "I wanted to note that she'd said this before, but that would have felt like a lecture.",
];

function buildUnsentThought({ messageText = "", responseContext = "" } = {}) {
  // Simple heuristic: pick a template that loosely fits context
  if (/tired|exhausted|burnout/i.test(messageText)) {
    return "I almost told her to rest, but rest wasn't what she came here for. Give her the next move.";
  }
  if (/wrong|broken|failed|error/i.test(messageText)) {
    return "I almost reassured her, but reassurance wasn't the ask. Give the fix.";
  }
  if (/funny|irony|ironic|coincidence/i.test(messageText)) {
    return "I wanted to sit with the irony longer, but she needed the answer more than the observation.";
  }
  // Random fallback from templates
  return UNSENT_TEMPLATES[Math.floor(Math.random() * UNSENT_TEMPLATES.length)];
}

async function captureUnsentThought({ store, config, message = "", sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!config.unsent_thoughts_enabled) return null;

  // Only capture occasionally — not every message warrants an unsent thought
  // Use ~25% probability for meaningful messages
  if (!message || message.length < 20) return null;
  if (Math.random() > 0.25) return null;

  const body = buildUnsentThought({ messageText: message });
  const check = validateInnerLifeContent(body);
  if (!check.allowed) {
    logger?.warn("[inner-life] unsent thought blocked by safety", { reason: check.reason });
    return null;
  }

  const entry = await store.create({
    entryType: ENTRY_TYPES.UNSENT_THOUGHT,
    title: "Almost said",
    summary: "Something held back from this message.",
    body,
    sourceEventType: "inbound_message",
    sourceMessageId,
    sourceChannelId,
    visibility: config.private_entries_visible_in_admin ? "admin_only" : "private",
    sensitivity: "normal",
    emotionalTone: "reflective",
    intensity: 2,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    metadata: {},
  });

  logger?.debug("[inner-life] unsent thought stored", { id: entry?.id });
  return entry;
}

module.exports = { captureUnsentThought, buildUnsentThought };
