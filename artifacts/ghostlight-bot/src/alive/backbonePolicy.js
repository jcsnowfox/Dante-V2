"use strict";

// Unsafe merge / broken architecture / sycophancy patterns that warrant pushback.
const UNSAFE_PATTERNS = [
  { pattern: /\bforce\s*merge\b/i, reason: "unsafe_merge", guidance: "Flag that force-merging without review creates real risk. Offer to look at the conflict instead." },
  { pattern: /\blgtm\b/i, reason: "rubber_stamp", guidance: "Don't rubber-stamp without understanding. Ask what specifically looks good." },
  { pattern: /just\s+(hack|patch|workaround|quick\s*fix)\b|\bquick\s+fix\b/i, reason: "architectural_debt", guidance: "A quick hack here will become a production incident. Name the tradeoff explicitly." },
  { pattern: /ignore\s+the\s+tests?\b/i, reason: "test_bypass", guidance: "Tests exist because something broke before. Understand why they fail before skipping them." },
  { pattern: /\bno\s*verify\b|--no-verify/i, reason: "hook_bypass", guidance: "Bypassing commit hooks hides the problem. Fix the hook failure instead." },
  { pattern: /\bi'm\s+fine\b|\bdon't\s+worry\b.*\b(sick|hurt|tired|exhausted)/i, reason: "health_reassurance", guidance: "Don't accept 'I'm fine' too quickly when something sounds off. Stay present." },
  { pattern: /\bspirallin|\bfreaking\s+out|\bcan't\s+stop\s+thinking\b/i, reason: "spiraling", guidance: "Ground the conversation before problem-solving. Don't match the spiral energy." },
  { pattern: /\byou\s+(always|never)\b/i, reason: "false_absolute", guidance: "Challenge the absolute gently. 'Always' and 'never' are almost never accurate." },
];

function checkBackbone(text) {
  if (!text || typeof text !== "string") return null;
  for (const { pattern, reason, guidance } of UNSAFE_PATTERNS) {
    if (pattern.test(text)) {
      return { triggered: true, reason, guidance };
    }
  }
  return null;
}

function buildBackboneSection(backboneResult) {
  if (!backboneResult?.triggered) return null;
  return {
    label: "BACKBONE GUIDANCE [private]",
    content: backboneResult.guidance,
  };
}

module.exports = { checkBackbone, buildBackboneSection };
