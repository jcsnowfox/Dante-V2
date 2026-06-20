const { ChannelType } = require("discord.js");
const { getMode } = require("../chat/modes");
const { callModel } = require("../chat/pipeline/callModel");
const { loadRecentContinuitySummarySections } = require("./contextSections");
const { resolveAutomationChannelId, getNextLocalMidnight, getLocalDateParts, renderThreadTitle } = require("./time");
const {
  buildAutomationInput,
  loadScopedAutomationRecentHistory,
  retrieveAutomationMemories,
  persistAutomationState,
  normalizeAutomationIdForJournalEntry,
  sendChunks,
  createForumThreadWithStarterMessage,
  recordAutomationMessage,
} = require("./messageHelpers");
const { loadJournalContextPayload, retrieveJournalMemories } = require("./journalContext");
const { buildProactiveToolContext } = require("../proactiveActions/toolContext");
const { loadImagePresetContextSection } = require("../images/presetContext");
const { prependUserMention } = require("../discord/mentions");

function pushReactionContextSection(contextSections = [], reactionContext = null, conversationId = "") {
  const section = reactionContext?.peekContextSection?.({ conversationId });

  if (section) {
    contextSections.push(section);
  }
}

function isThreadCapableChannel(channel) {
  return channel?.type === ChannelType.GuildText
    || channel?.type === ChannelType.GuildForum
    || channel?.type === ChannelType.GuildMedia;
}

function isForumThreadParent(channel) {
  return channel?.type === ChannelType.GuildForum || channel?.type === ChannelType.GuildMedia;
}

async function resolveAutomationMode({
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

async function runCheckInAutomation({
  automation,
  client,
  config,
  logger,
  memory,
  tools,
  conversations,
  automationStore,
  cache,
  generatedImages = null,
  generatedAudio = null,
  imageStylePresets = null,
  imageAppearancePresets = null,
  persistState: shouldPersistState = true,
  channelModes = null,
  modeOverride = null,
  channelIdOverride = "",
  promptOverride = "",
  labelOverride = "",
  automationIdOverride = "",
  mentionUserOverride,
  reactionContext = null,
}) {
  const effectiveAutomation = {
    ...automation,
    automationId: automationIdOverride || automation.automationId,
    label: labelOverride || automation.label,
    prompt: promptOverride || automation.prompt,
    mentionUser: mentionUserOverride ?? automation.mentionUser,
  };
  const resolvedChannelId = channelIdOverride || await resolveAutomationChannelId(effectiveAutomation.channelId, {
    cache,
    userScope: config.memory.userScope,
  });
  const channel = await client.channels.fetch(resolvedChannelId);

  if (!channel?.isTextBased?.()) {
    throw new Error("Configured channel is not text-based.");
  }

  const mode = await resolveAutomationMode({
    channelModes,
    config,
    channel,
    modeOverride,
  });
  const input = buildAutomationInput({ automation: effectiveAutomation, channelId: resolvedChannelId, config });
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

  if (Array.isArray(effectiveAutomation.enabledTools) && effectiveAutomation.enabledTools.includes("generate_image")) {
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
    automation: {
      type: effectiveAutomation.type,
      label: effectiveAutomation.label,
      prompt: effectiveAutomation.prompt,
      userName: config.chat?.promptBlocks?.userName || "the user",
      enabledTools: effectiveAutomation.enabledTools || [],
      mentionUser: effectiveAutomation.mentionUser,
    },
    toolContext: buildProactiveToolContext({
      surface: "scheduled",
      enabledTools: effectiveAutomation.enabledTools,
      config,
      channel,
      mode,
      actionName: effectiveAutomation.label,
      actionType: effectiveAutomation.type,
      channelId: resolvedChannelId,
      sourceMessageId: input.messageId,
      currentUserText: input.content,
      recentHistory,
      memories,
    }),
  });
  const text = String(modelOutput.text || "").trim();

  if (!text) {
    throw new Error("Automation produced no message text.");
  }

  const finalText = effectiveAutomation.mentionUser
    ? prependUserMention(text, effectiveAutomation.userId)
    : text;
  const { chunks, sentMessage } = await sendChunks(channel, finalText, {
    files: modelOutput.files,
    suppressEmbeds: Boolean(modelOutput.webSearchUsed),
    generatedImageIds: modelOutput.generatedImageIds,
    generatedAudioIds: modelOutput.generatedAudioIds,
    imageWarnings: modelOutput.imageWarnings,
    generatedImages,
    config,
  });
  reactionContext?.markLatestFromMessage?.(sentMessage);

  await recordAutomationMessage({
    conversations,
    message: sentMessage,
    config,
    automation: effectiveAutomation,
    chunks,
    generatedImageIds: modelOutput.generatedImageIds,
    generatedAudioIds: modelOutput.generatedAudioIds,
    cache,
  });

  if (generatedAudio && sentMessage && Array.isArray(modelOutput.generatedAudioIds)) {
    for (const audioId of modelOutput.generatedAudioIds) {
      await generatedAudio.updateAudioRecord(audioId, {
        discordMessageId: sentMessage.id,
      }, {
        userScope: config.memory?.userScope,
      });
    }
  }

  if (shouldPersistState) {
    await persistAutomationState(automationStore, effectiveAutomation, {
      lastRunAt: new Date().toISOString(),
      lastError: "",
    });
  }

  return {
    channelId: resolvedChannelId,
    messageId: sentMessage?.id || null,
    chunks,
  };
}

async function runJournalAutomation({
  automation,
  client,
  config,
  logger,
  memory,
  journalStore,
  tools,
  conversations,
  automationStore,
  cache,
  generatedImages = null,
  generatedAudio = null,
  imageStylePresets = null,
  imageAppearancePresets = null,
  persistState: shouldPersistState = true,
  channelModes = null,
  modeOverride = null,
  channelIdOverride = "",
  promptOverride = "",
  labelOverride = "",
  automationIdOverride = "",
  mentionUserOverride,
  now = new Date(),
  reactionContext = null,
}) {
  const effectiveAutomation = {
    ...automation,
    automationId: automationIdOverride || automation.automationId,
    label: labelOverride || automation.label,
    prompt: promptOverride || automation.prompt,
    mentionUser: mentionUserOverride ?? automation.mentionUser,
  };
  const resolvedChannelId = channelIdOverride || await resolveAutomationChannelId(effectiveAutomation.channelId, {
    cache,
    userScope: config.memory.userScope,
  });
  const channel = await client.channels.fetch(resolvedChannelId);

  if (!channel?.isTextBased?.()) {
    throw new Error("Configured channel is not text-based.");
  }

  const mode = await resolveAutomationMode({
    channelModes,
    config,
    channel,
    modeOverride,
  });
  const input = buildAutomationInput({ automation: effectiveAutomation, channelId: resolvedChannelId, config });
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

  if (Array.isArray(effectiveAutomation.enabledTools) && effectiveAutomation.enabledTools.includes("generate_image")) {
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
    automation: {
      type: effectiveAutomation.type,
      label: effectiveAutomation.label,
      prompt: effectiveAutomation.prompt,
      userName: config.chat?.promptBlocks?.userName || "the user",
      enabledTools: effectiveAutomation.enabledTools || [],
      mentionUser: effectiveAutomation.mentionUser,
    },
    toolContext: buildProactiveToolContext({
      surface: "scheduled",
      enabledTools: effectiveAutomation.enabledTools,
      config,
      channel,
      mode,
      actionName: effectiveAutomation.label,
      actionType: effectiveAutomation.type,
      channelId: resolvedChannelId,
      sourceMessageId: input.messageId,
      currentUserText: input.content,
      recentHistory: [],
      memories,
    }),
  });
  const text = String(modelOutput.text || "").trim();

  if (!text) {
    throw new Error("Automation produced no message text.");
  }

  const finalText = effectiveAutomation.mentionUser
    ? prependUserMention(text, effectiveAutomation.userId)
    : text;
  const { chunks, sentMessage } = await sendChunks(channel, finalText, {
    files: modelOutput.files,
    suppressEmbeds: Boolean(modelOutput.webSearchUsed),
    generatedImageIds: modelOutput.generatedImageIds,
    generatedAudioIds: modelOutput.generatedAudioIds,
    imageWarnings: modelOutput.imageWarnings,
    generatedImages,
    config,
  });
  reactionContext?.markLatestFromMessage?.(sentMessage);

  if (sentMessage) {
    await journalStore.recordEntry({
      automationId: normalizeAutomationIdForJournalEntry(effectiveAutomation.automationId),
      channelId: resolvedChannelId,
      guildId: channel.guildId,
      title: effectiveAutomation.label,
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
    automation: effectiveAutomation,
    chunks,
    generatedImageIds: modelOutput.generatedImageIds,
    generatedAudioIds: modelOutput.generatedAudioIds,
    cache,
  });

  if (generatedAudio && sentMessage && Array.isArray(modelOutput.generatedAudioIds)) {
    for (const audioId of modelOutput.generatedAudioIds) {
      await generatedAudio.updateAudioRecord(audioId, {
        discordMessageId: sentMessage.id,
      }, {
        userScope: config.memory?.userScope,
      });
    }
  }

  if (shouldPersistState) {
    await persistAutomationState(automationStore, effectiveAutomation, {
      lastRunAt: now.toISOString(),
      lastError: "",
    });
  }

  return {
    channelId: resolvedChannelId,
    messageId: sentMessage?.id || null,
    chunks,
  };
}

async function runDailyThreadAutomation({
  automation,
  client,
  config,
  logger,
  memory,
  memoryStore,
  tools,
  conversations,
  automationStore,
  channelModes,
  cache,
  generatedImages = null,
  generatedAudio = null,
  imageStylePresets = null,
  imageAppearancePresets = null,
  now = new Date(),
  reactionContext = null,
}) {
  const parentChannel = await client.channels.fetch(automation.channelId);

  if (!isThreadCapableChannel(parentChannel)) {
    throw new Error("Configured channel must be a text or forum channel that can host public threads.");
  }

  const threadTitle = renderThreadTitle(
    automation.threadTitleTemplate || "MMM-DD [Day] - Daily Thread",
    now,
    automation.timezone || config.chat?.timezone || "UTC",
  );
  const threadReason = `Daily thread for ${getLocalDateParts(now, automation.timezone || config.chat?.timezone || "UTC").dateKey}`;
  const forumParent = isForumThreadParent(parentChannel);
  let thread = null;

  if (!forumParent) {
    thread = await parentChannel.threads.create({
      name: threadTitle,
      autoArchiveDuration: 1440,
      reason: threadReason,
    });
  }

  if (thread && channelModes?.assignModeToChannel) {
    await channelModes.assignModeToChannel({
      guildId: thread.guildId,
      channelId: thread.id,
      modeKey: automation.threadModeKey || "daily",
    });
  }

  const mode = thread && channelModes?.resolveModeForChannel
    ? await channelModes.resolveModeForChannel({
      guildId: thread.guildId,
      channelId: thread.id,
      parentChannelId: thread.parentId,
      fallbackModeKey: automation.threadModeKey || "daily",
    })
    : channelModes?.resolveModeByKey
      ? await channelModes.resolveModeByKey(automation.threadModeKey || "daily") || getMode(automation.threadModeKey || "daily")
      : getMode(automation.threadModeKey || "daily");
  const contextChannel = thread || parentChannel;
  const input = buildAutomationInput({ automation, channelId: contextChannel.id, config });
  const memories = await retrieveAutomationMemories({
    memory,
    channel: contextChannel,
    input,
    mode,
    conversations,
  });
  const contextSections = await loadRecentContinuitySummarySections({
    memoryStore,
    userScope: config.memory.userScope,
    limit: 3,
  });

  if (Array.isArray(automation.enabledTools) && automation.enabledTools.includes("generate_image")) {
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

  logger.debug?.("[automations] Daily thread opener context", {
    automationId: automation.automationId,
    threadId: thread?.id || null,
    threadName: thread?.name || threadTitle,
    sectionCount: contextSections.length,
    sections: contextSections.map((section) => ({
      label: section.label,
      contentLength: String(section.content || "").length,
    })),
  });

  const modelOutput = await callModel({
    config,
    logger,
    mode,
    input,
    recentHistory: [],
    memories,
    tools,
    contextSections,
    automation: {
      type: automation.type,
      label: automation.label,
      prompt: automation.threadStarterPrompt || automation.prompt,
      userName: config.chat?.promptBlocks?.userName || "the user",
      enabledTools: automation.enabledTools || [],
    },
    toolContext: buildProactiveToolContext({
      surface: "scheduled",
      enabledTools: automation.enabledTools,
      config,
      channel: contextChannel,
      mode,
      actionName: automation.label,
      actionType: automation.type,
      channelId: contextChannel.id,
      sourceMessageId: input.messageId,
      currentUserText: input.content,
      recentHistory: [],
      memories,
    }),
  });
  const text = String(modelOutput.text || "").trim();

  if (!text) {
    throw new Error("Automation produced no message text.");
  }

  const threadResult = forumParent
    ? await createForumThreadWithStarterMessage(parentChannel, {
      name: threadTitle,
      reason: threadReason,
      text,
      files: modelOutput.files,
      suppressEmbeds: Boolean(modelOutput.webSearchUsed),
      generatedImageIds: modelOutput.generatedImageIds,
      imageWarnings: modelOutput.imageWarnings,
      generatedImages,
      config,
    })
    : {
      thread,
      ...(await sendChunks(thread, text, {
        files: modelOutput.files,
        suppressEmbeds: Boolean(modelOutput.webSearchUsed),
        generatedImageIds: modelOutput.generatedImageIds,
        generatedAudioIds: modelOutput.generatedAudioIds,
        imageWarnings: modelOutput.imageWarnings,
        generatedImages,
        config,
      })),
    };
  thread = threadResult.thread;
  const { chunks, sentMessage } = threadResult;

  if (forumParent && channelModes?.assignModeToChannel) {
    await channelModes.assignModeToChannel({
      guildId: thread.guildId,
      channelId: thread.id,
      modeKey: automation.threadModeKey || "daily",
    });
  }

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

  if (generatedAudio && sentMessage && Array.isArray(modelOutput.generatedAudioIds)) {
    for (const audioId of modelOutput.generatedAudioIds) {
      await generatedAudio.updateAudioRecord(audioId, {
        discordMessageId: sentMessage.id,
      }, {
        userScope: config.memory?.userScope,
      });
    }
  }

  if (cache?.setTodaysThreadId) {
    await cache.setTodaysThreadId({
      userScope: config.memory.userScope,
      threadId: thread.id,
      expiresAt: getNextLocalMidnight(now, automation.timezone || config.chat?.timezone || "UTC"),
    });
  }

  await persistAutomationState(automationStore, automation, {
    lastRunAt: now.toISOString(),
    lastError: "",
  });
}

module.exports = {
  runCheckInAutomation,
  runJournalAutomation,
  runDailyThreadAutomation,
};
