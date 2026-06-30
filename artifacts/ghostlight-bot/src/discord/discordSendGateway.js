"use strict";

/**
 * Canonical autonomous/system Discord send gateway.
 *
 * Interactive user replies may still use the messageCreate reply path because
 * that path owns typing, chunking, reply-specific media fallback, and user
 * conversation persistence. Autonomous/system output must route here.
 */

function sanitizeLogValue(value) {
  return String(value || "").replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g, "[redacted-token]");
}

function normalizePayload(payload = {}) {
  const out = { ...payload };
  if (out.content !== undefined) out.content = String(out.content || "").slice(0, 2000);
  out.allowedMentions = out.allowedMentions || { parse: [] };
  return out;
}

function isTextChannel(channel) {
  return Boolean(channel?.isTextBased?.() || channel?.send);
}

function classifyDiscordSendError(error) {
  const code = String(error?.code || error?.rawError?.code || "");
  const message = String(error?.message || "");
  if (code === "50013" || /missing permissions/i.test(message)) return "missing_permissions";
  if (code === "10003" || /unknown channel/i.test(message)) return "unknown_channel";
  return "send_failed";
}

async function sendDiscordMessage({
  channel = null,
  client = null,
  channelId = "",
  payload = {},
  content = null,
  logger = null,
  label = "discord-send-gateway",
  autonomousSource = "",
  actionId = null,
  scheduleId = null,
  actionName = "",
  actionType = "",
  promptSource = "",
  toolsAllowed = false,
  toolsUsed = [],
  quietHours = false,
  cooldownApplied = false,
  idempotencyKey = "",
  throwOnError = false,
} = {}) {
  const targetId = String(channelId || channel?.id || "").trim();
  const messagePayload = normalizePayload(content !== null ? { content } : payload);
  const source = String(autonomousSource || label || "").trim();
  const attribution = {
    autonomous_source: source,
    actionId,
    scheduleId,
    actionName: String(actionName || label || ""),
    actionType: String(actionType || ""),
    targetChannelId: targetId || null,
    sendMethod: "discordSendGateway",
    promptSource: String(promptSource || ""),
    toolsAllowed: Boolean(toolsAllowed),
    toolsUsed: Array.isArray(toolsUsed) ? toolsUsed : [],
    quietHours: Boolean(quietHours),
    cooldownApplied: Boolean(cooldownApplied),
    idempotencyKey: String(idempotencyKey || ""),
  };
  if (!source) {
    logger?.warn?.("[discord-send-gateway] autonomous send blocked: missing source", attribution);
    return { skipped: true, reason: "missing_autonomous_source", channelId: targetId || null };
  }
  if (!channel && client && targetId) {
    channel = await client.channels.fetch(targetId).catch((error) => {
      logger?.warn?.(`[${label}] channel fetch failed`, { channelId: targetId, error: sanitizeLogValue(error?.message) });
      return null;
    });
  }
  if (!channel || !isTextChannel(channel)) return { skipped: true, reason: "not_text_channel", channelId: targetId || null };

  try {
    logger?.info?.(`[${label}] autonomous send requested`, attribution);
    const sent = await channel.send(messagePayload);
    logger?.info?.(`[${label}] autonomous send succeeded`, { ...attribution, postedMessageId: sent?.id || null, threadId: sent?.thread?.id || null });
    return { sent: true, sentMessage: sent, messageId: sent?.id || null, channelId: sent?.channelId || targetId || null };
  } catch (error) {
    const reason = classifyDiscordSendError(error);
    logger?.warn?.(`[${label}] send failed`, { ...attribution, reason, error: sanitizeLogValue(error?.message) });
    if (throwOnError) throw error;
    return { skipped: true, reason, error: sanitizeLogValue(error?.message), channelId: targetId || null };
  }
}

module.exports = { sendDiscordMessage, normalizePayload, sanitizeLogValue, classifyDiscordSendError };
