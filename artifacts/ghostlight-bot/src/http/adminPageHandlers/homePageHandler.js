const crypto = require("node:crypto");
const { canGenerateAudio } = require("../../audio/generateAudio");
const { buildMediaGetUrl, hasStorageConfig } = require("../../images/bucketStorage");
const { buildLicenseHomeWarning } = require("../../license");
const {
  isDailyThreadAction,
  loadDailyThreadAutomation,
} = require("../../automations/dailyThreadAction");
const { isReviewQueueItem } = require("./shared");
const { getLatestUpdateNotice } = require("../updateNotice");

const HOME_IMAGE_POOL_LIMIT = 90;
const HOME_IMAGE_CAROUSEL_RECENT_LIMIT = 5;
const HOME_IMAGE_CAROUSEL_RANDOM_LIMIT = 20;
const HOME_IMAGE_CAROUSEL_LIMIT = HOME_IMAGE_CAROUSEL_RECENT_LIMIT + HOME_IMAGE_CAROUSEL_RANDOM_LIMIT;
const HOME_IMAGE_ROTATION_HOURS = 6;

function createSeededRandom(seedInput) {
  const seedHex = crypto.createHash("sha256").update(String(seedInput || "")).digest("hex").slice(0, 8);
  let state = Number.parseInt(seedHex, 16) >>> 0;

  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(items, seedInput) {
  const shuffled = Array.isArray(items) ? [...items] : [];
  const random = createSeededRandom(seedInput);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function selectHomeCarouselImages(images = [], { userScope = "", now = new Date(), mode = "randomized" } = {}) {
  const allImages = Array.isArray(images) ? images.filter(Boolean) : [];
  const normalizedMode = mode === "recent" ? "recent" : "randomized";

  if (allImages.length <= HOME_IMAGE_CAROUSEL_LIMIT) {
    return normalizedMode === "randomized" ? shuffleWithSeed(allImages, `${String(userScope || "").trim().toLowerCase()}:small`) : allImages;
  }

  if (normalizedMode === "recent") {
    return allImages.slice(0, HOME_IMAGE_CAROUSEL_LIMIT);
  }

  const pinnedRecentImages = allImages.slice(0, HOME_IMAGE_CAROUSEL_RECENT_LIMIT);
  const remainingImages = allImages.slice(HOME_IMAGE_CAROUSEL_RECENT_LIMIT);

  const date = now instanceof Date ? now : new Date(now);
  const rotationWindow = Number.isFinite(date.getTime())
    ? Math.floor(date.getTime() / (HOME_IMAGE_ROTATION_HOURS * 60 * 60 * 1000))
    : 0;
  const seed = `${String(userScope || "").trim().toLowerCase()}:${rotationWindow}`;

  return shuffleWithSeed(pinnedRecentImages.concat(
    shuffleWithSeed(remainingImages, seed).slice(0, HOME_IMAGE_CAROUSEL_RANDOM_LIMIT),
  ), `${seed}:final`);
}

async function handleHomePageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const {
    getMessage,
    getError,
    renderAdminShell,
    renderHomePage,
  } = helpers;

  const allMemories = await innerContext.memoryStore.listMemories({
    userScope: innerContext.config.memory.userScope,
    limit: 5000,
    activeOnly: false,
  });
  const generatedItems = await innerContext.generatedMemories.listGeneratedMemories({
    userScope: innerContext.config.memory.userScope,
    limit: 500,
  });
  const reviewQueueItems = generatedItems.filter((item) => isReviewQueueItem(item, "needs_review"));
  const dailyThreadAutomation = await loadDailyThreadAutomation({
    proactiveActionStore: innerContext.proactiveActionStore,
    automationStore: innerContext.automationStore,
    config: innerContext.config,
    logger: innerContext.logger,
  });
  const scheduledAutomations = await innerContext.proactiveActionStore.listActions({
    userScope: innerContext.config.memory.userScope,
    triggerType: "scheduled",
  });
  const scheduledActions = scheduledAutomations.filter((action) => !isDailyThreadAction(action));
  const failedAutomations = scheduledActions.filter((automation) => automation.enabled && String(automation.lastError || "").trim());
  const heartbeatRuntime = await innerContext.heartbeat.getRuntimeSnapshot().catch((error) => {
    innerContext.logger.warn("[admin] Failed to load heartbeat runtime for home dashboard", {
      error: error?.message || String(error),
    });
    return null;
  });
  const heartbeatActions = await innerContext.proactiveActionStore.listActions({
    userScope: innerContext.config.memory.userScope,
    triggerType: "heartbeat",
  }).catch((error) => {
    innerContext.logger.warn("[admin] Failed to load heartbeat actions for home dashboard", {
      error: error?.message || String(error),
    });
    return [];
  });
  const heartbeatErrors = (Array.isArray(heartbeatRuntime?.recentDebugEvents) ? heartbeatRuntime.recentDebugEvents : [])
    .filter((item) => item.status === "failed");
  const licenseWarning = buildLicenseHomeWarning(innerContext.licenseRuntime);
  const warnings = [
    licenseWarning,
    reviewQueueItems.length
      ? {
        title: "Review queue waiting",
        detail: `${reviewQueueItems.length} memory ${reviewQueueItems.length === 1 ? "item needs" : "items need"} review.`,
        path: "/admin/memory/review",
        cta: "Open review queue",
      }
      : null,
    failedAutomations.length
      ? {
        title: "Failed schedules",
        detail: `${failedAutomations.length} scheduled ${failedAutomations.length === 1 ? "action has" : "actions have"} recent errors.`,
        path: "/admin/schedules/actions",
        cta: "Check schedules",
      }
      : null,
    heartbeatErrors.length
      ? {
        title: "Heartbeat errors",
        detail: `${heartbeatErrors.length} recent ${heartbeatErrors.length === 1 ? "error is" : "errors are"} recorded.`,
        path: "/admin/heartbeat/overview",
        cta: "Open Heartbeat",
      }
      : null,
    dailyThreadAutomation?.enabled && !String(dailyThreadAutomation.channelId || "").trim()
      ? {
        title: "Daily thread needs a channel",
        detail: "Daily thread is enabled, but no target channel is set.",
        path: "/admin/schedules/daily-thread",
        cta: "Fix daily thread",
      }
      : null,
  ].filter(Boolean);
  const journalCount = await innerContext.journalStore.countEntries({
    userScope: innerContext.config.memory.userScope,
  });
  const recentJournalEntries = await innerContext.journalStore.listRecentEntries({
    userScope: innerContext.config.memory.userScope,
    limit: 12,
  }).catch((error) => {
    innerContext.logger.warn("[admin] Failed to load recent journals for home dashboard", {
      error: error?.message || String(error),
    });
    return [];
  });
  const recentInnerLifeEntries = innerContext.innerLife?.storeWrapper
    ? await innerContext.innerLife.storeWrapper.list({ status: "active", limit: 6 }).catch(() => [])
    : [];
  const recentImages = await innerContext.generatedImages.listImages({
    userScope: innerContext.config.memory.userScope,
    limit: HOME_IMAGE_POOL_LIMIT,
    status: "completed",
  }).catch((error) => {
    innerContext.logger.warn("[admin] Failed to load recent images for home dashboard", {
      error: error?.message || String(error),
    });
    return [];
  });
  const homeCarouselImages = selectHomeCarouselImages(recentImages, {
    userScope: innerContext.config.memory.userScope,
    mode: String(innerContext.config.imageGeneration?.homepageFeedMode || "").trim().toLowerCase(),
  });
  const appSettings = await innerContext.settingsStore.listSettings().catch((error) => {
    innerContext.logger.warn("[admin] Failed to load app settings for home dashboard", {
      error: error?.message || String(error),
    });
    return {};
  });
  const updateNotice = getLatestUpdateNotice({
    settings: appSettings,
  });

  innerRes.end(renderAdminShell({
    currentSection: "home",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderHomePage({
      stats: {
        activeModel: innerContext.config.llm?.chat?.model || innerContext.config.llm?.chatModel || innerContext.config.openai?.chatModel || "",
        memoryCount: allMemories.filter((memory) => memory.active).length,
        stagedCount: reviewQueueItems.length,
        scheduleCount: scheduledActions.length,
        dailyThreadStatus: dailyThreadAutomation?.enabled ? `Enabled at ${dailyThreadAutomation.scheduleTime}` : (dailyThreadAutomation ? "Paused" : "Not configured"),
        heartbeatStatus: innerContext.config.heartbeat?.activityMode === "off" ? "Off" : (innerContext.config.heartbeat?.activityMode || "normal"),
        timezone: innerContext.config.chat?.timezone || "UTC",
        nextScheduleLabel: scheduledActions[0]?.name || (dailyThreadAutomation?.enabled ? "Daily Thread" : ""),
        journalCount,
        warningText: "",
        warnings,
        updateNotice,
        statuses: [
          {
            label: "Chat model",
            value: innerContext.config.llm?.chat?.model || innerContext.config.llm?.chatModel || innerContext.config.openai?.chatModel || "Not set",
            icon: "chat_model",
            helpText: "Current default chat model.",
          },
          {
            label: "Daily thread",
            value: dailyThreadAutomation?.enabled
              ? `${dailyThreadAutomation.scheduleTime}${dailyThreadAutomation.timezone ? ` (${dailyThreadAutomation.timezone})` : ""}`
              : "Off",
            icon: dailyThreadAutomation?.enabled ? "daily_enabled" : "daily_disabled",
            helpText: dailyThreadAutomation?.enabled
              ? "Daily thread is on."
              : "Daily thread is off.",
          },
          {
            label: "Heartbeat",
            value: innerContext.config.heartbeat?.activityMode === "off" ? "Off" : (innerContext.config.heartbeat?.activityMode || "normal"),
            icon: "heartbeat",
            helpText: "Current heartbeat mode.",
          },
        ],
        featureStates: [
          {
            label: "Timeline memories",
            icon: "timeline",
            active: Boolean(innerContext.config.memory?.dailySummaryEnabled || innerContext.config.memory?.weeklySummaryEnabled),
            path: "/admin/memory/curator",
            helpText: `Timeline memory creation is ${innerContext.config.memory?.dailySummaryEnabled || innerContext.config.memory?.weeklySummaryEnabled ? "On" : "Off"}.`,
          },
          {
            label: "Memory suggestions",
            icon: "memories",
            active: Boolean(innerContext.config.memoryCurator?.enabled),
            path: "/admin/memory/curator",
            helpText: `Memory suggestions are ${innerContext.config.memoryCurator?.enabled ? "On" : "Off"}.`,
          },
          {
            label: "GIFs",
            icon: "gif",
            active: Boolean(innerContext.config.giphy?.apiKey),
            path: "/admin/tools/gifs",
            helpText: `GIF search is ${innerContext.config.giphy?.apiKey ? "On" : "Off"}.`,
          },
          {
            label: "Images",
            icon: "images",
            active: Boolean(innerContext.config.imageGeneration?.enabled),
            path: "/admin/tools/images",
            helpText: `Image generation is ${innerContext.config.imageGeneration?.enabled ? "On" : "Off"}.`,
          },
          {
            label: "Audio",
            icon: "audio",
            active: canGenerateAudio(innerContext.config),
            path: "/admin/tools/audio",
            helpText: `Audio generation is ${canGenerateAudio(innerContext.config) ? "On" : "Off"}.`,
          },
          {
            label: "Spotify",
            icon: "playlist",
            active: Boolean(
              innerContext.config.spotify?.enabled !== false
              && innerContext.config.spotify?.clientId
              && innerContext.config.spotify?.clientSecret
            ),
            path: "/admin/tools/music",
            helpText: `Spotify music curation is ${
              innerContext.config.spotify?.enabled !== false
              && innerContext.config.spotify?.clientId
              && innerContext.config.spotify?.clientSecret
                ? "On"
                : "Off"
            }.`,
          },
        ],
        recentDecisions: [
          ...(Array.isArray(heartbeatRuntime?.recentDecisions) ? heartbeatRuntime.recentDecisions : []),
          ...(Array.isArray(heartbeatRuntime?.recentDebugEvents) ? heartbeatRuntime.recentDebugEvents : [])
            .filter((item) => item && ["failed", "skipped"].includes(item.status))
            .map((item) => ({ ...item, why: item.reason || "Heartbeat did not run.", executorType: item.executorType || "" })),
        ]
          .filter((item) => item && (item.status === "fired" || item.status === "failed" || (item.status === "skipped" && ["low_confidence", "hold_back"].includes(item.reason))))
          .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
          .slice(0, 3)
          .map((item) => {
            const matchedAction = heartbeatActions.find((action) => action.actionId === item.actionId);
            const typeLabels = {
              message: "Message",
              journal: "Journal",
              thread: "New Thread",
            };

            return {
              label: item.status === "fired"
                ? (matchedAction?.name || typeLabels[item.executorType] || item.actionId || "Heartbeat")
                : (item.status === "failed" ? "Heartbeat error" : "Held back"),
              status: item.status,
              executorType: item.executorType || matchedAction?.actionType || "",
              actionType: matchedAction?.actionType || "",
              enabledTools: Array.isArray(matchedAction?.enabledTools) ? matchedAction.enabledTools : [],
              at: item.at || "",
              why: item.why || (item.status === "fired" ? "No detail recorded." : "It didn't fit the moment."),
            };
          }),
        recentJournals: recentJournalEntries.map((entry) => ({
          entryId: entry.entryId,
          title: entry.title || "Journal entry",
          content: entry.content || "",
          createdAt: entry.createdAt || "",
        })),
        recentInnerLifeEntries: recentInnerLifeEntries.map((entry) => ({
          id: String(entry.id || ""),
          entryType: entry.entryType || "",
          title: entry.title || "",
          summary: entry.summary || entry.body || "",
          status: entry.status || "active",
          createdAt: entry.createdAt || "",
        })),
        recentImages: homeCarouselImages
          .filter((image) => image.thumbnailStorageKey || image.storageKey)
          .map((image) => ({
            imageId: image.imageId,
            aspectRatio: image.aspectRatio || "",
            previewUrl: hasStorageConfig(innerContext.config)
              ? buildMediaGetUrl({
                config: innerContext.config,
                key: image.thumbnailStorageKey || image.storageKey,
              })
              : "",
            altText: image.prompt || "Recent generated image",
            tagline: image.prompt || "",
          }))
          .filter((image) => image.previewUrl),
      },
      theme,
    }),
  }));
}

module.exports = {
  handleHomePageRequest,
  selectHomeCarouselImages,
};
