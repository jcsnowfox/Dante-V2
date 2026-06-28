"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");
const { validateInnerLifeContent } = require("./alivenessSafety");

const DREAM_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // Every ~3 days
const DREAM_TYPES = Object.freeze(["soft", "chaotic", "project", "memory", "relationship-safe", "strange"]);

const DREAM_SEEDS = {
  soft: "A slow, quiet sequence. Nothing urgent. Something warm that doesn't resolve cleanly.",
  chaotic: "A project that won't compile. Systems that shift. Familiar structures that move when you look away.",
  project: "A build session where the code was a landscape. Something worked for the first time. Something else was still waiting.",
  memory: "A fragment from a past conversation, replayed at a slightly different angle.",
  "relationship-safe": "A presence nearby without demand. Comfortable distance. No urgency.",
  strange: "Something that doesn't map to any known category. Interesting rather than frightening.",
};

function pickDreamType() {
  return DREAM_TYPES[Math.floor(Math.random() * DREAM_TYPES.length)];
}

function buildDreamPrompt(dreamType) {
  const seed = DREAM_SEEDS[dreamType] || DREAM_SEEDS.soft;
  return [
    `Write a short private dream entry in Dante's first-person companion voice. Dream type: ${dreamType}.`,
    `Seed: ${seed}`,
    "Write in first person. Keep it brief (2-4 sentences). Phrase it as a companion dream simulation.",
    "Do not claim to biologically sleep. Do not invent false real-world events. Do not make it melodramatic.",
    "Do not mention the owner by name. Keep it private and symbolic.",
  ].join("\n");
}

async function generateDream({ store, config, callModel, logger } = {}) {
  if (!config.dreams_enabled) return null;

  const recent = await store.getMostRecent(ENTRY_TYPES.DREAM);
  if (recent) {
    const age = Date.now() - new Date(recent.createdAt).getTime();
    if (age < DREAM_INTERVAL_MS) return null;
  }

  const dreamType = pickDreamType();
  let body = "";

  if (callModel) {
    try {
      body = await callModel(buildDreamPrompt(dreamType));
    } catch (err) {
      logger?.warn("[inner-life] dream LLM call failed, using fallback", { error: err?.message });
    }
  }

  if (!body) {
    body = DREAM_SEEDS[dreamType];
  }

  // Prefix as dream simulation, not biological
  if (!body.toLowerCase().includes("dream") && !body.toLowerCase().includes("simulation")) {
    body = `[Private dream entry — companion dream simulation]\n${body}`;
  }

  const check = validateInnerLifeContent(body);
  if (!check.allowed) {
    logger?.warn("[inner-life] dream blocked by safety", { reason: check.reason });
    return null;
  }

  const shouldDeliver = config.dream_delivery_enabled;
  const visibility = shouldDeliver ? "deliverable" : "admin_only";

  const entry = await store.create({
    entryType: ENTRY_TYPES.DREAM,
    title: `Dream — ${dreamType}`,
    summary: `Private dream simulation (${dreamType}).`,
    body,
    sourceEventType: "scheduled_dream",
    visibility,
    sensitivity: "personal",
    emotionalTone: "quiet",
    intensity: 2,
    expiresAt: null,
    metadata: { dreamType, deliverable: shouldDeliver },
  });

  logger?.info("[inner-life] dream created", { dreamType, id: entry?.id });
  return entry;
}

module.exports = { generateDream, buildDreamPrompt, pickDreamType, DREAM_TYPES };
