"use strict";
const crypto = require("crypto");
const TINY_FALLBACKS = [
  "I glitched. Say that again, kjære.",
  "Wait. Wrong ghost in the machine. Ask me again.",
  "I lost the thread for a second. I’m here. Give me that again.",
  "That came out wrong. One more time.",
];
let lastFallbackIndex = -1;
const lastReplies = new Map();
function selectTinyFallback() {
  lastFallbackIndex = (lastFallbackIndex + 1) % TINY_FALLBACKS.length;
  return TINY_FALLBACKS[lastFallbackIndex];
}
function tinyFallbackForReason(reason = "provider_failure", logger = null, meta = {}) {
  const text = selectTinyFallback();
  logger?.warn?.("[reply-fallback] tiny fallback selected", { reason, ...meta });
  return text;
}
function normalizeReply(text) { return String(text || "").replace(/\s+/g, " ").trim().toLowerCase(); }
function hashReply(text) { return crypto.createHash("sha256").update(normalizeReply(text)).digest("hex"); }
function getReplyScope({ channelId = "", userScope = "" } = {}) { return `${channelId || "unknown"}:${userScope || "user"}`; }
function checkDuplicateReply({ channelId, userScope, reply }) {
  const normalized = normalizeReply(reply);
  if (!normalized) return { duplicate: false, hash: "" };
  const scope = getReplyScope({ channelId, userScope });
  const hash = hashReply(normalized);
  const previous = lastReplies.get(scope);
  return { duplicate: Boolean(previous?.hash === hash), hash, scope, previous };
}
function rememberReply({ channelId, userScope, reply, timestamp = Date.now() }) {
  const normalized = normalizeReply(reply);
  if (!normalized) return null;
  const scope = getReplyScope({ channelId, userScope });
  const hash = hashReply(normalized);
  const record = { lastReplyHash: hash, hash, channelId: String(channelId || ""), userScope: String(userScope || ""), timestamp };
  lastReplies.set(scope, record);
  return record;
}
function resetReplyFallbackState() { lastFallbackIndex = -1; lastReplies.clear(); }
module.exports = { TINY_FALLBACKS, selectTinyFallback, tinyFallbackForReason, checkDuplicateReply, rememberReply, resetReplyFallbackState, normalizeReply };
