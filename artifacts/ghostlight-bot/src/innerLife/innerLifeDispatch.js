"use strict";

const { sendDiscordMessage } = require("../discord/discordSendGateway");
const { shouldPostAutonomyEvent, recordAutonomyPost, sanitizeAutonomyContent, getAutonomyPostingConfig } = require("./autonomyPostingGate");

const AUTONOMY_DEFAULT_CHANNEL_ID = "1513266945577717881";
const DIAGNOSTIC_DEFAULT_CHANNEL_ID = "1520510624617201804";
const disabledChannels = new Map();
const DISABLED_CHANNEL_TTL_MS = 60 * 60 * 1000;

function isChannelTemporarilyDisabled(channelId, now = Date.now()) {
  const disabledUntil = disabledChannels.get(String(channelId || ""));
  if (!disabledUntil) return false;
  if (disabledUntil <= now) {
    disabledChannels.delete(String(channelId || ""));
    return false;
  }
  return true;
}

function disableChannelTemporarily(channelId, now = Date.now()) {
  const target = String(channelId || "").trim();
  if (target) disabledChannels.set(target, now + DISABLED_CHANNEL_TTL_MS);
}

function getAutonomyChannelId(config = {}) {
  return String(config?.innerLife?.autonomyChannelId || process.env.INNER_LIFE_AUTONOMY_CHANNEL_ID || AUTONOMY_DEFAULT_CHANNEL_ID).trim();
}

function getDiagnosticChannelId(config = {}) {
  return String(config?.innerLife?.diagnosticChannelId || process.env.INNER_LIFE_DIAGNOSTIC_CHANNEL_ID || DIAGNOSTIC_DEFAULT_CHANNEL_ID).trim();
}

function truncate(text, max = 1400) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function formatEntryMessage(entry, { diagnostic = false, debug = false } = {}) {
  if (!diagnostic) return truncate(sanitizeAutonomyContent(entry, { debug }), 1800);
  const title = entry?.title || "Diagnostic self-check";
  const body = entry?.body || entry?.summary || "No body recorded.";
  const source = debug && entry?.sourceEventType ? `\nsource: ${entry.sourceEventType}` : "";
  return [`**${truncate(title, 160)}**`, truncate(body), source].filter(Boolean).join("\n\n");
}

async function sendInnerLifeMessage({ client, channelId, content, logger, label = "inner-life" } = {}) {
  const target = String(channelId || "").trim();
  if (!client || !target || !content) return { skipped: true, reason: "missing_deps" };
  if (isChannelTemporarilyDisabled(target)) return { skipped: true, reason: "channel_temporarily_disabled", channelId: target };
  const result = await sendDiscordMessage({
    client,
    channelId: target,
    content: truncate(content, 1900),
    logger,
    label,
  });
  if (result?.reason === "missing_permissions" || result?.reason === "unknown_channel") {
    disableChannelTemporarily(target);
  }
  return result;
}

async function dispatchAutonomyEntry({ client, config, logger, entry, context = {} } = {}) {
  const channelId = getAutonomyChannelId(config);
  const decision = shouldPostAutonomyEvent(entry, { ...context, config, channelId });
  if (!decision.allowed) {
    logger?.debug?.("[inner-life-autonomy] post suppressed", { reason: decision.reason, source: entry?.sourceEventType || null, score: decision.score });
    return { skipped: true, reason: decision.reason, score: decision.score };
  }
  const result = await sendInnerLifeMessage({
    client,
    channelId,
    content: formatEntryMessage(entry, { debug: getAutonomyPostingConfig(config).debug }),
    logger,
    label: "inner-life-autonomy",
  });
  if (!result?.skipped) recordAutonomyPost(decision);
  return result;
}

async function dispatchDiagnosticEntry({ client, config, logger, entry, content = "" } = {}) {
  return sendInnerLifeMessage({
    client,
    channelId: getDiagnosticChannelId(config),
    content: content || formatEntryMessage(entry, { diagnostic: true }),
    logger,
    label: "inner-life-diagnostic",
  });
}

module.exports = {
  AUTONOMY_DEFAULT_CHANNEL_ID,
  DIAGNOSTIC_DEFAULT_CHANNEL_ID,
  getAutonomyChannelId,
  getDiagnosticChannelId,
  formatEntryMessage,
  sendInnerLifeMessage,
  dispatchAutonomyEntry,
  dispatchDiagnosticEntry,
  isChannelTemporarilyDisabled,
  disableChannelTemporarily,
  shouldPostAutonomyEvent,
};
