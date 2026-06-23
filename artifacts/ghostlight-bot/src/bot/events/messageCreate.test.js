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
