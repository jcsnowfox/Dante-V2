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
    userId: "user-1",
    config: { chat: { userId: "user-1" } },
  });

  assert.equal(scope.active, true);
  assert.equal(scope.reason, "channel_user_match");
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

function makeMessage({ channelId, content = "hi", id = "message-1", userId = "user-1" }) {
  return {
    id,
    content,
    channelId,
    guildId: "guild-1",
    createdAt: new Date("2026-06-23T00:00:00.000Z"),
    author: { id: userId, username: "Jenna", globalName: "Jenna" },
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

async function runPipeline({ adultMode, channelId, content = "hi", userId = "user-1", modelText = "normal reply", chatConfig = {}, recentHistory = [] }) {
  const calls = [];
  const createChatPipeline = reloadPipelineWithCallModelSpy(async (args) => {
    calls.push(args);
    return { provider: "test", text: modelText };
  });
  const logger = makeLogger();
  const pipeline = createChatPipeline({
    config: {
      chat: { defaultMode: "default", adultPrivateMode: adultMode, userId: "user-1", ...chatConfig },
      memory: {},
      llm: { romance: { model: "romance-model" } },
      openai: {},
    },
    logger,
    tools: {},
    conversations: {
      recordEvent: async () => {},
      listRecentHistoryByConversationId: async () => recentHistory,
    },
    memory: { retrieve: async () => [] },
  });

  const reply = await pipeline.run({ message: makeMessage({ channelId, content, userId }) });
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

test("configured private channel injects adult prompt but normal model for ordinary chat", async () => {
  const { call } = await runPipeline({
    adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model", systemPrompt: "ADULT CONSENT CONFIRMATION" },
    channelId: "123456789012345678",
  });

  assert.equal(call.systemPromptPrefix, "ADULT CONSENT CONFIRMATION");
  assert.notEqual(call.mode.chatModel, "adult-model");
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


test("wrong user does not activate Adult Private Mode even in configured channel", () => {
  const scope = getAdultPrivateModeScope({
    adultMode: { enabled: true, channelId: "123456789012345678" },
    channelId: "123456789012345678",
    userId: "intruder",
    config: { chat: { userId: "user-1" } },
  });

  assert.equal(scope.active, false);
  assert.equal(scope.reason, "user_mismatch");
  assert.equal(scope.adultChannelMatch, true);
  assert.equal(scope.adultUserMatch, false);
});

test("adult private channel injects adultModeEscalation and logs detection fields", async () => {
  const { call, logger } = await runPipeline({
    adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model", systemPrompt: "ADULT CONSENT CONFIRMATION" },
    channelId: "123456789012345678",
    content: "Come closer, I want you in our private room.",
  });

  assert.notEqual(call.mode.chatModel, "adult-model");
  assert.equal(call.systemPromptPrefix, "ADULT CONSENT CONFIRMATION");
  assert.ok(call.contextSections.some((section) => section.label === "ADULT MODE ESCALATION"));
  assert.ok(logger.entries.some((entry) => entry.some((item) => item && item.adult_escalation_layer_injected === true)));
  assert.ok(logger.entries.some((entry) => entry.some((item) => item && item.explicit_escalation_allowed === true)));
});

test("normal channel does not inject adultModeEscalation", async () => {
  const { call } = await runPipeline({
    adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model", systemPrompt: "ADULT CONSENT CONFIRMATION" },
    channelId: "987654321098765432",
    content: "Come closer",
  });

  assert.equal(call.systemPromptPrefix, null);
  assert.notEqual(call.mode.chatModel, "adult-model");
  assert.ok(!call.contextSections.some((section) => section.label === "ADULT MODE ESCALATION"));
});

test("ordinary explicit adult text does not trigger aftercare; safeword does", async () => {
  const adultMode = { enabled: true, channelId: "123456789012345678", model: "adult-model", safeword: "red", aftercareEnabled: true, aftercarePrompt: "AFTERCARE" };
  const ordinary = await runPipeline({ adultMode, channelId: "123456789012345678", content: "I want explicit intimacy with you." });
  assert.notEqual(ordinary.call.systemPromptPrefix, "AFTERCARE");
  assert.ok(ordinary.call.contextSections.some((section) => section.label === "ADULT MODE ESCALATION"));

  const safeword = await runPipeline({ adultMode, channelId: "123456789012345678", content: "red" });
  assert.equal(safeword.call.systemPromptPrefix, "AFTERCARE");
  assert.ok(!safeword.call.contextSections.some((section) => section.label === "ADULT MODE ESCALATION"));
});

test("consensual adult private-channel output is not sanitized into refusal", async () => {
  const { reply, logger } = await runPipeline({
    adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model", systemPrompt: "ADULT CONSENT CONFIRMATION" },
    channelId: "123456789012345678",
    content: "I want you. Keep going.",
    modelText: "Come here, darling. I want you too.",
  });

  assert.equal(reply.content, "Come here, darling. I want you too.");
  assert.ok(logger.entries.some((entry) => entry.some((item) => item && item.response_sanitized === false)));
});

test("adult-enabled channel + hey babe uses normal model", async () => {
  const { call } = await runPipeline({ adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model" }, channelId: "123456789012345678", content: "hey babe" });
  assert.notEqual(call.mode.chatModel, "adult-model");
});

test("adult-enabled channel + how are you feeling uses normal model", async () => {
  const { call } = await runPipeline({ adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model" }, channelId: "123456789012345678", content: "how are you feeling?" });
  assert.notEqual(call.mode.chatModel, "adult-model");
});

test("adult-enabled channel + I love you uses normal model", async () => {
  const { call } = await runPipeline({ adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model" }, channelId: "123456789012345678", content: "I love you" });
  assert.notEqual(call.mode.chatModel, "adult-model");
});

test("adult-enabled channel + say something normal please uses normal model", async () => {
  const { call } = await runPipeline({ adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model" }, channelId: "123456789012345678", content: "say something normal please" });
  assert.notEqual(call.mode.chatModel, "adult-model");
});

test("adult-enabled channel + explicit sexual request uses adult model", async () => {
  const { call } = await runPipeline({ adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model" }, channelId: "123456789012345678", content: "I want explicit sexual content with you." });
  assert.equal(call.mode.chatModel, "adult-model");
});

test("adult-enabled channel + explicit roleplay uses adult model", async () => {
  const { call } = await runPipeline({ adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model" }, channelId: "123456789012345678", content: "Let's roleplay an explicit erotic scene." });
  assert.equal(call.mode.chatModel, "adult-model");
});

test("adult-enabled channel + normal message after explicit exchange switches back to normal model", async () => {
  const { call } = await runPipeline({
    adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model" },
    channelId: "123456789012345678",
    content: "are you okay?",
    recentHistory: [{ role: "user", content: "I want explicit sexual content with you." }],
  });
  assert.notEqual(call.mode.chatModel, "adult-model");
});

test("FORCE_DEFAULT_CHAT_MODEL=true always uses normal model", async () => {
  const { call } = await runPipeline({
    adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model" },
    channelId: "123456789012345678",
    content: "I want explicit sexual content with you.",
    chatConfig: { forceDefaultChatModel: true },
  });
  assert.notEqual(call.mode.chatModel, "adult-model");
});

test("ADULT_MODEL_ROUTING_MODE=channel preserves old behavior only if explicitly set", async () => {
  const { call } = await runPipeline({
    adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model" },
    channelId: "123456789012345678",
    content: "hey babe",
    chatConfig: { adultModelRoutingMode: "channel" },
  });
  assert.equal(call.mode.chatModel, "adult-model");
});

test("Adult permission false never uses adult model", async () => {
  const { call } = await runPipeline({ adultMode: { enabled: true, channelId: "123456789012345678", model: "adult-model" }, channelId: "987654321098765432", content: "I want explicit sexual content with you." });
  assert.notEqual(call.mode.chatModel, "adult-model");
});
