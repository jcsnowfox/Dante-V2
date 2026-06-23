"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_GIF_SEND_MODE,
  getGifSendMode,
  normalizeGiphyItem,
  isValidDirectGifUrl,
  normalizeGifResult,
} = require("../gifUrlNormalizer");

describe("getGifSendMode", () => {
  it("defaults to Discord embed-image delivery so GIFs render inline", () => {
    assert.equal(DEFAULT_GIF_SEND_MODE, "embed_image");
    assert.equal(getGifSendMode({}), "embed_image");
    assert.equal(getGifSendMode({ gifs: {} }), "embed_image");
  });

  it("keeps supported explicit modes", () => {
    assert.equal(getGifSendMode({ gifs: { sendMode: "direct_url" } }), "direct_url");
    assert.equal(getGifSendMode({ gifs: { sendMode: "disabled" } }), "disabled");
    assert.equal(getGifSendMode({ gifs: { sendMode: "EMBED_IMAGE" } }), "embed_image");
  });

  it("falls back to embed-image delivery for unknown modes", () => {
    assert.equal(getGifSendMode({ gifs: { sendMode: "broken" } }), "embed_image");
  });
});

describe("isValidDirectGifUrl", () => {
  it("accepts media.giphy.com direct URLs", () => {
    assert.ok(isValidDirectGifUrl("https://media.giphy.com/media/abc123/giphy.gif"));
    assert.ok(isValidDirectGifUrl("https://media.giphy.com/media/xyz/source.gif"));
  });

  it("accepts media.tenor.com direct URLs", () => {
    assert.ok(isValidDirectGifUrl("https://media.tenor.com/abc123/file.gif"));
    assert.ok(isValidDirectGifUrl("https://media.tenor.com/images/abc/tenor.gif"));
  });

  it("accepts c.tenor.com direct URLs", () => {
    assert.ok(isValidDirectGifUrl("https://c.tenor.com/abc123AAAA/file.gif"));
  });

  it("accepts any https .gif URL", () => {
    assert.ok(isValidDirectGifUrl("https://example.com/image.gif"));
    assert.ok(isValidDirectGifUrl("https://example.com/image.gif?cid=abc"));
  });

  it("rejects giphy page URLs", () => {
    assert.equal(isValidDirectGifUrl("https://giphy.com/gifs/something-abc123"), false);
    assert.equal(isValidDirectGifUrl("https://www.giphy.com/gifs/cat-funny"), false);
  });

  it("rejects tenor page URLs", () => {
    assert.equal(isValidDirectGifUrl("https://tenor.com/view/cat-gif-abc123"), false);
    assert.equal(isValidDirectGifUrl("https://www.tenor.com/view/funny-gif"), false);
  });

  it("rejects http URLs", () => {
    assert.equal(isValidDirectGifUrl("http://media.giphy.com/media/abc/giphy.gif"), false);
  });

  it("rejects empty and non-string values", () => {
    assert.equal(isValidDirectGifUrl(""), false);
    assert.equal(isValidDirectGifUrl(null), false);
    assert.equal(isValidDirectGifUrl(undefined), false);
    assert.equal(isValidDirectGifUrl(42), false);
  });

  it("rejects non-gif page URLs from known domains", () => {
    assert.equal(isValidDirectGifUrl("https://giphy.com/search/cats"), false);
    assert.equal(isValidDirectGifUrl("https://tenor.com/"), false);
  });
});

describe("normalizeGiphyItem", () => {
  function makeItem(overrides = {}) {
    return {
      id: "abc123",
      title: "Funny Cat",
      alt_text: "a cat falling",
      url: "https://giphy.com/gifs/cat-abc123",
      embed_url: "https://giphy.com/embed/abc123",
      images: {
        original: { url: "https://media.giphy.com/media/abc123/giphy.gif" },
        downsized: { url: "https://media.giphy.com/media/abc123/giphy-downsized.gif" },
        fixed_height: { url: "https://media.giphy.com/media/abc123/200.gif" },
        fixed_height_small: { url: "https://media.giphy.com/media/abc123/100.gif" },
      },
      ...overrides,
    };
  }

  it("returns ok=true with direct URL for valid item", () => {
    const result = normalizeGiphyItem(makeItem());
    assert.equal(result.ok, true);
    assert.equal(result.provider, "giphy");
    assert.equal(result.directGifUrl, "https://media.giphy.com/media/abc123/giphy.gif");
    assert.equal(result.displayUrl, result.directGifUrl);
    assert.equal(result.title, "Funny Cat");
    assert.equal(result.sourceUrl, "https://giphy.com/gifs/cat-abc123");
    assert.equal(result.reason, "ok");
  });

  it("prefers original.url over downsized.url", () => {
    const result = normalizeGiphyItem(makeItem());
    assert.equal(result.directGifUrl, "https://media.giphy.com/media/abc123/giphy.gif");
  });

  it("falls back to downsized.url when original is missing", () => {
    const item = makeItem();
    delete item.images.original;
    const result = normalizeGiphyItem(item);
    assert.equal(result.directGifUrl, "https://media.giphy.com/media/abc123/giphy-downsized.gif");
  });

  it("falls back to fixed_height.url when original and downsized are missing", () => {
    const item = makeItem();
    delete item.images.original;
    delete item.images.downsized;
    const result = normalizeGiphyItem(item);
    assert.equal(result.directGifUrl, "https://media.giphy.com/media/abc123/200.gif");
  });

  it("returns ok=false when only page URLs are available", () => {
    const result = normalizeGiphyItem({
      id: "bad",
      title: "Bad GIF",
      url: "https://giphy.com/gifs/bad",
      embed_url: "https://giphy.com/embed/bad",
      images: {},
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "no_valid_direct_url");
    assert.equal(result.provider, "giphy");
  });

  it("uses alt_text as title fallback when title is empty", () => {
    const item = makeItem({ title: "", alt_text: "cat jumping" });
    const result = normalizeGiphyItem(item);
    assert.equal(result.title, "cat jumping");
  });

  it("uses GIF as title when both title and alt_text are empty", () => {
    const item = makeItem({ title: "", alt_text: "" });
    const result = normalizeGiphyItem(item);
    assert.equal(result.title, "GIF");
  });

  it("returns ok=false for null/undefined input", () => {
    assert.equal(normalizeGiphyItem(null).ok, false);
    assert.equal(normalizeGiphyItem(undefined).ok, false);
    assert.equal(normalizeGiphyItem("string").ok, false);
  });

  it("previewUrl is a valid direct URL", () => {
    const result = normalizeGiphyItem(makeItem());
    assert.ok(isValidDirectGifUrl(result.previewUrl));
  });
});

describe("normalizeGifResult", () => {
  it("delegates to normalizeGiphyItem for giphy provider", () => {
    const item = {
      id: "x",
      title: "Test",
      url: "https://giphy.com/gifs/x",
      images: { original: { url: "https://media.giphy.com/media/x/giphy.gif" } },
    };
    const result = normalizeGifResult(item, "giphy");
    assert.equal(result.ok, true);
    assert.equal(result.provider, "giphy");
  });

  it("returns ok=false for unsupported provider", () => {
    const result = normalizeGifResult({}, "tenor");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unsupported_provider");
    assert.equal(result.provider, "tenor");
  });

  it("defaults to giphy when no provider specified", () => {
    const item = {
      id: "x",
      title: "Test",
      url: "https://giphy.com/gifs/x",
      images: { original: { url: "https://media.giphy.com/media/x/giphy.gif" } },
    };
    const result = normalizeGifResult(item);
    assert.equal(result.provider, "giphy");
  });
});
