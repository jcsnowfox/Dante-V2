const { buildSystemPrompt, isSharedServerMode } = require("../prompt/buildSystemPrompt");
const { shouldUseWebSearch, buildWebSearchRequestOptions } = require("./webSearch");
const { buildChatInput, buildInternalContextText, formatTimestamp } = require("./buildChatInput");

const CONVERSATION_RETRIEVAL_FORCE_PATTERNS = Object.freeze([
  /\bwhat\s+(?:did|was)\s+i\s+(?:just\s+)?(?:say|ask|tell|mention|write|start|open|discuss)\b/i,
  /\b(?:do\s+you\s+)?remember\s+what\s+i\s+(?:said|asked|mentioned|wrote|started|opened|discussed)\b/i,
  /\bwhat\s+did\s+i\s+say\s+(?:in|on)\s+(?:the\s+)?(?:other|another|shared|previous|earlier)\s+(?:channel|thread|server|conversation|session)\b/i,
  /\bwhere\s+were\s+we\b/i,
  /\bpick\s+up\b[\s\S]{0,80}\b(?:earlier|before|thread|channel|conversation|session)\b/i,
  /\b(?:other|another|shared|previous|earlier)\s+(?:channel|thread|server|conversation|session)\b/i,
]);

function textLength(value) {
  return String(value || "").length;
}

function getInputText(item = {}) {
  return Array.isArray(item.content)
    ? item.content.map((part) => part?.text || "").join("\n")
    : "";
}

function buildChatRequestShapeSummary({
  request,
  baseInstructions = "",
  internalContext = "",
  toolDefinitions = [],
  useWebSearch = false,
} = {}) {
  const inputItems = Array.isArray(request?.input) ? request.input : [];
  const toolSchemaChars = toolDefinitions.reduce((total, tool) => total + textLength(JSON.stringify(tool)), 0);

  return {
    placement: {
      baseInstructions: "instructions",
      dynamicInternalContext: "instructions",
      conversationTranscript: "input",
      toolDefinitions: "tools",
    },
    charCounts: {
      instructionsTotal: textLength(request?.instructions),
      baseInstructions: textLength(baseInstructions),
      dynamicInternalContext: textLength(internalContext),
      inputTotal: inputItems.reduce((total, item) => total + textLength(getInputText(item)), 0),
      toolSchemas: toolSchemaChars,
    },
    inputRoles: inputItems.map((item, index) => ({
      index,
      role: item?.role || "unknown",
      chars: textLength(getInputText(item)),
    })),
    toolNames: toolDefinitions.map((tool) => String(tool?.name || "").trim()).filter(Boolean),
    webSearch: Boolean(useWebSearch),
  };
}

function shouldForceConversationRetrieval({ inputText = "", recentHistory = [], availableToolNames = [] } = {}) {
  if (!availableToolNames.includes("search_recent_conversations")) {
    return false;
  }

  const text = String(inputText || "").trim();

  if (!text) {
    return false;
  }

  if (/\b(?:here|this\s+(?:channel|thread|conversation|chat|session))\b/i.test(text)) {
    return false;
  }

  const hasCrossConversationCue = /\b(?:other|another|shared|previous|earlier)\s+(?:channel|thread|server|conversation|session)\b/i.test(text);
  const asksRecentSelfReference = CONVERSATION_RETRIEVAL_FORCE_PATTERNS.some((pattern) => pattern.test(text));

  return asksRecentSelfReference && (hasCrossConversationCue || recentHistory.length === 0);
}

function buildTimeContextSection({ input, includeTimeContext, timeZone = "UTC" } = {}) {
  if (!includeTimeContext || !input?.messageTimestamp) {
    return null;
  }

  return {
    label: "Time Context",
    content: [
      `Current user message sent at: ${formatTimestamp(input.messageTimestamp, timeZone)}.`,
      "Use this for date and timing awareness in the next reply.",
    ].join("\n"),
  };
}

function buildChatRequest({
  config,
  mode,
  input,
  recentHistory = [],
  contextSections = [],
  memories = [],
  tools,
  automation = null,
  selectedModel,
  toolContext = {},
  toolsEnabled = true,
  overrideSystemPrompt = null,
  systemPromptPrefix = null,
  channelType = "discord",
  privacyLevel = "public",
}) {
  const modeTimeContext = String(mode?.includeTimeContext || "inherit").trim().toLowerCase();
  const includeTimeContext = modeTimeContext === "on"
    ? true
    : modeTimeContext === "off"
      ? false
      : config.chat?.includeTimeContext !== false;
  const timeZone = config.chat?.timezone || "UTC";
  const useWebSearch = typeof toolContext.allowWebSearch === "boolean"
    ? toolContext.allowWebSearch
    : shouldUseWebSearch({ input });
  const toolDefinitions = toolsEnabled ? tools.list(toolContext) : [];
  const availableToolNames = toolDefinitions.map((tool) => String(tool?.name || "").trim()).filter(Boolean);
  const totalToolCount = toolDefinitions.length + (useWebSearch ? 1 : 0);
  const sharedServerMode = isSharedServerMode({ config, mode });
  const baseInstructions = overrideSystemPrompt || buildSystemPrompt({
    config,
    mode,
    automation,
    webSearchUsed: useWebSearch,
    availableToolNames,
    channelType,
    privacyLevel,
  });
  const effectiveContextSections = [...contextSections];
  const timeContext = buildTimeContextSection({ input, includeTimeContext, timeZone });
  if (timeContext) {
    effectiveContextSections.push(timeContext);
  }
  const internalContext = buildInternalContextText({
    contextSections: effectiveContextSections,
    memories,
    totalToolCount,
  });

  const request = {
    model: selectedModel,
    instructions: [
      systemPromptPrefix ? String(systemPromptPrefix).trim() : "",
      baseInstructions,
      `Dynamic Internal Context\n${internalContext}`,
    ].filter(Boolean).join("\n\n"),
    reasoning: {
      exclude: true,
    },
    input: buildChatInput({
      input,
      recentHistory,
      automation,
      includeTimeContext,
      includeSpeakerNames: sharedServerMode,
      timeZone,
    }),
  };

  if (toolDefinitions.length) {
    request.tools = toolDefinitions;
    request.tool_choice = shouldForceConversationRetrieval({
      inputText: toolContext.currentUserText || input.content,
      recentHistory,
      availableToolNames,
    })
      ? { type: "function", name: "search_recent_conversations" }
      : "auto";
  }

  if (useWebSearch) {
    Object.assign(request, buildWebSearchRequestOptions());
  }

  return {
    request,
    useWebSearch,
    totalToolCount,
    requestShape: buildChatRequestShapeSummary({
      request,
      baseInstructions,
      internalContext,
      toolDefinitions,
      useWebSearch,
    }),
  };
}

module.exports = {
  buildChatRequest,
  buildChatRequestShapeSummary,
  shouldForceConversationRetrieval,
};
