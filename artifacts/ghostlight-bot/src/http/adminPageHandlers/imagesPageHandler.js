const { buildMediaGetUrl, hasStorageConfig } = require("../../images/bucketStorage");
const { listElevenLabsVoices } = require("../../audio/generateAudio");
const {
  normalizeImageGalleryQueryState,
  buildGeneratedImageTags,
  buildGalleryTagOptions,
} = require("./shared");

function normalizeAudioGalleryQueryState(url) {
  const selectedTag = String(url.searchParams.get("tag") || "").trim();
  const filterTags = Array.from(new Set(String(url.searchParams.get("filterTags") || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith("status:"))));
  if (selectedTag && !selectedTag.startsWith("status:") && !filterTags.includes(selectedTag)) {
    filterTags.push(selectedTag);
  }
  const sourceSurface = selectedTag.startsWith("source:") ? selectedTag.slice("source:".length).trim().toLowerCase() : "";
  const selectedSourceTag = filterTags.find((tag) => tag.startsWith("source:")) || "";
  const customTags = filterTags
    .filter((tag) => tag.startsWith("tag:"))
    .map((tag) => tag.slice("tag:".length).trim().toLowerCase())
    .filter(Boolean);

  return {
    q: String(url.searchParams.get("q") || "").trim(),
    favoritesOnly: url.searchParams.get("favorites") === "true" || filterTags.includes("favorite"),
    status: "",
    sourceSurface: selectedSourceTag ? selectedSourceTag.slice("source:".length).trim().toLowerCase() : sourceSurface,
    tag: selectedTag,
    filterTags,
    tags: customTags,
    page: Math.max(1, Number(url.searchParams.get("page")) || 1),
  };
}

function buildAudioGalleryTagOptions(customTags = []) {
  const options = [
    { value: "source:read_aloud", label: "TTS" },
    { value: "source:chat", label: "Chat" },
    { value: "source:scheduled", label: "Scheduled" },
    { value: "source:heartbeat", label: "Heartbeat" },
    { value: "favorite", label: "Favourite" },
  ];

  for (const tag of customTags) {
    if (tag) {
      options.push({
        value: `tag:${tag}`,
        label: tag,
      });
    }
  }

  return options;
}

async function loadElevenLabsVoiceOptions({ config, logger } = {}) {
  if (!String(config?.elevenlabs?.apiKey || "").trim()) {
    return [];
  }

  try {
    return await listElevenLabsVoices({ config });
  } catch (error) {
    logger?.warn?.("[audio] Could not load ElevenLabs voices for admin UI", {
      message: error.message,
    });
    return [];
  }
}

async function loadConversationLabelsById(innerContext) {
  if (!innerContext?.conversations?.listConversations) {
    return new Map();
  }

  try {
    const conversations = await innerContext.conversations.listConversations({
      guildId: innerContext.config.discord?.guildId || "",
      limit: 1000,
    });
    const labels = new Map();

    for (const conversation of conversations || []) {
      const label = conversation.label || conversation.threadName || conversation.channelName || "";

      for (const id of [conversation.conversationId, conversation.threadId, conversation.channelId]) {
        if (id && label && !labels.has(String(id))) {
          labels.set(String(id), label);
        }
      }
    }

    return labels;
  } catch (error) {
    innerContext.logger?.warn?.("[audio] Could not load conversation labels for audio gallery", {
      message: error.message,
    });
    return new Map();
  }
}

async function handleImagesPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks }) {
  const {
    getMessage,
    getError,
    renderAdminShell,
    renderImagesPage,
    renderImagesGalleryPage,
    renderImageDetailPage,
    renderGalleryLayout,
    renderToolsLayout,
  } = helpers;

  const stylePresetId = String(url.searchParams.get("stylePreset") || "").trim();
  const appearancePresetId = String(url.searchParams.get("appearancePreset") || "").trim();
  const requestedImagesTab = String(url.searchParams.get("imagesTab") || "").trim().toLowerCase();
  const currentImagesTab = requestedImagesTab === "style" || requestedImagesTab === "appearance"
    ? requestedImagesTab
    : appearancePresetId
      ? "appearance"
      : "style";
  const [stylePresets, appearancePresets, selectedStylePreset, selectedAppearancePreset] = await Promise.all([
    innerContext.imageStylePresets.listPresets({
      userScope: innerContext.config.memory.userScope,
      includeArchived: true,
    }),
    innerContext.imageAppearancePresets.listPresets({
      userScope: innerContext.config.memory.userScope,
      includeArchived: true,
    }),
    stylePresetId
      ? innerContext.imageStylePresets.getPresetById(stylePresetId, {
        userScope: innerContext.config.memory.userScope,
      })
      : null,
    appearancePresetId
      ? innerContext.imageAppearancePresets.getPresetById(appearancePresetId, {
        userScope: innerContext.config.memory.userScope,
      })
      : null,
  ]);

  const stylePresetNamesById = new Map(stylePresets.map((preset) => [preset.presetId, preset.name]));
  const appearancePresetNamesById = new Map(appearancePresets.map((preset) => [preset.presetId, preset.name]));
  let pageBody = "";

  if (route.imageId) {
    const image = await innerContext.generatedImages.getImageById(route.imageId, {
      userScope: innerContext.config.memory.userScope,
    });
    const downloadUrl = image?.storageKey && hasStorageConfig(innerContext.config)
      ? buildMediaGetUrl({
        config: innerContext.config,
        key: image.storageKey,
      })
      : "";
    pageBody = renderGalleryLayout({
      currentTab: "images",
      theme,
      helpers,
      tabBody: renderImageDetailPage({
        theme,
        image: image
          ? {
            ...image,
            tags: buildGeneratedImageTags({
              image,
              stylePresetNamesById,
              appearancePresetNamesById,
            }),
            downloadUrl,
          }
          : null,
        helpers,
      }),
    });
  } else if (route.section === "gallery" && route.tab === "images") {
    const filters = normalizeImageGalleryQueryState(url);
    const pageSize = 48;
    const offset = (filters.page - 1) * pageSize;
    const selectedStylePresetIds = filters.filterTags
      .filter((value) => value.startsWith("style:"))
      .map((value) => value.slice("style:".length));
    const selectedAppearancePresetIds = filters.filterTags
      .filter((value) => value.startsWith("appearance:"))
      .map((value) => value.slice("appearance:".length));
    const selectedAspectRatios = filters.filterTags
      .filter((value) => value.startsWith("aspect:"))
      .map((value) => value.slice("aspect:".length));
    const selectedCustomTags = filters.filterTags
      .filter((value) => value.startsWith("tag:"))
      .map((value) => value.slice("tag:".length));
    const [images, totalItems] = await Promise.all([
      innerContext.generatedImages.listImages({
        userScope: innerContext.config.memory.userScope,
        limit: pageSize,
        offset,
        favoritesOnly: filters.favoritesOnly,
        status: filters.status,
        q: filters.q,
        aspectRatios: selectedAspectRatios,
        stylePresetIds: selectedStylePresetIds,
        appearancePresetIds: selectedAppearancePresetIds,
        tags: selectedCustomTags,
      }),
      innerContext.generatedImages.countImages({
        userScope: innerContext.config.memory.userScope,
        favoritesOnly: filters.favoritesOnly,
        status: filters.status,
        q: filters.q,
        aspectRatios: selectedAspectRatios,
        stylePresetIds: selectedStylePresetIds,
        appearancePresetIds: selectedAppearancePresetIds,
        tags: selectedCustomTags,
      }),
    ]);
    const customTags = await innerContext.generatedImages.listDistinctCustomTags({
      userScope: innerContext.config.memory.userScope,
    });
    pageBody = renderGalleryLayout({
      currentTab: "images",
      theme,
      helpers,
      tabBody: renderImagesGalleryPage({
        images: images.map((image) => ({
          ...image,
          tags: buildGeneratedImageTags({
            image,
            stylePresetNamesById,
            appearancePresetNamesById,
          }),
          previewUrl: image.status === "completed" && (image.thumbnailStorageKey || image.storageKey) && hasStorageConfig(innerContext.config)
            ? buildMediaGetUrl({
              config: innerContext.config,
              key: image.thumbnailStorageKey || image.storageKey,
            })
            : "",
        })),
        filters,
        availableTags: buildGalleryTagOptions({
          stylePresets,
          appearancePresets,
          customTags,
        }),
        page: filters.page,
        pageSize,
        totalItems,
        theme,
        helpers,
      }),
    });
  } else {
    pageBody = renderToolsLayout({
      currentTab: "images",
      theme,
      helpers,
      tabBody: renderImagesPage({
        config: innerContext.config,
        theme,
        stylePresets,
        appearancePresets,
        selectedStylePreset,
        selectedAppearancePreset,
        currentTab: currentImagesTab,
        helpers,
      }),
    });
  }

  innerRes.end(renderAdminShell({
    currentSection: route.section === "tools" ? "tools" : "gallery",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody,
  }));
}

async function handleAudioPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks }) {
  const {
    getMessage,
    getError,
    renderAdminShell,
    renderGalleryLayout,
    renderToolsLayout,
    renderAudioSettingsPage,
    renderAudioGalleryPage,
    renderAudioDetailPage,
  } = helpers;
  let pageBody = "";

  if (route.section === "tools") {
    const voiceOptions = await loadElevenLabsVoiceOptions({
      config: innerContext.config,
      logger: innerContext.logger,
    });

    pageBody = renderToolsLayout({
      currentTab: "audio",
      theme,
      helpers,
      tabBody: renderAudioSettingsPage({
        config: innerContext.config,
        voiceOptions,
        theme,
        helpers,
      }),
    });
  } else if (route.audioId) {
    const audio = await innerContext.generatedAudio.getAudioById(route.audioId, {
      userScope: innerContext.config.memory.userScope,
    });
    const downloadUrl = audio?.storageKey && audio.status === "completed" && hasStorageConfig(innerContext.config)
      ? buildMediaGetUrl({
        config: innerContext.config,
        key: audio.storageKey,
      })
      : "";
    const voiceOptions = audio
      ? await loadElevenLabsVoiceOptions({
        config: innerContext.config,
        logger: innerContext.logger,
      })
      : [];

    pageBody = renderGalleryLayout({
      currentTab: "audio",
      theme,
      helpers,
      tabBody: renderAudioDetailPage({
        theme,
        audio: audio ? { ...audio, downloadUrl } : null,
        voiceOptions,
        helpers,
      }),
    });
  } else {
    const filters = normalizeAudioGalleryQueryState(url);
    const pageSize = 12;
    const offset = (filters.page - 1) * pageSize;
    const [audioItems, totalItems, customTags] = await Promise.all([
      innerContext.generatedAudio.listAudio({
        userScope: innerContext.config.memory.userScope,
        limit: pageSize,
        offset,
        favoritesOnly: filters.favoritesOnly,
        status: filters.status,
        sourceSurface: filters.sourceSurface,
        q: filters.q,
        tags: filters.tags,
      }),
      innerContext.generatedAudio.countAudio({
        userScope: innerContext.config.memory.userScope,
        favoritesOnly: filters.favoritesOnly,
        status: filters.status,
        sourceSurface: filters.sourceSurface,
        q: filters.q,
        tags: filters.tags,
      }),
      innerContext.generatedAudio.listDistinctCustomTags({
        userScope: innerContext.config.memory.userScope,
      }),
    ]);
    const conversationLabelsById = await loadConversationLabelsById(innerContext);

    pageBody = renderGalleryLayout({
      currentTab: "audio",
      theme,
      helpers,
      tabBody: renderAudioGalleryPage({
        audioItems: audioItems.map((item) => ({
          ...item,
          conversationLabel: conversationLabelsById.get(String(item.conversationId || ""))
            || conversationLabelsById.get(String(item.channelId || ""))
            || "",
          downloadUrl: item.status === "completed" && item.storageKey && hasStorageConfig(innerContext.config)
            ? buildMediaGetUrl({
              config: innerContext.config,
              key: item.storageKey,
            })
            : "",
        })),
        availableTags: buildAudioGalleryTagOptions(customTags),
        filters,
        page: filters.page,
        pageSize,
        totalItems,
        theme,
        helpers,
      }),
    });
  }

  innerRes.end(renderAdminShell({
    currentSection: route.section === "tools" ? "tools" : "gallery",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody,
  }));
}

async function handleGifToolsPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const {
    getMessage,
    getError,
    renderAdminShell,
    renderToolsLayout,
    renderGifToolsPage,
  } = helpers;

  innerRes.end(renderAdminShell({
    currentSection: "tools",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderToolsLayout({
      currentTab: "gifs",
      theme,
      helpers,
      tabBody: renderGifToolsPage({
        config: innerContext.config,
        helpers,
      }),
    }),
  }));
}

module.exports = {
  loadConversationLabelsById,
  loadElevenLabsVoiceOptions,
  handleImagesPageRequest,
  handleAudioPageRequest,
  handleGifToolsPageRequest,
};
