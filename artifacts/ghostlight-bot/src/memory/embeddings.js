const { getLlmClient, hasLlmApiKey, resolveEmbeddingModel } = require("../llm/client");

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildEmbeddingResponseError({ model, response }) {
  const providerMessage = String(response?.error?.message || response?.message || "").trim();

  return new Error([
    `Embedding response for ${model || "the configured embedding model"} did not include a data array.`,
    providerMessage ? `Provider message: ${providerMessage}` : "",
  ].filter(Boolean).join(" "));
}

function isRetryableEmbeddingError(error) {
  const message = String(error?.message || error || "");

  return /no successful provider responses|rate limit|temporar|timeout|timed out|overloaded|upstream|provider/i.test(message);
}

function safeEmbeddingReason(error = {}) {
  return String(error?.message || error || "embedding_failed")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .slice(0, 240);
}

async function embedTexts({
  config,
  inputs,
  client: providedClient,
  maxAttempts = 2,
  retryDelayMs = 250,
  logger = console,
}) {
  if (!hasLlmApiKey(config, "embedding")) {
    throw new Error("An embedding-capable LLM API key is required for memory embeddings.");
  }

  if (!inputs.length) {
    return [];
  }

  const client = providedClient || getLlmClient(config, "embedding");
  const model = resolveEmbeddingModel(config);
  const attempts = Math.max(1, Number(maxAttempts) || 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      logger?.info?.("[music:embedding] request", {
        provider: "openrouter",
        model,
        inputLength: inputs.reduce((total, input) => total + String(input || "").length, 0),
      });
      const response = await client.embeddings.create({
        model,
        input: inputs,
      });
      logger?.info?.("[music:embedding] response", {
        provider: "openrouter",
        status: 200,
        ok: Array.isArray(response?.data),
      });

      if (!Array.isArray(response?.data)) {
        throw buildEmbeddingResponseError({ model, response });
      }

      return response.data
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding);
    } catch (error) {
      lastError = error;

      logger?.warn?.("[music:embedding] failed", {
        provider: "openrouter",
        status: Number(error?.status || error?.response?.status || 0) || undefined,
        reason: safeEmbeddingReason(error),
      });

      if (attempt >= attempts || !isRetryableEmbeddingError(error)) {
        throw error;
      }

      if (retryDelayMs > 0) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError || new Error("Embedding request failed.");
}

module.exports = {
  embedTexts,
  isRetryableEmbeddingError,
  safeEmbeddingReason,
};
