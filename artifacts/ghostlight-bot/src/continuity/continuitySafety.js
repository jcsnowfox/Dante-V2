"use strict";

const { SENSITIVE_TYPES, PRIVATE_ONLY_TYPES, FORBIDDEN_FOLLOW_UP_PHRASES } = require("./continuityTypes");

/**
 * Gate: can this item be proactively delivered at all?
 *
 * Rules enforced:
 * 1. No UI config = no proactive fire.
 * 2. Sensitive item types require explicit sensitive_followups_allowed.
 * 3. Private-only types cannot go to public channels.
 * 4. Never guilt, shame, threaten, or manipulate.
 * 5. Quiet hours block proactive sends.
 * 6. Daily cap enforced externally (continuityScheduler).
 */
function canDeliverProactively({ item, config, channelContext = {}, logger }) {
  if (!config.continuity_enabled) {
    logger?.debug?.("[continuity] proactive blocked: engine disabled");
    return { allowed: false, reason: "engine_disabled" };
  }

  if (!config.proactive_followups_enabled) {
    logger?.debug?.("[continuity] proactive blocked: proactive_followups_enabled=false");
    return { allowed: false, reason: "proactive_disabled" };
  }

  if (SENSITIVE_TYPES.has(item.type) && !config.sensitive_followups_allowed) {
    logger?.debug?.("[continuity] proactive blocked: sensitive type without permission", { type: item.type });
    return { allowed: false, reason: "sensitive_type_blocked" };
  }

  const isPublicChannel = channelContext.isPublic === true || channelContext.channelType === "public";
  if (isPublicChannel && !config.public_channel_followups_allowed) {
    logger?.debug?.("[continuity] proactive blocked: public channel", { channelId: channelContext.channelId });
    return { allowed: false, reason: "public_channel_blocked" };
  }

  if (PRIVATE_ONLY_TYPES.has(item.type) && isPublicChannel) {
    logger?.debug?.("[continuity] proactive blocked: private-only type in public channel", { type: item.type });
    return { allowed: false, reason: "private_type_public_channel" };
  }

  return { allowed: true, reason: null };
}

/**
 * Gate: can this item appear in the passive prelude?
 * Prelude is injected into system context — never sent directly to the owner.
 */
function canAppearInPrelude({ item, config }) {
  if (!config.continuity_enabled) return false;

  // Private-only types can appear in prelude (they inform tone, not delivery)
  // but only as tonal guidance, never as direct text to owner.
  if (item.sensitivity === "restricted") return false;
  if (item.status === "cancelled" || item.status === "archived" || item.status === "expired") return false;

  return true;
}

/**
 * Scan follow-up text for forbidden patterns.
 * Returns { safe: bool, violations: string[] }
 */
function auditFollowUpText(text) {
  const lower = String(text || "").toLowerCase();
  const violations = FORBIDDEN_FOLLOW_UP_PHRASES.filter((phrase) => lower.includes(phrase));
  return { safe: violations.length === 0, violations };
}

/**
 * Gate: is this item within the allowed channel list?
 */
function isAllowedInChannel({ item, channelId }) {
  if (!item.allowedChannels || item.allowedChannels.length === 0) return true;
  return item.allowedChannels.includes(channelId);
}

module.exports = {
  canDeliverProactively,
  canAppearInPrelude,
  auditFollowUpText,
  isAllowedInChannel,
};
