/**
 * lifeEngine/relationshipEngine
 *
 * Phase 14 — relationships.
 *
 * A thin life-engine view over the avatar relationship store. It recognizes who
 * an avatar is (owner / family / friend / trusted / stranger), describes the
 * relationship in plain terms, and lists known people for autonomy decisions
 * (visit a friend, walk beside someone). It does not own identity resolution —
 * that lives in the recognition layer — it just adapts it for life-engine use.
 *
 * Safe with no DB: every avatar resolves to a generic "stranger".
 */

const CLOSE_TIERS = ["owner", "family", "friend", "trusted"];

function asText(value) {
  return value == null ? "" : String(value);
}

function strangerOf(avatarUuid) {
  return {
    avatarUuid: asText(avatarUuid),
    tier: "stranger",
    isOwner: false,
    relationshipType: "stranger",
    displayName: "",
    isKnown: false,
  };
}

function createRelationshipEngine({ secondLife = null, config = null, logger = null } = {}) {
  function mapRelationship(rel) {
    if (!rel) return null;
    const tier = asText(rel.tier || rel.relationshipType) || "stranger";
    return {
      avatarUuid: asText(rel.avatarUuid),
      tier,
      isOwner: rel.isOwner === true || tier === "owner",
      relationshipType: asText(rel.relationshipType || tier),
      displayName: asText(rel.displayName || rel.avatarName),
      isKnown: true,
    };
  }

  async function recognize({ companionId, avatarUuid } = {}) {
    if (!avatarUuid) return strangerOf("");
    if (!secondLife || typeof secondLife.getRelationshipByUuid !== "function") return strangerOf(avatarUuid);
    try {
      const rel = await secondLife.getRelationshipByUuid({ companionId, avatarUuid });
      return mapRelationship(rel) || strangerOf(avatarUuid);
    } catch (error) {
      logger?.warn?.("[life-engine] recognize failed.", { error: error.message });
      return strangerOf(avatarUuid);
    }
  }

  function describe(relationship) {
    if (!relationship || !relationship.isKnown) return "someone I don't know yet";
    const name = relationship.displayName ? ` (${relationship.displayName})` : "";
    if (relationship.isOwner) return `my owner${name}`;
    return `a ${relationship.relationshipType || relationship.tier}${name}`;
  }

  function isClose(relationship) {
    return Boolean(relationship) && CLOSE_TIERS.includes(asText(relationship.tier));
  }

  async function listKnown({ companionId, relationshipType } = {}) {
    if (!secondLife || typeof secondLife.listRelationships !== "function") return [];
    try {
      const rows = await secondLife.listRelationships({ companionId, relationshipType });
      return Array.isArray(rows) ? rows.map(mapRelationship).filter(Boolean) : [];
    } catch (error) {
      logger?.warn?.("[life-engine] listKnown failed.", { error: error.message });
      return [];
    }
  }

  return { recognize, describe, isClose, listKnown, CLOSE_TIERS };
}

module.exports = {
  createRelationshipEngine,
  CLOSE_TIERS,
};
