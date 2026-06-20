const { deletePoints } = require("./qdrantClient");

async function deleteMemoryEverywhere({
  config,
  memoryStore,
  generatedMemories,
  memoryId,
  userScope = "",
}) {
  const existing = await memoryStore.getMemoryById(memoryId, { userScope });

  if (!existing) {
    return {
      deleted: false,
      reason: "not_found",
      memory: null,
      archivedGeneratedLinks: 0,
    };
  }

  if (config.qdrant?.url) {
    await deletePoints({
      config,
      ids: [existing.memoryId],
    });
  }

  const deletedMemory = await memoryStore.deleteMemoryById(existing.memoryId, {
    userScope,
  });

  const archivedGeneratedLinks = generatedMemories
    ? await generatedMemories.archivePromotedMemoryId(existing.memoryId, { userScope })
    : 0;

  return {
    deleted: Boolean(deletedMemory),
    reason: deletedMemory ? "deleted" : "delete_failed",
    memory: deletedMemory,
    archivedGeneratedLinks,
  };
}

module.exports = {
  deleteMemoryEverywhere,
};
