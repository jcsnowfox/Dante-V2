"use strict";

function enabled() { return String(process.env.DEBUG_REPLY_PROMPT || "").toLowerCase() === "true"; }
function fullEnabled() { return String(process.env.DEBUG_REPLY_PROMPT_FULL || "").toLowerCase() === "true"; }
function size(value) { return Math.ceil(String(value || "").length / 4); }
function summarizeSections(sections = []) {
  return sections.map((s, index) => ({ index, label: String(s?.label || ""), chars: String(s?.content || "").length, estimatedTokens: size(s?.content) }));
}
function memoryId(m) { return typeof m === "string" ? "string-memory" : String(m?.memoryId || m?.memory_id || m?.id || "").trim(); }
function logReplyPromptDebug(logger, event, data = {}) {
  if (!enabled()) return;
  const safe = { ...data };
  if (Array.isArray(data.contextSections)) {
    safe.promptSections = summarizeSections(data.contextSections);
    safe.contextContributors = safe.promptSections.map((s) => s.label).filter(Boolean);
    delete safe.contextSections;
  }
  if (Array.isArray(data.memories)) {
    safe.retrievedMemoryIds = data.memories.map(memoryId).filter(Boolean);
    safe.memoryCount = data.memories.length;
    delete safe.memories;
  }
  if (data.requestShape) safe.tokenSizes = data.requestShape.estimatedRequestTokens || data.requestShape.charCounts || data.requestShape;
  if (!fullEnabled()) {
    delete safe.fullPrompt;
    if (typeof safe.finalTextSentToDiscord === "string") safe.finalTextSentToDiscord = safe.finalTextSentToDiscord.slice(0, 500);
  }
  logger.info?.(`[reply-prompt-debug] ${event}`, safe);
}
module.exports = { logReplyPromptDebug, summarizeSections };
