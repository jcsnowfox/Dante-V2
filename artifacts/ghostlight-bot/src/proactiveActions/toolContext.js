const TOOL_NAME_ALIASES = Object.freeze({
  gif_search: ["search_gifs"],
  generate_image: ["generate_image"],
  generate_audio: ["generate_audio"],
  spotify: ["search_music_library", "get_current_spotify_track", "create_curated_spotify_playlist", "add_tracks_to_spotify_playlist", "search_music_playlists"],
  spotify_curation: ["search_music_library", "get_current_spotify_track", "create_curated_spotify_playlist", "add_tracks_to_spotify_playlist", "search_music_playlists"],
  spotify_playback: ["get_current_spotify_track", "search_music_playlists", "play_spotify_music"],
});

const CONTEXT_LOOKUP_TOOL_NAMES = Object.freeze([
  "search_memories",
  "search_recent_conversations",
]);

function uniqueToolNames(items = []) {
  return items
    .filter(Boolean)
    .filter((toolName, index, tools) => tools.indexOf(toolName) === index);
}

function mapEnabledToolsToToolContext(enabledTools = []) {
  const normalized = Array.isArray(enabledTools)
    ? enabledTools.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : [];

  return {
    allowedToolNames: uniqueToolNames([
      ...normalized.flatMap((toolName) => TOOL_NAME_ALIASES[toolName] || []),
      ...CONTEXT_LOOKUP_TOOL_NAMES,
    ]),
    allowWebSearch: normalized.includes("web_search"),
    proactiveEnabledTools: normalized,
  };
}

function getChannelConversationId(channel = null, fallbackChannelId = "") {
  if (!channel) {
    return String(fallbackChannelId || "").trim();
  }

  return channel.isThread?.()
    ? String(channel.id || fallbackChannelId || "").trim()
    : String(channel.id || fallbackChannelId || "").trim();
}

function getMemoryContextIds(memories = []) {
  return (Array.isArray(memories) ? memories : [])
    .map((memory) => memory?.memoryId || memory?.memory_id || "")
    .filter(Boolean);
}

function buildProactiveToolContext({
  surface,
  enabledTools = [],
  config = {},
  channel = null,
  mode = null,
  actionName = "",
  actionType = "",
  conversationId = "",
  channelId = "",
  sourceMessageId = "",
  currentUserText = "",
  recentHistory = [],
  memories = [],
} = {}) {
  const resolvedChannelId = String(channelId || channel?.id || "").trim();

  return {
    surface,
    userScope: config.memory?.userScope,
    guildId: channel?.guildId || config.discord?.guildId || "",
    mode,
    actionName: String(actionName || "").trim(),
    actionType: String(actionType || "").trim(),
    target: resolvedChannelId,
    conversationId: conversationId || getChannelConversationId(channel, resolvedChannelId),
    channelId: resolvedChannelId,
    sourceMessageId,
    currentUserId: String(config.chat?.userId || "").trim(),
    currentUserName: config.chat?.promptBlocks?.userName || "",
    currentUserText,
    recentHistory,
    memoryContextIds: getMemoryContextIds(memories),
    ...mapEnabledToolsToToolContext(enabledTools),
  };
}

module.exports = {
  CONTEXT_LOOKUP_TOOL_NAMES,
  buildProactiveToolContext,
  mapEnabledToolsToToolContext,
};
