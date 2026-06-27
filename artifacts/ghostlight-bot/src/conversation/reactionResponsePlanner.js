"use strict";
function planReactionResponse({ intent = "", text = "", emoji = "", eventType = "message", media = false } = {}) {
  const raw = String(text || emoji || "");
  if (intent === "NO_RESPONSE" || intent === "END_THREAD") return { action: "nothing", emoji: "", text: "", reason: "complete_or_silent" };
  if (/❤️|❤|♥|💕|💖|🖤/.test(raw)) return { action: "react", emoji: "🖤", text: "", reason: "heart_back" };
  if (/😂|🤣|lol|haha/i.test(raw)) return { action: "react", emoji: "😂", text: "", reason: "laugh_back" };
  if (media) return { action: "react", emoji: "👀", text: "", reason: "media_ack_reaction" };
  if (/goodnight|night/i.test(raw)) return { action: "tiny_text", emoji: "🖤", text: "sleep, beautiful.", reason: "goodnight" };
  return { action: eventType === "reaction" ? "nothing" : "react", emoji: "🖤", text: "", reason: "minimal" };
}
module.exports = { planReactionResponse };
