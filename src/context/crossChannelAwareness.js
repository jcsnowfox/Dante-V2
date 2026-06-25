async function retrieveCrossChannelEvents({
  conversations,
  userId,
  companionId,
  customerId,
  currentChannelId,
  limit = 20,
  hoursBack = 24,
  logger = null,
} = {}) {
  if (!conversations || !userId) {
    return [];
  }

  try {
    const now = new Date();
    const since = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    // Query for recent events involving this user, excluding current channel
    const events = await conversations.listRecentEventsByAuthor?.({
      userId,
      companionId,
      customerId,
      since,
      limit: Math.min(limit * 2, 50), // Over-fetch to deduplicate
    });

    if (!events || !Array.isArray(events)) {
      return [];
    }

    // Filter and deduplicate
    const filtered = [];
    const seen = new Set();

    for (const event of events) {
      // Skip if this is from the current channel (to avoid redundancy)
      if (event.channelId === currentChannelId || event.channel_id === currentChannelId) {
        continue;
      }

      // Deduplicate by message ID and content
      const key = `${event.messageId || event.message_id}:${event.contentText || event.content_text}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      filtered.push(event);
    }

    return filtered.slice(0, limit);
  } catch (error) {
    if (logger) {
      logger.warn("[cross-channel] Event retrieval failed", {
        userId,
        companionId,
        error: error.message,
      });
    }
    return [];
  }
}

function buildCrossChannelContextSection(events = []) {
  if (!events || events.length === 0) {
    return null;
  }

  const byPlatform = {};
  const lines = ["## CROSS-CHANNEL CONTEXT"];
  lines.push("Recent messages from other channels:");
  lines.push("");

  // Organize by platform for summary
  for (const event of events) {
    const platform = event.platform || "unknown";
    if (!byPlatform[platform]) {
      byPlatform[platform] = [];
    }
    byPlatform[platform].push(event);
  }

  // Build narrative
  for (const event of events.slice(0, 10)) {
    const platform = event.platform || "unknown";
    const platformLabel = platform
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    const author = event.authorDisplayName || event.author_display_name || "user";
    const role = event.role || "user";
    const rolePrefix = role === "user" ? "" : "You: ";
    const timestamp = event.createdAt || event.created_at;
    const timeNote = timestamp ? ` (${new Date(timestamp).toLocaleTimeString()})` : "";

    const content = event.contentText || event.content_text || "";
    lines.push(`[${platformLabel}] ${author}${timeNote}: ${content}`);
  }

  lines.push("");
  lines.push("Platform summary:");
  for (const [platform, platformEvents] of Object.entries(byPlatform)) {
    const count = platformEvents.length;
    const platformLabel = platform
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    lines.push(`- ${platformLabel}: ${count} message${count !== 1 ? "s" : ""}`);
  }
  lines.push("");

  return lines.join("\n");
}

function filterCrossChannelByPrivacy(events = [], currentChannelScope = "public") {
  if (!events || events.length === 0) {
    return [];
  }

  return events.filter((event) => {
    const scope = event.privacyScope || "public";
    const channelMode = event.channelMode || "public";

    // Never leak private/DM-only content to public channels
    if (currentChannelScope === "public" && (scope === "private" || channelMode === "dm")) {
      return false;
    }

    // Allow if privacy scopes match
    return true;
  });
}

module.exports = {
  retrieveCrossChannelEvents,
  buildCrossChannelContextSection,
  filterCrossChannelByPrivacy,
};
