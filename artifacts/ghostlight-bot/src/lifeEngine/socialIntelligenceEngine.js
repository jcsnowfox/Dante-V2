/**
 * lifeEngine/socialIntelligenceEngine
 *
 * Phase 14 — social intelligence.
 *
 * Given the surroundings and the current behavioral state, decide a high-level
 * social posture: greet someone, join a conversation, stay idle, respect privacy,
 * or leave a private space. This only proposes intent; the adapter/command queue
 * decide whether and how to act on it.
 *
 * Pure module: no I/O. Privacy is always respected — a private context never
 * yields "greet" or "join".
 */

const SOCIAL_ACTIONS = ["greet", "join", "idle", "respect_privacy", "leave"];

/**
 * @param {object} args
 * @param {Array}  args.nearbyAvatars
 * @param {string} args.state            behavioral state from emotionalStateEngine
 * @param {boolean} args.ownerPresent
 * @param {boolean} args.inPrivate       owner-flagged private space / conversation
 * @returns {{ action: string, reason: string }}
 */
function decideSocialAction({ nearbyAvatars = [], state = "", ownerPresent = false, inPrivate = false } = {}) {
  const behavioral = String(state || "").toLowerCase();
  const count = Array.isArray(nearbyAvatars) ? nearbyAvatars.length : Number(nearbyAvatars) || 0;

  if (inPrivate) {
    // Never intrude. Leave unless the owner is the one present.
    if (ownerPresent) return { action: "idle", reason: "private_with_owner" };
    return { action: "leave", reason: "respect_privacy" };
  }

  if (count === 0) return { action: "idle", reason: "no_one_around" };

  if (behavioral === "quiet" || behavioral === "tired" || behavioral === "focused") {
    return { action: "respect_privacy", reason: "withdrawn_state" };
  }

  if (ownerPresent) return { action: "greet", reason: "owner_present" };

  if (behavioral === "social" || behavioral === "playful") {
    return count > 1 ? { action: "join", reason: "social_state_group" } : { action: "greet", reason: "social_state" };
  }

  if (behavioral === "curious" || behavioral === "adventurous") {
    return { action: "greet", reason: "open_state" };
  }

  return { action: "idle", reason: "default" };
}

module.exports = {
  SOCIAL_ACTIONS,
  decideSocialAction,
};
