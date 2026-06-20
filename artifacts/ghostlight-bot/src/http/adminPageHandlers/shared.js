const { ChannelType } = require("discord.js");
const {
  loadDailyThreadAutomation: loadDailyThreadAutomationFromStores,
} = require("../../automations/dailyThreadAction");
const {
  getReviewActionKey,
  getReviewSourceKey,
  isReviewQueueItem,
  itemMatchesReviewFilters,
} = require("../memoryReviewQueue");

function buildMemoryQueryState(url) {
  return {
    active: url.searchParams.get("active") === "archived" ? "archived" : "active",
    q: String(url.searchParams.get("q") || "").trim(),
    memoryType: String(url.searchParams.get("memoryType") || "").trim().toLowerCase(),
    domain: String(url.searchParams.get("domain") || "").trim(),
    sort: String(url.searchParams.get("sort") || "updatedAt").trim(),
    direction: String(url.searchParams.get("direction") || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc",
  };
}

function buildProactiveQueryState(url, { defaultSort = "name", defaultDirection = "asc" } = {}) {
  const sort = String(url.searchParams.get("sort") || defaultSort).trim();
  const direction = String(url.searchParams.get("direction") || defaultDirection).trim().toLowerCase() === "desc"
    ? "desc"
    : "asc";

  return {
    showInactive: url.searchParams.get("showInactive") === "true",
    sort,
    direction,
  };
}

function normalizeDateOnlyParam(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeConversationLimitParam(value) {
  const normalized = Number.parseInt(String(value || "5"), 10);
  return [5, 25, 50, 100, 250].includes(normalized) ? normalized : 5;
}

function buildConversationCleanupQueryState(url) {
  return {
    startDate: normalizeDateOnlyParam(url.searchParams.get("conversationStart")),
    endDate: normalizeDateOnlyParam(url.searchParams.get("conversationEnd")),
    limit: normalizeConversationLimitParam(url.searchParams.get("conversationLimit")),
  };
}

function getConversationCleanupBounds(query = {}) {
  return {
    activeAfter: query.startDate ? `${query.startDate}T00:00:00.000Z` : "",
    activeBefore: query.endDate ? `${query.endDate}T23:59:59.999Z` : "",
  };
}

function getAdminRouteState(pathname) {
  if (pathname === "/admin" || pathname === "/admin/home") {
    return { section: "home" };
  }

  if (pathname === "/admin/companion") {
    return { section: "companion" };
  }

  if (pathname === "/admin/behaviour") {
    return { section: "behaviour" };
  }

  if (pathname === "/admin/feedback-learning") {
    return { section: "feedbackLearning" };
  }
  if (pathname === "/admin/relational-state") {
    return { section: "relationalState" };
  }
  if (pathname === "/admin/second-life") {
    return { section: "secondLife" };
  }
  if (pathname === "/admin/emotional-arc") {
    return { section: "emotionalArc" };
  }

  if (pathname === "/admin/gallery" || pathname === "/admin/gallery/images") {
    return { section: "gallery", tab: "images" };
  }

  if (pathname.startsWith("/admin/gallery/images/detail/")) {
    return {
      section: "gallery",
      tab: "images",
      imageId: pathname.slice("/admin/gallery/images/detail/".length) || "",
    };
  }

  if (pathname === "/admin/gallery/audio") {
    return { section: "gallery", tab: "audio" };
  }

  if (pathname.startsWith("/admin/gallery/audio/detail/")) {
    return {
      section: "gallery",
      tab: "audio",
      audioId: pathname.slice("/admin/gallery/audio/detail/".length) || "",
    };
  }

  if (pathname === "/admin/gallery/music" || pathname === "/admin/gallery/music/tracks") {
    return { section: "gallery", tab: "music", musicTab: "tracks" };
  }

  if (pathname === "/admin/gallery/music/playlists") {
    return { section: "gallery", tab: "playlists", musicTab: "playlists" };
  }

  if (pathname === "/admin/tools" || pathname === "/admin/tools/images") {
    return { section: "tools", tab: "images" };
  }

  if (pathname === "/admin/tools/audio") {
    return { section: "tools", tab: "audio" };
  }

  if (pathname === "/admin/tools/gifs") {
    return { section: "tools", tab: "gifs" };
  }

  if (pathname === "/admin/tools/music") {
    return { section: "tools", tab: "music" };
  }

  if (pathname === "/admin/schedules" || pathname === "/admin/schedules/actions") {
    return { section: "schedules", tab: "actions" };
  }

  if (pathname === "/admin/schedules/daily-thread") {
    return { section: "schedules", tab: "dailyThread" };
  }

  if (pathname === "/admin/journals") {
    return { section: "journals" };
  }

  if (pathname.startsWith("/admin/journals/")) {
    return { section: "journals", entry: pathname.slice("/admin/journals/".length) || "" };
  }

  if (pathname === "/admin/admin") {
    return { section: "admin", tab: "storage" };
  }

  if (pathname === "/admin/admin/storage") {
    return { section: "admin", tab: "storage" };
  }

  if (pathname === "/admin/admin/commands") {
    return { section: "admin", tab: "commands" };
  }

  if (pathname === "/admin/admin/channel-modes") {
    return { section: "admin", tab: "channelModes" };
  }

  if (pathname === "/admin/memory" || pathname === "/admin/memory/library") {
    return { section: "memory", tab: "library" };
  }

  if (pathname === "/admin/memory/map") {
    return { section: "memory", tab: "map" };
  }

  if (pathname === "/admin/memory/library/new" || pathname === "/admin/memory/library/edit") {
    return { section: "memory", tab: "library", editor: true };
  }

  if (pathname === "/admin/memory/imports") {
    return { section: "memory", tab: "imports" };
  }

  if (pathname === "/admin/memory/review") {
    return { section: "memory", tab: "review" };
  }

  if (pathname === "/admin/memory/curator") {
    return { section: "memory", tab: "curator" };
  }

  if (pathname === "/admin/heartbeat" || pathname === "/admin/heartbeat/overview") {
    return { section: "heartbeat", tab: "overview" };
  }

  if (pathname.startsWith("/admin/heartbeat/")) {
    return { section: "heartbeat", tab: pathname.slice("/admin/heartbeat/".length) || "overview" };
  }

  if (pathname === "/admin/inner-life" || pathname.startsWith("/admin/inner-life/")) {
    return { section: "innerLife" };
  }

  if (pathname === "/admin/continuity" || pathname.startsWith("/admin/continuity/")) {
    return { section: "continuity" };
  }

  return { section: "home" };
}

function filterConversationsByCleanupQuery(conversations = [], query = {}) {
  const startTime = query.startDate ? Date.parse(`${query.startDate}T00:00:00.000Z`) : null;
  const endTime = query.endDate ? Date.parse(`${query.endDate}T23:59:59.999Z`) : null;

  return conversations.filter((conversation) => {
    const lastEventTime = Date.parse(conversation.lastEventAt || "");

    if (Number.isNaN(lastEventTime)) {
      return false;
    }

    if (startTime !== null && lastEventTime < startTime) {
      return false;
    }

    if (endTime !== null && lastEventTime > endTime) {
      return false;
    }

    return true;
  });
}

async function fetchDiscordChannel(client, channelId) {
  const normalizedChannelId = String(channelId || "").trim();

  if (!client || !normalizedChannelId) {
    return null;
  }

  return client.channels?.cache?.get?.(normalizedChannelId)
    || (typeof client.channels?.fetch === "function"
      ? await client.channels.fetch(normalizedChannelId).catch(() => null)
      : null);
}

async function resolveConversationParentChannel(innerContext, conversation = {}) {
  if (!conversation.threadId && !conversation.channelId) {
    return conversation;
  }

  const client = innerContext.client;

  if (!client) {
    return conversation;
  }

  if (conversation.threadId) {
    const thread = /^\d{6,}$/.test(String(conversation.threadId))
      ? await fetchDiscordChannel(client, conversation.threadId)
      : null;
    const parentLookupId = thread?.parentId || conversation.parentChannelId || conversation.channelId;
    const parent = thread?.parent
      || (/^\d{6,}$/.test(String(parentLookupId || ""))
        ? await fetchDiscordChannel(client, parentLookupId)
        : null);

    const refreshed = {
      ...conversation,
      parentChannelId: parent?.id || thread?.parentId || conversation.parentChannelId,
      parentChannelName: parent?.name || conversation.parentChannelName,
      channelName: parent?.name || conversation.channelName,
    };

    if (thread?.name) {
      refreshed.threadName = thread.name;
    }

    return refreshed;
  }

  const lookupId = conversation.channelId;

  if (!lookupId || !/^\d{6,}$/.test(String(lookupId))) {
    return conversation;
  }

  const channel = await fetchDiscordChannel(client, lookupId);

  if (!channel) {
    return conversation;
  }

  return {
    ...conversation,
    channelName: channel.name || conversation.channelName,
  };
}

async function resolveConversationParentChannels(innerContext, conversations = []) {
  return Promise.all(conversations.map((conversation) => (
    resolveConversationParentChannel(innerContext, conversation)
  )));
}

async function loadConversationStorage(innerContext, query = {}) {
  try {
    const bounds = getConversationCleanupBounds(query);
    const stats = await innerContext.conversations.getStorageStats({
      guildId: innerContext.config.discord.guildId || "",
    });
    const recentConversations = innerContext.conversations.listConversations
      ? await innerContext.conversations.listConversations({
        guildId: innerContext.config.discord.guildId || "",
        limit: query.limit || 5,
        activeAfter: bounds.activeAfter,
        activeBefore: bounds.activeBefore,
      })
      : [];
    const filteredConversations = filterConversationsByCleanupQuery(recentConversations, query).slice(0, query.limit || 5);
    const labelledConversations = await resolveConversationParentChannels(innerContext, filteredConversations);

    return {
      ...stats,
      recentConversations: labelledConversations,
      cleanupQuery: query,
    };
  } catch (error) {
    innerContext.logger.warn("[admin] Failed to load conversation storage stats", {
      error: error?.message || String(error),
    });
    return null;
  }
}

async function loadDailyThreadAutomation(innerContext) {
  return loadDailyThreadAutomationFromStores({
    proactiveActionStore: innerContext.proactiveActionStore,
    automationStore: innerContext.automationStore,
    config: innerContext.config,
    logger: innerContext.logger,
  });
}

function formatDiscordTargetLabel(channel) {
  if (!channel) {
    return "";
  }

  if (typeof channel.isThread === "function" && channel.isThread()) {
    return `Thread: ${channel.name || channel.id}`;
  }

  return channel.name ? `#${channel.name}` : channel.id;
}

function isSelectableDiscordParentChannel(channel) {
  if (!channel || (typeof channel.isThread === "function" && channel.isThread())) {
    return false;
  }

  return Boolean(
    (typeof channel.isTextBased === "function" && channel.isTextBased())
      || channel.type === ChannelType.GuildForum
      || channel.type === ChannelType.GuildMedia,
  );
}

function getDiscordSnowflakeTimestamp(value) {
  const rawValue = String(value || "").trim();

  if (!/^\d{6,}$/.test(rawValue)) {
    return null;
  }

  try {
    const snowflake = BigInt(rawValue);
    const discordEpoch = 1420070400000n;
    const timestamp = Number((snowflake >> 22n) + discordEpoch);

    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function isSelectableDiscordThread(channel) {
  if (!channel || !(typeof channel.isThread === "function" && channel.isThread())) {
    return false;
  }

  return channel.archived !== true && channel.locked !== true;
}

function formatUnavailableDiscordTargetLabel(channel) {
  const baseLabel = formatDiscordTargetLabel(channel);

  if (!baseLabel) {
    return "";
  }

  if (typeof channel?.isThread === "function" && channel.isThread()) {
    if (channel.archived === true) {
      return `${baseLabel} (Archived)`;
    }

    if (channel.locked === true) {
      return `${baseLabel} (Locked)`;
    }
  }

  return `${baseLabel} (Unavailable)`;
}

async function loadDiscordTargetOptions(innerContext, targets = [], loadOptions = {}) {
  const includeThreads = loadOptions.includeThreads !== false;
  const client = innerContext.client;
  const guildId = String(innerContext.config.discord?.guildId || "").trim();
  const recentThreadWindowMs = 3 * 24 * 60 * 60 * 1000;
  const recentThreadCutoff = Date.now() - recentThreadWindowMs;

  if (!client || !guildId) {
    return {
      options: [{ value: "daily", label: "Current daily thread" }],
      labelsByValue: new Map([["daily", "Current daily thread"]]),
    };
  }

  const labelsByValue = new Map([["daily", "Current daily thread"]]);
  const options = [{ value: "daily", label: "Current daily thread" }];
  const optionValues = new Set(["daily"]);

  try {
    const guild = client.guilds?.cache?.get(guildId) || await client.guilds.fetch(guildId);
    const fetchedChannels = await guild.channels.fetch();
    const activeThreads = includeThreads && guild.channels.fetchActiveThreads
      ? await guild.channels.fetchActiveThreads().catch(() => null)
      : null;
    const threadChannels = activeThreads?.threads ? Array.from(activeThreads.threads.values()) : [];
    const referencedTargets = Array.from(new Set(
      (Array.isArray(targets) ? targets : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ));
    const referencedTargetSet = new Set(referencedTargets);

    const addOption = (value, label, metadata = {}) => {
      const normalizedValue = String(value || "").trim();
      const normalizedLabel = String(label || "").trim();

      if (!normalizedValue || !normalizedLabel || optionValues.has(normalizedValue)) {
        return;
      }

      optionValues.add(normalizedValue);
      labelsByValue.set(normalizedValue, normalizedLabel);
      options.push({ value: normalizedValue, label: normalizedLabel, ...metadata });
    };

    for (const channel of fetchedChannels.values()) {
      if (!channel || channel.id === guildId) {
        continue;
      }

      if (isSelectableDiscordParentChannel(channel)) {
        addOption(channel.id, formatDiscordTargetLabel(channel), { channelType: channel.type });
      }
    }

    if (includeThreads) {
      for (const thread of threadChannels) {
        const threadTimestamp = getDiscordSnowflakeTimestamp(thread?.id);
        const isRecentThread = threadTimestamp !== null && threadTimestamp >= recentThreadCutoff;
        const isReferencedThread = referencedTargetSet.has(String(thread?.id || "").trim());

        if (thread?.id && isSelectableDiscordThread(thread) && (isRecentThread || isReferencedThread)) {
          addOption(thread.id, formatDiscordTargetLabel(thread));
        }
      }
    }

    for (const target of referencedTargets) {
      if (target === "daily" || labelsByValue.has(target) || !/^\d{6,}$/.test(target)) {
        continue;
      }

      const channel = await client.channels.fetch(target).catch(() => null);

      if (channel?.id) {
        if (typeof channel.isThread === "function" && channel.isThread()) {
          if (includeThreads) {
            addOption(
              channel.id,
              isSelectableDiscordThread(channel)
                ? formatDiscordTargetLabel(channel)
                : formatUnavailableDiscordTargetLabel(channel),
            );
          }
        } else {
          addOption(channel.id, formatDiscordTargetLabel(channel), { channelType: channel.type });
        }
      }
    }

    options.sort((left, right) => {
      if (left.value === "daily") return -1;
      if (right.value === "daily") return 1;
      return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
    });
  } catch (error) {
    innerContext.logger.warn("[admin] Failed to load Discord target options", {
      error: error?.message || String(error),
    });
  }

  return {
    options,
    labelsByValue,
  };
}

function normalizeImageGalleryQueryState(url) {
  const filterTags = Array.from(new Set(String(url.searchParams.get("filterTags") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)));
  const statusTag = filterTags.find((value) => value.startsWith("status:"));

  return {
    page: Math.max(1, Number.parseInt(String(url.searchParams.get("page") || "1"), 10) || 1),
    favoritesOnly: url.searchParams.get("favorites") === "true",
    status: statusTag ? statusTag.slice("status:".length) : String(url.searchParams.get("status") || "").trim().toLowerCase(),
    q: String(url.searchParams.get("q") || "").trim(),
    filterTags,
  };
}

function buildGeneratedImageTags({ image, stylePresetNamesById, appearancePresetNamesById }) {
  const tags = [];

  for (const presetId of Array.isArray(image?.stylePresetIds) ? image.stylePresetIds : []) {
    const name = stylePresetNamesById.get(presetId);
    if (name) {
      tags.push(name);
    }
  }

  for (const presetId of Array.isArray(image?.appearancePresetIds) ? image.appearancePresetIds : []) {
    const name = appearancePresetNamesById.get(presetId);
    if (name) {
      tags.push(name);
    }
  }

  if (image?.aspectRatio) {
    tags.push(image.aspectRatio);
  }

  if (image?.status === "failed") {
    tags.push("failed");
  }

  if (image?.isFavorite) {
    tags.push("favourite");
  }

  if (Array.isArray(image?.customTags)) {
    tags.push(...image.customTags);
  }

  return Array.from(new Set(tags.map((tag) => String(tag || "").trim()).filter(Boolean)));
}

function buildGalleryTagOptions({ stylePresets = [], appearancePresets = [], customTags = [] }) {
  const options = [
    { value: "status:completed", label: "Status: Completed" },
    { value: "status:failed", label: "Status: Failed" },
    { value: "aspect:1:1", label: "Format: Square (1:1)" },
    { value: "aspect:9:16", label: "Format: Portrait (9:16)" },
    { value: "aspect:16:9", label: "Format: Landscape (16:9)" },
  ];

  for (const preset of stylePresets) {
    if (preset?.presetId && preset?.name) {
      options.push({
        value: `style:${preset.presetId}`,
        label: `Style: ${preset.name}`,
      });
    }
  }

  for (const preset of appearancePresets) {
    if (preset?.presetId && preset?.name) {
      options.push({
        value: `appearance:${preset.presetId}`,
        label: `Appearance: ${preset.name}`,
      });
    }
  }

  for (const tag of customTags) {
    if (tag) {
      options.push({
        value: `tag:${tag}`,
        label: `Tag: ${tag}`,
      });
    }
  }

  return options;
}

module.exports = {
  buildMemoryQueryState,
  buildProactiveQueryState,
  buildConversationCleanupQueryState,
  getAdminRouteState,
  getReviewActionKey,
  getReviewSourceKey,
  itemMatchesReviewFilters,
  isReviewQueueItem,
  loadConversationStorage,
  loadDailyThreadAutomation,
  loadDiscordTargetOptions,
  normalizeImageGalleryQueryState,
  buildGeneratedImageTags,
  buildGalleryTagOptions,
};
