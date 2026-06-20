const {
  syncMemoriesToQdrant,
  syncMemoryToQdrant,
} = require("../../memory/syncMemories");

function formatMemorySyncWarning(error) {
  const message = String(error?.message || error || "").trim();

  return message
    ? `Saved, but the memory search index could not be updated: ${message}`
    : "Saved, but the memory search index could not be updated.";
}

async function safeSyncMemoryToQdrant({ config, memory, logger }) {
  try {
    return await syncMemoryToQdrant({ config, memory });
  } catch (error) {
    logger?.warn?.("[memory] Failed to sync memory to Qdrant", {
      memoryId: memory?.memoryId,
      error: error?.message || String(error),
    });

    return {
      syncedCount: 0,
      skipped: true,
      errorMessage: formatMemorySyncWarning(error),
    };
  }
}

async function safeSyncMemoriesToQdrant({ config, memories, logger }) {
  try {
    return await syncMemoriesToQdrant({ config, memories });
  } catch (error) {
    logger?.warn?.("[memory] Failed to sync memories to Qdrant", {
      memoryCount: Array.isArray(memories) ? memories.length : 0,
      error: error?.message || String(error),
    });

    return {
      syncedCount: 0,
      skipped: true,
      errorMessage: formatMemorySyncWarning(error),
    };
  }
}

module.exports = {
  formatMemorySyncWarning,
  safeSyncMemoriesToQdrant,
  safeSyncMemoryToQdrant,
};
