"use strict";

// Direct media URL patterns — the ONLY URLs Discord renders inline as GIFs.
// Page URLs (giphy.com/gifs/, tenor.com/view/) show as broken link previews.
const DIRECT_GIF_PATTERNS = [
  /^https:\/\/media\.giphy\.com\//i,
  /^https:\/\/media\.tenor\.com\//i,
  /^https:\/\/c\.tenor\.com\//i,
];

function isValidDirectGifUrl(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  if (!url.startsWith("https://")) {
    return false;
  }

  const lower = url.toLowerCase();
  const hasGifExtension = lower.endsWith(".gif") || lower.includes(".gif?") || lower.includes(".gif#");
  const isDirectMediaDomain = DIRECT_GIF_PATTERNS.some((pattern) => pattern.test(url));

  return hasGifExtension || isDirectMediaDomain;
}

function normalizeGiphyItem(item) {
  if (!item || typeof item !== "object") {
    return { ok: false, reason: "invalid_item" };
  }

  const images = item.images || {};

  // Priority order per Giphy API: original > downsized > fixed_height > fixed_height_small
  // item.url is the page URL — intentionally last so it is only used if no media URL exists
  const candidates = [
    images?.original?.url,
    images?.downsized?.url,
    images?.fixed_height?.url,
    images?.fixed_height_small?.url,
    item?.url,
  ].filter(Boolean);

  const directGifUrl = candidates.find(isValidDirectGifUrl) || "";
  const title = String(item.title || item.alt_text || "").trim() || "GIF";
  const sourceUrl = String(item.url || "").trim();

  if (!directGifUrl) {
    return {
      ok: false,
      provider: "giphy",
      reason: "no_valid_direct_url",
      title,
      sourceUrl,
    };
  }

  const previewCandidates = [
    images?.fixed_height_small?.url,
    images?.downsized_still?.url,
    images?.preview_gif?.url,
    directGifUrl,
  ].filter(Boolean);

  const previewUrl = previewCandidates.find(isValidDirectGifUrl) || directGifUrl;

  return {
    ok: true,
    provider: "giphy",
    displayUrl: directGifUrl,
    directGifUrl,
    previewUrl,
    title,
    sourceUrl,
    reason: "ok",
  };
}

function normalizeGifResult(rawItem, provider = "giphy") {
  if (provider === "giphy") {
    return normalizeGiphyItem(rawItem);
  }

  return { ok: false, reason: "unsupported_provider", provider: String(provider || "") };
}

module.exports = {
  normalizeGifResult,
  normalizeGiphyItem,
  isValidDirectGifUrl,
};
