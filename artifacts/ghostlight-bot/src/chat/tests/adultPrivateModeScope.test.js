const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const pipelinePath = path.resolve(__dirname, "../createChatPipeline.js");
const callModelPath = path.resolve(__dirname, "../pipeline/callModel.js");
const replyFallbacksPath = path.resolve(__dirname, "../../continuity/replyFallbacks.js");
const { getAdultPrivateModeScope } = require(pipelinePath);

test("adult mode enabled + blank Private Channel ID + normal channel message stays normal", () => {
  const scope = getAdultPrivateModeScope({
    adultMode: { enabled: true, channelId: "   ", model: "adult-model" },
    channelId: "987654321098765432",
  });

  assert.equal(scope.active, false);
  assert.equal(scope.reason, "missing_private_channel");
});

test("adult mode enabled + configured private channel + same channel activates private confirmation scope", () => {
  const scope = getAdultPrivateModeScope({
    adultMode: { enabled: true, channelId: "123456789012345678" },
    channelId: "123456789012345678",
  });

  assert.equal(scope.active, true);
  assert.equal(scope.reason, "channel_match");
});

test("adult mode enabled + invalid Private Channel ID stays normal", () => {
  const scope = getAdultPrivateModeScope({
    adultMode: { enabled: true, channelId: "not-a-discord-channel-id" },
    channelId: "987654321098765432",
  });

  assert.equal(scope.active, false);
  assert.equal(scope.reason, "invalid_private_channel");
});

test("adult mode enabled + configured private channel + different channel stays normal", () => {
  const scope = getAdultPrivateModeScope({
    adultMode: { enabled: true, channelId: "123456789012345678" },
    channelId: "987654321098765432",
  });

  assert.equal(scope.active, false);
  assert.equal(scope.reason, "channel_mismatch");
});

function reloadPipelineWithCallModelSpy(spy) {
  // Clear both pipeline and replyFallbacks so the in-memory dedup store resets
  delete require.cache[pipelinePath];
  delete require.cache[replyFallbacksPath];
  require.cache[callModelPath] = {
    id: callModelPath,
    filename: callModelPath,
    loaded: true,
    exports: { callModel: spy },
  };
  return require(pipelinePath).createChatPipeline;
}

function makeLogger() {
  const entries = [];
  return {
    entries,
    debug: (...args) => entries.push(["debug", ...args]),
    info: (...args) => entries.push(["info", ...args]),
    warn: (...args) => entries.push(["warn", ...args]),
    error: (...args) => entries.push(["error", ...args]),
  };
}

function makeMessage({ channelId, content = "hi", id = "message-1" }) {
  return {
    id,
    content,
    channelId,
    guildId: "guild-1",
    createdAt: new Date("2026-06-23T00:00:00.000Z"),
    author: { id: "user-1", username: "Jenna", globalName: "Jenna" },
    member: { displayName: "Jenna" },
    client: { user: { id: "bot-1" } },
    channel: {
      id: channelId,
      name: channelId,
      isThread: () => false,
      isDMBased: () => false,
    },
    attachments: [],
  };
}

async function runPipeline({ adultMode, channelId, content = "hi" }) {
  const calls = [];
  const createChatPipeline = reloadPipelineWithCallModelSpy(async (args) => {
    calls.push(args);
    return { provider: "test", text: "normal reply" };
  });
  const logger = makeLogger();
  const pipeline = createChatPipeline({
    config: {
      chat: { defaultMode: "default", adultPrivateMode: adultMode },
      memory: {},
      llm: { romance: { model: "romance-model" } },
      openai: {},
    },
    logger,
    tools: {},
    conversations: {
      recordEvent: async () => {},
      listRecentHistoryByConversationId: async () => [],
    },
    memory: { retrieve: async () => [] },
  });

  const reply = await pipeline.run({ message: makeMessage({ channelId, content }) });
  return { reply, call: calls[0], logger };
}

test("blank Private Channel ID does not inject adult prompt or adult model, and logs warning", async () => {
  const { reply, call, logger } = await runPipeline({
    adultMode: { enabled: true, channelId: "", model: "adult-model", systemPrompt: "ADULT CONSENT CONFIRMATION" },
    channelId: "987654321098765432",
  });

  assert.equal(reply.content, "normal reply");
  assert.equal(call.systemPromptPrefix, null);
  assert.notEqual(call.mode.chatModel, "adult-model");
  assert.ok(logger.entries.some((entry) => String(entry[1]).includes("enabled but no private channel configured")));
  assert.ok(logger.entries.some((entry) => String(entry[1]).includes("active=false reason=missing_private_channel")));
});

test("configured private channel injects adult prompt and adult model only in that channel", async () => {
  const { call } = await runPipeline({
    adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model", systemPrompt: "ADULT CONSENT CONFIRMATION" },
    channelId: "123456789012345678",
  });

  assert.equal(call.systemPromptPrefix, "ADULT CONSENT CONFIRMATION");
  assert.equal(call.mode.chatModel, "adult-model");
});

test("different channel does not inject adult prompt or adult model", async () => {
  const { reply, call, logger } = await runPipeline({
    adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model", systemPrompt: "ADULT CONSENT CONFIRMATION" },
    channelId: "987654321098765432",
  });

  assert.equal(reply.content, "normal reply");
  assert.equal(call.systemPromptPrefix, null);
  assert.notEqual(call.mode.chatModel, "adult-model");
  assert.ok(logger.entries.some((entry) => String(entry[1]).includes("active=false reason=channel_mismatch")));
});

test("after safeword/aftercare, adult handling still only applies in private channel", async () => {
  const adultMode = {
    enabled: true,
    channelId: "123456789012345678",
    model: "adult-model",
    safeword: "red",
    aftercareEnabled: true,
    aftercarePrompt: "AFTERCARE ONLY IN PRIVATE CHANNEL",
  };

  const outside = await runPipeline({ adultMode, channelId: "987654321098765432", content: "red" });
  assert.equal(outside.call.systemPromptPrefix, null);
  assert.notEqual(outside.call.mode.chatModel, "adult-model");

  const inside = await runPipeline({ adultMode, channelId: "123456789012345678", content: "red" });
  assert.equal(inside.call.systemPromptPrefix, "AFTERCARE ONLY IN PRIVATE CHANNEL");
});
