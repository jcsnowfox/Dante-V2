const { classifyAttachmentType } = require("./attachmentUnderstanding");

function detectURLsInText(text = "") {
  if (!text || typeof text !== "string") {
    return [];
  }

  // URL regex that captures http(s), common shortened URLs, etc.
  const urlRegex = /https?:\/\/[^\s<>\[\]{}|\\^`"]+|www\.[^\s<>\[\]{}|\\^`"]+\.[^\s<>\[\]{}|\\^`"]+/gi;
  const matches = text.match(urlRegex) || [];

  // Remove duplicates and normalize
  const urls = [];
  const seen = new Set();

  for (const match of matches) {
    let url = match.trim();
    // Add http if missing
    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }

    if (!seen.has(url)) {
      urls.push(url);
      seen.add(url);
    }
  }

  return urls;
}

function shouldFetchURL(text = "", urls = []) {
  if (!urls.length) {
    return false;
  }

  const textLower = String(text || "").toLowerCase();

  // User explicitly asked to look at/read/understand the URL
  const explicitFetchKeywords = [
    "what is this",
    "what's this",
    "read this",
    "check this",
    "look at this",
    "open this",
    "summarize this",
    "explain this",
    "tell me about",
    "what does this say",
    "show me",
    "can you see",
  ];

  const shouldExplicitFetch = explicitFetchKeywords.some((keyword) => textLower.includes(keyword));

  if (shouldExplicitFetch) {
    return true;
  }

  // If it's a short message with just a URL, user probably wants us to read it
  if (text.length < 100 && urls.length === 1) {
    return true;
  }

  return false;
}

async function fetchAndAnalyzeURL(url = "", logger = null) {
  if (!url || typeof url !== "string") {
    return null;
  }

  try {
    const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;

    // Use fetch with reasonable timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
      response = await globalThis.fetch(normalizedUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return {
        url: normalizedUrl,
        status: response.status,
        blocked: true,
        blockReason: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length");

    // Don't try to fetch if it's a large file or non-text
    if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
      return {
        url: normalizedUrl,
        status: 200,
        blocked: true,
        blockReason: "File too large",
      };
    }

    if (!contentType.includes("text") && !contentType.includes("html") && !contentType.includes("json")) {
      return {
        url: normalizedUrl,
        status: 200,
        blocked: true,
        blockReason: `Non-text content type: ${contentType}`,
      };
    }

    const text = await response.text();

    // Basic HTML parsing for metadata
    const metadata = extractMetadata(text, normalizedUrl);

    return {
      url: normalizedUrl,
      status: 200,
      blocked: false,
      title: metadata.title || "",
      description: metadata.description || "",
      readableText: metadata.readableText || "",
      canonical: metadata.canonical || normalizedUrl,
      ogImage: metadata.ogImage || "",
    };
  } catch (error) {
    if (logger) {
      logger.debug("[url-handler] URL fetch failed", {
        url,
        error: error.message,
      });
    }

    return {
      url,
      status: 0,
      blocked: true,
      blockReason: error.message || "Fetch failed",
    };
  }
}

function extractMetadata(html = "", baseUrl = "") {
  const metadata = {
    title: "",
    description: "",
    canonical: baseUrl,
    ogImage: "",
    readableText: "",
  };

  if (!html || typeof html !== "string") {
    return metadata;
  }

  // Extract title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch) {
    metadata.title = titleMatch[1].trim().slice(0, 200);
  }

  // Extract meta description
  const descMatch = html.match(/<meta\s+name=["']?description["']?\s+content=["']([^"']*)/i);
  if (descMatch) {
    metadata.description = descMatch[1].trim().slice(0, 500);
  }

  // Extract canonical URL
  const canonicalMatch = html.match(/<link\s+rel=["']?canonical["']?\s+href=["']?([^"'>]*)/i);
  if (canonicalMatch) {
    metadata.canonical = canonicalMatch[1].trim();
  }

  // Extract OG image
  const ogImageMatch = html.match(/<meta\s+property=["']?og:image["']?\s+content=["']?([^"'>\s]*)/i);
  if (ogImageMatch) {
    metadata.ogImage = ogImageMatch[1].trim();
  }

  // Extract readable text (strip HTML)
  const textMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = textMatch ? textMatch[1] : html;

  // Remove script and style
  let text = bodyHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  // Decode HTML entities and normalize whitespace
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  metadata.readableText = text.slice(0, 2000);

  return metadata;
}

module.exports = {
  detectURLsInText,
  shouldFetchURL,
  fetchAndAnalyzeURL,
  extractMetadata,
};
