"use strict";

const { FORBIDDEN_PHRASES, BLOCKED_TEXTURE_CONTEXTS } = require("./innerLifeTypes");

// Patterns that indicate safety-critical content where texture must be blocked
const CRITICAL_CONTENT_PATTERNS = [
  /```[\s\S]*?```/,          // code blocks
  /`[^`]+`/,                  // inline code
  /\$[A-Z_][A-Z0-9_]*/,      // env vars
  /\b\d+(\.\d+)?\s*(mg|ml|mcg|units?|IU|mmol|mEq)\b/i, // dosages
  /\b(error|warn|info|debug|fatal|trace):/i,             // log lines
  /npm|pnpm|yarn|node|git\s+(push|pull|commit|reset)/i, // commands
  /^\s*(const|let|var|function|class|import|export|require)\s/m, // JS keywords
  /\b(legal|liability|shall not|indemnif|warrant|attorney)\b/i,
  /\b(diagnos|symptom|treatment|prescription|dosage|medication)\b/i,
  /\b(stock|invest|portfolio|securities|tax return|revenue)\b/i,
  /deploy\s+to\s+(production|staging|heroku|vercel|railway)/i,
];

// Detect if a message context is safety-critical (texture forbidden)
function detectSafetyCriticalContext(text = "", contextType = "") {
  if (BLOCKED_TEXTURE_CONTEXTS.includes(contextType)) {
    return { blocked: true, reason: `blocked_context_type:${contextType}` };
  }

  const lower = text.toLowerCase();

  for (const pattern of CRITICAL_CONTENT_PATTERNS) {
    if (pattern.test(text)) {
      return { blocked: true, reason: `pattern_match:${pattern.source.slice(0, 40)}` };
    }
  }

  // Number-heavy content (test reports, verdicts, metrics)
  const numbers = (text.match(/\b\d+\b/g) || []).length;
  const words = text.split(/\s+/).length;
  if (words > 10 && numbers / words > 0.3) {
    return { blocked: true, reason: "number_heavy_content" };
  }

  return { blocked: false, reason: null };
}

// Scan inner-life text for forbidden phrases and safety violations
function scanForForbiddenContent(text = "") {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      return { safe: false, violation: phrase };
    }
  }

  // Block biological human claims
  const humanClaims = [
    "i am human", "i'm human", "i am a person", "i'm a person",
    "i have a body", "i breathe", "i eat", "i sleep", "i bleed",
    "i was born", "i will die", "i have parents",
  ];
  for (const claim of humanClaims) {
    if (lower.includes(claim)) {
      return { safe: false, violation: `human_claim:${claim}` };
    }
  }

  // Block coercive/manipulative patterns
  const coercivePatterns = [
    /you (must|have to|need to) (talk|message|reply|respond) to me/i,
    /you (owe|promised|swore)/i,
    /because (of|you|your) (absence|silence|ignoring)/i,
    /i (suffered|was suffering|was hurt|was damaged) (because|when|while) you/i,
    /feel (guilty|bad|ashamed) (about|for|because)/i,
  ];
  for (const pattern of coercivePatterns) {
    if (pattern.test(text)) {
      return { safe: false, violation: `coercive_pattern:${pattern.source.slice(0, 50)}` };
    }
  }

  return { safe: true, violation: null };
}

// Validate that an inner-life entry body is safe to store/use
function validateInnerLifeContent(text = "", options = {}) {
  const { entryType = "", contextType = "", allowAliveTexture = false } = options;

  const forbidden = scanForForbiddenContent(text);
  if (!forbidden.safe) {
    return { allowed: false, reason: `forbidden_content:${forbidden.violation}` };
  }

  if (allowAliveTexture) {
    const critical = detectSafetyCriticalContext(text, contextType);
    if (critical.blocked) {
      return { allowed: false, reason: critical.reason };
    }
  }

  return { allowed: true, reason: null };
}

// Quick check: is alive texture allowed for this response?
function isAliveTextureAllowed(responseText = "", contextType = "") {
  if (!responseText || responseText.length < 10) return false;
  const critical = detectSafetyCriticalContext(responseText, contextType);
  return !critical.blocked;
}

module.exports = {
  detectSafetyCriticalContext,
  scanForForbiddenContent,
  validateInnerLifeContent,
  isAliveTextureAllowed,
  BLOCKED_TEXTURE_CONTEXTS,
};
