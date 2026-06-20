const { getLlmClient, hasLlmApiKey, resolveSummaryModel } = require("../llm/client");

function buildWeeklySummaryPrompt(
  eventsAsText,
  startDate,
  endDate,
  { personaName = "AI companion", userLabel = "Human user" } = {},
) {
  return [
    `You are generating a weekly memory log from a chat transcript between ${personaName} (AI) and ${userLabel} (Human).`,
    "",
    "Your goal is to create a single retrieval-friendly weekly summary for semantic search and long-term RAG.",
    "This is not a diary, not a reflective essay, and not a day-by-day recap.",
    "It should compress only the most important, durable, and repeated threads from the week into one clean memory object.",
    "The human user's life, context, events, and needs are the primary subject of this summary. The AI companion may appear in the conversation, but do not confuse the AI with the human user.",
    "",
    "Rules:",
    "* Output ONLY the weekly log in the exact template below.",
    "* Keep the full output under 1200 characters.",
    "* Write as ONE single memory chunk.",
    "* Use plain, direct language.",
    "* Focus on what mattered across the week, not a chronological retelling of each day.",
    "* Prefer named people, projects, places, activities, decisions, recurring issues, and notable shifts in mood, energy, or focus where clearly supported.",
    "* Include repeated or sustained threads only if they seem genuinely important to continuity or future recall.",
    "* Do NOT include generic themes, vague life lessons, or poetic phrasing.",
    "* Do NOT invent details that are not clearly supported by the logs.",
    "* If something appears only once and does not seem important, leave it out.",
    "* If something recurs across multiple days, prioritise it.",
    "",
    "What to capture:",
    "* The main projects, conversations, or concerns that shaped the week",
    "* Important progress, changes, or decisions",
    "* Recurring people or relationships that were salient",
    "* Ongoing pressures, obstacles, or emotional context that affected the week",
    "* Anything likely to matter for future continuity",
    "",
    "Writing guidance:",
    "* Make the summary dense, specific, and retrieval-friendly.",
    "* Mention the strongest anchors by name where possible.",
    "* Do not list each day separately.",
    "* Do not repeat the same point in multiple ways.",
    "",
    "Template to output:",
    "",
    `## Weekly Summary — ${startDate} to ${endDate}`,
    "<text>",
    "",
    "Conversation log:",
    eventsAsText,
  ].join("\n");
}

function parseWeeklySummaryText(summaryText, startDate, endDate) {
  const trimmed = String(summaryText || "").trim();
  const headingPattern = new RegExp(`^##\\s+Weekly Summary\\s+[—-]\\s+${startDate}\\s+to\\s+${endDate}\\s*\\n?`, "i");
  const content = trimmed.replace(headingPattern, "").trim();

  if (!content) {
    throw new Error("Weekly summary did not include usable summary content.");
  }

  return {
    title: `Weekly Summary — ${startDate} to ${endDate}`,
    content,
    text: trimmed,
    domain: "timeline",
    sensitivity: "low",
    needsDomainReview: false,
  };
}

async function generateWeeklySummary({
  config,
  client: providedClient,
  transcript,
  startDate,
  endDate,
}) {
  if (!hasLlmApiKey(config, "summary")) {
    throw new Error("An LLM API key is required to generate a weekly summary.");
  }

  const client = providedClient || getLlmClient(config, "summary");
  const response = await client.responses.create({
    model: resolveSummaryModel(config),
    input: buildWeeklySummaryPrompt(transcript, startDate, endDate, {
      personaName: config.chat?.promptBlocks?.personaName || "AI companion",
      userLabel: config.chat?.promptBlocks?.userName || config.memory?.userScope || "Human user",
    }),
  });

  const text = response.output_text?.trim();

  if (!text) {
    throw new Error("Weekly summary model returned no text.");
  }

  return parseWeeklySummaryText(text, startDate, endDate);
}

function getWeekConversationContext(events) {
  const conversationIds = [...new Set(events.map((event) => event.conversation_id).filter(Boolean))];
  const channelIds = [...new Set(events.map((event) => event.channel_id).filter(Boolean))];
  const guildIds = [...new Set(events.map((event) => event.guild_id).filter(Boolean))];
  const threadIds = [...new Set(events.map((event) => event.thread_id).filter(Boolean))];

  return {
    conversationIds,
    channelId: channelIds[0] || null,
    guildId: guildIds[0] || null,
    threadId: threadIds.length === 1 ? threadIds[0] : null,
  };
}

async function summarizeWeeklyRange({
  config,
  conversations,
  startDate,
  endDate,
  client: providedClient,
  force = false,
}) {
  if (!config.database.url) {
    throw new Error("DATABASE_URL is required to summarize a weekly range.");
  }

  if (!hasLlmApiKey(config, "summary")) {
    throw new Error("An LLM API key is required to summarize a weekly range.");
  }

  const sourceEvents = await conversations.listEventsByDateRange({
    startDate,
    endDate,
    includeSummaries: false,
  });

  if (!sourceEvents.length) {
    throw new Error(`No non-summary conversation events found between ${startDate} and ${endDate}.`);
  }

  const existingSummary = await conversations.findSummaryEventByRange?.({
    eventType: "summary_weekly",
    startDate,
    endDate,
  });

  if (existingSummary && !force) {
    return {
      summary: existingSummary.content_text || "",
      sourceEvents,
      skippedExisting: true,
      existingSummaryEvent: existingSummary,
    };
  }

  const transcript = conversations.formatEventsAsPlainText(sourceEvents);
  const generated = await generateWeeklySummary({
    config,
    client: providedClient,
    transcript,
    startDate,
    endDate,
  });
  const summary = generated.text;

  const firstEvent = sourceEvents[0];
  const lastEvent = sourceEvents[sourceEvents.length - 1];
  const context = getWeekConversationContext(sourceEvents);

  await conversations.recordSyntheticEvent({
    conversationId: `weekly:${startDate}:${endDate}`,
    threadId: context.threadId,
    channelId: context.channelId,
    guildId: context.guildId,
    role: "system",
    source: "ghostlight",
    eventType: "summary_weekly",
    contentText: summary,
    metadata: {
      summaryKind: "weekly",
      weekStartDate: startDate,
      weekEndDate: endDate,
      sourceEventCount: sourceEvents.length,
      sourceConversationIds: context.conversationIds,
      summaryModel: resolveSummaryModel(config),
      sourceRangeStart: firstEvent.created_at,
      sourceRangeEnd: lastEvent.created_at,
    },
  });

  return {
    summary,
    sourceEvents,
    skippedExisting: false,
  };
}

module.exports = {
  buildWeeklySummaryPrompt,
  parseWeeklySummaryText,
  generateWeeklySummary,
  summarizeWeeklyRange,
  getWeekConversationContext,
};
