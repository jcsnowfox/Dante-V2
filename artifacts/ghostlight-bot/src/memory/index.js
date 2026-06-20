const { createNoopMemoryProvider } = require("./providers/noopMemoryProvider");
const { createQdrantMemoryProvider } = require("./providers/qdrantMemoryProvider");
const { canSyncMemories } = require("./syncMemories");

function createMemoryService({ config, logger, memoryStore = null }) {
  const hasQdrantBackend = canSyncMemories(config);
  const provider = hasQdrantBackend
    ? createQdrantMemoryProvider({ config, logger, memoryStore })
    : createNoopMemoryProvider({ config, logger });

  logger.debug?.("[memory] Memory service configured", {
    qdrantConfigured: Boolean(config.qdrant.url),
    embeddingConfigured: hasQdrantBackend,
    provider: hasQdrantBackend ? "qdrant" : "noop",
  });

  return {
    canLookup: () => Boolean(provider.canLookup),
    lookup: (params) => provider.lookup(params),
    retrieve: (params) => provider.retrieve(params),
  };
}

module.exports = {
  createMemoryService,
};
