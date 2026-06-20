const MAX_IMAGE_TOOL_CALLS_PER_REPLY = 2;
const MAX_AUDIO_TOOL_CALLS_PER_REPLY = 1;
const MAX_REACTION_TOOL_CALLS_PER_REPLY = 1;
const MAX_USEFUL_LOOKUP_CALLS_PER_TOOL = 3;
const LOOKUP_TOOL_NAME_PATTERN = /^(?:search|lookup|list|get)_/i;
const LOOKUP_PAGINATION_ARGUMENT_KEYS = new Set([
  "count",
  "limit",
  "maxresults",
  "max_results",
  "sincehours",
  "since_hours",
  "topk",
  "top_k",
]);
const { shouldAllowAdditionalChatImageCall } = require("../../tools/registry");

function safeJsonParse(value) {
  try {
    return JSON.parse(String(value || "{}"));
  } catch (_error) {
    return {};
  }
}

function extractFunctionCalls(response) {
  return Array.isArray(response?.output)
    ? response.output.filter((item) => item?.type === "function_call" && item.name && item.call_id)
    : [];
}

function summarizeResponseOutput(response) {
  const functionCalls = extractFunctionCalls(response);

  return {
    responseId: response?.id || null,
    status: response?.status || null,
    outputTypes: Array.isArray(response?.output)
      ? response.output.map((item) => item?.type || "unknown")
      : [],
    finalToolNames: functionCalls.map((call) => String(call.name || "").trim()).filter(Boolean),
    finalToolCallCount: functionCalls.length,
  };
}

function normalizeToolArgumentValue(value, { omitLookupPagination = false } = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeToolArgumentValue(item, { omitLookupPagination }));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((normalized, key) => {
        const compactKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
        if (omitLookupPagination && LOOKUP_PAGINATION_ARGUMENT_KEYS.has(compactKey)) {
          return normalized;
        }

        const normalizedValue = normalizeToolArgumentValue(value[key], { omitLookupPagination });
        if (normalizedValue === undefined || normalizedValue === "") {
          return normalized;
        }

        normalized[key] = normalizedValue;
        return normalized;
      }, {});
  }

  if (typeof value === "string") {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }

  return value;
}

function buildToolCallSignature(toolName, rawArguments, options = {}) {
  const parsedArguments = typeof rawArguments === "string"
    ? safeJsonParse(rawArguments)
    : (rawArguments || {});

  return JSON.stringify({
    toolName,
    arguments: normalizeToolArgumentValue(parsedArguments, options),
  });
}

function isLookupToolName(toolName) {
  return LOOKUP_TOOL_NAME_PATTERN.test(String(toolName || ""));
}

function hasUsefulLookupResult(result = {}) {
  if (!result || result.ok === false) {
    return false;
  }

  for (const value of Object.values(result)) {
    if (Array.isArray(value) && value.length > 0) {
      return true;
    }
  }

  for (const [key, value] of Object.entries(result)) {
    if (/count$/i.test(key) && Number(value) > 0) {
      return true;
    }
  }

  return result.ok === true;
}

function buildSkippedToolResult({ reason, message }) {
  return {
    ok: false,
    skipped: true,
    reason,
    error: message,
    retryHint: "Use the earlier tool results already available in this reply and answer now unless a genuinely different tool is needed.",
  };
}

async function executeToolCalls({
  response,
  tools,
  logger,
  toolContext = {},
  executionCounts = new Map(),
  toolCallState = null,
}) {
  const calls = extractFunctionCalls(response);

  if (!calls.length) {
    return [];
  }

  const state = toolCallState || {
    signatures: new Set(),
    lookupIntentSignatures: new Set(),
    usefulLookupCounts: new Map(),
  };
  const outputs = [];

  for (const call of calls) {
    const toolName = String(call.name || "").trim();
    const currentCount = executionCounts.get(toolName) || 0;
    const fullSignature = buildToolCallSignature(toolName, call.arguments);
    const isLookupTool = isLookupToolName(toolName);
    const lookupIntentSignature = isLookupTool
      ? buildToolCallSignature(toolName, call.arguments, { omitLookupPagination: true })
      : "";

    if (state.signatures.has(fullSignature)) {
      outputs.push({
        callId: call.call_id,
        toolName,
        arguments: call.arguments,
        result: buildSkippedToolResult({
          reason: "duplicate_tool_call",
          message: `The ${toolName} tool was already called with equivalent arguments in this reply.`,
        }),
      });
      continue;
    }

    if (isLookupTool && state.lookupIntentSignatures.has(lookupIntentSignature)) {
      outputs.push({
        callId: call.call_id,
        toolName,
        arguments: call.arguments,
        result: buildSkippedToolResult({
          reason: "duplicate_lookup_intent",
          message: `The ${toolName} lookup already ran for this same search intent in this reply.`,
        }),
      });
      continue;
    }

    if (isLookupTool && (state.usefulLookupCounts.get(toolName) || 0) >= MAX_USEFUL_LOOKUP_CALLS_PER_TOOL) {
      outputs.push({
        callId: call.call_id,
        toolName,
        arguments: call.arguments,
        result: buildSkippedToolResult({
          reason: "lookup_saturated",
          message: `The ${toolName} tool already returned enough context for this reply.`,
        }),
      });
      continue;
    }

    if (toolName === "generate_image" && currentCount >= 1 && !shouldAllowAdditionalChatImageCall(toolContext)) {
      outputs.push({
        callId: call.call_id,
        toolName,
        arguments: call.arguments,
        result: {
          ok: false,
          error: "Only generate one image in this reply unless the user clearly asked for multiple distinct images.",
        },
      });
      continue;
    }

    if (toolName === "generate_image" && currentCount >= MAX_IMAGE_TOOL_CALLS_PER_REPLY) {
      outputs.push({
        callId: call.call_id,
        toolName,
        arguments: call.arguments,
        result: {
          ok: false,
          error: `Image generation is limited to ${MAX_IMAGE_TOOL_CALLS_PER_REPLY} calls per reply.`,
        },
      });
      continue;
    }

    if (toolName === "generate_audio" && currentCount >= MAX_AUDIO_TOOL_CALLS_PER_REPLY) {
      outputs.push({
        callId: call.call_id,
        toolName,
        arguments: call.arguments,
        result: {
          ok: false,
          error: "Only generate one audio file in this reply.",
        },
      });
      continue;
    }

    if (toolName === "add_reaction" && currentCount >= MAX_REACTION_TOOL_CALLS_PER_REPLY) {
      outputs.push({
        callId: call.call_id,
        toolName,
        arguments: call.arguments,
        result: {
          ok: false,
          error: "Only add one reaction in this reply.",
        },
      });
      continue;
    }

    state.signatures.add(fullSignature);
    if (isLookupTool) {
      state.lookupIntentSignatures.add(lookupIntentSignature);
    }

    try {
      const result = await tools.execute(toolName, call.arguments, toolContext);
      executionCounts.set(toolName, currentCount + 1);
      if (isLookupTool && hasUsefulLookupResult(result)) {
        state.usefulLookupCounts.set(toolName, (state.usefulLookupCounts.get(toolName) || 0) + 1);
      }
      outputs.push({
        callId: call.call_id,
        toolName,
        arguments: call.arguments,
        result,
      });
    } catch (error) {
      logger.warn("[chat] Tool call failed", {
        surface: toolContext.surface || "",
        scheduleName: toolContext.actionName || "",
        actionType: toolContext.actionType || "",
        target: toolContext.target || toolContext.channelId || toolContext.conversationId || "",
        toolName,
        error: error.message,
      });
      executionCounts.set(toolName, currentCount + 1);
      outputs.push({
        callId: call.call_id,
        toolName,
        arguments: call.arguments,
        result: {
          ok: false,
          error: error.message,
        },
      });
    }
  }

  return outputs;
}

function extractReplyDirectives(toolResults = []) {
  const directives = {
    files: [],
    generatedImageIds: [],
    generatedAudioIds: [],
    audioCaptions: [],
    imageWarnings: [],
  };

  for (const result of toolResults) {
    const attachment = result?.result?.replyAttachment;

    if (!attachment) {
      continue;
    }

    if (Array.isArray(attachment.files)) {
      directives.files.push(...attachment.files);
    }

    if (Array.isArray(attachment.imageIds)) {
      directives.generatedImageIds.push(...attachment.imageIds);
    }

    if (Array.isArray(attachment.audioIds)) {
      directives.generatedAudioIds.push(...attachment.audioIds);
    }

    if (typeof result?.result?.caption === "string" && result.result.caption.trim()) {
      directives.audioCaptions.push(result.result.caption.trim());
    }

    if (typeof result?.result?.warning === "string" && result.result.warning.trim()) {
      directives.imageWarnings.push(result.result.warning.trim());
    }
  }

  return directives;
}

function sanitizeToolResultForModel(result) {
  if (!result || typeof result !== "object") {
    return result;
  }

  const sanitized = { ...result };
  delete sanitized.replyAttachment;
  delete sanitized.toolMessage;
  return sanitized;
}

function buildToolResultsInput(toolResults) {
  const hasSuccessfulImage = toolResults.some((result) => result?.toolName === "generate_image" && result?.result?.ok);
  const hasSuccessfulAudio = toolResults.some((result) => result?.toolName === "generate_audio" && result?.result?.ok);
  const hasSuccessfulReaction = toolResults.some((result) => result?.toolName === "add_reaction" && result?.result?.ok);
  const hasConversationRetrieval = toolResults.some((result) => result?.toolName === "search_recent_conversations");
  const hasMemoryLookup = toolResults.some((result) => result?.toolName === "search_memories");
  const hasMemorySave = toolResults.some((result) => result?.toolName === "remember_this");
  const hasSkippedLookup = toolResults.some((result) => result?.result?.skipped);

  const guidance = [
    "Tool results are available for the current reply.",
    "Use them if they genuinely improve the response.",
    "If you include a GIF, reply naturally first and put the GIF URL on its own line in plain text.",
  ];

  if (hasSkippedLookup) {
    guidance.push("If a tool result says a call was skipped as duplicate or saturated, do not retry the same lookup; use the earlier available results and answer now.");
  }

  if (hasConversationRetrieval) {
    guidance.push("For search_recent_conversations results, snippets are from permitted conversation history outside the current visible context window.");
    guidance.push("If the user asked what happened in another channel/thread, answer only from the returned snippets; do not use the current user message or ordinary recent history as the answer.");
    guidance.push("If same-channel snippets are returned, treat them as older thread/channel history, not as messages from the current visible window.");
    guidance.push("If the user asks to pick up where they left off, summarize the retrieved snippets' topic and latest turn before continuing.");
    guidance.push("Use fields like fallbackUsed, matchedQuery, and sourceFilter only to calibrate confidence and scope; do not narrate those field names or internal search mechanics to the user.");
    guidance.push("If fallbackUsed is true, treat returned snippets as nearby context rather than direct keyword matches. For a specific keyword/date lookup, clearly avoid implying the keyword was found.");
    guidance.push("If no snippets are returned, say naturally that you cannot see matching permitted recent context; do not invent or substitute the current turn.");
  }

  if (hasMemoryLookup) {
    guidance.push("For search_memories results, returned memories are candidate long-term context allowed by the current channel mode, not unquestionable proof.");
    guidance.push("Use returned memories only if they genuinely answer the user's need or fill a context gap; do not narrate memory lookup mechanics.");
    guidance.push("If no memories are returned, answer naturally with uncertainty and do not invent continuity.");
  }

  if (hasMemorySave) {
    guidance.push("For remember_this results, acknowledge successful saves naturally and briefly. Do not invent extra saved details beyond the tool result.");
    guidance.push("If remember_this skipped because the current user turn did not explicitly ask to save a memory, do not claim anything was saved and do not mention tool mechanics; just continue the conversation naturally.");
    guidance.push("If remember_this skipped because the request was too weak or better handled by another tool, explain briefly and naturally without narrating backend mechanics.");
  }

  if (hasSuccessfulImage) {
    guidance.push("If generate_image succeeded, file delivery is already handled outside your text response.");
    guidance.push("If the generate_image result includes imageDescription, treat it as the best available description of the actual generated image and ground your reply in that instead of assuming the image perfectly matched the prompt.");
    guidance.push("Reply naturally in character as though you are showing the user the image.");
    guidance.push("Do not announce that an image is attached or say generic receipt text like 'generated image attached'; the attachment is already visible.");
    guidance.push("Do not restate the full prompt, preset ids, aspect ratio, or internal tool setup unless the user explicitly asked for those details.");
    guidance.push("Do not call generate_image again in this same reply unless the user clearly asked for multiple distinct images in one turn.");
  }

  if (hasSuccessfulAudio) {
    guidance.push("If generate_audio succeeded, the audio will be attached automatically.");
    guidance.push("Do not restate the spoken text in full unless the user explicitly asked for it.");
    guidance.push("Reply briefly and naturally around the audio attachment.");
    guidance.push("Do not call generate_audio again in this same reply.");
  }

  if (hasSuccessfulReaction) {
    guidance.push("If add_reaction succeeded, the visible Discord reaction already carries that nonverbal beat; continue the text reply naturally.");
  }

  return {
    role: "user",
    content: [
      {
        type: "input_text",
        text: [
          ...guidance,
          JSON.stringify(toolResults.map((result) => ({
            ...result,
            result: sanitizeToolResultForModel(result.result),
          })), null, 2),
        ].join("\n\n"),
      },
    ],
  };
}

function buildFollowupRequestAfterToolResults(request, followupInput) {
  const followupRequest = {
    ...request,
    input: followupInput,
  };

  if (request.tool_choice && request.tool_choice !== "auto") {
    followupRequest.tool_choice = "auto";
  }

  return followupRequest;
}

function buildNoToolRecoveryRequestAfterToolLimit(request, followupInput) {
  const recoveryRequest = {
    ...request,
    input: [
      ...followupInput,
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Tool-call limit reached for this reply.",
              "Do not call any more tools.",
              "Write the best helpful response now using the available tool results and visible conversation.",
              "If the tool results are not enough, say that briefly and answer with appropriate uncertainty.",
              "Do not mention internal tool limits unless the user specifically asked about an error.",
            ].join(" "),
          },
        ],
      },
    ],
  };

  delete recoveryRequest.tools;
  delete recoveryRequest.tool_choice;

  return recoveryRequest;
}

async function runToolLoop({
  client,
  request,
  tools,
  logger,
  toolContext = {},
  maxPasses = 3,
}) {
  let response = await client.responses.create(request);
  const executionCounts = new Map();
  const toolCallState = {
    signatures: new Set(),
    lookupIntentSignatures: new Set(),
    usefulLookupCounts: new Map(),
  };
  let toolOutputs = await executeToolCalls({ response, tools, logger, toolContext, executionCounts, toolCallState });
  let followupInput = [...request.input];
  let toolPasses = 0;
  const replyDirectives = extractReplyDirectives(toolOutputs);
  let toolLimitSummary = null;

  while (toolOutputs.length && toolPasses < maxPasses) {
    toolPasses += 1;
    followupInput = [...followupInput, buildToolResultsInput(toolOutputs)];

    response = await client.responses.create(buildFollowupRequestAfterToolResults(request, followupInput));
    toolOutputs = await executeToolCalls({ response, tools, logger, toolContext, executionCounts, toolCallState });
    const nextDirectives = extractReplyDirectives(toolOutputs);
    replyDirectives.files.push(...nextDirectives.files);
    replyDirectives.generatedImageIds.push(...nextDirectives.generatedImageIds);
    replyDirectives.generatedAudioIds.push(...nextDirectives.generatedAudioIds);
    replyDirectives.audioCaptions.push(...nextDirectives.audioCaptions);
    replyDirectives.imageWarnings.push(...nextDirectives.imageWarnings);
  }

  if (toolOutputs.length) {
    toolLimitSummary = {
      toolPasses,
      maxPasses,
      stoppedWithToolCalls: true,
      ...summarizeResponseOutput(response),
    };

    logger?.warn?.("[chat] Tool loop hit pass limit; forcing no-tool recovery", toolLimitSummary);
    followupInput = [...followupInput, buildToolResultsInput(toolOutputs)];
    response = await client.responses.create(buildNoToolRecoveryRequestAfterToolLimit(request, followupInput));
    toolOutputs = [];
  }

  const unresolvedToolCalls = extractFunctionCalls(response);
  const toolLoop = {
    toolPasses,
    maxPasses,
    stoppedWithToolCalls: unresolvedToolCalls.length > 0,
    toolLimitReached: Boolean(toolLimitSummary),
    toolLimitRecoveryAttempted: Boolean(toolLimitSummary),
    toolLimitRecoverySucceeded: Boolean(toolLimitSummary && response?.output_text?.trim()),
    toolLimitSummary,
    ...summarizeResponseOutput(response),
  };

  if (toolLoop.stoppedWithToolCalls) {
    logger?.warn?.("[chat] Tool loop stopped with unresolved tool calls", toolLoop);
  }

  return {
    response,
    toolLoop,
    replyDirectives: {
      files: replyDirectives.files,
      generatedImageIds: Array.from(new Set(replyDirectives.generatedImageIds)),
      generatedAudioIds: Array.from(new Set(replyDirectives.generatedAudioIds)),
      audioCaptions: Array.from(new Set(replyDirectives.audioCaptions)),
      imageWarnings: Array.from(new Set(replyDirectives.imageWarnings)),
    },
  };
}

module.exports = {
  runToolLoop,
  buildToolResultsInput,
  buildFollowupRequestAfterToolResults,
  buildNoToolRecoveryRequestAfterToolLimit,
  executeToolCalls,
  extractFunctionCalls,
  summarizeResponseOutput,
  extractReplyDirectives,
};
