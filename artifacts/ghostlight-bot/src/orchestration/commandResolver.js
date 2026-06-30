"use strict";
const { buildImageIntentRequest, parseFakeImageToolCall } = require("../chat/imageIntent");
const { detectImageFollowupRequest } = require("../chat/imageConversationState");
const { detectVoiceNoteRequest } = require("../chat/voiceNoteIntent");

const MEDIA_RETRY_RE = /\b(?:try again|retry|regenerate(?: it| that)?|run it again|again please|please try again)\b/i;
const CONTINUATION_RE = /^\s*(?:yes|yeah|yep|no|nah|please|again|continue|more|do it|sure|ok(?:ay)?)\s*[.!?]*\s*$/i;
const DASHBOARD_RE = /\b(?:dashboard|admin panel|open panel|call me|start a call|voice call|show status)\b/i;
const PROMISE_RE = /\b(?:give me a minute(?: and)?|in a minute|i(?:'|’)ll|i will)\b[\s\S]{0,140}\b(?:send|generate|make|check|do|try|look|post|create|call|remember|write(?: that)? down)\b/i;
const CASUAL_IMAGE_RE = /\b(?:(?:send|show|make|create|generate|draw|take|try|want|need|give|get)\b[\s\S]{0,80}\b(?:pic|pics|picture|pictures|photo|photos|selfie|snapshot|shot|image|images)|(?:pic|picture|photo|selfie|snapshot|shot|image)\s+of\s+us|one\s+of\s+us|try\s+one\s+of|show\s+me\s+us)\b/i;
const IMAGE_FOLLOWUP_RE = /\b(?:same thing but|this time|another one|one more|two more|make another|do another|send another|send more)\b/i;

function detectContinuationAnswer(text = "") { const n = String(text || "").trim().toLowerCase(); if (!CONTINUATION_RE.test(n)) return null; if (/^n/.test(n)) return "no"; if (/again|more|continue/.test(n)) return RegExp.lastMatch; return "yes"; }
function normalizeActionType(verb = "") {
  const v = String(verb || "").toLowerCase();
  if (/send|generate|make|create/.test(v)) return "image_generation";
  if (/remember|write/.test(v)) return "memory_save";
  if (/check/.test(v)) return "dashboard_check";
  return "generic_follow_up";
}
function detectPromiseAction(text = "") {
  const value = String(text || "");
  const match = value.match(/\b(?:give me a minute(?: and)?\s*)?i(?:'|’)ll\s+(send|generate|make|check|do|try|look|post|create|call|remember|write(?: that)? down)\b([\s\S]{0,160})/i)
    || value.match(/\bgive me a minute(?: and)?\s+(?:i(?:'|’)ll\s+)?(send|generate|make|check|do|try|look|post|create|call|remember|write(?: that)? down)\b([\s\S]{0,160})/i);
  if (!match) return null;
  const actionType = normalizeActionType(match[1]);
  return { detected: true, actionType, supported: ["image_generation", "memory_save", "dashboard_check", "generic_follow_up"].includes(actionType), verb: match[1], target: String(match[2] || "").trim() };
}
function resolveUserCommand({ text = "", maxImageCount = 4 } = {}) {
  const content = String(text || ""); const fakeTool = parseFakeImageToolCall(content); const imageRequest = buildImageIntentRequest({ userText: content, text: fakeTool.detected ? content : "" }); const imageFollowup = detectImageFollowupRequest(content, { maxCount: maxImageCount }); const retry = MEDIA_RETRY_RE.test(content); const voiceDetected = detectVoiceNoteRequest(content); const continuation = detectContinuationAnswer(content); const promise = detectPromiseAction(content); const intents = [];
  if (fakeTool.detected) intents.push({ type: "fake_tool_call", actionType: "image_generation", mediaRequest: { detected: true, prompt: fakeTool.prompt, params: fakeTool.params, cleanedText: fakeTool.cleanedText, fakeToolCallDetected: true, triggerSource: "fake_tool_call" } });
  if (retry) intents.push({ type: "image_retry", actionType: "image_generation" });
  if (!retry && (imageFollowup.detected || IMAGE_FOLLOWUP_RE.test(content))) intents.push({ type: "image_followup", requestedCount: imageFollowup.requestedCount || (/\btwo more\b/i.test(content) ? 2 : 1), actionType: "image_generation" });
  if (!retry && (imageRequest.detected || CASUAL_IMAGE_RE.test(content))) intents.push({ type: "image_request", prompt: imageRequest.prompt || content, mediaRequest: { ...imageRequest, detected: true, prompt: imageRequest.prompt || content }, actionType: "image_generation" });
  if (voiceDetected) intents.push({ type: "voice_note_request", trigger: "voice note", actionType: "voice_note" });
  if (promise || PROMISE_RE.test(content)) intents.push({ type: "promise_follow_through_request", actionType: promise?.actionType || "generic_follow_up", payload: { text: content, promise } });
  if (continuation) intents.push({ type: "continuation_answer", value: continuation });
  if (!promise && DASHBOARD_RE.test(content)) intents.push({ type: "dashboard_call_action", actionType: "dashboard_check", payload: { text: content } });
  return { detected: intents.length > 0, intents };
}
function stripFakeToolLeaks(text = "") { return String(text || "").replace(/\[\s*Calling\s+image_generate\s+tool\s+with\s*:[\s\S]*?\]\s*/gi, "").replace(/\[\s*Calling\s+[^\]]+tool\s+with\s*:[\s\S]*?\]\s*/gi, "").trim(); }
function rewriteUnsafePromises(text = "") { const content = String(text || "").trim(); const promise = detectPromiseAction(content); if (!promise || promise.supported) return content; return content.replace(/\b(?:give me a minute and\s*)?i(?:'|’)ll\s+(send|make|check|do|try|look|post|create|generate|call|remember|write(?: that)? down)\b/gi, "I can $1 now if you want me to"); }
module.exports = { resolveUserCommand, stripFakeToolLeaks, rewriteUnsafePromises, detectPromiseAction };
