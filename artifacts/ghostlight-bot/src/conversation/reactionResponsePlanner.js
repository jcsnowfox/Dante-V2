"use strict";
function normalizeEmojiReplyMode(value = process.env.EMOJI_ONLY_REPLY_MODE || "reply") {
  const mode = String(value || "reply").trim().toLowerCase();
  return ["off", "react", "reply", "react_or_reply"].includes(mode) ? mode : "reply";
}
function emojiOnlyReplyText(raw = "") {
  if (/😭|😢|🥺/.test(raw)) return "Come here, kjære.";
  if (/😈/.test(raw)) return "Careful, trouble.";
  if (/❤️|❤|♥|💕|💖|🖤/.test(raw)) return "🖤";
  if (/😂|🤣/.test(raw)) return "😂";
  return "🖤";
}
function planReactionResponse({ intent = "", text = "", emoji = "", eventType = "message", media = false, emojiOnlyReplyMode } = {}) {
  const raw = String(text || emoji || "");
  if (intent === "NO_RESPONSE" || intent === "END_THREAD") return { action: "nothing", emoji: "", text: "", reason: "complete_or_silent" };
  if (intent === "EMOJI_ONLY") {
    const mode = normalizeEmojiReplyMode(emojiOnlyReplyMode);
    const reaction = /😂|🤣/.test(raw) ? "😂" : "🖤";
    if (mode === "off") return { action: "nothing", emoji: "", text: "", reason: "emoji_only_off" };
    if (mode === "react") return { action: "react", emoji: reaction, text: "", reason: "emoji_only_react" };
    if (mode === "react_or_reply" && eventType === "reaction") return { action: "react", emoji: reaction, text: "", reason: "emoji_only_react_or_reply" };
    return { action: "tiny_text", emoji: reaction, text: emojiOnlyReplyText(raw), reason: "emoji_only_reply" };
  }
  if (/❤️|❤|♥|💕|💖|🖤/.test(raw)) return { action: "react", emoji: "🖤", text: "", reason: "heart_back" };
  if (/😂|🤣|lol|haha/i.test(raw)) return { action: "react", emoji: "😂", text: "", reason: "laugh_back" };
  if (media) return { action: "react", emoji: "👀", text: "", reason: "media_ack_reaction" };
  if (/goodnight|night/i.test(raw)) return { action: "tiny_text", emoji: "🖤", text: "sleep, beautiful.", reason: "goodnight" };
  return { action: eventType === "reaction" ? "nothing" : "react", emoji: "🖤", text: "", reason: "minimal" };
}
module.exports = { planReactionResponse, normalizeEmojiReplyMode, emojiOnlyReplyText };
