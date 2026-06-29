const {
  resolveLlmProviderConfig,
  resolveChatModel,
  resolveSummaryModel,
  resolveImageModel,
  resolveEmbeddingModel,
  resolveTranscriptionModel,
} = require("./client");

const MODEL_SETTING_DEFINITIONS = Object.freeze([
  {
    key: "llm.chat.model",
    capability: "chat",
    label: "Chat",
    outputModalities: "text",
    requiredInputModalities: [],
    getCurrentValue: resolveChatModel,
  },
  {
    key: "llm.summary.model",
    capability: "summary",
    label: "Summaries",
    outputModalities: "text",
    requiredInputModalities: [],
    getCurrentValue: resolveSummaryModel,
  },
  {
    key: "llm.image.model",
    capability: "image",
    label: "Image Analysis",
    outputModalities: "text",
    requiredInputModalities: ["image"],
    getCurrentValue: resolveImageModel,
  },
  {
    key: "llm.embedding.model",
    capability: "embedding",
    label: "Embeddings",
    outputModalities: "embeddings",
    requiredInputModalities: [],
    getCurrentValue: resolveEmbeddingModel,
  },
  {
    key: "llm.transcription.model",
    capability: "transcription",
    label: "Transcription",
    outputModalities: "text",
    requiredInputModalities: ["audio"],
    getCurrentValue: resolveTranscriptionModel,
  },
]);

const modelCapabilitiesCache = new Map();
const MODEL_CAPABILITY_CACHE_TTL_MS = 60 * 60 * 1000;

const RECOMMENDED_MODELS = Object.freeze({
  dailyCompanion: "anthropic/claude-haiku-4.5",
  adultPrivate: "xiaomi/mimo-v2.5",
});

function getModelOutputModalitiesForCapability(capability = "chat") {
  const normalizedCapability = String(capability || "").trim().toLowerCase();
  return MODEL_SETTING_DEFINITIONS.find((definition) => definition.capability === normalizedCapability)
    ?.outputModalities || "text";
}

function getModelRequiredInputModalitiesForCapability(capability = "chat") {
  const normalizedCapability = String(capability || "").trim().toLowerCase();
  return MODEL_SETTING_DEFINITIONS.find((definition) => definition.capability === normalizedCapability)
    ?.requiredInputModalities || [];
}

function buildModelsUrl(baseURL, { outputModalities = "", userScoped = true } = {}) {
  const normalizedBaseUrl = String(baseURL || "").trim() || "https://openrouter.ai/api/v1";
  const url = new URL(normalizedBaseUrl.endsWith("/") ? normalizedBaseUrl : `${normalizedBaseUrl}/`);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/models${userScoped ? "/user" : ""}`;
  url.search = "";

  if (outputModalities) {
    url.searchParams.set("output_modalities", outputModalities);
  }

  return url.toString();
}

function buildModelsUserUrl(baseURL, { outputModalities = "" } = {}) {
  return buildModelsUrl(baseURL, { outputModalities, userScoped: true });
}

function buildPublicModelsUrl(baseURL, { outputModalities = "" } = {}) {
  return buildModelsUrl(baseURL, { outputModalities, userScoped: false });
}

function getProviderCapabilityCacheKey(providerConfig = {}, { outputModalities = "", userScoped = true } = {}) {
  return buildProviderConfigCacheKey(providerConfig, { outputModalities, userScoped });
}

function splitSettingsByKeys(settings = {}, selectedKeys = []) {
  const selected = {};
  const remainder = {};
  const selectedKeySet = new Set(selectedKeys);

  for (const [key, value] of Object.entries(settings || {})) {
    if (selectedKeySet.has(key)) {
      selected[key] = value;
      continue;
    }

    remainder[key] = value;
  }

  return {
    selected,
    remainder,
  };
}

function getChangedModelSettings(config = {}, settings = {}) {
  return MODEL_SETTING_DEFINITIONS
    .filter((definition) => Object.prototype.hasOwnProperty.call(settings, definition.key))
    .map((definition) => {
      const nextValue = String(settings[definition.key] || "").trim();
      const currentValue = definition.getCurrentValue(config);

      return {
        key: definition.key,
        capability: definition.capability,
        label: definition.label,
        currentValue,
        nextValue,
      };
    })
    .filter((entry) => entry.nextValue && entry.nextValue !== entry.currentValue);
}

function formatModelValidationError(invalidModels = []) {
  if (!invalidModels.length) {
    return "";
  }

  const details = invalidModels
    .map((entry) => {
      const fromPart = entry.currentValue ? ` (was: ${entry.currentValue})` : "";
      return `${entry.label}: tried “${entry.nextValue}”${fromPart}`;
    })
    .join("; ");

  return (
    `These model changes were not saved because the model IDs were not returned by OpenRouter’s availability check for the current API key: ${details}. `
    + `Possible causes: wrong model slug, model not available for your API key tier, or account-level provider filters are blocking it. `
    + `Verify the slug at openrouter.ai, check your API key permissions, or choose a different model.`
  );
}

function formatModelCapabilityError(unsupportedModels = []) {
  if (!unsupportedModels.length) {
    return "";
  }

  const details = unsupportedModels
    .map((entry) => {
      const requiredInputs = getModelRequiredInputModalitiesForCapability(entry.capability).join(", ");
      return `${entry.label}: ${entry.nextValue}${requiredInputs ? ` needs ${requiredInputs} input support` : ""}`;
    })
    .join("; ");

  return `These model changes were not saved because they do not match the capability Ghostlight needs: ${details}. Choose a model with the required input/output modalities.`;
}

function formatPublicCatalogFallbackWarning(models = []) {
  if (!models.length) {
    return "";
  }

  const details = models.map((entry) => `${entry.label}: ${entry.nextValue}`).join("; ");
  return `OpenRouter's key-filtered model list did not return ${details}, but the public embeddings catalog did, so Ghostlight saved it anyway. Runtime provider routing can still fail if OpenRouter cannot serve that model for this key.`;
}

function expandModelIdAliases(modelId) {
  const id = String(modelId || "").trim();

  if (!id) {
    return [];
  }

  const aliases = new Set([id]);

  if (/^openai\/text-embedding-/i.test(id)) {
    aliases.add(id.replace(/^openai\//i, ""));
  } else if (/^text-embedding-/i.test(id)) {
    aliases.add(`openai/${id}`);
  }

  return [...aliases];
}

function buildModelCapabilities(models = []) {
  const modelIds = new Set();
  const modelCapabilities = new Map();

  for (const model of models) {
    const id = String(model?.id || "").trim();
    const canonicalSlug = String(model?.canonical_slug || "").trim();
    const supportedParameters = Array.isArray(model?.supported_parameters)
      ? model.supported_parameters.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const inputModalities = Array.isArray(model?.architecture?.input_modalities)
      ? model.architecture.input_modalities.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const outputModalities = Array.isArray(model?.architecture?.output_modalities)
      ? model.architecture.output_modalities.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const noToolModel = /(^|\/)l3\.1-euryale-70b$/i.test(id) || /(^|\/)l3\.1-euryale-70b$/i.test(canonicalSlug);
    const supportsTools = noToolModel ? false : supportedParameters.includes("tools");

    for (const alias of [...expandModelIdAliases(id), ...expandModelIdAliases(canonicalSlug)]) {
      modelIds.add(alias);
      modelCapabilities.set(alias, {
        id: id || alias,
        canonicalSlug,
        supportsTools,
        supportedParameters,
        inputModalities,
        outputModalities,
      });
    }
  }

  return {
    modelIds,
    modelCapabilities,
  };
}

function rememberProviderModelCapabilities(providerConfig = {}, capabilities = {}, options = {}) {
  const cacheKey = getProviderCapabilityCacheKey(providerConfig, options);

  modelCapabilitiesCache.set(cacheKey, {
    ...capabilities,
    cachedAt: Date.now(),
  });
}

function getCachedProviderModelCapabilities(
  providerConfig = {},
  { maxAgeMs = MODEL_CAPABILITY_CACHE_TTL_MS, outputModalities = "", userScoped = true } = {},
) {
  const cached = modelCapabilitiesCache.get(
    getProviderCapabilityCacheKey(providerConfig, { outputModalities, userScoped }),
  );

  if (!cached) {
    return null;
  }

  if (maxAgeMs > 0 && Date.now() - cached.cachedAt > maxAgeMs) {
    return null;
  }

  return cached;
}

function getCachedOpenRouterModelToolSupport({
  config = {},
  capability = "chat",
  model = "",
} = {}) {
  const modelId = String(model || "").trim();

  if (!modelId) {
    return {
      checked: false,
      supportsTools: true,
      reason: "missing_model",
    };
  }

  const providerConfig = resolveLlmProviderConfig(config, capability);
  const outputModalities = getModelOutputModalitiesForCapability(capability);
  const cached = getCachedProviderModelCapabilities(providerConfig, { outputModalities, userScoped: true });
  const modelCapability = cached?.modelCapabilities?.get(modelId);

  if (!modelCapability) {
    if (/(^|\/)l3\.1-euryale-70b$/i.test(modelId)) {
      return { checked: true, supportsTools: false, reason: "known_no_tools_model" };
    }
    return {
      checked: false,
      supportsTools: true,
      reason: cached ? "model_not_found" : "cache_miss",
    };
  }

  return {
    checked: true,
    supportsTools: Boolean(modelCapability.supportsTools),
    reason: "cached",
  };
}

function rememberOpenRouterModelToolSupport({
  config = {},
  capability = "chat",
  model = "",
  supportsTools = false,
} = {}) {
  const modelId = String(model || "").trim();

  if (!modelId) {
    return;
  }

  const providerConfig = resolveLlmProviderConfig(config, capability);
  const outputModalities = getModelOutputModalitiesForCapability(capability);
  const cached = getCachedProviderModelCapabilities(
    providerConfig,
    { maxAgeMs: 0, outputModalities, userScoped: true },
  ) || {
    modelIds: new Set(),
    modelCapabilities: new Map(),
  };

  cached.modelIds.add(modelId);
  cached.modelCapabilities.set(modelId, {
    id: modelId,
    canonicalSlug: modelId,
    supportsTools: Boolean(supportsTools),
    supportedParameters: supportsTools ? ["tools"] : [],
  });
  rememberProviderModelCapabilities(providerConfig, cached, { outputModalities, userScoped: true });
}

function clearModelCapabilitiesCache() {
  modelCapabilitiesCache.clear();
}

function getModelCapabilityBadges(config, modelId, capability) {
  const id = String(modelId || "").trim();
  if (!config || !id) return [];

  try {
    const providerConfig = resolveLlmProviderConfig(config, capability);
    const outputModalities = getModelOutputModalitiesForCapability(capability);
    const cached = getCachedProviderModelCapabilities(providerConfig, { outputModalities, userScoped: true });
    if (!cached) return [];
    const modelCapability = cached.modelCapabilities?.get(id);
    if (!modelCapability) return [];

    const inputs = new Set(modelCapability.inputModalities || []);
    const outputs = new Set(modelCapability.outputModalities || []);
    const badges = [];

    if (outputs.has("text")) badges.push("text");
    if (outputs.has("embeddings")) badges.push("embeddings");
    if (inputs.has("image")) badges.push("vision");
    if (inputs.has("audio")) badges.push("audio");
    if (inputs.size > 1) badges.push("multimodal");
    if (modelCapability.supportsTools) badges.push("tools");
    if (outputs.has("text") && !modelCapability.supportsTools) badges.push("text-only");

    return badges;
  } catch (_error) {
    return [];
  }
}

function formatToolSupportWarning(model) {
  return `Heads up: tools cannot be used with ${model}, so Ghostlight will mute GIF and image tools for that model.`;
}

async function fetchAvailableOpenRouterModelMetadata({
  config = {},
  capability = "chat",
  fetchImpl = globalThis.fetch,
  userScoped = true,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch is not available for OpenRouter model validation.");
  }

  const providerConfig = resolveLlmProviderConfig(config, capability);
  const outputModalities = getModelOutputModalitiesForCapability(capability);

  if (!providerConfig.apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing.");
  }

  const response = await fetchImpl(buildModelsUrl(providerConfig.baseURL, { outputModalities, userScoped }), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      Accept: "application/json",
      ...providerConfig.defaultHeaders,
    },
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    const responseMessage = String(payload?.error?.message || payload?.message || "").trim();
    throw new Error(
      responseMessage || `OpenRouter model validation failed with status ${response.status}.`,
    );
  }

  const capabilities = buildModelCapabilities(Array.isArray(payload?.data) ? payload.data : []);
  rememberProviderModelCapabilities(providerConfig, capabilities, { outputModalities, userScoped });

  return capabilities;
}

async function fetchAvailableOpenRouterModelIds(params = {}) {
  const metadata = await fetchAvailableOpenRouterModelMetadata(params);
  return metadata.modelIds;
}

function buildProviderConfigCacheKey(providerConfig = {}, { outputModalities = "", userScoped = true } = {}) {
  return JSON.stringify({
    apiKey: providerConfig.apiKey || "",
    baseURL: providerConfig.baseURL || "",
    defaultHeaders: providerConfig.defaultHeaders || {},
    outputModalities: outputModalities || "",
    scope: userScoped ? "user" : "public",
  });
}

function modelSupportsRequiredInputs(modelCapability = null, requiredInputModalities = []) {
  const required = Array.isArray(requiredInputModalities)
    ? requiredInputModalities.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (!required.length) {
    return true;
  }

  const inputs = new Set(
    Array.isArray(modelCapability?.inputModalities)
      ? modelCapability.inputModalities.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
  );

  return required.every((item) => inputs.has(item));
}

function shouldAllowPublicCatalogFallback(entry = {}) {
  return entry.capability === "embedding";
}

async function getModelMetadataForEntry({
  availableModelIdsByProvider,
  config,
  entry,
  fetchImpl,
  userScoped = true,
}) {
  const providerConfig = resolveLlmProviderConfig(config, entry.capability);
  const outputModalities = getModelOutputModalitiesForCapability(entry.capability);
  const cacheKey = buildProviderConfigCacheKey(providerConfig, { outputModalities, userScoped });

  if (!availableModelIdsByProvider.has(cacheKey)) {
    availableModelIdsByProvider.set(cacheKey, await fetchAvailableOpenRouterModelMetadata({
      config,
      capability: entry.capability,
      fetchImpl,
      userScoped,
    }));
  }

  return availableModelIdsByProvider.get(cacheKey);
}

async function validateChangedModelSettings({
  config = {},
  settings = {},
  fetchImpl = globalThis.fetch,
  logger = null,
}) {
  const changedModels = getChangedModelSettings(config, settings);

  if (!changedModels.length) {
    return {
      checked: false,
      changedModels,
      invalidModels: [],
      unsupportedCapabilityModels: [],
      publicCatalogFallbackModels: [],
      reason: "no_model_changes",
      message: "",
    };
  }

  const availableModelIdsByProvider = new Map();

  try {
    for (const entry of changedModels) {
      const providerConfig = resolveLlmProviderConfig(config, entry.capability);

      if (!providerConfig.apiKey) {
        throw new Error("OPENROUTER_API_KEY is missing.");
      }

      await getModelMetadataForEntry({
        availableModelIdsByProvider,
        config,
        entry,
        fetchImpl,
        userScoped: true,
      });
    }

    const publicCatalogFallbackModels = [];
    const invalidModels = [];

    for (const entry of changedModels) {
      const metadata = await getModelMetadataForEntry({
        availableModelIdsByProvider,
        config,
        entry,
        fetchImpl,
        userScoped: true,
      });

      if (metadata?.modelIds?.has(entry.nextValue)) {
        continue;
      }

      if (shouldAllowPublicCatalogFallback(entry)) {
        const publicMetadata = await getModelMetadataForEntry({
          availableModelIdsByProvider,
          config,
          entry,
          fetchImpl,
          userScoped: false,
        });

        if (publicMetadata?.modelIds?.has(entry.nextValue)) {
          publicCatalogFallbackModels.push(entry);
          continue;
        }
      }

      invalidModels.push(entry);
    }

    const unsupportedToolChatModels = changedModels.filter((entry) => {
      if (entry.capability !== "chat" || invalidModels.includes(entry)) {
        return false;
      }

      const providerConfig = resolveLlmProviderConfig(config, entry.capability);
      const outputModalities = getModelOutputModalitiesForCapability(entry.capability);
      const metadata = availableModelIdsByProvider.get(
        buildProviderConfigCacheKey(providerConfig, { outputModalities }),
      );
      const modelCapability = metadata?.modelCapabilities?.get(entry.nextValue);
      return modelCapability && modelCapability.supportsTools === false;
    });

    const unsupportedCapabilityModels = changedModels.filter((entry) => {
      if (invalidModels.includes(entry)) {
        return false;
      }

      const providerConfig = resolveLlmProviderConfig(config, entry.capability);
      const outputModalities = getModelOutputModalitiesForCapability(entry.capability);
      const metadata = availableModelIdsByProvider.get(
        buildProviderConfigCacheKey(providerConfig, { outputModalities }),
      );
      const modelCapability = metadata?.modelCapabilities?.get(entry.nextValue);
      return modelCapability && !modelSupportsRequiredInputs(
        modelCapability,
        getModelRequiredInputModalitiesForCapability(entry.capability),
      );
    });

    return {
      checked: true,
      changedModels,
      invalidModels,
      unsupportedCapabilityModels,
      unsupportedToolChatModels,
      publicCatalogFallbackModels,
      reason: invalidModels.length || unsupportedCapabilityModels.length ? "invalid_models" : "valid_models",
      message: "",
    };
  } catch (error) {
    logger?.warn?.("[admin] OpenRouter model validation lookup failed", {
      error: error.message,
      changedModels: changedModels.map((entry) => ({
        capability: entry.capability,
        model: entry.nextValue,
      })),
    });

    return {
      checked: false,
      changedModels,
      invalidModels: [],
      unsupportedCapabilityModels: [],
      publicCatalogFallbackModels: [],
      unsupportedToolChatModels: [],
      reason: "validation_lookup_failed",
      message: `OpenRouter model availability could not be checked: ${error.message}`,
    };
  }
}

async function planSettingsSave({
  config = {},
  settings = {},
  fetchImpl = globalThis.fetch,
  logger = null,
}) {
  const modelSettingKeys = MODEL_SETTING_DEFINITIONS.map((definition) => definition.key);
  const { selected: modelSettings, remainder: nonModelSettings } = splitSettingsByKeys(settings, modelSettingKeys);
  const validation = await validateChangedModelSettings({
    config,
    settings: modelSettings,
    fetchImpl,
    logger,
  });

  let settingsToPersist = settings;
  let successMessage = "Saved settings and applied them to the live config.";
  let errorMessage = "";

  if (validation.checked && validation.invalidModels.length) {
    settingsToPersist = nonModelSettings;
    successMessage = Object.keys(nonModelSettings).length
      ? "Saved non-model settings and kept the existing model values."
      : "Kept the existing model values.";
    errorMessage = formatModelValidationError(validation.invalidModels);
  } else if (validation.checked && validation.unsupportedCapabilityModels.length) {
    settingsToPersist = nonModelSettings;
    successMessage = Object.keys(nonModelSettings).length
      ? "Saved non-model settings and kept the existing model values."
      : "Kept the existing model values.";
    errorMessage = formatModelCapabilityError(validation.unsupportedCapabilityModels);
  } else if (!validation.checked && validation.message) {
    errorMessage = validation.message;
  }

  if (!errorMessage && Array.isArray(validation.unsupportedToolChatModels) && validation.unsupportedToolChatModels.length) {
    successMessage = [
      successMessage,
      ...validation.unsupportedToolChatModels.map((entry) => formatToolSupportWarning(entry.nextValue)),
    ].join(" ");
  }

  if (!errorMessage && Array.isArray(validation.publicCatalogFallbackModels) && validation.publicCatalogFallbackModels.length) {
    successMessage = [
      successMessage,
      formatPublicCatalogFallbackWarning(validation.publicCatalogFallbackModels),
    ].join(" ");
  }

  return {
    modelSettings,
    nonModelSettings,
    settingsToPersist,
    successMessage,
    errorMessage,
    validation,
  };
}

module.exports = {
  MODEL_SETTING_DEFINITIONS,
  RECOMMENDED_MODELS,
  buildModelsUserUrl,
  splitSettingsByKeys,
  getChangedModelSettings,
  formatModelValidationError,
  formatModelCapabilityError,
  formatPublicCatalogFallbackWarning,
  expandModelIdAliases,
  buildModelCapabilities,
  fetchAvailableOpenRouterModelMetadata,
  fetchAvailableOpenRouterModelIds,
  getCachedOpenRouterModelToolSupport,
  rememberOpenRouterModelToolSupport,
  clearModelCapabilitiesCache,
  getModelCapabilityBadges,
  formatToolSupportWarning,
  validateChangedModelSettings,
  planSettingsSave,
};
