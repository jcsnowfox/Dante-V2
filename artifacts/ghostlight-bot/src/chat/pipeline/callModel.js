const { getLlmClient, hasLlmApiKey, resolveChatModel, resolveLlmProviderConfig } = require("../../llm/client");
const { extractWebSearchSources } = require("./webSearch");
const { runToolLoop, isContentFilterError } = require("./runToolLoop");
const { buildChatRequest } = require("./buildChatRequest");
const {
  getCachedOpenRouterModelToolSupport,
  rememberOpenRouterModelToolSupport,
} = require("../../llm/modelValidation");
const {
  formatMemories,
  formatRecentHistory,
  formatTimestamp,
} = require("./buildChatInput");
const { isStandaloneProviderRefusal } = require("./providerRefusal");
const { isUnsafeProviderText } = require("../../continuity/emotionalBeats");
const { selectTinyFallback } = require("../../continuity/replyFallbacks");
const { logReplyPromptDebug } = require("../promptDebug");

function isToolUseUnsupportedError(error) {
  const status = Number(error?.status || error?.code || 0);
  const message = [
    error?.message,
    error?.error?.message,
    error?.response?.data?.error?.message,
  ].map((item) => String(item || "")).join(" ");

  return status === 404 && /no endpoints found.+support tool use|support tool use.+disable|disable ["']?[^"']+["']?/i.test(message);
}

function truncateDiagnosticText(value, limit = 2000) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function getErrorHeader(error, name) {
  const headerName = String(name || "").trim();

  if (!headerName) {
    return "";
  }

  if (typeof error?.headers?.get === "function") {
    return String(error.headers.get(headerName) || error.headers.get(headerName.toLowerCase()) || "").trim();
  }

  return String(error?.headers?.[headerName] || error?.headers?.[headerName.toLowerCase()] || "").trim();
}

function safeParseJson(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch (_error) {
    return null;
  }
}

function extractProviderRawError(error) {
  return String(
    error?.error?.metadata?.raw
      || error?.metadata?.raw
      || error?.response?.data?.error?.metadata?.raw
      || "",
  ).trim();
}

function buildProviderRawSummary(raw) {
  const parsed = safeParseJson(raw);
  const providerError = parsed?.error && typeof parsed.error === "object" ? parsed.error : parsed;

  if (!providerError || typeof providerError !== "object") {
    return null;
  }

  return {
    message: truncateDiagnosticText(providerError.message, 500),
    type: providerError.type || "",
    param: providerError.param || "",
    code: providerError.code || "",
  };
}

function buildErrorDiagnostics(error) {
  const raw = extractProviderRawError(error);

  return {
    message: truncateDiagnosticText(error?.message, 500),
    status: Number(error?.status || error?.code || 0) || null,
    code: error?.code || error?.error?.code || null,
    type: error?.type || error?.error?.type || null,
    param: error?.param || error?.error?.param || null,
    requestId: error?.requestID || error?.requestId || error?.error?.requestId || null,
    providerName: getErrorHeader(error, "provider_name"),
    generationId: getErrorHeader(error, "x-generation-id"),
    cfRay: getErrorHeader(error, "cf-ray"),
    openRouterError: {
      message: truncateDiagnosticText(error?.error?.message || error?.response?.data?.error?.message, 500),
      code: error?.error?.code || error?.response?.data?.error?.code || null,
      type: error?.error?.type || error?.response?.data?.error?.type || null,
      param: error?.error?.param || error?.response?.data?.error?.param || null,
    },
    providerRawError: truncateDiagnosticText(raw),
    providerRawSummary: buildProviderRawSummary(raw),
  };
}

function summarizeToolContext(toolContext = {}) {
  return {
    surface: toolContext.surface || "",
    channelId: toolContext.channelId || "",
    conversationId: toolContext.conversationId || "",
    guildId: toolContext.guildId || "",
    sourceMessageId: toolContext.sourceMessageId || "",
    allowedToolNames: Array.isArray(toolContext.allowedToolNames) ? toolContext.allowedToolNames : [],
    proactiveEnabledTools: Array.isArray(toolContext.proactiveEnabledTools) ? toolContext.proactiveEnabledTools : [],
    allowWebSearch: typeof toolContext.allowWebSearch === "boolean" ? toolContext.allowWebSearch : null,
    memoryContextCount: Array.isArray(toolContext.memoryContextIds) ? toolContext.memoryContextIds.length : 0,
    recentHistoryCount: Array.isArray(toolContext.recentHistory) ? toolContext.recentHistory.length : 0,
  };
}

function summarizeAutomation(automation = null) {
  if (!automation || typeof automation !== "object") {
    return null;
  }

  return {
    automationId: automation.automationId || "",
    source: automation.source || "",
    triggerType: automation.triggerType || "",
    type: automation.type || "",
    label: automation.label || "",
    channelId: automation.channelId || automation.target || "",
    enabledTools: Array.isArray(automation.enabledTools) ? automation.enabledTools : [],
  };
}

function getAutomationLabel(automation = null) {
  return String(
    automation?.label
      || automation?.automationLabel
      || automation?.name
      || automation?.automationId
      || "",
  ).trim();
}

function getAutomationTarget(automation = null, toolContext = {}) {
  return String(
    automation?.target
      || automation?.channelId
      || toolContext?.target
      || toolContext?.channelId
      || toolContext?.conversationId
      || "",
  ).trim();
}

function getProviderErrorMessage(response = {}) {
  return String(response?.error?.message || response?.error || "").trim();
}

function buildOpenRouterGenerationUrl(baseURL, responseId) {
  const normalizedBaseUrl = String(baseURL || "https://openrouter.ai/api/v1").trim().replace(/\/+$/g, "");
  const url = new URL(`${normalizedBaseUrl}/generation`);
  url.searchParams.set("id", responseId);
  return url.toString();
}

function summarizeGenerationMetadata(payload = {}) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;

  if (!data || typeof data !== "object") {
    return null;
  }

  return {
    providerName: String(data.provider_name || "").trim(),
    router: String(data.router || "").trim(),
    upstreamId: String(data.upstream_id || "").trim(),
    serviceTier: String(data.service_tier || "").trim(),
    dataRegion: String(data.data_region || "").trim(),
    finishReason: String(data.finish_reason || "").trim(),
    nativeFinishReason: String(data.native_finish_reason || "").trim(),
    generationTime: Number(data.generation_time || 0) || null,
    latency: Number(data.latency || 0) || null,
    isByok: typeof data.is_byok === "boolean" ? data.is_byok : null,
    model: String(data.model || "").trim(),
    requestId: String(data.request_id || "").trim(),
  };
}

async function fetchOpenRouterGenerationMetadata({
  providerConfig = {},
  responseId = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = 2500,
} = {}) {
  const normalizedResponseId = String(responseId || "").trim();

  if (
    providerConfig.provider !== "openrouter"
    || !normalizedResponseId
    || !providerConfig.apiKey
    || typeof fetchImpl !== "function"
  ) {
    return null;
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let response;

  try {
    response = await fetchImpl(buildOpenRouterGenerationUrl(providerConfig.baseURL, normalizedResponseId), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        Accept: "application/json",
        ...providerConfig.defaultHeaders,
      },
      signal: controller?.signal,
    });
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  if (!response.ok) {
    const body = typeof response.text === "function" ? await response.text().catch(() => "") : "";
    throw new Error(`OpenRouter generation metadata lookup failed with status ${response.status}${body ? `: ${truncateDiagnosticText(body, 300)}` : ""}`);
  }

  const payload = await response.json();
  return summarizeGenerationMetadata(payload);
}

function classifyMissingTextResponse(response = {}, toolLoop = null) {
  if (toolLoop?.stoppedWithToolCalls || toolLoop?.toolLimitReached) {
    return "tool_limit_no_final_text";
  }

  if (isReasoningOnlyResponse(response)) {
    return "reasoning_only_response";
  }

  if (response?.status === "failed" || getProviderErrorMessage(response)) {
    return "provider_response_failed";
  }

  return "missing_visible_text";
}

function getMissingTextLogMessage(failureType) {
  if (failureType === "provider_response_failed") {
    return "[chat] OpenRouter provider response failed without output_text";
  }

  if (failureType === "reasoning_only_response") {
    return "[chat] OpenRouter response contained reasoning but no visible text";
  }

  if (failureType === "tool_limit_no_final_text") {
    return "[chat] Tool loop ended without visible reply text";
  }

  return "[chat] OpenRouter response did not include output_text";
}


function extractUsageMetrics(response = null) {
  const usage = response?.usage && typeof response.usage === "object" ? response.usage : null;

  if (!usage) {
    return null;
  }

  const details = usage.input_tokens_details || usage.prompt_tokens_details || {};
  const completionDetails = usage.output_tokens_details || usage.completion_tokens_details || {};

  return {
    promptTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || null,
    completionTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || null,
    totalTokens: Number(usage.total_tokens ?? 0) || null,
    cacheCreationInputTokens: Number(
      usage.cache_creation_input_tokens
        ?? details.cache_creation_input_tokens
        ?? details.cache_creation_tokens
        ?? 0,
    ) || null,
    cacheReadInputTokens: Number(
      usage.cache_read_input_tokens
        ?? details.cache_read_input_tokens
        ?? details.cached_tokens
        ?? 0,
    ) || null,
    reasoningTokens: Number(
      completionDetails.reasoning_tokens
        ?? usage.reasoning_tokens
        ?? 0,
    ) || null,
    estimatedCost: Number(usage.cost ?? usage.estimated_cost ?? 0) || null,
  };
}

function buildRequestTokenEstimate(requestShape = null) {
  const requestChars = buildRequestSizeSummary(requestShape);
  const totalChars = requestChars.instructions + requestChars.input + requestChars.toolSchemas;

  return {
    instructions: Math.ceil(requestChars.instructions / 4),
    input: Math.ceil(requestChars.input / 4),
    toolSchemas: Math.ceil(requestChars.toolSchemas / 4),
    total: Math.ceil(totalChars / 4),
  };
}

function buildRequestSizeSummary(requestShape = null) {
  const counts = requestShape?.charCounts || {};

  return {
    instructions: counts.instructionsTotal || 0,
    input: counts.inputTotal || 0,
    toolSchemas: counts.toolSchemas || 0,
  };
}

function buildModelCallHeadline({
  failureType,
  providerLabel,
  selectedModel,
  mode,
  automation,
  toolContext,
  requestShape,
  useWebSearch,
  totalToolCount,
  toolsMutedByFallback = false,
  response = null,
  toolLoop = null,
  error = null,
  generationMetadata = null,
} = {}) {
  const outputTypes = response ? getResponseOutputTypes(response) : [];
  const providerError = response ? getProviderErrorMessage(response) : "";
  const diagnostics = error ? buildErrorDiagnostics(error) : null;
  const actualProviderName = generationMetadata?.providerName || diagnostics?.providerName || "";

  return {
    failureType,
    provider: providerLabel,
    actualProviderName,
    model: selectedModel,
    surface: toolContext?.surface || automation?.triggerType || automation?.source || "",
    scheduleName: getAutomationLabel(automation) || String(toolContext?.actionName || "").trim(),
    actionType: automation?.type || automation?.actionType || toolContext?.actionType || "",
    target: getAutomationTarget(automation, toolContext),
    mode: mode?.name || mode?.modeKey || mode?.label || "",
    status: response?.status || null,
    providerError: providerError || diagnostics?.providerRawSummary?.message || diagnostics?.openRouterError?.message || diagnostics?.message || "",
    responseId: response?.id || diagnostics?.generationId || diagnostics?.requestId || "",
    httpStatus: diagnostics?.status || null,
    providerName: actualProviderName,
    router: generationMetadata?.router || "",
    upstreamId: generationMetadata?.upstreamId || "",
    serviceTier: generationMetadata?.serviceTier || "",
    dataRegion: generationMetadata?.dataRegion || "",
    finishReason: generationMetadata?.finishReason || "",
    nativeFinishReason: generationMetadata?.nativeFinishReason || "",
    generationLatencyMs: generationMetadata?.latency || null,
    upstreamGenerationTimeMs: generationMetadata?.generationTime || null,
    isByok: generationMetadata?.isByok ?? null,
    openRouterRequestId: generationMetadata?.requestId || "",
    outputTypes,
    incompleteReason: response?.incomplete_details?.reason || "",
    usageMetrics: extractUsageMetrics(response),
    reasoningTokens: extractUsageMetrics(response)?.reasoningTokens || null,
    toolPasses: toolLoop?.toolPasses ?? null,
    maxToolPasses: toolLoop?.maxPasses ?? null,
    stoppedWithToolCalls: Boolean(toolLoop?.stoppedWithToolCalls),
    toolLimitReached: Boolean(toolLoop?.toolLimitReached),
    toolNames: Array.isArray(requestShape?.toolNames) ? requestShape.toolNames : [],
    enabledTools: Array.isArray(automation?.enabledTools) ? automation.enabledTools : [],
    totalToolCount,
    webSearch: Boolean(useWebSearch),
    toolsMutedByFallback: Boolean(toolsMutedByFallback),
    requestChars: buildRequestSizeSummary(requestShape),
    estimatedRequestTokens: buildRequestTokenEstimate(requestShape),
  };
}

function buildModelCallDiagnostics({
  providerLabel,
  selectedModel,
  mode,
  automation,
  toolContext,
  request,
  requestShape,
  useWebSearch,
  totalToolCount,
  toolsMutedByFallback = false,
}) {
  const activeToolNames = Array.isArray(request?.tools)
    ? request.tools.map((tool) => String(tool?.name || "").trim()).filter(Boolean)
    : [];

  return {
    provider: providerLabel,
    model: selectedModel,
    mode: {
      name: mode?.name || "",
      modeKey: mode?.modeKey || "",
      label: mode?.label || "",
      chatModel: mode?.chatModel || "",
    },
    automation: summarizeAutomation(automation),
    toolContext: summarizeToolContext(toolContext),
    tools: {
      totalToolCount,
      activeToolNames,
      toolChoice: request?.tool_choice || null,
      toolsMutedByFallback,
      webSearch: Boolean(useWebSearch),
    },
    requestShape: requestShape || null,
  };
}

function buildMissingOutputText({ response = {}, toolLoop = null, adultModeActive = false } = {}) {
  if (toolLoop?.stoppedWithToolCalls || toolLoop?.toolLimitReached) {
    const finalToolNames = Array.isArray(toolLoop.toolLimitSummary?.finalToolNames)
      ? toolLoop.toolLimitSummary.finalToolNames
      : Array.isArray(toolLoop.finalToolNames)
        ? toolLoop.finalToolNames
        : [];
    const uniqueToolNames = Array.from(new Set(finalToolNames.map((item) => String(item || "").trim()).filter(Boolean)));
    const toolSummary = uniqueToolNames.length
      ? ` unresolved tools: ${uniqueToolNames.join(", ")}.`
      : "";
    const responseId = toolLoop.toolLimitSummary?.responseId || toolLoop.responseId || response.id;
    const responseSummary = responseId ? ` response: ${responseId}.` : "";
    const recoverySummary = toolLoop.toolLimitRecoveryAttempted
      ? " No-tool recovery also returned no reply text."
      : "";

    return [
      `error: model hit the tool-call limit before writing a reply (${toolLoop.toolPasses}/${toolLoop.maxPasses} tool-result passes).`,
      toolSummary,
      responseSummary,
      recoverySummary,
      " Please try again; if it repeats, check the Railway logs for this response.",
    ].join("").replace(/\s+/g, " ").trim();
  }

  if (isReasoningOnlyResponse(response)) {
    const responseId = response.id ? ` response: ${response.id}.` : "";

    return [
      "error: selected chat model returned reasoning metadata but no visible reply text.",
      responseId,
      " Ghostlight cannot send hidden reasoning to Discord.",
      " Please choose a non-reasoning chat model, or disable/avoid thinking output for the chat model in OpenRouter.",
    ].join("").replace(/\s+/g, " ").trim();
  }

  const status = response.status ? ` status: ${response.status}.` : "";
  const responseId = response.id ? ` response: ${response.id}.` : "";
  const outputTypes = Array.isArray(response.output)
    ? response.output.map((item) => item?.type || "unknown").filter(Boolean)
    : [];
  const outputSummary = outputTypes.length ? ` output types: ${outputTypes.join(", ")}.` : "";
  const error = response.error?.message || response.error;
  const errorSummary = error
    ? (isContentFilterError(error, adultModeActive)
      ? " The model provider declined this request."
      : ` provider error: ${error}.`)
    : "";
  const incompleteReason = response.incomplete_details?.reason;
  const incompleteSummary = incompleteReason ? ` incomplete reason: ${incompleteReason}.` : "";
  const failedProviderResponse = response.status === "failed" || Boolean(error);
  const opening = failedProviderResponse
    ? "error: upstream model provider failed before returning reply text."
    : "error: model returned no reply text.";

  return [
    opening,
    status,
    responseId,
    outputSummary,
    errorSummary,
    incompleteSummary,
    " Please try again; if it repeats, check the Railway logs for this response.",
  ].join("").replace(/\s+/g, " ").trim();
}

function getResponseOutputTypes(response = {}) {
  return Array.isArray(response.output)
    ? response.output.map((item) => item?.type || "unknown").filter(Boolean)
    : [];
}

function collectResponseOutputTextParts(response = {}) {
  const parts = [];

  for (const output of Array.isArray(response.output) ? response.output : []) {
    if (output?.type === "reasoning") {
      continue;
    }

    if (typeof output?.text === "string") {
      parts.push(output.text);
    }

    if (typeof output?.output_text === "string") {
      parts.push(output.output_text);
    }

    if (typeof output?.content === "string") {
      parts.push(output.content);
      continue;
    }

    for (const content of Array.isArray(output?.content) ? output.content : []) {
      if (content?.type === "reasoning") {
        continue;
      }

      if (typeof content === "string") {
        parts.push(content);
      } else if (typeof content?.text === "string") {
        parts.push(content.text);
      } else if (typeof content?.output_text === "string") {
        parts.push(content.output_text);
      }
    }
  }

  const choiceContent = response?.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string") {
    parts.push(choiceContent);
  }

  return parts.map((part) => String(part || "").trim()).filter(Boolean);
}

const LITERAL_TOOL_INVOCATION_LINE_PATTERN = /^\s*<tool_invocation\b[^>]*\/>\s*$/i;

function isOnlyLiteralToolInvocationMarkup(text = "") {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return Boolean(lines.length) && lines.every((line) => LITERAL_TOOL_INVOCATION_LINE_PATTERN.test(line));
}

function chooseResponseText(response = {}) {
  const outputText = typeof response.output_text === "string" ? response.output_text.trim() : "";
  const nestedText = collectResponseOutputTextParts(response).join("\n").trim();

  if (outputText && !isOnlyLiteralToolInvocationMarkup(outputText)) {
    return {
      text: outputText,
      source: "output_text",
      outputText,
      nestedText,
      recoveredFromNestedOutput: false,
      literalToolMarkupOnly: false,
    };
  }

  if (nestedText && nestedText !== outputText && !isOnlyLiteralToolInvocationMarkup(nestedText)) {
    return {
      text: nestedText,
      source: "output_content",
      outputText,
      nestedText,
      recoveredFromNestedOutput: true,
      literalToolMarkupOnly: isOnlyLiteralToolInvocationMarkup(outputText),
    };
  }

  return {
    text: outputText,
    source: outputText ? "output_text" : "",
    outputText,
    nestedText,
    recoveredFromNestedOutput: false,
    literalToolMarkupOnly: isOnlyLiteralToolInvocationMarkup(outputText || nestedText),
  };
}

function isReasoningOnlyResponse(response = {}) {
  const outputTypes = getResponseOutputTypes(response);

  return outputTypes.length > 0 && outputTypes.every((type) => type === "reasoning");
}

async function callModel({
  config,
  logger,
  mode,
  input,
  recentHistory,
  memories,
  tools,
  automation = null,
  contextSections = [],
  toolContext = {},
  overrideSystemPrompt = null,
  systemPromptPrefix = null,
  channelType = "discord",
  privacyLevel = "public",
  adultModeActive = false,
  replySafeMode = false,
  toolsEnabled: forcedToolsEnabled = null,
}) {
  const selectedModel = mode?.chatModel || resolveChatModel(config);

  if (!hasLlmApiKey(config, "chat")) {
    return {
      provider: "placeholder",
      mode: mode.name,
      toolCount: tools.list().length,
      summary: {
        input: input.content,
        recentHistoryCount: recentHistory.length,
        memoryCount: memories.length,
        model: selectedModel || config.chat.placeholderModel,
      },
    };
  }

  const client = getLlmClient(config, "chat");
  const startedAt = Date.now();
  const providerConfig = resolveLlmProviderConfig(config, "chat");
  const providerLabel = providerConfig.provider;
  const initialToolDefinitions = replySafeMode ? [] : tools.list(toolContext);
  const toolSupport = initialToolDefinitions.length
    ? getCachedOpenRouterModelToolSupport({
      config,
      capability: "chat",
      model: selectedModel,
    })
    : { checked: false, supportsTools: true, reason: "no_tools" };
  const requiresPositiveToolSupport = String(providerLabel || "").toLowerCase() === "openrouter";
  const resolvedToolsEnabled = requiresPositiveToolSupport
    ? Boolean(toolSupport.checked && toolSupport.supportsTools)
    : !(toolSupport.checked && toolSupport.supportsTools === false);
  const toolsEnabled = typeof forcedToolsEnabled === "boolean" ? forcedToolsEnabled && resolvedToolsEnabled : resolvedToolsEnabled;

  if (!toolsEnabled) {
    logger.debug?.("[chat] Muting tools for selected model", {
      provider: providerLabel,
      model: selectedModel,
      reason: requiresPositiveToolSupport && !toolSupport.checked
        ? "openrouter_tool_support_unverified"
        : "model_does_not_support_tools",
    });
  }

  function buildRequest({ enableTools }) {
    return buildChatRequest({
      config,
      mode,
      input,
      recentHistory,
      contextSections,
      memories,
      tools,
      automation,
      selectedModel,
      toolContext,
      toolsEnabled: enableTools,
      replySafeMode,
      overrideSystemPrompt,
      systemPromptPrefix,
      channelType,
      privacyLevel,
    });
  }

  let {
    request,
    useWebSearch,
    totalToolCount,
    requestShape,
  } = buildRequest({
    enableTools: toolsEnabled,
  });
  let toolsMutedByFallback = false;

  logReplyPromptDebug(logger, "final-prompt-before-llm", {
    provider: providerLabel,
    model: selectedModel,
    contextSections,
    memories,
    recentHistoryCount: recentHistory.length,
    requestShape: {
      ...requestShape,
      estimatedRequestTokens: buildRequestTokenEstimate(requestShape),
    },
    fullPrompt: request.instructions,
  });

  logger.debug?.("[chat] Calling model", {
    provider: providerLabel,
    model: selectedModel,
    mode: mode.name,
    inputLength: input.content.length,
    inputTypes: input.inputTypes,
    recentHistoryCount: recentHistory.length,
    memoryCount: memories.length,
    toolCount: totalToolCount,
    webSearch: useWebSearch,
    requestChars: buildRequestSizeSummary(requestShape),
    estimatedRequestTokens: buildRequestTokenEstimate(requestShape),
  });

  async function runRequest(activeRequest) {
    return runToolLoop({
      client,
      request: activeRequest,
      tools,
      logger,
      toolContext,
    });
  }

  let modelResponse;

  try {
    modelResponse = await runRequest(request);
  } catch (error) {
    if (!request.tools?.length || !isToolUseUnsupportedError(error)) {
      logger.warn("[chat] Model call failed with diagnostics", {
        headline: buildModelCallHeadline({
          failureType: "model_call_threw",
          providerLabel,
          selectedModel,
          mode,
          automation,
          toolContext,
          requestShape,
          useWebSearch,
          totalToolCount,
          toolsMutedByFallback,
          error,
        }),
        error: buildErrorDiagnostics(error),
        call: buildModelCallDiagnostics({
          providerLabel,
          selectedModel,
          mode,
          automation,
          toolContext,
          request,
          requestShape,
          useWebSearch,
          totalToolCount,
          toolsMutedByFallback,
        }),
      });
      throw error;
    }

    logger.warn("[chat] Model endpoint rejected tools; retrying without tool definitions", {
      headline: buildModelCallHeadline({
        failureType: "model_rejected_tools",
        providerLabel,
        selectedModel,
        mode,
        automation,
        toolContext,
        requestShape,
        useWebSearch,
        totalToolCount,
        toolsMutedByFallback,
        error,
      }),
      provider: providerLabel,
      model: selectedModel,
      error: error.message,
      diagnostics: buildErrorDiagnostics(error),
      call: buildModelCallDiagnostics({
        providerLabel,
        selectedModel,
        mode,
        automation,
        toolContext,
        request,
        requestShape,
        useWebSearch,
        totalToolCount,
        toolsMutedByFallback,
      }),
    });

    rememberOpenRouterModelToolSupport({
      config,
      capability: "chat",
      model: selectedModel,
      supportsTools: false,
    });

    const fallbackRequest = buildRequest({
      enableTools: false,
    });

    request = fallbackRequest.request;
    useWebSearch = fallbackRequest.useWebSearch;
    totalToolCount = fallbackRequest.totalToolCount;
    requestShape = fallbackRequest.requestShape;
    toolsMutedByFallback = true;
    try {
      modelResponse = await runRequest(request);
    } catch (fallbackError) {
      logger.warn("[chat] Model call failed after tools were muted", {
        headline: buildModelCallHeadline({
          failureType: "model_call_threw_after_tools_muted",
          providerLabel,
          selectedModel,
          mode,
          automation,
          toolContext,
          requestShape,
          useWebSearch,
          totalToolCount,
          toolsMutedByFallback,
          error: fallbackError,
        }),
        error: buildErrorDiagnostics(fallbackError),
        call: buildModelCallDiagnostics({
          providerLabel,
          selectedModel,
          mode,
          automation,
          toolContext,
          request,
          requestShape,
          useWebSearch,
          totalToolCount,
          toolsMutedByFallback,
        }),
      });
      throw fallbackError;
    }
  }

  const {
    response,
    replyDirectives,
    toolLoop,
  } = modelResponse;

  const responseText = chooseResponseText(response);
  const text = responseText.text;
  const sources = useWebSearch ? extractWebSearchSources(response) : [];

  if (responseText.recoveredFromNestedOutput) {
    logger.warn("[chat] Recovered visible text from response output content", {
      headline: buildModelCallHeadline({
        failureType: "recovered_nested_visible_text",
        providerLabel,
        selectedModel,
        mode,
        automation,
        toolContext,
        requestShape,
        useWebSearch,
        totalToolCount,
        toolsMutedByFallback,
        response,
        toolLoop,
      }),
      responseId: response.id,
      status: response.status || null,
      outputTypes: getResponseOutputTypes(response),
      outputTextPreview: truncateDiagnosticText(responseText.outputText, 500),
      nestedTextPreview: truncateDiagnosticText(responseText.nestedText, 500),
      literalToolMarkupOnly: responseText.literalToolMarkupOnly,
      call: buildModelCallDiagnostics({
        providerLabel,
        selectedModel,
        mode,
        automation,
        toolContext,
        request,
        requestShape,
        useWebSearch,
        totalToolCount,
        toolsMutedByFallback,
      }),
    });
  }

  if (responseText.literalToolMarkupOnly && !responseText.recoveredFromNestedOutput) {
    logger.warn("[chat] Model returned literal tool invocation markup as visible text", {
      headline: buildModelCallHeadline({
        failureType: "literal_tool_markup_visible_text",
        providerLabel,
        selectedModel,
        mode,
        automation,
        toolContext,
        requestShape,
        useWebSearch,
        totalToolCount,
        toolsMutedByFallback,
        response,
        toolLoop,
      }),
      responseId: response.id,
      status: response.status || null,
      outputTypes: getResponseOutputTypes(response),
      outputTextPreview: truncateDiagnosticText(responseText.outputText || responseText.nestedText, 500),
      call: buildModelCallDiagnostics({
        providerLabel,
        selectedModel,
        mode,
        automation,
        toolContext,
        request,
        requestShape,
        useWebSearch,
        totalToolCount,
        toolsMutedByFallback,
      }),
    });
  }

  if (!text) {
    const failureType = classifyMissingTextResponse(response, toolLoop);
    let generationMetadata = null;
    let generationMetadataLookupError = null;

    if (failureType === "provider_response_failed") {
      try {
        generationMetadata = await fetchOpenRouterGenerationMetadata({
          providerConfig,
          responseId: response.id,
        });
      } catch (error) {
        generationMetadataLookupError = truncateDiagnosticText(error?.message || error, 500);
      }
    }

    logger.warn(getMissingTextLogMessage(failureType), {
      headline: buildModelCallHeadline({
        failureType,
        providerLabel,
        selectedModel,
        mode,
        automation,
        toolContext,
        requestShape,
        useWebSearch,
        totalToolCount,
        toolsMutedByFallback,
        response,
        toolLoop,
        generationMetadata,
      }),
      generationMetadata,
      generationMetadataLookupError,
      responseId: response.id,
      status: response.status || null,
      outputTypes: getResponseOutputTypes(response),
      responseTextSource: responseText.source,
      nestedTextPreview: truncateDiagnosticText(responseText.nestedText, 500),
      toolLoop: toolLoop || null,
      error: response.error?.message || response.error || null,
      incompleteReason: response.incomplete_details?.reason || null,
      usageMetrics: extractUsageMetrics(response),
      reasoningTokens: extractUsageMetrics(response)?.reasoningTokens || null,
      call: buildModelCallDiagnostics({
        providerLabel,
        selectedModel,
        mode,
        automation,
        toolContext,
        request,
        requestShape,
        useWebSearch,
        totalToolCount,
        toolsMutedByFallback,
      }),
    });
  }

  const usageMetrics = extractUsageMetrics(response);

  logger.debug?.("[chat] Model response received", {
    provider: providerLabel,
    model: selectedModel,
    durationMs: Date.now() - startedAt,
    outputLength: text ? text.length : 0,
    responseId: response.id,
    sourceCount: sources.length,
    toolsMutedByFallback,
    requestChars: buildRequestSizeSummary(requestShape),
    estimatedRequestTokens: buildRequestTokenEstimate(requestShape),
    usageMetrics,
  });

  if (adultModeActive && response.error?.message && isContentFilterError(response.error.message)) {
    logger.info?.("[chat] Adult Private Mode: content filter error suppressed", {
      provider: providerLabel,
      model: selectedModel,
      originalError: response.error.message,
    });
  }

  let visibleText = text;
  if (isStandaloneProviderRefusal(visibleText)) {
    logger.warn("[chat] Suppressed standalone provider refusal leaked as visible text", {
      provider: providerLabel,
      model: selectedModel,
      responseId: response.id,
      preview: truncateDiagnosticText(visibleText, 200),
    });
    visibleText = selectTinyFallback();
  }

  return {
    provider: providerLabel,
    mode: mode.name,
    toolCount: totalToolCount,
    text: isUnsafeProviderText(visibleText) ? selectTinyFallback() : (visibleText || selectTinyFallback()),
    sources,
    webSearchUsed: useWebSearch,
    files: replyDirectives.files,
    generatedImageIds: replyDirectives.generatedImageIds,
    generatedAudioIds: replyDirectives.generatedAudioIds,
    audioCaptions: replyDirectives.audioCaptions,
    imageWarnings: replyDirectives.imageWarnings,
    mediaStates: replyDirectives.mediaStates,
    usageMetrics,
    requestChars: buildRequestSizeSummary(requestShape),
    estimatedRequestTokens: buildRequestTokenEstimate(requestShape),
    summary: {
      input: input.content,
      recentHistoryCount: recentHistory.length,
      memoryCount: memories.length,
      model: selectedModel,
    },
  };
}

module.exports = {
  formatMemories,
  formatRecentHistory,
  formatTimestamp,
  callModel,
  isToolUseUnsupportedError,
  buildMissingOutputText,
  getResponseOutputTypes,
  collectResponseOutputTextParts,
  chooseResponseText,
  isOnlyLiteralToolInvocationMarkup,
  isReasoningOnlyResponse,
  isStandaloneProviderRefusal,
  extractUsageMetrics,
  buildRequestSizeSummary,
  buildRequestTokenEstimate,
};
