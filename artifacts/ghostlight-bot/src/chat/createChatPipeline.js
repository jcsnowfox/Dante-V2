const { preprocessMessage } = require("./pipeline/preprocessMessage");
const { enrichInput } = require("./pipeline/enrichInput");
const { loadScopedRecentHistory } = require("./pipeline/loadRecentHistory");
const { retrieveMemory } = require("./pipeline/retrieveMemory");
const { callModel } = require("./pipeline/callModel");
const { buildReply } = require("./pipeline/buildReply");
const { getMode } = require("./modes");
const {
  listPresetsSafe,
  buildImagePresetContextSection,
} = require("../images/presetContext");
const { buildMainUserPresenceContextSection } = require("../bot/mainUserPresence");
const {
  shouldSeedImageConversationFromUserText,
  shouldRefreshImageConversationFromAssistant,
  loadImageConversationState,
  markImageConversationActive,
  buildImageConversationContextSection,
} = require("./imageConversationState");
const { buildModelContext } = require("../context/modelContextBuilder");
const { detectURLsInText, shouldFetchURL, fetchAndAnalyzeURL } = require("../context/urlHandler");
const { buildAttachmentUnderstanding } = require("../context/attachmentUnderstanding");

function createChatPipeline({
  config,
  logger,
  memory,
  tools,
  conversations,
  cache = null,
  mainUserPresence = null,
  reactionContext = null,
  imageStylePresets,
  imageAppearancePresets,
  emotionalArc = null,
  feedbackLearning = null,
  relationalState = null,
}) {
  return {
    async run({ message, mode, modeName }) {
      const startedAt = Date.now();
      const fallbackModeName = config.chat?.defaultMode || "default";
      const selectedMode = mode || getMode(modeName || fallbackModeName);
      const preprocessedInput = preprocessMessage({ message, botUserId: message.client.user?.id });
      const input = await enrichInput({ config, logger, input: preprocessedInput });
      const conversationId = message.channel.isThread?.() ? message.channel.id : message.channelId;
      let imageConversationState = await loadImageConversationState({
        cache,
        conversationId,
        userScope: config.memory?.userScope,
      });

      if (!input.content) {
        logger.warn("[chat] Ignoring empty message after preprocessing", {
          messageId: message.id,
          channelId: message.channelId,
        });
        return null;
      }

      logger.debug("[chat] Preprocessed input", {
        messageId: message.id,
        channelId: message.channelId,
        contentLength: input.content.length,
        inputTypes: input.inputTypes,
        mode: selectedMode.name,
      });

      for (const derivedAttachment of input.derivedAttachments || []) {
        try {
          await conversations.recordEvent({
            message,
            role: "system",
            source: "openai",
            eventType: derivedAttachment.kind,
            contentText: derivedAttachment.text,
            metadata: {
              attachment: derivedAttachment.attachment,
              sourceMessageId: message.id,
              model:
                derivedAttachment.kind === "audio_transcription"
                  ? (config.llm?.transcription?.model || config.openai.transcriptionModel)
                  : (config.llm?.image?.model || config.openai.imageModel),
            },
          });
        } catch (error) {
          logger.error("[storage] Failed to persist derived attachment event", {
            messageId: message.id,
            kind: derivedAttachment.kind,
            error: error.message,
          }, error);
        }
      }

      const recentHistory = await loadScopedRecentHistory({
        message,
        limit: selectedMode.historyLimit,
        conversations,
      });
      logger.debug("[chat] Loaded recent history", {
        messageId: message.id,
        recentHistoryCount: recentHistory.length,
      });

      let memories = [];

      try {
        memories = await retrieveMemory({
          memory,
          message,
          input,
          mode: selectedMode,
          logger,
          conversations,
        });
      } catch (error) {
        logger.error("[chat] Memory retrieval failed; continuing without memories", {
          messageId: message.id,
          channelId: message.channelId,
          mode: selectedMode.name,
          error: error.message,
        }, error);
        memories = [];
      }

      logger.debug("[chat] Retrieved memories", {
        messageId: message.id,
        memoryCount: memories.length,
      });

      const [stylePresets, appearancePresets] = await Promise.all([
        listPresetsSafe(imageStylePresets, config.memory?.userScope),
        listPresetsSafe(imageAppearancePresets, config.memory?.userScope),
      ]);
      const contextSections = [];
      const reactionContextSection = reactionContext?.consumeContextSection?.({ conversationId });
      if (reactionContextSection) {
        contextSections.push(reactionContextSection);
      }
      const presenceContext = buildMainUserPresenceContextSection({
        snapshot: mainUserPresence?.getSnapshotForUser?.(input.authorId) || null,
        config,
        userId: input.authorId,
      });
      if (presenceContext) {
        contextSections.push(presenceContext);
      }
      if (shouldSeedImageConversationFromUserText(input.content)) {
        imageConversationState = await markImageConversationActive({
          cache,
          conversationId,
          userScope: config.memory?.userScope,
          reason: "user_request",
          status: "user_request",
        });
      }
      const imageConversationContext = buildImageConversationContextSection(imageConversationState);
      if (imageConversationContext) {
        contextSections.push(imageConversationContext);
      }
      const imagePresetContext = buildImagePresetContextSection({
        imageStylePresets: stylePresets,
        imageAppearancePresets: appearancePresets,
        config,
      });

      if (imagePresetContext) {
        contextSections.push(imagePresetContext);
      }

      // Feature 1, 2, 4: WorldContext, CrossChannel, AttachmentUnderstanding
      const companionConfig = {};
      const customerConfig = { timezone: config.chat?.timezone || null };

      let attachmentUnderstanding = null;
      if (input.derivedAttachments && input.derivedAttachments.length > 0) {
        const firstAttachment = input.derivedAttachments[0];
        if (firstAttachment.kind === "image_analysis") {
          attachmentUnderstanding = buildAttachmentUnderstanding({
            url: firstAttachment.attachment?.url || "",
            filename: firstAttachment.attachment?.name || "",
            visionAnalysis: {
              description: firstAttachment.text || "",
            },
          });
        } else if (firstAttachment.kind === "audio_transcription") {
          attachmentUnderstanding = buildAttachmentUnderstanding({
            url: firstAttachment.attachment?.url || "",
            filename: firstAttachment.attachment?.name || "",
            transcript: firstAttachment.text || "",
          });
        }
      }

      let webSearchResults = null;
      const urls = detectURLsInText(input.content);
      if (urls.length > 0 && shouldFetchURL(input.content, urls)) {
        try {
          const primaryUrl = urls[0];
          const urlMetadata = await fetchAndAnalyzeURL(primaryUrl, logger);
          if (urlMetadata && !urlMetadata.blocked) {
            webSearchResults = [{
              title: urlMetadata.title || urlMetadata.url,
              description: urlMetadata.description,
              url: urlMetadata.url,
              snippet: urlMetadata.readableText,
            }];
          }
        } catch (error) {
          logger?.debug("[chat] URL fetch failed", { error: error.message });
        }
      }

      const modelContextResult = await buildModelContext({
        message,
        input,
        config,
        logger,
        conversations,
        companionConfig,
        customerConfig,
        attachment: attachmentUnderstanding,
        webSearchResults,
        enableWorldContext: true,
        enableCrossChannel: config.features?.crossChannelAwareness !== false,
        enableAttachment: config.features?.attachmentProcessing !== false,
        enableWebResults: config.features?.webResults !== false,
      });

      contextSections.push(...modelContextResult.contextSections);

      // Store diagnostics for later logging
      const modelContextDiagnostics = modelContextResult.diagnostics;

      // Emotional Arc Engine — additive layer. Never mutates the base prompt;
      // only appends an optional internal prelude context section. Fully
      // guarded so a failure here can never break Cadence's base reply.
      if (emotionalArc) {
        try {
          const isDM = message.channel?.isDMBased?.() ?? !message.guildId;
          const channelContext = {
            isDM,
            isThread: message.channel?.isThread?.() ?? false,
            isPrivate: isDM,
          };
          const arcResult = await emotionalArc.processMessage({
            message: input.content,
            recentHistory,
            channelContext,
            memoryContext: memories,
          });
          if (arcResult?.preludeSection) {
            contextSections.push(arcResult.preludeSection);
            logger.debug?.("[chat] Emotional arc prelude injected", {
              messageId: message.id,
            });
          }
        } catch (error) {
          logger.warn("[chat] Emotional arc processing failed; continuing without it", {
            messageId: message.id,
            error: error.message,
          });
        }
      }

      // Feedback & Learning Engine — additive layer. Mirrors the emotional arc
      // hook: appends an optional internal prelude section built from owner-
      // approved + applied rules. Fully guarded; can never break the base reply.
      if (feedbackLearning) {
        try {
          const feedbackResult = await feedbackLearning.processMessage({
            message: input.content,
            recentHistory,
            memoryContext: memories,
          });
          if (feedbackResult?.preludeSection) {
            contextSections.push(feedbackResult.preludeSection);
            logger.debug?.("[chat] Feedback learning prelude injected", {
              messageId: message.id,
            });
          }
        } catch (error) {
          logger.warn("[chat] Feedback learning processing failed; continuing without it", {
            messageId: message.id,
            error: error.message,
          });
        }
      }

      // Relational State Engine — additive layer. Mirrors the emotional arc +
      // feedback hooks: appends an OPTIONAL internal prelude built from the
      // owner-enabled relational state + expression gate. Fully guarded; never
      // overwrites the base prompt and can never break the base reply.
      if (relationalState) {
        try {
          const relationalResult = await relationalState.processMessage({
            message: input.content,
            context: { recentHistory, memoryContext: memories },
            channelType: message.channel?.type === 1 || message.channel?.isDMBased?.() ? "dm" : "guild",
            sourceMessageId: message.id,
            channelId: message.channel?.id || null,
          });
          if (relationalResult?.preludeSection) {
            contextSections.push(relationalResult.preludeSection);
            logger.debug?.("[chat] Relational state prelude injected", {
              messageId: message.id,
            });
          }
        } catch (error) {
          logger.warn("[chat] Relational state processing failed; continuing without it", {
            messageId: message.id,
            error: error.message,
          });
        }
      }

      const modelOutput = await callModel({
        config,
        logger,
        tools,
        mode: selectedMode,
        message,
        input,
        recentHistory,
        memories,
        contextSections,
        toolContext: {
          surface: "chat",
          userScope: config.memory?.userScope,
          guildId: message.guildId,
          mode: selectedMode,
          currentMessage: message,
          conversationId,
          channelId: message.channelId,
          sourceMessageId: message.id,
          currentUserId: input.authorId,
          currentUserName: input.authorName,
          currentUserText: input.content,
          recentHistory,
          memoryContextIds: memories
            .map((memoryItem) => memoryItem?.memoryId || memoryItem?.memory_id || "")
            .filter(Boolean),
          imageConversationActive: Boolean(imageConversationState?.active),
        },
      });

      if (shouldRefreshImageConversationFromAssistant({
        text: modelOutput.text,
        generatedImageIds: modelOutput.generatedImageIds,
      })) {
        await markImageConversationActive({
          cache,
          conversationId,
          userScope: config.memory?.userScope,
          reason: Array.isArray(modelOutput.generatedImageIds) && modelOutput.generatedImageIds.length
            ? "generated_image"
            : "assistant_followup",
          status: Array.isArray(modelOutput.generatedImageIds) && modelOutput.generatedImageIds.length
            ? "generated_image"
            : "prompt_only",
          lastGeneratedAt: Array.isArray(modelOutput.generatedImageIds) && modelOutput.generatedImageIds.length
            ? new Date()
            : imageConversationState?.lastGeneratedAt || null,
        });
      }

      // Emotional Arc safety interception — if the output contains a
      // hard-blocked manipulative pattern, the unsafe reply is NOT sent as-is;
      // it is replaced with a neutral safe fallback before the reply is built.
      // Guarded so a failure here can never break Cadence's base reply.
      if (emotionalArc) {
        try {
          const safety = await emotionalArc.validateOutputSafety({ text: modelOutput.text });
          if (safety.blocked) {
            logger.warn("[chat] Emotional arc blocked manipulative output; replacing with safe fallback", {
              messageId: message.id,
              reason: safety.reason,
            });
            modelOutput.text = safety.safeText;
          }
        } catch (error) {
          logger.warn("[chat] Emotional arc output validation failed", {
            messageId: message.id,
            error: error.message,
          });
        }
      }

      const reply = buildReply({ mode: selectedMode, input, recentHistory, memories, modelOutput });

      logger.debug?.("[chat] Pipeline completed", {
        messageId: message.id,
        mode: selectedMode.name,
        provider: modelOutput.provider,
        recentHistoryCount: recentHistory.length,
        memoryCount: memories.length,
        durationMs: Date.now() - startedAt,
        contextDiagnostics: {
          worldContext: modelContextDiagnostics?.worldContextInjected,
          crossChannel: {
            injected: modelContextDiagnostics?.crossChannelInjected,
            eventsCount: modelContextDiagnostics?.crossChannelEventsCount,
            platforms: modelContextDiagnostics?.crossChannelPlatforms,
          },
          attachment: modelContextDiagnostics?.attachmentInjected,
          webResults: modelContextDiagnostics?.webResultsInjected,
        },
      });

      return reply;
    },
  };
}

module.exports = {
  createChatPipeline,
};
