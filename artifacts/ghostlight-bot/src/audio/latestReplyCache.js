const { normalizeTextForSpeech } = require("./text");

const TTS_LATEST_TTL_MS = 24 * 60 * 60 * 1000;

function buildLatestTtsCacheKey(conversationId = "") {
  return `tts-latest:${String(conversationId || "").trim()}`;
}

async function cacheLatestReadableReply({
  cache,
  userScope,
  conversationId,
  messageId = "",
  channelId = "",
  text = "",
  now = new Date(),
} = {}) {
  if (!cache?.set || !conversationId) {
    return null;
  }

  const normalizedText = normalizeTextForSpeech(text);

  if (!normalizedText) {
    return null;
  }

  const expiresAt = new Date(now.getTime() + TTS_LATEST_TTL_MS).toISOString();

  await cache.set(buildLatestTtsCacheKey(conversationId), {
    text: normalizedText,
    messageId: String(messageId || "").trim(),
    channelId: String(channelId || "").trim(),
    conversationId: String(conversationId || "").trim(),
    createdAt: now.toISOString(),
  }, {
    userScope,
    expiresAt,
  });

  return normalizedText;
}

module.exports = {
  TTS_LATEST_TTL_MS,
  buildLatestTtsCacheKey,
  cacheLatestReadableReply,
};
