"use strict";

const IMAGE_MARKER_RE = /(?:!\[generated image\]|\[generated image\]|generate image\s*:|image prompt\s*:|attached image\s*:|tool request\s+for\s+generate_image)/i;
const IMAGE_LINE_RE = /^\s*(?:!\[generated image\]\s*|\[generated image\]\s*|(?:generate image|image prompt|attached image)\s*:\s*)(.*)$/i;

function detectImageIntent(text = "") {
  return IMAGE_MARKER_RE.test(String(text || ""));
}

function extractImagePrompt(text = "") {
  const content = String(text || "");
  const lines = content.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => IMAGE_LINE_RE.test(line) || /tool request\s+for\s+generate_image/i.test(line));
  if (markerIndex < 0) return "";

  const markerLine = lines[markerIndex] || "";
  const markerMatch = markerLine.match(IMAGE_LINE_RE);
  const promptLines = [];
  if (markerMatch?.[1]?.trim()) promptLines.push(markerMatch[1].trim());

  for (let index = markerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      if (promptLines.length) break;
      continue;
    }
    if (/^(?:caption|discord reply|final reply|internal|notes?)\s*:/i.test(trimmed)) break;
    promptLines.push(trimmed);
  }

  return promptLines
    .join(" ")
    .replace(/^prompt\s*:\s*/i, "")
    .replace(/[`*_#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripImageIntentFromText(text = "") {
  const lines = String(text || "").split(/\r?\n/);
  const output = [];
  let skippingPrompt = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (IMAGE_LINE_RE.test(line) || /tool request\s+for\s+generate_image/i.test(line)) {
      skippingPrompt = true;
      continue;
    }
    if (skippingPrompt) {
      if (!trimmed) {
        skippingPrompt = false;
      }
      continue;
    }
    output.push(line);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildImageIntentRequest({ text = "", userText = "" } = {}) {
  const prompt = extractImagePrompt(text) || String(userText || "").replace(/\b(?:make|generate|send|create|draw)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|art)\s+(?:of\s+)?/i, "").trim();
  return {
    detected: detectImageIntent(text) || /\b(?:generate|create|make|draw|send)\b.{0,40}\b(?:image|picture|photo|art)\b/i.test(String(userText || "")),
    prompt,
    cleanedText: stripImageIntentFromText(text),
    triggerSource: detectImageIntent(text) ? "reply_marker" : "user_request",
  };
}

module.exports = { detectImageIntent, extractImagePrompt, stripImageIntentFromText, buildImageIntentRequest };
