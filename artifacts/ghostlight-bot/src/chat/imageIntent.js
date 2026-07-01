"use strict";

const IMAGE_MARKER_RE = /(?:!\[generated image\]|\[generated image\]|generate image\s*:|image prompt\s*:|attached image\s*:|tool request\s+for\s+generate_image)/i;
const IMAGE_LINE_RE = /^\s*(?:!\[generated image\]\s*|\[generated image\]\s*|(?:generate image|image prompt|attached image)\s*:\s*)(.*)$/i;
const FAKE_TOOL_CALL_RE = /(?:\[\s*calling\s+image_generate\s+tool\s+with\s*:|\bimage_generate\s+tool\b|\bgenerate_image\s+tool\b|\btool\s+call\s*:|\bprompt\s*=)/i;
const CASUAL_IMAGE_REQUEST_RE = /\b(?:i\s+want\s+a\s+pic|send\s+me\s+a\s+(?:pic|photo)|photo\s+of\s+us|pic\s+of\s+us|picture\s+of\s+us|me\s+and\s+you|you\s+and\s+me|photo\s+of\s+me\s+you|take\s+a\s+(?:picture|photo)|send\s+me\s+one)\b/i;
const USER_IMAGE_REQUEST_RE = /\b(?:generate|create|make|draw|send|show|want|need|take)\b.{0,80}\b(?:image|picture|photo|pic|pics|portrait|selfie|snapshot|shot|art)\b/i;

function detectFakeImageToolCall(text = "") {
  return FAKE_TOOL_CALL_RE.test(String(text || ""));
}

function parseScalarParam(text, names) {
  for (const name of names) {
    const pattern = new RegExp(`${name}\\s*[:=]\\s*(?:\"([^\"]+)\"|'([^']+)'|([^,\\]\n]+))`, "i");
    const match = String(text || "").match(pattern);
    if (match) return String(match[1] || match[2] || match[3] || "").trim();
  }
  return "";
}

function parseListParam(text, names) {
  let value = "";
  for (const name of names) {
    const pattern = new RegExp(`${name}\\s*[:=]\\s*(?:\\[([^\\]]+)\\]|([^\\]\\n]*?))(?=,\\s*(?:aspect_ratio|aspectRatio|style_preset|stylePreset|image_type|imageType|prompt|appearancePresetIds|appearance_presets|appearance_presets_ids)\\s*[:=]|\\]|$)`, "i");
    const match = String(text || "").match(pattern);
    if (match) { value = String(match[1] || match[2] || "").trim(); break; }
  }
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, "")
    .split(/[|;]/)
    .flatMap((part) => part.split(/\s*,\s*/))
    .map((part) => part.replace(/^['"]|['"]$/g, "").trim())
    .filter(Boolean);
}

function parseFakeImageToolCall(text = "") {
  const content = String(text || "");
  if (!detectFakeImageToolCall(content)) {
    return { detected: false, prompt: "", params: {}, cleanedText: content };
  }

  const prompt = parseScalarParam(content, ["prompt"])
    || content.replace(/^[\s\S]*?(?:with\s*:|tool\s*call\s*:)/i, "").replace(/\]?\s*$/g, "").trim();
  const params = {};
  const aspectRatio = parseScalarParam(content, ["aspect_ratio", "aspectRatio"]);
  const imageType = parseScalarParam(content, ["image_type", "imageType"]);
  const stylePreset = parseScalarParam(content, ["style_preset", "stylePreset"]);
  const appearancePresets = parseListParam(content, ["appearance_presets", "appearancePresetIds", "appearance_presets_ids"]);
  if (aspectRatio) params.aspectRatio = aspectRatio;
  if (imageType) params.imageType = imageType;
  if (stylePreset) params.stylePreset = stylePreset;
  if (appearancePresets.length) params.appearancePresets = appearancePresets;

  return { detected: true, prompt, params, cleanedText: stripFakeImageToolCallText(content) };
}

function detectImageIntent(text = "") {
  const content = String(text || "");
  return IMAGE_MARKER_RE.test(content) || detectFakeImageToolCall(content);
}

function extractImagePrompt(text = "") {
  const fake = parseFakeImageToolCall(text);
  if (fake.detected) return fake.prompt;
  const content = String(text || "");
  const lines = content.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => IMAGE_LINE_RE.test(line) || /tool request\s+for\s+generate_image/i.test(line));
  if (markerIndex < 0) return "";
  const markerLine = lines[markerIndex] || "";
  const markerMatch = markerLine.match(IMAGE_LINE_RE);
  const promptLines = [];
  if (markerMatch?.[1]?.trim()) promptLines.push(markerMatch[1].trim());
  for (let index = markerIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) { if (promptLines.length) break; continue; }
    if (/^(?:caption|discord reply|final reply|internal|notes?)\s*:/i.test(trimmed)) break;
    promptLines.push(trimmed);
  }
  return promptLines.join(" ").replace(/^prompt\s*:\s*/i, "").replace(/[`*_#>]+/g, "").replace(/\s+/g, " ").trim();
}

function stripFakeImageToolCallText(text = "") {
  return String(text || "")
    .replace(/\[\s*Calling\s+image_generate\s+tool\s+with\s*:[\s\S]*?\]\s*/gi, "")
    .replace(/^\s*(?:image_generate|generate_image)\s+tool[\s\S]*$/gim, "")
    .replace(/^\s*tool\s+call\s*:[\s\S]*$/gim, "")
    .trim();
}

function stripImageIntentFromText(text = "") {
  let source = stripFakeImageToolCallText(text);
  const lines = source.split(/\r?\n/);
  const output = [];
  let skippingPrompt = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (IMAGE_LINE_RE.test(line) || /tool request\s+for\s+generate_image/i.test(line)) { skippingPrompt = true; continue; }
    if (skippingPrompt) { if (!trimmed) skippingPrompt = false; continue; }
    output.push(line);
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeUserImagePrompt(userText = "") {
  return String(userText || "").replace(/\b(?:make|generate|send|create|draw|show|take)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|pic|art)\s*(?:of\s+)?/i, "").trim();
}

function chooseImagePrompt({ markerPrompt = "", userText = "" } = {}) {
  const normalizedMarkerPrompt = String(markerPrompt || "").trim();
  const userPrompt = normalizeUserImagePrompt(userText);
  if (!normalizedMarkerPrompt) return userPrompt;
  if (userPrompt && normalizedMarkerPrompt.length < 60 && userPrompt.length >= normalizedMarkerPrompt.length * 2) return userPrompt;
  return normalizedMarkerPrompt;
}


function resolveIdentitySubjects(prompt = "", userText = "") {
  const combined = `${userText} ${prompt}`.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const hasMeYou = /\b(?:me\s+and\s+you|you\s+and\s+me|photo\s+of\s+me\s+you|pic\s+of\s+me\s+you|me\s+you)\b/.test(combined);
  const hasUs = /\b(?:us|photo\s+of\s+us|pic\s+of\s+us|picture\s+of\s+us)\b/.test(combined);
  const hasMe = /\bme\b/.test(combined);
  const hasYou = /\byou\b/.test(combined);
  const subjects = [];
  if (hasMeYou || hasUs || (hasMe && hasYou)) subjects.push("Jenna", "Dante Sølvane");
  else {
    if (hasMe) subjects.push("Jenna");
    if (hasYou) subjects.push("Dante Sølvane");
  }
  return Array.from(new Set(subjects));
}

function applyIdentityResolution(prompt = "", userText = "") {
  const basePrompt = String(prompt || userText || "").trim();
  const subjects = resolveIdentitySubjects(basePrompt, userText);
  if (subjects.includes("Jenna") && subjects.includes("Dante Sølvane")) {
    const settingGiven = /\b(?:at|in|on|inside|outside|coffee|cafe|beach|kitchen|bedroom|forest|city|rain|snow|sunset|night|morning)\b/i.test(basePrompt);
    return {
      prompt: `realistic cinematic couple photo of Jenna and Dante Sølvane together, ${basePrompt}${settingGiven ? "" : ", intimate natural pose, warm realistic lighting"}`,
      identityResolution: { detected: true, resolvedSubjects: subjects, userReferenceFound: true, companionReferenceFound: true },
    };
  }
  if (subjects.includes("Jenna")) {
    return { prompt: `realistic cinematic photo of Jenna, ${basePrompt}`, identityResolution: { detected: true, resolvedSubjects: subjects, userReferenceFound: true, companionReferenceFound: false } };
  }
  if (subjects.includes("Dante Sølvane")) {
    return { prompt: `realistic cinematic photo of Dante Sølvane, ${basePrompt}`, identityResolution: { detected: true, resolvedSubjects: subjects, userReferenceFound: false, companionReferenceFound: true } };
  }
  return { prompt: basePrompt, identityResolution: { detected: false, resolvedSubjects: [], userReferenceFound: false, companionReferenceFound: false } };
}

function buildImageIntentRequest({ text = "", userText = "" } = {}) {
  const fake = parseFakeImageToolCall(text);
  const markerPrompt = fake.detected ? fake.prompt : extractImagePrompt(text);
  const chosenPrompt = chooseImagePrompt({ markerPrompt, userText });
  const userDetected = USER_IMAGE_REQUEST_RE.test(String(userText || "")) || CASUAL_IMAGE_REQUEST_RE.test(String(userText || ""));
  const shouldResolveIdentity = userDetected && !fake.detected && !detectImageIntent(text);
  const resolved = shouldResolveIdentity
    ? applyIdentityResolution(chosenPrompt, userText)
    : { prompt: chosenPrompt, identityResolution: { detected: false, resolvedSubjects: [], userReferenceFound: false, companionReferenceFound: false } };
  const prompt = resolved.prompt;
  return {
    detected: detectImageIntent(text) || userDetected,
    prompt,
    params: fake.params || {},
    cleanedText: stripImageIntentFromText(text),
    fakeToolCallDetected: fake.detected,
    triggerSource: fake.detected ? "fake_tool_call" : (detectImageIntent(text) ? "reply_marker" : "user_request"),
    identityResolution: resolved.identityResolution,
  };
}

module.exports = { detectImageIntent, extractImagePrompt, stripImageIntentFromText, normalizeUserImagePrompt, chooseImagePrompt, buildImageIntentRequest, detectFakeImageToolCall, parseFakeImageToolCall, resolveIdentitySubjects, applyIdentityResolution };
