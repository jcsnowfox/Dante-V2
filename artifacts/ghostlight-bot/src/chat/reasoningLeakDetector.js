"use strict";

const MAINTENANCE_PATTERNS = [
  /\bdiagnostics?\b/i,
  /\blogs?\b/i,
  /\brailway\b/i,
  /\bproof\b/i,
  /\baudit\b/i,
  /\bverify\b/i,
  /\bwhat broke\b/i,
  /\blast errors?\b/i,
  /\bshow me (?:the )?evidence\b/i,
  /\bwhy did the system do that\b/i,
  /\bwhat does your runtime see\b/i,
  /\binspect yourself\b/i,
  /\bmaintenance mode\b/i,
  /\bdebug mode\b/i,
  /\bbuild review\b/i,
  /\bmerge decision\b/i,
  /\bprogress ladder\b/i,
];

const LEAK_PATTERNS = Object.freeze([
  { reason: "reasoning_heading", pattern: /\b(?:what i considered|i considered|my reasoning|internal check)\s*:/i },
  { reason: "internal_check", pattern: /\bi ran a quick internal check\b/i },
  { reason: "based_on", pattern: /\bbased on\b/i },
  { reason: "data_suggests", pattern: /\bthe data suggests\b/i },
  { reason: "trust_rupture", pattern: /\bthe trust rupture\b/i },
  { reason: "signals", pattern: /\bsignals indicate\b/i },
  { reason: "conversation_continuity", pattern: /\bconversation continuity\b/i },
  { reason: "repair_persistence", pattern: /\brepair persistence\b/i },
  { reason: "relationship_dna", pattern: /\brelationship dna\b/i },
  { reason: "runtime_name", pattern: /\b(?:cognitive runtime|world model|affective decision|evidence integrity|self-inspection|prelude|runtime)\b/i },
  { reason: "confidence_score", pattern: /\bconfidence score\b/i },
  { reason: "diagnostic_state", pattern: /\bdiagnostic state\b/i },
  { reason: "evaluation_verb", pattern: /\bi (?:evaluated|inferred|detected|classified)\b/i },
  { reason: "selected_response", pattern: /\bi selected this response because\b/i },
]);

const BULLET_REASONING_PATTERN = /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+[^\n]*(?:you said|trust rupture|repair|signal|continuity|runtime|evidence|classified|detected|inferred|evaluated)/i;

function isMaintenanceMode({ userMessage = "", input = null } = {}) {
  const text = String(userMessage || input?.content || "");
  return MAINTENANCE_PATTERNS.some(pattern => pattern.test(text));
}

function detectReasoningLeak(text = "") {
  const value = String(text || "");
  const reasons = [];

  for (const { reason, pattern } of LEAK_PATTERNS) {
    if (pattern.test(value)) reasons.push(reason);
  }
  if (BULLET_REASONING_PATTERN.test(value)) reasons.push("bullet_reasoning");

  return {
    leaked: reasons.length > 0,
    reasons: Array.from(new Set(reasons)),
  };
}

module.exports = {
  detectReasoningLeak,
  isMaintenanceMode,
  LEAK_PATTERNS,
};
