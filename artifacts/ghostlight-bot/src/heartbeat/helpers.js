const crypto = require("node:crypto");
const { ChannelType } = require("discord.js");
const { splitTextIntoChunks } = require("../bot/events/messageCreate");
const { buildMemoryQueries } = require("../chat/pipeline/retrieveMemory");
const { replaceCustomEmojiLabelsForDiscord } = require("../reactions/customEmojiPalette");
const { sendDiscordMessage } = require("../discord/discordSendGateway");
const {
  CACHE_KEYS,
  CONTEXT_LOOKBACK_DAYS,
  DEBUG_EVENT_LIMIT,
  HEARTBEAT_JITTER_MINUTES,
  ACTION_COOLDOWN_HOURS,
  RECENT_CONTEXT_MESSAGE_LIMIT,
} = require("./constants");

function getLocalDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    timeKey: `${map.hour}:${map.minute}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function getHeartbeatDateKey(now, timeZone) {
  return getLocalDateParts(now, timeZone).dateKey;
}

function getTickSlotKey(now, timeZone) {
  const local = getLocalDateParts(now, timeZone);
  const slotMinute = local.minute < 30 ? "00" : "30";
  return `${local.dateKey}T${String(local.hour).padStart(2, "0")}:${slotMinute}`;
}

function normalizeTimeValue(value, fallback) {
  const normalized = String(value || "").trim() || fallback;
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : fallback;
}

function timeValueToMinutes(value) {
  const [hours, minutes] = normalizeTimeValue(value, "00:00").split(":").map(Number);
  return (hours * 60) + minutes;
}

function isInQuietHours(now, timeZone, { enabled, start, end }) {
  if (!enabled) {
    return false;
  }

  const current = getLocalDateParts(now, timeZone);
  const currentMinutes = (current.hour * 60) + current.minute;
  const startMinutes = timeValueToMinutes(start);
  const endMinutes = timeValueToMinutes(end);

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function isTextChannel(channel) {
  return Boolean(channel?.isTextBased?.());
}

function isThreadCapableChannel(channel) {
  return channel?.type === ChannelType.GuildText;
}

function stripCodeFences(text) {
  const normalized = String(text || "").trim();

  if (!normalized.startsWith("```")) {
    return normalized;
  }

  return normalized
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(stripCodeFences(text));
  } catch (_error) {
    return null;
  }
}

function buildActionDailyCountKey(actionId, dateKey) {
  return `heartbeat:action:${String(actionId || "").trim()}:today_count:${dateKey}`;
}

function buildActionLastUsedKey(actionId) {
  return `heartbeat:action:${String(actionId || "").trim()}:last_used_at`;
}

function buildTodayCountKey(dateKey) {
  return `heartbeat:today_count:${dateKey}`;
}

function coerceNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getActionCooldownHours(action = {}) {
  const actionType = String(action.actionType || "message").trim().toLowerCase() || "message";
  const frequency = String(action.frequency || "normal").trim().toLowerCase();
  const cooldowns = ACTION_COOLDOWN_HOURS[actionType];

  if (!cooldowns) {
    return 0;
  }

  return cooldowns[frequency] ?? cooldowns.normal ?? 0;
}

function getDeterministicJitterMinutes(slotKey, userScope = "", maxJitterMinutes = HEARTBEAT_JITTER_MINUTES) {
  const digest = crypto
    .createHash("sha1")
    .update(`${slotKey}:${userScope}`)
    .digest();

  return digest.readUInt32BE(0) % (maxJitterMinutes + 1);
}

function normalizeDecisionHistory(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

async function readRecentDecisions(cache) {
  return normalizeDecisionHistory(await cache.get(CACHE_KEYS.recentDecisions));
}

async function writeRecentDecision({ cache, decision, limit }) {
  const recent = await readRecentDecisions(cache);
  const next = [decision, ...recent].slice(0, limit);
  await cache.set(CACHE_KEYS.recentDecisions, next);
  return next;
}

async function readRecentDebugEvents(cache) {
  return normalizeDecisionHistory(await cache.get(CACHE_KEYS.recentDebugEvents));
}

async function writeRecentDebugEvent({ cache, event, limit = DEBUG_EVENT_LIMIT }) {
  const recent = await readRecentDebugEvents(cache);
  const next = [event, ...recent].slice(0, limit);
  await cache.set(CACHE_KEYS.recentDebugEvents, next);
  return next;
}

async function sendChunks(channel, text, { config = {} } = {}) {
  const normalizedText = String(text || "").trim();
  const chunks = splitTextIntoChunks(normalizedText);
  const outgoingChunks = splitTextIntoChunks(
    replaceCustomEmojiLabelsForDiscord(normalizedText, config.chat?.customReactionEmojis || []),
  );
  let sentMessage = null;

  for (const chunk of outgoingChunks) {
    sentMessage = (await sendDiscordMessage({ channel, payload: { content: chunk }, label: "heartbeat-send", throwOnError: true })).sentMessage;
  }

  return {
    chunks,
    sentMessage,
  };
}

async function recordHeartbeatMessage({ conversations, config, action, message, chunks, metadata = {} }) {
  if (!message) {
    return;
  }

  await conversations.recordEvent({
    message,
    role: "assistant",
    source: "ghostlight",
    eventType: "message",
    contentText: chunks.join("\n\n"),
    authorName:
      message.member?.displayName ||
      message.author?.globalName ||
      message.author?.username ||
      config.chat?.promptBlocks?.personaName ||
      "Ghostlight",
    metadata: {
      heartbeat: true,
      actionId: action.actionId,
      actionLabel: action.name || action.label,
      executorType: action.executorType || action.actionType,
      ...metadata,
    },
  });
}

async function loadRecentChannelHistory(channel, limit = RECENT_CONTEXT_MESSAGE_LIMIT) {
  if (!isTextChannel(channel)) {
    return [];
  }

  const recentMessages = await channel.messages.fetch({ limit: Math.max(limit * 2, limit) });
  const recentMessageList = Array.isArray(recentMessages)
    ? recentMessages
    : Array.from(recentMessages?.values?.() || []);

  return recentMessageList
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
    .filter((item) => !item.system)
    .filter((item) => item.content?.trim())
    .slice(-limit)
    .map((item) => ({
      id: item.id,
      content: item.content.trim(),
      createdTimestamp: item.createdTimestamp,
      isBot: Boolean(item.author?.bot),
      authorId: item.author?.id || "",
      authorName: item.member?.displayName || item.author?.globalName || item.author?.username || "unknown",
    }));
}

function eventMatchesContextScope(event, includedChannelIds) {
  if (!includedChannelIds.length) {
    return true;
  }

  const metadata = event?.metadata || {};
  return includedChannelIds.includes(event.channel_id)
    || includedChannelIds.includes(metadata.parentChannelId || "")
    || includedChannelIds.includes(metadata.sourceChannelId || "");
}

async function loadRecentServerContext({
  conversations,
  config,
  now = new Date(),
  limit = RECENT_CONTEXT_MESSAGE_LIMIT,
  additionalChannelIds = [],
}) {
  const endDate = now.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - (CONTEXT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
  const configuredChannelIds = Array.isArray(config.memory?.dailySummaryChannelIds)
    ? config.memory.dailySummaryChannelIds.filter(Boolean)
    : [];
  const includedChannelIds = [
    ...new Set([
      ...configuredChannelIds,
      ...(Array.isArray(additionalChannelIds) ? additionalChannelIds : []),
    ].map((channelId) => String(channelId || "").trim()).filter(Boolean)),
  ];
  const guildId = String(config.discord?.guildId || "").trim();
  const events = conversations.listRecentEventsByDateRange
    ? await conversations.listRecentEventsByDateRange({
      startDate,
      endDate,
      limit: 500,
      includeSummaries: false,
    })
    : await conversations.listEventsByDateRange({
      startDate,
      endDate,
      limit: 5000,
      includeSummaries: false,
    });

  const eventsByHistoryId = new Map(events.map((event) => [
    String(event.discord_message_id || event.id || ""),
    event,
  ]));

  return conversations
    .mapEventsToHistoryItems(events)
    .filter((item) => item.eventType === "message")
    .filter((item) => !guildId || eventsByHistoryId.get(String(item.id || ""))?.guild_id === guildId)
    .filter((item) => item.content)
    .filter((item) => {
      if (!includedChannelIds.length) {
        return true;
      }

      const sourceEvent = eventsByHistoryId.get(String(item.id || ""));
      return sourceEvent ? eventMatchesContextScope(sourceEvent, includedChannelIds) : false;
    })
    .slice(-limit);
}

function buildHeartbeatInput({ config = {}, action, tone, executorLabel, targetLabel, jsonSchema = null }) {
  const personaName = String(config.chat?.promptBlocks?.personaName || "").trim() || "Ghostlight";
  const parts = [
    `Heartbeat proactive action: ${executorLabel}`,
    "Internal trigger: this is not a live user message or request.",
    "Treat the action as something you chose to initiate from the saved Heartbeat list; do not imply the user just picked it or asked for it.",
    `Target: ${targetLabel}`,
    `Internal action prompt: ${action.prompt}`,
  ];

  if (tone) {
    parts.push(`Tone hint from conductor: ${tone}`);
  }

  if (jsonSchema) {
    parts.push(jsonSchema);
  }

  return {
    content: parts.join("\n\n"),
    authorId: "ghostlight-heartbeat",
    authorName: `${personaName} Heartbeat`,
    channelId: "",
    messageId: `heartbeat-${action.actionId}`,
    messageTimestamp: new Date().toISOString(),
    attachments: [],
    inputTypes: ["text"],
  };
}

function buildRecentContextExcerpt(recentMessages = [], limit = 4) {
  return recentMessages
    .slice(-limit)
    .map((item) => `${item.authorName}: ${item.content}`)
    .join("\n");
}

function describeTargetLabel(action, target) {
  return target?.mode?.label
    || target?.mode?.name
    || action.targetChannelId
    || "target channel";
}

function buildPromptPreview(prompt, maxLength = 100) {
  const normalized = String(prompt || "").trim().replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}...`
    : normalized;
}

async function retrieveHeartbeatMemories({
  memory,
  config,
  target,
  input,
  recentMessages = [],
}) {
  if (!memory?.retrieve || !target?.channelId) {
    return [];
  }

  const recentUserMessages = recentMessages
    .filter((item) => item.role === "user" && String(item.content || "").trim())
    .map((item) => String(item.content).trim())
    .slice(-3);
  const latestUserMessage = recentUserMessages.at(-1) || "";
  const continuityMessages = recentUserMessages.slice(0, -1);
  const retrievalInput = latestUserMessage
    ? { ...input, content: latestUserMessage }
    : input;

  return memory.retrieve({
    guildId: String(config.discord?.guildId || "").trim(),
    userId: String(config.chat?.userId || "").trim() || input.authorId,
    query: buildMemoryQueries({
      input: retrievalInput,
      mode: target.mode || { name: config.chat?.defaultMode || "default" },
      recentUserMessages: continuityMessages,
    }),
    mode: target.mode || { name: config.chat?.defaultMode || "default" },
  });
}

module.exports = {
  getLocalDateParts,
  getHeartbeatDateKey,
  getTickSlotKey,
  normalizeTimeValue,
  timeValueToMinutes,
  isInQuietHours,
  isTextChannel,
  isThreadCapableChannel,
  stripCodeFences,
  safeJsonParse,
  buildActionDailyCountKey,
  buildActionLastUsedKey,
  buildTodayCountKey,
  coerceNumber,
  getActionCooldownHours,
  getDeterministicJitterMinutes,
  normalizeDecisionHistory,
  readRecentDecisions,
  writeRecentDecision,
  readRecentDebugEvents,
  writeRecentDebugEvent,
  sendChunks,
  recordHeartbeatMessage,
  loadRecentChannelHistory,
  eventMatchesContextScope,
  loadRecentServerContext,
  buildHeartbeatInput,
  buildRecentContextExcerpt,
  describeTargetLabel,
  buildPromptPreview,
  retrieveHeartbeatMemories,
};
