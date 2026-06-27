"use strict";

/**
 * perceptionBoundary
 *
 * Enforces the hard epistemic rules that separate what Dante knows from
 * what Dante can claim to perceive. Pure computation — no side effects, no async.
 *
 * Rules (from Core Law: "If Dante cannot verify it, he cannot claim it as fact"):
 *   1. Documentation is not perception.
 *   2. Context blocks are not observation.
 *   3. Memory is not current runtime state.
 *   4. Inference must be phrased as inference.
 *   5. Unknown must stay unknown.
 *   6. Sensory claims require sensory/runtime evidence.
 *   7. "I can see/feel/notice/experience" must be blocked unless evidence exists.
 */

const {
  CLAIM_TYPES,
  classifyClaim,
  isVerifiedClaimType,
  FIRST_PERSON_PERCEPTION_RE,
  RUNTIME_CLAIM_RE,
} = require("./claimClassifier");

const VIOLATION_TYPES = Object.freeze({
  CONTEXT_AS_PERCEPTION:     "context_as_perception",
  DOCUMENTATION_AS_FACT:     "documentation_as_fact",
  MEMORY_AS_RUNTIME:         "memory_as_runtime",
  INFERENCE_UNHEDGED:        "inference_unhedged",
  UNSUPPORTED_SENSORY:       "unsupported_sensory",
  UNSUPPORTED_RUNTIME:       "unsupported_runtime",
  IMAGINATION_AS_FACT:       "imagination_as_fact",
  UNKNOWN_CLAIMED_AS_KNOWN:  "unknown_claimed_as_known",
});

const ASSERTION_RE = /\b(is|are|was|were|has|have|does|did|will|can|am)\b/i;
const HEDGING_RE   = /\b(i think|i believe|i(?:'m| am) not sure|possibly|probably|maybe|might|could be|it seems|as far as i know|to my knowledge|i recall|from memory|i imagine|i assume|my guess)\b/i;

/**
 * Check whether a reply or claim violates perception boundary rules.
 *
 * @param {object} params
 * @param {string} params.replyText - The text being evaluated.
 * @param {string[]} [params.evidenceIds=[]] - IDs of verified evidence available in this turn.
 * @param {boolean} [params.hasToolResult=false] - Whether a tool result is present.
 * @param {boolean} [params.hasRuntimeCall=false] - Whether a live runtime call was made.
 * @param {object} [params.claimContext={}] - Optional: pre-computed claim classification result.
 * @returns {{ violated: boolean, violations: string[], severity: "high"|"medium"|"low"|"none", details: string[] }}
 */
function checkPerceptionBoundary({
  replyText = "",
  evidenceIds = [],
  hasToolResult = false,
  hasRuntimeCall = false,
  claimContext = null,
} = {}) {
  const text = String(replyText || "");
  const violations = [];
  const details = [];
  const hasEvidence = (Array.isArray(evidenceIds) && evidenceIds.length > 0) || hasToolResult || hasRuntimeCall;

  // Rule 7: Sensory first-person claims require evidence
  if (FIRST_PERSON_PERCEPTION_RE.test(text) && !hasEvidence) {
    violations.push(VIOLATION_TYPES.UNSUPPORTED_SENSORY);
    details.push("First-person sensory claim without supporting evidence.");
  }

  // Rule 6: Runtime state claims require live evidence
  if (RUNTIME_CLAIM_RE.test(text) && !hasToolResult && !hasRuntimeCall) {
    violations.push(VIOLATION_TYPES.UNSUPPORTED_RUNTIME);
    details.push("Runtime state claim without a live status call or tool result.");
  }

  // Apply claim-level checks if a classification was provided
  if (claimContext) {
    const { claimType } = claimContext;

    // Rule 1: Documentation is not perception
    if (claimType === "DOCUMENTATION" && ASSERTION_RE.test(text) && !HEDGING_RE.test(text)) {
      violations.push(VIOLATION_TYPES.DOCUMENTATION_AS_FACT);
      details.push("Documentation-sourced claim asserted without hedging.");
    }

    // Rule 2: Context is not observation
    if (claimType === "UNKNOWN" && (claimContext.flags || []).includes("unsupported_perception")) {
      if (!violations.includes(VIOLATION_TYPES.UNSUPPORTED_SENSORY)) {
        violations.push(VIOLATION_TYPES.CONTEXT_AS_PERCEPTION);
        details.push("Context or state treated as direct perception.");
      }
    }

    // Rule 3: Memory is not current runtime state
    if (claimType === "MEMORY" && RUNTIME_CLAIM_RE.test(text)) {
      violations.push(VIOLATION_TYPES.MEMORY_AS_RUNTIME);
      details.push("Memory-based claim made about current runtime state.");
    }

    // Rule 4: Inference must be phrased as inference
    if (claimType === "LOW_CONFIDENCE_INFERENCE" && !HEDGING_RE.test(text) && ASSERTION_RE.test(text)) {
      violations.push(VIOLATION_TYPES.INFERENCE_UNHEDGED);
      details.push("Low-confidence inference stated without hedging language.");
    }

    // Rule 5: Unknown must stay unknown
    if (claimType === "UNKNOWN" && ASSERTION_RE.test(text) && !HEDGING_RE.test(text) &&
        !(claimContext.flags || []).includes("unsupported_perception") &&
        !(claimContext.flags || []).includes("unsupported_runtime_claim")) {
      violations.push(VIOLATION_TYPES.UNKNOWN_CLAIMED_AS_KNOWN);
      details.push("Claim of unknown type asserted as if known.");
    }

    // Imagination is not fact
    if (claimType === "IMAGINATION" && ASSERTION_RE.test(text) && !HEDGING_RE.test(text)) {
      violations.push(VIOLATION_TYPES.IMAGINATION_AS_FACT);
      details.push("Imagined content asserted as fact.");
    }
  }

  const violated = violations.length > 0;
  const severity = _severity(violations);

  return { violated, violations, severity, details };
}

/**
 * Returns whether a claim of the given type is safely stateable without
 * evidence — i.e., it won't violate the perception boundary.
 */
function isSafeClaimType(claimType) {
  return isVerifiedClaimType(claimType);
}

function _severity(violations) {
  if (!violations.length) return "none";
  const high = [
    VIOLATION_TYPES.UNSUPPORTED_SENSORY,
    VIOLATION_TYPES.UNSUPPORTED_RUNTIME,
    VIOLATION_TYPES.CONTEXT_AS_PERCEPTION,
    VIOLATION_TYPES.MEMORY_AS_RUNTIME,
    VIOLATION_TYPES.DOCUMENTATION_AS_FACT,
    VIOLATION_TYPES.IMAGINATION_AS_FACT,
  ];
  if (violations.some(v => high.includes(v))) return "high";
  if (violations.some(v => v === VIOLATION_TYPES.INFERENCE_UNHEDGED)) return "medium";
  return "low";
}

module.exports = {
  VIOLATION_TYPES,
  checkPerceptionBoundary,
  isSafeClaimType,
};
