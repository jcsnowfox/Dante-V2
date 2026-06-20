/**
 * lifeEngine/sharedExperienceEngine
 *
 * Phase 17 — shared experience history.
 *
 * Tracks the meaningful, shared history between the companion and its owner:
 * first meeting, first dance, first trip, favorite cafe/beach/club/venue,
 * running jokes, meaningful conversations, owner-called moments, photos, gifts,
 * landmarks, promises, open loops. Everything is written to the shared store
 * (`second_life_shared_experiences`) AND mirrored into the life journal, so the
 * same history is readable from BOTH Discord and Second Life.
 *
 * Like the rest of the life engine: with no database every method degrades to a
 * safe no-op / empty list and never throws.
 */

const EXPERIENCE_TYPES = [
  "first_meeting",
  "first_dance",
  "first_trip",
  "favorite_cafe",
  "favorite_beach",
  "favorite_club",
  "favorite_venue",
  "running_joke",
  "meaningful_conversation",
  "owner_called_moment",
  "photo",
  "gift",
  "landmark",
  "promise",
  "open_loop",
  "moment",
];

// Milestones are the "firsts" and standing favorites worth surfacing as headline
// history rather than ordinary moments.
const MILESTONE_TYPES = new Set([
  "first_meeting",
  "first_dance",
  "first_trip",
  "favorite_cafe",
  "favorite_beach",
  "favorite_club",
  "favorite_venue",
]);

function asText(value) {
  return value == null ? "" : String(value);
}

function normalizeType(type) {
  const t = asText(type).trim().toLowerCase();
  return EXPERIENCE_TYPES.includes(t) ? t : "moment";
}

function createSharedExperienceEngine({ secondLife = null, config = null, logger = null } = {}) {
  function hasStore(method) {
    return secondLife && typeof secondLife[method] === "function";
  }

  /**
   * Record a shared experience. Requires real content (a title or body) — there
   * is no fabricated-history path. Mirrors the entry into the life journal so
   * both surfaces can recall it. Returns the stored experience or null.
   */
  async function recordExperience({
    companionId,
    experienceType = "moment",
    title = "",
    body = "",
    locationContext = null,
    peopleContext = [],
    isMilestone = null,
    occurredAt = null,
  } = {}) {
    if (!asText(title) && !asText(body)) return null;
    if (!hasStore("upsertSharedExperience")) return null;
    const type = normalizeType(experienceType);
    const milestone = isMilestone == null ? MILESTONE_TYPES.has(type) : Boolean(isMilestone);
    let stored = null;
    try {
      stored = await secondLife.upsertSharedExperience({
        companionId,
        experienceType: type,
        title: asText(title),
        body: asText(body),
        locationContext,
        peopleContext,
        isMilestone: milestone,
        occurredAt,
      });
    } catch (error) {
      logger?.warn?.("[life-engine] recordExperience (shared) failed.", { error: error.message });
      return null;
    }
    // Mirror to the shared journal so Discord + SL read the same history. Never
    // let a journal hiccup lose the primary record.
    if (stored && hasStore("appendJournalEntry")) {
      try {
        await secondLife.appendJournalEntry({
          companionId,
          entryType: "shared_experience",
          title: asText(title) || `Shared a ${type.replace(/_/g, " ")}`,
          body: asText(body),
          locationContext: locationContext || null,
          peopleContext: Array.isArray(peopleContext) ? peopleContext : [],
        });
      } catch (error) {
        logger?.debug?.("[life-engine] shared-experience journal mirror failed.", { error: error.message });
      }
    }
    return stored;
  }

  /**
   * Convenience for recording a headline milestone (forces isMilestone = true).
   */
  async function recordMilestone(args = {}) {
    return recordExperience({ ...args, isMilestone: true });
  }

  async function list({ companionId, experienceType, limit = 50 } = {}) {
    if (!hasStore("listSharedExperiences")) return [];
    try {
      return await secondLife.listSharedExperiences({ companionId, experienceType, limit });
    } catch (error) {
      logger?.warn?.("[life-engine] listSharedExperiences failed.", { error: error.message });
      return [];
    }
  }

  async function listMilestones({ companionId, limit = 50 } = {}) {
    if (!hasStore("listSharedExperiences")) return [];
    try {
      return await secondLife.listSharedExperiences({ companionId, milestonesOnly: true, limit });
    } catch (error) {
      logger?.warn?.("[life-engine] listMilestones failed.", { error: error.message });
      return [];
    }
  }

  async function getByType({ companionId, experienceType, limit = 20 } = {}) {
    if (!experienceType) return [];
    return list({ companionId, experienceType: normalizeType(experienceType), limit });
  }

  return {
    recordExperience,
    recordMilestone,
    list,
    listMilestones,
    getByType,
    normalizeType,
    EXPERIENCE_TYPES,
    MILESTONE_TYPES,
  };
}

module.exports = {
  createSharedExperienceEngine,
  EXPERIENCE_TYPES,
  MILESTONE_TYPES,
};
