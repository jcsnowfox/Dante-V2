async function promoteApprovedGeneratedMemories({
  memoryStore,
  generatedMemories,
  generatedMemoryId = "",
  userScope = "",
  limit = 100,
}) {
  const generatedItems = generatedMemoryId
    ? [await generatedMemories.getGeneratedMemoryById(generatedMemoryId)].filter(Boolean)
    : await generatedMemories.listGeneratedMemories({
      status: "approved",
      userScope,
      limit,
    });

  const pendingItems = generatedItems.filter((item) => item && !item.promotedMemoryId);

  let promotedCount = 0;
  const promotedItems = [];

  for (const item of pendingItems) {
    const liveMemory = await memoryStore.upsertMemory(
      {
        memory_id: item.promotedMemoryId || item.generatedMemoryId,
        title: item.title,
        content: item.content,
        memory_type: item.memoryType,
        domain: item.domain,
        sensitivity: item.sensitivity,
        source: `generated_${item.sourceKind}`,
        reference_date: item.referenceDate,
      },
      {
        userScope: item.userScope,
      },
    );

    await generatedMemories.updateGeneratedMemory(item.generatedMemoryId, {
      promotedMemoryId: liveMemory.memoryId,
    });

    promotedCount += 1;
    promotedItems.push(liveMemory);
  }

  return {
    promotedCount,
    promotedItems,
  };
}

module.exports = {
  promoteApprovedGeneratedMemories,
};
