const { isDevMode, DEV_SYSTEM_PROMPT } = require("../developer/devUtils");
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
const { buildMainUserPresenceContextSection, buildMainUserSpeakerIdentitySection } = require("../bot/mainUserPresence");
const {
  shouldSeedImageConversationFromUserText,
  shouldRefreshImageConversationFromAssistant,
  loadImageConversationState,
  markImageConversationActive,
  buildImageConversationContextSection,
} = require("./imageConversationState");

function normalizeAdultPrivateChannelId(channelId) {
  const value = String(channelId || "").trim();
  return /^\d{17,20}$/.test(value) ? value : null;
}

function getAdultPrivateModeScope({ adultMode, channelId, inDevMode = false }) {
  const rawConfiguredChannelId = String(adultMode?.channelId || "").trim();
  const configuredChannelId = normalizeAdultPrivateChannelId(rawConfiguredChannelId);

  if (inDevMode) {
    return { active: false, configuredChannelId, reason: "dev_mode" };
  }

  if (!adultMode?.enabled) {
    return { active: false, configuredChannelId, reason: "disabled" };
  }

  if (!rawConfiguredChannelId) {
    return { active: false, configuredChannelId: "", reason: "missing_private_channel" };
  }

  if (!configuredChannelId) {
    return { active: false, configuredChannelId: "", reason: "invalid_private_channel" };
  }

  const currentChannelId = String(channelId || "").trim();
  if (currentChannelId !== configuredChannelId) {
    return { active: false, configuredChannelId, reason: "channel_mismatch" };
  }

  return { active: true, configuredChannelId, reason: "channel_match" };
}

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
  innerLife = null,
  continuity = null,
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

      // Developer mode: JC (or DEVELOPER_USER_IDS) in a test channel.
      // In dev mode the persona/roleplay system prompt is replaced with a plain
      // technical prompt, and all companion engine preludes are skipped.
      const inDevMode = isDevMode(message);
      if (inDevMode) {
        logger.info?.("[dev] Developer mode active — skipping persona prompt and engine preludes", {
          messageId: message.id,
          authorId: message.author.id,
          channelId: message.channelId,
        });
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
      const speakerIdentitySection = buildMainUserSpeakerIdentitySection({ config, userId: input.authorId });
      if (speakerIdentitySection) {
        contextSections.push(speakerIdentitySection);
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

      // Emotional Arc Engine — additive layer. Never mutates the base prompt;
      // only appends an optional internal prelude context section. Fully
      // guarded so a failure here can never break the companion's base reply.
      // Skipped in developer mode (persona is replaced; engines not relevant).
      if (!inDevMode && emotionalArc) {
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
      if (!inDevMode && feedbackLearning) {
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
      if (!inDevMode && relationalState) {
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

      // Inner Life & Aliveness Engine — additive layer. Captures mood, habits,
      // micro-repairs, rituals, and room sense; injects a bounded private prelude
      // section. Fully guarded; never overwrites the base prompt.
      if (!inDevMode && innerLife) {
        try {
          const innerLifeResult = await innerLife.processMessage({
            message: input.content,
            channelContext: {
              isDM: message.channel?.type === 1 || Boolean(message.channel?.isDMBased?.()),
              isThread: Boolean(message.channel?.isThread?.()),
              channelId: message.channel?.id || null,
              channelName: message.channel?.name || "",
            },
            recentHistory,
            sourceMessageId: message.id,
            sourceChannelId: message.channel?.id || null,
          });
          if (innerLifeResult?.preludeSection) {
            contextSections.push(innerLifeResult.preludeSection);
            logger.debug?.("[chat] Inner life prelude injected", {
              messageId: message.id,
            });
          }
        } catch (error) {
          logger.warn("[chat] Inner life processing failed; continuing without it", {
            messageId: message.id,
            error: error.message,
          });
        }
      }

      // Continuity Engine — carries open loops, future events, promises, decisions,
      // repair threads, and boundaries as a bounded private prelude section.
      // Additive only; never overwrites base prompt.
      if (!inDevMode && continuity) {
        try {
          const continuityResult = await continuity.processMessage({
            message: input.content,
            channelContext: {
              isDM: message.channel?.type === 1 || Boolean(message.channel?.isDMBased?.()),
              isThread: Boolean(message.channel?.isThread?.()),
              channelId: message.channel?.id || null,
              channelName: message.channel?.name || "",
            },
            recentHistory,
            sourceMessageId: message.id,
            sourceChannelId: message.channel?.id || null,
          });
          if (continuityResult?.preludeSection) {
            contextSections.push(continuityResult.preludeSection);
            logger.debug?.("[chat] Continuity prelude injected", {
              messageId: message.id,
            });
          }
        } catch (error) {
          logger.warn("[chat] Continuity processing failed; continuing without it", {
            messageId: message.id,
            error: error.message,
          });
        }
      }

      const adultMode = config.chat?.adultPrivateMode;
      const adultScope = getAdultPrivateModeScope({
        adultMode,
        channelId: message.channelId,
        inDevMode,
      });

      logger.info?.(`[adult-mode] scope check channel=${message.channelId || ""} configured=${adultScope.configuredChannelId || ""} active=${adultScope.active ? "true" : "false"} reason=${adultScope.reason}`, {
        messageId: message.id,
        channelId: message.channelId || null,
        configuredChannelId: adultScope.configuredChannelId || null,
        active: adultScope.active,
        reason: adultScope.reason,
      });

      if (adultScope.reason === "missing_private_channel" || adultScope.reason === "invalid_private_channel") {
        logger.warn?.("[adult-mode] enabled but no private channel configured; adult mode disabled", {
          messageId: message.id,
          channelId: message.channelId || null,
        });
      }

      logger.debug?.("[adult-mode] scope check", {
        channel: message.channelId,
        configured: adultMode?.channelId || null,
        active: adultScope.active,
        reason: adultScope.reason,
      });

      let effectiveMode = selectedMode;
      let adultSystemPromptPrefix = null;

      if (adultScope.active) {
        const safeword = String(adultMode.safeword || "red").trim().toLowerCase();
        const messageText = String(input.content || "").trim().toLowerCase();
        const safewordTriggered = safeword && messageText === safeword;

        if (safewordTriggered && adultMode.aftercareEnabled && adultMode.aftercarePrompt) {
          adultSystemPromptPrefix = String(adultMode.aftercarePrompt).trim();
          logger.info?.("[chat] Adult private mode: safeword triggered; switching to aftercare", {
            messageId: message.id,
            channelId: message.channelId,
          });
        } else if (!safewordTriggered) {
          const prefixParts = [];

          if (adultMode.systemPrompt) {
            prefixParts.push(String(adultMode.systemPrompt).trim());
          }

          const userPreferences = String(adultMode.userPreferences || "").trim();
          const userWants = String(adultMode.userWants || "").trim();
          const userNeeds = String(adultMode.userNeeds || "").trim();
          const softLimits = String(adultMode.softLimits || "").trim();
          const hardLimits = String(adultMode.hardLimits || "").trim();

          if (userPreferences || userWants || userNeeds || softLimits || hardLimits) {
            const profileLines = ["[User Profile for this space]"];

            if (userPreferences) {
              profileLines.push(`Preferences: ${userPreferences}`);
            }

            if (userWants) {
              profileLines.push(`Wants: ${userWants}`);
            }

            if (userNeeds) {
              profileLines.push(`Needs: ${userNeeds}`);
            }

            if (softLimits) {
              profileLines.push(`Soft limits (approach with care): ${softLimits}`);
            }

            if (hardLimits) {
              profileLines.push(`Hard limits (never cross): ${hardLimits}`);
            }

            prefixParts.push(profileLines.join("\n"));
          }

          if (prefixParts.length) {
            adultSystemPromptPrefix = prefixParts.join("\n\n");
          }

          const adultModel = adultMode.model || config.llm?.romance?.model || null;

          if (adultModel) {
            effectiveMode = { ...selectedMode, chatModel: adultModel };
          }

          logger.info?.("[chat] Adult private mode active", {
            messageId: message.id,
            channelId: message.channelId,
            modelOverride: adultModel || null,
            modelSource: adultMode.model ? "adult_override" : adultModel ? "romance_model" : "default",
            hasSystemPromptPrefix: Boolean(adultMode.systemPrompt),
          });
        }
      }

      const modelOutput = await callModel({
        config,
        logger,
        tools,
        mode: effectiveMode,
        message,
        input,
        recentHistory,
        memories,
        contextSections,
        channelType: "discord",
        overrideSystemPrompt: inDevMode ? DEV_SYSTEM_PROMPT : null,
        systemPromptPrefix: adultSystemPromptPrefix,
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
      // Guarded so a failure here can never break the companion's base reply.
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
      });

      return reply;
    },
  };
}

module.exports = {
  createChatPipeline,
  getAdultPrivateModeScope,
};
