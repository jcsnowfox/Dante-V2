"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  extractEmbeddableGifUrls,
  removeUrlsFromText,
  splitTextIntoChunks,
} = require("./messageCreate");

describe("Discord GIF reply preparation", () => {
  it("extracts direct GIF URLs even when the model leaves text above them", () => {
    const text = [
      "Now — water sips AND stomach update. I'm not forgetting 👀",
      "https://media2.giphy.com/media/v1.Y2lkPTdiYWM.../giphy.gif",
    ].join("\n");

    assert.deepEqual(extractEmbeddableGifUrls(text), [
      "https://media2.giphy.com/media/v1.Y2lkPTdiYWM.../giphy.gif",
    ]);
  });

  it("removes extracted GIF URLs from visible message text before sending embeds", () => {
    const gifUrl = "https://media2.giphy.com/media/abc/giphy.gif";
    const text = `There it is.\n${gifUrl}`;

    assert.equal(removeUrlsFromText(text, [gifUrl]), "There it is.");
  });

  it("does not leave a standalone GIF URL chunk after embed extraction", () => {
    const gifUrl = "https://media2.giphy.com/media/abc/giphy.gif";
    const text = removeUrlsFromText(`There it is.\n${gifUrl}`, [gifUrl]);

    assert.deepEqual(splitTextIntoChunks(text), ["There it is."]);
  });
});

const { fulfillImageIntentRequest } = require("./messageCreate");

function createReplyPayload(overrides = {}) {
  return {
    content: "",
    suppressEmbeds: false,
    files: [],
    generatedImageIds: [],
    generatedAudioIds: [],
    imageWarnings: [],
    ...overrides,
  };
}

function createMemoryCache(initialState = null) {
  let value = initialState;
  return {
    async get() { return value; },
    async set(_key, next) { value = next; },
    get value() { return value; },
  };
}

function createImageServiceFactory({ failAt = [] } = {}) {
  const calls = [];
  return {
    calls,
    factory: () => ({
      async generate({ prompt }) {
        const index = calls.length + 1;
        calls.push({ prompt });
        if (failAt.includes(index)) {
          throw new Error(`provider failed ${index}`);
        }
        return {
          record: { imageId: `img-${index}`, model: "test-model" },
          image: { imageId: `img-${index}`, model: "test-model" },
          file: { attachment: Buffer.from(`image-${index}`), name: `image-${index}.png` },
        };
      },
    }),
  };
}

function createImageTestConfig(overrides = {}) {
  return {
    memory: { userScope: "user" },
    imageGeneration: {
      provider: "test-provider",
      model: "test-model",
      maxBatchCount: 4,
      followupWindowMinutes: 30,
      ...overrides,
    },
  };
}

function createMessage(content) {
  return { content, channelId: "channel-1", id: "message-1" };
}

const lastImageState = {
  active: true,
  status: "generated_image",
  lastMediaType: "image",
  lastPrompt: "a rainy neon portrait",
  lastProvider: "test-provider",
  lastModel: "test-model",
  lastStyle: "cinematic",
  lastAppearancePreset: "Dante",
  lastSuccessAt: new Date().toISOString(),
  lastGeneratedAt: new Date().toISOString(),
  lastChannelId: "channel-1",
  lastMessageId: "previous-message",
};

describe("image media follow-up routing", () => {
  it('after one image succeeds, "send two more" generates 2 more without recreating the prompt', async () => {
    const cache = createMemoryCache(lastImageState);
    const service = createImageServiceFactory();
    const result = await fulfillImageIntentRequest({
      replyPayload: createReplyPayload({ content: "text-only complaint should be overridden" }),
      message: createMessage("send two more"),
      config: createImageTestConfig(),
      logger: {},
      generatedImages: null,
      conversationId: "conversation-1",
      cache,
      imageGenerationServiceFactory: service.factory,
    });

    assert.equal(result.files.length, 2);
    assert.deepEqual(result.generatedImageIds, ["img-1", "img-2"]);
    assert.deepEqual(service.calls.map((call) => call.prompt), ["a rainy neon portrait", "a rainy neon portrait"]);
  });

  it('"make another" generates 1 more', async () => {
    const service = createImageServiceFactory();
    const result = await fulfillImageIntentRequest({
      replyPayload: createReplyPayload(),
      message: createMessage("make another"),
      config: createImageTestConfig(),
      logger: {},
      generatedImages: null,
      conversationId: "conversation-1",
      cache: createMemoryCache(lastImageState),
      imageGenerationServiceFactory: service.factory,
    });

    assert.equal(result.files.length, 1);
  });

  it('"give me a few more" generates 3 more', async () => {
    const service = createImageServiceFactory();
    const result = await fulfillImageIntentRequest({
      replyPayload: createReplyPayload(),
      message: createMessage("give me a few more"),
      config: createImageTestConfig(),
      logger: {},
      generatedImages: null,
      conversationId: "conversation-1",
      cache: createMemoryCache(lastImageState),
      imageGenerationServiceFactory: service.factory,
    });

    assert.equal(result.files.length, 3);
  });

  it("missing last media state asks user what image they want", async () => {
    const service = createImageServiceFactory();
    const result = await fulfillImageIntentRequest({
      replyPayload: createReplyPayload({ content: "I can't do that." }),
      message: createMessage("send two more"),
      config: createImageTestConfig(),
      logger: {},
      generatedImages: null,
      conversationId: "conversation-1",
      cache: createMemoryCache(null),
      imageGenerationServiceFactory: service.factory,
    });

    assert.equal(service.calls.length, 0);
    assert.match(result.content, /what image/i);
  });

  it("partial provider failure sends successful images and reports failures", async () => {
    const service = createImageServiceFactory({ failAt: [2] });
    const result = await fulfillImageIntentRequest({
      replyPayload: createReplyPayload(),
      message: createMessage("give me a few more"),
      config: createImageTestConfig(),
      logger: {},
      generatedImages: null,
      conversationId: "conversation-1",
      cache: createMemoryCache(lastImageState),
      imageGenerationServiceFactory: service.factory,
    });

    assert.equal(result.files.length, 2);
    assert.deepEqual(result.generatedImageIds, ["img-1", "img-3"]);
    assert.match(result.content, /2 images, but 1 failed/i);
  });

  it("count is capped by IMAGE_MAX_BATCH_COUNT", async () => {
    const service = createImageServiceFactory();
    const result = await fulfillImageIntentRequest({
      replyPayload: createReplyPayload(),
      message: createMessage("send 9 more"),
      config: createImageTestConfig({ maxBatchCount: 4 }),
      logger: {},
      generatedImages: null,
      conversationId: "conversation-1",
      cache: createMemoryCache(lastImageState),
      imageGenerationServiceFactory: service.factory,
    });

    assert.equal(result.files.length, 4);
  });

  it("all successful images are returned for gallery persistence", async () => {
    const service = createImageServiceFactory();
    const result = await fulfillImageIntentRequest({
      replyPayload: createReplyPayload(),
      message: createMessage("send two more"),
      config: createImageTestConfig(),
      logger: {},
      generatedImages: null,
      conversationId: "conversation-1",
      cache: createMemoryCache(lastImageState),
      imageGenerationServiceFactory: service.factory,
    });

    assert.deepEqual(result.generatedImageIds, ["img-1", "img-2"]);
  });
});

describe("image identity request resolution", () => {
  it('"photo of me and you having coffee" resolves Jenna + Dante + coffee and sends an attachment', async () => {
    const service = createImageServiceFactory();
    const result = await fulfillImageIntentRequest({
      replyPayload: createReplyPayload(),
      message: createMessage("photo of me and you having coffee"),
      config: createImageTestConfig(),
      logger: {},
      generatedImages: null,
      conversationId: "conversation-identity-1",
      cache: createMemoryCache(null),
      imageGenerationServiceFactory: service.factory,
    });

    assert.equal(result.files.length, 1);
    assert.match(service.calls[0].prompt, /Jenna/);
    assert.match(service.calls[0].prompt, /Dante Sølvane/);
    assert.match(service.calls[0].prompt, /coffee/);
  });

  it('"photo of me you" resolves Jenna + Dante instead of abstract AI art', async () => {
    const service = createImageServiceFactory();
    const result = await fulfillImageIntentRequest({
      replyPayload: createReplyPayload(),
      message: createMessage("photo of me you"),
      config: createImageTestConfig(),
      logger: {},
      generatedImages: null,
      conversationId: "conversation-identity-2",
      cache: createMemoryCache(null),
      imageGenerationServiceFactory: service.factory,
    });

    assert.equal(result.files.length, 1);
    assert.match(service.calls[0].prompt, /Jenna/);
    assert.match(service.calls[0].prompt, /Dante Sølvane/);
    assert.doesNotMatch(service.calls[0].prompt, /network|abstract AI|neural/i);
  });
});
