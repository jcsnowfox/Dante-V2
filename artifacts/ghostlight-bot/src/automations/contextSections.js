function sortMemoriesByRecency(memories = []) {
  return [...memories].sort((left, right) => {
    const leftDate = Date.parse(left.referenceDate || left.updatedAt || left.createdAt || "") || 0;
    const rightDate = Date.parse(right.referenceDate || right.updatedAt || right.createdAt || "") || 0;
    return rightDate - leftDate;
  });
}

function formatContinuitySummary(memory, index) {
  const referenceDate = memory.referenceDate ? ` (${memory.referenceDate})` : "";
  return `${index + 1}. ${memory.title}${referenceDate}\n${memory.content}`;
}

async function loadRecentContinuitySummarySections({
  memoryStore,
  userScope,
  limit = 3,
}) {
  const memories = await memoryStore.listMemories({
    userScope,
    limit: 200,
    activeOnly: true,
  });
  const recentDailies = sortMemoriesByRecency(
    memories.filter((memory) => memory.memoryType === "timeline_daily"),
  ).slice(0, limit);

  if (!recentDailies.length) {
    return [];
  }

  return [{
    label: "Recent continuity summaries",
    content: recentDailies.map(formatContinuitySummary).join("\n\n"),
  }];
}

module.exports = {
  sortMemoriesByRecency,
  formatContinuitySummary,
  loadRecentContinuitySummarySections,
};
