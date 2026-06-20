const { generateDetailedDailySummary } = require("../conversations/dailySummary");
const {
  buildGeneratedMemoryRecords,
  buildGeneratedWeeklyMemoryRecord,
  generateSummaryArtifacts,
  generateWeeklyArtifacts,
} = require("../memory/summaryIngestion");
const { syncMemoryToQdrant } = require("../memory/syncMemories");
const { getLocalDateParts, getPreviousLocalDateKey, getDateKeyOffset } = require("./time");

function eventMatchesSummaryScope(event, includedChannelIds) {
  const metadata = event?.metadata || {};
  return includedChannelIds.includes(event.channel_id)
    || includedChannelIds.includes(metadata.parentChannelId || "")
    || includedChannelIds.includes(metadata.sourceChannelId || "");
}

function eventMatchesLocalDate(event, summaryDate, timezone) {
  const createdAt = new Date(event.created_at || event.createdAt || "");

  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }

  return getLocalDateParts(createdAt, timezone).dateKey === summaryDate;
}

async function runDailySummary({
  config,
  logger,
  conversations,
  memoryStore,
  generatedMemories,
  summaryQueueStore,
  settingsStore,
  now = new Date(),
}) {
  const includedChannelIds = Array.isArray(config.memory?.dailySummaryChannelIds)
    ? config.memory.dailySummaryChannelIds.filter(Boolean)
    : [];

  if (!includedChannelIds.length) {
    logger.debug?.("[automations] Skipping daily summary because no channels are configured.");
    return {
      skipped: true,
      reason: "no_channels",
    };
  }

  const timezone = config.chat?.timezone || "UTC";
  const summaryDate = getPreviousLocalDateKey(now, timezone);
  const startDate = new Date(`${summaryDate}T00:00:00.000Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 1);
  const endDate = new Date(`${summaryDate}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);

  const events = await conversations.listEventsByDateRange({
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    limit: 5000,
    includeSummaries: false,
  });

  const sourceEvents = events
    .filter((event) => event.event_type === "message")
    .filter((event) => eventMatchesSummaryScope(event, includedChannelIds))
    .filter((event) => eventMatchesLocalDate(event, summaryDate, timezone));

  if (!sourceEvents.length) {
    await settingsStore.upsertSettings({
      "memory.dailySummaryLastRunAt": now.toISOString(),
    });
    config.memory.dailySummaryLastRunAt = now.toISOString();
    return {
      skipped: true,
      reason: "no_events",
      summaryDate,
    };
  }

  const sources = [{
    label: `Daily rollup for ${summaryDate}`,
    date: summaryDate,
    text: conversations.formatEventsAsPlainText(sourceEvents),
    metadata: {
      sourceEventCount: sourceEvents.length,
      includedChannelIds,
    },
  }];
  const generated = await generateSummaryArtifacts({
    config,
    groupingLabel: `Daily rollup for ${summaryDate}`,
    sources,
  });
  const detailedContinuity = await generateDetailedDailySummary({
    config,
    transcript: sources[0].text,
    summaryDate,
  });
  const generatedRecord = buildGeneratedMemoryRecords({
    sourceKind: "ghostlight_conversation",
    sourceRef: `daily_summary:${summaryDate}`,
    groupingKey: `daily:${summaryDate}`,
    userScope: config.memory.userScope,
    generated,
    sourcePayload: {
      summaryDate,
      sourceEventIds: sourceEvents.map((event) => event.id),
      sourceChannelIds: includedChannelIds,
      sourceCount: sourceEvents.length,
    },
  })[0];
  const liveMemory = await memoryStore.upsertMemory({
    memory_id: generatedRecord.generatedMemoryId,
    title: generatedRecord.title,
    content: generatedRecord.content,
    memory_type: generatedRecord.memory_type,
    domain: generatedRecord.domain,
    sensitivity: generatedRecord.sensitivity,
    source: "generated_ghostlight_conversation",
    reference_date: generatedRecord.reference_date,
  }, {
    userScope: generatedRecord.user_scope,
  });

  await syncMemoryToQdrant({
    config,
    memory: liveMemory,
  });

  await generatedMemories.upsertGeneratedMemory({
    ...generatedRecord,
    status: "approved",
    promoted_memory_id: liveMemory.memoryId,
    review_flags: [...new Set([...(generatedRecord.review_flags || []), "recently_generated"])],
  });

  await summaryQueueStore.upsertQueueItem({
    queue_type: "weekly_continuity_daily",
    summary_date: summaryDate,
    title: detailedContinuity.title,
    content: detailedContinuity.content,
    status: "pending",
    source_payload: {
      sourceEventIds: sourceEvents.map((event) => event.id),
      sourceChannelIds: includedChannelIds,
      sourceCount: sourceEvents.length,
      summaryDate,
    },
    expires_at: `${getDateKeyOffset(summaryDate, 31)}T00:00:00.000Z`,
  }, {
    userScope: config.memory.userScope,
  });

  await settingsStore.upsertSettings({
    "memory.dailySummaryLastRunAt": now.toISOString(),
  });
  config.memory.dailySummaryLastRunAt = now.toISOString();

  return {
    skipped: false,
    summaryDate,
    memoryId: liveMemory.memoryId,
  };
}

async function runWeeklySummary({
  config,
  logger,
  memoryStore,
  generatedMemories,
  summaryQueueStore,
  settingsStore,
  now = new Date(),
}) {
  const timezone = config.chat?.timezone || "UTC";
  const endDate = getPreviousLocalDateKey(now, timezone);
  const startDate = getDateKeyOffset(endDate, -6);
  const queueItems = await summaryQueueStore.listQueueItems({
    userScope: config.memory.userScope,
    queueType: "weekly_continuity_daily",
    status: "pending",
    startDate,
    endDate,
    limit: 14,
  });

  logger.debug?.("[automations] Weekly summary queue selection", {
    startDate,
    endDate,
    queueItemCount: queueItems.length,
    queueDates: queueItems.map((item) => item.summaryDate),
  });

  if (!queueItems.length) {
    await settingsStore.upsertSettings({
      "memory.weeklySummaryLastRunAt": now.toISOString(),
    });
    config.memory.weeklySummaryLastRunAt = now.toISOString();
    logger.debug?.("[automations] Skipping weekly summary because no queued continuity notes were found.", {
      startDate,
      endDate,
    });
    return {
      skipped: true,
      reason: "no_queue_items",
      startDate,
      endDate,
    };
  }

  const sources = queueItems.map((item) => ({
    label: item.title,
    date: item.summaryDate,
    text: item.content,
    metadata: {
      queueType: item.queueType,
      sourcePayload: item.sourcePayload,
    },
  }));
  const generated = await generateWeeklyArtifacts({
    config,
    groupingLabel: `Weekly rollup for ${startDate} to ${endDate}`,
    sources,
    startDate,
    endDate,
  });
  const generatedRecord = buildGeneratedWeeklyMemoryRecord({
    sourceKind: "ghostlight_summary_queue",
    sourceRef: `weekly_summary:${startDate}:${endDate}`,
    groupingKey: `weekly:${startDate}:${endDate}`,
    userScope: config.memory.userScope,
    generated,
    sourcePayload: {
      startDate,
      endDate,
      queueItemIds: queueItems.map((item) => item.queueId),
      sourceCount: queueItems.length,
    },
  })[0];
  const liveMemory = await memoryStore.upsertMemory({
    memory_id: generatedRecord.generatedMemoryId,
    title: generatedRecord.title,
    content: generatedRecord.content,
    memory_type: generatedRecord.memory_type,
    domain: generatedRecord.domain,
    sensitivity: generatedRecord.sensitivity,
    source: "generated_ghostlight_summary_queue",
    reference_date: generatedRecord.reference_date,
  }, {
    userScope: generatedRecord.user_scope,
  });

  await syncMemoryToQdrant({
    config,
    memory: liveMemory,
  });

  await generatedMemories.upsertGeneratedMemory({
    ...generatedRecord,
    status: "approved",
    promoted_memory_id: liveMemory.memoryId,
    review_flags: [...new Set([...(generatedRecord.review_flags || []), "recently_generated"])],
  });

  await summaryQueueStore.markQueueItemsConsumed({
    userScope: config.memory.userScope,
    queueType: "weekly_continuity_daily",
    startDate,
    endDate,
    weeklyMemoryId: liveMemory.memoryId,
    consumedAt: now.toISOString(),
  });

  await settingsStore.upsertSettings({
    "memory.weeklySummaryLastRunAt": now.toISOString(),
  });
  config.memory.weeklySummaryLastRunAt = now.toISOString();

  logger.info("[automations] Weekly summary created from queued continuity notes", {
    startDate,
    endDate,
    sourceCount: queueItems.length,
    memoryId: liveMemory.memoryId,
  });

  return {
    skipped: false,
    startDate,
    endDate,
    memoryId: liveMemory.memoryId,
  };
}

module.exports = {
  eventMatchesSummaryScope,
  eventMatchesLocalDate,
  runDailySummary,
  runWeeklySummary,
};
