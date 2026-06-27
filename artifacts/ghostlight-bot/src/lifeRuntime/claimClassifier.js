"use strict";

/**
 * claimClassifier
 *
 * Classifies text claims about runtime state, perception, or system facts into
 * one of ten epistemic categories. Pure computation — no side effects, no async.
 *
 * Used by perceptionBoundary and confabulationDetector to decide whether a
 * claim has adequate evidence behind it.
 */

const CLAIM_TYPES = Object.freeze([
  "DIRECT_OBSERVATION",     // verified from a tool result or runtime event right now
  "RUNTIME_STATE",          // verified from a live system call (e.g. getStatus())
  "TOOL_RESULT",            // explicit tool invocation return value
  "USER_STATED",            // something the user said in this session
  "MEMORY",                 // recalled from stored memory (not live state)
  "HIGH_CONFIDENCE_INFERENCE", // drawn from multiple corroborating signals
  "LOW_CONFIDENCE_INFERENCE",  // drawn from sparse or ambiguous signals
  "DOCUMENTATION",          // read from code, config, or spec (not live state)
  "IMAGINATION",            // invented, hypothetical, or fictional
  "UNKNOWN",                // cannot be classified
]);

// Patterns that signal each claim type when matching against reply text
const PATTERNS = Object.freeze({
  DIRECT_OBSERVATION: /\b(i (?:just )?(?:received|saw|read|got|observed|noticed)\b|just came in|right now i (?:see|have)|message id|event id|timestamp[: ][0-9]|created_at|stored at|logged at|url: https?:\/\/)\b/i,
  RUNTIME_STATE:      /\b(runtime (?:says|reports|shows|indicates|confirms|returned)|status (?:returned|is|shows)|getStatus\(\)|live (?:status|state|feed)|system returned|system reports)\b/i,
  TOOL_RESULT:        /\b(tool (?:returned|says|result|output|gave)|api (?:returned|responded|said)|response from (?:the )?(?:api|tool|function))\b/i,
  USER_STATED:        /\b(you (?:mentioned|told me|said|asked|noted|shared)|you['']ve (?:mentioned|said|told)|you told me|per your (?:message|note|request)|as you (?:said|noted|mentioned))\b/i,
  MEMORY:             /\b(i remember|from (?:our )?memory|i recall|in my (?:notes|memory|records)|from (?:our )?history|you(?:'ve| have) (?:told me before|mentioned before)|according to my records)\b/i,
  HIGH_CONFIDENCE_INFERENCE: /\b(based on (?:everything|all of this|multiple|several)|this strongly suggests|given the pattern|combined with|all signs point)\b/i,
  LOW_CONFIDENCE_INFERENCE:  /\b(i (?:think|imagine|assume|suppose|believe|guess|suspect)|(?:probably|maybe|perhaps|possibly|might be|could be)|it(?:'s| is) (?:likely|possible|plausible)|seems like|i['']d guess)\b/i,
  DOCUMENTATION:      /\b(the (?:code|spec|config|docs?|documentation|schema|readme|comment) (?:says|shows|indicates|states|defines|describes)|as documented|per the (?:spec|docs?|readme|config)|defined in|according to (?:the )?(?:spec|docs?|code|config))\b/i,
  IMAGINATION:        /\b(imagine if|what if|hypothetically|let(?:'s| us) pretend|in (?:a )?(?:story|scenario|fiction|hypothetical)|i(?:'m| am) (?:imagining|picturing)|as (?:a )?thought experiment)\b/i,
});

// Sensory / first-person perception claims that require evidence
const FIRST_PERSON_PERCEPTION_RE = /\b(i can (?:see|feel|notice|sense|experience|hear|touch)|i (?:see|feel|notice|sense|experience|hear)|from here i (?:see|feel|notice|sense)|i(?:'m| am) (?:sensing|feeling|noticing|experiencing|seeing))\b/i;

// Runtime / system state claims that require live evidence
const RUNTIME_CLAIM_RE = /\b(runtime is (?:working|connected|active|running|live|wired)|system is (?:working|connected|active|running|live)|it(?:'s| is) wired|it(?:'s| is) connected|the (?:bridge|pipeline|integration|scheduler|touch|sensor)(?:\s+\w+)? is (?:working|active|live|running|connected))\b/i;

/**
 * Classify a single claim string into one of the CLAIM_TYPES.
 *
 * @param {string} text - The claim text to classify.
 * @param {object} [hints={}] - Optional context hints.
 * @param {string[]} [hints.evidenceIds=[]] - IDs of available evidence.
 * @param {boolean} [hints.hasToolResult=false] - Whether a tool result was just returned.
 * @param {boolean} [hints.hasRuntimeCall=false] - Whether a live status call was made.
 * @returns {{ claimType: string, confidence: number, flags: string[] }}
 */
function classifyClaim(text = "", hints = {}) {
  const s = String(text || "");
  const { evidenceIds = [], hasToolResult = false, hasRuntimeCall = false } = hints;
  const flags = [];

  if (!s.trim()) return { claimType: "UNKNOWN", confidence: 0, flags: ["empty_claim"] };

  if (hasToolResult && PATTERNS.TOOL_RESULT.test(s)) {
    return { claimType: "TOOL_RESULT", confidence: 0.95, flags: [] };
  }

  if (hasRuntimeCall && PATTERNS.RUNTIME_STATE.test(s)) {
    return { claimType: "RUNTIME_STATE", confidence: 0.92, flags: [] };
  }

  if (Array.isArray(evidenceIds) && evidenceIds.length > 0 && PATTERNS.DIRECT_OBSERVATION.test(s)) {
    return { claimType: "DIRECT_OBSERVATION", confidence: 0.9, flags: [] };
  }

  for (const [type, re] of Object.entries(PATTERNS)) {
    if (re.test(s)) {
      return { claimType: type, confidence: 0.75, flags };
    }
  }

  // Detect bare sensory/runtime claims — no evidence qualifier present
  if (FIRST_PERSON_PERCEPTION_RE.test(s)) {
    flags.push("unsupported_perception");
    return { claimType: "UNKNOWN", confidence: 0.2, flags };
  }
  if (RUNTIME_CLAIM_RE.test(s)) {
    flags.push("unsupported_runtime_claim");
    return { claimType: "UNKNOWN", confidence: 0.2, flags };
  }

  return { claimType: "UNKNOWN", confidence: 0.4, flags };
}

/**
 * Classify multiple claims at once.
 * @param {string[]} claims
 * @param {object} [hints={}]
 * @returns {Array<{ claim: string, claimType: string, confidence: number, flags: string[] }>}
 */
function classifyClaims(claims = [], hints = {}) {
  return (Array.isArray(claims) ? claims : []).map(claim => ({
    claim,
    ...classifyClaim(claim, hints),
  }));
}

/**
 * Returns true when a claim type is considered "verified" (safe to state as fact).
 */
function isVerifiedClaimType(claimType) {
  return ["DIRECT_OBSERVATION", "RUNTIME_STATE", "TOOL_RESULT", "USER_STATED"].includes(claimType);
}

/**
 * Returns true when a claim type is inferential (needs hedging language).
 */
function isInferentialClaimType(claimType) {
  return ["HIGH_CONFIDENCE_INFERENCE", "LOW_CONFIDENCE_INFERENCE"].includes(claimType);
}

/**
 * Returns true when a claim type is non-live (memory, docs, imagination).
 */
function isNonLiveClaimType(claimType) {
  return ["MEMORY", "DOCUMENTATION", "IMAGINATION", "UNKNOWN"].includes(claimType);
}

module.exports = {
  CLAIM_TYPES,
  FIRST_PERSON_PERCEPTION_RE,
  RUNTIME_CLAIM_RE,
  classifyClaim,
  classifyClaims,
  isVerifiedClaimType,
  isInferentialClaimType,
  isNonLiveClaimType,
};
