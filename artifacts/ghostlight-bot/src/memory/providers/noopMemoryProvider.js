function createNoopMemoryProvider({ config, logger }) {
  return {
    canLookup: false,
    async lookup() {
      logger.debug?.(`[memory] Memory lookup unavailable (qdrantConfigured=${Boolean(config.qdrant.url)})`);
      return [];
    },
    async retrieve({ guildId, userId, query, mode }) {
      const modeName = typeof mode === "string" ? mode : (mode?.name || "unknown");
      logger.debug?.(
        `[memory] No memory backend configured yet (guild=${guildId || "n/a"}, user=${userId}, mode=${modeName}, qdrantConfigured=${Boolean(config.qdrant.url)})`,
      );

      void query;
      return [];
    },
  };
}

module.exports = {
  createNoopMemoryProvider,
};
