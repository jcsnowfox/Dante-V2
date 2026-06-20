/**
 * secondLife/slIdentityResolver
 *
 * Phase 7 — identity and relationship recognition.
 *
 * The Second Life avatar UUID is the single source of truth; the display name is
 * weak metadata only (avatars can rename freely). This resolver maps a UUID to a
 * stored relationship record, derives one canonical tier, and computes the
 * effective permission set the rest of the bridge enforces.
 *
 * Tier precedence (highest first):
 *   blocked > owner > family > friend > trusted > known > stranger
 *
 * With no database the resolver degrades safely: every avatar resolves to a
 * stranger with default public permissions, and nothing throws.
 */

const TIER_ORDER = ["blocked", "owner", "family", "friend", "trusted", "known", "stranger"];

function asText(value) {
  return value == null ? "" : String(value);
}

/**
 * Derive a single canonical tier from a relationship row. Role booleans win over
 * the free-text relationship_type label so an explicit owner/blocked flag can
 * never be downgraded by a stale label.
 */
function deriveTier(relationship) {
  if (!relationship) return "stranger";
  if (relationship.isBlocked) return "blocked";
  if (relationship.isOwner) return "owner";
  if (relationship.isFamily) return "family";
  if (relationship.isFriend) return "friend";
  if (relationship.isTrusted) return "trusted";
  const label = asText(relationship.relationshipType).toLowerCase();
  if (TIER_ORDER.includes(label) && label !== "stranger") return label;
  // A stored record that is not a higher tier and not explicitly "stranger" is
  // a "known" avatar (it has been recorded, but carries no elevated role).
  if (relationship.id) return label === "stranger" ? "stranger" : "known";
  return "stranger";
}

/**
 * Effective permissions for a tier + record. Owner always has full permissions.
 * Strangers never get follow or private-memory access regardless of stored flags.
 */
function derivePermissions(tier, relationship) {
  if (tier === "owner") {
    return { chat: true, follow: true, privateMemory: true };
  }
  if (tier === "blocked") {
    return { chat: false, follow: false, privateMemory: false };
  }
  const chat = relationship ? relationship.chatPermission !== false : true;
  const follow = Boolean(relationship?.followPermission) && tier !== "stranger";
  const privateMemory = Boolean(relationship?.privateMemoryPermission) && tier !== "stranger";
  return { chat, follow, privateMemory };
}

function createIdentityResolver({ secondLife = null, config = null, logger = null } = {}) {
  async function resolve({ companionId, avatarUuid, avatarName = "" } = {}) {
    const uuid = asText(avatarUuid).trim();
    let relationship = null;

    if (uuid && secondLife && typeof secondLife.getRelationshipByUuid === "function") {
      try {
        relationship = await secondLife.getRelationshipByUuid({ companionId, avatarUuid: uuid });
      } catch (error) {
        logger?.warn?.("[second-life] identity resolve failed; treating as stranger.", {
          error: error.message,
        });
        relationship = null;
      }
    }

    const tier = deriveTier(relationship);
    const permissions = derivePermissions(tier, relationship);

    return {
      avatarUuid: uuid,
      // Prefer the stored name (curated) but fall back to the weak event name.
      avatarName: asText(relationship?.avatarName) || asText(avatarName),
      relationship,
      tier,
      permissions,
      isOwner: tier === "owner",
      isBlocked: tier === "blocked",
      isStranger: tier === "stranger",
      isKnown: Boolean(relationship && relationship.id),
    };
  }

  return { resolve };
}

module.exports = {
  createIdentityResolver,
  deriveTier,
  derivePermissions,
  TIER_ORDER,
};
