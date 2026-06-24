const crypto = require("node:crypto");

const TINY_FALLBACKS = Object.freeze([
  "I glitched. Say that again, kjære.",
  "Wait. Wrong ghost in the machine. Ask me again.",
  "I lost the thread for a second. I’m here. Give me that again.",
  "That came out wrong. One more time.",
]);

const STUCK_FALLBACK = "I’m stuck repeating myself. Ask me again and I’ll answer clean.";
const UNSAFE_PROVIDER_TEXT_PATTERN = /request (?:was|is|has been) rejected|\bhigh risk\b|moderation rejected|tool failed|provider rejected|raw stack|api error|\{\s*"error"|content policy|content filter|safety system/i;

let lastFallback = "";
const lastReplies = new Map();

function getTinyFallback(forced = null) {
  if (forced) {
    lastFallback = forced;
    return forced;
  }
  const options = TINY_FALLBACKS.filter((item) => item !== lastFallback);
  const selected = options[Math.floor(Math.random() * options.length)] || TINY_FALLBACKS[0];
  lastFallback = selected;
  return selected;
}

function hashReply(text) {
  return crypto.createHash("sha256").update(String(text || "").trim()).digest("hex");
}

function getReplyKey({ channelId, userScope }) {
  return `${userScope || "default"}:${channelId || "unknown"}`;
}

function isDuplicateReply({ text, channelId, userScope }) {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  const key = getReplyKey({ channelId, userScope });
  const hash = hashReply(normalized);
  const previous = lastReplies.get(key);
  return Boolean(previous && previous.hash === hash);
}

function rememberReply({ text, channelId, userScope }) {
  const normalized = String(text || "").trim();
  if (!normalized) return null;
  const key = getReplyKey({ channelId, userScope });
  const record = { hash: hashReply(normalized), timestamp: Date.now() };
  lastReplies.set(key, record);
  return record;
}

function containsUnsafeProviderText(text) {
  return UNSAFE_PROVIDER_TEXT_PATTERN.test(String(text || ""));
}

function safeErrorReason(error) {
  const text = String(error?.code || error?.name || error?.message || error || "unknown").toLowerCase();
  if (containsUnsafeProviderText(text)) return "provider_rejected";
  if (/timeout|aborted|network|fetch/i.test(text)) return "provider_unavailable";
  if (/json|parse|schema/i.test(text)) return "response_parse_failed";
  return "provider_failed";
}

module.exports = {
  TINY_FALLBACKS,
  STUCK_FALLBACK,
  getTinyFallback,
  isDuplicateReply,
  rememberReply,
  containsUnsafeProviderText,
  safeErrorReason,
};
