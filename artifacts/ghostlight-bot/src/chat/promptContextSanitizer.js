"use strict";

const { detectOutputCorruption } = require("./outputCorruptionDetector");
const { detectContinuationIntent } = require("./continuationIntent");

const ENGINEERING_AUDIT_RE = /\b(?:DEEP_SWEEP_REPORT|PROMPT_CONTEXT_BLOAT_AUDIT|PERFORMANCE_AUDIT_REPORT|CANONICAL_PIPELINE_PLAN|audit|verification script|root cause|files changed|logs showing before\/after|regression tests|outputCorruptionDetector|DEBUG_REPLY_PROMPT)\b/i;
const MALFORMED_ASSISTANT_RE = /\b(?:printStats|contentassist|Dating\s+toolbox|NewReader|feed\s+tickets|resize\s+patterns|cartoon\s+elbows|Maritime\s+Boundaries|Passport\s+js|tool_call|function_call)\b/i;
const CONTINUITY_STATE_LABEL_RE = /\b(?:Immediate Conversation Continuity|Image Conversation|Last Media Request|Pending Actions|Pending Action|Executive Follow-Through|Active Scene|Adult Scene|Tool Context|Unresolved Action)\b/i;

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
function findPreviousAssistant(recentHistory = []) {
  return [...recentHistory].reverse().find((item) => item?.role === "assistant" || item?.isBot === true) || null;
}

function cleanPreviousAssistantForContinuity(item) {
  const text = textOf(item);
  if (!text) return null;
  if (isPromptContaminated(text, { role: "assistant" })) {
    return {
      role: "assistant",
      content: "Previous assistant message was corrupted and should be ignored.",
      continuityCleaned: true,
    };
  }
  return { ...item, role: "assistant", content: text };
}

function buildImmediateContinuityBlock({ previousAssistant, currentUserReply }) {
  if (!previousAssistant) return null;
  return {
    label: "Immediate Conversation Continuity",
    content: [
      `Previous assistant message: ${textOf(previousAssistant)}`,
      `Current user reply: ${String(currentUserReply || "").trim()}`,
      "Instruction: Interpret the user's short reply as a direct response to the previous assistant message.",
    ].join("\n"),
  };
}

function sanitizePromptContext({ contextSections = [], memories = [], recentHistory = [], logger = null, messageId = "", currentUserText = "", preserveImmediateContinuity = false } = {}) {
  const dropped = { contextSections: [], memories: [], recentHistory: [] };
  const continuationIntentDetected = preserveImmediateContinuity || detectContinuationIntent(currentUserText);
  const previousAssistant = continuationIntentDetected ? findPreviousAssistant(recentHistory) : null;
  const cleanedPreviousAssistant = previousAssistant ? cleanPreviousAssistantForContinuity(previousAssistant) : null;
  let previousAssistantPreserved = false;
  let sanitizerRemovedPreviousAssistant = false;
  const cleanContextSections = contextSections.filter((section) => {
    if (CONTINUITY_STATE_LABEL_RE.test(String(section?.label || ""))) {
      return true;
    }
    const bad = isPromptContaminated(section?.content || "");
    if (bad) dropped.contextSections.push(String(section?.label || "unknown"));
    return !bad;
  });
  const cleanMemories = memories.filter((memory) => {
    const bad = isPromptContaminated(textOf(memory));
    if (bad) dropped.memories.push(typeof memory === "string" ? "string-memory" : String(memory?.memoryId || memory?.memory_id || memory?.id || "unknown"));
    return !bad;
  });
  const cleanRecentHistory = [];
  for (const item of recentHistory) {
    const isPreviousAssistant = previousAssistant && item === previousAssistant;
    const bad = isPromptContaminated(textOf(item), { role: item?.role });
    if (bad) {
      if (isPreviousAssistant && cleanedPreviousAssistant) {
        cleanRecentHistory.push(cleanedPreviousAssistant);
        previousAssistantPreserved = true;
        sanitizerRemovedPreviousAssistant = Boolean(cleanedPreviousAssistant.continuityCleaned);
      } else {
        dropped.recentHistory.push(String(item?.id || item?.messageId || item?.sourceMessageId || item?.createdAt || "history-item"));
      }
    } else {
      cleanRecentHistory.push(item);
      if (isPreviousAssistant) previousAssistantPreserved = true;
    }
  }
  const continuityBlock = continuationIntentDetected && cleanedPreviousAssistant
    ? buildImmediateContinuityBlock({ previousAssistant: cleanedPreviousAssistant, currentUserReply: currentUserText })
    : null;
  if (continuityBlock && !cleanContextSections.some((section) => section?.label === continuityBlock.label)) {
    cleanContextSections.push(continuityBlock);
  }
  logger?.info?.("[continuity] prompt continuity diagnostics", {
    messageId,
    continuation_intent_detected: Boolean(continuationIntentDetected),
    previous_assistant_preserved: Boolean(previousAssistantPreserved),
    recent_history_count: recentHistory.length,
    continuity_block_added: Boolean(continuityBlock),
    sanitizer_removed_previous_assistant: Boolean(sanitizerRemovedPreviousAssistant),
  });
  if (dropped.contextSections.length || dropped.memories.length || dropped.recentHistory.length) {
    logger?.warn?.("[reply-prompt-integrity] contaminated prompt inputs removed", { messageId, dropped });
  }
  return { contextSections: cleanContextSections, memories: cleanMemories, recentHistory: cleanRecentHistory, dropped, continuity: { continuationIntentDetected: Boolean(continuationIntentDetected), previousAssistantPreserved: Boolean(previousAssistantPreserved), continuityBlockAdded: Boolean(continuityBlock), sanitizerRemovedPreviousAssistant: Boolean(sanitizerRemovedPreviousAssistant) } };
}
function buildCleanRegenerationContext({ contextSections = [] } = {}) {
  return contextSections.filter((section) => /^(?:VOICE RULES|TONE MODE|ADULT MODE ESCALATION|Time Context|Main User|Speaker Identity)$/i.test(String(section?.label || "")));
}
module.exports = { sanitizePromptContext, buildCleanRegenerationContext, isPromptContaminated, cleanPreviousAssistantForContinuity, buildImmediateContinuityBlock };
