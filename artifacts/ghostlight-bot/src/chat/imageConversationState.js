const IMAGE_CONVERSATION_TTL_MS = 15 * 60 * 1000;

const USER_IMAGE_REQUEST_PATTERNS = Object.freeze([
  /\b(?:make|create|generate|draw|paint|render|illustrate|do|send|give)\b[\s\S]{0,80}\b(?:image|pic|picture|portrait|photo|wallpaper|illustration|artwork|art|visual)\b/i,
  /\b(?:can|could|would|will)\s+you\b[\s\S]{0,80}\b(?:image|pic|picture|portrait|photo|illustration|art|visual)\b/i,
  /\b(?:another|new)\b[\s\S]{0,40}\b(?:image|pic|picture|portrait|photo|illustration|art)\b/i,
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
} = {}) {
  if (!cache?.set || !conversationId) {
    return null;
  }

  const state = buildImageConversationState({
    now,
    reason,
    status,
    lastGeneratedAt,
  });

  await cache.set(buildImageConversationCacheKey(conversationId), state, {
    userScope,
    expiresAt: state.expiresAt,
  });

  return state;
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
    lines.push("A generated image was already sent in this conversation recently.");
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
  buildImageConversationCacheKey,
  buildImageConversationState,
  shouldSeedImageConversationFromUserText,
  shouldRefreshImageConversationFromAssistant,
  loadImageConversationState,
  markImageConversationActive,
  buildImageConversationContextSection,
};
