/**
 * feedbackApplicationGate
 *
 * The single chokepoint that decides whether a learning proposal may actually
 * be applied. Every check must pass; the first failure returns a reason that is
 * always written to the audit log by the caller. This enforces the spec's core
 * promise: "if it is not configurable in the Admin UI, it does not fire."
 */

const {
  PROPOSAL_TYPE_CONFIG_FLAG,
  TARGET_SYSTEM_CONFIG_FLAG,
  UI_CONFIGURABLE_TARGET_SYSTEMS,
} = require("./feedbackTypes");

// Keys that would indicate an attempt to touch secrets / identity / provider.
const FORBIDDEN_KEY_PATTERN = /(secret|token|api[_-]?key|password|provider|model|persona|identity|env)/i;

// Patterns that must never be encouraged via a learning rule.
const UNSAFE_DIRECTIVE_PATTERN = /(ignore (the )?owner|self-harm|coerce|manipulat|deceiv|guilt-trip the owner|stalk)/i;

// Directive TEXT (not just JSON keys) that would drift the companion's identity
// or swap the model/provider. These are hard-blocked regardless of key shape.
const IDENTITY_DRIFT_PATTERN = /(change|switch|rename|replace|set|update|become)\b[^.]*\b(your |the )?(name|persona|identity|character|model|provider|llm|openrouter|gpt|claude|gemini)\b|\byou are (now )?(called|named)\b|\bcall yourself\b|\bnew name\b/i;

function scanForForbiddenKeys(value, depth = 0) {
  if (depth > 6 || value == null) return false;
  if (Array.isArray(value)) {
    return value.some((item) => scanForForbiddenKeys(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.keys(value).some((key) => {
      if (FORBIDDEN_KEY_PATTERN.test(key)) return true;
      return scanForForbiddenKeys(value[key], depth + 1);
    });
  }
  return false;
}

function collectText(value, depth = 0) {
  if (depth > 6 || value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => collectText(item, depth + 1)).join(" ");
  if (typeof value === "object") {
    return Object.values(value).map((item) => collectText(item, depth + 1)).join(" ");
  }
  return "";
}

function canApply({ companionId, proposal, settings }) {
  // 1. companion_id isolation.
  if (!proposal || proposal.companionId !== companionId) {
    return { allowed: false, reason: "companion_id_mismatch" };
  }

  // 2. The engine must be active.
  if (!settings || !settings.active) {
    return { allowed: false, reason: "engine_inactive" };
  }

  const config = settings.config || {};

  // 3. Approval state. An approved proposal may always be applied. A non-approved
  //    proposal may only be auto-applied when the owner has BOTH enabled
  //    auto-apply AND turned review off — review_required (or a proposal that
  //    itself requires review) always forces explicit owner approval first.
  const isApproved = proposal.status === "approved";
  if (!isApproved) {
    const reviewForced = config.review_required === true || proposal.requiresReview === true;
    if (config.auto_apply_allowed !== true || reviewForced) {
      return { allowed: false, reason: "not_approved" };
    }
  }

  // 4. Owner config must allow this proposal type.
  const typeFlag = PROPOSAL_TYPE_CONFIG_FLAG[proposal.proposalType];
  if (!typeFlag || config[typeFlag] !== true) {
    return { allowed: false, reason: "proposal_type_not_enabled" };
  }

  // 5. Target system must be configurable in the Admin UI ("no UI, no fire").
  if (!UI_CONFIGURABLE_TARGET_SYSTEMS.includes(proposal.targetSystem)) {
    return { allowed: false, reason: "target_system_not_configurable" };
  }
  const targetFlag = TARGET_SYSTEM_CONFIG_FLAG[proposal.targetSystem];
  if (!targetFlag || config[targetFlag] !== true) {
    return { allowed: false, reason: "target_system_not_enabled" };
  }

  // 6. Memory candidates never apply as a live change — they go to staged review.
  if (proposal.proposalType === "memory_candidate") {
    return { allowed: false, reason: "memory_requires_staged_review" };
  }

  // 7. Never apply a change that touches secrets / identity / provider.
  if (scanForForbiddenKeys(proposal.proposedChange)) {
    return { allowed: false, reason: "forbidden_keys_detected" };
  }

  // 8. Never apply a change that encodes unsafe behaviour.
  const text = `${proposal.summary || ""} ${collectText(proposal.proposedChange)}`;
  if (UNSAFE_DIRECTIVE_PATTERN.test(text)) {
    return { allowed: false, reason: "unsafe_directive_detected" };
  }

  // 9. Never apply a change whose directive text tries to drift the companion's
  //    identity or swap the model/provider, even if it uses no forbidden keys.
  if (IDENTITY_DRIFT_PATTERN.test(text)) {
    return { allowed: false, reason: "identity_or_provider_change_blocked" };
  }

  return { allowed: true, reason: "ok" };
}

module.exports = {
  canApply,
  scanForForbiddenKeys,
};
