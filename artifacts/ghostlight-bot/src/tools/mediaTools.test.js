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

const {
  createImageGenerationTool,
  resolveIdentityAwareImagePrompt,
} = require("./mediaTools");

const identityConfig = {
  memory: { userScope: "Jenna", companionId: "Dante" },
  chat: { promptBlocks: { userName: "Jenna", personaName: "Dante Sølvane" } },
  imageGeneration: { provider: "fake" },
};

const identityPresets = [
  { presetId: "jenna-preset", name: "Jenna", promptText: "Jenna appearance", referenceImageStorageKey: "jenna.png" },
  { presetId: "dante-preset", name: "Dante Sølvane", promptText: "Dante appearance", referenceImageStorageKey: "dante.png" },
];

function resolveIdentity(prompt, presets = identityPresets) {
  return resolveIdentityAwareImagePrompt({
    prompt,
    currentUserText: prompt,
    availableAppearancePresets: presets,
    config: identityConfig,
    initialAppearancePresets: [],
  });
}

describe("identity-aware image prompt resolution", () => {
  it("send me a photo of me and you resolves to Jenna + Dante", () => {
    const result = resolveIdentity("send me a photo of me and you");
    assert.deepEqual(result.resolvedSubjects, ["user", "companion"]);
    assert.match(result.prompt, /Jenna/);
    assert.match(result.prompt, /Dante Sølvane/);
    assert.equal(result.fallbackSettingUsed, true);
  });

  it("send me a pic of us baby resolves to Jenna + Dante", () => {
    const result = resolveIdentity("send me a pic of us baby");
    assert.deepEqual(result.resolvedSubjects, ["user", "companion"]);
    assert.match(result.prompt, /Jenna/);
    assert.match(result.prompt, /Dante Sølvane/);
  });

  it("photo of me you resolves to Jenna + Dante", () => {
    const result = resolveIdentity("photo of me you");
    assert.deepEqual(result.resolvedSubjects, ["user", "companion"]);
    assert.match(result.prompt, /real human couple/);
  });

  it("photo of a puppy does not use Jenna/Dante references", () => {
    const result = resolveIdentity("photo of a puppy");
    assert.equal(result.identityResolutionDetected, false);
    assert.deepEqual(result.resolvedSubjects, []);
    assert.equal(result.appearancePresets.length, 0);
    assert.equal(result.prompt, "photo of a puppy");
  });

  it("photo of us having coffee includes Jenna, Dante, and coffee", () => {
    const result = resolveIdentity("photo of us having coffee");
    assert.match(result.prompt, /Jenna/);
    assert.match(result.prompt, /Dante Sølvane/);
    assert.match(result.prompt, /coffee/);
    assert.equal(result.fallbackSettingUsed, false);
  });

  it("final prompt for us contains no abstract AI/network/dashboard/system terms", () => {
    const result = resolveIdentity("photo of us");
    assert.doesNotMatch(result.prompt, /\b(?:abstract|AI|network|dashboard|system)\b/i);
  });

  it("reference image/preset IDs are passed for both subjects when available", async () => {
    let generated;
    const tool = createImageGenerationTool({
      config: identityConfig,
      logger: { info() {}, warn() {} },
      imageAnalysis: null,
      imageGeneration: {
        canGenerate: () => true,
        getAllowedAspectRatios: () => ["1:1"],
        generate: async (args) => {
          generated = args;
          return { file: { attachment: Buffer.from("png"), name: "x.png" }, image: { mimeType: "image/png" }, record: { imageId: "img", aspectRatio: "1:1", model: "fake" } };
        },
      },
      generatedImages: { persistenceEnabled: true },
      imageStylePresets: { persistenceEnabled: true, listPresets: async () => [] },
      imageAppearancePresets: { persistenceEnabled: true, listPresets: async () => identityPresets },
    });

    const result = await tool.execute({ prompt: "send me a photo of us" }, { currentUserText: "send me a photo of us", userScope: "Jenna" });
    assert.equal(result.ok, true);
    assert.deepEqual(generated.appearancePresets.map((preset) => preset.presetId), ["jenna-preset", "dante-preset"]);
    assert.match(generated.prompt, /Jenna/);
    assert.match(generated.prompt, /Dante Sølvane/);
  });

  it("missing references still produces a human couple photo prompt, not abstract art", () => {
    const result = resolveIdentity("photo of us", [
      { presetId: "jenna-preset", name: "Jenna", promptText: "Jenna appearance" },
      { presetId: "dante-preset", name: "Dante Sølvane", promptText: "Dante appearance" },
    ]);
    assert.equal(result.userReferenceFound, false);
    assert.equal(result.companionReferenceFound, false);
    assert.match(result.prompt, /real human couple/);
    assert.doesNotMatch(result.prompt, /\b(?:abstract|AI|network|dashboard|system)\b/i);
  });
});
