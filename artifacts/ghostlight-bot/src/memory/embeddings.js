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

async function embedTexts({
  config,
  inputs,
  client: providedClient,
  maxAttempts = 2,
  retryDelayMs = 250,
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
      const response = await client.embeddings.create({
        model,
        input: inputs,
      });

      if (!Array.isArray(response?.data)) {
        throw buildEmbeddingResponseError({ model, response });
      }

      return response.data
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding);
    } catch (error) {
      lastError = error;

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
};
