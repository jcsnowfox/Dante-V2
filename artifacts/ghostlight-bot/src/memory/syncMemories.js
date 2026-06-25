const { embedTexts } = require("./embeddings");
const { annotateMemoryStageError } = require("./errorStage");
const { hasLlmApiKey } = require("../llm/client");
const {
  buildQdrantPoint,
  ensureCollection,
  upsertPoints,
} = require("./qdrantClient");
const { updateSystemTruth } = require("../systemTruth/runtimeState");

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function canSyncMemories(config) {
  return Boolean(config?.qdrant?.url && hasLlmApiKey(config, "embedding"));
}

async function syncMemoriesToQdrant({ config, memories, deps = {} }) {
  const logger = deps.logger || console;
  const activeMemories = Array.isArray(memories)
    ? memories.filter((memory) => memory && memory.active)
    : [];
  const embedTextsFn = deps.embedTexts || embedTexts;
  const ensureCollectionFn = deps.ensureCollection || ensureCollection;
  const upsertPointsFn = deps.upsertPoints || upsertPoints;
  const buildQdrantPointFn = deps.buildQdrantPoint || buildQdrantPoint;

  logger.info?.(`[memory-qdrant] sync started activeMemoryCount=${activeMemories.length}`);
  if (!activeMemories.length) {
    logger.warn?.("[memory-qdrant] sync skipped reason=no_active_memories");
    return { syncedCount: 0, skipped: true, skippedReason: "no_active_memories", skippedCount: 0 };
  }
  if (!canSyncMemories(config)) {
    logger.warn?.("[memory-qdrant] sync skipped reason=qdrant_or_embeddings_not_configured");
    return { syncedCount: 0, skipped: true, skippedReason: "qdrant_or_embeddings_not_configured", skippedCount: activeMemories.length };
  }

  let syncedCount = 0;
  let collectionReady = false;

  for (const batch of chunkArray(activeMemories, 50)) {
    let vectors;

    try {
      vectors = await embedTextsFn({
        config,
        inputs: batch.map((memory) => memory.content),
      });
    } catch (error) {
      throw annotateMemoryStageError(error, "memory sync embeddings");
    }

    if (!collectionReady) {
      try {
        await ensureCollectionFn({
          config,
          vectorSize: vectors[0].length,
        });
      } catch (error) {
        updateSystemTruth("memory", { qdrantConnected: false, qdrantLastError: error?.message || String(error) });
        throw annotateMemoryStageError(error, "memory sync qdrant ensureCollection");
      }
      collectionReady = true;
    }

    try {
      await upsertPointsFn({
        config,
        points: batch.map((memory, index) => buildQdrantPointFn(memory, vectors[index])),
      });
    } catch (error) {
      throw annotateMemoryStageError(error, "memory sync qdrant upsertPoints");
    }

    syncedCount += batch.length;
  }

  updateSystemTruth("memory", { qdrantConnected: true, qdrantLastSuccessfulSync: new Date().toISOString(), qdrantIndexedCount: syncedCount, qdrantLastError: null });
  logger.info?.(`[memory-qdrant] sync completed synced=${syncedCount} skipped=0`);
  return {
    syncedCount,
    skipped: false,
    skippedCount: 0,
  };
}

async function syncMemoryToQdrant({ config, memory }) {
  if (!memory?.active) {
    return {
      syncedCount: 0,
      skipped: true,
    };
  }

  return syncMemoriesToQdrant({
    config,
    memories: [memory],
  });
}

module.exports = {
  canSyncMemories,
  syncMemoriesToQdrant,
  syncMemoryToQdrant,
};
