const DISCORD_MESSAGE_MAX_LENGTH = 2000;
// Hard upper bound on how many separate Discord messages a single reply may be
// split into. Real replies never need this many; the cap is a safety valve so a
// degenerate/looping model response can never flood a channel with dozens of
// near-identical messages.
const MAX_OUTGOING_CHUNKS = 5;
const DEFAULT_TYPING_INDICATOR_TIMEOUT_MS = 2000;
const STANDALONE_URL_PATTERN = /^https?:\/\/\S+$/i;
const URL_PATTERN = /https?:\/\/[^\s<>)]+/gi;
const STANDALONE_MEDIA_URL_PATTERN = /\.(?:gif|webp|png|jpe?g)(?:[?#].*)?$/i;
// Only match direct media URLs — page URLs (giphy.com/gifs/, tenor.com/view/) cannot embed in Discord.
const STANDALONE_GIF_PROVIDER_PATTERN = /(?:^https:\/\/media\.giphy\.com\/|^https:\/\/(?:media\.|c\.)?tenor\.com\/)/i;
const {
  isDiscordEntityTooLargeError,
  buildGeneratedImageFallbackUrls,
  buildOversizeFallbackContent,
} = require("../../discord/oversizeFallback");
const { cacheLatestReadableReply } = require("../../audio/latestReplyCache");
const { createAudioGenerationService, resolveTtsProvider } = require("../../audio/generateAudio");
const { createImageGenerationService, resolveImageGenerationModel } = require("../../images/generateImage");
const { startImageRequestDiagnostics, updateImageRequestDiagnostics } = require("../../images/imageRequestDiagnostics");
const { buildImageIntentRequest } = require("../../chat/imageIntent");
const {
  detectImageFollowupRequest,
  getImageFollowupMaxBatchCount,
  isUsableLastImageState,
  loadImageConversationState,
  markImageConversationActive,
} = require("../../chat/imageConversationState");
const { getVoiceNoteTriggerPhrase, isFakeVoiceNoteAction, stripFakeVoiceNoteAction, buildVoiceNoteScriptDetails } = require("../../chat/voiceNoteIntent");
const { replaceCustomEmojiLabelsForDiscord } = require("../../reactions/customEmojiPalette");
const { isDevMode, isLogRequest } = require("../../developer/devUtils");
const { getLogsForDevReport, formatLogsForDiscord } = require("../../developer/railwayLogs");
const { applyRuntimeSettings } = require("../../config/runtimeSettings");
const { isValidDirectGifUrl, getGifSendMode } = require("../../media/gifUrlNormalizer");

function stripTrailingUrlPunctuation(value) {
  return String(value || "").replace(/[),.!?]+$/g, "");
}

function extractEmbeddableGifUrls(text) {
  const urls = [];
  const seen = new Set();
  const content = String(text || "");
  const matches = content.match(URL_PATTERN) || [];

  for (const match of matches) {
    const url = stripTrailingUrlPunctuation(match);

    if (isValidDirectGifUrl(url) && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

function removeUrlsFromText(text, urls = []) {
  let result = String(text || "");

  for (const url of urls) {
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`<?${escapedUrl}>?[),.!?]*`, "g"), "");
  }

  return result
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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

  if (chunks.length > MAX_OUTGOING_CHUNKS) {
    const kept = chunks.slice(0, MAX_OUTGOING_CHUNKS);
    const omitted = chunks.length - kept.length;
    const lastIndex = kept.length - 1;
    const notice = `\n\n…(${omitted} more message${omitted === 1 ? "" : "s"} trimmed)`;
    const room = maxLength - notice.length;

    // Always surface that content was trimmed. If the last kept chunk leaves no
    // room for the notice, trim it just enough so the marker still fits.
    kept[lastIndex] = kept[lastIndex].length <= room
      ? `${kept[lastIndex]}${notice}`
      : `${kept[lastIndex].slice(0, Math.max(0, room)).trimEnd()}${notice}`;

    return kept;
  }

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

function stripPrematureImageSuccessText(text = "") {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  if (/^(?:here(?: it is| you go)?[.!…]*)$/i.test(normalized)) return "";
  if (/\b(?:sent|sending|attached|here(?:'s| is)|made you|generated)\b/i.test(normalized) && /\b(?:photo|pic|picture|image|attachment)\b/i.test(normalized)) {
    return "";
  }
  return normalized;
}
// Module-level in-process guard: prevents the same Node.js process from
// handling the same Discord message ID twice simultaneously (e.g. Discord.js
// event replay on reconnect). The Postgres-backed cache/recordEvent checks
// handle cross-process dedup; this handles within-process dedup at zero cost.
const IN_FLIGHT_MESSAGE_IDS = new Set();

async function fulfillImageIntentRequest({ replyPayload, message, config, logger, generatedImages, conversationId, cache = null, imageGenerationServiceFactory = createImageGenerationService }) {
  const maxBatchCount = getImageFollowupMaxBatchCount(config);
  const followup = detectImageFollowupRequest(message.content || "", { maxCount: maxBatchCount });
  const lastMediaState = followup.detected
    ? await loadImageConversationState({ cache, conversationId, userScope: config.memory?.userScope })
    : null;
  const lastMediaFound = isUsableLastImageState(lastMediaState, {
    windowMinutes: config.imageGeneration?.followupWindowMinutes || 30,
    channelId: message.channelId,
  });
  const mediaRequest = followup.detected && lastMediaFound
    ? {
      detected: true,
      prompt: lastMediaState.lastPrompt,
      cleanedText: "",
      triggerSource: "media_followup",
      count: followup.requestedCount,
    }
    : replyPayload.mediaRequest || buildImageIntentRequest({
      text: replyPayload.content || "",
      userText: message.content || "",
    });
  const imageIntentDetected = Boolean(mediaRequest?.detected);
  const requestedCount = followup.detected ? followup.requestedCount : Math.min(Number(mediaRequest?.count || 1) || 1, maxBatchCount);
  const prompt = String(mediaRequest?.prompt || "").trim();
  const parsedToolParams = mediaRequest?.params && typeof mediaRequest.params === "object" ? mediaRequest.params : {};
  const provider = String(config.imageGeneration?.provider || "getimg").trim() || "getimg";
  const model = resolveImageGenerationModel(config);

  if (imageIntentDetected) {
    startImageRequestDiagnostics({
      prompt,
      provider,
      model,
      status: "structured_request_created",
      structured_image_request_created: true,
      image_prompt_final: prompt,
      image_intent_detected: true,
      dashboard_media_path_used: false,
      discord_media_path_used: true,
      media_execution_stage: "structured_image_request_created",
    });
  }

  logger.info?.("[image-intent] routing diagnostics", {
    image_intent_detected: imageIntentDetected,
    structured_image_request_created: imageIntentDetected,
    image_prompt_final: prompt,
    media_execution_stage: imageIntentDetected ? "structured_image_request_created" : "intent_not_detected",
    dashboard_media_path_used: false,
    discord_media_path_used: true,
    fake_tool_call_detected: Boolean(mediaRequest?.fakeToolCallDetected),
    parsed_tool_prompt_length: prompt.length,
    parsed_tool_params: parsedToolParams,
    media_followup_detected: followup.detected,
    requested_image_count: requestedCount,
    reused_prompt: followup.detected && lastMediaFound,
    last_media_found: lastMediaFound,
    image_trigger_source: mediaRequest?.triggerSource || null,
    extracted_prompt_length: prompt.length,
    image_provider: provider,
    image_model: model,
    image_generation_started: false,
    image_generation_success: false,
    image_url_or_bytes_present: false,
    discord_attachments_sent: 0,
    gallery_saved_count: 0,
    total_requested: requestedCount,
    total_succeeded: 0,
    total_failed: 0,
    failure_reasons: [],
  });

  if (followup.detected && !lastMediaFound) {
    return {
      ...replyPayload,
      content: "What image do you want me to make more of?",
      files: [],
      generatedImageIds: [],
    };
  }

  if (!imageIntentDetected || replyPayload.generatedImageIds.length || replyPayload.files.length) {
    return {
      ...replyPayload,
      content: mediaRequest?.cleanedText ?? replyPayload.content,
    };
  }

  if (!prompt) {
    logger.warn?.("[image-intent] image intent had no usable prompt", {
      image_intent_detected: true,
      media_followup_detected: followup.detected,
      last_media_found: lastMediaFound,
      fake_tool_call_detected: Boolean(mediaRequest?.fakeToolCallDetected),
      parsed_tool_prompt_length: prompt.length,
      parsed_tool_params: parsedToolParams,
      failure_reasons: ["empty_prompt"],
    });
    return {
      ...replyPayload,
      content: followup.detected ? "What image do you want me to make more of?" : stripPrematureImageSuccessText(mediaRequest?.cleanedText || ""),
    };
  }

  updateImageRequestDiagnostics({ status: "provider_call_started", provider_called: true, media_execution_stage: "provider_called", event: "provider_called" });
  const imageGeneration = imageGenerationServiceFactory({ config, logger, generatedImages });
  const files = [];
  const imageIds = [];
  const failureReasons = [];
  let lastModel = model;

  for (let index = 0; index < requestedCount; index += 1) {
    logger.info?.("[image-intent] image generation requested", {
      image_intent_detected: true,
      media_followup_detected: followup.detected,
      requested_image_count: requestedCount,
      reused_prompt: followup.detected && lastMediaFound,
      last_media_found: lastMediaFound,
      generation_index: index + 1,
      total_requested: requestedCount,
      image_provider: provider,
      image_model: model,
      image_generation_started: true,
      provider_called: true,
      media_execution_stage: "provider_called",
      fake_tool_call_detected: Boolean(mediaRequest?.fakeToolCallDetected),
      parsed_tool_prompt_length: prompt.length,
      parsed_tool_params: parsedToolParams,
    });

    try {
      const result = await imageGeneration.generate({
        prompt,
        aspectRatio: parsedToolParams.aspectRatio,
        stylePreset: parsedToolParams.stylePreset,
        appearancePresets: parsedToolParams.appearancePresets,
        imageType: parsedToolParams.imageType,
        context: {
          userScope: config.memory?.userScope,
          sourceSurface: "discord",
          conversationId,
          channelId: message.channelId,
          sourceMessageId: message.id,
        },
      });
      updateImageRequestDiagnostics({
        status: "provider_succeeded",
        provider_status: "success",
        providerResponseSummary: result.diagnostics?.providerResponseSummary || { hasFile: Boolean(result.file), hasRecord: Boolean(result.record || result.image) },
        gallery_save_started: true,
        gallery_save_success: result.diagnostics?.gallerySaveSuccess !== false,
        media_execution_stage: "discord_attachment_created",
        event: "provider_succeeded",
      });
      const imageId = result.record?.imageId || result.image?.imageId;
      if (result.file) {
        files.push(result.file);
        logger.info?.("[image-intent] Discord attachment created", {
          discord_attachment_created: true,
          discord_attachment_filename: result.file.name || "image.png",
          image_bytes_length: Buffer.isBuffer(result.file.attachment) ? result.file.attachment.length : undefined,
        });
      }
      if (imageId) imageIds.push(imageId);
      lastModel = result.record?.model || result.image?.model || model;
    } catch (error) {
      failureReasons.push(error.message);
      updateImageRequestDiagnostics({ status: "provider_failed", failureStage: "provider", provider_status: "failed", media_execution_stage: "provider_failed", event: "provider_failed" });
    }
  }

  const totalSucceeded = files.length;
  const totalFailed = failureReasons.length;
  logger.info?.("[image-intent] image generation completed", {
    image_intent_detected: true,
    media_followup_detected: followup.detected,
    requested_image_count: requestedCount,
    reused_prompt: followup.detected && lastMediaFound,
    last_media_found: lastMediaFound,
    total_requested: requestedCount,
    total_succeeded: totalSucceeded,
    total_failed: totalFailed,
    discord_attachments_sent: totalSucceeded,
    discord_image_attachment_sent: false,
    fake_tool_call_detected: Boolean(mediaRequest?.fakeToolCallDetected),
    parsed_tool_prompt_length: prompt.length,
    parsed_tool_params: parsedToolParams,
    gallery_saved_count: imageIds.length,
    failure_reasons: failureReasons,
    image_generation_success: totalSucceeded > 0,
  });

  if (totalSucceeded > 0) {
    await markImageConversationActive({
      cache,
      conversationId,
      userScope: config.memory?.userScope,
      reason: "generated_image",
      status: "generated_image",
      lastGeneratedAt: new Date(),
      lastMediaType: "image",
      lastPrompt: prompt,
      lastProvider: provider,
      lastModel,
      lastStyle: lastMediaState?.lastStyle || null,
      lastAppearancePreset: lastMediaState?.lastAppearancePreset || null,
      lastSuccessAt: new Date(),
      lastChannelId: message.channelId,
      lastMessageId: message.id,
    });
    return {
      ...replyPayload,
      content: totalFailed ? `I made ${totalSucceeded} image${totalSucceeded === 1 ? "" : "s"}, but ${totalFailed} failed.` : stripPrematureImageSuccessText(mediaRequest.cleanedText || ""),
      files: [...replyPayload.files, ...files],
      generatedImageIds: [...replyPayload.generatedImageIds, ...imageIds],
    };
  }

  return {
    ...replyPayload,
    content: "The image generator failed.",
    files: [],
    generatedImageIds: [],
  };
}
async function fulfillVoiceNoteRequest({ replyPayload, message, config, logger, generatedAudio, conversationId, audioGenerationServiceFactory = createAudioGenerationService }) {
  const beforeTrigger = getVoiceNoteTriggerPhrase(message.content || "");
  const afterTrigger = getVoiceNoteTriggerPhrase(replyPayload.content || "");
  const fakeActionOnly = isFakeVoiceNoteAction(replyPayload.content || "");
  const voiceNoteRequested = Boolean(beforeTrigger || afterTrigger || fakeActionOnly);
  const triggerPhrase = beforeTrigger || afterTrigger || (fakeActionOnly ? "fake voice note action" : null);
  logger.info?.("[voice-note] routing diagnostics", {
    voice_note_requested: voiceNoteRequested,
    voice_note_trigger_phrase: triggerPhrase,
    raw_reply_length: String(replyPayload.content || "").length,
    discord_audio_attachment_sent: false,
  });
  if (!voiceNoteRequested || replyPayload.generatedAudioIds.length || replyPayload.files.length) return replyPayload;

  const { spokenScript: script, strippedStageDirections } = buildVoiceNoteScriptDetails({ userText: message.content || "", replyText: replyPayload.content || "" });
  const provider = resolveTtsProvider?.(config) || String(config.audio?.ttsProvider || "unknown");
  logger.info?.("[voice-note] audio generation requested", {
    voice_note_requested: true,
    voice_note_trigger_phrase: triggerPhrase,
    spoken_script_length: script.length,
    raw_reply_length: String(replyPayload.content || "").length,
    stripped_stage_directions: strippedStageDirections,
    audio_provider: provider,
    audio_generation_started: true,
  });

  try {
    const audioGeneration = audioGenerationServiceFactory({ config, logger, generatedAudio });
    const result = await audioGeneration.generate({
      text: script,
      prompt: script,
      caption: "",
      title: "Voice Note",
      kind: "Voice Note",
      model: config.audio?.generatedAudioModel || config.audio?.readAloudModel || "eleven_multilingual_v2",
      context: {
        userScope: config.memory?.userScope,
        sourceSurface: "chat_voice_note",
        conversationId,
        channelId: message.channelId,
        sourceMessageId: message.id,
      },
    });
    logger.info?.("[voice-note] audio generation succeeded", {
      voice_note_requested: true,
      voice_note_trigger_phrase: triggerPhrase,
      spoken_script_length: script.length,
      raw_reply_length: String(replyPayload.content || "").length,
      stripped_stage_directions: strippedStageDirections,
      audio_provider: provider,
      audio_generation_success: true,
      discord_audio_attachment_sent: true,
    });
    return {
      ...replyPayload,
      content: stripFakeVoiceNoteAction(replyPayload.content || ""),
      files: [...replyPayload.files, result.file],
      generatedAudioIds: result.record?.audioId ? [...replyPayload.generatedAudioIds, result.record.audioId] : replyPayload.generatedAudioIds,
    };
  } catch (error) {
    logger.warn?.("[voice-note] audio generation failed", {
      voice_note_requested: true,
      voice_note_trigger_phrase: triggerPhrase,
      spoken_script_length: script.length,
      raw_reply_length: String(replyPayload.content || "").length,
      stripped_stage_directions: strippedStageDirections,
      audio_provider: provider,
      audio_generation_success: false,
      discord_audio_attachment_sent: false,
      provider_error: error.message,
    });
    return {
      ...replyPayload,
      content: "I tried to send that as a voice note, but the audio failed to generate. I can try again in a moment.",
      files: [],
      generatedAudioIds: [],
    };
  }
}

function createMessageCreateHandler({ config, logger, chatPipeline, companion, conversations, channelModes, generatedImages, generatedAudio, cache, reactionContext, settingsStore = null, norwegianLearning = null, conversationFollowupStore = null, timedNotesStore = null }) {
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

    if (IN_FLIGHT_MESSAGE_IDS.has(message.id)) {
      logger.info("[chat] Message already in-flight in this process; skipping duplicate event", {
        messageId: message.id,
        channelId: message.channelId,
        serviceId: process.env.RAILWAY_SERVICE_ID || null,
      });
      return;
    }
    IN_FLIGHT_MESSAGE_IDS.add(message.id);

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

    // Cross-instance deduplication: claim this message in the shared cache
    // (atomic INSERT ... ON CONFLICT DO NOTHING) so a second container running
    // concurrently during a Railway rolling deploy does not also reply.
    if (cache?.claimMessageProcessing) {
      try {
        const claimed = await cache.claimMessageProcessing({ messageId: message.id });

        const claimServiceId = process.env.RAILWAY_SERVICE_ID || null;

        if (!claimed) {
          logger.info("[chat] Message already claimed by another instance; skipping", {
            messageId: message.id,
            channelId: message.channelId,
            serviceId: claimServiceId,
          });
          return;
        }

        logger.info("[chat] Message claim acquired; processing", {
          messageId: message.id,
          channelId: message.channelId,
          serviceId: claimServiceId,
        });
      } catch (claimError) {
        logger.error("[chat] Message claim check failed; skipping to avoid duplicate processing", {
          messageId: message.id,
          error: claimError.message,
          serviceId: process.env.RAILWAY_SERVICE_ID || null,
        });
        return;
      }
    } else {
      logger.warn("[chat] claimMessageProcessing unavailable; deduplication skipped", {
        messageId: message.id,
        hasCacheObject: Boolean(cache),
        serviceId: process.env.RAILWAY_SERVICE_ID || null,
      });
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

    // Norwegian pronunciation practice: handle audio attachments
    if (norwegianLearning && message.attachments.size > 0) {
      const audioAttachments = message.attachments.filter(att =>
        att.contentType && (
          att.contentType.startsWith('audio/') ||
          att.contentType.includes('wav') ||
          att.contentType.includes('mpeg') ||
          att.contentType.includes('webm') ||
          att.contentType.includes('ogg') ||
          att.contentType.includes('m4a') ||
          att.contentType.includes('mp4')
        )
      );

      if (audioAttachments.size > 0) {
        try {
          const userScope = message.client.appContext?.config?.memory?.userScope || 'user';
          const session = await norwegianLearning.getPronunciationSession(userScope);

          if (session && session.active) {
            const { processPronunciationAudio } = require('../../bot/handlers/norwegianAudioHandler');
            const attachment = audioAttachments.first();

            await processPronunciationAudio({
              message,
              attachment,
              config,
              logger,
              store: norwegianLearning,
              appContext: message.client.appContext,
            });

            return;
          }
          // No active pronunciation session — fall through to normal message handling
        } catch (error) {
          logger.error('[norwegian-pronunciation] Error processing audio', {
            error: error.message,
          });
        }
      }
    }

    // !adult command — controls Adult Private Mode for the current channel.
    //   !adult            -> enable for this channel (idempotent)
    //   !adult on         -> enable for this channel (idempotent)
    //   !adult off        -> disable
    //   !adult status     -> report current state
    // Bare `!adult` always turns it ON (never silently disables) so it is a
    // reliable way to switch the mode on for the channel it is run in.
    const adultTokens = message.content.trim().toLowerCase().split(/\s+/);
    if (adultTokens[0] === "!adult") {
      try {
        const currentChannelId = message.channelId;
        const subcommand = adultTokens[1] || "on";
        const currentlyEnabled = Boolean(config.chat?.adultPrivateMode?.enabled);
        const currentChannelBound = config.chat?.adultPrivateMode?.channelId === currentChannelId;
        const enabledHere = currentlyEnabled && currentChannelBound;

        if (subcommand === "status") {
          let statusLine;
          if (enabledHere) {
            statusLine = "Adult Private Mode is **enabled** for this channel.";
          } else if (currentlyEnabled) {
            statusLine = "Adult Private Mode is enabled, but bound to a different channel. Run `!adult on` here to move it.";
          } else {
            statusLine = "Adult Private Mode is **disabled**. Run `!adult on` to enable it for this channel.";
          }
          await message.channel.send({ content: statusLine });
          return;
        }

        const turningOff = subcommand === "off";
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

        let statusLine;
        if (turningOff) {
          statusLine = "Adult Private Mode disabled for this channel.";
        } else if (enabledHere) {
          statusLine = "Adult Private Mode is already enabled for this channel.";
        } else {
          statusLine = "Adult Private Mode enabled for this channel.";
        }

        logger.info?.("[chat] !adult command set adult private mode", {
          messageId: message.id,
          channelId: currentChannelId,
          subcommand,
          enabled: !turningOff,
        });

        await message.channel.send({ content: statusLine });
      } catch (error) {
        logger.error("[chat] !adult command failed", {
          messageId: message.id,
          channelId: message.channelId,
          error: error.message,
        }, error);
        await message.channel.send({ content: "Failed to update Adult Private Mode." });
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
        const claimed = await conversations.recordEvent({
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

        // conversations.recordEvent returns false when another instance already
        // inserted this discord_message_id (ON CONFLICT DO NOTHING). This is
        // the authoritative cross-instance dedup guard backed by the shared
        // conversations DB (the conversations table must be shared for any
        // continuity to work, making this reliable even with separate Railway
        // services that have separate cache DBs).
        if (claimed === false) {
          logger.info("[chat] Message already recorded by another instance; skipping", {
            messageId: message.id,
            channelId: message.channelId,
          });
          return;
        }
      } catch (error) {
        logger.error("[storage] Failed to persist inbound Discord message; skipping to avoid duplicate processing", {
          messageId: message.id,
          channelId: message.channelId,
          conversationId,
          error: error.message,
        }, error);
        return;
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
          mediaStates: [],
        }
        : {
          content: String(reply.content || "").trim(),
          suppressEmbeds: Boolean(reply.suppressEmbeds),
          files: Array.isArray(reply.files) ? reply.files : [],
          generatedImageIds: Array.isArray(reply.generatedImageIds) ? reply.generatedImageIds : [],
          generatedAudioIds: Array.isArray(reply.generatedAudioIds) ? reply.generatedAudioIds : [],
          imageWarnings: Array.isArray(reply.imageWarnings) ? reply.imageWarnings : [],
          mediaStates: Array.isArray(reply.mediaStates) ? reply.mediaStates : [],
          internalThought: typeof reply.internalThought === "string" ? reply.internalThought.trim() : "",
        };
      const imageRoutedReplyPayload = await fulfillImageIntentRequest({ replyPayload, message, config, logger, generatedImages, conversationId, cache });
      Object.assign(replyPayload, imageRoutedReplyPayload);
      const routedReplyPayload = await fulfillVoiceNoteRequest({ replyPayload, message, config, logger, generatedAudio, conversationId });
      Object.assign(replyPayload, routedReplyPayload);
      const outgoingContentWithUrls = replaceCustomEmojiLabelsForDiscord(
        replyPayload.content,
        config.chat?.customReactionEmojis || [],
      );
      const gifSendMode = getGifSendMode(config);
      const gifEmbedUrls = gifSendMode === "embed_image"
        ? extractEmbeddableGifUrls(outgoingContentWithUrls)
        : [];
      const outgoingContent = gifEmbedUrls.length
        ? removeUrlsFromText(outgoingContentWithUrls, gifEmbedUrls)
        : outgoingContentWithUrls;
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
        const _sendingAudio = replyPayload.generatedAudioIds.length > 0;
        if (_sendingAudio) {
          logger.info("[audio] discord attachment send started", {
            audioIds: replyPayload.generatedAudioIds,
            conversationId,
          });
        }
        try {
          logger.info?.("[image-intent] Discord send called", { discord_send_called_with_files_count: replyPayload.files.length, media_execution_stage: "discord_send_called" });
          updateImageRequestDiagnostics({ media_execution_stage: "discord_send_called", discordUploadSummary: { discord_send_called_with_files_count: replyPayload.files.length }, event: "discord_send_called" });
          sentReply = await message.channel.send({
            files: replyPayload.files,
            flags: replyPayload.suppressEmbeds ? ["SuppressEmbeds"] : undefined,
          });
          if (replyPayload.generatedImageIds.length > 0) {
            logger.info("[image-intent] discord image attachment sent", {
              generatedImageIds: replyPayload.generatedImageIds,
              discordMessageId: sentReply.id,
              discord_image_attachment_sent: true,
              discord_send_success: true,
            });
            updateImageRequestDiagnostics({ status: "discord_send_success", media_execution_stage: "discord_send_success", discordUploadSummary: { discord_send_success: true, discord_message_id: sentReply.id, discord_send_called_with_files_count: replyPayload.files.length }, event: "discord_send_success" });
          }
          if (_sendingAudio) {
            logger.info("[audio] discord attachment sent", {
              audioIds: replyPayload.generatedAudioIds,
              discordMessageId: sentReply.id,
              discord_audio_attachment_sent: true,
            });
          }
        } catch (error) {
          if (replyPayload.generatedImageIds.length > 0 || replyPayload.files.length > 0) {
            updateImageRequestDiagnostics({ status: "discord_send_failed", failureStage: "discord_upload", media_execution_stage: "discord_send_failed", discordUploadSummary: { discord_send_success: false, error: error.message }, event: "discord_send_failed" });
            sentReply = await message.channel.send({ content: "The image generated, but Discord upload failed." });
            replyPayload.content = "The image generated, but Discord upload failed.";
            replyPayload.files = [];
            return;
          }

          if (!isDiscordEntityTooLargeError(error)) {
            if (_sendingAudio) {
              logger.warn("[audio] fish synthesis failed", { stage: "discord_attachment_send", error: error.message });
            }
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
        const trimmedChunk = chunk.trim();
        const isGifEmbedChunk = gifSendMode === "embed_image"
          && STANDALONE_URL_PATTERN.test(trimmedChunk)
          && isValidDirectGifUrl(trimmedChunk);
        const _lastChunkWithAudio = isLastChunk && replyPayload.generatedAudioIds.length > 0 && replyPayload.files.length > 0;

        if (_lastChunkWithAudio) {
          logger.info("[audio] discord attachment send started", {
            audioIds: replyPayload.generatedAudioIds,
            conversationId,
          });
        }

        try {
          if (isGifEmbedChunk) {
            logger.debug?.("[gif] sending as Discord embed image", {
              url: trimmedChunk,
              conversationId,
            });
            sentReply = await message.channel.send({
              embeds: [{ image: { url: trimmedChunk } }],
              files: isLastChunk ? replyPayload.files : undefined,
            });
          } else {
            logger.info?.("[image-intent] Discord send called", { discord_send_called_with_files_count: isLastChunk ? replyPayload.files.length : 0, media_execution_stage: "discord_send_called" });
            updateImageRequestDiagnostics({ media_execution_stage: "discord_send_called", discordUploadSummary: { discord_send_called_with_files_count: isLastChunk ? replyPayload.files.length : 0 }, event: "discord_send_called" });
            sentReply = await message.channel.send({
              content: chunk,
              files: isLastChunk ? replyPayload.files : undefined,
              flags: replyPayload.suppressEmbeds ? ["SuppressEmbeds"] : undefined,
            });
          }
          if (isLastChunk && replyPayload.generatedImageIds.length > 0 && replyPayload.files.length > 0) {
            logger.info("[image-intent] discord image attachment sent", {
              generatedImageIds: replyPayload.generatedImageIds,
              discordMessageId: sentReply.id,
              discord_image_attachment_sent: true,
              discord_send_success: true,
            });
            updateImageRequestDiagnostics({ status: "discord_send_success", media_execution_stage: "discord_send_success", final_user_visible_text: chunk, discordUploadSummary: { discord_send_success: true, discord_message_id: sentReply.id, discord_send_called_with_files_count: replyPayload.files.length }, event: "discord_send_success" });
          }
          if (_lastChunkWithAudio) {
            logger.info("[audio] discord attachment sent", {
              audioIds: replyPayload.generatedAudioIds,
              discordMessageId: sentReply.id,
              discord_audio_attachment_sent: true,
            });
          }
        } catch (error) {
          if (isLastChunk && replyPayload.generatedImageIds.length > 0 && replyPayload.files.length > 0) {
            updateImageRequestDiagnostics({ status: "discord_send_failed", failureStage: "discord_upload", media_execution_stage: "discord_send_failed", final_user_visible_text: "The image generated, but Discord upload failed.", discordUploadSummary: { discord_send_success: false, error: error.message }, event: "discord_send_failed" });
            sentReply = await message.channel.send({ content: "The image generated, but Discord upload failed." });
            replyPayload.content = "The image generated, but Discord upload failed.";
            replyPayload.files = [];
            break;
          }
          if (!isLastChunk || !replyPayload.files.length || !isDiscordEntityTooLargeError(error)) {
            if (_lastChunkWithAudio && !isDiscordEntityTooLargeError(error)) {
              logger.warn("[audio] fish synthesis failed", { stage: "discord_attachment_send", error: error.message });
            }
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

      for (const [index, gifUrl] of gifEmbedUrls.entries()) {
        const shouldAttachFiles = !outgoingChunks.length && index === gifEmbedUrls.length - 1;
        const _gifSendingAudio = shouldAttachFiles && replyPayload.generatedAudioIds.length > 0 && replyPayload.files.length > 0;

        logger.debug?.("[gif] sending extracted Discord embed image", {
          url: gifUrl,
          conversationId,
        });

        if (_gifSendingAudio) {
          logger.info("[audio] discord attachment send started", {
            audioIds: replyPayload.generatedAudioIds,
            conversationId,
          });
        }

        try {
          sentReply = await message.channel.send({
            embeds: [{ image: { url: gifUrl } }],
            files: shouldAttachFiles ? replyPayload.files : undefined,
          });
          if (_gifSendingAudio) {
            logger.info("[audio] discord attachment sent", {
              audioIds: replyPayload.generatedAudioIds,
              discordMessageId: sentReply.id,
              discord_audio_attachment_sent: true,
            });
          }
        } catch (error) {
          if (!shouldAttachFiles || !replyPayload.files.length || !isDiscordEntityTooLargeError(error)) {
            if (_gifSendingAudio && !isDiscordEntityTooLargeError(error)) {
              logger.warn("[audio] fish synthesis failed", { stage: "discord_attachment_send", error: error.message });
            }
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
            embeds: [{ image: { url: gifUrl } }],
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

        if (conversationFollowupStore) {
          try {
            const isAdultContext = mode.name === "adult_private";
            await conversationFollowupStore.createFollowUp({
              user_scope: config.memory?.userScope || "user",
              companion_id: config.memory?.companionId || config.companion?.id || "Dante",
              channel_id: message.channelId || "",
              thread_id: message.channel.isThread?.() ? message.channel.id : "",
              last_user_message_id: message.id || "",
              last_companion_message_id: sentReply.id || "",
              last_topic_summary: persistedReplyText.slice(0, 200),
              follow_up_due_at: null,
              privacy_scope: isAdultContext ? "adult_private" : "normal",
              adult_context: isAdultContext,
            });
          } catch (error) {
            logger.debug?.("[followup] Failed to create conversation followup", {
              conversationId,
              error: error?.message,
            });
          }
        }

        if (replyPayload.generatedImageIds.length && replyPayload.mediaStates?.length) {
          const latestMediaState = replyPayload.mediaStates[replyPayload.mediaStates.length - 1];
          await markImageConversationActive({
            cache,
            conversationId,
            userScope: config.memory?.userScope,
            reason: "generated_image",
            status: "generated_image",
            lastGeneratedAt: new Date(),
            lastMediaType: latestMediaState.lastMediaType || "image",
            lastPrompt: latestMediaState.lastPrompt,
            lastProvider: latestMediaState.lastProvider,
            lastModel: latestMediaState.lastModel,
            lastStyle: latestMediaState.lastStyle,
            lastAppearancePreset: latestMediaState.lastAppearancePreset,
            lastSuccessAt: new Date(),
            lastChannelId: message.channelId,
            lastMessageId: sentReply?.id || message.id,
          });
        }

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
      IN_FLIGHT_MESSAGE_IDS.delete(message.id);
    }
  };
}

module.exports = {
  createMessageCreateHandler,
  extractEmbeddableGifUrls,
  removeUrlsFromText,
  splitAroundStandaloneUrls,
  splitTextIntoChunks,
  fulfillImageIntentRequest,
  fulfillVoiceNoteRequest,
};
