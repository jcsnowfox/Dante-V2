"use strict";
const crypto = require("crypto");
const TINY_FALLBACKS = [
  "I glitched. Say that again, kjære.",
  "Wait. Wrong ghost in the machine. Ask me again.",
  "I lost the thread for a second. I’m here. Give me that again.",
  "That came out wrong. One more time.",
];
const CONTEXTUAL_FALLBACKS = [
  "I got tangled for a second. I’m here now.",
  "That came out wrong. Let me try again.",
  "My brain tripped over itself. Give me one second, kjære.",
  "Nope, that was garbled. I’m back.",
];
let lastFallbackIndex = -1;
let lastContextualFallbackIndex = -1;
const lastReplies = new Map();
const fallbackEvents = new Map();
function selectTinyFallback() { lastFallbackIndex = (lastFallbackIndex + 1) % TINY_FALLBACKS.length; return TINY_FALLBACKS[lastFallbackIndex]; }
function selectContextualFallback({ voiceNoteIntent = false, emojiOnly = false, userText = "" } = {}) {
  const raw = String(userText || "");
  if (voiceNoteIntent) return "I got tangled trying to make the voice note. Let me send it as text first.";
  if (emojiOnly) {
    if (/😭|😢|🥺/.test(raw)) return "Come here, kjære.";
    if (/😈|👀/.test(raw)) return "Careful, trouble.";
    if (/❤️|❤|♥|💕|💖/.test(raw)) return "🖤";
  }
  lastContextualFallbackIndex = (lastContextualFallbackIndex + 1) % CONTEXTUAL_FALLBACKS.length;
  return CONTEXTUAL_FALLBACKS[lastContextualFallbackIndex];
}
function tinyFallbackForReason(reason = "provider_failure", logger = null, meta = {}) { const text = selectTinyFallback(); logger?.warn?.("[reply-fallback] tiny fallback selected", { reason, ...meta }); return text; }
function contextualFallbackForReason(reason = "corruption", logger = null, meta = {}) { const text = selectContextualFallback(meta); logger?.warn?.("[reply-fallback] contextual fallback selected", { reason, fallbackSelected: text, ...meta }); recordFallbackEvent(meta); return text; }
function normalizeReply(text) { return String(text || "").replace(/\s+/g, " ").trim().toLowerCase(); }
function hashReply(text) { return crypto.createHash("sha256").update(normalizeReply(text)).digest("hex"); }
function getReplyScope({ channelId = "", userScope = "" } = {}) { return `${channelId || "unknown"}:${userScope || "user"}`; }
function checkDuplicateReply({ channelId, userScope, reply }) { const normalized = normalizeReply(reply); if (!normalized) return { duplicate: false, hash: "" }; const scope = getReplyScope({ channelId, userScope }); const hash = hashReply(normalized); const previous = lastReplies.get(scope); return { duplicate: Boolean(previous?.hash === hash), hash, scope, previous }; }
function rememberReply({ channelId, userScope, reply, timestamp = Date.now() }) { const normalized = normalizeReply(reply); if (!normalized) return null; const scope = getReplyScope({ channelId, userScope }); const hash = hashReply(normalized); const record = { lastReplyHash: hash, hash, channelId: String(channelId || ""), userScope: String(userScope || ""), timestamp }; lastReplies.set(scope, record); return record; }
function recordFallbackEvent({ channelId = "", userScope = "", timestamp = Date.now() } = {}) { const scope = getReplyScope({ channelId, userScope }); const events = (fallbackEvents.get(scope) || []).filter((event) => timestamp - event.timestamp <= 10 * 60 * 1000); events.push({ timestamp }); fallbackEvents.set(scope, events); return events.length; }
function getFallbackCount({ channelId = "", userScope = "", windowSize = 10, timestamp = Date.now() } = {}) { const scope = getReplyScope({ channelId, userScope }); const events = (fallbackEvents.get(scope) || []).filter((event) => timestamp - event.timestamp <= 10 * 60 * 1000); fallbackEvents.set(scope, events); return Math.min(events.length, windowSize); }
function resetReplyFallbackState() { lastFallbackIndex = -1; lastContextualFallbackIndex = -1; lastReplies.clear(); fallbackEvents.clear(); }
module.exports = { TINY_FALLBACKS, CONTEXTUAL_FALLBACKS, selectTinyFallback, selectContextualFallback, tinyFallbackForReason, contextualFallbackForReason, checkDuplicateReply, rememberReply, recordFallbackEvent, getFallbackCount, resetReplyFallbackState, normalizeReply };
