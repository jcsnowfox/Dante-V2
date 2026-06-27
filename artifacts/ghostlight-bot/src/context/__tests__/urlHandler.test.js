const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  detectURLsInText,
  shouldFetchURL,
  classifyAttachmentType,
  extractMetadata,
} = require("../urlHandler");
const { classifyAttachmentType: classifyAttachmentTypeImport } = require("../attachmentUnderstanding");

describe("URL Handler", () => {
  describe("detectURLsInText", () => {
    it("detects https URLs", () => {
      const text = "Check this out: https://example.com";
      const urls = detectURLsInText(text);
      assert.ok(urls.includes("https://example.com"));
    });

    it("detects http URLs", () => {
      const text = "Visit http://example.com for more";
      const urls = detectURLsInText(text);
      assert.ok(urls.includes("http://example.com"));
    });

    it("detects www URLs", () => {
      const text = "Go to www.example.com";
      const urls = detectURLsInText(text);
      assert.ok(urls.some((u) => u.includes("example.com")));
    });

    it("handles multiple URLs", () => {
      const text = "https://example.com and https://test.com";
      const urls = detectURLsInText(text);
      assert.strictEqual(urls.length, 2);
    });

    it("deduplicates URLs", () => {
      const text = "https://example.com and https://example.com";
      const urls = detectURLsInText(text);
      assert.strictEqual(urls.length, 1);
    });

    it("returns empty array for no URLs", () => {
      const text = "No URLs here";
      const urls = detectURLsInText(text);
      assert.strictEqual(urls.length, 0);
    });
  });

  describe("shouldFetchURL", () => {
    it("returns true when user asks to read URL", () => {
      const text = "can you read this https://example.com";
      const urls = ["https://example.com"];
      assert.strictEqual(shouldFetchURL(text, urls), true);
    });

    it("returns true when user asks to explain", () => {
      const text = "explain this https://example.com";
      const urls = ["https://example.com"];
      assert.strictEqual(shouldFetchURL(text, urls), true);
    });

    it("returns true for short message with single URL", () => {
      const text = "https://example.com";
      const urls = ["https://example.com"];
      assert.strictEqual(shouldFetchURL(text, urls), true);
    });

    it("returns false for no URLs", () => {
      const text = "some text";
      const urls = [];
      assert.strictEqual(shouldFetchURL(text, urls), false);
    });

    it("returns false for long message without explicit keywords", () => {
      const text = "This is a long message about something interesting but I did not ask you to look at any URLs like https://example.com so you should not fetch it";
      const urls = ["https://example.com"];
      assert.strictEqual(shouldFetchURL(text, urls), false);
    });
  });

  describe("extractMetadata", () => {
    it("extracts title from HTML", () => {
      const html = "<html><title>My Page</title></html>";
      const metadata = extractMetadata(html);
      assert.strictEqual(metadata.title, "My Page");
    });

    it("extracts meta description", () => {
      const html = '<html><meta name="description" content="This is a test page"></html>';
      const metadata = extractMetadata(html);
      assert.strictEqual(metadata.description, "This is a test page");
    });

    it("extracts canonical URL", () => {
      const html = '<link rel="canonical" href="https://canonical.example.com">';
      const metadata = extractMetadata(html);
      assert.strictEqual(metadata.canonical, "https://canonical.example.com");
    });

    it("extracts body text", () => {
      const html = "<html><body>Hello world <p>This is content</p></body></html>";
      const metadata = extractMetadata(html);
      assert.ok(metadata.readableText.includes("Hello world"));
      assert.ok(metadata.readableText.includes("This is content"));
    });

    it("removes HTML tags", () => {
      const html = "<html><body><h1>Title</h1><p>Content</p><script>alert('xss')</script></body></html>";
      const metadata = extractMetadata(html);
      assert.ok(!metadata.readableText.includes("<"));
      assert.ok(!metadata.readableText.includes(">"));
    });

    it("handles empty HTML", () => {
      const metadata = extractMetadata("");
      assert.strictEqual(metadata.title, "");
      assert.strictEqual(metadata.readableText, "");
    });
  });
});
