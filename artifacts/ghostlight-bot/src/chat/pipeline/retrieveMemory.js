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

async function retrieveMemory({ memory, message, input, mode, conversations = null }) {
  const recentUserMessages = await loadRecentUserMessages({ message, conversations });

  return memory.retrieve({
    guildId: message.guildId,
    userId: input.authorId,
    query: buildMemoryQueries({
      input,
      mode,
      recentUserMessages,
    }),
    mode,
  });
}

module.exports = {
  retrieveMemory,
  buildMemoryQueries,
};
