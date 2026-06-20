const { generateSummaryArtifacts, buildGeneratedMemoryRecords } = require("./summaryIngestion");

function buildGhostlightSources(conversationGroups, conversations, summaryDate) {
  return conversationGroups.map(({ conversationId, events }) => ({
    label: events[0]?.metadata?.threadName || events[0]?.metadata?.channelName || conversationId,
    date: summaryDate,
    text: conversations.formatEventsAsPlainText(events),
    metadata: {
      conversationId,
      threadName: events[0]?.metadata?.threadName || "",
      channelName: events[0]?.metadata?.channelName || "",
      sourceEventCount: events.length,
    },
  }));
}

function groupEventsByConversation(events) {
  const groups = new Map();

  for (const event of events) {
    const conversationId = event.conversation_id;

    if (!groups.has(conversationId)) {
      groups.set(conversationId, []);
    }

    groups.get(conversationId).push(event);
  }

  return Array.from(groups.entries()).map(([conversationId, groupedEvents]) => ({
    conversationId,
    events: groupedEvents,
  }));
}

async function stageDailySummaryArtifacts({
  config,
  conversations,
  generatedMemories,
  client,
  summaryDate,
  userScope,
}) {
  const sourceEvents = await conversations.listEventsByDate({
    summaryDate,
    includeSummaries: false,
  });

  if (!sourceEvents.length) {
    throw new Error(`No non-summary conversation events found for ${summaryDate}.`);
  }

  const conversationGroups = groupEventsByConversation(sourceEvents);
  const sources = buildGhostlightSources(conversationGroups, conversations, summaryDate);
  const generated = await generateSummaryArtifacts({
    config,
    client,
    groupingLabel: `Daily rollup for ${summaryDate}`,
    sources,
  });

  const generatedRecords = buildGeneratedMemoryRecords({
    sourceKind: "ghostlight_conversation",
    sourceRef: `conversation_events:${summaryDate}`,
    groupingKey: `daily:${summaryDate}`,
    userScope,
    generated,
    sourcePayload: {
      summaryDate,
      sourceEventIds: sourceEvents.map((event) => event.id),
      sourceConversationIds: conversationGroups.map((group) => group.conversationId),
      sourceCount: sourceEvents.length,
      sourceConversationCount: conversationGroups.length,
    },
  });

  const persisted = [];

  for (const record of generatedRecords) {
    persisted.push(await generatedMemories.upsertGeneratedMemory(record));
  }

  return {
    sourceCount: sourceEvents.length,
    generatedRecords: persisted,
  };
}

async function stageImportedSummaryArtifacts({
  config,
  generatedMemories,
  client,
  imports,
  userScope,
  batchLabel,
}) {
  if (!imports.length) {
    throw new Error("No import records found.");
  }

  const groups = new Map();

  for (const item of imports) {
    const groupingKey = item.date ? `daily:${item.date}` : `import:${batchLabel}`;

    if (!groups.has(groupingKey)) {
      groups.set(groupingKey, []);
    }

    groups.get(groupingKey).push(item);
  }

  const persisted = [];

  for (const [groupingKey, sources] of groups.entries()) {
    const groupingLabel = sources[0].date
      ? `Imported daily rollup for ${sources[0].date}`
      : `Imported summary batch ${batchLabel}`;
    const generated = await generateSummaryArtifacts({
      config,
      client,
      groupingLabel,
      sources: sources.map((item) => ({
        label: item.label,
        date: item.date,
        text: item.text,
        metadata: item.metadata,
      })),
    });

    const generatedRecords = buildGeneratedMemoryRecords({
      sourceKind: "manual_import",
      sourceRef: `manual_import:${batchLabel}`,
      groupingKey,
      userScope,
      generated,
      reviewFlags: ["recently_generated"],
      sourcePayload: {
        summaryDate: sources[0].date || null,
        batchLabel,
        sourceIds: sources.map((item) => item.sourceId),
        sourcePaths: sources.map((item) => item.sourcePath),
        sourceCount: sources.length,
      },
    });

    for (const record of generatedRecords) {
      persisted.push(await generatedMemories.upsertGeneratedMemory(record));
    }
  }

  return {
    sourceCount: imports.length,
    generatedRecords: persisted,
  };
}

module.exports = {
  stageDailySummaryArtifacts,
  stageImportedSummaryArtifacts,
};
