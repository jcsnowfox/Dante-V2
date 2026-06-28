function buildQuerySections({ input, mode, recentUserMessages, includeRecentContext = true }) {
  const parts = [];

  if (input.content?.trim()) {
    parts.push(`Current user message:\n${input.content.trim()}`);
  }

  if (includeRecentContext && recentUserMessages.length) {
    parts.push(
      [
        "Recent user context:",
        ...recentUserMessages.map((item, index) => `${index + 1}. ${item}`),
      ].join("\n"),
    );
  }

  parts.push(`Mode: ${mode.name}`);
  return parts.join("\n\n").trim();
}

function buildMemoryQueries({ input, mode, recentUserMessages }) {
  return {
    primary: buildQuerySections({
      input,
      mode,
      recentUserMessages,
      includeRecentContext: false,
    }),
    continuity: recentUserMessages.length
      ? buildQuerySections({
        input,
        mode,
        recentUserMessages,
        includeRecentContext: true,
      })
      : "",
  };
}


function getMemoryText(memoryItem = {}) {
  if (typeof memoryItem === "string") {
    return memoryItem;
  }

  return String(
    memoryItem.content
      || memoryItem.text
      || memoryItem.memory
      || memoryItem.summary
      || memoryItem.contentText
      || memoryItem.content_text
      || "",
  );
}

function getMemoryScore(memoryItem = {}) {
  const score = memoryItem?.score ?? memoryItem?.relevanceScore ?? memoryItem?.relevance_score ?? memoryItem?.similarity;
  const numeric = Number(score);
  return Number.isFinite(numeric) ? numeric : null;
}

function getConversationId(message) {
  return message.channel?.isThread?.() ? message.channel.id : message.channelId;
}

async function loadRecentUserMessages({ message, conversations = null }) {
  const conversationId = getConversationId(message);

  if (conversations?.listRecentHistoryByConversationId && conversationId) {
    const recentHistory = await conversations.listRecentHistoryByConversationId({
      conversationId,
      limit: 8,
    });

    return recentHistory
      .filter((item) => item.id !== message.id && item.role === "user" && String(item.content || "").trim())
      .sort((left, right) => (left.createdTimestamp || 0) - (right.createdTimestamp || 0))
      .map((item) => String(item.content).trim())
      .slice(-2);
  }

  const fetchLimit = 8;
  const recentMessages = await message.channel.messages.fetch({ limit: fetchLimit });

  return recentMessages
    .filter((item) => item.id !== message.id && !item.author?.bot && item.content?.trim())
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
    .map((item) => item.content.trim())
    .slice(-2);
}

async function retrieveMemory({ memory, message, input, mode, conversations = null, logger = null }) {
  const recentUserMessages = await loadRecentUserMessages({ message, conversations });

  const memories = await memory.retrieve({
    guildId: message.guildId,
    userId: input.authorId,
    query: buildMemoryQueries({
      input,
      mode,
      recentUserMessages,
    }),
    mode,
  });
  const results = Array.isArray(memories) ? memories : [];
  const relevanceScores = results
    .map(getMemoryScore)
    .filter((score) => score !== null);

  logger?.debug?.("[chat] Memory retrieval metrics", {
    messageId: message.id || "",
    mode: mode?.name || "",
    memoryCount: results.length,
    memoryChars: results.reduce((sum, item) => sum + getMemoryText(item).length, 0),
    relevanceScores: relevanceScores.length ? relevanceScores : undefined,
  });

  return results;
}

module.exports = {
  retrieveMemory,
  buildMemoryQueries,
  getMemoryText,
  getMemoryScore,
};
