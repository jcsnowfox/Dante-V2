"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildImageIntentRequest, chooseImagePrompt } = require("./imageIntent");

describe("image intent prompt extraction", () => {
  it("uses the richer user request when Dante emits an over-trimmed marker prompt", () => {
    const userText = "send me a cinematic portrait image of Dante standing in rain-soaked neon alley light, black coat, wet hair, guarded expression, shallow depth of field, dramatic rim lighting";
    const result = buildImageIntentRequest({
      text: "Generate image: Dante in a black coat",
      userText,
    });

    assert.equal(result.detected, true);
    assert.match(result.prompt, /rain-soaked neon alley light/);
    assert.ok(result.prompt.length > 100);
  });

  it("keeps a detailed marker prompt when it is richer than the user text", () => {
    const markerPrompt = "Dante in a black coat, rain-soaked neon alley light, wet hair, guarded expression, dramatic rim lighting";
    assert.equal(
      chooseImagePrompt({ markerPrompt, userText: "make an image of Dante" }),
      markerPrompt,
    );
  });
});
