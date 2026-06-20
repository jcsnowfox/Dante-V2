"use strict";

const { ENTRY_TYPES, ENTRY_STATUSES, VISIBILITY, PRELUDE_PRIORITY } = require("./innerLifeTypes");

function createInnerLifeStore({ store, companionId, ownerId, logger }) {
  async function create(fields) {
    try {
      const entry = await store.createEntry({ companionId, ownerId, ...fields });
      logger.debug?.(`[inner-life] ${fields.entryType || "entry"} stored`, { companionId, id: entry?.id });
      return entry;
    } catch (err) {
      logger.warn("[inner-life] Failed to create entry", { companionId, error: err?.message, entryType: fields.entryType });
      return null;
    }
  }

  async function list({ entryType = "", status = "active", limit = 20 } = {}) {
    try {
      return await store.listEntries({ companionId, ownerId, entryType, status, limit });
    } catch {
      return [];
    }
  }

  async function listForPrelude({ maxItems = 3 } = {}) {
    try {
      const all = await store.listEntries({
        companionId,
        ownerId,
        status: ENTRY_STATUSES.ACTIVE,
        limit: 50,
      });

      // Sort by prelude priority then recency
      const prioritized = all
        .filter((e) => PRELUDE_PRIORITY[e.entryType] !== undefined)
        .sort((a, b) => {
          const pa = PRELUDE_PRIORITY[a.entryType] ?? 99;
          const pb = PRELUDE_PRIORITY[b.entryType] ?? 99;
          if (pa !== pb) return pa - pb;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

      return prioritized.slice(0, maxItems);
    } catch {
      return [];
    }
  }

  async function archive(id) {
    try {
      return await store.archiveEntry({ id, companionId, ownerId });
    } catch {
      return null;
    }
  }

  async function markUsedInPrelude(id) {
    try {
      return await store.updateEntry({ id, companionId, ownerId, updates: { status: ENTRY_STATUSES.USED_IN_PRELUDE } });
    } catch {
      return null;
    }
  }

  async function deleteEntry(id) {
    try {
      return await store.deleteEntry({ id, companionId, ownerId });
    } catch {
      return false;
    }
  }

  async function updateEntry(id, updates) {
    try {
      return await store.updateEntry({ id, companionId, ownerId, updates });
    } catch {
      return null;
    }
  }

  async function expireStale() {
    try {
      return await store.expireStale();
    } catch {
      return 0;
    }
  }

  async function getMostRecent(entryType) {
    const entries = await list({ entryType, limit: 1 });
    return entries[0] || null;
  }

  return {
    create,
    list,
    listForPrelude,
    archive,
    markUsedInPrelude,
    delete: deleteEntry,
    update: updateEntry,
    expireStale,
    getMostRecent,
  };
}

module.exports = { createInnerLifeStore };
