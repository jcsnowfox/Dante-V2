/**
 * lifeEngine/memoryEngineBridge
 *
 * Phase 14 — memory.
 *
 * A small bridge between the life engine and the persistent life journal
 * (`second_life_life_journal`). The life engine records experiences (places
 * visited, events attended, things that happened) and recalls recent ones for
 * context. It reuses the existing journal store rather than introducing a parallel
 * memory system.
 *
 * Safe with no DB: writes no-op and recalls return empty lists.
 */

function asText(value) {
  return value == null ? "" : String(value);
}

function createMemoryEngineBridge({ secondLife = null, config = null, logger = null } = {}) {
  function hasStore(method) {
    return secondLife && typeof secondLife[method] === "function";
  }

  async function recordExperience({
    companionId,
    entryType = "note",
    title = "",
    body = "",
    location = null,
    people = [],
    memoryRefs = [],
  } = {}) {
    if (!hasStore("appendJournalEntry")) return null;
    if (!asText(title) && !asText(body)) return null;
    try {
      return await secondLife.appendJournalEntry({
        companionId,
        entryType: asText(entryType) || "note",
        title: asText(title),
        body: asText(body),
        locationContext: location || null,
        peopleContext: Array.isArray(people) ? people : [],
        memoryRefs: Array.isArray(memoryRefs) ? memoryRefs : [],
      });
    } catch (error) {
      logger?.warn?.("[life-engine] recordExperience failed.", { error: error.message });
      return null;
    }
  }

  async function recall({ companionId, entryType, limit = 10 } = {}) {
    if (!hasStore("listRecentJournal")) return [];
    try {
      return await secondLife.listRecentJournal({ companionId, entryType, limit });
    } catch (error) {
      logger?.warn?.("[life-engine] recall failed.", { error: error.message });
      return [];
    }
  }

  return { recordExperience, recall };
}

module.exports = {
  createMemoryEngineBridge,
};
