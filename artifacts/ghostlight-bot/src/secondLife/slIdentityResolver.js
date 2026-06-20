/**
 * secondLife/slIdentityResolver
 *
 * Phase 7 / Phase 21 — identity and relationship recognition.
 *
 * Resolves both avatar and object identities from the configurable People +
 * Objects registry. The avatar UUID is the primary key for avatars; objects can
 * be matched by UUID or by description token (for LSL objects that embed an
 * owner UUID in their description).
 *
 * Resolution order:
 *   1. avatarUuid → second_life_avatar_relationships (companion_id + avatar_uuid)
 *   2. objectUuid → second_life_object_relationships (companion_id + object_uuid)
 *   3. objectDescription → second_life_object_relationships where
 *      object_description_token is non-empty and description contains the token
 *   4. No match → unknown/stranger identity
 *
 * Tier precedence (highest first):
 *   blocked > owner > family > friend > trusted > known > stranger
 *
 * Blocked/banned wins over every other flag.
 *
 * With no database the resolver degrades safely: every identity resolves to a
 * stranger/unknown with default public permissions, and nothing throws.
 */

const TIER_ORDER = ["blocked", "owner", "family", "friend", "trusted", "known", "stranger"];

const VALID_REPLY_POLICIES = new Set([
  "banned",
  "always_allowed",
  "allowed_if_mentioned",
  "ambient_only",
  "ignore",
]);

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

/**
 * Normalise a replyPolicy value. "banned" and "ignore" are effectively the same
 * for non-reply but "banned" also prevents memory saves. Falls back to
 * "allowed_if_mentioned" for unknown values.
 */
function normalizeReplyPolicy(raw) {
  const v = asText(raw).toLowerCase().trim();
  return VALID_REPLY_POLICIES.has(v) ? v : "allowed_if_mentioned";
}

function createIdentityResolver({ secondLife = null, config = null, logger = null } = {}) {
  async function resolveAvatar({ companionId, avatarUuid, avatarName = "" } = {}) {
    const uuid = asText(avatarUuid).trim();
    let relationship = null;

    if (uuid && secondLife && typeof secondLife.getRelationshipByUuid === "function") {
      try {
        relationship = await secondLife.getRelationshipByUuid({ companionId, avatarUuid: uuid });
      } catch (error) {
        logger?.warn?.("[second-life] avatar identity resolve failed; treating as stranger.", {
          error: error.message,
        });
        relationship = null;
      }
    }

    const tier = deriveTier(relationship);
    const permissions = derivePermissions(tier, relationship);
    const replyPolicy = relationship ? normalizeReplyPolicy(relationship.replyPolicy) : "allowed_if_mentioned";

    const resolvedAvatarName = asText(relationship?.avatarName) || asText(avatarName);
    // Preferred identity name: used as the model-facing speaker label.
    // Priority: nickname → preferredDisplayName → displayLabel → raw avatar name.
    // This lets an alternate-avatar record (e.g. AngelDust Corvinus → Jenna) be
    // recognised correctly without the model seeing only the raw SL account name.
    const displayName = asText(relationship?.nickname)
      || asText(relationship?.preferredDisplayName)
      || asText(relationship?.displayLabel)
      || resolvedAvatarName;

    return {
      sourceType: "avatar",
      uuid,
      name: resolvedAvatarName,
      // displayName is the preferred identity the model should call this person by.
      displayName,
      nickname: relationship?.nickname || "",
      preferredDisplayName: relationship?.preferredDisplayName || "",
      identityNote: relationship?.identityNote || "",
      displayLabel: relationship?.displayLabel || "",
      category: relationship?.category || "",
      relationshipType: asText(relationship?.relationshipType) || tier,
      relationshipToUser: relationship?.relationshipToUser || "",
      relationshipToCompanion: relationship?.relationshipToCompanion || "",
      trustLevel: tier,
      replyPolicy,
      isOwner: tier === "owner",
      isFamily: tier === "family",
      isFriend: tier === "friend",
      isTrusted: tier === "trusted",
      isBlocked: tier === "blocked",
      isObject: false,
      isKnown: Boolean(relationship && relationship.id),
      permissions,
      childSafeOnly: Boolean(relationship?.childSafeOnly),
      alwaysRespond: Boolean(relationship?.alwaysRespond),
      neverRespond: Boolean(relationship?.neverRespond),
      publicIdentityContextEnabled: relationship ? (relationship.publicIdentityContextEnabled !== false) : true,
      localChatChatterEnabled: relationship ? (relationship.localChatChatterEnabled !== false) : true,
      minSecondsBetweenReplies: Number(relationship?.minSecondsBetweenReplies || 0),
      lastReplyAt: relationship?.lastReplyAt || null,
      notes: relationship?.notes || "",
      rawRelationship: relationship,
      // Legacy compatibility
      avatarUuid: uuid,
      avatarName: resolvedAvatarName,
      relationship,
      tier,
      isStranger: tier === "stranger",
    };
  }

  async function resolveObject({ companionId, objectUuid = "", objectName = "", objectDescription = "" } = {}) {
    let objRel = null;

    if (objectUuid && secondLife && typeof secondLife.getObjectRelationshipByUuid === "function") {
      try {
        objRel = await secondLife.getObjectRelationshipByUuid({ companionId, objectUuid });
      } catch (error) {
        logger?.warn?.("[second-life] object uuid identity resolve failed.", { error: error.message });
      }
    }

    if (!objRel && objectDescription && secondLife && typeof secondLife.getObjectRelationshipByDescriptionToken === "function") {
      try {
        objRel = await secondLife.getObjectRelationshipByDescriptionToken({ companionId, objectDescription });
      } catch (error) {
        logger?.warn?.("[second-life] object description token resolve failed.", { error: error.message });
      }
    }

    if (!objRel) {
      return {
        sourceType: "object",
        uuid: objectUuid || "",
        name: objectName || "",
        nickname: "",
        category: "",
        relationshipToUser: "",
        relationshipToCompanion: "",
        trustLevel: "unknown",
        replyPolicy: "ignore",
        isOwner: false,
        isFamily: false,
        isFriend: false,
        isTrusted: false,
        isBlocked: false,
        isObject: true,
        isKnown: false,
        permissions: { chat: false, follow: false, privateMemory: false },
        childSafeOnly: false,
        alwaysRespond: false,
        neverRespond: false,
        publicIdentityContextEnabled: false,
        localChatChatterEnabled: false,
        minSecondsBetweenReplies: 180,
        lastReplyAt: null,
        notes: "",
        rawRelationship: null,
        // Legacy compat
        avatarUuid: objectUuid || "",
        avatarName: objectName || "",
        relationship: null,
        tier: "stranger",
        isStranger: true,
      };
    }

    const replyPolicy = normalizeReplyPolicy(objRel.replyPolicy);
    const trustLevel = objRel.trustLevel || "known";
    const isFamilyChild = trustLevel === "family_child" || objRel.category === "family_child_object";
    const isBlocked = replyPolicy === "banned";

    return {
      sourceType: "object",
      uuid: objRel.objectUuid || objectUuid || "",
      name: objRel.objectName || objectName || "",
      nickname: objRel.nickname || "",
      category: objRel.category || "",
      relationshipToUser: objRel.relationshipToUser || "",
      relationshipToCompanion: objRel.relationshipToCompanion || "",
      trustLevel,
      replyPolicy,
      isOwner: false,
      isFamily: isFamilyChild,
      isFriend: false,
      isTrusted: trustLevel === "trusted" || trustLevel === "family",
      isBlocked,
      isObject: true,
      isKnown: true,
      permissions: {
        chat: objRel.privateChannelAllowed || false,
        follow: false,
        privateMemory: false,
      },
      childSafeOnly: Boolean(objRel.childSafeOnly),
      alwaysRespond: Boolean(objRel.alwaysRespond),
      neverRespond: Boolean(objRel.neverRespond),
      publicIdentityContextEnabled: objRel.publicIdentityContextEnabled !== false,
      localChatChatterEnabled: objRel.localChatChatterEnabled !== false,
      minSecondsBetweenReplies: Number(objRel.minSecondsBetweenReplies || 180),
      lastReplyAt: objRel.lastReplyAt || null,
      notes: objRel.notes || "",
      rawRelationship: objRel,
      // Legacy compat
      avatarUuid: objRel.objectUuid || objectUuid || "",
      avatarName: objRel.nickname || objRel.objectName || objectName || "",
      relationship: objRel,
      tier: isBlocked ? "blocked" : (isFamilyChild ? "family" : "known"),
      isStranger: false,
    };
  }

  /**
   * Main resolve entry point. Routes to avatar or object resolution based on
   * which identifiers are present. sourceType hint can be "avatar" or "object".
   */
  async function resolve({
    companionId,
    avatarUuid = "",
    avatarName = "",
    objectUuid = "",
    objectName = "",
    objectDescription = "",
    sourceType = "",
  } = {}) {
    const resolvedSourceType = asText(sourceType).toLowerCase().trim();

    // Explicit object source type or object fields present — try object first.
    if (resolvedSourceType === "object" || (!avatarUuid && (objectUuid || objectDescription))) {
      return resolveObject({ companionId, objectUuid, objectName, objectDescription });
    }

    // Avatar path (default).
    const result = await resolveAvatar({ companionId, avatarUuid, avatarName });

    // If no avatar record found but we have object fields, try object resolution as fallback.
    if (!result.isKnown && (objectUuid || objectDescription)) {
      const objResult = await resolveObject({ companionId, objectUuid, objectName, objectDescription });
      if (objResult.isKnown) return objResult;
    }

    return result;
  }

  return { resolve, resolveAvatar, resolveObject };
}

module.exports = {
  createIdentityResolver,
  deriveTier,
  derivePermissions,
  normalizeReplyPolicy,
  TIER_ORDER,
  VALID_REPLY_POLICIES,
};
