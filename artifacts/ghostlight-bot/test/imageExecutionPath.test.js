"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { mkdtemp } = require("node:fs/promises");
const { createImageGenerationService } = require("../src/images/generateImage");
const { createMessageCreateHandler } = require("../src/bot/events/messageCreate");
const { getLastImageRequestDiagnostics } = require("../src/images/imageRequestDiagnostics");

function responseJson(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => "image/png" } };
}

function responseBytes(bytes, status = 200) {
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => Buffer.from(bytes).buffer, headers: { get: () => "image/png" } };
}

async function createImageConfig() {
  return {
    memory: { userScope: "user" },
    getimg: { apiKey: "key", baseURL: "https://getimg.test" },
    localStorage: { dir: await mkdtemp(path.join(os.tmpdir(), "dante-img-")) },
    imageGeneration: { enabled: true, provider: "getimg", model: "test-model", resolution: "1K" },
  };
}

async function generateWithProviderPayload(payload, extra = {}) {
  const calls = [];
  const config = await createImageConfig();
  const service = createImageGenerationService({
    config,
    logger: {},
    generatedImages: { recordImage: extra.recordImage || (async (record) => record) },
    createThumbnail: async () => Buffer.from("thumb"),
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("/v2/images/generations")) return responseJson(payload);
      return responseBytes(Buffer.from("downloaded-image"));
    },
  });
  return { result: await service.generate({ prompt: "rain portrait", context: { userScope: "user" } }), calls };
}

test("provider returns URL -> Discord attachment object is normalized", async () => {
  const { result, calls } = await generateWithProviderPayload({ data: [{ url: "https://cdn.test/image.png" }] });
  assert.equal(result.file.name.endsWith(".png"), true);
  assert.equal(Buffer.isBuffer(result.file.attachment), true);
  assert.equal(result.file.attachment.length > 0, true);
  assert.equal(calls.includes("https://cdn.test/image.png"), true);
});

test("provider returns base64 -> Discord attachment object is normalized", async () => {
  const { result } = await generateWithProviderPayload({ data: [{ b64_json: Buffer.from("base64-image").toString("base64") }] });
  assert.equal(Buffer.isBuffer(result.file.attachment), true);
  assert.equal(result.file.attachment.toString(), "base64-image");
});

test("provider returns bytes -> Discord attachment object is normalized", async () => {
  const bytes = Array.from(Buffer.from("byte-image"));
  const { result } = await generateWithProviderPayload({ images: [{ bytes }] });
  assert.equal(Buffer.isBuffer(result.file.attachment), true);
  assert.equal(result.file.attachment.toString(), "byte-image");
});

test("gallery save failure does not block Discord attachment", async () => {
  const { result } = await generateWithProviderPayload(
    { data: [{ b64_json: Buffer.from("gallery-fails").toString("base64") }] },
    { recordImage: async () => { throw new Error("db down"); } },
  );
  assert.equal(Buffer.isBuffer(result.file.attachment), true);
  assert.equal(result.record.status, "completed");
});

function createDiscordMessage({ content = "send me a pic", sendImpl }) {
  return {
    id: `msg-${Math.random()}`,
    content,
    channelId: "channel-1",
    guildId: "guild-1",
    author: { id: "user-1", username: "Jenna", bot: false },
    mentions: { has: () => false, users: { has: () => false } },
    attachments: { size: 0, filter: () => ({ size: 0, first: () => null }) },
    stickers: { size: 0 },
    channel: { id: "channel-1", isThread: () => false, sendTyping: async () => {}, send: sendImpl },
    client: { user: { id: "bot-1" }, appContext: {} },
    inGuild: () => true,
    system: false,
  };
}

function createHandlerHarness({ reply, sendImpl }) {
  const sent = [];
  const handler = createMessageCreateHandler({
    config: { discord: {}, chat: { defaultMode: "chat" }, memory: { userScope: "user" }, imageGeneration: { provider: "test-provider", model: "test-model" } },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    chatPipeline: { run: async () => reply },
    conversations: { recordEvent: async () => true },
    channelModes: { resolveModeForContext: async () => ({ name: "chat" }) },
    generatedImages: {},
    generatedAudio: {},
    cache: null,
  });
  const message = createDiscordMessage({
    content: "send me a pic of us baby",
    sendImpl: sendImpl || (async (payload) => { sent.push(payload); return { id: `sent-${sent.length}`, author: {}, member: {} }; }),
  });
  return { handler, message, sent };
}

test("send me a pic of us baby sends an actual Discord attachment", async () => {
  const { handler, message, sent } = createHandlerHarness({
    reply: { content: "Here is the photo.", files: [{ attachment: Buffer.from("img"), name: "image.png" }], generatedImageIds: ["img-1"] },
  });
  await handler(message);
  assert.equal(sent.some((payload) => Array.isArray(payload.files) && payload.files.length > 0), true);
});

test("provider succeeds but Discord upload fails -> clear upload failure", async () => {
  const sent = [];
  let first = true;
  const { handler, message } = createHandlerHarness({
    reply: { content: "Here is the photo.", files: [{ attachment: Buffer.from("img"), name: "image.png" }], generatedImageIds: ["img-1"] },
    sendImpl: async (payload) => {
      sent.push(payload);
      if (first) { first = false; throw new Error("upload failed"); }
      return { id: "fallback", author: {}, member: {} };
    },
  });
  await handler(message);
  assert.equal(sent.at(-1).content, "The image generated, but Discord upload failed.");
});

test("image request status is queryable in diagnostics", async () => {
  const { fulfillImageIntentRequest } = require("../src/bot/events/messageCreate");
  await fulfillImageIntentRequest({
    replyPayload: { content: "Image prompt: rain", files: [], generatedImageIds: [] },
    message: { content: "send me a pic", channelId: "channel-1", id: "msg-diag" },
    config: { memory: { userScope: "user" }, imageGeneration: { provider: "test-provider", model: "test-model" } },
    logger: {},
    generatedImages: {},
    conversationId: "conv-diag",
    imageGenerationServiceFactory: () => ({ generate: async () => ({ file: { attachment: Buffer.from("img"), name: "image.png" }, record: { imageId: "diag-img", model: "test-model" }, diagnostics: { providerResponseSummary: { hasBytes: true }, gallerySaveSuccess: true } }) }),
  });
  const last = getLastImageRequestDiagnostics();
  assert.equal(last.discord_media_path_used, true);
  assert.equal(last.status, "provider_succeeded");
});


test("Discord image fallback generation uses the Discord media surface, not dashboard/call", async () => {
  let capturedContext = null;
  const { fulfillImageIntentRequest } = require("../src/bot/events/messageCreate");
  await fulfillImageIntentRequest({
    replyPayload: { content: "Image prompt: candlelit portrait", files: [], generatedImageIds: [] },
    message: { content: "send me a pic", channelId: "channel-1", id: "msg-discord-surface" },
    config: { memory: { userScope: "user" }, imageGeneration: { provider: "test-provider", model: "test-model" } },
    logger: {},
    generatedImages: {},
    conversationId: "conv-discord",
    imageGenerationServiceFactory: () => ({
      generate: async ({ context }) => {
        capturedContext = context;
        return { file: { attachment: Buffer.from("img"), name: "image.png" }, record: { imageId: "discord-img", model: "test-model" } };
      },
    }),
  });
  assert.equal(capturedContext.sourceSurface, "discord");
});

test("empty model reply sends a clean no-reply fallback instead of dropping the turn", async () => {
  const { handler, message, sent } = createHandlerHarness({
    reply: { content: "", files: [], generatedImageIds: [] },
  });
  message.content = "hello there";
  await handler(message);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /came out empty|answer clean/i);
});
