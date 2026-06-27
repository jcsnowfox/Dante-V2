const { isDevMode, DEV_SYSTEM_PROMPT } = require("../developer/devUtils");
const { buildAliveContextPrelude } = require("../alive/aliveContextBuilder");
const { checkBackbone, buildBackboneSection } = require("../alive/backbonePolicy");
const { alivePostUpdate } = require("../alive/alivePostUpdate");
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
const { classifyEmotionalBeat, formatContinuityPrelude, isProposalText, isForgotProposalText } = require("../continuity/emotionalBeats");
const { detectPromise } = require("../continuity/promiseLedger");
const { resolveToneMode, formatTonePrelude } = require("../continuity/toneModeResolver");
const { buildVoiceRules } = require("../continuity/voiceFingerprintGuard");
const { tinyFallbackForReason, checkDuplicateReply, rememberReply } = require("../continuity/replyFallbacks");
const { analyzeRepair, buildRepairPrelude, saveRepairBeat } = require("../relationshipRepair/engine");
const { updateSystemTruth } = require("../systemTruth/runtimeState");
const { curateRuntimeMemory } = require("../memory/runtimeCurator");
const { buildModelContext } = require("../context/modelContextBuilder");
const { detectURLsInText, shouldFetchURL, fetchAndAnalyzeURL } = require("../context/urlHandler");
const { buildAttachmentUnderstanding } = require("../context/attachmentUnderstanding");

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
  emotionalBeatStore = null,
  promiseLedger = null,
  memoryStore = null,
  humanSimulation = null,
  webSearchService = null,
  recentDecisionStore = null,
  timedNotesStore = null,
  situationalAwarenessEngine = null,
  alivePresenceStore = null,
  aliveEventsStore = null,
  intentionQueue = null,
  lifeRuntime = null,
}) {
  return {
    async run({ message, mode, modeName }) {
      const startedAt = Date.now();
      const replyTrace = { llmCalled: false, llmCompleted: false, repairNeeded: false, repairType: null, voiceGuardPassed: null, voiceGuardViolations: [], fallbackUsed: false, fallbackReason: null, finalSource: "llm", duplicateBlocked: false };
      const logDecision = (type, summary, reason, extra = {}) => {
        if (!recentDecisionStore?.logDecision) return;
        const isAdult = extra.adultContext || false;
        recentDecisionStore.logDecision({
          user_scope: config.memory?.userScope || "user",
          companion_id: config.memory?.companionId || config.companion?.id || "Dante",
          decision_type: type,
          decision_summary: summary,
          reason_summary: reason,
          inputs_used_json: extra.inputs || [],
          source_channel_id: message.channelId || message.channel?.id || "",
          source_thread_id: message.channel?.isThread?.() ? (message.channel?.id || "") : "",
          source_message_id: message.id || "",
          privacy_scope: isAdult ? "adult_private" : "normal",
          adult_context: isAdult,
          outcome_status: "recorded",
        }).catch(() => {});
      };
      logger.info?.(`[reply-trace] start messageId=${message.id || ""} channelId=${message.channelId || ""}`);
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

      const beatScope = {
        user_scope: config.memory?.userScope || input.authorId || "user",
        companion_id: config.memory?.companionId || config.companion?.id || "Dante",
      };
      const beatChannelContext = {
        isDM: message.channel?.type === 1 || Boolean(message.channel?.isDMBased?.()),
        isThread: Boolean(message.channel?.isThread?.()),
        channelId: message.channel?.id || message.channelId || null,
        isAdultPrivate: false,
        modeName: selectedMode.name,
      };
      const saveBeat = async (beat, role) => {
        if (!beat || !emotionalBeatStore?.upsertBeat) return null;
        return emotionalBeatStore.upsertBeat({
          ...beatScope,
          event_type: beat.event_type,
          title: beat.title,
          summary: beat.summary,
          emotional_weight: beat.emotional_weight,
          importance: beat.importance,
          source_channel_id: message.channelId || message.channel?.id || "",
          source_message_id: role === "user" ? message.id : `${message.id}:assistant`,
          privacy_scope: beat.privacy_scope,
          adult_context: beat.adult_context,
          must_recall_across_channels: beat.must_recall_across_channels,
          tags_json: beat.tags,
          pinned: beat.pinned,
          resolved: false,
        });
      };
      await curateRuntimeMemory({ text: input.content, role: "user", memoryStore, config, logger, source: { authorId: input.authorId, channelId: message.channelId || message.channel?.id, messageId: message.id } });

      try {
        const userBeat = classifyEmotionalBeat({
          text: input.content,
          role: "user",
          companionId: beatScope.companion_id,
          userDisplayName: input.authorName || "Jenna",
          channelContext: beatChannelContext,
        });
        if (userBeat) await saveBeat(userBeat, "user");
      } catch (error) {
        logger.warn("[chat] Emotional beat curation failed; continuing", { messageId: message.id, error: error.message });
      }

      try {
        const userPromise = detectPromise({ text: input.content, role: "user", channelContext: beatChannelContext });
        if (userPromise && promiseLedger?.savePromise) {
          await promiseLedger.savePromise({ ...beatScope, ...userPromise, source_channel_id: message.channelId || "", source_message_id: message.id });
        }
      } catch (error) {
        logger.warn("[chat] User promise curation failed; continuing", { messageId: message.id, error: error.message });
      }

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

      // WorldContext, CrossChannel, AttachmentUnderstanding, URL fetching
      const companionConfig = {};
      const customerConfig = { timezone: config.chat?.timezone || null };

      let attachmentUnderstanding = null;
      if (input.derivedAttachments && input.derivedAttachments.length > 0) {
        const firstAttachment = input.derivedAttachments[0];
        if (firstAttachment.kind === "image_analysis") {
          attachmentUnderstanding = buildAttachmentUnderstanding({
            url: firstAttachment.attachment?.url || "",
            filename: firstAttachment.attachment?.name || "",
            visionAnalysis: { description: firstAttachment.text || "" },
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

      const modelContextDiagnostics = modelContextResult.diagnostics;

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
          const arcResult = await Promise.race([
            emotionalArc.processMessage({
              message: input.content,
              recentHistory,
              channelContext,
              memoryContext: memories,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("emotional arc timeout")), 5000),
            ),
          ]);
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

      // Timed Notes Injection — additive layer.
      if (timedNotesStore) {
        try {
          const userScope = config.memory?.userScope || "user";
          const companionId = config.memory?.companionId || config.companion?.id || "Dante";
          const now = new Date();
          const activeNotes = await timedNotesStore.listNotes({ user_scope: userScope, companion_id: companionId, status: "active" });
          const upcomingNotes = await timedNotesStore.listNotes({ user_scope: userScope, companion_id: companionId, status: "upcoming" });
          const allRelevantNotes = [...(activeNotes || []), ...(upcomingNotes || [])].slice(0, 5);
          if (allRelevantNotes.length > 0) {
            const notesContent = allRelevantNotes
              .map((note) => {
                const status = note.ends_at && new Date(note.ends_at) < now ? "expired" : "active";
                return `* [${status}] ${note.title}${note.content ? ": " + note.content : ""}`;
              })
              .join("\n");
            if (notesContent) {
              contextSections.push({ label: "TIME-SENSITIVE NOTES", content: notesContent });
              logger.debug?.("[chat] Timed notes injected", { messageId: message.id, notesCount: allRelevantNotes.length });
            }
          }
        } catch (error) {
          logger.debug?.("[chat] Timed notes injection failed; continuing without it", { messageId: message.id, error: error?.message });
        }
      }

      // Situational Awareness Engine — additive layer.
      if (situationalAwarenessEngine) {
        try {
          const awarenessResult = await situationalAwarenessEngine.processMessage({
            message,
            input,
            recentHistory,
            memories,
            mode: selectedMode,
            tools,
            presenceSnapshot: mainUserPresence?.getSnapshotForUser?.(input.authorId) || null,
            worldContext: modelContextResult?.worldContext || null,
          });
          if (awarenessResult?.preludeSection) {
            contextSections.push(awarenessResult.preludeSection);
            logger.debug?.("[chat] Situational awareness prelude injected", {
              messageId: message.id,
              sectionsUsed: awarenessResult.awarenessContext?.sources_used?.length || 0,
            });
          }
        } catch (error) {
          logger.warn("[chat] Situational awareness processing failed; continuing without it", {
            messageId: message.id,
            error: error.message,
          });
        }
      }

      let rankedBeats = [];
      let openPromises = [];

      if (!inDevMode && emotionalBeatStore?.listBeats) {
        try {
          const allBeats = await emotionalBeatStore.listBeats({ ...beatScope, limit: 20 });
          const messageMentionsProposal = isProposalText(input.content) || isForgotProposalText(input.content);
          rankedBeats = allBeats
            .filter((beat) => !beat.adult_context && (beat.must_recall_across_channels || beat.pinned || beat.importance === "critical" || beat.resolved === false))
            .sort((a, b) => {
              const proposalBoostA = messageMentionsProposal && a.event_type === "proposal" ? 100 : 0;
              const proposalBoostB = messageMentionsProposal && b.event_type === "proposal" ? 100 : 0;
              const imp = { critical: 4, high: 3, medium: 2, low: 1 };
              return (proposalBoostB - proposalBoostA) || ((b.pinned ? 10 : 0) - (a.pinned ? 10 : 0)) || ((imp[b.importance] || 0) - (imp[a.importance] || 0));
            })
            .slice(0, 7);
          const continuityPrelude = formatContinuityPrelude(rankedBeats, { channelContext: beatChannelContext });
          if (continuityPrelude) {
            contextSections.push(continuityPrelude);
            await emotionalBeatStore.markRecalled?.(rankedBeats.map((beat) => beat.id).filter(Boolean));
            logger.debug?.("[chat] Emotional continuity prelude injected", { messageId: message.id, beatCount: rankedBeats.length });
          }
        } catch (error) {
          logger.warn("[chat] Emotional beat retrieval failed; continuing", { messageId: message.id, error: error.message });
        }
      }

      if (!inDevMode && promiseLedger?.retrieveOpen) {
        try {
          openPromises = await promiseLedger.retrieveOpen({ ...beatScope, limit: 5, allowAdultPrivate: beatChannelContext.isAdultPrivate });
          if (openPromises.length) {
            contextSections.push({ label: "OPEN PROMISES", content: openPromises.map((p) => `* ${p.promise_text_summary}`).join("\n") });
            await promiseLedger.markRecalled?.(openPromises.map((p) => p.id).filter(Boolean));
          }
        } catch (error) {
          logger.warn("[chat] Promise retrieval failed; continuing", { messageId: message.id, error: error.message });
        }
      }

      // Alive Layer context injection — compact private prelude before LLM
      if (!inDevMode && alivePresenceStore) {
        try {
          const companionId = config?.memory?.companionId || "";
          const customerId = config?.memory?.userScope || "user";
          const alivePresence = await alivePresenceStore.getOrCreate({ companionId, customerId });
          const pendingIntentions = intentionQueue
            ? await intentionQueue.listPending({ companionId, customerId, limit: 1 }).catch(() => [])
            : [];
          const alivePrelude = buildAliveContextPrelude(alivePresence, { memories, pendingIntention: pendingIntentions[0] || null });
          if (alivePrelude) contextSections.push(alivePrelude);

          const backboneResult = checkBackbone(input.content);
          const backboneSection = buildBackboneSection(backboneResult);
          if (backboneSection) {
            contextSections.push(backboneSection);
            await aliveEventsStore?.logEvent?.({
              companionId, customerId,
              eventType: "pushback_triggered",
              reason: backboneResult.reason,
              decision: backboneResult.guidance,
            }).catch(() => {});
          }
        } catch (aliveCtxErr) {
          logger.debug?.("[alive] context injection failed; continuing", { error: aliveCtxErr?.message });
        }
      }

      // Life Runtime prelude — compact private life state (daily plan, current activity).
      // Injected as a private internal section; shapes natural references, not narration.
      if (!inDevMode && lifeRuntime) {
        try {
          const lifePrelude = lifeRuntime.getCurrentPrelude();
          if (lifePrelude) {
            contextSections.push(lifePrelude);
            logger.debug?.("[chat] Life runtime prelude injected", { messageId: message.id });
          }
        } catch (lifeErr) {
          logger.debug?.("[life-runtime] prelude injection failed; continuing", { error: lifeErr?.message });
        }
      }

      const toneDecision = !inDevMode ? resolveToneMode({
        messageText: input.content,
        channelContext: beatChannelContext,
        emotionalBeats: rankedBeats,
        openPromises,
        settings: { allowFlirtyInNormalChannels: false, defaultMode: "neutral" },
      }) : null;
      if (toneDecision) { const toneText = formatTonePrelude(toneDecision); contextSections.push({ label: "TONE MODE", content: toneText.replace(/^TONE MODE:\n?/, "") }); logDecision("reply_tone_selected", `Tone: ${toneDecision.mode || "neutral"}`, toneDecision.reason || "tone resolver", { inputs: [toneDecision.mode] }); }
      let repairResult = null;
      if (!inDevMode) {
        repairResult = await analyzeRepair({ messageText: input.content, emotionalBeats: rankedBeats, openPromises, durableMemories: memories, recentHistory, channelContext: beatChannelContext, userDisplayName: input.authorName || "Jenna" });
        replyTrace.repairNeeded = Boolean(repairResult?.repairNeeded);
        replyTrace.repairType = repairResult?.repairNeeded ? repairResult.repairType : null;
        logger.info?.(`[reply-trace] repairNeeded=${replyTrace.repairNeeded} repairType=${replyTrace.repairType || "null"}`);
        if (repairResult?.repairNeeded) {
          const repairPrelude = buildRepairPrelude(repairResult, input.content);
          if (repairPrelude) contextSections.push(repairPrelude);
          updateSystemTruth("continuity", { relationshipRepairEngineEnabled: true, lastToneMode: "repair", lastRepairEvent: { type: repairResult.repairType, severity: repairResult.severity, evidenceCount: repairResult.retrievedEvidence.length, createdAt: new Date().toISOString() } });
          logger.info?.(`[relationship-repair] prelude injected type=${repairResult.repairType} severity=${repairResult.severity} evidence=${repairResult.retrievedEvidence.length}`);
          logDecision("repair_mode_triggered", `Repair: ${repairResult.repairType}`, `severity=${repairResult.severity}`, { inputs: [repairResult.repairType] });
        }
      }
      if (!inDevMode) { const voiceText = buildVoiceRules(); contextSections.push({ label: "VOICE RULES", content: voiceText.replace(/^VOICE RULES:\n?/, "") }); }
      logger.info?.(`[reply-context] continuity prelude built beats=${rankedBeats.length} promises=${openPromises.length} mode=${repairResult?.repairNeeded ? "repair" : (toneDecision?.mode || "dev")}`);

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

      // Human Simulation Foundation — injects channel awareness, micro-preferences,
      // timeline anchors, and due follow-ups as bounded private prelude sections.
      // Additive only; fully guarded; never breaks the base reply.
      if (!inDevMode && humanSimulation) {
        try {
          const hsResult = await humanSimulation.processMessage({
            message,
            input,
            repairResult,
            adultScope,
            beatType: rankedBeats[0]?.event_type || null,
          });
          if (hsResult?.preludeSections?.length) {
            for (const section of hsResult.preludeSections) {
              contextSections.push(section);
            }
            logger.debug?.("[chat] Human simulation preludes injected", { messageId: message.id, count: hsResult.preludeSections.length });
          }
        } catch (error) {
          logger.warn("[chat] Human simulation processing failed; continuing without it", { messageId: message.id, error: error.message });
        }
      }
      logger.info?.("[reply-trace] humanSimulation processed=true");

      // Web Search — detect explicit search intent, run search, inject WEB SEARCH RESULTS section
      if (webSearchService && !inDevMode) {
        try {
          const userText = String(input?.content || "");
          const intent = webSearchService.detectSearchIntent(userText);
          if (intent.shouldSearch && intent.confidence >= 0.7 && webSearchService.isEnabled()) {
            logger.info?.(`[reply-trace] web-search intent=${intent.reason} confidence=${intent.confidence} query="${String(intent.searchQuery || "").slice(0, 50)}"`);
            const searchResult = await webSearchService.search(intent.searchQuery, {});
            if (!searchResult.unavailable && searchResult.results?.length) {
              const lines = searchResult.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`);
              contextSections.push({ label: "WEB SEARCH RESULTS", content: lines.join("\n\n") });
              logger.info?.(`[reply-trace] web-search results injected count=${searchResult.results.length}`);
              logDecision("web_search_used", `Web search: ${String(intent.searchQuery || "").slice(0, 60)}`, `intent=${intent.reason}`, { inputs: [intent.searchQuery] });
            } else if (searchResult.unavailable && searchResult.suggestedReply) {
              logger.info?.(`[reply-trace] web-search unavailable reason=${searchResult.reason}`);
            }
          }
        } catch (err) {
          logger.warn?.("[chat] Web search failed; continuing without results", { messageId: message.id, error: err?.message });
        }
      }

      let modelOutput;
      try {
        replyTrace.llmCalled = true;
        logger.info?.(`[reply-trace] llm called=true`);
        modelOutput = await callModel({
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
        replyTrace.llmCompleted = true;
        logger.info?.(`[reply-trace] llm completed=true length=${String(modelOutput?.text || "").length}`);
      } catch (error) {
        replyTrace.llmCompleted = false;
        replyTrace.fallbackUsed = true;
        replyTrace.fallbackReason = "llm_call_failed";
        replyTrace.finalSource = "tiny_fallback";
        logger.error?.("[chat] LLM call failed; using tiny fallback", { messageId: message.id, channelId: message.channelId, error: error?.message });
        logger.info?.(`[reply-trace] llm completed=false length=0`);
        modelOutput = { provider: "fallback", mode: effectiveMode.name, text: tinyFallbackForReason("llm_call_failed", logger, { messageId: message.id, channelId: message.channelId }) };
        logDecision("fallback_used", "LLM call failed; tiny fallback used", error?.message || "llm_call_failed");
      }

      logger.info?.("[reply-trace] voiceGuard bypassed=true");

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
      if (!reply?.content?.trim()) {
        reply.content = tinyFallbackForReason("empty_reply", logger, { messageId: message.id, channelId: message.channelId });
        replyTrace.fallbackUsed = true;
        replyTrace.fallbackReason = "empty_reply";
        replyTrace.finalSource = "tiny_fallback";
      }

      const duplicateCheck = checkDuplicateReply({ channelId: message.channelId, userScope: input.authorId || config.memory?.userScope, reply: reply.content });
      if (duplicateCheck.duplicate && replyTrace.finalSource !== "tiny_fallback") {
        replyTrace.duplicateBlocked = true;
        logger.info?.(`[reply-trace] duplicateBlocked=true`);
        try {
          const retryOutput = await callModel({
            config, logger, tools, mode: effectiveMode, message, input, recentHistory, memories,
            contextSections: [...contextSections, { label: "DUPLICATE REPLY REPAIR", content: "Do not repeat the previous reply. Answer the current user message directly in Dante’s voice." }],
            channelType: "discord", overrideSystemPrompt: inDevMode ? DEV_SYSTEM_PROMPT : null, systemPromptPrefix: adultSystemPromptPrefix,
            toolContext: { surface: "chat", userScope: config.memory?.userScope, guildId: message.guildId, mode: selectedMode, currentMessage: message, conversationId, channelId: message.channelId, sourceMessageId: message.id, currentUserId: input.authorId, currentUserName: input.authorName, currentUserText: input.content, recentHistory },
          });
          const retryReply = buildReply({ mode: selectedMode, input, recentHistory, memories, modelOutput: retryOutput });
          if (!checkDuplicateReply({ channelId: message.channelId, userScope: input.authorId || config.memory?.userScope, reply: retryReply.content }).duplicate) {
            reply.content = retryReply.content;
            replyTrace.finalSource = "retry";
          } else {
            reply.content = "I’m stuck repeating myself. Ask me again and I’ll answer clean.";
            replyTrace.fallbackUsed = true;
            replyTrace.fallbackReason = "duplicate_reply";
            replyTrace.finalSource = "tiny_fallback";
          }
        } catch (error) {
          reply.content = tinyFallbackForReason("duplicate_retry_failed", logger, { messageId: message.id, channelId: message.channelId });
          replyTrace.fallbackUsed = true;
          replyTrace.fallbackReason = "duplicate_retry_failed";
          replyTrace.finalSource = "tiny_fallback";
        }
      } else {
        logger.info?.(`[reply-trace] duplicateBlocked=false`);
      }
      rememberReply({ channelId: message.channelId, userScope: input.authorId || config.memory?.userScope, reply: reply.content });
      logger.info?.(`[reply-trace] fallbackUsed=${replyTrace.fallbackUsed} fallbackReason=${replyTrace.fallbackReason || "null"}`);
      logger.info?.(`[reply-trace] finalSource=${replyTrace.finalSource}`);

      // Inner Life post-reply observation — lets Dante persist his own diagnostic
      // carry-forward notes when he identifies a continuity/journal gap.
      if (!inDevMode && innerLife?.observeInteraction) {
        innerLife.observeInteraction({
          message: input.content || "",
          reply: reply?.content || "",
          sourceMessageId: message.id,
          sourceChannelId: message.channel?.id || message.channelId || null,
        }).catch((error) => {
          logger.warn?.("[chat] Inner life interaction journal failed; continuing", {
            messageId: message.id,
            error: error?.message,
          });
        });
      }

      // Human Simulation Pack 2 post-processing — updates presence last_companion_reply_at.
      // Fire-and-forget: never delays the reply.
      if (!inDevMode && humanSimulation?.postProcessMessage) {
        humanSimulation.postProcessMessage({ message, reply: reply?.content || "", adultScope }).catch(() => {});
      }
      logger.info?.("[reply-trace] humanSimulationPack2 processed=true");

      // Alive Layer post-update — fire-and-forget, never delays reply
      if (!inDevMode && alivePresenceStore) {
        alivePostUpdate({
          alivePresenceStore,
          aliveEventsStore,
          intentionQueue,
          companionId: config?.memory?.companionId || "",
          customerId: config?.memory?.userScope || "user",
          messageContent: input.content || "",
          replyContent: reply?.content || "",
          repairResult,
          now: new Date(),
          logger,
        }).catch(() => {});
      }

      // Relational consequences post-update (Life Runtime 5.0) — detect/resolve
      // emotionally meaningful events so they carry into the next reply.
      // Fire-and-forget, never delays the reply.
      if (!inDevMode && lifeRuntime?.observeInteraction) {
        lifeRuntime.observeInteraction({
          userText: input.content || "",
          replyText: reply?.content || "",
          repairResult,
          now: new Date(),
          recentHistory,
          duplicate: Boolean(duplicateCheck?.duplicate || replyTrace.duplicateBlocked),
          tone: toneDecision?.mode || selectedMode?.name || "",
          generatedImageIds: modelOutput?.generatedImageIds || [],
          generatedAudioIds: modelOutput?.generatedAudioIds || [],
          memoryContext: memories,
        }).catch(() => {});
      }

      try {
        if (repairResult?.repairNeeded) {
          await saveRepairBeat({ emotionalBeatStore, scope: { ...beatScope, source_channel_id: message.channelId || "", source_message_id: message.id }, message: input.content, reply: reply?.content || "", repairResult });
        }
      } catch (error) {
        logger.warn("[relationship-repair] Failed to save repair beat; continuing", { messageId: message.id, error: error.message });
      }


      await curateRuntimeMemory({ text: reply?.content || "", role: "assistant", memoryStore, config, logger, source: { authorId: input.authorId, channelId: message.channelId || message.channel?.id, messageId: `${message.id}:assistant` } });

      try {
        const companionPromise = detectPromise({ text: reply?.content || "", role: "assistant", channelContext: beatChannelContext });
        if (companionPromise && promiseLedger?.savePromise) {
          await promiseLedger.savePromise({ ...beatScope, ...companionPromise, source_channel_id: message.channelId || "", source_message_id: `${message.id}:assistant` });
        }
      } catch (error) {
        logger.warn("[chat] Companion promise curation failed; continuing", { messageId: message.id, error: error.message });
      }

      try {
        const companionBeat = classifyEmotionalBeat({
          text: reply?.content || "",
          role: "assistant",
          companionId: beatScope.companion_id,
          userDisplayName: input.authorName || "Jenna",
          channelContext: beatChannelContext,
        });
        if (companionBeat) await saveBeat(companionBeat, "assistant");
      } catch (error) {
        logger.warn("[chat] Companion reply beat curation failed; continuing", { messageId: message.id, error: error.message });
      }

      updateSystemTruth("llm", { activeChatProvider: config.llm?.provider || config.openai?.provider || "unknown", activeModel: effectiveMode.chatModel || config.openai?.chatModel || "unknown", lastModelUsed: modelOutput.model || effectiveMode.chatModel || "unknown" });
      updateSystemTruth("memory", { lastMemoryRetrieval: new Date().toISOString(), lastContinuityPreludeBuilt: new Date().toISOString(), lastCrossChannelRetrieval: rankedBeats.length ? new Date().toISOString() : undefined, lastEmotionalBeatSaved: rankedBeats[0]?.updated_at || rankedBeats[0]?.created_at || undefined });
      updateSystemTruth("privacy", { privateAdultMemoryGatingEnabled: true, rawAudioStorageEnabled: false, rawTranscriptLoggingEnabled: false, safeErrorShieldEnabled: true });
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
