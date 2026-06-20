const { runCheckInAutomation, runJournalAutomation } = require("../automations");
const { callModel } = require("../chat/pipeline/callModel");
const { buildSystemPrompt } = require("../chat/prompt/buildSystemPrompt");
const { getLlmClient, hasLlmApiKey, resolveChatModel } = require("../llm/client");
const { parseJsonOutput } = require("../llm/jsonOutput");
const {
  RECENT_CONTEXT_MESSAGE_LIMIT,
} = require("./constants");
const {
  isThreadCapableChannel,
  isTextChannel,
  sendChunks,
  recordHeartbeatMessage,
  loadRecentServerContext,
  buildHeartbeatInput,
  buildRecentContextExcerpt,
  describeTargetLabel,
  retrieveHeartbeatMemories,
} = require("./helpers");
const { prependUserMention } = require("../discord/mentions");

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

async function generateThreadStarter({
  config,
  logger,
  mode,
  action,
  tone,
  recentMessages = [],
  memories = [],
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
  const recentContextExcerpt = buildRecentContextExcerpt(recentMessages);
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
              "Create a new thread opener for a Heartbeat proactive action.",
              "This is an internal trigger, not a live user message or request.",
              "Treat the action as something you chose to initiate from the saved Heartbeat list; do not imply the user just picked it or asked for it.",
              `Internal action prompt: ${action.prompt}`,
              tone ? `Tone hint: ${tone}` : "",
              recentContextExcerpt ? `Recent context excerpt:\n${recentContextExcerpt}` : "",
              memories.length ? `Relevant context for your response:\n${memories.map((memory, index) => {
                const referenceDate = memory.referenceDate || memory.reference_date;
                const dateNote = referenceDate ? ` (date: ${referenceDate})` : "";
                const title = memory.title ? `${memory.title}: ` : "";
                return `${index + 1}.${dateNote} ${title}${memory.content || memory.text || JSON.stringify(memory)}`;
              }).join("\n")}` : "",
              "Reply with JSON only using this shape:",
              "{\"threadTitle\":\"string\",\"message\":\"string\"}",
              "Let the new thread feel naturally connected to the recent context instead of random.",
              "Keep the thread title concise and the opening message warm, playful or thoughtful as needed, and ready to post.",
            ].filter(Boolean).join("\n\n"),
          },
        ],
      },
    ],
  });
  const starter = normalizeThreadStarter(parseJsonOutput(response.output_text));

  if (!starter) {
    logger?.warn?.("[heartbeat] Thread starter did not return usable JSON; using configured prompt fallback.", {
      actionId: action.actionId || null,
      outputPreview: truncateForLog(response.output_text),
    });
    return fallbackThreadStarter(action);
  }

  return starter;
}

async function executeCheckIn({
  client,
  config,
  logger,
  memory,
  conversations,
  automationStore,
  cache,
  tools,
  generatedImages = null,
  action,
  target,
}) {
  const result = await runCheckInAutomation({
    automation: {
      automationId: `heartbeat:${action.actionId}`,
      type: "check_in",
      label: action.label,
      channelId: target.channelId,
      scheduleTime: "00:00",
      timezone: config.chat?.timezone || "UTC",
      prompt: action.prompt,
      enabledTools: action.enabledTools || [],
      enabled: true,
      mentionUser: action.mentionUser,
      userId: String(config.chat?.userId || "").trim(),
      userScope: config.memory.userScope,
    },
    client,
    config,
    logger,
    memory,
    tools,
    conversations,
    automationStore,
    cache,
    generatedImages,
    persistState: false,
    modeOverride: target.mode,
    channelIdOverride: target.channelId,
    promptOverride: action.prompt,
    labelOverride: action.label,
    automationIdOverride: `heartbeat:${action.actionId}`,
    mentionUserOverride: action.mentionUser,
  });

  return {
    ok: true,
    actionId: action.actionId,
    executorType: action.executorType,
    channelId: result.channelId,
    threadId: null,
    messageId: result.messageId,
  };
}

async function executeJournalPrompt({
  client,
  config,
  logger,
  memory,
  journalStore,
  conversations,
  automationStore,
  cache,
  tools,
  generatedImages = null,
  action,
  target,
  now = new Date(),
}) {
  const result = await runJournalAutomation({
    automation: {
      automationId: `heartbeat:${action.actionId}`,
      type: "journal",
      label: action.label,
      channelId: target.channelId,
      scheduleTime: "00:00",
      timezone: config.chat?.timezone || "UTC",
      prompt: action.prompt,
      enabledTools: action.enabledTools || [],
      enabled: true,
      mentionUser: action.mentionUser,
      userId: String(config.chat?.userId || "").trim(),
      userScope: config.memory.userScope,
    },
    client,
    config,
    logger,
    memory,
    journalStore,
    tools,
    conversations,
    automationStore,
    cache,
    generatedImages,
    persistState: false,
    modeOverride: target.mode,
    channelIdOverride: target.channelId,
    promptOverride: action.prompt,
    labelOverride: action.label,
    automationIdOverride: `heartbeat:${action.actionId}`,
    mentionUserOverride: action.mentionUser,
    now,
  });

  return {
    ok: true,
    actionId: action.actionId,
    executorType: action.executorType,
    channelId: result.channelId,
    threadId: null,
    messageId: result.messageId,
  };
}

async function executeStartThread({
  client,
  config,
  logger,
  memory,
  conversations,
  action,
  target,
  decision,
}) {
  const parentChannel = await client.channels.fetch(target.channelId);

  if (!isThreadCapableChannel(parentChannel)) {
    throw new Error("Resolved target channel cannot host public threads.");
  }

  const recentMessages = await loadRecentServerContext({
    conversations,
    config,
    now: new Date(),
    limit: 6,
  });
  const input = buildHeartbeatInput({
    config,
    action,
    tone: decision.tone,
    executorLabel: "Starter Thread",
    targetLabel: describeTargetLabel(action, target),
  });
  const memories = await retrieveHeartbeatMemories({
    memory,
    config,
    target,
    input,
    recentMessages,
  });
  const starter = await generateThreadStarter({
    config,
    logger,
    mode: target.mode,
    action,
    tone: decision.tone,
    recentMessages,
    memories,
  });

  const thread = await parentChannel.threads.create({
    name: starter.threadTitle,
    autoArchiveDuration: 1440,
    reason: `Heartbeat action ${action.actionId}`,
  });

  const finalText = action.mentionUser
    ? prependUserMention(starter.message, config.chat?.userId)
    : String(starter.message || "").trim();
  const { chunks, sentMessage } = await sendChunks(thread, finalText, { config });
  await recordHeartbeatMessage({
    conversations,
    config,
    action,
    message: sentMessage,
    chunks,
    metadata: {
      heartbeatTone: decision.tone,
      threadStarter: true,
      parentChannelId: parentChannel.id,
    },
  });

  return {
    ok: true,
    actionId: action.actionId,
    executorType: action.executorType,
    channelId: parentChannel.id,
    threadId: thread.id,
    messageId: sentMessage?.id || null,
  };
}

async function executeSendGif({
  client,
  config,
  logger,
  memory,
  conversations,
  tools,
  action,
  target,
  decision = {},
}) {
  if (!tools?.has?.("search_gifs")) {
    throw new Error("GIF search tool is not configured.");
  }

  const channel = await client.channels.fetch(target.channelId);

  if (!isTextChannel(channel)) {
    throw new Error("Resolved target channel is not text-based.");
  }

  const recentMessages = await loadRecentServerContext({
    conversations,
    config,
    now: new Date(),
    limit: RECENT_CONTEXT_MESSAGE_LIMIT,
  });
  const input = buildHeartbeatInput({
    config,
    action,
    tone: decision.tone,
    executorLabel: "Reaction GIF",
    targetLabel: describeTargetLabel(action, target),
  });
  const memories = await retrieveHeartbeatMemories({
    memory,
    config,
    target,
    input,
    recentMessages,
  });
  const modelOutput = await callModel({
    config,
    logger,
    mode: target.mode || {
      name: config.chat?.defaultMode || "default",
      chatModel: "",
    },
    input,
    recentHistory: recentMessages,
    memories,
    tools,
    automation: {
      source: "heartbeat",
      type: "gif",
      label: action.label,
      prompt: action.prompt,
      userName: config.chat?.promptBlocks?.userName || "the user",
      mentionUser: action.mentionUser,
    },
  });
  const text = String(modelOutput.text || "").trim();

  if (!text) {
    throw new Error("Heartbeat GIF action produced no message text.");
  }

  const finalText = action.mentionUser
    ? prependUserMention(text, config.chat?.userId)
    : text;
  const { chunks, sentMessage } = await sendChunks(channel, finalText, { config });
  await recordHeartbeatMessage({
    conversations,
    config,
    action,
    message: sentMessage,
    chunks,
    metadata: {
      heartbeatTone: decision.tone,
      gifAction: true,
    },
  });

  return {
    ok: true,
    actionId: action.actionId,
    executorType: action.executorType,
    channelId: channel.id,
    threadId: null,
    messageId: sentMessage?.id || null,
  };
}

const EXECUTORS = Object.freeze({
  send_check_in: executeCheckIn,
  send_journal_prompt: executeJournalPrompt,
  send_gif: executeSendGif,
  start_thread: executeStartThread,
});

module.exports = {
  generateThreadStarter,
  executeCheckIn,
  executeJournalPrompt,
  executeStartThread,
  executeSendGif,
  EXECUTORS,
};
