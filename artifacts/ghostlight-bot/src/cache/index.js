function createCacheService({ store, config }) {
  function getUserScope(userScope = "") {
    return String(userScope || config?.memory?.userScope || "default").trim();
  }

  return {
    async get(key, { userScope } = {}) {
      const record = await store.get(key, {
        userScope: getUserScope(userScope),
      });

      return record ? record.cacheValue : null;
    },

    async set(key, value, { userScope, expiresAt } = {}) {
      return store.set({
        cacheKey: key,
        cacheValue: value,
        expiresAt,
      }, {
        userScope: getUserScope(userScope),
      });
    },

    async delete(key, { userScope } = {}) {
      return store.delete(key, {
        userScope: getUserScope(userScope),
      });
    },

    async deleteExpired({ now } = {}) {
      return store.deleteExpired({ now });
    },

    async deleteHeartbeatDailyCountsBefore({ dateKey } = {}) {
      if (!store.deleteHeartbeatDailyCountsBefore) {
        return 0;
      }

      return store.deleteHeartbeatDailyCountsBefore({ dateKey });
    },

    async getTodaysThreadId({ userScope } = {}) {
      const value = await this.get("todays_thread", { userScope });
      return typeof value === "string" ? value : "";
    },

    async setTodaysThreadId({ userScope, threadId, expiresAt } = {}) {
      return this.set("todays_thread", String(threadId || "").trim(), {
        userScope,
        expiresAt,
      });
    },

    async getLastRan({ actionId, userScope } = {}) {
      return this.get(`${String(actionId || "").trim()}:last_ran`, { userScope });
    },

    async setLastRan({ actionId, value, userScope, expiresAt } = {}) {
      return this.set(`${String(actionId || "").trim()}:last_ran`, value, {
        userScope,
        expiresAt,
      });
    },

    async claimMessageProcessing({ messageId } = {}) {
      if (!store.setIfAbsent || !messageId) {
        return true;
      }

      const expiresAt = new Date(Date.now() + 120_000).toISOString();
      const claimed = await store.setIfAbsent({
        cacheKey: `msg-claim:${messageId}`,
        cacheValue: 1,
        expiresAt,
      }, {
        userScope: getUserScope(),
      });

      return claimed !== null;
    },

    async getThreadTts({ threadId, userScope } = {}) {
      return this.get(`TTS:${String(threadId || "").trim()}`, { userScope });
    },

    async setThreadTts({ threadId, value, userScope, expiresAt } = {}) {
      return this.set(`TTS:${String(threadId || "").trim()}`, value, {
        userScope,
        expiresAt,
      });
    },
  };
}

module.exports = {
  createCacheService,
};
