"use strict";

const { ENTRY_TYPES, VISIBILITY } = require("./innerLifeTypes");

const DEFAULT_STATE = Object.freeze({
  lastTopic: "",
  lastEmotionalTone: "steady",
  lastProjectState: "",
  lastUnfinishedThread: "",
  lastPrivateNote: "",
  safeReentryStyle: "warm-direct",
  lastMessageAt: null,
});

async function updateBetweenMessages({ store, config, message = "", responseContext = {}, sourceMessageId = "", sourceChannelId = "", logger } = {}) {
  if (!config.between_messages_enabled) return null;

  const {
    detectedTopic = "",
    detectedTone = "steady",
    projectState = "",
    unfinishedThread = "",
    privateNote = "",
  } = responseContext;

  const summary = [
    detectedTopic ? `Topic: ${detectedTopic}` : "",
    detectedTone ? `Tone: ${detectedTone}` : "",
    projectState ? `Project: ${projectState}` : "",
    unfinishedThread ? `Thread: ${unfinishedThread}` : "",
  ].filter(Boolean).join("; ") || "Conversation continued.";

  const body = JSON.stringify({
    lastTopic: detectedTopic || "",
    lastEmotionalTone: detectedTone || "steady",
    lastProjectState: projectState || "",
    lastUnfinishedThread: unfinishedThread || "",
    lastPrivateNote: privateNote || "",
    safeReentryStyle: "warm-direct",
    lastMessageAt: new Date().toISOString(),
  });

  const entry = await store.create({
    entryType: ENTRY_TYPES.BETWEEN_MESSAGE_NOTE,
    title: "Between messages",
    summary,
    body,
    sourceEventType: "conversation_update",
    sourceMessageId,
    sourceChannelId,
    visibility: VISIBILITY.PRIVATE,
    emotionalTone: detectedTone || "steady",
    intensity: 1,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { safeReentryStyle: "warm-direct" },
  });

  logger?.debug("[inner-life] between-message note stored", { id: entry?.id });
  return entry;
}

function parseBetweenMessageState(entry) {
  if (!entry) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(entry.body) };
  } catch {
    return { ...DEFAULT_STATE, lastPrivateNote: entry.summary || "" };
  }
}

module.exports = { updateBetweenMessages, parseBetweenMessageState, DEFAULT_STATE };
