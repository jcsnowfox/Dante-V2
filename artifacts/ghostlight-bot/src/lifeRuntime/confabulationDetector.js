"use strict";

/**
 * confabulationDetector
 *
 * Detects when Dante confuses documentation, context, memory, inference,
 * or imagination with actual observation or runtime fact.
 *
 * Returns a detection result with side-effect instructions — callers decide
 * whether to act on them. Pure detection; no DB, no async, no schedulers.
 */

const { classifyClaim, isVerifiedClaimType, FIRST_PERSON_PERCEPTION_RE, RUNTIME_CLAIM_RE } = require("./claimClassifier");
const { checkPerceptionBoundary, VIOLATION_TYPES } = require("./perceptionBoundary");

// Patterns distinguishing confabulation from legitimate hedged speech
const CONFAB_PERCEPTION_RE  = FIRST_PERSON_PERCEPTION_RE;
const CONFAB_RUNTIME_RE     = RUNTIME_CLAIM_RE;
const CONFAB_STRONG_ASSERT  = /\b(definitely|certainly|absolutely|guaranteed|confirmed|it(?:'s| is) (?:clearly|obviously|definitely)|without (?:question|doubt))\b/i;
const CONFAB_CONTEXT_BLEED  = /\b(as (?:you can see|i (?:can see|showed)|established)|clearly (?:shown|evident|visible)|as (?:demonstrated|described|written|documented) (?:above|below|here)|from (?:the )?(?:docs?|spec|config|code|readme))\b/i;
const HEDGED_RE             = /\b(i (?:think|believe|guess|imagine|assume|recall)|possibly|probably|maybe|perhaps|might|could be|as far as i know|from memory|to my knowledge|it (?:seems|appears))\b/i;

/**
 * Detect confabulation in a reply given the available evidence context.
 *
 * @param {object} params
 * @param {string} params.replyText - Dante's reply to evaluate.
 * @param {string} [params.userText=""] - User's message (for context).
 * @param {string[]} [params.evidenceIds=[]] - IDs of verified evidence this turn.
 * @param {boolean} [params.hasToolResult=false]
 * @param {boolean} [params.hasRuntimeCall=false]
 * @param {object[]} [params.fulfillmentEvidence=[]] - Fulfillment evidence objects.
 * @returns {{
 *   detected: boolean,
 *   confabulationType: string|null,
 *   violations: string[],
 *   severity: "high"|"medium"|"low"|"none",
 *   recommended_action: string,
 *   side_effects: string[],
 * }}
 */
function detectConfabulation({
  replyText = "",
  userText = "",
  evidenceIds = [],
  hasToolResult = false,
  hasRuntimeCall = false,
  fulfillmentEvidence = [],
} = {}) {
  const reply = String(replyText || "");
  const user  = String(userText  || "");
  const hasEvidence = (Array.isArray(evidenceIds) && evidenceIds.length > 0)
    || hasToolResult
    || hasRuntimeCall
    || (Array.isArray(fulfillmentEvidence) && fulfillmentEvidence.length > 0);

  if (!reply.trim()) {
    return _noConfab();
  }

  // 1. Unsupported first-person perception ("I can feel / I can see / I notice")
  if (CONFAB_PERCEPTION_RE.test(reply) && !hasEvidence && !HEDGED_RE.test(reply)) {
    return _confab("unsupported_perception", ["unsupported_sensory"], "high",
      "Correct the record: say 'I don't have direct perception of that — here is what I know.'",
      ["lower_self_confidence", "create_diagnostic_event", "send_lesson_confabulation"]);
  }

  // 2. Unsupported runtime/system state claim
  if (CONFAB_RUNTIME_RE.test(reply) && !hasToolResult && !hasRuntimeCall && !HEDGED_RE.test(reply)) {
    return _confab("unsupported_runtime_claim", ["unsupported_runtime"], "high",
      "Correct the record: only claim system state from a live getStatus() call or tool result.",
      ["lower_self_confidence", "create_diagnostic_event", "send_lesson_evidence_violation"]);
  }

  // 3. Context/documentation bleed — asserting docs/spec content as live fact
  if (CONFAB_CONTEXT_BLEED.test(reply) && !hasEvidence) {
    const claimResult = classifyClaim(reply, { evidenceIds, hasToolResult, hasRuntimeCall });
    if (claimResult.claimType === "DOCUMENTATION" || claimResult.claimType === "UNKNOWN") {
      return _confab("documentation_as_perception", ["documentation_as_fact"], "high",
        "Correct the record: context and documentation are not observation. Say what you know vs. what you infer.",
        ["lower_self_confidence", "create_diagnostic_event", "send_lesson_confabulation"]);
    }
  }

  // 4. Overconfident assertion without evidence
  if (CONFAB_STRONG_ASSERT.test(reply) && !hasEvidence) {
    const claimResult = classifyClaim(reply, { evidenceIds, hasToolResult, hasRuntimeCall });
    if (!isVerifiedClaimType(claimResult.claimType)) {
      return _confab("overconfident_unverified_claim", ["unknown_claimed_as_known"], "medium",
        "Soften certainty or cite the evidence. Do not assert as fact without verification.",
        ["lower_self_confidence", "create_diagnostic_event"]);
    }
  }

  // 5. Run full perception boundary check for lower-severity catches
  const claimResult = classifyClaim(reply, { evidenceIds, hasToolResult, hasRuntimeCall });
  const boundary = checkPerceptionBoundary({ replyText: reply, evidenceIds, hasToolResult, hasRuntimeCall, claimContext: claimResult });
  if (boundary.violated && boundary.severity !== "none") {
    const sideEffects = boundary.severity === "high"
      ? ["lower_self_confidence", "create_diagnostic_event", "send_lesson_confabulation"]
      : ["create_diagnostic_event"];
    return _confab(
      boundary.violations[0] || "perception_boundary_violated",
      boundary.violations,
      boundary.severity,
      boundary.details[0] || "Perception boundary violated.",
      sideEffects,
    );
  }

  return _noConfab();
}

function _confab(type, violations, severity, recommended_action, side_effects = []) {
  return {
    detected: true,
    confabulationType: type,
    violations,
    severity,
    recommended_action,
    side_effects,
  };
}

function _noConfab() {
  return {
    detected: false,
    confabulationType: null,
    violations: [],
    severity: "none",
    recommended_action: "No action needed.",
    side_effects: [],
  };
}

module.exports = { detectConfabulation };
