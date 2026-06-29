const { buildSystemPrompt, isSharedServerMode } = require("../prompt/buildSystemPrompt");
const { shouldUseWebSearch, buildWebSearchRequestOptions } = require("./webSearch");
const { buildChatInput, buildInternalContextText, formatTimestamp } = require("./buildChatInput");
const { createTemporalAwarenessService, buildTemporalPromptSection } = require("../../temporal/temporalAwarenessService");

// Generous default cap on a single reply's generated tokens. A long companion
// message fits comfortably under this; the cap exists so a degenerate/looping
// model cannot emit an unbounded wall of repeated text. Override per-deployment
// via config.chat.maxOutputTokens.
const DEFAULT_MAX_OUTPUT_TOKENS = 1200;

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

const FORCE_AUDIO_PATTERN = /\b(?:send|make|record|do|give)(?:\s+me)?\s+(?:a\s+)?(?:voice\s+(?:note|message|clip)|audio\s+(?:note|message|clip)|spoken\s+message|voice\s+memo)\b/i;
const FORCE_IMAGE_NOUN_PATTERN = /\b(?:photo|photos|pic|pics|picture|pictures|image|images|portrait|portraits|selfie|selfies|snapshot|drawing|render|artwork|art)\b/i;
const FORCE_IMAGE_VERB_PATTERN = /\b(?:send|show|make|create|generate|draw|paint|render|give|get|try|do)\b/i;
const FORCE_IMAGE_RETRY_PATTERN = /\b(?:try|make|do|send)\b[\s\S]{0,40}\banother\b/i;

function shouldForceMediaToolCall({ availableToolNames = [], inputText = "", imageConversationActive = false } = {}) {
  const text = String(inputText || "").trim();

  if (!text) {
    return null;
  }

  if (availableToolNames.includes("generate_audio") && FORCE_AUDIO_PATTERN.test(text)) {
    return "generate_audio";
  }

  if (availableToolNames.includes("generate_image")) {
    if (FORCE_IMAGE_VERB_PATTERN.test(text) && FORCE_IMAGE_NOUN_PATTERN.test(text)) {
      return "generate_image";
    }

    if (imageConversationActive && FORCE_IMAGE_RETRY_PATTERN.test(text)) {
      return "generate_image";
    }
  }

  return null;
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
  replySafeMode = false,
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
  const safeMode = Boolean(replySafeMode);
  const useWebSearch = safeMode
    ? false
    : typeof toolContext.allowWebSearch === "boolean"
      ? toolContext.allowWebSearch
      : shouldUseWebSearch({ input });
  const toolDefinitions = toolsEnabled && !safeMode ? tools.list(toolContext) : [];
  const availableToolNames = toolDefinitions.map((tool) => String(tool?.name || "").trim()).filter(Boolean);
  const totalToolCount = toolDefinitions.length + (useWebSearch ? 1 : 0);
  const sharedServerMode = isSharedServerMode({ config, mode });
  const baseInstructions = overrideSystemPrompt || buildSystemPrompt({
    config,
    mode,
    automation: safeMode ? null : automation,
    webSearchUsed: safeMode ? false : useWebSearch,
    availableToolNames,
    channelType,
    privacyLevel,
  });
  const effectiveContextSections = safeMode ? [] : [...contextSections];
  if (!safeMode) {
    const temporalContext = createTemporalAwarenessService({ config }).buildContext({
      now: input?.messageTimestamp ? new Date(input.messageTimestamp) : new Date(),
      lastInteractionAt: recentHistory?.length ? (recentHistory[recentHistory.length - 1]?.createdAt || recentHistory[recentHistory.length - 1]?.createdTimestamp) : null,
    });
    const temporalPromptSection = buildTemporalPromptSection(temporalContext);
    if (temporalPromptSection) {
      effectiveContextSections.push(temporalPromptSection);
    }
    const timeContext = buildTimeContextSection({ input, includeTimeContext, timeZone });
    if (timeContext) {
      effectiveContextSections.push(timeContext);
    }
  }
  const internalContext = buildInternalContextText({
    contextSections: effectiveContextSections,
    memories: safeMode ? [] : memories,
    totalToolCount,
  });

  // Bound how long a single generation can run. Without this, a degenerate or
  // looping model can produce an unbounded, repetitive wall of text that the bot
  // then posts verbatim. The default is generous (a long companion reply fits
  // comfortably) and is overridable via config.chat.maxOutputTokens.
  const configuredMaxOutputTokens = Number(config.chat?.maxOutputTokens);
  const maxOutputTokens = Number.isFinite(configuredMaxOutputTokens) && configuredMaxOutputTokens > 0
    ? Math.round(configuredMaxOutputTokens)
    : DEFAULT_MAX_OUTPUT_TOKENS;

  const request = {
    model: selectedModel,
    max_output_tokens: maxOutputTokens,
    instructions: [
      systemPromptPrefix ? String(systemPromptPrefix).trim() : "",
      baseInstructions,
      safeMode ? "REPLY SAFE MODE\nUse only the core companion identity/persona, the current user message, and minimal runtime/safety rules. Ignore all history, memory, journal, dream, inner-life, emotional arc, situational awareness, tool/music/travel/web, autonomy, and context-update notes." : `Dynamic Internal Context\n${internalContext}`,
    ].filter(Boolean).join("\n\n"),
    reasoning: {
      exclude: true,
    },
    input: buildChatInput({
      input,
      recentHistory: safeMode ? [] : recentHistory,
      automation,
      includeTimeContext,
      includeSpeakerNames: sharedServerMode,
      timeZone,
    }),
  };

  if (toolDefinitions.length) {
    request.tools = toolDefinitions;
    const forceConversationRetrieval = shouldForceConversationRetrieval({
      inputText: toolContext.currentUserText || input.content,
      recentHistory,
      availableToolNames,
    });
    const forcedMediaTool = !forceConversationRetrieval
      ? shouldForceMediaToolCall({
        availableToolNames,
        inputText: toolContext.currentUserText || input.content,
        imageConversationActive: Boolean(toolContext.imageConversationActive),
      })
      : null;
    request.tool_choice = forceConversationRetrieval
      ? { type: "function", name: "search_recent_conversations" }
      : forcedMediaTool
        ? { type: "function", name: forcedMediaTool }
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
  shouldForceMediaToolCall,
};
