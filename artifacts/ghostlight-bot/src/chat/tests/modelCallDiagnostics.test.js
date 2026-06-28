const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractUsageMetrics,
  buildRequestSizeSummary,
  buildRequestTokenEstimate,
} = require("../pipeline/callModel");
const { applyPromptBudget } = require("../promptBudget");
const { retrieveMemory } = require("../pipeline/retrieveMemory");

test("extractUsageMetrics captures OpenRouter token and cache fields", () => {
  const metrics = extractUsageMetrics({
    usage: {
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
      input_tokens_details: {
        cache_creation_input_tokens: 40,
        cache_read_input_tokens: 60,
      },
      output_tokens_details: {
        reasoning_tokens: 5,
      },
      cost: 0.0012,
    },
  });

  assert.deepEqual(metrics, {
    promptTokens: 100,
    completionTokens: 25,
    totalTokens: 125,
    cacheCreationInputTokens: 40,
    cacheReadInputTokens: 60,
    reasoningTokens: 5,
    estimatedCost: 0.0012,
  });
});

test("extractUsageMetrics tolerates missing usage", () => {
  assert.equal(extractUsageMetrics(null), null);
  assert.equal(extractUsageMetrics({}), null);
});

test("request char and token summaries are derived from requestShape", () => {
  const requestShape = {
    charCounts: {
      instructionsTotal: 400,
      inputTotal: 80,
      toolSchemas: 20,
    },
  };

  assert.deepEqual(buildRequestSizeSummary(requestShape), {
    instructions: 400,
    input: 80,
    toolSchemas: 20,
  });
  assert.deepEqual(buildRequestTokenEstimate(requestShape), {
    instructions: 100,
    input: 20,
    toolSchemas: 5,
    total: 125,
  });
});

test("prompt budget logs requested and dropped character totals", () => {
  const warnings = [];
  const logger = { warn: (_message, meta) => warnings.push(meta) };
  const large = "x".repeat(3000);

  applyPromptBudget([
    { label: "VOICE RULES", content: large },
    { label: "MEMORIES", content: large },
    ...Array.from({ length: 12 }, (_, index) => ({ label: `SPEAKER ${index}`, content: large })),
  ], { logger, messageId: "m1" });

  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].droppedChars > 0);
  assert.ok(warnings[0].totalRequestedChars > warnings[0].totalKeptChars);
});

test("retrieveMemory logs memory character totals and relevance scores", async () => {
  const logs = [];
  const logger = { debug: (_message, meta) => logs.push(meta) };
  const memory = {
    retrieve: async () => [
      { content: "one", relevance_score: 0.9 },
      { text: "two two", score: 0.7 },
    ],
  };
  const message = {
    id: "m1",
    guildId: "g1",
    channelId: "c1",
    channel: {
      messages: {
        fetch: async () => [],
      },
    },
  };

  const results = await retrieveMemory({
    memory,
    message,
    input: { content: "hello", authorId: "u1" },
    mode: { name: "default" },
    logger,
  });

  assert.equal(results.length, 2);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].memoryCount, 2);
  assert.equal(logs[0].memoryChars, 10);
  assert.deepEqual(logs[0].relevanceScores, [0.9, 0.7]);
});
