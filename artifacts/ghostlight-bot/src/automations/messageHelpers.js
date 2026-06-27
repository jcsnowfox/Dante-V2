const { splitTextIntoChunks } = require("../bot/events/messageCreate");
const {
  isDiscordEntityTooLargeError,
  buildGeneratedImageFallbackUrls,
  buildOversizeFallbackContent,
} = require("../discord/oversizeFallback");
const { normalizeAttachments, summarizeAttachments } = require("../utils/attachments");
const { buildMemoryQueries } = require("../chat/pipeline/retrieveMemory");
const { cacheLatestReadableReply } = require("../audio/latestReplyCache");
const { replaceCustomEmojiLabelsForDiscord } = require("../reactions/customEmojiPalette");
const { sendDiscordMessage } = require("../discord/discordSendGateway");

function buildAutomationInput({ automation, channelId = "", config = {} }) {
  const personaName = String(config.chat?.promptBlocks?.personaName || "").trim() || "Ghostlight";
  const triggerType = String(automation.triggerType || automation.source || "").trim().toLowerCase();
  const triggerLabel = triggerType === "heartbeat"
    ? `Proactive action chosen: ${automation.label}`
    : automation.type === "journal"
      ? `Scheduled journal: ${automation.label}`
      : automation.type === "daily_thread"
        ? `Daily thread opener: ${automation.label}`
        : `Scheduled action: ${automation.label}`;

  return {
    content: triggerLabel,
    authorId: "ghostlight-automation",
    authorName: `${personaName} Automation`,
    channelId: channelId || automation.channelId,
    messageId: `automation-${automation.automationId}`,
    messageTimestamp: new Date().toISOString(),
    attachments: [],
    inputTypes: ["text"],
  };
}

function buildHistoryContent(message) {
  const parts = [];
  const attachments = normalizeAttachments(message.attachments);

  if (message.content?.trim()) {
    parts.push(message.content.trim());
  }

  if (attachments.length) {
    parts.push(summarizeAttachments(attachments));
  }

  return parts.join(" ").trim();
}

async function loadAutomationRecentHistory({ channel, limit = 8, now = new Date(), lookbackMs = null }) {
  const recentMessages = await channel.messages.fetch({ limit: Math.max(limit * 3, limit) });
  const recentMessageList = Array.isArray(recentMessages)
    ? recentMessages
    : Array.from(recentMessages?.values?.() || []);
  const threshold = lookbackMs ? now.getTime() - lookbackMs : null;

  return recentMessageList
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
    .map((item) => ({
      id: item.id,
      authorId: item.author?.id || "",
      authorName: item.member?.displayName || item.author?.globalName || item.author?.username || "unknown",
      isBot: Boolean(item.author?.bot),
      content: buildHistoryContent(item),
      attachments: normalizeAttachments(item.attachments),
      createdTimestamp: item.createdTimestamp,
    }))
    .filter((item) => item.content)
    .filter((item) => threshold === null || item.createdTimestamp >= threshold)
    .slice(-limit);
}

function getAutomationConversationId(channel) {
  if (!channel) {
    return "";
  }

  return channel.isThread?.() ? channel.id : channel.id;
}

async function loadScopedAutomationRecentHistory({
  conversations,
  channel,
  limit = 8,
  now = new Date(),
  lookbackMs = null,
}) {
  const conversationId = getAutomationConversationId(channel);

  if (conversations?.listRecentHistoryByConversationId && conversationId) {
    const threshold = lookbackMs ? now.getTime() - lookbackMs : null;
    const recentHistory = await conversations.listRecentHistoryByConversationId({
      conversationId,
      limit: Math.max(limit * 3, limit),
    });

    return recentHistory
      .sort((left, right) => (left.createdTimestamp || 0) - (right.createdTimestamp || 0))
      .filter((item) => item.content)
      .filter((item) => threshold === null || (item.createdTimestamp || 0) >= threshold)
      .slice(-limit);
  }

  return loadAutomationRecentHistory({ channel, limit, now, lookbackMs });
}

async function retrieveAutomationMemories({ memory, channel, input, mode, conversations }) {
  const scopedHistory = await loadScopedAutomationRecentHistory({
    conversations,
    channel,
    limit: 8,
  });
  const recentUserMessages = scopedHistory
    .filter((item) => !item.isBot && item.content?.trim())
    .map((item) => item.content.trim())
    .slice(-2);

  return memory.retrieve({
    guildId: channel.guildId,
    userId: input.authorId,
    query: buildMemoryQueries({
      input,
      mode,
      recentUserMessages,
    }),
    mode,
  });
}

async function persistAutomationState(store, automation, updates) {
  return store.upsertAutomation({
    automation_id: automation.automationId,
    type: automation.type,
    label: automation.label,
    channel_id: automation.channelId,
    schedule_time: automation.scheduleTime,
    timezone: automation.timezone,
    prompt: automation.prompt,
    thread_title_template: automation.threadTitleTemplate || "",
    thread_starter_prompt: automation.threadStarterPrompt || "",
    thread_mode_key: automation.threadModeKey || "daily",
    enabled: automation.enabled,
    mention_user: automation.mentionUser,
    user_id: automation.userId || "",
    last_run_at: updates.lastRunAt || automation.lastRunAt || "",
    last_error: updates.lastError ?? automation.lastError ?? "",
  }, {
    userScope: automation.userScope,
  });
}

function buildAutomationMetadata({ automation, chunkCount, generatedImageCount = 0, generatedAudioCount = 0 }) {
  return {
    automationId: automation.automationId,
    automationType: automation.type,
    automationLabel: automation.label,
    chunkCount,
    generatedImageCount,
    generatedAudioCount,
  };
}

function normalizeAutomationIdForJournalEntry(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

async function sendChunks(channel, text, { files = [], suppressEmbeds = false, generatedImageIds = [], imageWarnings = [], generatedImages = null, config = {} } = {}) {
  const chunks = splitTextIntoChunks(text);
  const outgoingChunks = splitTextIntoChunks(
    replaceCustomEmojiLabelsForDiscord(text, config.chat?.customReactionEmojis || []),
  );
  let sentMessage = null;

  if (!outgoingChunks.length && Array.isArray(files) && files.length) {
    try {
      sentMessage = (await sendDiscordMessage({ channel, payload: {
        files,
        flags: suppressEmbeds ? ["SuppressEmbeds"] : undefined,
      }, label: "automation-send", throwOnError: true })).sentMessage;
    } catch (error) {
      if (!isDiscordEntityTooLargeError(error)) {
        throw error;
      }

      const fallbackUrls = await buildGeneratedImageFallbackUrls({
        generatedImageIds,
        generatedImages,
        config,
      });

      sentMessage = (await sendDiscordMessage({ channel, payload: {
        content: buildOversizeFallbackContent({
          content: "",
          urls: fallbackUrls,
          imageWarnings,
        }),
        flags: suppressEmbeds ? ["SuppressEmbeds"] : undefined,
      }, label: "automation-send", throwOnError: true })).sentMessage;
    }

    return {
      chunks: [],
      sentMessage,
    };
  }

  for (const [index, chunk] of outgoingChunks.entries()) {
    const isLastChunk = index === outgoingChunks.length - 1;

    try {
      sentMessage = (await sendDiscordMessage({ channel, payload: {
        content: chunk,
        files: isLastChunk ? files : undefined,
        flags: suppressEmbeds ? ["SuppressEmbeds"] : undefined,
      }, label: "automation-send", throwOnError: true })).sentMessage;
    } catch (error) {
      if (!(isLastChunk && Array.isArray(files) && files.length) || !isDiscordEntityTooLargeError(error)) {
        throw error;
      }

      const fallbackUrls = await buildGeneratedImageFallbackUrls({
        generatedImageIds,
        generatedImages,
        config,
      });

      sentMessage = (await sendDiscordMessage({ channel, payload: {
        content: buildOversizeFallbackContent({
          content: chunk,
          urls: fallbackUrls,
          imageWarnings,
        }),
        flags: suppressEmbeds ? ["SuppressEmbeds"] : undefined,
      }, label: "automation-send", throwOnError: true })).sentMessage;
    }
  }

  return {
    chunks,
    sentMessage,
  };
}

async function createForumThreadWithStarterMessage(parentChannel, {
  name,
  reason,
  text,
  files = [],
  suppressEmbeds = false,
  generatedImageIds = [],
  imageWarnings = [],
  generatedImages = null,
  config = {},
}) {
  const chunks = splitTextIntoChunks(text);
  const outgoingChunks = splitTextIntoChunks(
    replaceCustomEmojiLabelsForDiscord(text, config.chat?.customReactionEmojis || []),
  );
  const firstChunk = chunks[0] || "";
  const firstOutgoingChunk = outgoingChunks[0] || "";
  const hasGeneratedImage = Array.isArray(generatedImageIds) && generatedImageIds.length > 0;
  const normalizedFiles = Array.isArray(files) ? files : [];
  const attachFilesToStarter = normalizedFiles.length > 0 && (outgoingChunks.length <= 1 || hasGeneratedImage);
  const overflowFiles = hasGeneratedImage ? [] : normalizedFiles;
  let thread = null;
  let sentMessage = null;

  try {
    thread = await parentChannel.threads.create({
      name,
      autoArchiveDuration: 1440,
      reason,
      message: {
        content: firstOutgoingChunk || undefined,
        files: attachFilesToStarter ? normalizedFiles : undefined,
        flags: suppressEmbeds ? ["SuppressEmbeds"] : undefined,
      },
    });
  } catch (error) {
    if (!attachFilesToStarter || !normalizedFiles.length || !isDiscordEntityTooLargeError(error)) {
      throw error;
    }

    const fallbackUrls = await buildGeneratedImageFallbackUrls({
      generatedImageIds,
      generatedImages,
      config,
    });

    thread = await parentChannel.threads.create({
      name,
      autoArchiveDuration: 1440,
      reason,
      message: {
        content: buildOversizeFallbackContent({
          content: firstOutgoingChunk,
          urls: fallbackUrls,
          imageWarnings,
        }),
        flags: suppressEmbeds ? ["SuppressEmbeds"] : undefined,
      },
    });
  }

  if (outgoingChunks.length > 1) {
    const remaining = await sendChunks(thread, chunks.slice(1).join("\n\n"), {
      files: overflowFiles,
      suppressEmbeds,
      generatedImageIds,
      imageWarnings,
      generatedImages,
      config,
    });

    return {
      thread,
      chunks: [firstChunk, ...remaining.chunks].filter(Boolean),
      sentMessage: remaining.sentMessage,
    };
  }

  if (typeof thread.fetchStarterMessage === "function") {
    sentMessage = await thread.fetchStarterMessage().catch(() => null);
  }

  return {
    thread,
    chunks,
    sentMessage,
  };
}

async function recordAutomationMessage({ conversations, message, config, automation, chunks, generatedImageIds = [], generatedAudioIds = [], cache = null }) {
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
    metadata: buildAutomationMetadata({
      automation,
      chunkCount: chunks.length,
      generatedImageCount: Array.isArray(generatedImageIds) ? generatedImageIds.length : 0,
      generatedAudioCount: Array.isArray(generatedAudioIds) ? generatedAudioIds.length : 0,
    }),
  });

  await cacheLatestReadableReply({
    cache,
    userScope: config.memory?.userScope,
    conversationId: message.channel?.isThread?.() ? message.channel.id : message.channelId,
    messageId: message.id,
    channelId: message.channelId,
    text: chunks.join("\n\n"),
  });
}

module.exports = {
  buildAutomationInput,
  loadAutomationRecentHistory,
  getAutomationConversationId,
  loadScopedAutomationRecentHistory,
  retrieveAutomationMemories,
  persistAutomationState,
  normalizeAutomationIdForJournalEntry,
  sendChunks,
  createForumThreadWithStarterMessage,
  recordAutomationMessage,
};
