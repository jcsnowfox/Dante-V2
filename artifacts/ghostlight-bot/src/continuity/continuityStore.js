"use strict";

const { ITEM_STATUSES, PRELUDE_PRIORITY } = require("./continuityTypes");

function createContinuityStore({ store, companionId, ownerId, logger }) {

  async function create(fields) {
    try {
      const item = await store.createItem({ companionId, ownerId, ...fields });
      logger.debug?.(`[continuity] ${fields.type || "item"} created`, { companionId, id: item?.id });
      return item;
    } catch (err) {
      logger.warn("[continuity] Failed to create item", { companionId, error: err?.message, type: fields.type });
      return null;
    }
  }

  async function list({ type = "", status = "", limit = 50 } = {}) {
    try {
      return await store.listItems({ companionId, ownerId, type, status, limit });
    } catch {
      return [];
    }
  }

  async function get(id) {
    try {
      return await store.getItem({ id, companionId, ownerId });
    } catch {
      return null;
    }
  }

  async function update(id, updates) {
    try {
      return await store.updateItem({ id, companionId, ownerId, updates });
    } catch {
      return null;
    }
  }

  async function archive(id) {
    try {
      return await store.archiveItem({ id, companionId, ownerId });
    } catch {
      return null;
    }
  }

  async function resolve(id, resolution = "") {
    try {
      return await store.resolveItem({ id, companionId, ownerId, resolution });
    } catch {
      return null;
    }
  }

  async function deleteItem(id) {
    try {
      return await store.deleteItem({ id, companionId, ownerId });
    } catch {
      return false;
    }
  }

  async function listForPrelude({ maxItems = 4 } = {}) {
    try {
      const activeStatuses = [
        ITEM_STATUSES.OPEN, ITEM_STATUSES.WAITING,
        ITEM_STATUSES.FOLLOW_UP_DUE, ITEM_STATUSES.OUTCOME_PENDING,
      ];
      const all = [];
      for (const status of activeStatuses) {
        const batch = await store.listItems({ companionId, ownerId, status, limit: 30 });
        all.push(...batch);
      }
      // Deduplicate by id
      const seen = new Set();
      const unique = all.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
      // Sort by prelude priority then recency
      unique.sort((a, b) => {
        const pa = PRELUDE_PRIORITY[a.type] ?? 99;
        const pb = PRELUDE_PRIORITY[b.type] ?? 99;
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      return unique.slice(0, maxItems);
    } catch {
      return [];
    }
  }

  async function listDueFollowUps() {
    try {
      return await store.listDueFollowUps({ companionId, ownerId });
    } catch {
      return [];
    }
  }

  async function countTodayFollowUps() {
    try {
      return await store.countTodayFollowUps({ companionId, ownerId });
    } catch {
      return 0;
    }
  }

  async function expireStale() {
    try {
      return await store.expireStale();
    } catch {
      return 0;
    }
  }

  async function touchItem(id) {
    try {
      return await store.updateItem({ id, companionId, ownerId, updates: { lastTouchedAt: new Date() } });
    } catch {
      return null;
    }
  }

  return {
    create,
    list,
    get,
    update,
    archive,
    resolve,
    delete: deleteItem,
    listForPrelude,
    listDueFollowUps,
    countTodayFollowUps,
    expireStale,
    touchItem,
  };
}

module.exports = { createContinuityStore };
