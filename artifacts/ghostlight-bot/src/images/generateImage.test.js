"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildImageRequestWithReferences, sanitizeImageRequestPayloadForLog } = require("./generateImage");

describe("getimg payload diagnostics", () => {
  it("treats gemini-3-1-flash-image as the Nano Banana 2 selected model and logs a sanitized payload shape", () => {
    const payload = buildImageRequestWithReferences({
      model: "gemini-3-1-flash-image",
      prompt: "cinematic Dante portrait",
      aspectRatio: "1:1",
      resolution: "2K",
      referenceImages: [{ role: "reference_image", url: "https://signed.example.com/private.png?secret=hidden" }],
    });
    const sanitized = sanitizeImageRequestPayloadForLog(payload);

    assert.equal(sanitized.model, "gemini-3-1-flash-image");
    assert.equal(sanitized.promptLength, "cinematic Dante portrait".length);
    assert.equal(sanitized.referenceImageCount, 1);
    assert.deepEqual(sanitized.referenceImageRoles, ["reference_image"]);
    assert.equal(JSON.stringify(sanitized).includes("signed.example.com"), false);
    assert.deepEqual(sanitized.unsupportedOrNullFields, []);
  });
});
