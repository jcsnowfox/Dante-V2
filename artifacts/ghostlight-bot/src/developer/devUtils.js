"use strict";

// Developer/diagnostic mode helpers.
//
// JC (the builder, Discord ID below) gets special treatment in any channel
// whose name contains "test" (case-insensitive):
//   - the companion persona / roleplay is dropped entirely
//   - log-dump requests are answered directly without hitting the LLM
//
// Additional developer user IDs can be added via the DEVELOPER_USER_IDS
// environment variable (comma-separated Discord user IDs).

const JC_USER_ID = "608669463427940362";

const EXTRA_DEV_IDS = String(process.env.DEVELOPER_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DEV_USER_IDS = new Set([JC_USER_ID, ...EXTRA_DEV_IDS]);

const DEV_CHANNEL_PATTERN = /test/i;

function isDevUser(userId) {
  return DEV_USER_IDS.has(String(userId || ""));
}

function isDevChannel(channelName) {
  return DEV_CHANNEL_PATTERN.test(String(channelName || ""));
}

function isDevMode(message) {
  return (
    isDevUser(message.author?.id) &&
    isDevChannel(message.channel?.name || "")
  );
}

const LOG_REQUEST_PATTERNS = [
  /^(logs?|show\s+logs?|get\s+logs?|railway\s+logs?|deployment\s+logs?|bot\s+logs?)$/i,
  /\b(show|get|fetch|pull|grab|see|check|view|print)\b.{0,40}\b(log|logs)\b/i,
  /\b(railway|deployment|server|bot)\s+(log|logs)\b/i,
  /\b(latest|recent|last|current)\s+(log|logs)\b/i,
  /\b(log|logs)\b.{0,25}\b(railway|deployment|server|bot)\b/i,
  /\bwhat['']?s?\s+(in\s+)?(the\s+)?logs?\b/i,
];

function isLogRequest(text) {
  const t = String(text || "").trim();
  return t.length > 0 && LOG_REQUEST_PATTERNS.some((p) => p.test(t));
}

const DEV_SYSTEM_PROMPT = [
  "You are the core AI engine powering this companion bot. You are in DEVELOPER MODE —",
  "no persona, no roleplay, no character voice.",
  "Respond directly, technically, and concisely.",
  "You can discuss how the bot works, describe system state, help diagnose issues,",
  "and answer any technical questions the developer has.",
  "Treat the user as the co-builder of this system, not as the companion's end user.",
].join(" ");

module.exports = {
  JC_USER_ID,
  DEV_USER_IDS,
  isDevUser,
  isDevChannel,
  isDevMode,
  isLogRequest,
  DEV_SYSTEM_PROMPT,
};
