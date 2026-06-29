"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildChatRequest } = require("../pipeline/buildChatRequest");
const { buildSystemPrompt } = require("../prompt/buildSystemPrompt");
const { isReplySafeModeEnabled } = require("../createChatPipeline");

const config = {
  chat: { promptBlocks: { personaName: "Dante", userName: "Jenna" }, includeTimeContext: false },
  imageGeneration: {}, audio: {}, giphy: {}, spotify: {}, openai: {}, llm: {},
};
const mode = { name: "default", historyLimit: 5 };
const tools = { list: () => [{ name: "search_memories" }] };

test("REPLY_SAFE_MODE strips history, memories, context, time, and tools from normal request", () => {
  const { request } = buildChatRequest({
    config,
    mode,
    input: { content: "how are you feeling babe", messageTimestamp: "2026-06-29T00:00:00.000Z" },
    recentHistory: [{ role: "assistant", content: "Dating toolbox NewReader feed tickets" }],
    memories: [{ content: "private memory" }],
    contextSections: [{ label: "JOURNAL", content: "journal text" }, { label: "WEB SEARCH RESULTS", content: "web text" }],
    tools,
    selectedModel: "test-model",
    replySafeMode: true,
  });

  assert.match(request.instructions, /REPLY SAFE MODE/);
  assert.doesNotMatch(request.instructions, /journal text|web text|private memory|Available tool count/);
  assert.equal(request.input.length, 1);
  assert.equal(request.input[0].content[0].text, "how are you feeling babe");
  assert.equal(request.tools, undefined);
});

test("Dante prompt forbids incoherent fragments and internal context blending", () => {
  const prompt = buildSystemPrompt({ config, mode });
  assert.match(prompt, /coherent fragments/);
  assert.match(prompt, /Never output disconnected noun clusters/);
  assert.match(prompt, /Never blend private\/internal context/);
  assert.match(prompt, /ignore it and answer the current user simply/);
});

test("reply safe mode can be enabled from config", () => {
  assert.equal(isReplySafeModeEnabled({ chat: { replySafeMode: true } }), true);
  assert.equal(isReplySafeModeEnabled({ chat: { replySafeMode: false } }), false);
});
