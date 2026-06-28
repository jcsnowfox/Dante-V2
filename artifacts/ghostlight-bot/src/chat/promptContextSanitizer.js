"use strict";

const { detectOutputCorruption } = require("./outputCorruptionDetector");

const ENGINEERING_AUDIT_RE = /\b(?:DEEP_SWEEP_REPORT|PROMPT_CONTEXT_BLOAT_AUDIT|PERFORMANCE_AUDIT_REPORT|CANONICAL_PIPELINE_PLAN|audit|verification script|root cause|files changed|logs showing before\/after|regression tests|outputCorruptionDetector|DEBUG_REPLY_PROMPT)\b/i;
const MALFORMED_ASSISTANT_RE = /\b(?:printStats|contentassist|Dating\s+toolbox|NewReader|feed\s+tickets|resize\s+patterns|cartoon\s+elbows|Maritime\s+Boundaries|Passport\s+js|tool_call|function_call)\b/i;

function textOf(value) { return String(value?.content || value?.text || value?.summary || value || "").trim(); }
function isPromptContaminated(text, { role = "" } = {}) {
  const value = String(text || "").trim();
  if (!value) return false;
  const corruption = detectOutputCorruption(value);
  if (corruption.severity === "block") return true;
  if (ENGINEERING_AUDIT_RE.test(value)) return true;
  if (role === "assistant" && MALFORMED_ASSISTANT_RE.test(value)) return true;
  return false;
}
function sanitizePromptContext({ contextSections = [], memories = [], recentHistory = [], logger = null, messageId = "" } = {}) {
  const dropped = { contextSections: [], memories: [], recentHistory: [] };
  const cleanContextSections = contextSections.filter((section) => {
    const bad = isPromptContaminated(section?.content || "");
    if (bad) dropped.contextSections.push(String(section?.label || "unknown"));
    return !bad;
  });
  const cleanMemories = memories.filter((memory) => {
    const bad = isPromptContaminated(textOf(memory));
    if (bad) dropped.memories.push(typeof memory === "string" ? "string-memory" : String(memory?.memoryId || memory?.memory_id || memory?.id || "unknown"));
    return !bad;
  });
  const cleanRecentHistory = recentHistory.filter((item) => {
    const bad = isPromptContaminated(textOf(item), { role: item?.role });
    if (bad) dropped.recentHistory.push(String(item?.id || item?.messageId || item?.sourceMessageId || item?.createdAt || "history-item"));
    return !bad;
  });
  if (dropped.contextSections.length || dropped.memories.length || dropped.recentHistory.length) {
    logger?.warn?.("[reply-prompt-integrity] contaminated prompt inputs removed", { messageId, dropped });
  }
  return { contextSections: cleanContextSections, memories: cleanMemories, recentHistory: cleanRecentHistory, dropped };
}
function buildCleanRegenerationContext({ contextSections = [] } = {}) {
  return contextSections.filter((section) => /^(?:VOICE RULES|TONE MODE|ADULT MODE ESCALATION|Time Context|Main User|Speaker Identity)$/i.test(String(section?.label || "")));
}
module.exports = { sanitizePromptContext, buildCleanRegenerationContext, isPromptContaminated };
