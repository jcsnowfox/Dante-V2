const {
  buildDailySummaryPrompt,
  generateDailySummary,
} = require("./dailySummary");
const { hasLlmApiKey, resolveSummaryModel } = require("../llm/client");

function getSummaryDate(sourceEvents) {
  return new Date(sourceEvents[0].created_at).toISOString().slice(0, 10);
}

function getSummarisableEvents(events) {
  return events.filter((event) => !["summary_daily", "summary_weekly"].includes(event.event_type));
}

function getConversationContext(event) {
  const metadata = event?.metadata || {};

  return {
    threadName: metadata.threadName || null,
    channelName: metadata.channelName || null,
    conversationLabel: metadata.threadName || metadata.channelName || event?.conversation_id || null,
  };
}

async function summarizeConversation({
  config,
  conversations,
  conversationId,
  limit = 1000,
  client: providedClient,
  force = false,
}) {
  if (!config.database.url) {
    throw new Error("DATABASE_URL is required to summarize a conversation.");
  }

  if (!hasLlmApiKey(config, "summary")) {
    throw new Error("An LLM API key is required to summarize a conversation.");
  }

  const events = await conversations.listEventsByConversationId({ conversationId, limit });
  const sourceEvents = getSummarisableEvents(events);

  if (!sourceEvents.length) {
    throw new Error(`No summarizable events found for conversation ${conversationId}.`);
  }

  const transcript = conversations.formatEventsAsPlainText(sourceEvents);
  const summaryDate = getSummaryDate(sourceEvents);
  const existingSummary = await conversations.findSummaryEventByConversationAndDate?.({
    conversationId,
    summaryDate,
  });

  if (existingSummary && !force) {
    return {
      summary: existingSummary.content_text || "",
      sourceEvents,
      skippedExisting: true,
      existingSummaryEvent: existingSummary,
    };
  }

  const generated = await generateDailySummary({
    config,
    client: providedClient,
    transcript,
    summaryDate,
  });
  const summary = generated.text;

  const firstEvent = sourceEvents[0];
  const lastEvent = sourceEvents[sourceEvents.length - 1];
  const context = getConversationContext(firstEvent);

  await conversations.recordSyntheticEvent({
    conversationId,
    threadId: firstEvent.thread_id,
    channelId: firstEvent.channel_id,
    guildId: firstEvent.guild_id,
    role: "system",
    source: "ghostlight",
    eventType: "summary_daily",
    contentText: summary,
    metadata: {
      summaryKind: "daily",
      sourceEventCount: sourceEvents.length,
      summaryModel: resolveSummaryModel(config),
      summaryDate,
      sourceRangeStart: firstEvent.created_at,
      sourceRangeEnd: lastEvent.created_at,
      threadName: context.threadName,
      channelName: context.channelName,
      conversationLabel: context.conversationLabel,
    },
  });

  return {
    summary,
    sourceEvents,
    skippedExisting: false,
  };
}

module.exports = {
  summarizeConversation,
  buildSummaryPrompt: buildDailySummaryPrompt,
  getConversationContext,
  getSummarisableEvents,
};
