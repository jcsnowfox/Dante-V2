const IMAGE_CONVERSATION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_IMAGE_FOLLOWUP_WINDOW_MINUTES = 30;
const DEFAULT_IMAGE_MAX_BATCH_COUNT = 4;
let latestImageConversationState = null;

const USER_IMAGE_REQUEST_PATTERNS = Object.freeze([
  /\b(?:make|create|generate|draw|paint|render|illustrate|do|send|give)\b[\s\S]{0,80}\b(?:image|pic|picture|portrait|photo|wallpaper|illustration|artwork|art|visual)\b/i,
  /\b(?:can|could|would|will)\s+you\b[\s\S]{0,80}\b(?:image|pic|picture|portrait|photo|illustration|art|visual)\b/i,
  /\b(?:another|new)\b[\s\S]{0,40}\b(?:image|pic|picture|portrait|photo|illustration|art)\b/i,
  /\b(?:send\s+more|send\s+(?:me\s+)?(?:\d+|one|two|three|four|a\s+few)\s+more|(?:\d+|one|two|three|four)\s+more|make\s+another|do\s+another|do\s+one\s+more|one\s+more|another\s+photo|more\s+photos|give\s+me\s+a\s+few\s+more|regenerate\s+that)\b/i,
  /\bsurprise me\b/i,
]);

const ASSISTANT_IMAGE_STATE_PATTERNS = Object.freeze([
  /\bprompt\s*:/i,
  /\btry this(?: for the prompt)?\b/i,
  /\bif you want\b[\s\S]{0,100}\b(?:another|next|version|portrait|image|pic|photo|generate|make|do)\b/i,
  /\b(?:another|next)\b[\s\S]{0,40}\b(?:version|portrait|image|one)\b/i,
]);

function buildImageConversationCacheKey(conversationId) {
  return `chat:image_conversation:${String(conversationId || "").trim()}`;
}

function shouldSeedImageConversationFromUserText(text = "") {
  const normalized = String(text || "").trim();

  if (!normalized) {
    return false;
  }

  return USER_IMAGE_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized));
}

function shouldRefreshImageConversationFromAssistant({ text = "", generatedImageIds = [] } = {}) {
  if (Array.isArray(generatedImageIds) && generatedImageIds.length) {
    return true;
  }

  const normalized = String(text || "").trim();

  if (!normalized) {
    return false;
  }

  return ASSISTANT_IMAGE_STATE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeImageConversationStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return "active";
  }

  return normalized;
}

function buildImageConversationState({
  now = new Date(),
  reason = "",
  status = "active",
  lastGeneratedAt = null,
  lastMediaType = null,
  lastPrompt = null,
  lastProvider = null,
  lastModel = null,
  lastStyle = null,
  lastAppearancePreset = null,
  lastReferenceImages = [],
  lastSuccessAt = null,
  lastFailedPrompt = null,
  lastFailedAt = null,
  lastFailureReason = null,
  createdAt = null,
  lastChannelId = null,
  lastMessageId = null,
} = {}) {
  const updatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + IMAGE_CONVERSATION_TTL_MS).toISOString();

  return {
    active: true,
    reason: String(reason || "").trim(),
    status: normalizeImageConversationStatus(status),
    updatedAt,
    expiresAt,
    lastGeneratedAt: lastGeneratedAt ? new Date(lastGeneratedAt).toISOString() : null,
    lastMediaType: lastMediaType ? String(lastMediaType) : null,
    lastPrompt: lastPrompt ? String(lastPrompt) : null,
    lastProvider: lastProvider ? String(lastProvider) : null,
    lastModel: lastModel ? String(lastModel) : null,
    lastStyle: lastStyle ? String(lastStyle) : null,
    lastAppearancePreset: lastAppearancePreset ? String(lastAppearancePreset) : null,
    lastReferenceImages: Array.isArray(lastReferenceImages) ? lastReferenceImages.slice(0, 8) : [],
    lastSuccessAt: lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null,
    lastFailedPrompt: lastFailedPrompt ? String(lastFailedPrompt) : null,
    lastFailedAt: lastFailedAt ? new Date(lastFailedAt).toISOString() : null,
    lastFailureReason: lastFailureReason ? String(lastFailureReason) : null,
    createdAt: createdAt ? new Date(createdAt).toISOString() : updatedAt,
    lastChannelId: lastChannelId ? String(lastChannelId) : null,
    lastMessageId: lastMessageId ? String(lastMessageId) : null,
  };
}

async function loadImageConversationState({
  cache,
  conversationId,
  userScope,
} = {}) {
  if (!cache?.get || !conversationId) {
    return null;
  }

  const value = await cache.get(buildImageConversationCacheKey(conversationId), { userScope });

  if (!value || typeof value !== "object") {
    return null;
  }

  return value;
}

async function markImageConversationActive({
  cache,
  conversationId,
  userScope,
  now = new Date(),
  reason = "",
  status = "active",
  lastGeneratedAt = null,
  lastMediaType = null,
  lastPrompt = null,
  lastProvider = null,
  lastModel = null,
  lastStyle = null,
  lastAppearancePreset = null,
  lastReferenceImages = [],
  lastSuccessAt = null,
  lastFailedPrompt = null,
  lastFailedAt = null,
  lastFailureReason = null,
  createdAt = null,
  lastChannelId = null,
  lastMessageId = null,
} = {}) {
  if (!cache?.set || !conversationId) {
    return null;
  }

  const state = buildImageConversationState({
    now,
    reason,
    status,
    lastGeneratedAt,
    lastMediaType,
    lastPrompt,
    lastProvider,
    lastModel,
    lastStyle,
    lastAppearancePreset,
    lastReferenceImages,
    lastSuccessAt,
    lastFailedPrompt,
    lastFailedAt,
    lastFailureReason,
    createdAt,
    lastChannelId,
    lastMessageId,
  });

  await cache.set(buildImageConversationCacheKey(conversationId), state, {
    userScope,
    expiresAt: state.expiresAt,
  });

  latestImageConversationState = { ...state };
  return state;
}

function getLatestImageConversationState() {
  return latestImageConversationState ? { ...latestImageConversationState } : null;
}

function getImageFollowupMaxBatchCount(config = {}) {
  return Math.max(1, Number.parseInt(String(config.imageGeneration?.maxBatchCount || DEFAULT_IMAGE_MAX_BATCH_COUNT), 10) || DEFAULT_IMAGE_MAX_BATCH_COUNT);
}

function detectImageFollowupRequest(text = "", { maxCount = DEFAULT_IMAGE_MAX_BATCH_COUNT } = {}) {
  const normalized = String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return { detected: false, requestedCount: 0 };
  const patterns = [
    /\bsend more\b/, /\bsend (?:me )?(?:\d+|one|two|three|four|a few) more\b/, /\b(?:\d+|one|two|three|four) more\b/,
    /\bmake another\b/, /\bdo another\b/, /\bdo one more\b/, /\bone more\b/, /\banother photo\b/, /\bmore photos\b/,
    /\bgive me a few more\b/, /\bregenerate that\b/,
  ];
  const detected = patterns.some((pattern) => pattern.test(normalized));
  if (!detected) return { detected: false, requestedCount: 0 };
  let count = 1;
  const digit = normalized.match(/\b([1-9][0-9]?)\s+more\b/);
  if (digit) count = Number.parseInt(digit[1], 10);
  else if (/\b(?:two|2)\s+more\b/.test(normalized)) count = 2;
  else if (/\b(?:three|3)\s+more\b/.test(normalized)) count = 3;
  else if (/\b(?:four|4)\s+more\b/.test(normalized)) count = 4;
  else if (/\ba few more\b/.test(normalized)) count = 3;
  return { detected: true, requestedCount: Math.min(Math.max(1, count), maxCount) };
}

function isUsableLastImageState(state, { now = new Date(), windowMinutes = DEFAULT_IMAGE_FOLLOWUP_WINDOW_MINUTES, channelId = null } = {}) {
  if (!state || state.lastMediaType !== "image" || !state.lastPrompt) return false;
  if (channelId && state.lastChannelId && String(channelId) !== String(state.lastChannelId)) return false;
  const at = Date.parse(state.lastSuccessAt || state.lastGeneratedAt || state.updatedAt || "");
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at <= Math.max(1, windowMinutes) * 60 * 1000;
}

function isUsableFailedImageState(state, { now = new Date(), windowMinutes = DEFAULT_IMAGE_FOLLOWUP_WINDOW_MINUTES, channelId = null } = {}) {
  if (!state || !state.lastFailedPrompt) return false;
  if (channelId && state.lastChannelId && String(channelId) !== String(state.lastChannelId)) return false;
  const at = Date.parse(state.lastFailedAt || state.updatedAt || "");
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at <= Math.max(1, windowMinutes) * 60 * 1000;
}

function buildImageConversationContextSection(state) {
  if (!state?.active) {
    return null;
  }

  const lines = [
    "An image conversation is currently active in this chat.",
    "If the user's message naturally continues that exchange, shorthand follow-ups like 'it', 'that one', 'make it darker', or 'generate it' can refer to the current image idea without restating the full request.",
    "Praise or delight about an image is not, by itself, a request to generate another one.",
  ];

  if (state.status === "generated_image") {
    lines.push("A generated image was already sent in this conversation recently. If the user directly requests another image or says 'try another one', call generate_image immediately.");
  } else if (state.status === "prompt_only") {
    lines.push("A prompt or image concept was already discussed recently, but that does not automatically mean a new image should be generated now.");
  }

  if (state.lastGeneratedAt) {
    lines.push(`Last generated image time: ${state.lastGeneratedAt}`);
  }

  return {
    label: "Image Conversation",
    content: lines.join("\n"),
  };
}

module.exports = {
  IMAGE_CONVERSATION_TTL_MS,
  DEFAULT_IMAGE_FOLLOWUP_WINDOW_MINUTES,
  DEFAULT_IMAGE_MAX_BATCH_COUNT,
  buildImageConversationCacheKey,
  buildImageConversationState,
  shouldSeedImageConversationFromUserText,
  shouldRefreshImageConversationFromAssistant,
  loadImageConversationState,
  markImageConversationActive,
  getLatestImageConversationState,
  detectImageFollowupRequest,
  getImageFollowupMaxBatchCount,
  isUsableLastImageState,
  isUsableFailedImageState,
  buildImageConversationContextSection,
};
