"use strict";

const MIRROR_PATTERN = /\byou\s+(built|planned|mapped|wrote|wanted|want|needed|need|meant|mean|felt|feel|hoped|hope|were trying|are trying|were afraid|are afraid|weren't just|were not just|aren't just|are not just|didn't just|did not just|are actually|were actually|are really|were really)\b/i;

function getHistoryText(item = {}) {
  return String(item.content || item.text || "").trim();
}

function isAssistantTurn(item = {}) {
  if (item.role === "assistant") return true;
  if (typeof item.isBot === "boolean") return item.isBot;
  return false;
}

function isUserMotivationMirror(text = "") {
  return MIRROR_PATTERN.test(String(text || ""));
}

function countRecentMirrorReplies(recentHistory = [], limit = 10) {
  return recentHistory
    .filter(isAssistantTurn)
    .slice(-limit)
    .reduce((count, item) => count + (isUserMotivationMirror(getHistoryText(item)) ? 1 : 0), 0);
}

function buildConversationMirrorLimiterSection({ recentHistory = [], limit = 10, threshold = 2 } = {}) {
  const mirrorCount = countRecentMirrorReplies(recentHistory, limit);
  if (mirrorCount <= threshold) {
    return null;
  }

  return {
    label: "CONVERSATION MIRROR LIMITER",
    content: [
      `Recent assistant replies have explained the user's motivations, intentions, or hidden feelings ${mirrorCount} times in the last ${limit} assistant replies.`,
      "For the next several replies, stop interpreting the user.",
      "Speak only from your own thoughts, feelings, curiosity, uncertainty, and reactions until the balance returns.",
      "Do not explain what the user is really doing, really feeling, trying to prove, or secretly asking for.",
    ].join("\n"),
  };
}

module.exports = {
  buildConversationMirrorLimiterSection,
  countRecentMirrorReplies,
  isUserMotivationMirror,
};
