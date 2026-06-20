const {
  inferSpotifyRedirectUri,
} = require("./adminRequestUtils");
const {
  buildMediaGetUrl,
  hasStorageConfig,
} = require("../images/bucketStorage");
const {
  buildMusicActorKey,
} = require("../storage/music");
const {
  buildMemoryQueryState,
  normalizeImageGalleryQueryState,
  buildGeneratedImageTags,
  buildGalleryTagOptions,
  getAdminRouteState,
  isReviewQueueItem,
} = require("./adminPageHandlers/shared");
const { handleHomePageRequest } = require("./adminPageHandlers/homePageHandler");
const { handleImagesPageRequest, handleAudioPageRequest, handleGifToolsPageRequest } = require("./adminPageHandlers/imagesPageHandler");
const { renderMusicToolsPage } = require("./renderAdminPages/musicPages");
const { handleMemoryPageRequest, handleGeneratedDetailRequest } = require("./adminPageHandlers/memoryPageHandler");
const {
  handleCompanionPageRequest,
  handleBehaviourPageRequest,
  handleEmotionalArcPageRequest,
  handleSchedulesPageRequest,
  handleJournalsPageRequest,
  handleHeartbeatPageRequest,
  handleAdminToolsPageRequest,
  handleChannelModesPageRequest,
} = require("./adminPageHandlers/proactivePageHandler");
const { handleFeedbackLearningPageRequest } = require("./adminPageHandlers/feedbackLearningPageHandler");
const { handleRelationalStatePageRequest } = require("./adminPageHandlers/relationalStatePageHandler");
const { handlePromptProfilesPageRequest } = require("./adminPageHandlers/promptProfilesPageHandler");
const { handleSecondLifePageRequest } = require("./adminPageHandlers/secondLifePageHandler");
const { handleInnerLifePageRequest } = require("./adminPageHandlers/innerLifePageHandler");
const { handleContinuityPageRequest } = require("./adminPageHandlers/continuityPageHandler");

async function handleAdminPageRequest({
  req = null,
  url,
  innerRes,
  innerContext,
  helpers,
  currentTheme = "",
}) {
  const {
    normalizeTheme,
    buildThemeLinks,
  } = helpers;

  const theme = normalizeTheme(currentTheme || url.searchParams.get("theme"));
  const themeLinks = buildThemeLinks(url);
  const route = getAdminRouteState(url.pathname);

  innerRes.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });

  if (route.section === "home") {
    await handleHomePageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "gallery" && route.tab === "images") {
    await handleImagesPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "gallery" && route.tab === "audio") {
    await handleAudioPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "gallery" && (route.tab === "music" || route.tab === "playlists")) {
    const userScope = innerContext.config.memory?.userScope || "user";
    const musicTab = route.musicTab === "playlists" ? "playlists" : "tracks";
    const filters = {
      q: String(url.searchParams.get("q") || "").trim(),
      source: String(url.searchParams.get("source") || "").trim(),
      filterTags: Array.from(new Set(String(url.searchParams.get("filterTags") || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean))),
      sort: ["title", "artist", "reaction", "updated"].includes(String(url.searchParams.get("sort") || "").trim().toLowerCase())
        ? String(url.searchParams.get("sort") || "").trim().toLowerCase()
        : "updated",
      direction: String(url.searchParams.get("direction") || "").trim().toLowerCase() === "asc" ? "asc" : "desc",
    };
    filters.tags = filters.filterTags
      .filter((value) => value.startsWith("tag:"))
      .map((value) => value.slice("tag:".length).trim().toLowerCase())
      .filter(Boolean);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = 25;
    const offset = (page - 1) * pageSize;
    let tracks = [];
    let playlists = [];
    let availableTrackTags = [];
    let availablePlaylistTags = [];
    let totalItems = 0;

    if (musicTab === "playlists") {
      [playlists, totalItems, availablePlaylistTags] = await Promise.all([
        innerContext.musicStore?.listPlaylists
          ? innerContext.musicStore.listPlaylists({
            userScope,
            query: filters.q,
            tags: filters.tags,
            limit: pageSize,
            offset,
          })
          : [],
        innerContext.musicStore?.countPlaylists
          ? innerContext.musicStore.countPlaylists({
            userScope,
            query: filters.q,
            tags: filters.tags,
          })
          : 0,
        innerContext.musicStore?.listDistinctPlaylistTags
          ? innerContext.musicStore.listDistinctPlaylistTags({ userScope })
          : [],
      ]);
      if (playlists.length && innerContext.generatedImages?.getImageById && hasStorageConfig(innerContext.config)) {
        playlists = await Promise.all(playlists.map(async (playlist) => {
          const coverImageId = String(playlist.coverImageId || "").trim();
          if (!coverImageId) {
            return {
              ...playlist,
              coverPreviewUrl: playlist.coverPreviewUrl || playlist.spotifyCoverUrl || "",
            };
          }

          try {
            const coverImage = await innerContext.generatedImages.getImageById(coverImageId, { userScope });
            const coverKey = coverImage?.status === "completed"
              ? coverImage.thumbnailStorageKey || coverImage.storageKey
              : "";
            return {
              ...playlist,
              coverPreviewUrl: coverKey
                ? buildMediaGetUrl({
                  config: innerContext.config,
                  key: coverKey,
                })
                : playlist.spotifyCoverUrl || "",
            };
          } catch (error) {
            innerContext.logger?.warn?.("[music] Could not load playlist cover preview", {
              playlistId: playlist.spotifyPlaylistId || "",
              coverImageId,
              error: error.message,
            });
            return {
              ...playlist,
              coverPreviewUrl: playlist.coverPreviewUrl || playlist.spotifyCoverUrl || "",
            };
          }
        }));
      } else if (playlists.length) {
        playlists = playlists.map((playlist) => ({
          ...playlist,
          coverPreviewUrl: playlist.coverPreviewUrl || playlist.spotifyCoverUrl || "",
        }));
      }
    } else {
      [tracks, totalItems, availableTrackTags] = await Promise.all([
        innerContext.musicStore?.listTracks
          ? innerContext.musicStore.listTracks({
            userScope,
            limit: pageSize,
            offset,
            activeOnly: false,
            q: filters.q,
            tags: filters.tags,
            hasAffinitiesOnly: false,
            sort: filters.sort,
            direction: filters.direction,
          })
          : [],
        innerContext.musicStore?.countTracks
          ? innerContext.musicStore.countTracks({
            userScope,
            activeOnly: false,
            q: filters.q,
            tags: filters.tags,
            hasAffinitiesOnly: false,
          })
          : 0,
        innerContext.musicStore?.listDistinctTrackTags
          ? innerContext.musicStore.listDistinctTrackTags({ userScope })
          : [],
      ]);
      if (tracks.length && innerContext.musicStore?.listAffinitiesForTrackIds) {
        const affinities = await innerContext.musicStore.listAffinitiesForTrackIds(
          tracks.map((track) => track.musicTrackId),
          { userScope },
        );
        const userActorKey = buildMusicActorKey({ actor: "user", userScope });
        const affinitiesByTrackId = new Map();

        for (const affinity of affinities || []) {
          const existing = affinitiesByTrackId.get(affinity.musicTrackId) || [];
          existing.push(affinity);
          affinitiesByTrackId.set(affinity.musicTrackId, existing);
        }

        tracks = tracks.map((track) => {
          const trackAffinities = affinitiesByTrackId.get(track.musicTrackId) || [];
          return {
            ...track,
            userAffinity: trackAffinities.find((affinity) => affinity.actorKey === userActorKey) || null,
            aiAffinities: trackAffinities.filter((affinity) => affinity.actorType === "ai"),
          };
        });
      }
    }

    innerRes.end(helpers.renderAdminShell({
      currentSection: "gallery",
      theme,
      themeLinks,
      message: helpers.getMessage(url),
      error: helpers.getError(url),
      pageBody: helpers.renderGalleryLayout({
        currentTab: route.tab,
        theme,
        helpers,
        tabBody: helpers.renderMusicGalleryPage({
          currentTab: musicTab,
          tracks,
          playlists,
          filters,
          page,
          pageSize,
          totalItems,
          availableTrackTags: availableTrackTags.map((tag) => ({
            value: `tag:${tag}`,
            label: tag,
          })),
          availablePlaylistTags: availablePlaylistTags.map((tag) => ({
            value: `tag:${tag}`,
            label: tag,
          })),
          theme,
          helpers,
        }),
      }),
    }));
    return;
  }

  if (route.section === "tools" && route.tab === "images") {
    await handleImagesPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "tools" && route.tab === "audio") {
    await handleAudioPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "tools" && route.tab === "gifs") {
    await handleGifToolsPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "tools" && route.tab === "music") {
    const userScope = innerContext.config.memory?.userScope || "user";
    const [connection, trackCount] = await Promise.all([
      innerContext.musicStore?.getSpotifyConnection
        ? innerContext.musicStore.getSpotifyConnection({ userScope })
        : null,
      innerContext.musicStore?.countTracks
        ? innerContext.musicStore.countTracks({ userScope, activeOnly: false })
        : 0,
    ]);
    let playlists = [];
    let playlistError = "";

    if (connection?.refreshToken && innerContext.spotify?.listPlaylists) {
      try {
        playlists = await innerContext.spotify.listPlaylists({ userScope, limit: 50 });
      } catch (error) {
        playlistError = error?.message || "Spotify playlists could not be loaded.";
      }
    }

    innerRes.end(helpers.renderAdminShell({
      currentSection: "tools",
      theme,
      themeLinks,
      pageBody: renderMusicToolsPage({
        config: innerContext.config,
        connection,
        trackCount,
        playlists,
        playlistError,
        inferredRedirectUri: inferSpotifyRedirectUri(req),
        url,
        currentSection: "tools",
        theme,
        helpers,
      }),
    }));
    return;
  }

  if (route.section === "companion") {
    await handleCompanionPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "behaviour") {
    await handleBehaviourPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "feedbackLearning") {
    await handleFeedbackLearningPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "relationalState") {
    await handleRelationalStatePageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "promptProfiles") {
    await handlePromptProfilesPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "secondLife") {
    await handleSecondLifePageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "emotionalArc") {
    await handleEmotionalArcPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "memory") {
    await handleMemoryPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "schedules") {
    await handleSchedulesPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "journals") {
    await handleJournalsPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "heartbeat") {
    await handleHeartbeatPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "admin" && route.tab === "channelModes") {
    await handleChannelModesPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "innerLife") {
    await handleInnerLifePageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  if (route.section === "continuity") {
    await handleContinuityPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
    return;
  }

  await handleAdminToolsPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks });
}

module.exports = {
  buildMemoryQueryState,
  normalizeImageGalleryQueryState,
  buildGeneratedImageTags,
  buildGalleryTagOptions,
  getAdminRouteState,
  isReviewQueueItem,
  handleAdminPageRequest,
  handleGeneratedDetailRequest,
};
