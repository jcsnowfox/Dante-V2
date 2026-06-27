"use strict";

const CLOSURE_WORD_RE = /^(?:lol|lmao|haha|ahaha|ok|okay|k|sure|same|goodnight|night|gn|love you|ily|thanks|thank you|ty)[.!\s]*$/i;
const AFFECTION_RE = /^(?:[❤❤️💕💖💗💘💙🖤🤍💜💚💛🧡♥️]+|(?:love you|ily|same|goodnight|night)[.!\s]*)$/i;
const EMOJI_RE = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}|\uFE0F|\s)+$/u;
const QUESTION_RE = /\?|\b(?:what|why|how|when|where|who|can you|could you|would you|do you|did you|is it|are you)\b/i;

function isEmojiOnly(text = "") {
  const value = String(text || "").trim();
  return Boolean(value) && EMOJI_RE.test(value) && !/[a-z0-9]/i.test(value);
}

function hasDirectQuestion(text = "") {
  return QUESTION_RE.test(String(text || ""));
}

function detectNaturalEnding({ text = "", eventType = "message", emoji = "", recentHistory = [], repairActive = false, openLoopScore = 0 } = {}) {
  const raw = String(text || emoji || "").trim();
  const lower = raw.toLowerCase();
  const reaction = eventType === "reaction" || Boolean(emoji && !text);
  if (repairActive) return { naturalEnding: false, state: "REPAIR_NEEDED", confidence: 0.95, reason: "repair_active" };
  if (hasDirectQuestion(raw) || Number(openLoopScore) >= 0.65) return { naturalEnding: false, state: "OPEN_LOOP", confidence: 0.85, reason: "open_loop_or_question" };
  if (reaction && /❤️|❤|♥|💕|💖|😂|🤣|👍|🖤/.test(raw)) return { naturalEnding: true, state: /😂|🤣/.test(raw) ? "COOLING" : "COMPLETE", confidence: 0.95, reason: "closing_reaction" };
  if (AFFECTION_RE.test(raw)) return { naturalEnding: true, state: "COMPLETE", confidence: 0.9, reason: "affection_closure" };
  if (CLOSURE_WORD_RE.test(lower)) return { naturalEnding: true, state: /goodnight|night|love|ily/.test(lower) ? "COMPLETE" : "COOLING", confidence: 0.82, reason: "closure_word" };
  if (isEmojiOnly(raw)) return { naturalEnding: true, state: "COOLING", confidence: 0.75, reason: "emoji_only_closure" };
  return { naturalEnding: false, state: "ACTIVE", confidence: 0.4, reason: "not_closure" };
}

module.exports = { detectNaturalEnding, isEmojiOnly, hasDirectQuestion };
