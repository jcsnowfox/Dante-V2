"use strict";

const { detectNaturalEnding, hasDirectQuestion } = require("./conversationNaturalEnding");

function scoreConversationSatisfaction({ text = "", eventType = "message", emoji = "", intent = "", replyText = "", repairActive = false, recentHistory = [], openLoopGravity = 0 } = {}) {
  const ending = detectNaturalEnding({ text, eventType, emoji, repairActive, openLoopScore: openLoopGravity });
  const directQuestion = hasDirectQuestion(text);
  const repaired = intent === "REPAIR_REPLY" && String(replyText || "").trim().length > 0;
  const reactionWarmth = eventType === "reaction" && /❤️|❤|♥|💕|💖|😂|🤣|👍|🖤/.test(String(emoji || text || "")) ? 0.25 : 0;
  const repairScore = repairActive && !repaired ? 0.95 : repaired ? 0.25 : 0;
  const openLoopScore = Math.max(Number(openLoopGravity) || 0, directQuestion && !replyText ? 0.85 : 0, intent === "FOLLOW_UP_LATER" ? 0.75 : 0);
  const emotionalCompletion = Math.min(1, (ending.naturalEnding ? 0.75 : 0.35) + reactionWarmth + (replyText && !directQuestion ? 0.1 : 0));
  let satisfaction = 0.45 + reactionWarmth + (ending.naturalEnding ? 0.25 : 0) + (directQuestion && replyText ? 0.2 : 0) - openLoopScore * 0.35 - repairScore * 0.45;
  satisfaction = Math.max(0, Math.min(1, satisfaction));
  let state = "ACTIVE";
  if (repairScore >= 0.7) state = "REPAIR_NEEDED";
  else if (intent === "FOLLOW_UP_LATER") state = "FOLLOW_UP_PENDING";
  else if (openLoopScore >= 0.65) state = "OPEN_LOOP";
  else if (ending.naturalEnding) state = ending.state;
  else if (satisfaction >= 0.72) state = "COOLING";
  return { state, satisfaction_score: Number(satisfaction.toFixed(3)), emotional_completion: Number(emotionalCompletion.toFixed(3)), open_loop_score: Number(openLoopScore.toFixed(3)), follow_up_score: Number((state === "OPEN_LOOP" || state === "FOLLOW_UP_PENDING" ? Math.max(openLoopScore, 0.55) : 0).toFixed(3)), repair_score: Number(repairScore.toFixed(3)), naturalEnding: ending };
}

async function updateConversationSatisfaction({ store, stateStore, conversation, ...input } = {}) {
  const targetStore = store || stateStore;
  const scored = scoreConversationSatisfaction(input);
  if (!targetStore?.upsert) return { ...scored, persisted: false };
  const saved = await targetStore.upsert({ ...(conversation || {}), state: scored.state, satisfaction_score: scored.satisfaction_score, emotional_completion: scored.emotional_completion, open_loop_score: scored.open_loop_score, follow_up_score: scored.follow_up_score, repair_score: scored.repair_score, last_event_type: input.eventType || "message", last_intent: input.intent || "", metadata: { naturalEnding: scored.naturalEnding } });
  return { ...saved, persisted: true };
}

module.exports = { scoreConversationSatisfaction, updateConversationSatisfaction };
