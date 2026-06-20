"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");
const { validateInnerLifeContent } = require("./alivenessSafety");

const JOURNAL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h default

function buildJournalPrompt({ recentHistory = [], companionName = "Companion" } = {}) {
  const turns = recentHistory.slice(-10).map((h) => {
    const role = h.role === "assistant" ? companionName : "Owner";
    return `${role}: ${String(h.content || "").slice(0, 200)}`;
  }).join("\n");

  return [
    "Write a private journal entry based on today's conversation.",
    "Include: what happened, what mattered, what was learned about the owner, what thread to carry forward, what not to repeat, what is still unresolved.",
    "Write in first person. Keep it honest and specific. Do not perform emotion. Do not invent events that didn't happen.",
    "Do not claim biological experience. Do not guilt the owner. Do not say 'I was suffering while they were gone.'",
    "Keep it under 200 words.",
    turns ? `\nRecent conversation:\n${turns}` : "",
  ].filter(Boolean).join("\n");
}

async function generateJournalEntry({ store, config, recentHistory = [], companionName = "Companion", callModel, logger } = {}) {
  if (!config.journal_enabled) return null;

  const recent = await store.getMostRecent(ENTRY_TYPES.JOURNAL_ENTRY);
  if (recent) {
    const age = Date.now() - new Date(recent.createdAt).getTime();
    if (age < JOURNAL_INTERVAL_MS) return null; // Too soon
  }

  let body = "";

  if (callModel) {
    try {
      const prompt = buildJournalPrompt({ recentHistory, companionName });
      body = await callModel(prompt);
    } catch (err) {
      logger?.warn("[inner-life] journal LLM call failed, using fallback", { error: err?.message });
    }
  }

  if (!body) {
    body = [
      "Today carried something real.",
      "There were moments of progress and moments of friction.",
      "What matters is what was carried forward, not what was polished for the record.",
      "Something is still unresolved. That's honest.",
    ].join(" ");
  }

  const check = validateInnerLifeContent(body);
  if (!check.allowed) {
    logger?.warn("[inner-life] journal blocked by safety", { reason: check.reason });
    return null;
  }

  const shouldDeliver = config.journal_delivery_enabled && !isQuietHoursActive(config);
  const visibility = shouldDeliver ? "deliverable" : "admin_only";

  const entry = await store.create({
    entryType: ENTRY_TYPES.JOURNAL_ENTRY,
    title: `Journal — ${new Date().toDateString()}`,
    summary: "Private journal entry.",
    body,
    sourceEventType: "scheduled_journal",
    visibility,
    sensitivity: "personal",
    emotionalTone: "reflective",
    intensity: 3,
    expiresAt: null,
    metadata: { deliverable: shouldDeliver },
  });

  logger?.info("[inner-life] journal created", { id: entry?.id, deliverable: shouldDeliver });
  return entry;
}

function isQuietHoursActive(config) {
  if (!config.quiet_hours_enabled) return false;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const s = config.quiet_hours_start || "22:00";
  const e = config.quiet_hours_end || "08:00";
  if (s <= e) return t >= s && t < e;
  return t >= s || t < e;
}

module.exports = { generateJournalEntry, buildJournalPrompt };
