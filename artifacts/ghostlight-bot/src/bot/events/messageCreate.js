const DISCORD_MESSAGE_MAX_LENGTH = 2000;
const DEFAULT_TYPING_INDICATOR_TIMEOUT_MS = 2000;
const STANDALONE_URL_PATTERN = /^https?:\/\/\S+$/i;
const STANDALONE_MEDIA_URL_PATTERN = /\.(?:gif|webp|png|jpe?g)(?:[?#].*)?$/i;
const STANDALONE_GIF_PROVIDER_PATTERN = /(?:^https?:\/\/(?:media\.)?giphy\.com\/|^https?:\/\/giphy\.com\/gifs\/|^https?:\/\/(?:media\.|c\.)?tenor\.com\/|^https?:\/\/tenor\.com\/view\/)/i;
const {
  isDiscordEntityTooLargeError,
  buildGeneratedImageFallbackUrls,
  buildOversizeFallbackContent,
} = require("../../discord/oversizeFallback");
const { cacheLatestReadableReply } = require("../../audio/latestReplyCache");
const { replaceCustomEmojiLabelsForDiscord } = require("../../reactions/customEmojiPalette");
const { isDevMode, isLogRequest } = require("../../developer/devUtils");
const { getLogsForDevReport, formatLogsForDiscord } = require("../../developer/railwayLogs");
const { applyRuntimeSettings } = require("../../config/runtimeSettings");

function splitAroundStandaloneUrls(text) {
  const normalizedText = String(text || "").trim();

  if (!normalizedText) {
    return [];
  }

  const lines = normalizedText.split("\n");
  const segments = [];
  let currentLines = [];

  function pushCurrentLines() {
    const segment = currentLines.join("\n").trim();

    if (segment) {
      segments.push(segment);
    }

    currentLines = [];
  }

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (
      STANDALONE_URL_PATTERN.test(trimmedLine)
      && (
        STANDALONE_MEDIA_URL_PATTERN.test(trimmedLine)
        || STANDALONE_GIF_PROVIDER_PATTERN.test(trimmedLine)
      )
    ) {
      pushCurrentLines();
      segments.push(trimmedLine);
      continue;
    }

    currentLines.push(line);
  }

  pushCurrentLines();
  return segments;
}

function splitTextIntoChunks(text, maxLength = DISCORD_MESSAGE_MAX_LENGTH) {
  const segments = splitAroundStandaloneUrls(text);

  if (!segments.length) {
    return [];
  }

  if (segments.length === 1 && segments[0].length <= maxLength) {
    return segments;
  }

  const chunks = [];
  let currentChunk = "";

  function pushCurrentChunk() {
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
  }

  function appendSegment(segment) {
    if (!segment) {
      return;
    }

    if (!currentChunk) {
      currentChunk = segment;
      return;
    }

    const candidate = `${currentChunk}\n\n${segment}`;

    if (candidate.length <= maxLength) {
      currentChunk = candidate;
      return;
    }

    pushCurrentChunk();
    currentChunk = segment;
  }

  function splitOversizedSegment(segment) {
    if (segment.length <= maxLength) {
      appendSegment(segment);
      return;
    }

    const lines = segment.split("\n");
    let lineChunk = "";

    function pushLineChunk() {
      if (lineChunk.trim()) {
        chunks.push(lineChunk.trim());
        lineChunk = "";
      }
    }

    for (const line of lines) {
      if (line.length > maxLength) {
        pushLineChunk();

        for (let index = 0; index < line.length; index += maxLength) {
          chunks.push(line.slice(index, index + maxLength));
        }

        continue;
      }

      if (!lineChunk) {
        lineChunk = line;
        continue;
      }

      const candidate = `${lineChunk}\n${line}`;

      if (candidate.length <= maxLength) {
        lineChunk = candidate;
      } else {
        pushLineChunk();
        lineChunk = line;
      }
    }

    pushLineChunk();
  }

  for (const segment of segments) {
    if (STANDALONE_URL_PATTERN.test(segment)) {
      pushCurrentChunk();
      chunks.push(segment);
      continue;
    }

    const paragraphs = segment.split("\n\n");

    for (const paragraph of paragraphs) {
      if (paragraph.length > maxLength) {
        pushCurrentChunk();
        splitOversizedSegment(paragraph);
        continue;
      }

      appendSegment(paragraph);
    }
  }

  pushCurrentChunk();
  return chunks;
}

function resolveTypingIndicatorTimeoutMs(config = {}) {
  const configuredTimeoutMs = Number(config.discord?.typingIndicatorTimeoutMs);

  if (!Number.isFinite(configuredTimeoutMs) || configuredTimeoutMs <= 0) {
    return DEFAULT_TYPING_INDICATOR_TIMEOUT_MS;
  }

  return Math.max(250, Math.min(Math.round(configuredTimeoutMs), 10000));
}

async function sendTypingIndicatorSafely({
  message,
  logger,
  conversationId,
  timeoutMs,
  phase,
}) {
  if (!message.channel?.sendTyping) {
    return false;
  }

  let timeoutId = null;

  try {
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    await Promise.race([
      message.channel.sendTyping(),
      timeout,
    ]);

    return true;
  } catch (error) {
    logger.warn?.("[chat] Failed to send typing indicator; continuing without it", {
      channelId: message.channelId,
      conversationId,
      phase,
      error: error.message,
    });
    return false;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function createMessageCreateHandler({ config, logger, chatPipeline, companion, conversations, channelModes, generatedImages, generatedAudio, cache, reactionContext, settingsStore = null }) {
  return async (message) => {
    if (message.author.bot) {
      logger.debug?.("[chat] Ignoring Discord message from another bot", {
        messageId: message.id,
        authorId: message.author.id,
        channelId: message.channelId,
        guildId: message.guildId,
      });
      return;
    }

    if (message.system) {
      logger.debug?.("[chat] Ignoring Discord system message", {
        messageId: message.id,
        channelId: message.channelId,
        guildId: message.guildId,
      });
      return;
    }

    if (!message.inGuild()) {
      logger.debug?.("[chat] Ignoring Discord DM message", {
        messageId: message.id,
        authorId: message.author.id,
        channelId: message.channelId,
      });
      return;
    }

    // Developer mode: JC (or any DEVELOPER_USER_IDS user) in a *test* channel.
    // Must be evaluated BEFORE the allowedChannelId gate so that test channels
    // are not silently dropped.
    const inDevMode = isDevMode(message);

    // Log-dump shortcut — respond with process + Railway logs and skip the LLM entirely.
    if (inDevMode && isLogRequest(message.content)) {
      logger.info?.("[dev] Log dump requested", {
        authorId: message.author.id,
        channelId: message.channelId,
      });
      try {
        const sections = await getLogsForDevReport({ limit: 60 });
        const chunks = formatLogsForDiscord(sections);
        for (const chunk of chunks) {
          await message.channel.send({ content: chunk });
        }
      } catch (err) {
        await message.channel.send({ content: `❌ Failed to fetch logs: ${err.message}` });
      }
      return;
    }

    // Allowed-channel gate — bypassed for dev-mode users so test channels work
    // even when a primary DISCORD_ALLOWED_CHANNEL_ID is configured.
    if (!inDevMode && config.discord.allowedChannelId && message.channelId !== config.discord.allowedChannelId) {
      return;
    }

    const botUserId = message.client.user?.id;
    const wasMentioned = Boolean(botUserId && message.mentions.users.has(botUserId));
    const conversationId = message.channel.isThread?.() ? message.channel.id : message.channelId;
    const authorName = message.member?.displayName || message.author.globalName || message.author.username;

    // Mention-only gate — also bypassed in dev mode so JC can chat freely.
    if (!inDevMode && config.discord.respondToMentionsOnly && !wasMentioned) {
      logger.debug?.("[chat] Ignoring Discord message because mention-only mode is enabled and the bot was not mentioned", {
        guildId: message.guildId,
        channelId: message.channelId,
        conversationId,
        messageId: message.id,
        authorId: message.author.id,
        respondToMentionsOnly: true,
      });
      return;
    }

    // !adult command — toggles Adult Private Mode for the current channel.
    if (message.content.trim().toLowerCase() === "!adult") {
      try {
        const currentChannelId = message.channelId;
        const currentlyEnabled = Boolean(config.chat?.adultPrivateMode?.enabled);
        const currentChannelBound = config.chat?.adultPrivateMode?.channelId === currentChannelId;
        const turningOff = currentlyEnabled && currentChannelBound;
        const update = turningOff
          ? {
            "chat.adultPrivateMode.enabled": false,
          }
          : {
            "chat.adultPrivateMode.enabled": true,
            "chat.adultPrivateMode.channelId": currentChannelId,
          };

        applyRuntimeSettings(config, update);

        if (settingsStore) {
          await settingsStore.upsertSettings(update);
        }

        const statusLine = turningOff
          ? "Adult Private Mode disabled for this channel."
          : "Adult Private Mode enabled for this channel.";

        logger.info?.("[chat] !adult command toggled adult private mode", {
          messageId: message.id,
          channelId: currentChannelId,
          enabled: !turningOff,
        });

        await message.channel.send({ content: statusLine });
      } catch (error) {
        logger.error("[chat] !adult command failed", {
          messageId: message.id,
          channelId: message.channelId,
          error: error.message,
        }, error);
        await message.channel.send({ content: "Failed to toggle Adult Private Mode." });
      }

      return;
    }

    const mode = channelModes
      ? await channelModes.resolveModeForContext(message)
      : { name: config.chat.defaultMode };

    if (!mode) {
      logger.debug?.("[chat] Ignoring message because no mode is available for this guild/channel context", {
        guildId: message.guildId,
        channelId: message.channelId,
        conversationId,
        messageId: message.id,
      });
      return;
    }

    let typingInterval = null;
    const typingIndicatorTimeoutMs = resolveTypingIndicatorTimeoutMs(config);

    try {
      logger.debug?.("[chat] Received Discord message", {
        guildId: message.guildId,
        channelId: message.channelId,
        conversationId,
        threadId: message.channel.isThread?.() ? message.channel.id : null,
        messageId: message.id,
        authorId: message.author.id,
        authorName,
        mentionedBot: wasMentioned,
      });

      try {
        await conversations.recordEvent({
          message,
          role: "user",
          source: "discord",
          eventType: "message",
          contentText: message.content,
          authorName,
          metadata: {
            mentionedBot: wasMentioned,
            mode: mode.name,
            retrievalSource: mode.retrievalSource,
            retrievalAccess: mode.retrievalAccess,
          },
        });
      } catch (error) {
        logger.error("[storage] Failed to persist inbound Discord message", {
          messageId: message.id,
          channelId: message.channelId,
          conversationId,
          error: error.message,
        }, error);
      }

      await sendTypingIndicatorSafely({
        message,
        logger,
        conversationId,
        timeoutMs: typingIndicatorTimeoutMs,
        phase: "initial",
      });
      typingInterval = setInterval(() => {
        sendTypingIndicatorSafely({
          message,
          logger,
          conversationId,
          timeoutMs: typingIndicatorTimeoutMs,
          phase: "refresh",
        });
      }, 8000);

      // Route through the shared companion brain entry point. The Discord
      // adapter carries the raw message/mode in metadata and the processor
      // returns the pipeline reply untouched, so the payload below is identical.
      let reply;
      if (companion && typeof companion.processCompanionEvent === "function") {
        const result = await companion.processCompanionEvent({
          channelType: "discord",
          externalUserId: message.author?.id || "",
          userDisplayName: message.author?.username || "",
          messageText: message.content || "",
          metadata: { discord: { message, mode, wasMentioned } },
        });
        reply = result.reply;
      } else {
        reply = await chatPipeline.run({
          message,
          mode,
          wasMentioned,
        });
      }

      if (!reply) {
        logger.warn("[chat] Message produced no reply", {
          messageId: message.id,
          channelId: message.channelId,
          conversationId,
        });
        return;
      }

      const replyPayload = typeof reply === "string"
        ? {
          content: reply,
          suppressEmbeds: false,
          files: [],
          generatedImageIds: [],
          generatedAudioIds: [],
          imageWarnings: [],
        }
        : {
          content: String(reply.content || "").trim(),
          suppressEmbeds: Boolean(reply.suppressEmbeds),
          files: Array.isArray(reply.files) ? reply.files : [],
          generatedImageIds: Array.isArray(reply.generatedImageIds) ? reply.generatedImageIds : [],
          generatedAudioIds: Array.isArray(reply.generatedAudioIds) ? reply.generatedAudioIds : [],
          imageWarnings: Array.isArray(reply.imageWarnings) ? reply.imageWarnings : [],
          internalThought: typeof reply.internalThought === "string" ? reply.internalThought.trim() : "",
        };
      const outgoingContent = replaceCustomEmojiLabelsForDiscord(
        replyPayload.content,
        config.chat?.customReactionEmojis || [],
      );
      const replyChunks = splitTextIntoChunks(replyPayload.content);
      const outgoingChunks = splitTextIntoChunks(outgoingContent);
      let sentReply = null;

      // Nothing sendable (e.g. the model produced only a hidden <think> block
      // and no files). Bail out gracefully instead of dereferencing a null
      // sentReply when recording the assistant event below.
      if (!replyChunks.length && !replyPayload.files.length) {
        logger.warn("[chat] Reply had no sendable content after processing", {
          messageId: message.id,
          channelId: message.channelId,
          conversationId,
        });
        return;
      }

      if (!replyChunks.length && replyPayload.files.length) {
        try {
          sentReply = await message.channel.send({
            files: replyPayload.files,
            flags: replyPayload.suppressEmbeds ? ["SuppressEmbeds"] : undefined,
          });
        } catch (error) {
          if (!isDiscordEntityTooLargeError(error)) {
            throw error;
          }

          const fallbackUrls = await buildGeneratedImageFallbackUrls({
            generatedImageIds: replyPayload.generatedImageIds,
            generatedImages,
            config,
          });

          sentReply = await message.channel.send({
            content: buildOversizeFallbackContent({
              content: "",
              urls: fallbackUrls,
              imageWarnings: replyPayload.imageWarnings,
            }),
            flags: replyPayload.suppressEmbeds ? ["SuppressEmbeds"] : undefined,
          });
        }
      }

      for (const [index, chunk] of outgoingChunks.entries()) {
        const isLastChunk = index === outgoingChunks.length - 1;
        try {
          sentReply = await message.channel.send({
            content: chunk,
            files: isLastChunk ? replyPayload.files : undefined,
            flags: replyPayload.suppressEmbeds ? ["SuppressEmbeds"] : undefined,
          });
        } catch (error) {
          if (!isLastChunk || !replyPayload.files.length || !isDiscordEntityTooLargeError(error)) {
            throw error;
          }

          const fallbackUrls = await buildGeneratedImageFallbackUrls({
            generatedImageIds: replyPayload.generatedImageIds,
            generatedImages,
            config,
          });

          sentReply = await message.channel.send({
            content: buildOversizeFallbackContent({
              content: chunk,
              urls: fallbackUrls,
              imageWarnings: replyPayload.imageWarnings,
            }),
            flags: replyPayload.suppressEmbeds ? ["SuppressEmbeds"] : undefined,
          });
        }
      }

      try {
        const persistedReplyText = replyChunks.join("\n\n");
        const replyAuthorName =
          sentReply.member?.displayName ||
          sentReply.author?.globalName ||
          sentReply.author?.username ||
          config.chat?.promptBlocks?.personaName ||
          "assistant";

        reactionContext?.markLatestMessage?.({
          conversationId,
          messageId: sentReply?.id || "",
        });

        await conversations.recordEvent({
          message: sentReply,
          role: "assistant",
          source: "discord",
          eventType: "message",
          contentText: persistedReplyText,
          authorName: replyAuthorName,
          metadata: {
            inReplyToMessageId: message.id,
            mode: mode.name,
            chunkCount: replyChunks.length,
            generatedImageCount: replyPayload.generatedImageIds.length,
            generatedAudioCount: replyPayload.generatedAudioIds.length,
            ...(replyPayload.internalThought
              ? { internalThought: replyPayload.internalThought }
              : {}),
          },
        });

        if (generatedImages && sentReply && replyPayload.generatedImageIds.length) {
          for (const imageId of replyPayload.generatedImageIds) {
            await generatedImages.updateImageRecord(imageId, {
              discordMessageId: sentReply.id,
            }, {
              userScope: config.memory?.userScope,
            });
          }
        }

        if (generatedAudio && sentReply && replyPayload.generatedAudioIds.length) {
          for (const audioId of replyPayload.generatedAudioIds) {
            await generatedAudio.updateAudioRecord(audioId, {
              discordMessageId: sentReply.id,
            }, {
              userScope: config.memory?.userScope,
            });
          }
        }

        await cacheLatestReadableReply({
          cache,
          userScope: config.memory?.userScope,
          conversationId,
          messageId: sentReply?.id || "",
          channelId: message.channelId,
          text: persistedReplyText,
        });
      } catch (error) {
        logger.error("[storage] Failed to persist outbound Discord message", {
          messageId: sentReply.id,
          channelId: sentReply.channelId,
          conversationId,
          error: error.message,
        }, error);
      }

      logger.info("[chat] Sent Discord reply", {
        messageId: message.id,
        channelId: message.channelId,
        conversationId,
        replyLength: replyPayload.content.length,
        chunkCount: replyChunks.length,
      });
    } catch (error) {
      logger.error("[chat] Failed to process chat message", {
        messageId: message.id,
        channelId: message.channelId,
        conversationId,
        error: error.message,
      }, error);
      await message.channel.send({
        content: "I hit an error while processing that message.",
      });
    } finally {
      if (typingInterval) {
        clearInterval(typingInterval);
      }
    }
  };
}

module.exports = {
  createMessageCreateHandler,
  splitAroundStandaloneUrls,
  splitTextIntoChunks,
};
