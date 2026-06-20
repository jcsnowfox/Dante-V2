const { Events } = require("discord.js");

function getConversationIdFromMessage(message = {}) {
  return message.channel?.isThread?.() ? message.channel.id : message.channelId;
}

function limitText(value, maxLength = 80) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function getReactionUserName(reaction, user) {
  const member = reaction?.message?.guild?.members?.cache?.get?.(user?.id);
  return limitText(member?.displayName || user?.globalName || user?.username || "someone");
}

function formatReactionEmoji(emoji = {}) {
  const name = String(emoji.name || "").trim();
  const id = String(emoji.id || "").trim();

  if (!name) {
    return "";
  }

  if (id) {
    return `:${name}:`;
  }

  return name;
}

function buildReactionContextSection(snapshot) {
  if (!snapshot?.reactions?.length) {
    return null;
  }

  const lines = [
    ...snapshot.reactions.map((reaction) => {
      const emojis = reaction.emojis.join(" ");
      return `${reaction.userName} reacted with ${emojis} to a recent message from you.`;
    }),
    "Treat this as a light signal about their current mood or tone, and let it shape the reply naturally.",
  ];

  return {
    label: "Recent Reaction Context",
    content: lines.join("\n"),
  };
}

function createReactionContextTracker({ logger } = {}) {
  const latestByConversationId = new Map();

  function markLatestMessage({ conversationId, messageId } = {}) {
    const normalizedConversationId = String(conversationId || "").trim();
    const normalizedMessageId = String(messageId || "").trim();

    if (!normalizedConversationId || !normalizedMessageId) {
      return;
    }

    latestByConversationId.set(normalizedConversationId, {
      conversationId: normalizedConversationId,
      messageId: normalizedMessageId,
      reactionsByUserId: new Map(),
    });
  }

  function markLatestFromMessage(message = {}) {
    markLatestMessage({
      conversationId: getConversationIdFromMessage(message),
      messageId: message.id,
    });
  }

  function recordUserReaction({ latest, userId, userName, emoji }) {
    if (!latest || !userId || !emoji) {
      return;
    }

    const existing = latest.reactionsByUserId.get(userId) || {
      userId,
      userName,
      emojis: [],
    };

    if (!existing.emojis.includes(emoji)) {
      existing.emojis.push(emoji);
    }

    latest.reactionsByUserId.set(userId, existing);
  }

  function handleReactionAdd({ reaction, user, botUserId = "" } = {}) {
    if (!reaction?.message || !user?.id) {
      return;
    }

    if (user.bot || String(user.id) === String(botUserId || "")) {
      return;
    }

    const conversationId = getConversationIdFromMessage(reaction.message);
    const latest = latestByConversationId.get(conversationId);

    if (!latest || latest.messageId !== reaction.message.id) {
      return;
    }

    const emoji = formatReactionEmoji(reaction.emoji);

    if (!emoji) {
      return;
    }

    const userId = String(user.id);
    recordUserReaction({
      latest,
      userId,
      userName: getReactionUserName(reaction, user),
      emoji,
    });

    logger?.debug?.("[reaction-context] Recorded reaction to latest AI message", {
      conversationId,
      messageId: latest.messageId,
      userId,
      emoji,
    });
  }

  function getContextSection({ conversationId, consume = false } = {}) {
    const normalizedConversationId = String(conversationId || "").trim();
    const latest = latestByConversationId.get(normalizedConversationId);

    if (!latest) {
      return null;
    }

    if (consume) {
      latestByConversationId.delete(normalizedConversationId);
    }

    const reactions = Array.from(latest.reactionsByUserId.values())
      .filter((reaction) => reaction.emojis.length);

    return buildReactionContextSection({
      conversationId: normalizedConversationId,
      messageId: latest.messageId,
      reactions,
    });
  }

  function peekContextSection({ conversationId } = {}) {
    return getContextSection({ conversationId, consume: false });
  }

  function consumeContextSection({ conversationId } = {}) {
    return getContextSection({ conversationId, consume: true });
  }

  async function handleDiscordReactionAdd(reaction, user) {
    try {
      let resolvedReaction = reaction;
      let resolvedUser = user;
      let resolvedMessage = resolvedReaction?.message;

      if (resolvedReaction?.partial) {
        resolvedReaction = await resolvedReaction.fetch();
        resolvedMessage = resolvedReaction?.message;
      }

      if (resolvedMessage?.partial && resolvedMessage.fetch) {
        resolvedMessage = await resolvedMessage.fetch();
      }

      if (resolvedUser?.partial && resolvedUser.fetch) {
        resolvedUser = await resolvedUser.fetch();
      }

      handleReactionAdd({
        reaction: {
          emoji: resolvedReaction?.emoji,
          message: resolvedMessage,
        },
        user: resolvedUser,
        botUserId: resolvedMessage?.client?.user?.id || "",
      });
    } catch (error) {
      logger?.warn?.("[reaction-context] Failed to process Discord reaction", {
        error: error.message,
      });
    }
  }

  function register(client) {
    if (!client?.on) {
      return;
    }

    client.on(Events.MessageReactionAdd, handleDiscordReactionAdd);
  }

  return {
    markLatestMessage,
    markLatestFromMessage,
    handleReactionAdd,
    peekContextSection,
    consumeContextSection,
    register,
  };
}

module.exports = {
  buildReactionContextSection,
  createReactionContextTracker,
  formatReactionEmoji,
  getConversationIdFromMessage,
};
