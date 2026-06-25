const { getMode } = require("../chat/modes");
const { ChannelType } = require("discord.js");
const { callModel } = require("../chat/pipeline/callModel");
const { buildSystemPrompt } = require("../chat/prompt/buildSystemPrompt");
const { loadImagePresetContextSection } = require("../images/presetContext");
const { runDailyThreadAutomation } = require("../automations/runners");
const {
  isDailyThreadAction,
  mapDailyThreadActionToAutomation,
} = require("../automations/dailyThreadAction");
const {
  isDiscordEntityTooLargeError,
  buildGeneratedImageFallbackUrls,
  buildOversizeFallbackContent,
} = require("../discord/oversizeFallback");
const { getLlmClient, hasLlmApiKey, resolveChatModel } = require("../llm/client");
const { splitTextIntoChunks } = require("../bot/events/messageCreate");
const { replaceCustomEmojiLabelsForDiscord } = require("../reactions/customEmojiPalette");
const { resolveAutomationChannelId } = require("../automations/time");
const { prependUserMention } = require("../discord/mentions");
const {
  buildAutomationInput,
  loadScopedAutomationRecentHistory,
  retrieveAutomationMemories,
  normalizeAutomationIdForJournalEntry,
  recordAutomationMessage,
  createForumThreadWithStarterMessage,
} = require("../automations/messageHelpers");
const { loadJournalContextPayload, retrieveJournalMemories } = require("../automations/journalContext");
const {
  CONTEXT_LOOKUP_TOOL_NAMES,
  buildProactiveToolContext,
  mapEnabledToolsToToolContext,
} = require("./toolContext");
const { parseJsonOutput } = require("../llm/jsonOutput");

function truncateForLog(value, limit = 500) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function fallbackThreadStarter(action) {
  return {
    threadTitle: String(action.label || "New thread").trim() || "New thread",
    message: String(action.prompt || "Starting a new thread.").trim() || "Starting a new thread.",
  };
}

function normalizeThreadStarter(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const threadTitle = String(parsed.threadTitle || "").trim();
  const message = String(parsed.message || "").trim();

  return threadTitle && message ? { threadTitle, message } : null;
}

function buildProactiveAutomationEnvelope({ action, config }) {
  return {
    automationId: action.actionId,
    source: action.triggerType,
    triggerType: action.triggerType,
    type: action.actionType,
    label: action.name,
    channelId: action.target,
    scheduleTime: action.scheduleTime || "00:00",
    timezone: action.timezone || config.chat?.timezone || "UTC",
    prompt: action.prompt,
    enabled: action.enabled,
    mentionUser: action.mentionUser,
    userId: String(config.chat?.userId || "").trim(),
    userScope: action.userScope || config.memory?.userScope || "",
    threadTitleTemplate: action.threadTitleTemplate || "",
    threadStarterPrompt: action.threadStarterPrompt || action.prompt || "",
    threadModeKey: action.threadModeKey || "daily",
  };
}

async function persistProactiveActionState(store, action, updates = {}) {
  return store.upsertAction({
    actionId: action.actionId,
    triggerType: action.triggerType,
    name: action.name,
    actionType: action.actionType,
    target: action.target,
    prompt: action.prompt,
    enabledTools: action.enabledTools || [],
    enabled: action.enabled,
    scheduleMode: action.scheduleMode || "daily",
    scheduleTime: action.scheduleTime || "09:00",
    scheduleDay: action.scheduleDay || "monday",
    timezone: action.timezone || "UTC",
    frequency: action.frequency || "normal",
    quietHoursAllowed: action.quietHoursAllowed,
    mentionUser: action.mentionUser,
    isBuiltin: action.isBuiltin,
    threadTitleTemplate: action.threadTitleTemplate || "",
    threadStarterPrompt: action.threadStarterPrompt || "",
    threadModeKey: action.threadModeKey || "daily",
    lastRunAt: updates.lastRunAt || action.lastRunAt || "",
    lastError: updates.lastError ?? action.lastError ?? "",
  }, {
    userScope: action.userScope,
  });
}

function buildProactiveAutomationContext({
  action,
  config,
  heartbeatDecision = null,
  heartbeatContext = null,
}) {
  return {
    source: action.triggerType,
    triggerType: action.triggerType,
    type: action.actionType,
    label: action.name,
    prompt: action.prompt,
    userName: config.chat?.promptBlocks?.userName || "the user",
    target: action.target,
    enabledTools: action.enabledTools || [],
    mentionUser: action.mentionUser,
    heartbeatTone: String(heartbeatDecision?.tone || "").trim(),
    heartbeatWhy: String(heartbeatDecision?.why || "").trim(),
    heartbeatContext: heartbeatContext && typeof heartbeatContext === "object"
      ? heartbeatContext
      : null,
  };
}

function pushReactionContextSection(contextSections = [], reactionContext = null, conversationId = "") {
  const section = reactionContext?.peekContextSection?.({ conversationId });

  if (section) {
    contextSections.push(section);
  }
}

function buildThreadHeartbeatContextText(heartbeatContext = null) {
  if (!heartbeatContext || typeof heartbeatContext !== "object") {
    return "";
  }

  const lines = [];

  if (heartbeatContext.currentLocalTime) {
    lines.push(`Current local time when this action was chosen: ${heartbeatContext.currentLocalTime}`);
  }

  if (heartbeatContext.lastUserMessageLocalTime) {
    lines.push(`Most recent user message time: ${heartbeatContext.lastUserMessageLocalTime}`);
  }

  if (heartbeatContext.recentUserActivityMinutes !== null && heartbeatContext.recentUserActivityMinutes !== undefined) {
    lines.push(`Recent user activity age in minutes: ${heartbeatContext.recentUserActivityMinutes}`);
  }

  if (heartbeatContext.presenceSnapshot?.activities?.length) {
    lines.push("Opt-in Discord activity snapshot at decision time:");
    lines.push(JSON.stringify({
      activities: heartbeatContext.presenceSnapshot.activities,
      updatedAt: heartbeatContext.presenceSnapshot.updatedAt || "",
    }, null, 2));
  }

  if (heartbeatContext.awarenessPrelude && typeof heartbeatContext.awarenessPrelude === "string" && heartbeatContext.awarenessPrelude.trim()) {
    lines.push("");
    lines.push(heartbeatContext.awarenessPrelude.trim());
  }

  if (!lines.length) {
    return "";
  }

  return [
    "Private Heartbeat context:",
    lines.join("\n"),
    [
      "Use this only as private continuity.",
      "If music, game, or activity context genuinely helped shape the thread, you may use it as a creative spark or mention it lightly and naturally.",
      "Do not report raw presence status or make the opener feel like surveillance.",
      "Do not treat activity-derived details as your own independent tastes, feelings, memories, or preferences.",
    ].join(" "),
  ].join("\n");
}

function buildThreadInput({ action, config }) {
  return buildAutomationInput({
    automation: {
      automationId: action.actionId,
      source: action.triggerType,
      triggerType: action.triggerType,
      type: action.actionType,
      label: action.name,
      channelId: action.target,
    },
    config,
  });
}

function hasAvailableContextLookupTool(tools = null, toolContext = {}) {
  if (!tools?.list) {
    return false;
  }

  return tools.list(toolContext).some((tool) => CONTEXT_LOOKUP_TOOL_NAMES.includes(tool?.name));
}

function shouldUseToolLoopForThreadAction(action = {}, { tools = null, toolContext = {} } = {}) {
  return (Array.isArray(action.enabledTools) && action.enabledTools.length > 0)
    || hasAvailableContextLookupTool(tools, toolContext);
}

function isForumThreadParent(channel) {
  return channel?.type === ChannelType.GuildForum || channel?.type === ChannelType.GuildMedia;
}

async function resolveActionMode({
  channelModes,
  config,
  channel,
  modeOverride = null,
  fallbackModeKey = null,
}) {
  if (modeOverride) {
    return modeOverride;
  }

  const resolvedFallbackModeKey = fallbackModeKey || config.chat?.defaultMode || "default";

  if (channelModes?.resolveModeForChannel && channel?.id) {
    return channelModes.resolveModeForChannel({
      guildId: channel.guildId,
      channelId: channel.id,
      parentChannelId: channel.isThread?.() ? channel.parentId : null,
      fallbackModeKey: resolvedFallbackModeKey,
    });
  }

  return getMode(resolvedFallbackModeKey);
}

async function createTextThreadWithStarter(parentChannel, {
  name,
  reason,
  reply,
  generatedImages = null,
  config = {},
}) {
  const thread = await parentChannel.threads.create({
    name,
    autoArchiveDuration: 1440,
    reason,
  });
  const replyResult = await sendProactiveReply(thread, reply, {
    generatedImages,
    config,
  });

  return {
    thread,
    ...replyResult,
  };
}

async function sendProactiveReply(channel, reply = {}, { generatedImages = null, config = {} } = {}) {
  const content = String(reply.content || "").trim();
  const outgoingContent = replaceCustomEmojiLabelsForDiscord(content, config.chat?.customReactionEmojis || []);
  const suppressEmbeds = Boolean(reply.suppressEmbeds);
  const files = Array.isArray(reply.files) ? reply.files : [];
  const generatedImageIds = Array.isArray(reply.generatedImageIds) ? reply.generatedImageIds : [];
  const imageWarnings = Array.isArray(reply.imageWarnings) ? reply.imageWarnings : [];
  const chunks = splitTextIntoChunks(content);
  const outgoingChunks = splitTextIntoChunks(outgoingContent);
  let sentMessage = null;

  if (!outgoingChunks.length && files.length) {
    try {
      sentMessage = await channel.send({
        files,
        flags: suppressEmbeds ? ["SuppressEmbeds"] : undefined,
      });
    } catch (error) {
      if (!isDiscordEntityTooLargeError(error)) {
        throw error;
      }

      const fallbackUrls = await buildGeneratedImageFallbackUrls({
        generatedImageIds,
        generatedImages,
        config,
      });

      sentMessage = await channel.send({
        content: buildOversizeFallbackContent({
          content: "",
          urls: fallbackUrls,
          imageWarnings,
        }),
        flags: suppressEmbeds ? ["SuppressEmbeds"] : undefined,
      });
    }

    return {
      chunks: [],
      sentMessage,
    };
  }

  for (const [index, chunk] of outgoingChunks.entries()) {
    const isLastChunk = index === outgoingChunks.length - 1;
    try {
      sentMessage = await channel.send({
        content: chunk,
        files: isLastChunk ? files : undefined,
        flags: suppressEmbeds ? ["SuppressEmbeds"] : undefined,
      });
    } catch (error) {
      if (!(isLastChunk && files.length) || !isDiscordEntityTooLargeError(error)) {
        throw error;
      }

      const fallbackUrls = await buildGeneratedImageFallbackUrls({
        generatedImageIds,
        generatedImages,
        config,
      });

      sentMessage = await channel.send({
        content: buildOversizeFallbackContent({
          content: chunk,
          urls: fallbackUrls,
          imageWarnings,
        }),
        flags: suppressEmbeds ? ["SuppressEmbeds"] : undefined,
      });
    }
  }

  return {
    chunks,
    sentMessage,
  };
}

async function runMessageAction({
  action,
  client,
  config,
  logger,
  memory,
  tools,
  conversations,
  proactiveActionStore,
  cache,
  generatedImages = null,
  generatedAudio = null,
  imageStylePresets = null,
  imageAppearancePresets = null,
  persistState = true,
  channelModes = null,
  modeOverride = null,
  channelOverride = null,
  channelIdOverride = "",
  heartbeatDecision = null,
  heartbeatContext = null,
  reactionContext = null,
}) {
  const resolvedChannelId = channelIdOverride || await resolveAutomationChannelId(action.target, {
    cache,
    userScope: config.memory.userScope,
  });
  const channel = channelOverride || await client.channels.fetch(resolvedChannelId);

  if (!channel?.isTextBased?.()) {
    throw new Error("Configured target is not text-based.");
  }

  const mode = await resolveActionMode({
    channelModes,
    config,
    channel,
    modeOverride,
  });
  const automation = buildProactiveAutomationEnvelope({ action, config });
  const input = buildAutomationInput({ automation, channelId: resolvedChannelId, config });
  const recentHistory = await loadScopedAutomationRecentHistory({
    conversations,
    channel,
    limit: mode.historyLimit || 8,
  });
  const memories = await retrieveAutomationMemories({
    memory,
    channel,
    input,
    mode,
    conversations,
  });
  const contextSections = [];
  pushReactionContextSection(contextSections, reactionContext, resolvedChannelId);

  if (Array.isArray(action.enabledTools) && action.enabledTools.includes("generate_image")) {
    const imagePresetContext = await loadImagePresetContextSection({
      config,
      userScope: config.memory?.userScope,
      imageStylePresetsStore: imageStylePresets,
      imageAppearancePresetsStore: imageAppearancePresets,
    });

    if (imagePresetContext) {
      contextSections.push(imagePresetContext);
    }
  }
  const modelOutput = await callModel({
    config,
    logger,
    mode,
    input,
    recentHistory,
    memories,
    tools,
    contextSections,
    automation: buildProactiveAutomationContext({
      action,
      config,
      heartbeatDecision,
      heartbeatContext,
    }),
    toolContext: buildProactiveToolContext({
      surface: action.triggerType,
      enabledTools: action.enabledTools,
      config,
      channel,
      mode,
      actionName: action.name,
      actionType: action.actionType,
      channelId: resolvedChannelId,
      sourceMessageId: input.messageId,
      currentUserText: input.content,
      recentHistory,
      memories,
    }),
  });
  if (!String(modelOutput.text || "").trim() && !(Array.isArray(modelOutput.files) && modelOutput.files.length)) {
    throw new Error("Proactive action produced no usable reply.");
  }

  const text = String(modelOutput.text || "").trim();
  const finalText = action.mentionUser
    ? prependUserMention(text, automation.userId)
    : text;
  const { chunks, sentMessage } = await sendProactiveReply(channel, {
    content: finalText,
    suppressEmbeds: Boolean(modelOutput.webSearchUsed),
    files: modelOutput.files,
    generatedImageIds: modelOutput.generatedImageIds,
    generatedAudioIds: modelOutput.generatedAudioIds,
    imageWarnings: modelOutput.imageWarnings,
  }, {
    generatedImages,
    config,
  });
  reactionContext?.markLatestFromMessage?.(sentMessage);

  await recordAutomationMessage({
    conversations,
    message: sentMessage,
    config,
    automation,
    chunks,
    generatedImageIds: modelOutput.generatedImageIds,
    generatedAudioIds: modelOutput.generatedAudioIds,
    cache,
  });

  if (generatedImages && sentMessage && Array.isArray(modelOutput.generatedImageIds) && modelOutput.generatedImageIds.length) {
    for (const imageId of modelOutput.generatedImageIds) {
      await generatedImages.updateImageRecord(imageId, {
        discordMessageId: sentMessage.id,
      }, {
        userScope: config.memory?.userScope,
      }).catch(() => {});
    }
  }

  if (generatedAudio && sentMessage && Array.isArray(modelOutput.generatedAudioIds) && modelOutput.generatedAudioIds.length) {
    for (const audioId of modelOutput.generatedAudioIds) {
      await generatedAudio.updateAudioRecord(audioId, {
        discordMessageId: sentMessage.id,
      }, {
        userScope: config.memory?.userScope,
      }).catch(() => {});
    }
  }

  if (persistState) {
    await persistProactiveActionState(proactiveActionStore, action, {
      lastRunAt: new Date().toISOString(),
      lastError: "",
    });
  }

  return {
    channelId: resolvedChannelId,
    threadId: null,
    messageId: sentMessage?.id || null,
  };
}

async function generateThreadStarter({
  config,
  logger,
  mode,
  action,
  tone,
  heartbeatWhy = "",
  recentMessages = [],
  memories = [],
  heartbeatContext = null,
}) {
  if (!hasLlmApiKey(config, "chat")) {
    return {
      threadTitle: action.label,
      message: action.prompt,
    };
  }

  const client = getLlmClient(config, "chat");
  const model = mode?.chatModel || resolveChatModel(config);
  const instructions = buildSystemPrompt({ config, mode });
  const recentContextExcerpt = recentMessages
    .slice(-6)
    .map((message) => `${message.authorName || "Unknown"}: ${message.content || ""}`)
    .join("\n");
  const response = await client.responses.create({
    model,
    instructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Create a new thread opener for a proactive action.",
              "This is an internal trigger, not a live user message or request.",
              "Treat the action as something you chose to initiate from the saved Heartbeat list; do not imply the user just picked it or asked for it.",
              `Internal action prompt: ${action.prompt}`,
              tone ? `Tone hint: ${tone}` : "",
              heartbeatWhy ? `Private reason this action was chosen: ${heartbeatWhy}` : "",
              heartbeatWhy ? "Use that reason as private continuity. Do not quote it directly or explain that a conductor chose this action." : "",
              buildThreadHeartbeatContextText(heartbeatContext),
              recentContextExcerpt ? `Recent context excerpt:\n${recentContextExcerpt}` : "",
              memories.length ? `Relevant context for your response:\n${memories.map((memory, index) => {
                const referenceDate = memory.referenceDate || memory.reference_date;
                const dateNote = referenceDate ? ` (date: ${referenceDate})` : "";
                const title = memory.title ? `${memory.title}: ` : "";
                return `${index + 1}.${dateNote} ${title}${memory.content || memory.text || JSON.stringify(memory)}`;
              }).join("\n")}` : "",
              "Reply with JSON only using this shape:",
              "{\"threadTitle\":\"string\",\"message\":\"string\"}",
              "Keep the thread title concise and the opening message warm, playful or thoughtful as needed, and ready to post.",
            ].filter(Boolean).join("\n\n"),
          },
        ],
      },
    ],
  });
  const starter = normalizeThreadStarter(parseJsonOutput(response.output_text));

  if (!starter) {
    logger?.warn?.("[proactive] Thread starter did not return usable JSON; using configured prompt fallback.", {
      actionId: action.actionId || null,
      outputPreview: truncateForLog(response.output_text),
    });
    return fallbackThreadStarter(action);
  }

  return starter;
}

async function runJournalAction({
  action,
  client,
  config,
  logger,
  memory,
  journalStore,
  tools,
  conversations,
  proactiveActionStore,
  cache,
  generatedImages = null,
  generatedAudio = null,
  imageStylePresets = null,
  imageAppearancePresets = null,
  now = new Date(),
  channelModes = null,
  modeOverride = null,
  heartbeatDecision = null,
  heartbeatContext = null,
  reactionContext = null,
}) {
  const resolvedChannelId = await resolveAutomationChannelId(action.target, {
    cache,
    userScope: config.memory.userScope,
  });
  const channel = await client.channels.fetch(resolvedChannelId);

  if (!channel?.isTextBased?.()) {
    throw new Error("Configured target is not text-based.");
  }

  const mode = await resolveActionMode({
    channelModes,
    config,
    channel,
    modeOverride,
  });
  const automation = buildProactiveAutomationEnvelope({ action, config });
  const input = buildAutomationInput({ automation, channelId: resolvedChannelId, config });
  const journalContext = await loadJournalContextPayload({
    conversations,
    config,
    journalStore,
    userScope: config.memory.userScope,
    guildId: channel.guildId,
    excludedChannelId: resolvedChannelId,
    now,
  });
  const memories = await retrieveJournalMemories({
    memory,
    channel,
    input,
    mode,
    conversations,
    selectedSlice: journalContext.selectedSlice,
    retrieveAutomationMemories,
  });
  const contextSections = [...journalContext.sections];
  pushReactionContextSection(contextSections, reactionContext, resolvedChannelId);

  if (Array.isArray(action.enabledTools) && action.enabledTools.includes("generate_image")) {
    const imagePresetContext = await loadImagePresetContextSection({
      config,
      userScope: config.memory?.userScope,
      imageStylePresetsStore: imageStylePresets,
      imageAppearancePresetsStore: imageAppearancePresets,
    });

    if (imagePresetContext) {
      contextSections.push(imagePresetContext);
    }
  }
  const modelOutput = await callModel({
    config,
    logger,
    mode,
    input,
    recentHistory: [],
    memories,
    tools,
    contextSections,
    automation: buildProactiveAutomationContext({
      action,
      config,
      heartbeatDecision,
      heartbeatContext,
    }),
    toolContext: buildProactiveToolContext({
      surface: action.triggerType,
      enabledTools: action.enabledTools,
      config,
      channel,
      mode,
      actionName: action.name,
      actionType: action.actionType,
      channelId: resolvedChannelId,
      sourceMessageId: input.messageId,
      currentUserText: input.content,
      recentHistory: [],
      memories,
    }),
  });
  if (!String(modelOutput.text || "").trim() && !(Array.isArray(modelOutput.files) && modelOutput.files.length)) {
    throw new Error("Proactive journal action produced no usable reply.");
  }

  const text = String(modelOutput.text || "").trim();
  const finalText = action.mentionUser
    ? prependUserMention(text, automation.userId)
    : text;
  const { chunks, sentMessage } = await sendProactiveReply(channel, {
    content: finalText,
    suppressEmbeds: Boolean(modelOutput.webSearchUsed),
    files: modelOutput.files,
    generatedImageIds: modelOutput.generatedImageIds,
    generatedAudioIds: modelOutput.generatedAudioIds,
    imageWarnings: modelOutput.imageWarnings,
  }, {
    generatedImages,
    config,
  });
  reactionContext?.markLatestFromMessage?.(sentMessage);

  if (sentMessage) {
    await journalStore.recordEntry({
      automationId: normalizeAutomationIdForJournalEntry(action.actionId),
      channelId: resolvedChannelId,
      guildId: channel.guildId,
      title: action.name,
      content: chunks.join("\n\n"),
    }, {
      userScope: config.memory.userScope,
      createdAt: sentMessage.createdAt?.toISOString?.() || now.toISOString(),
    });
  }

  await recordAutomationMessage({
    conversations,
    message: sentMessage,
    config,
    automation,
    chunks,
    generatedImageIds: modelOutput.generatedImageIds,
    generatedAudioIds: modelOutput.generatedAudioIds,
    cache,
  });

  if (generatedImages && sentMessage && Array.isArray(modelOutput.generatedImageIds) && modelOutput.generatedImageIds.length) {
    for (const imageId of modelOutput.generatedImageIds) {
      await generatedImages.updateImageRecord(imageId, {
        discordMessageId: sentMessage.id,
      }, {
        userScope: config.memory?.userScope,
      }).catch(() => {});
    }
  }

  if (generatedAudio && sentMessage && Array.isArray(modelOutput.generatedAudioIds) && modelOutput.generatedAudioIds.length) {
    for (const audioId of modelOutput.generatedAudioIds) {
      await generatedAudio.updateAudioRecord(audioId, {
        discordMessageId: sentMessage.id,
      }, {
        userScope: config.memory?.userScope,
      }).catch(() => {});
    }
  }

  await persistProactiveActionState(proactiveActionStore, action, {
    lastRunAt: now.toISOString(),
    lastError: "",
  });

  return {
    channelId: resolvedChannelId,
    threadId: null,
    messageId: sentMessage?.id || null,
  };
}

async function runThreadAction({
  action,
  client,
  config,
  logger,
  memory,
  conversations,
  channelModes,
  tools,
  proactiveActionStore,
  cache,
  generatedImages = null,
  generatedAudio = null,
  imageStylePresets = null,
  imageAppearancePresets = null,
  tone = "",
  heartbeatDecision = null,
  heartbeatContext = null,
  reactionContext = null,
}) {
  const resolvedChannelId = await resolveAutomationChannelId(action.target, {
    cache,
    userScope: config.memory.userScope,
  });
  const parentChannel = await client.channels.fetch(resolvedChannelId);

  if (parentChannel?.type !== 0 && !parentChannel?.threads?.create) {
    throw new Error("Configured target cannot host public threads.");
  }

  const mode = channelModes?.resolveModeForChannel
    ? await channelModes.resolveModeForChannel({
      guildId: parentChannel.guildId,
      channelId: parentChannel.id,
      parentChannelId: parentChannel.parentId,
      fallbackModeKey: config.chat?.defaultMode || "default",
    })
    : getMode(config.chat?.defaultMode || "default");
  const recentMessages = await loadScopedAutomationRecentHistory({
    conversations,
    channel: parentChannel,
    limit: 6,
  });
  const input = buildThreadInput({ action, config });
  const memories = await retrieveAutomationMemories({
    memory,
    channel: parentChannel,
    input,
    mode,
    conversations,
  });
  const starter = await generateThreadStarter({
    config,
    logger,
    mode,
    action: {
      actionId: action.actionId,
      label: action.name,
      prompt: action.prompt,
    },
    tone,
    heartbeatWhy: heartbeatDecision?.why || "",
    heartbeatContext,
    recentMessages,
    memories,
  });
  let modelOutput = null;
  const threadToolContext = buildProactiveToolContext({
    surface: action.triggerType,
    enabledTools: action.enabledTools,
    config,
    channel: parentChannel,
    mode,
    actionName: action.name,
    actionType: action.actionType,
    channelId: resolvedChannelId,
    sourceMessageId: input.messageId,
    currentUserText: input.content,
    recentHistory: recentMessages,
    memories,
  });

  if (shouldUseToolLoopForThreadAction(action, { tools, toolContext: threadToolContext })) {
    const contextSections = [
      {
        label: "Thread Starter Draft",
        content: [
          `Thread title already chosen: ${starter.threadTitle}`,
          `Draft opener before tools: ${starter.message}`,
          "Write the actual opening message for the new thread. Keep it natural for the chosen title, and use available lookup tools when the action prompt asks for recent conversation or memory context, or when the draft needs better grounding.",
        ].join("\n"),
      },
    ];

    pushReactionContextSection(contextSections, reactionContext, resolvedChannelId);

    if (Array.isArray(action.enabledTools) && action.enabledTools.includes("generate_image")) {
      const imagePresetContext = await loadImagePresetContextSection({
        config,
        userScope: config.memory?.userScope,
        imageStylePresetsStore: imageStylePresets,
        imageAppearancePresetsStore: imageAppearancePresets,
      });

      if (imagePresetContext) {
        contextSections.push(imagePresetContext);
      }
    }

    modelOutput = await callModel({
      config,
      logger,
      mode,
      input,
      recentHistory: recentMessages,
      memories,
      tools,
      contextSections,
      automation: buildProactiveAutomationContext({
        action,
        config,
        heartbeatDecision,
        heartbeatContext,
      }),
      toolContext: threadToolContext,
    });
  }

  const starterText = String(modelOutput?.text || starter.message).trim();
  const userId = String(config.chat?.userId || "").trim();
  const finalText = action.mentionUser ? prependUserMention(starterText, userId) : starterText;
  const threadReply = {
    content: finalText,
    suppressEmbeds: Boolean(modelOutput?.webSearchUsed),
    files: modelOutput?.files,
    generatedImageIds: modelOutput?.generatedImageIds,
    generatedAudioIds: modelOutput?.generatedAudioIds,
    imageWarnings: modelOutput?.imageWarnings,
  };
  const threadResult = isForumThreadParent(parentChannel)
    ? await createForumThreadWithStarterMessage(parentChannel, {
      name: starter.threadTitle,
      reason: `${action.triggerType} action ${action.actionId}`,
      text: threadReply.content,
      files: threadReply.files,
      suppressEmbeds: threadReply.suppressEmbeds,
      generatedImageIds: threadReply.generatedImageIds,
      imageWarnings: threadReply.imageWarnings,
      generatedImages,
      config,
    })
    : await createTextThreadWithStarter(parentChannel, {
      name: starter.threadTitle,
      reason: `${action.triggerType} action ${action.actionId}`,
      reply: threadReply,
      generatedImages,
      config,
    });
  const { thread, chunks, sentMessage } = threadResult;
  const automation = buildProactiveAutomationEnvelope({
    action: {
      ...action,
      target: thread.id,
    },
    config,
  });
  reactionContext?.markLatestFromMessage?.(sentMessage);

  await recordAutomationMessage({
    conversations,
    message: sentMessage,
    config,
    automation,
    chunks,
    generatedImageIds: modelOutput?.generatedImageIds,
    generatedAudioIds: modelOutput?.generatedAudioIds,
    cache,
  });

  if (generatedImages && sentMessage && Array.isArray(modelOutput?.generatedImageIds) && modelOutput.generatedImageIds.length) {
    for (const imageId of modelOutput.generatedImageIds) {
      await generatedImages.updateImageRecord(imageId, {
        discordMessageId: sentMessage.id,
      }, {
        userScope: config.memory?.userScope,
      }).catch(() => {});
    }
  }

  if (generatedAudio && sentMessage && Array.isArray(modelOutput?.generatedAudioIds) && modelOutput.generatedAudioIds.length) {
    for (const audioId of modelOutput.generatedAudioIds) {
      await generatedAudio.updateAudioRecord(audioId, {
        discordMessageId: sentMessage.id,
      }, {
        userScope: config.memory?.userScope,
      }).catch(() => {});
    }
  }

  await persistProactiveActionState(proactiveActionStore, action, {
    lastRunAt: new Date().toISOString(),
    lastError: "",
  });

  return {
    channelId: parentChannel.id,
    threadId: thread.id,
    messageId: sentMessage?.id || null,
  };
}

async function runProactiveAction(params) {
  const { action } = params;

  if (isDailyThreadAction(action)) {
    return runDailyThreadAction(params);
  }

  if (action.actionType === "journal") {
    return runJournalAction(params);
  }

  if (action.actionType === "thread") {
    return runThreadAction(params);
  }

  return runMessageAction(params);
}

async function runDailyThreadAction(params) {
  const {
    action,
    proactiveActionStore,
    config,
  } = params;
  const automation = mapDailyThreadActionToAutomation(action, config);
  const automationStore = {
    async upsertAutomation(record) {
      return persistProactiveActionState(proactiveActionStore, action, {
        lastRunAt: record.last_run_at || record.lastRunAt || "",
        lastError: record.last_error ?? record.lastError ?? "",
      });
    },
  };

  return runDailyThreadAutomation({
    ...params,
    automation,
    automationStore,
  });
}

function isProactiveActionDueNow(action, now = new Date()) {
  if (!action?.enabled || action.triggerType !== "scheduled") {
    return false;
  }

  const timezone = action.timezone || "UTC";
  const current = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const map = Object.fromEntries(current.map((part) => [part.type, part.value]));
  const currentWeekday = String(map.weekday || "").toLowerCase();
  const currentTime = `${map.hour}:${map.minute}`;
  const lastRun = action.lastRunAt ? new Date(action.lastRunAt) : null;
  const previousParts = lastRun
    ? new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(lastRun)
    : [];
  const currentDateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const currentDateMap = Object.fromEntries(currentDateParts.map((part) => [part.type, part.value]));
  const previousDateMap = Object.fromEntries(previousParts.map((part) => [part.type, part.value]));
  const ranThisMinute = previousParts.length
    && previousDateMap.year === currentDateMap.year
    && previousDateMap.month === currentDateMap.month
    && previousDateMap.day === currentDateMap.day
    && previousDateMap.hour === currentDateMap.hour
    && previousDateMap.minute === currentDateMap.minute;

  if (ranThisMinute || currentTime !== action.scheduleTime) {
    return false;
  }

  if (action.scheduleMode === "weekly") {
    return currentWeekday === String(action.scheduleDay || "").toLowerCase();
  }

  return true;
}

module.exports = {
  mapEnabledToolsToToolContext,
  persistProactiveActionState,
  sendProactiveReply,
  runProactiveAction,
  isProactiveActionDueNow,
  shouldUseToolLoopForThreadAction,
  buildThreadHeartbeatContextText,
};
