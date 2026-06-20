const { embedTexts } = require("./embeddings");
const { annotateMemoryStageError } = require("./errorStage");
const { hasLlmApiKey } = require("../llm/client");
const {
  buildQdrantPoint,
  ensureCollection,
  upsertPoints,
} = require("./qdrantClient");

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
  const activeMemories = Array.isArray(memories)
    ? memories.filter((memory) => memory && memory.active)
    : [];
  const embedTextsFn = deps.embedTexts || embedTexts;
  const ensureCollectionFn = deps.ensureCollection || ensureCollection;
  const upsertPointsFn = deps.upsertPoints || upsertPoints;
  const buildQdrantPointFn = deps.buildQdrantPoint || buildQdrantPoint;

  if (!activeMemories.length || !canSyncMemories(config)) {
    return {
      syncedCount: 0,
      skipped: true,
    };
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

  return {
    syncedCount,
    skipped: false,
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
