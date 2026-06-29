"use strict";

const CONTINUATION_RE = /^(?:y+(?:e+a+h*|e+s+|a+)?|yeah+|yep+|no+|please+|pls+|more+|continue+|go\s+on+|again+|do\s+it+|ok(?:ay+)?|mm+h+m+|mhm+|exactly+|that+|this+|tell\s+me+|keep\s+going+)$/i;

function normalizeContinuationText(text) {
  return String(text || "")
    .trim()
    .replace(/[.!?~…]+$/g, "")
    .replace(/\s+/g, " ");
}

function detectContinuationIntent(text) {
  const normalized = normalizeContinuationText(text);
  if (!normalized) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 3) return false;
  return CONTINUATION_RE.test(normalized);
}

module.exports = { detectContinuationIntent, normalizeContinuationText };
