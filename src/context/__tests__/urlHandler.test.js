const {
  detectURLsInText,
  shouldFetchURL,
  classifyAttachmentType,
  extractMetadata,
} = require("../urlHandler");
const { classifyAttachmentType: classifyAttachmentTypeImport } = require("../attachmentUnderstanding");

describe("URL Handler", () => {
  describe("detectURLsInText", () => {
    test("detects https URLs", () => {
      const text = "Check this out: https://example.com";
      const urls = detectURLsInText(text);
      expect(urls).toContain("https://example.com");
    });

    test("detects http URLs", () => {
      const text = "Visit http://example.com for more";
      const urls = detectURLsInText(text);
      expect(urls).toContain("http://example.com");
    });

    test("detects www URLs", () => {
      const text = "Go to www.example.com";
      const urls = detectURLsInText(text);
      expect(urls.some((u) => u.includes("example.com"))).toBe(true);
    });

    test("handles multiple URLs", () => {
      const text = "https://example.com and https://test.com";
      const urls = detectURLsInText(text);
      expect(urls.length).toBe(2);
    });

    test("deduplicates URLs", () => {
      const text = "https://example.com and https://example.com";
      const urls = detectURLsInText(text);
      expect(urls.length).toBe(1);
    });

    test("returns empty array for no URLs", () => {
      const text = "No URLs here";
      const urls = detectURLsInText(text);
      expect(urls.length).toBe(0);
    });
  });

  describe("shouldFetchURL", () => {
    test("returns true when user asks to read URL", () => {
      const text = "can you read this https://example.com";
      const urls = ["https://example.com"];
      expect(shouldFetchURL(text, urls)).toBe(true);
    });

    test("returns true when user asks to explain", () => {
      const text = "explain this https://example.com";
      const urls = ["https://example.com"];
      expect(shouldFetchURL(text, urls)).toBe(true);
    });

    test("returns true for short message with single URL", () => {
      const text = "https://example.com";
      const urls = ["https://example.com"];
      expect(shouldFetchURL(text, urls)).toBe(true);
    });

    test("returns false for no URLs", () => {
      const text = "some text";
      const urls = [];
      expect(shouldFetchURL(text, urls)).toBe(false);
    });

    test("returns false for long message without explicit keywords", () => {
      const text = "This is a long message about something interesting but I did not ask you to look at any URLs like https://example.com so you should not fetch it";
      const urls = ["https://example.com"];
      expect(shouldFetchURL(text, urls)).toBe(false);
    });
  });

  describe("extractMetadata", () => {
    test("extracts title from HTML", () => {
      const html = "<html><title>My Page</title></html>";
      const metadata = extractMetadata(html);
      expect(metadata.title).toBe("My Page");
    });

    test("extracts meta description", () => {
      const html = '<html><meta name="description" content="This is a test page"></html>';
      const metadata = extractMetadata(html);
      expect(metadata.description).toBe("This is a test page");
    });

    test("extracts canonical URL", () => {
      const html = '<link rel="canonical" href="https://canonical.example.com">';
      const metadata = extractMetadata(html);
      expect(metadata.canonical).toBe("https://canonical.example.com");
    });

    test("extracts body text", () => {
      const html = "<html><body>Hello world <p>This is content</p></body></html>";
      const metadata = extractMetadata(html);
      expect(metadata.readableText).toContain("Hello world");
      expect(metadata.readableText).toContain("This is content");
    });

    test("removes HTML tags", () => {
      const html = "<html><body><h1>Title</h1><p>Content</p><script>alert('xss')</script></body></html>";
      const metadata = extractMetadata(html);
      expect(metadata.readableText).not.toContain("<");
      expect(metadata.readableText).not.toContain(">");
    });

    test("handles empty HTML", () => {
      const metadata = extractMetadata("");
      expect(metadata.title).toBe("");
      expect(metadata.readableText).toBe("");
    });
  });
});
