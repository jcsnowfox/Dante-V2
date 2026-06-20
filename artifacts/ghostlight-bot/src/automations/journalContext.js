const { buildEventContentText } = require("../storage");
const { buildMemoryQueries } = require("../chat/pipeline/retrieveMemory");

function shuffleInPlace(items, randomFn = Math.random) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomFn() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function buildJournalConversationLabel(event) {
  const metadata = event?.metadata || {};
  return metadata.threadName || metadata.channelName || event.conversation_id || "recent conversation";
}

function buildJournalSliceContent(events = [], { config } = {}) {
  const userName = config?.chat?.promptBlocks?.userName || "User";
  const aiName = config?.chat?.promptBlocks?.personaName || "Ghostlight";

  return events
    .map((event) => {
      const author = event.role === "user"
        ? `${userName} (user)`
        : event.role === "assistant"
          ? `${aiName} (AI)`
          : (event.author_name || event.role || "unknown");
      return `${author}: ${buildEventContentText(event)}`;
    })
    .join("\n");
}

function buildRecentJournalEntriesContent(entries = []) {
  return entries
    .map((entry, index) => {
      const timestamp = new Date(entry.createdAt).toISOString();
      return [
        `${index + 1}. ${entry.title} (${timestamp})`,
        entry.content,
      ].join("\n");
    })
    .join("\n\n");
}

function selectRandomContiguousEvents(events = [], maxMessagesPerSlice = 8, randomFn = Math.random) {
  if (events.length <= maxMessagesPerSlice) {
    return events;
  }

  const maxStartIndex = events.length - maxMessagesPerSlice;
  const startIndex = Math.floor(randomFn() * (maxStartIndex + 1));
  return events.slice(startIndex, startIndex + maxMessagesPerSlice);
}

function selectJournalConversationSlices({
  events = [],
  excludedChannelId = "",
  lookbackMs = 24 * 60 * 60 * 1000,
  now = new Date(),
  maxSlices = 2,
  maxMessagesPerSlice = 8,
  randomFn = Math.random,
}) {
  const nowMs = now.getTime();
  const grouped = new Map();

  for (const event of events) {
    const createdAt = Date.parse(event.created_at || event.createdAt || "");

    if (!Number.isFinite(createdAt) || createdAt < nowMs - lookbackMs || createdAt > nowMs) {
      continue;
    }

    if (event.channel_id === excludedChannelId || event.conversation_id === excludedChannelId) {
      continue;
    }

    if (event.event_type !== "message") {
      continue;
    }

    if (!["user", "assistant"].includes(event.role)) {
      continue;
    }

    const content = buildEventContentText(event).trim();

    if (!content) {
      continue;
    }

    const key = event.conversation_id;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(event);
  }

  const candidates = Array.from(grouped.values())
    .map((conversationEvents) => conversationEvents.sort((left, right) => new Date(left.created_at) - new Date(right.created_at)))
    .filter((conversationEvents) => conversationEvents.length >= 2)
    .map((conversationEvents) => ({
      label: buildJournalConversationLabel(conversationEvents[0]),
      latestAt: conversationEvents[conversationEvents.length - 1].created_at,
      events: selectRandomContiguousEvents(conversationEvents, maxMessagesPerSlice, randomFn),
    }))
    .sort((left, right) => Date.parse(right.latestAt) - Date.parse(left.latestAt));

  const pool = candidates.slice(0, 6);
  return shuffleInPlace(pool, randomFn)
    .slice(0, maxSlices)
    .sort((left, right) => Date.parse(left.latestAt) - Date.parse(right.latestAt));
}

async function loadJournalContextPayload({
  conversations,
  config,
  journalStore,
  userScope,
  guildId,
  excludedChannelId,
  now = new Date(),
  randomFn = Math.random,
}) {
  const startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);
  const events = await conversations.listEventsByDateRange({
    startDate,
    endDate,
    limit: 2000,
    includeSummaries: false,
  });
  const scopedEvents = events.filter((event) => !guildId || event.guild_id === guildId);
  const slices = selectJournalConversationSlices({
    events: scopedEvents,
    excludedChannelId,
    now,
    maxSlices: 1,
    randomFn,
  });

  if (!slices.length) {
    const recentEntries = await journalStore.listRecentEntries({
      userScope,
      limit: 5,
    });

    return {
      selectedSlice: null,
      sections: recentEntries.length
        ? [{
          label: "Recent journal entries",
          content: buildRecentJournalEntriesContent(recentEntries),
        }]
        : [],
    };
  }

  const recentEntries = await journalStore.listRecentEntries({
    userScope,
    limit: 5,
  });

  const sections = [{
    label: "Selected conversation excerpt from the last 24 hours",
    content: [
      slices[0].label,
      buildJournalSliceContent(slices[0].events, { config }),
    ].join("\n"),
  }];

  if (recentEntries.length) {
    sections.push({
      label: "Recent journal entries",
      content: buildRecentJournalEntriesContent(recentEntries),
    });
  }

  return {
    selectedSlice: slices[0],
    sections,
  };
}

async function loadJournalContextSections(args) {
  const payload = await loadJournalContextPayload(args);
  return payload.sections;
}

async function retrieveJournalMemories({
  memory,
  channel,
  input,
  mode,
  conversations,
  selectedSlice = null,
  retrieveAutomationMemories,
}) {
  if (selectedSlice?.events?.length) {
    const sliceUserMessages = selectedSlice.events
      .filter((event) => event.role === "user")
      .map((event) => buildEventContentText(event).trim())
      .filter(Boolean)
      .slice(-3);
    const latestUserMessage = sliceUserMessages.at(-1) || "";
    const continuityMessages = sliceUserMessages.slice(0, -1);
    const retrievalInput = latestUserMessage
      ? { ...input, content: latestUserMessage }
      : input;

    return memory.retrieve({
      guildId: channel.guildId,
      userId: input.authorId,
      query: buildMemoryQueries({
        input: retrievalInput,
        mode,
        recentUserMessages: continuityMessages,
      }),
      mode,
    });
  }

  return retrieveAutomationMemories({
    memory,
    channel,
    input,
    mode,
    conversations,
  });
}

module.exports = {
  selectJournalConversationSlices,
  loadJournalContextSections,
  loadJournalContextPayload,
  retrieveJournalMemories,
};
