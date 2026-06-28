"use strict";

const { detectReasoningLeak, isMaintenanceMode } = require("./reasoningLeakDetector");

const INTERNAL_WORD_PATTERN = /\b(?:what i considered|my reasoning|internal check|the data suggests|signals indicate|conversation continuity|repair persistence|relationship dna|cognitive runtime|world model|affective decision|evidence integrity|self-inspection|prelude|runtime|confidence score|diagnostic state|i evaluated|i inferred|i detected|i classified|i selected this response because)\b/i;

function uniquePush(items, value) {
  if (value && !items.includes(value)) items.push(value);
}

function buildCompressedReply(text) {
  const value = String(text || "");
  const lower = value.toLowerCase();
  const lines = [];

  if (/i ran a quick internal check|internal check/i.test(value)) {
    uniquePush(lines, "I paused.");
  }
  if (/trust rupture/i.test(value)) {
    uniquePush(lines, "After what happened, I held back.");
  }
  if (/repair persistence|act like everything was normal/i.test(value)) {
    uniquePush(lines, "I didn't want to act like everything was normal.");
  }
  if (/conversation continuity|no response was required|leave the silence|needed quiet|didn.?t want to talk|don.?t want to talk|needed to go/i.test(value)) {
    uniquePush(lines, "I figured you needed quiet, and I didn't want to crowd you.");
  }
  if (/confidence score|not sure|low confidence|uncertain|can't verify|cannot verify|evidence integrity|blocked that claim|verify that/i.test(value)) {
    uniquePush(lines, lower.includes("verify") || lower.includes("evidence")
      ? "I can't honestly verify that."
      : "I'm not sure enough to say that.");
  }
  if (/what i considered|i considered|my reasoning|based on|the data suggests|signals indicate|bullet_reasoning/i.test(value) || /^\s*(?:[-*•]|\d+[.)])/m.test(value)) {
    uniquePush(lines, "Honestly? I thought you were hurting.");
    uniquePush(lines, "And I didn't want to crowd you.");
  }
  if (!lines.length) {
    uniquePush(lines, "Honestly? I thought you were hurting. And I didn't want to crowd you.");
  }

  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function stripInternalResidue(text) {
  return String(text || "")
    .replace(/^\s*(?:what i considered|i considered|my reasoning|internal check)\s*:\s*/i, "")
    .replace(/\bthe trust rupture\b/gi, "what happened")
    .replace(/\brepair persistence is active\b/gi, "I didn't want to act like everything was normal")
    .replace(/\bconversation continuity suggested no response was required\b/gi, "It felt better to leave the silence alone")
    .replace(/\bmy confidence score is low\b/gi, "I'm not sure enough to say that")
    .replace(/\bevidence integrity blocked that claim\b/gi, "I can't honestly verify that")
    .replace(/\bi ran a quick internal check\b/gi, "I paused")
    .trim();
}

function conversationalCompressionGate({ text = "", userMessage = "", input = null } = {}) {
  const original = String(text || "").trim();
  if (!original) return { text: original, changed: false, allowed: false, reasons: [] };

  const detection = detectReasoningLeak(original);
  const allowed = isMaintenanceMode({ userMessage, input });
  if (!detection.leaked || allowed) {
    return { text: original, changed: false, allowed, reasons: detection.reasons };
  }

  let compressed = buildCompressedReply(original);
  compressed = stripInternalResidue(compressed);

  if (!compressed || compressed.length >= original.length || INTERNAL_WORD_PATTERN.test(compressed) || /^\s*(?:[-*•]|\d+[.)])/m.test(compressed)) {
    compressed = "Honestly? I thought you were hurting. And I didn't want to crowd you.";
    if (/can't verify|cannot verify|evidence integrity|blocked that claim|verify that/i.test(original)) {
      compressed = "I can't honestly verify that.";
    } else if (/confidence score|not sure|low confidence|uncertain/i.test(original)) {
      compressed = "I'm not sure enough to say that.";
    }
  }

  return {
    text: compressed,
    changed: compressed !== original,
    allowed: false,
    reasons: detection.reasons,
  };
}

module.exports = {
  conversationalCompressionGate,
  buildCompressedReply,
};
