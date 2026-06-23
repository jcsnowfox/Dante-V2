"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createGiphySearchTool,
  isImageGenerationRequest,
} = require("./mediaTools");

describe("media tool routing", () => {
  it("detects direct photo/image requests", () => {
    assert.equal(isImageGenerationRequest("send me a photo of us"), true);
    assert.equal(isImageGenerationRequest("yes, try the photo again"), true);
    assert.equal(isImageGenerationRequest("no photo"), true);
    assert.equal(isImageGenerationRequest("show me a picture"), true);
  });

  it("does not treat reaction GIF requests as image generation requests", () => {
    assert.equal(isImageGenerationRequest("send me a dramatic reaction gif"), false);
    assert.equal(isImageGenerationRequest("find a funny gif"), false);
  });

  it("hides GIF search for photo requests so generate_image is not bypassed", () => {
    const tool = createGiphySearchTool({
      config: {
        giphy: { apiKey: "test-key" },
        gifs: { sendMode: "embed_image" },
      },
      logger: null,
      fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }),
    });

    assert.equal(tool.isAvailable({ currentUserText: "send me a photo of us" }), false);
    assert.equal(tool.isAvailable({ currentUserText: "send me a cute reaction gif" }), true);
  });
});
