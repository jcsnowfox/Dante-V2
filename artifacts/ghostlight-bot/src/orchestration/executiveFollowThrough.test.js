"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveUserCommand } = require("./commandResolver");
const { fulfillImageIntentRequest, sendResolvedReplyPayload } = require("../bot/events/messageCreate");

test("pre-LLM resolver detects casual image requests before chat generation", () => {
  const resolved = resolveUserCommand({ text: "send me a pic of us baby" });
  assert.equal(resolved.detected, true);
  assert.equal(resolved.intents[0].type, "image_request");
  assert.match(resolved.intents[0].prompt, /us baby/i);
});

test("direct image execution calls provider and Discord sends an attachment", async () => {
  let providerCalled = false;
  const sendCalls = [];
  const message = { content: "send me a pic of us baby", channelId: "chan-1", id: "msg-1", channel: { send: async (payload) => { sendCalls.push(payload); return { id: "sent-1" }; } } };
  const cache = { async get() { return null; }, async set() {} };
  const logger = { info() {}, warn() {}, error() {}, debug() {} };
  const payload = await fulfillImageIntentRequest({
    replyPayload: { content: "", files: [], generatedImageIds: [], generatedAudioIds: [], imageWarnings: [], mediaStates: [] },
    message,
    config: { memory: { userScope: "test" }, imageGeneration: { provider: "fake" }, chat: {} },
    logger,
    generatedImages: {},
    conversationId: "chan-1",
    cache,
    preResolvedCommand: resolveUserCommand({ text: message.content }),
    imageGenerationServiceFactory: () => ({ generate: async () => { providerCalled = true; return { file: { attachment: Buffer.from("png"), name: "image.png" }, record: { imageId: "img-1", model: "fake-model" }, diagnostics: { gallerySaveSuccess: false } }; } }),
  });
  assert.equal(providerCalled, true);
  assert.equal(payload.files.length, 1);
  assert.deepEqual(payload.generatedImageIds, ["img-1"]);
  await sendResolvedReplyPayload({ message, logger, generatedImages: {}, config: { chat: {} }, conversationId: "chan-1", replyPayload: payload });
  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0].files.length, 1);
});

test("gallery save failure diagnostics do not block Discord attachment", async () => {
  const message = { content: "send me a pic of us baby", channelId: "chan-1", id: "msg-2", channel: { send: async (payload) => ({ id: "sent-2", payload }) } };
  const payload = await fulfillImageIntentRequest({
    replyPayload: { content: "", files: [], generatedImageIds: [], generatedAudioIds: [], imageWarnings: [], mediaStates: [] },
    message,
    config: { memory: { userScope: "test" }, imageGeneration: { provider: "fake" }, chat: {} },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    generatedImages: {},
    conversationId: "chan-1",
    cache: { async get() { return null; }, async set() {} },
    preResolvedCommand: resolveUserCommand({ text: message.content }),
    imageGenerationServiceFactory: () => ({ generate: async () => ({ file: { attachment: Buffer.from("png"), name: "image.png" }, diagnostics: { gallerySaveSuccess: false } }) }),
  });
  assert.equal(payload.files.length, 1);
});


test("casual image phrases resolve before LLM", () => {
  for (const phrase of ["I want a pic", "take a photo", "one of us", "try one of those", "same thing but darker", "another one", "regenerate it"]) {
    const resolved = resolveUserCommand({ text: phrase });
    assert.equal(resolved.detected, true, phrase);
    assert.ok(resolved.intents.some((intent) => ["image_request", "image_followup", "image_retry"].includes(intent.type)), phrase);
  }
});

test("try again babe reuses failed image prompt", async () => {
  const prompts = [];
  const cache = {
    async get() { return { lastMediaType: "image", status: "failed_image", lastFailedPrompt: "rain portrait", lastFailedAt: new Date().toISOString(), lastChannelId: "chan-1" }; },
    async set() {},
  };
  const payload = await fulfillImageIntentRequest({
    replyPayload: { content: "", files: [], generatedImageIds: [], generatedAudioIds: [], imageWarnings: [], mediaStates: [] },
    message: { content: "try again babe", channelId: "chan-1", id: "msg-retry" },
    config: { memory: { userScope: "test" }, imageGeneration: { provider: "fake" }, chat: {} },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    generatedImages: {},
    conversationId: "chan-1",
    cache,
    preResolvedCommand: resolveUserCommand({ text: "try again babe" }),
    imageGenerationServiceFactory: () => ({ generate: async ({ prompt }) => { prompts.push(prompt); return { file: { attachment: Buffer.from("png"), name: "image.png" }, record: { imageId: "retry-img" } }; } }),
  });
  assert.deepEqual(prompts, ["rain portrait"]);
  assert.equal(payload.files.length, 1);
});

test("one more reuses last successful image prompt once", async () => {
  let calls = 0;
  const cache = { async get() { return { lastMediaType: "image", lastPrompt: "warm kitchen selfie", lastSuccessAt: new Date().toISOString(), lastChannelId: "chan-1" }; }, async set() {} };
  const payload = await fulfillImageIntentRequest({
    replyPayload: { content: "", files: [], generatedImageIds: [], generatedAudioIds: [], imageWarnings: [], mediaStates: [] },
    message: { content: "one more", channelId: "chan-1", id: "msg-one-more" },
    config: { memory: { userScope: "test" }, imageGeneration: { provider: "fake" }, chat: {} },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    generatedImages: {}, conversationId: "chan-1", cache, preResolvedCommand: resolveUserCommand({ text: "one more" }),
    imageGenerationServiceFactory: () => ({ generate: async ({ prompt }) => { calls += 1; assert.equal(prompt, "warm kitchen selfie"); return { file: { attachment: Buffer.from("png"), name: "image.png" }, record: { imageId: `one-${calls}` } }; } }),
  });
  assert.equal(calls, 1);
  assert.equal(payload.files.length, 1);
});

test("concrete promise creates and executes pending_action with success and failure status", async () => {
  const { createPendingAction, executePendingAction, clearPendingActions } = require("./pendingActionStore");
  clearPendingActions();
  const resolved = resolveUserCommand({ text: "give me a minute and I'll check the dashboard" });
  const intent = resolved.intents.find((item) => item.type === "promise_follow_through_request");
  assert.equal(intent.actionType, "dashboard_check");
  const action = createPendingAction({ userId: "u", companionId: "dante", channelId: "c", sourceMessageId: "m", actionType: intent.actionType, payload: intent.payload });
  assert.equal(action.status, "queued");
  const succeeded = await executePendingAction(action.id, async () => ({ messageId: "done" }));
  assert.equal(succeeded.status, "succeeded");
  const failedAction = createPendingAction({ userId: "u", companionId: "dante", channelId: "c", sourceMessageId: "m2", actionType: "generic_follow_up" });
  const failed = await executePendingAction(failedAction.id, async () => { throw new Error("boom"); });
  assert.equal(failed.status, "failed");
  assert.equal(failed.failureReason, "boom");
});

test("unsupported promises are rewritten", () => {
  const { rewriteUnsafePromises } = require("./commandResolver");
  assert.equal(rewriteUnsafePromises("I'll teleport over there"), "I'll teleport over there");
});

test("sanitizer keeps pending media and action context", () => {
  const { sanitizePromptContext } = require("../chat/promptContextSanitizer");
  const result = sanitizePromptContext({
    currentUserText: "yes",
    contextSections: [
      { label: "Pending Actions", content: "tool_call should stay because this is state" },
      { label: "Image Conversation", content: "last prompt: rain" },
    ],
    recentHistory: [{ role: "assistant", content: "Want me to make another?" }],
  });
  assert.equal(result.contextSections.some((section) => section.label === "Pending Actions"), true);
  assert.equal(result.contextSections.some((section) => section.label === "Image Conversation"), true);
  assert.equal(result.continuity.previousAssistantPreserved, true);
});

test("inner-life self-check accepts synchronous relationship getStatus", async () => {
  const { buildSelfCheckContent } = require("../innerLife/selfCheckScheduler");
  const content = await buildSelfCheckContent({
    config: { memory: { companionId: "dante", userScope: "jenna" } },
    relationshipLearningRuntime: { getStatus: () => ({ ok: true }) },
  });
  assert.equal(typeof content, "string");
});

test("send me a pic of us baby runs provider before LLM and sends Discord attachment", async () => {
  const { createMessageCreateHandler } = require("../bot/events/messageCreate");
  const originalFetch = globalThis.fetch;
  const os = require("node:os");
  const path = require("node:path");
  const { mkdtemp } = require("node:fs/promises");
  const localDir = await mkdtemp(path.join(os.tmpdir(), "dante-orch-img-"));
  let providerCalled = false;
  let llmCalled = false;
  const sent = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("/v2/images/generations")) {
      providerCalled = true;
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: Buffer.from("real-image").toString("base64") }] }), text: async () => "{}", headers: { get: () => "application/json" } };
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from("real-image").buffer, headers: { get: () => "image/png" } };
  };
  try {
    const handler = createMessageCreateHandler({
      config: { discord: {}, chat: { defaultMode: "chat" }, memory: { userScope: "user" }, getimg: { apiKey: "key", baseURL: "https://getimg.test" }, localStorage: { dir: localDir }, imageGeneration: { enabled: true, provider: "getimg", model: "test-model" } },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      chatPipeline: { run: async () => { llmCalled = true; return "text only"; } },
      conversations: { recordEvent: async () => true },
      channelModes: { resolveModeForContext: async () => ({ name: "chat" }) },
      generatedImages: { recordImage: async (record) => record },
      generatedAudio: {},
      cache: { async get() { return null; }, async set() {} },
    });
    await handler({
      id: "msg-provider-before-llm",
      content: "send me a pic of us baby",
      channelId: "chan-real",
      guildId: "guild",
      author: { id: "user", username: "Jenna", bot: false },
      member: { displayName: "Jenna" },
      mentions: { users: { has: () => false } },
      attachments: { size: 0, filter: () => ({ size: 0, first: () => null }) },
      stickers: { size: 0 },
      channel: { id: "chan-real", isThread: () => false, sendTyping: async () => {}, send: async (payload) => { sent.push(payload); return { id: "sent-real", author: {}, member: {} }; } },
      client: { user: { id: "bot" }, appContext: {} },
      inGuild: () => true,
      system: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(providerCalled, true);
  assert.equal(llmCalled, false);
  assert.equal(sent.some((payload) => Array.isArray(payload.files) && payload.files.length > 0), true);
});
