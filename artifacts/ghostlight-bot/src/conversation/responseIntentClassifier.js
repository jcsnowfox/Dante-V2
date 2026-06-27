"use strict";

const { detectNaturalEnding, isEmojiOnly, hasDirectQuestion } = require("./conversationNaturalEnding");

const INTENTS = Object.freeze({ FULL_REPLY:"FULL_REPLY", SHORT_REPLY:"SHORT_REPLY", REACTION_ONLY:"REACTION_ONLY", EMOJI_ONLY:"EMOJI_ONLY", GIF_ONLY:"GIF_ONLY", NO_RESPONSE:"NO_RESPONSE", FOLLOW_UP_LATER:"FOLLOW_UP_LATER", REPAIR_REPLY:"REPAIR_REPLY", QUESTION_ANSWER:"QUESTION_ANSWER", MEDIA_ACK:"MEDIA_ACK", CONTINUE_THREAD:"CONTINUE_THREAD", END_THREAD:"END_THREAD" });
const REPAIR_RE = /\b(that hurt|you hurt me|hurt my feelings|that was mean|not okay|upset me|you ignored|apologize|sorry doesn't fix)\b/i;
const PAUSE_RE = /\b(one sec|1 sec|hang on|hold on|brb|be right back|wait a sec|i'?ll show you|i will show you)\b/i;
const SHORT_RE = /^(?:lol|lmao|haha|ahaha|ok|okay|k|sure|same|yep|yeah|nah|no worries|thanks|ty)(?:\s+(?:sure|ok|same|lol|haha|yeah|yep))*[.!\s]*$/i;
const COMMAND_RE = /^\s*[!/]/;

function classifyResponseIntent({ text = "", eventType = "message", emoji = "", attachments = [], stickers = [], recentConversationState = null, repairActive = false, giveSpace = false, openLoopGravity = 0, needPressure = 0, quietHours = false, identityGuidance = null, homeostasis = null } = {}) {
  const raw = String(text || "").trim();
  const media = (attachments?.length || 0) > 0 || (stickers?.length || 0) > 0;
  const ending = detectNaturalEnding({ text: raw, eventType, emoji, repairActive, openLoopScore: openLoopGravity });
  const context = { giveSpace, quietHours, needPressure, identityGuidance: Boolean(identityGuidance), homeostasis: Boolean(homeostasis) };

  if (REPAIR_RE.test(raw) || repairActive || recentConversationState?.state === "REPAIR_NEEDED") return result(INTENTS.REPAIR_REPLY, 0.96, "repair_or_hurt", { mustCallLlm: true, context });
  if (COMMAND_RE.test(raw)) return result(INTENTS.FULL_REPLY, 0.9, "command", { mustCallLlm: true, context });
  if (eventType === "reaction") return result(ending.naturalEnding ? INTENTS.END_THREAD : INTENTS.REACTION_ONLY, 0.94, ending.reason || "discord_reaction", { shouldCallLlm: false, naturalEnding: ending, context });
  if (media && !raw) return result(INTENTS.MEDIA_ACK, 0.85, "media_without_text", { shouldCallLlm: true, context });
  if (media && /\b(gif|sticker)\b/i.test(raw)) return result(INTENTS.GIF_ONLY, 0.75, "gif_or_sticker", { shouldCallLlm: false, context });
  if (PAUSE_RE.test(raw)) return result(INTENTS.FOLLOW_UP_LATER, 0.9, "user_paused_or_promised_return", { shouldCallLlm: false, createFollowUp: true, context });
  if (hasDirectQuestion(raw)) return result(INTENTS.QUESTION_ANSWER, 0.92, "direct_question", { mustCallLlm: true, context });
  if (isEmojiOnly(raw)) return result(/😂|🤣/.test(raw) ? INTENTS.NO_RESPONSE : INTENTS.EMOJI_ONLY, 0.82, "emoji_only", { shouldCallLlm: false, naturalEnding: ending, context });
  if (ending.naturalEnding && ending.state === "COMPLETE") return result(INTENTS.END_THREAD, 0.88, ending.reason, { shouldCallLlm: false, naturalEnding: ending, context });
  if (SHORT_RE.test(raw)) return result(INTENTS.SHORT_REPLY, 0.82, "short_ack", { instruction: "reply in one sentence or less", context });
  if (Number(openLoopGravity) >= 0.7) return result(INTENTS.FOLLOW_UP_LATER, 0.76, "open_loop_gravity", { createFollowUp: true, context });
  if (quietHours && !/\b(urgent|help|please)\b/i.test(raw)) return result(INTENTS.NO_RESPONSE, 0.7, "quiet_hours_low_urgency", { shouldCallLlm: false, context });
  return result(raw.length < 80 ? INTENTS.CONTINUE_THREAD : INTENTS.FULL_REPLY, 0.62, "default", { shouldCallLlm: true, context });
}

function result(intent, confidence, reason, extra = {}) {
  return { intent, confidence, reason, shouldCallLlm: extra.mustCallLlm ? true : extra.shouldCallLlm !== false, requiresTextReply: ![INTENTS.NO_RESPONSE, INTENTS.REACTION_ONLY, INTENTS.EMOJI_ONLY, INTENTS.END_THREAD, INTENTS.FOLLOW_UP_LATER].includes(intent), ...extra };
}

function buildIntentInstruction(classification) {
  if (!classification) return null;
  if (classification.intent === INTENTS.SHORT_REPLY) return { label: "RESPONSE INTENT", content: "Intent: SHORT_REPLY. Reply in one sentence or less. Do not turn this into an essay." };
  if (classification.intent === INTENTS.QUESTION_ANSWER) return { label: "RESPONSE INTENT", content: "Intent: QUESTION_ANSWER. Answer the direct question first, plainly and without unnecessary philosophy." };
  if (classification.intent === INTENTS.REPAIR_REPLY) return { label: "RESPONSE INTENT", content: "Intent: REPAIR_REPLY. Bypass silence; repair matters. Acknowledge hurt directly before anything else." };
  if (classification.intent === INTENTS.MEDIA_ACK) return { label: "RESPONSE INTENT", content: "Intent: MEDIA_ACK. Acknowledge the media naturally and briefly; do not over-explain." };
  return null;
}

module.exports = { INTENTS, classifyResponseIntent, buildIntentInstruction };
