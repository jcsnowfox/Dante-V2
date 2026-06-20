const OpenAI = require("openai");

const clientCache = new Map();

function normalizeProvider() {
  return "openrouter";
}

function resolveCapabilityKey(capability = "chat") {
  const normalized = String(capability || "chat").trim().toLowerCase().replace(/[_\s-]+/g, "");

  if (["chat", "summary", "image", "embedding", "transcription", "imagegeneration"].includes(normalized)) {
    return normalized === "imagegeneration" ? "imageGeneration" : normalized;
  }

  return "chat";
}

function resolveLlmProviderConfig(config = {}, capability = "chat") {
  const capabilityKey = resolveCapabilityKey(capability);
  const capabilityConfig = config.llm?.[capabilityKey] || {};
  const provider = normalizeProvider();
  const configuredApiKey = String(
    capabilityConfig.apiKey
      || config.llm?.apiKey
      || config.openrouter?.apiKey
      || "",
  ).trim();
  const apiKey = String(configuredApiKey || process.env.OPENROUTER_API_KEY || "").trim();
  const baseURL = String(
    capabilityConfig.baseURL || config.llm?.baseURL || process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  ).trim();
  const defaultHeaders = {};

  const referer = String(capabilityConfig.httpReferer || config.llm?.httpReferer || "").trim();
  const appTitle = String(capabilityConfig.appTitle || config.llm?.appTitle || "").trim();

  if (referer) {
    defaultHeaders["HTTP-Referer"] = referer;
  }

  if (appTitle) {
    defaultHeaders["X-Title"] = appTitle;
  }

  return {
    capability: capabilityKey,
    provider,
    apiKey,
    baseURL,
    defaultHeaders,
  };
}

function hasLlmApiKey(config = {}, capability = "chat") {
  return Boolean(resolveLlmProviderConfig(config, capability).apiKey);
}

function getLlmClient(config = {}, capability = "chat") {
  const providerConfig = resolveLlmProviderConfig(config, capability);

  if (!providerConfig.apiKey) {
    return null;
  }

  const cacheKey = JSON.stringify(providerConfig);

  if (!clientCache.has(cacheKey)) {
    clientCache.set(cacheKey, new OpenAI({
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseURL || undefined,
      defaultHeaders: Object.keys(providerConfig.defaultHeaders).length ? providerConfig.defaultHeaders : undefined,
    }));
  }

  return clientCache.get(cacheKey);
}

function resolveChatModel(config = {}) {
  return String(config.llm?.chat?.model || config.llm?.chatModel || "").trim();
}

function resolveSummaryModel(config = {}) {
  return String(config.llm?.summary?.model || config.llm?.summaryModel || resolveChatModel(config)).trim();
}

function resolveImageModel(config = {}) {
  return String(config.llm?.image?.model || config.llm?.imageModel || resolveChatModel(config)).trim();
}

function resolveEmbeddingModel(config = {}) {
  return String(config.llm?.embedding?.model || config.llm?.embeddingModel || "").trim();
}

function resolveImageGenerationModel(config = {}) {
  return String(config.imageGeneration?.model || "").trim();
}

function resolveTranscriptionModel(config = {}) {
  return String(config.llm?.transcription?.model || config.llm?.transcriptionModel || "").trim();
}

module.exports = {
  normalizeProvider,
  resolveLlmProviderConfig,
  hasLlmApiKey,
  getLlmClient,
  resolveChatModel,
  resolveSummaryModel,
  resolveImageModel,
  resolveEmbeddingModel,
  resolveImageGenerationModel,
  resolveTranscriptionModel,
};
