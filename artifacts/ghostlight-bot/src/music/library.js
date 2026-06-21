const { embedTexts } = require("../memory/embeddings");
const { hasLlmApiKey } = require("../llm/client");
const { deriveGenreFamilies, mergeGenreFamilies } = require("./spotify");
const {
  ensureCollection,
  upsertPoints,
  deletePoints,
  deletePointsByFilter,
  searchPoints,
} = require("../memory/qdrantClient");
const { buildMusicActorKey } = require("../storage/music");

const MUSICBRAINZ_ENRICHMENT_DELAY_MS = 5000;
const MUSICBRAINZ_ENRICHMENT_ERROR_DELAY_MS = 300000;
const MUSIC_DIRTY_EMBEDDING_BATCH_SIZE = 25;

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function normalizeSearchLimit(value, fallback = 5) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(parsed, 10));
}

function normalizeMusicFilterTerms(value = []) {
  const items = Array.isArray(value)
    ? value
    : String(value || "").split(",");

  return Array.from(new Set(items
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)))
    .slice(0, 20);
}

const BROAD_GENRE_FAMILY_FILTERS = Object.freeze(new Set([
  "rock",
  "metal",
  "punk",
  "pop",
  "indie",
  "alternative",
  "electronic",
  "dance",
  "hip-hop",
  "hip hop",
  "rnb-soul",
  "rnb",
  "r&b",
  "soul",
  "jazz",
  "blues",
  "folk",
  "country",
  "classical",
  "soundtrack",
  "latin",
  "reggae",
  "world",
]));

function normalizeGenreComparable(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-_/]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGenreComparableVariants(value = "") {
  const normalized = normalizeGenreComparable(value);

  if (!normalized) {
    return [];
  }

  const variants = new Set([normalized]);

  if (/\balt\b/.test(normalized)) {
    variants.add(normalized.replace(/\balt\b/g, "alternative"));
  }

  if (/\balternative\b/.test(normalized)) {
    variants.add(normalized.replace(/\balternative\b/g, "alt"));
  }

  if (/\brnb\b/.test(normalized)) {
    variants.add(normalized.replace(/\brnb\b/g, "r and b"));
  }

  if (/\br and b\b/.test(normalized)) {
    variants.add(normalized.replace(/\br and b\b/g, "rnb"));
  }

  return Array.from(variants);
}

function payloadGenreIncludesAny(value, filters = []) {
  const normalizedFilters = normalizeMusicFilterTerms(filters);

  if (!normalizedFilters.length) {
    return true;
  }

  const genreVariants = normalizeMusicFilterTerms(value)
    .flatMap(buildGenreComparableVariants);

  return normalizedFilters.some((filter) => {
    const filterVariants = buildGenreComparableVariants(filter);

    return filterVariants.some((filterVariant) => genreVariants.some((genreVariant) => (
      genreVariant === filterVariant
      || genreVariant.includes(filterVariant)
    )));
  });
}

function buildMusicPayloadMatchCondition(key, values = []) {
  const normalizedValues = normalizeMusicFilterTerms(values);

  if (!normalizedValues.length) {
    return null;
  }

  return {
    key,
    match: normalizedValues.length === 1
      ? { value: normalizedValues[0] }
      : { any: normalizedValues },
  };
}

function payloadArrayIncludesAny(value, filters = []) {
  const normalizedFilters = normalizeMusicFilterTerms(filters);

  if (!normalizedFilters.length) {
    return true;
  }

  const values = normalizeMusicFilterTerms(value);
  return normalizedFilters.some((filter) => values.includes(filter));
}

function normalizeReleaseYearFilter(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 9999 ? parsed : null;
}

function payloadReleaseYearInRange(payload = {}, { minReleaseYear = null, maxReleaseYear = null } = {}) {
  const minYear = normalizeReleaseYearFilter(minReleaseYear);
  const maxYear = normalizeReleaseYearFilter(maxReleaseYear);

  if (minYear === null && maxYear === null) {
    return true;
  }

  const releaseYear = normalizeReleaseYearFilter(payload.release_year);
  if (releaseYear === null) {
    return false;
  }

  return (minYear === null || releaseYear >= minYear)
    && (maxYear === null || releaseYear <= maxYear);
}

function payloadMatchesMusicFilters(payload = {}, {
  genres = [],
  genreFamilies = [],
  tags = [],
  reactions = [],
  minReleaseYear = null,
  maxReleaseYear = null,
} = {}) {
  return payloadGenreIncludesAny(payload.effective_genres, genres)
    && payloadArrayIncludesAny(payload.effective_genre_families, genreFamilies)
    && payloadArrayIncludesAny(payload.affinity_tags, tags)
    && payloadArrayIncludesAny(payload.affinity_reactions, reactions)
    && payloadReleaseYearInRange(payload, { minReleaseYear, maxReleaseYear });
}

function getArtistNames(track = {}) {
  return Array.isArray(track.artists)
    ? track.artists.map((artist) => String(artist?.name || artist || "").trim()).filter(Boolean)
    : [];
}

function formatAffinitiesForText(affinities = []) {
  return affinities
    .map((affinity) => [
      `${affinity.actorDisplayName || affinity.actorKey}: ${affinity.reaction}`,
      affinity.tags?.length ? `tags ${affinity.tags.join(", ")}` : "",
      affinity.note || "",
    ].filter(Boolean).join("; "))
    .filter(Boolean);
}

function collectAffinityTags(affinities = []) {
  return Array.from(new Set((Array.isArray(affinities) ? affinities : [])
    .flatMap((affinity) => Array.isArray(affinity.tags) ? affinity.tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean)));
}

function collectAffinityReactions(affinities = []) {
  return Array.from(new Set((Array.isArray(affinities) ? affinities : [])
    .map((affinity) => String(affinity.reaction || "").trim().toLowerCase())
    .filter(Boolean)));
}

function getReleaseEraText(releaseYear) {
  const parsed = Number.parseInt(String(releaseYear || ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 9999) {
    return "";
  }

  const decadeStart = Math.floor(parsed / 10) * 10;
  return `${decadeStart}s`;
}

function buildMusicEmbeddingText({ track = {}, affinities = [] } = {}) {
  const artists = getArtistNames(track);
  const affinityLines = formatAffinitiesForText(affinities);
  const affinityTags = collectAffinityTags(affinities);
  const affinityReactions = collectAffinityReactions(affinities);
  const userGenres = Array.isArray(track.userGenres) ? track.userGenres : [];
  const artistGenres = Array.isArray(track.artistGenres) ? track.artistGenres : [];
  const musicBrainzTags = Array.isArray(track.musicBrainzTags) ? track.musicBrainzTags : [];
  const importedGenreFamilies = Array.isArray(track.genreFamilies) ? track.genreFamilies : [];
  const effectiveGenres = userGenres.length ? userGenres : artistGenres;
  const effectiveGenreFamilies = userGenres.length
    ? mergeGenreFamilies(userGenres)
    : importedGenreFamilies;
  const releaseEra = getReleaseEraText(track.releaseYear);

  return [
    "Music similarity profile:",
    effectiveGenreFamilies.length ? `Primary genre families: ${effectiveGenreFamilies.join(", ")}` : "",
    effectiveGenres.length ? `Specific genres: ${effectiveGenres.join(", ")}` : "",
    userGenres.length && artistGenres.length ? `Imported genres: ${artistGenres.join(", ")}` : "",
    musicBrainzTags.length ? `Imported music metadata tags: ${musicBrainzTags.join(", ")}` : "",
    track.releaseYear ? `Release year: ${track.releaseYear}` : "",
    releaseEra ? `Release era: ${releaseEra}` : "",
    affinityTags.length ? `Taste and mood tags: ${affinityTags.join(", ")}` : "",
    affinityReactions.length ? `Taste reactions: ${affinityReactions.join(", ")}` : "",
    affinityLines.length ? `Preference notes and associations: ${affinityLines.join(" | ")}` : "",
    "Reference metadata, not mood or genre:",
    `Song title: ${track.title || "Untitled"}`,
    artists.length ? `Artist names: ${artists.join(", ")}` : "",
    track.albumName ? `Album title: ${track.albumName}` : "",
    track.albumReleaseDate ? `Album release date: ${track.albumReleaseDate}` : "",
    track.likedAt ? `Library liked timestamp: ${track.likedAt}` : "",
  ].filter(Boolean).join("\n");
}

function buildMusicQdrantPoint({ track = {}, affinities = [] } = {}, vector) {
  const artists = getArtistNames(track);
  const userGenres = Array.isArray(track.userGenres) ? track.userGenres : [];
  const effectiveGenres = userGenres.length
    ? userGenres
    : (Array.isArray(track.artistGenres) ? track.artistGenres : []);
  const effectiveGenreFamilies = userGenres.length
    ? mergeGenreFamilies(userGenres)
    : (Array.isArray(track.genreFamilies) ? track.genreFamilies : []);

  return {
    id: track.musicTrackId,
    vector,
    payload: {
      kind: "track",
      music_track_id: track.musicTrackId,
      user_scope: track.userScope,
      spotify_track_id: track.spotifyTrackId,
      spotify_uri: track.spotifyUri,
      spotify_url: track.spotifyUrl,
      title: track.title,
      artists,
      album_name: track.albumName,
      album_release_date: track.albumReleaseDate,
      album_release_date_precision: track.albumReleaseDatePrecision,
      release_year: track.releaseYear,
      artist_genres: Array.isArray(track.artistGenres) ? track.artistGenres : [],
      genre_families: Array.isArray(track.genreFamilies) ? track.genreFamilies : [],
      user_genres: userGenres,
      musicbrainz_recording_id: track.musicBrainzRecordingId || "",
      musicbrainz_release_id: track.musicBrainzReleaseId || "",
      musicbrainz_release_group_id: track.musicBrainzReleaseGroupId || "",
      musicbrainz_match_confidence: track.musicBrainzMatchConfidence,
      musicbrainz_tags: Array.isArray(track.musicBrainzTags) ? track.musicBrainzTags : [],
      musicbrainz_enrichment_status: track.musicBrainzEnrichmentStatus || "",
      effective_genres: effectiveGenres,
      effective_genre_families: effectiveGenreFamilies,
      liked_at: track.likedAt,
      source: track.source,
      active: Boolean(track.active),
      affinity_tags: collectAffinityTags(affinities),
      affinity_reactions: collectAffinityReactions(affinities),
      affinities: affinities.map((affinity) => ({
        actor_key: affinity.actorKey,
        actor_type: affinity.actorType,
        actor_display_name: affinity.actorDisplayName,
        reaction: affinity.reaction,
        tags: affinity.tags || [],
        note: affinity.note || "",
      })),
      search_text: buildMusicEmbeddingText({ track, affinities }),
      updated_at: track.updatedAt,
      synced_at: track.syncedAt,
    },
  };
}

function buildMusicSearchFilter({
  userScope,
  genres = [],
  genreFamilies = [],
  tags = [],
  reactions = [],
  minReleaseYear = null,
  maxReleaseYear = null,
} = {}) {
  const normalizedGenres = normalizeMusicFilterTerms(genres);
  const normalizedGenreFamilies = normalizeMusicFilterTerms(genreFamilies);
  const normalizedTags = normalizeMusicFilterTerms(tags);
  const normalizedReactions = normalizeMusicFilterTerms(reactions);
  const normalizedMinReleaseYear = normalizeReleaseYearFilter(minReleaseYear);
  const normalizedMaxReleaseYear = normalizeReleaseYearFilter(maxReleaseYear);
  const must = [
    {
      key: "active",
      match: {
        value: true,
      },
    },
    {
      key: "user_scope",
      match: {
        value: userScope,
      },
    },
  ];

  if (normalizedGenres.length) {
    must.push(buildMusicPayloadMatchCondition("effective_genres", normalizedGenres));
  }

  if (normalizedGenreFamilies.length) {
    must.push(buildMusicPayloadMatchCondition("effective_genre_families", normalizedGenreFamilies));
  }

  if (normalizedTags.length) {
    must.push(buildMusicPayloadMatchCondition("affinity_tags", normalizedTags));
  }

  if (normalizedReactions.length) {
    must.push(buildMusicPayloadMatchCondition("affinity_reactions", normalizedReactions));
  }

  if (normalizedMinReleaseYear !== null || normalizedMaxReleaseYear !== null) {
    must.push({
      key: "release_year",
      range: {
        ...(normalizedMinReleaseYear !== null ? { gte: normalizedMinReleaseYear } : {}),
        ...(normalizedMaxReleaseYear !== null ? { lte: normalizedMaxReleaseYear } : {}),
      },
    });
  }

  return { must: must.filter(Boolean) };
}

function buildMusicPlaylistEmbeddingText({ playlist = {} } = {}) {
  return [
    `Playlist: ${playlist.name || "Untitled"}`,
    playlist.description ? `Description: ${playlist.description}` : "",
    playlist.userNote ? `User note: ${playlist.userNote}` : "",
    Array.isArray(playlist.tags) && playlist.tags.length ? `Tags: ${playlist.tags.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function buildMusicPlaylistQdrantPoint({ playlist = {} } = {}, vector) {
  return {
    id: playlist.musicPlaylistId,
    vector,
    payload: {
      kind: "playlist",
      music_playlist_id: playlist.musicPlaylistId,
      user_scope: playlist.userScope,
      spotify_playlist_id: playlist.spotifyPlaylistId,
      spotify_uri: playlist.spotifyUri,
      spotify_url: playlist.spotifyUrl,
      name: playlist.name,
      description: playlist.description,
      source: playlist.source,
      prompt: playlist.prompt,
      created_by_actor_key: playlist.createdByActorKey,
      created_by_display_name: playlist.createdByDisplayName,
      track_count: playlist.trackCount,
      discovery_track_count: playlist.discoveryTrackCount,
      cover_image_id: playlist.coverImageId,
      spotify_cover_url: playlist.spotifyCoverUrl || "",
      is_favorite: Boolean(playlist.isFavorite),
      user_note: playlist.userNote || "",
      tags: Array.isArray(playlist.tags) ? playlist.tags : [],
      search_text: buildMusicPlaylistEmbeddingText({ playlist }),
      created_at: playlist.createdAt,
      updated_at: playlist.updatedAt,
    },
  };
}

function buildMusicPlaylistSearchFilter({ userScope, source = "" } = {}) {
  const must = [
    {
      key: "kind",
      match: {
        value: "playlist",
      },
    },
    {
      key: "user_scope",
      match: {
        value: userScope,
      },
    },
  ];

  if (source) {
    must.push({
      key: "source",
      match: {
        value: source,
      },
    });
  }

  return { must };
}

function canSyncMusic(config = {}) {
  return Boolean(config?.qdrant?.url && config?.qdrant?.musicCollection && hasLlmApiKey(config, "embedding"));
}

function canDeleteMusicPoints(config = {}) {
  return Boolean(config?.qdrant?.url && config?.qdrant?.musicCollection);
}

async function deleteMusicTrackPointsFromQdrant({ config, trackIds = [], deps = {}, logger } = {}) {
  const normalizedIds = Array.isArray(trackIds)
    ? trackIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (!normalizedIds.length || !canDeleteMusicPoints(config)) {
    return {
      deletedCount: 0,
      skipped: true,
    };
  }

  const deletePointsFn = deps.deletePoints || deletePoints;

  try {
    await deletePointsFn({
      config,
      ids: normalizedIds,
      collectionName: config.qdrant.musicCollection,
    });

    return {
      deletedCount: normalizedIds.length,
      skipped: false,
    };
  } catch (error) {
    logger?.warn?.("[music] Failed to delete music Qdrant points", {
      deletedTrackCandidateCount: normalizedIds.length,
      error: error?.message || String(error),
    });

    return {
      deletedCount: 0,
      skipped: true,
      error: error?.message || "Failed to delete music search points.",
    };
  }
}

async function deleteMusicUserScopePointsFromQdrant({ config, userScope, deps = {}, logger } = {}) {
  const normalizedUserScope = String(userScope || "").trim();

  if (!normalizedUserScope || !canDeleteMusicPoints(config)) {
    return {
      deletedCount: 0,
      skipped: true,
    };
  }

  const deletePointsByFilterFn = deps.deletePointsByFilter || deletePointsByFilter;

  try {
    await deletePointsByFilterFn({
      config,
      collectionName: config.qdrant.musicCollection,
      filter: {
        must: [{
          key: "user_scope",
          match: {
            value: normalizedUserScope,
          },
        }],
      },
    });

    return {
      deletedCount: null,
      skipped: false,
    };
  } catch (error) {
    const msg = error?.message || String(error);
    // Qdrant 404 means the collection doesn't exist yet — nothing to delete, not an error.
    if (msg.includes("404") || msg.toLowerCase().includes("doesn't exist") || msg.toLowerCase().includes("does not exist")) {
      return {
        deletedCount: 0,
        skipped: false,
      };
    }

    logger?.warn?.("[music] Failed to delete music Qdrant points by user scope", {
      userScope: normalizedUserScope,
      error: msg,
    });

    return {
      deletedCount: 0,
      skipped: true,
      error: msg || "Failed to delete music search points.",
    };
  }
}

async function syncMusicTracksToQdrant({ config, musicStore, tracks = [], deps = {} } = {}) {
  const activeTracks = Array.isArray(tracks)
    ? tracks.filter((track) => track?.active)
    : [];
  const embedTextsFn = deps.embedTexts || embedTexts;
  const ensureCollectionFn = deps.ensureCollection || ensureCollection;
  const upsertPointsFn = deps.upsertPoints || upsertPoints;
  const collectionName = config.qdrant?.musicCollection;

  if (!activeTracks.length || !musicStore?.persistenceEnabled || !canSyncMusic(config)) {
    return {
      syncedCount: 0,
      skipped: true,
    };
  }

  let syncedCount = 0;
  let collectionReady = false;

  for (const batch of chunkArray(activeTracks, 50)) {
    const trackIds = batch.map((track) => track.musicTrackId);
    const affinities = await musicStore.listAffinitiesForTrackIds(trackIds, {
      userScope: batch[0]?.userScope,
    });
    const affinitiesByTrackId = new Map();

    for (const affinity of affinities) {
      const existing = affinitiesByTrackId.get(affinity.musicTrackId) || [];
      existing.push(affinity);
      affinitiesByTrackId.set(affinity.musicTrackId, existing);
    }

    const pointInputs = batch.map((track) => ({
      track,
      affinities: affinitiesByTrackId.get(track.musicTrackId) || [],
    }));
    const vectors = await embedTextsFn({
      config,
      inputs: pointInputs.map(buildMusicEmbeddingText),
    });

    if (!collectionReady) {
      await ensureCollectionFn({
        config,
        vectorSize: vectors[0].length,
        collectionName,
      });
      collectionReady = true;
    }

    await upsertPointsFn({
      config,
      collectionName,
      points: pointInputs.map((input, index) => buildMusicQdrantPoint(input, vectors[index])),
    });

    await musicStore.markTracksSynced(trackIds);
    syncedCount += batch.length;
  }

  return {
    syncedCount,
    skipped: false,
  };
}

async function syncMusicPlaylistsToQdrant({ config, playlists = [], deps = {} } = {}) {
  const activePlaylists = Array.isArray(playlists)
    ? playlists.filter((playlist) => playlist?.musicPlaylistId)
    : [];
  const embedTextsFn = deps.embedTexts || embedTexts;
  const ensureCollectionFn = deps.ensureCollection || ensureCollection;
  const upsertPointsFn = deps.upsertPoints || upsertPoints;
  const collectionName = config.qdrant?.musicCollection;

  if (!activePlaylists.length || !canSyncMusic(config)) {
    return {
      syncedCount: 0,
      skipped: true,
    };
  }

  let syncedCount = 0;
  let collectionReady = false;

  for (const batch of chunkArray(activePlaylists, 50)) {
    const vectors = await embedTextsFn({
      config,
      inputs: batch.map((playlist) => buildMusicPlaylistEmbeddingText({ playlist })),
    });

    if (!collectionReady) {
      await ensureCollectionFn({
        config,
        vectorSize: vectors[0].length,
        collectionName,
      });
      collectionReady = true;
    }

    await upsertPointsFn({
      config,
      collectionName,
      points: batch.map((playlist, index) => buildMusicPlaylistQdrantPoint({ playlist }, vectors[index])),
    });

    syncedCount += batch.length;
  }

  return {
    syncedCount,
    skipped: false,
  };
}

async function searchMusicLibrary({
  config,
  query,
  userScope,
  limit = 5,
  genres = [],
  genreFamilies = [],
  tags = [],
  reactions = [],
  minReleaseYear = null,
  maxReleaseYear = null,
  deps = {},
} = {}) {
  const normalizedQuery = String(query || "").trim().replace(/\s+/g, " ").slice(0, 240);
  const normalizedLimit = normalizeSearchLimit(limit);
  const requestedGenres = normalizeMusicFilterTerms(genres);
  const broadGenreFamilies = requestedGenres
    .filter((genre) => BROAD_GENRE_FAMILY_FILTERS.has(genre))
    .flatMap((genre) => deriveGenreFamilies([genre]));
  const normalizedGenres = requestedGenres
    .filter((genre) => !BROAD_GENRE_FAMILY_FILTERS.has(genre));
  const inferredGenreFamilies = normalizedGenres.length || normalizeMusicFilterTerms(genreFamilies).length || broadGenreFamilies.length
    ? []
    : deriveGenreFamilies([normalizedQuery]);
  const normalizedGenreFamilies = normalizeMusicFilterTerms([
    ...genreFamilies,
    ...broadGenreFamilies,
    ...inferredGenreFamilies,
  ]);
  const normalizedTags = normalizeMusicFilterTerms(tags);
  const normalizedReactions = normalizeMusicFilterTerms(reactions);
  let normalizedMinReleaseYear = normalizeReleaseYearFilter(minReleaseYear);
  let normalizedMaxReleaseYear = normalizeReleaseYearFilter(maxReleaseYear);

  if (
    normalizedMinReleaseYear !== null
    && normalizedMaxReleaseYear !== null
    && normalizedMinReleaseYear > normalizedMaxReleaseYear
  ) {
    [normalizedMinReleaseYear, normalizedMaxReleaseYear] = [normalizedMaxReleaseYear, normalizedMinReleaseYear];
  }

  const filters = {
    genres: normalizedGenres,
    genreFamilies: normalizedGenreFamilies,
    tags: normalizedTags,
    reactions: normalizedReactions,
    minReleaseYear: normalizedMinReleaseYear,
    maxReleaseYear: normalizedMaxReleaseYear,
  };
  const hasMetadataFilters = Boolean(
    normalizedGenres.length
    || normalizedGenreFamilies.length
    || normalizedTags.length
    || normalizedReactions.length
    || normalizedMinReleaseYear !== null
    || normalizedMaxReleaseYear !== null
  );
  const embedTextsFn = deps.embedTexts || embedTexts;
  const searchPointsFn = deps.searchPoints || searchPoints;

  if (!normalizedQuery) {
    return {
      query: normalizedQuery,
      limit: normalizedLimit,
      filters,
      filterFallbackUsed: false,
      tracks: [],
    };
  }

  if (!canSyncMusic(config)) {
    throw new Error("Music search requires Qdrant and an embedding-capable LLM API key.");
  }

  const [vector] = await embedTextsFn({
    config,
    inputs: [normalizedQuery],
  });
  const hits = await searchPointsFn({
    config,
    vector,
    limit: Math.min(normalizedLimit * 3, 30),
    collectionName: config.qdrant?.musicCollection,
    filter: buildMusicSearchFilter({
      userScope,
      ...filters,
    }),
  });
  let filterFallbackUsed = false;
  let metadataFilterRelaxed = false;
  const warnings = [];
  let trackHits = hits
    .filter((hit) => (hit.payload || {}).kind !== "playlist")
    .slice(0, normalizedLimit);

  if (hasMetadataFilters && (!trackHits.length || (normalizedGenres.length && trackHits.length < normalizedLimit))) {
    const fallbackHits = await searchPointsFn({
      config,
      vector,
      limit: 100,
      collectionName: config.qdrant?.musicCollection,
      filter: buildMusicSearchFilter({ userScope }),
    });

    const localFilterHits = fallbackHits
      .filter((hit) => {
        const payload = hit.payload || {};
        return payload.kind !== "playlist" && payloadMatchesMusicFilters(payload, filters);
      })
      .slice(0, normalizedLimit);
    const seenPointIds = new Set(trackHits.map((hit) => hit.id || hit.payload?.music_track_id).filter(Boolean));
    trackHits = [
      ...trackHits,
      ...localFilterHits.filter((hit) => {
        const hitId = hit.id || hit.payload?.music_track_id;

        if (!hitId) {
          return true;
        }

        if (seenPointIds.has(hitId)) {
          return false;
        }

        seenPointIds.add(hitId);
        return true;
      }),
    ].slice(0, normalizedLimit);
    filterFallbackUsed = true;

    if (!trackHits.length) {
      trackHits = fallbackHits
        .filter((hit) => (hit.payload || {}).kind !== "playlist")
        .slice(0, normalizedLimit);
      metadataFilterRelaxed = true;
      warnings.push("No tracks matched the saved genre/tag metadata filters, so the search returned semantic matches without those filters.");
    }
  }

  return {
    query: normalizedQuery,
    limit: normalizedLimit,
    filters,
    filterFallbackUsed,
    metadataFilterRelaxed,
    warnings,
    tracks: trackHits.map((hit) => {
      const payload = hit.payload || {};
      return {
        musicTrackId: payload.music_track_id,
        spotifyTrackId: payload.spotify_track_id,
        spotifyUri: payload.spotify_uri,
        spotifyUrl: payload.spotify_url,
        title: payload.title,
        artists: Array.isArray(payload.artists) ? payload.artists : [],
        albumName: payload.album_name,
        albumReleaseDate: payload.album_release_date,
        releaseYear: payload.release_year,
        artistGenres: Array.isArray(payload.artist_genres) ? payload.artist_genres : [],
        genreFamilies: Array.isArray(payload.genre_families) ? payload.genre_families : [],
        userGenres: Array.isArray(payload.user_genres) ? payload.user_genres : [],
        musicBrainzTags: Array.isArray(payload.musicbrainz_tags) ? payload.musicbrainz_tags : [],
        effectiveGenres: Array.isArray(payload.effective_genres) ? payload.effective_genres : [],
        effectiveGenreFamilies: Array.isArray(payload.effective_genre_families) ? payload.effective_genre_families : [],
        likedAt: payload.liked_at,
        affinities: Array.isArray(payload.affinities) ? payload.affinities : [],
        score: Number(hit.score || 0),
      };
    }),
  };
}

async function searchMusicPlaylistsSemantic({ config, query, userScope, source = "", limit = 5, deps = {} } = {}) {
  const normalizedQuery = String(query || "").trim().replace(/\s+/g, " ").slice(0, 240);
  const normalizedLimit = normalizeSearchLimit(limit);
  const normalizedSource = String(source || "").trim().slice(0, 80);
  const embedTextsFn = deps.embedTexts || embedTexts;
  const searchPointsFn = deps.searchPoints || searchPoints;

  if (!normalizedQuery) {
    return {
      query: normalizedQuery,
      source: normalizedSource,
      limit: normalizedLimit,
      playlists: [],
    };
  }

  if (!canSyncMusic(config)) {
    throw new Error("Music playlist search requires Qdrant and an embedding-capable LLM API key.");
  }

  const [vector] = await embedTextsFn({
    config,
    inputs: [normalizedQuery],
  });
  const hits = await searchPointsFn({
    config,
    vector,
    limit: normalizedLimit,
    collectionName: config.qdrant?.musicCollection,
    filter: buildMusicPlaylistSearchFilter({ userScope, source: normalizedSource }),
  });

  return {
    query: normalizedQuery,
    source: normalizedSource,
    limit: normalizedLimit,
    playlists: hits.map((hit) => {
      const payload = hit.payload || {};
      return {
        musicPlaylistId: payload.music_playlist_id,
        spotifyPlaylistId: payload.spotify_playlist_id,
        spotifyUri: payload.spotify_uri,
        spotifyUrl: payload.spotify_url,
        name: payload.name,
        description: payload.description,
        source: payload.source,
        prompt: payload.prompt,
        createdByActorKey: payload.created_by_actor_key,
        createdByDisplayName: payload.created_by_display_name,
        trackCount: payload.track_count,
        discoveryTrackCount: payload.discovery_track_count,
        coverImageId: payload.cover_image_id,
        isFavorite: Boolean(payload.is_favorite),
        userNote: payload.user_note || "",
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        createdAt: payload.created_at,
        updatedAt: payload.updated_at,
        score: Number(hit.score || 0),
      };
    }),
  };
}

function createMusicLibraryService({
  config,
  store,
  spotify,
  musicBrainz,
  logger,
  deps = {},
} = {}) {
  const setTimeoutFn = deps.setTimeout || setTimeout;
  const clearTimeoutFn = deps.clearTimeout || clearTimeout;
  let musicEnrichmentTimer = null;
  let musicEnrichmentRunning = false;
  let musicEnrichmentUserScope = String(config?.memory?.userScope || "user").trim() || "user";

  async function listAllTracksForMusicSearch({ userScope } = {}) {
    if (!store?.listTracks) {
      return [];
    }

    const tracks = [];
    const limit = 5000;
    let offset = 0;

    while (true) {
      const batch = await store.listTracks({
        userScope,
        limit,
        offset,
        activeOnly: true,
      });
      tracks.push(...batch);

      if (batch.length < limit) {
        break;
      }

      offset += limit;
    }

    return tracks;
  }

  async function listAllPlaylistsForMusicSearch({ userScope } = {}) {
    if (!store?.listPlaylists) {
      return [];
    }

    const playlists = [];
    const limit = 25;
    let offset = 0;

    while (true) {
      const batch = await store.listPlaylists({
        userScope,
        limit,
        offset,
      });
      playlists.push(...batch);

      if (batch.length < limit) {
        break;
      }

      offset += limit;
    }

    return playlists;
  }

  function scheduleMusicEnrichment(delayMs = MUSICBRAINZ_ENRICHMENT_DELAY_MS, { replace = false } = {}) {
    if (musicEnrichmentTimer) {
      if (!replace) {
        return;
      }
      clearTimeoutFn(musicEnrichmentTimer);
      musicEnrichmentTimer = null;
    }

    musicEnrichmentTimer = setTimeoutFn(async () => {
      musicEnrichmentTimer = null;
      await runMusicEnrichmentLoop();
    }, Math.max(0, Number(delayMs || 0)));
    musicEnrichmentTimer?.unref?.();
  }

  async function processNextMusicBrainzTrack({ userScope } = {}) {
    if (!store?.getNextMusicBrainzTrackToEnrich || !store?.saveMusicBrainzEnrichment || !musicBrainz?.findBestRecording || config?.musicBrainz?.enabled === false) {
      return {
        processedCount: 0,
        skipped: true,
      };
    }

    const track = await store.getNextMusicBrainzTrackToEnrich({ userScope });
    if (!track) {
      return {
        processedCount: 0,
      };
    }

    try {
      const lookup = await musicBrainz.findBestRecording({ track });
      const best = lookup.best || null;

      if (!lookup.matched || !best) {
        await store.saveMusicBrainzEnrichment(track.musicTrackId, {
          userScope,
          status: "no_match",
          confidence: best?.confidence ?? null,
          lastError: "",
        });

        logger?.debug?.("[music] MusicBrainz enrichment found no confident match", {
          userScope,
          musicTrackId: track.musicTrackId,
          spotifyTrackId: track.spotifyTrackId,
          confidence: best?.confidence || 0,
          candidateCount: lookup.candidates?.length || 0,
        });

        return {
          processedCount: 1,
          matched: false,
        };
      }

      await store.saveMusicBrainzEnrichment(track.musicTrackId, {
        userScope,
        status: "matched",
        recordingId: best.recordingId,
        releaseId: best.releaseId,
        releaseGroupId: best.releaseGroupId,
        confidence: best.confidence,
        genres: best.importedGenres || best.genres || [],
        genreFamilies: best.genreFamilies || [],
        tags: best.tags || [],
        lastError: "",
      });

      logger?.debug?.("[music] MusicBrainz enrichment matched track", {
        userScope,
        musicTrackId: track.musicTrackId,
        spotifyTrackId: track.spotifyTrackId,
        confidence: best.confidence,
        genreCount: best.importedGenres?.length || best.genres?.length || 0,
        tagCount: best.tags?.length || 0,
      });

      return {
        processedCount: 1,
        matched: true,
      };
    } catch (error) {
      const rateLimited = error?.status === 429;
      const retryAfterSeconds = rateLimited
        ? Math.max(60, Number(error.retryAfterSeconds || 0) || 300)
        : 86400;

      await store.saveMusicBrainzEnrichment(track.musicTrackId, {
        userScope,
        status: rateLimited ? "rate_limited" : "failed",
        lastError: error?.message || String(error),
        retryAfterSeconds,
      });

      logger?.warn?.("[music] MusicBrainz enrichment failed", {
        userScope,
        musicTrackId: track.musicTrackId,
        spotifyTrackId: track.spotifyTrackId,
        status: rateLimited ? "rate_limited" : "failed",
        retryAfterSeconds,
        error: error?.message || String(error),
      });

      return {
        processedCount: rateLimited ? 0 : 1,
        failed: true,
        rateLimited,
        retryAfterSeconds,
      };
    }
  }

  async function syncDirtyMusicEmbeddings({ userScope, limit = MUSIC_DIRTY_EMBEDDING_BATCH_SIZE } = {}) {
    if (!store?.listDirtyMusicTracks || !canSyncMusic(config)) {
      return {
        syncedCount: 0,
        skipped: true,
      };
    }

    const tracks = await store.listDirtyMusicTracks({ userScope, limit });
    if (!tracks.length) {
      return {
        syncedCount: 0,
        skipped: false,
      };
    }

    const result = await syncMusicTracksToQdrant({
      config,
      musicStore: store,
      tracks,
      deps,
    });

    logger?.debug?.("[music] Synced dirty music embeddings", {
      userScope,
      requestedCount: tracks.length,
      syncedCount: result.syncedCount,
      syncSkipped: result.skipped,
    });

    return result;
  }

  async function getMusicEnrichmentWorkStatus({ userScope = musicEnrichmentUserScope } = {}) {
    if (!store?.getMusicBrainzWorkStatus) {
      return {
        pendingTrackCount: 0,
        dirtyTrackCount: 0,
      };
    }

    return store.getMusicBrainzWorkStatus({ userScope });
  }

  async function runMusicEnrichmentTick({ userScope = musicEnrichmentUserScope } = {}) {
    if (!store?.persistenceEnabled) {
      return {
        hasMoreWork: false,
        status: { pendingTrackCount: 0, dirtyTrackCount: 0 },
      };
    }

    const beforeStatus = await getMusicEnrichmentWorkStatus({ userScope });
    const canUseMusicBrainz = Boolean(musicBrainz?.findBestRecording && config?.musicBrainz?.enabled !== false);
    const musicBrainzResult = beforeStatus.pendingTrackCount > 0 && canUseMusicBrainz
      ? await processNextMusicBrainzTrack({ userScope })
      : { processedCount: 0, skipped: !canUseMusicBrainz };
    let afterMusicBrainzStatus = await getMusicEnrichmentWorkStatus({ userScope });
    const shouldSyncDirty = canSyncMusic(config)
      && afterMusicBrainzStatus.dirtyTrackCount > 0
      && (
        afterMusicBrainzStatus.dirtyTrackCount >= MUSIC_DIRTY_EMBEDDING_BATCH_SIZE
        || afterMusicBrainzStatus.pendingTrackCount === 0
        || !canUseMusicBrainz
      );
    const syncResult = shouldSyncDirty
      ? await syncDirtyMusicEmbeddings({ userScope, limit: MUSIC_DIRTY_EMBEDDING_BATCH_SIZE })
      : { syncedCount: 0, skipped: !canSyncMusic(config) };

    if (syncResult.syncedCount) {
      afterMusicBrainzStatus = await getMusicEnrichmentWorkStatus({ userScope });
    }

    const hasMusicBrainzWork = canUseMusicBrainz && afterMusicBrainzStatus.pendingTrackCount > 0;
    const hasDirtySyncWork = canSyncMusic(config) && afterMusicBrainzStatus.dirtyTrackCount > 0;
    const retryDelay = musicBrainzResult.rateLimited
      ? Math.max(MUSICBRAINZ_ENRICHMENT_DELAY_MS, Number(musicBrainzResult.retryAfterSeconds || 0) * 1000)
      : null;

    return {
      hasMoreWork: hasMusicBrainzWork || hasDirtySyncWork || Boolean(musicBrainzResult.rateLimited),
      delayMs: retryDelay || (musicBrainzResult.processedCount > 0 ? MUSICBRAINZ_ENRICHMENT_DELAY_MS : 1000),
      musicBrainz: musicBrainzResult,
      sync: syncResult,
      status: afterMusicBrainzStatus,
    };
  }

  async function runMusicEnrichmentLoop() {
    if (musicEnrichmentRunning) {
      return;
    }

    musicEnrichmentRunning = true;
    try {
      const result = await runMusicEnrichmentTick({ userScope: musicEnrichmentUserScope });

      if (result.hasMoreWork) {
        scheduleMusicEnrichment(result.delayMs);
      } else {
        logger?.debug?.("[music] Music enrichment worker is idle", {
          userScope: musicEnrichmentUserScope,
          pendingTrackCount: result.status?.pendingTrackCount || 0,
          dirtyTrackCount: result.status?.dirtyTrackCount || 0,
        });
      }
    } catch (error) {
      logger?.warn?.("[music] Music enrichment worker tick failed", {
        userScope: musicEnrichmentUserScope,
        error: error?.message || String(error),
      });
      scheduleMusicEnrichment(MUSICBRAINZ_ENRICHMENT_ERROR_DELAY_MS);
    } finally {
      musicEnrichmentRunning = false;
    }
  }

  function wakeMusicEnrichment({ userScope = musicEnrichmentUserScope, delayMs = 1000 } = {}) {
    musicEnrichmentUserScope = String(userScope || musicEnrichmentUserScope || config?.memory?.userScope || "user").trim() || "user";
    scheduleMusicEnrichment(delayMs, { replace: true });
  }

  return {
    canSearch() {
      return Boolean(store?.persistenceEnabled && canSyncMusic(config));
    },

    async startBackgroundProcessing({ userScope = config.memory?.userScope || "user" } = {}) {
      musicEnrichmentUserScope = String(userScope || "user").trim() || "user";
      const status = await getMusicEnrichmentWorkStatus({ userScope: musicEnrichmentUserScope });
      const shouldWake = Boolean(
        status.pendingTrackCount > 0 && musicBrainz?.findBestRecording && config?.musicBrainz?.enabled !== false
        || status.dirtyTrackCount > 0 && canSyncMusic(config)
      );

      if (shouldWake) {
        wakeMusicEnrichment({ userScope: musicEnrichmentUserScope, delayMs: 1000 });
      }

      return {
        started: shouldWake,
        status,
      };
    },

    stopBackgroundProcessing() {
      if (musicEnrichmentTimer) {
        clearTimeoutFn(musicEnrichmentTimer);
        musicEnrichmentTimer = null;
      }
    },

    wakeMusicEnrichment,

    runMusicEnrichmentTick,

    syncDirtyMusicEmbeddings,

    async importLikedSongs({ userScope, limit = 500 } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      const spotifyTracks = await spotify.fetchLikedTracks({ userScope, limit });
      const existingIds = new Set(await store.listExistingSpotifyTrackIds?.(
        spotifyTracks.map((track) => track.spotifyTrackId),
        { userScope },
      ) || []);
      const importedTracks = [];

      for (const spotifyTrack of spotifyTracks) {
        importedTracks.push(await store.upsertTrack(spotifyTrack, { userScope, source: "spotify_liked" }));
      }
      const newTrackCount = importedTracks.filter((track) => !existingIds.has(track.spotifyTrackId)).length;
      const updatedTrackCount = importedTracks.length - newTrackCount;

      const syncResult = await syncMusicTracksToQdrant({
        config,
        musicStore: store,
        tracks: importedTracks,
        deps,
      });

      await store.markSpotifyImportComplete({ userScope });
      wakeMusicEnrichment({ userScope });

      logger?.info?.("[music] Imported Spotify liked songs", {
        userScope,
        importedCount: importedTracks.length,
        newTrackCount,
        updatedTrackCount,
        syncedCount: syncResult.syncedCount,
        syncSkipped: syncResult.skipped,
      });

      return {
        importedCount: importedTracks.length,
        processedCount: spotifyTracks.length,
        newTrackCount,
        updatedTrackCount,
        syncedCount: syncResult.syncedCount,
        syncSkipped: syncResult.skipped,
      };
    },

    async importPlaylist({ userScope, playlistId, limit = 500 } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      const normalizedPlaylistId = String(playlistId || "").trim();

      if (!normalizedPlaylistId) {
        throw new Error("Spotify playlist ID is required.");
      }

      const spotifyTracks = await spotify.fetchPlaylistTracks({ userScope, playlistId: normalizedPlaylistId, limit });
      const existingIds = new Set(await store.listExistingSpotifyTrackIds?.(
        spotifyTracks.map((track) => track.spotifyTrackId),
        { userScope },
      ) || []);
      const importedTracks = [];

      for (const spotifyTrack of spotifyTracks) {
        importedTracks.push(await store.upsertTrack(spotifyTrack, { userScope, source: "spotify_playlist" }));
      }
      const newTrackCount = importedTracks.filter((track) => !existingIds.has(track.spotifyTrackId)).length;
      const updatedTrackCount = importedTracks.length - newTrackCount;

      const syncResult = await syncMusicTracksToQdrant({
        config,
        musicStore: store,
        tracks: importedTracks,
        deps,
      });
      wakeMusicEnrichment({ userScope });

      logger?.info?.("[music] Imported Spotify playlist tracks", {
        userScope,
        playlistId: normalizedPlaylistId,
        importedCount: importedTracks.length,
        newTrackCount,
        updatedTrackCount,
        syncedCount: syncResult.syncedCount,
        syncSkipped: syncResult.skipped,
      });

      return {
        playlistId: normalizedPlaylistId,
        importedCount: importedTracks.length,
        processedCount: spotifyTracks.length,
        newTrackCount,
        updatedTrackCount,
        syncedCount: syncResult.syncedCount,
        syncSkipped: syncResult.skipped,
      };
    },

    async syncTrackedPlaylist({ userScope, spotifyPlaylistId, limit = 5000 } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      if (!store.getPlaylistBySpotifyId || !store.replacePlaylistTracks) {
        throw new Error("Music playlist storage is not available.");
      }

      const normalizedPlaylistId = String(spotifyPlaylistId || "").trim();

      if (!normalizedPlaylistId) {
        throw new Error("Spotify playlist ID is required.");
      }

      const storedPlaylist = await store.getPlaylistBySpotifyId({ userScope, spotifyPlaylistId: normalizedPlaylistId });

      if (!storedPlaylist) {
        throw new Error("Playlist is not tracked locally yet.");
      }

      const previousTracks = store.listPlaylistTracks
        ? await store.listPlaylistTracks(storedPlaylist.musicPlaylistId)
        : [];
      const previousSourceBySpotifyTrackId = new Map(previousTracks
        .map((track) => [String(track.spotifyTrackId || "").trim(), String(track.source || "").trim()])
        .filter(([trackId]) => Boolean(trackId)));
      const spotifyTracks = await spotify.fetchPlaylistTracks({ userScope, playlistId: normalizedPlaylistId, limit });
      const spotifyPlaylist = spotify.fetchPlaylist
        ? await spotify.fetchPlaylist({ userScope, playlistId: normalizedPlaylistId })
        : null;
      const existingIds = new Set(await store.listExistingSpotifyTrackIds?.(
        spotifyTracks.map((track) => track.spotifyTrackId),
        { userScope },
      ) || []);
      const importedTracks = [];

      for (const spotifyTrack of spotifyTracks) {
        importedTracks.push(await store.upsertTrack(spotifyTrack, { userScope, source: "spotify_playlist" }));
      }

      const importedBySpotifyTrackId = new Map(importedTracks
        .map((track) => [String(track.spotifyTrackId || "").trim(), track])
        .filter(([trackId]) => Boolean(trackId)));
      const playlistTracks = spotifyTracks
        .map((track, index) => {
          const spotifyTrackId = String(track.spotifyTrackId || "").trim();
          const imported = importedBySpotifyTrackId.get(spotifyTrackId);
          return {
            musicTrackId: imported?.musicTrackId || track.musicTrackId,
            spotifyTrackId,
            position: index,
            source: previousSourceBySpotifyTrackId.get(spotifyTrackId) || imported?.source || "spotify_playlist",
          };
        })
        .filter((track) => track.musicTrackId && track.spotifyTrackId);
      const storedTracks = await store.replacePlaylistTracks(storedPlaylist.musicPlaylistId, playlistTracks);
      const newTrackCount = importedTracks.filter((track) => !existingIds.has(track.spotifyTrackId)).length;
      const updatedTrackCount = importedTracks.length - newTrackCount;
      const updatedPlaylistRecord = {
        ...storedPlaylist,
        ...(spotifyPlaylist || {}),
        musicPlaylistId: storedPlaylist.musicPlaylistId,
        userScope,
        source: storedPlaylist.source,
        prompt: storedPlaylist.prompt,
        createdByActorKey: storedPlaylist.createdByActorKey,
        createdByActorType: storedPlaylist.createdByActorType,
        createdByDisplayName: storedPlaylist.createdByDisplayName,
        discoveryTrackCount: storedPlaylist.discoveryTrackCount,
        coverImageId: storedPlaylist.coverImageId,
        isFavorite: storedPlaylist.isFavorite,
        userNote: storedPlaylist.userNote,
        tags: storedPlaylist.tags,
        trackCount: storedTracks.length,
      };
      const updatedPlaylist = store.upsertPlaylist
        ? await store.upsertPlaylist(updatedPlaylistRecord, { userScope })
        : updatedPlaylistRecord;

      const syncResult = await syncMusicTracksToQdrant({
        config,
        musicStore: store,
        tracks: importedTracks,
        deps,
      });
      await syncMusicPlaylistsToQdrant({
        config,
        playlists: [updatedPlaylist],
        deps,
      });
      wakeMusicEnrichment({ userScope });

      logger?.info?.("[music] Synced tracked Spotify playlist", {
        userScope,
        playlistId: normalizedPlaylistId,
        musicPlaylistId: storedPlaylist.musicPlaylistId,
        processedCount: spotifyTracks.length,
        storedTrackCount: storedTracks.length,
        newTrackCount,
        updatedTrackCount,
        syncedCount: syncResult.syncedCount,
        syncSkipped: syncResult.skipped,
      });

      return {
        playlistId: normalizedPlaylistId,
        musicPlaylistId: storedPlaylist.musicPlaylistId,
        importedCount: importedTracks.length,
        processedCount: spotifyTracks.length,
        storedTrackCount: storedTracks.length,
        previousStoredTrackCount: previousTracks.length,
        newTrackCount,
        updatedTrackCount,
        syncedCount: syncResult.syncedCount,
        syncSkipped: syncResult.skipped,
      };
    },

    async importAiPlaylistTracks({ userScope, tracks = [] } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      const spotifyTracks = (Array.isArray(tracks) ? tracks : [])
        .map((track) => ({
          ...track,
          source: "spotify_ai_playlist",
        }))
        .filter((track) => track.spotifyTrackId || track.spotifyUri);

      if (!spotifyTracks.length) {
        return {
          importedCount: 0,
          processedCount: 0,
          newTrackCount: 0,
          updatedTrackCount: 0,
          syncedCount: 0,
          syncSkipped: false,
          tracks: [],
        };
      }
      const existingIds = new Set(await store.listExistingSpotifyTrackIds?.(
        spotifyTracks.map((track) => track.spotifyTrackId),
        { userScope },
      ) || []);
      const importedTracks = [];

      for (const spotifyTrack of spotifyTracks) {
        importedTracks.push(await store.upsertTrack(spotifyTrack, { userScope, source: "spotify_ai_playlist" }));
      }
      const newTrackCount = importedTracks.filter((track) => !existingIds.has(track.spotifyTrackId)).length;
      const updatedTrackCount = importedTracks.length - newTrackCount;

      const syncResult = await syncMusicTracksToQdrant({
        config,
        musicStore: store,
        tracks: importedTracks,
        deps,
      });
      wakeMusicEnrichment({ userScope });

      logger?.info?.("[music] Imported AI playlist tracks", {
        userScope,
        importedCount: importedTracks.length,
        newTrackCount,
        updatedTrackCount,
        syncedCount: syncResult.syncedCount,
        syncSkipped: syncResult.skipped,
      });

      return {
        importedCount: importedTracks.length,
        processedCount: spotifyTracks.length,
        newTrackCount,
        updatedTrackCount,
        syncedCount: syncResult.syncedCount,
        syncSkipped: syncResult.skipped,
        tracks: importedTracks,
      };
    },

    async exportLibraryData({ userScope } = {}) {
      if (!store?.persistenceEnabled || !store.exportLibrary) {
        throw new Error("Music store is not configured.");
      }

      const exported = await store.exportLibrary({ userScope });

      return {
        exportedAt: new Date().toISOString(),
        product: "ghostlight",
        exportType: "music_library",
        userScope,
        trackCount: exported.tracks.length,
        affinityCount: exported.affinities.length,
        playlistCount: exported.playlists.length,
        playlistTrackCount: exported.playlistTracks.length,
        music: exported,
      };
    },

    async importLibraryData({ userScope, payload = {} } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      const music = payload.music && typeof payload.music === "object" ? payload.music : payload;
      const tracks = Array.isArray(music.tracks) ? music.tracks : [];
      const affinities = Array.isArray(music.affinities) ? music.affinities : [];
      const playlists = Array.isArray(music.playlists) ? music.playlists : [];
      const playlistTracks = Array.isArray(music.playlistTracks || music.playlist_tracks)
        ? (music.playlistTracks || music.playlist_tracks)
        : [];

      if (!tracks.length && !affinities.length && !playlists.length) {
        throw new Error("No music library data was found in that import file.");
      }

      const importedTracks = [];
      const trackIds = new Set();

      for (const track of tracks) {
        const imported = await store.upsertTrack({ ...track, userScope }, { userScope });
        importedTracks.push(imported);
        trackIds.add(imported.musicTrackId);
      }

      let importedAffinityCount = 0;
      for (const affinity of affinities) {
        const musicTrackId = String(affinity.musicTrackId || affinity.music_track_id || "").trim();
        if (!trackIds.has(musicTrackId)) {
          const existingTrack = musicTrackId ? await store.getTrackById(musicTrackId, { userScope }) : null;
          if (!existingTrack) {
            continue;
          }
          trackIds.add(existingTrack.musicTrackId);
        }
        await store.upsertAffinity({ ...affinity, userScope }, { userScope });
        importedAffinityCount += 1;
      }

      const playlistTracksByPlaylistId = new Map();
      for (const playlistTrack of playlistTracks) {
        const playlistId = String(playlistTrack.musicPlaylistId || playlistTrack.music_playlist_id || "").trim();
        if (!playlistId) {
          continue;
        }
        const rows = playlistTracksByPlaylistId.get(playlistId) || [];
        rows.push(playlistTrack);
        playlistTracksByPlaylistId.set(playlistId, rows);
      }

      let importedPlaylistCount = 0;
      let importedPlaylistTrackCount = 0;
      const importedPlaylists = [];
      for (const playlist of playlists) {
        const importedPlaylist = await store.upsertPlaylist({ ...playlist, userScope }, { userScope });
        importedPlaylists.push(importedPlaylist);
        importedPlaylistCount += 1;
        const tracksForPlaylist = (playlistTracksByPlaylistId.get(importedPlaylist.musicPlaylistId) || [])
          .filter((track) => trackIds.has(String(track.musicTrackId || track.music_track_id || "").trim()));
        if (tracksForPlaylist.length) {
          const storedPlaylistTracks = await store.replacePlaylistTracks(importedPlaylist.musicPlaylistId, tracksForPlaylist);
          importedPlaylistTrackCount += storedPlaylistTracks.length;
        }
      }

      const syncResult = await syncMusicTracksToQdrant({
        config,
        musicStore: store,
        tracks: importedTracks,
        deps,
      });
      await syncMusicPlaylistsToQdrant({
        config,
        playlists: importedPlaylists,
        deps,
      });
      wakeMusicEnrichment({ userScope });

      return {
        importedTrackCount: importedTracks.length,
        importedAffinityCount,
        importedPlaylistCount,
        importedPlaylistTrackCount,
        syncedCount: syncResult.syncedCount,
        syncSkipped: syncResult.skipped,
      };
    },

    async deleteUnprofiledTracks({ userScope } = {}) {
      if (!store?.persistenceEnabled || !store.deleteUnprofiledTracks) {
        throw new Error("Music store is not configured.");
      }

      const result = await store.deleteUnprofiledTracks({ userScope });
      const qdrantResult = await deleteMusicTrackPointsFromQdrant({
        config,
        trackIds: [
          ...(result.deletedTrackIds || []),
          ...(result.deletedPlaylistIds || []),
        ],
        deps,
        logger,
      });

      return {
        ...result,
        qdrantDeletedCount: qdrantResult.deletedCount,
        qdrantDeleteSkipped: qdrantResult.skipped,
        qdrantDeleteError: qdrantResult.error || "",
      };
    },

    async deleteTrack({ userScope, musicTrackId } = {}) {
      if (!store?.persistenceEnabled || !store.deleteTrack) {
        throw new Error("Music store is not configured.");
      }

      const result = await store.deleteTrack({ userScope, musicTrackId });
      const qdrantResult = await deleteMusicTrackPointsFromQdrant({
        config,
        trackIds: result.deletedTrackIds || [],
        deps,
        logger,
      });

      return {
        ...result,
        qdrantDeletedCount: qdrantResult.deletedCount,
        qdrantDeleteSkipped: qdrantResult.skipped,
        qdrantDeleteError: qdrantResult.error || "",
      };
    },

    async resetLibrary({ userScope } = {}) {
      if (!store?.persistenceEnabled || !store.resetLibrary) {
        throw new Error("Music store is not configured.");
      }

      const result = await store.resetLibrary({ userScope });
      const qdrantResult = await deleteMusicTrackPointsFromQdrant({
        config,
        trackIds: result.deletedTrackIds,
        deps,
        logger,
      });

      return {
        ...result,
        qdrantDeletedCount: qdrantResult.deletedCount,
        qdrantDeleteSkipped: qdrantResult.skipped,
        qdrantDeleteError: qdrantResult.error || "",
      };
    },

    async rebuildMusicSearchIndex({ userScope } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      if (!canSyncMusic(config)) {
        return {
          rebuilt: false,
          skipped: true,
          reason: "Music search rebuild requires Qdrant and embeddings to be configured.",
          deletedSearchPoints: 0,
          trackCount: 0,
          playlistCount: 0,
          syncedTrackCount: 0,
          syncedPlaylistCount: 0,
        };
      }

      const tracks = await listAllTracksForMusicSearch({ userScope });
      const playlists = await listAllPlaylistsForMusicSearch({ userScope });
      const deleteResult = await deleteMusicUserScopePointsFromQdrant({
        config,
        userScope,
        deps,
        logger,
      });

      if (deleteResult.error) {
        return {
          rebuilt: false,
          skipped: true,
          reason: deleteResult.error,
          deletedSearchPoints: deleteResult.deletedCount || 0,
          trackCount: tracks.length,
          playlistCount: playlists.length,
          syncedTrackCount: 0,
          syncedPlaylistCount: 0,
        };
      }

      const trackSync = await syncMusicTracksToQdrant({
        config,
        musicStore: store,
        tracks,
        deps,
      });
      const playlistSync = await syncMusicPlaylistsToQdrant({
        config,
        playlists,
        deps,
      });

      logger?.info?.("[music] Rebuilt music search index", {
        userScope,
        trackCount: tracks.length,
        playlistCount: playlists.length,
        syncedTrackCount: trackSync.syncedCount,
        syncedPlaylistCount: playlistSync.syncedCount,
      });

      return {
        rebuilt: true,
        skipped: false,
        deletedSearchPoints: deleteResult.deletedCount,
        trackCount: tracks.length,
        playlistCount: playlists.length,
        syncedTrackCount: trackSync.syncedCount,
        syncedPlaylistCount: playlistSync.syncedCount,
      };
    },

    async recordAiPlaylist({
      userScope,
      playlist,
      prompt = "",
      description = "",
      tracks = [],
      importedTracks = [],
      discoveryTrackCount = 0,
      coverImageId = "",
    } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      if (!store.upsertPlaylist || !store.replacePlaylistTracks) {
        throw new Error("Music playlist storage is not available.");
      }

      const personaName = config.chat?.promptBlocks?.personaName || "Ghostlight";
      const spotifyPlaylistId = String(playlist?.spotifyPlaylistId || "").trim();

      if (!spotifyPlaylistId) {
        throw new Error("Spotify playlist ID is required.");
      }

      const storedPlaylist = await store.upsertPlaylist({
        userScope,
        spotifyPlaylistId,
        spotifyUri: playlist.spotifyUri || "",
        spotifyUrl: playlist.spotifyUrl || "",
        spotifyCoverUrl: playlist.spotifyCoverUrl || "",
        name: playlist.name || "",
        description,
        source: "ai_curated",
        prompt,
        createdByActorKey: buildMusicActorKey({ actor: "ai", userScope, personaName }),
        createdByActorType: "ai",
        createdByDisplayName: personaName,
        trackCount: playlist.trackCount || tracks.length || importedTracks.length,
        discoveryTrackCount,
        coverImageId,
      });
      const sourceBySpotifyTrackId = new Map((Array.isArray(tracks) ? tracks : [])
        .map((track) => [String(track.spotifyTrackId || "").trim(), String(track.source || "").trim()])
        .filter(([spotifyTrackId]) => Boolean(spotifyTrackId)));
      const importedBySpotifyTrackId = new Map((Array.isArray(importedTracks) ? importedTracks : [])
        .map((track) => [String(track.spotifyTrackId || "").trim(), track])
        .filter(([spotifyTrackId]) => Boolean(spotifyTrackId)));
      const playlistTracks = (Array.isArray(tracks) ? tracks : [])
        .map((track, index) => {
          const spotifyTrackId = String(track.spotifyTrackId || "").trim();
          const imported = importedBySpotifyTrackId.get(spotifyTrackId) || track;
          return {
            musicTrackId: imported.musicTrackId || track.musicTrackId,
            spotifyTrackId,
            position: index,
            source: sourceBySpotifyTrackId.get(spotifyTrackId) || track.source || "",
          };
        })
        .filter((track) => track.musicTrackId && track.spotifyTrackId);
      const storedTracks = await store.replacePlaylistTracks(storedPlaylist.musicPlaylistId, playlistTracks);
      await syncMusicPlaylistsToQdrant({
        config,
        playlists: [storedPlaylist],
        deps,
      });

      logger?.info?.("[music] Recorded AI Spotify playlist", {
        userScope,
        playlistId: spotifyPlaylistId,
        musicPlaylistId: storedPlaylist.musicPlaylistId,
        trackCount: storedTracks.length,
      });

      return {
        playlist: storedPlaylist,
        tracks: storedTracks,
      };
    },

    async appendAiPlaylistTracks({
      userScope,
      playlist,
      tracks = [],
      importedTracks = [],
    } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      if (!store.getPlaylistBySpotifyId || !store.appendPlaylistTracks) {
        throw new Error("Music playlist storage is not available.");
      }

      const spotifyPlaylistId = String(playlist?.spotifyPlaylistId || playlist?.spotify_playlist_id || "").trim();

      if (!spotifyPlaylistId) {
        throw new Error("Spotify playlist ID is required.");
      }

      const storedPlaylist = await store.getPlaylistBySpotifyId({ userScope, spotifyPlaylistId });

      if (!storedPlaylist) {
        throw new Error("Playlist is not tracked locally yet. Search or create it before editing.");
      }

      const sourceBySpotifyTrackId = new Map((Array.isArray(tracks) ? tracks : [])
        .map((track) => [String(track.spotifyTrackId || "").trim(), String(track.source || "").trim()])
        .filter(([trackId]) => Boolean(trackId)));
      const importedBySpotifyTrackId = new Map((Array.isArray(importedTracks) ? importedTracks : [])
        .map((track) => [String(track.spotifyTrackId || "").trim(), track])
        .filter(([trackId]) => Boolean(trackId)));
      const playlistTracks = (Array.isArray(tracks) ? tracks : [])
        .map((track, index) => {
          const spotifyTrackId = String(track.spotifyTrackId || "").trim();
          const imported = importedBySpotifyTrackId.get(spotifyTrackId) || track;
          return {
            musicTrackId: imported.musicTrackId || track.musicTrackId,
            spotifyTrackId,
            position: index,
            source: sourceBySpotifyTrackId.get(spotifyTrackId) || track.source || "",
          };
        })
        .filter((track) => track.musicTrackId && track.spotifyTrackId);
      const storedTracks = await store.appendPlaylistTracks(storedPlaylist.musicPlaylistId, playlistTracks);
      const addedDiscoveryTrackCount = storedTracks
        .filter((track) => String(track.source || "").startsWith("spotify_catalog"))
        .length;
      const updatedPlaylist = {
        ...storedPlaylist,
        trackCount: Number(storedPlaylist.trackCount || 0) + storedTracks.length,
        discoveryTrackCount: Number(storedPlaylist.discoveryTrackCount || 0) + addedDiscoveryTrackCount,
      };
      await syncMusicPlaylistsToQdrant({
        config,
        playlists: [updatedPlaylist],
        deps,
      });

      logger?.info?.("[music] Appended AI Spotify playlist tracks", {
        userScope,
        playlistId: spotifyPlaylistId,
        musicPlaylistId: storedPlaylist.musicPlaylistId,
        addedTrackCount: storedTracks.length,
        addedDiscoveryTrackCount,
      });

      return {
        playlist: updatedPlaylist,
        tracks: storedTracks,
      };
    },

    async getTrackedPlaylist({ userScope, spotifyPlaylistId } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      if (!store.getPlaylistBySpotifyId) {
        return null;
      }

      const playlist = await store.getPlaylistBySpotifyId({ userScope, spotifyPlaylistId });
      if (!playlist) {
        return null;
      }

      const tracks = store.listPlaylistTracks
        ? await store.listPlaylistTracks(playlist.musicPlaylistId)
        : [];

      return {
        playlist,
        tracks,
      };
    },

    async listPlaylists({ userScope, query = "", source = "", limit = 10, offset = 0 } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      if (!store.listPlaylists) {
        return [];
      }

      return store.listPlaylists({ userScope, query, source, limit, offset });
    },

    async searchPlaylists({ userScope, query = "", source = "", limit = 5 } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      const normalizedQuery = String(query || "").trim();
      if (!normalizedQuery) {
        const playlists = store.listPlaylists
          ? await store.listPlaylists({ userScope, query: "", source, limit })
          : [];
        return {
          query: "",
          source,
          limit: normalizeSearchLimit(limit),
          playlists,
        };
      }

      try {
        return await searchMusicPlaylistsSemantic({
          config,
          query: normalizedQuery,
          userScope,
          source,
          limit,
          deps,
        });
      } catch (error) {
        logger?.warn?.("[music] Semantic playlist search failed; falling back to database search", {
          userScope,
          query: normalizedQuery,
          error: error?.message || String(error),
        });
        const playlists = store.listPlaylists
          ? await store.listPlaylists({ userScope, query: normalizedQuery, source, limit })
          : [];
        return {
          query: normalizedQuery,
          source,
          limit: normalizeSearchLimit(limit),
          playlists,
          semanticSkipped: true,
        };
      }
    },

    async search({
      query,
      userScope,
      limit = 5,
      genres = [],
      genreFamilies = [],
      tags = [],
      reactions = [],
      minReleaseYear = null,
      maxReleaseYear = null,
    } = {}) {
      return searchMusicLibrary({
        config,
        query,
        userScope,
        limit,
        genres,
        genreFamilies,
        tags,
        reactions,
        minReleaseYear,
        maxReleaseYear,
        deps,
      });
    },

    async getTrackBySpotifyId({ userScope, spotifyTrackId, includeAffinities = true } = {}) {
      if (!store?.persistenceEnabled || !store.getTrackBySpotifyId) {
        return null;
      }

      const track = await store.getTrackBySpotifyId(spotifyTrackId, { userScope });

      if (!track) {
        return null;
      }

      const affinities = includeAffinities && store.listAffinitiesForTrackIds
        ? await store.listAffinitiesForTrackIds([track.musicTrackId], { userScope })
        : [];
      const userGenres = Array.isArray(track.userGenres) ? track.userGenres : [];

      return {
        track: {
          ...track,
          effectiveGenres: userGenres.length
            ? userGenres
            : (Array.isArray(track.artistGenres) ? track.artistGenres : []),
          effectiveGenreFamilies: userGenres.length
            ? mergeGenreFamilies(userGenres)
            : (Array.isArray(track.genreFamilies) ? track.genreFamilies : []),
          affinities,
        },
      };
    },

    async recordPreference({
      userScope,
      musicTrackId,
      spotifyTrackId,
      actor,
      reaction,
      note,
      tags,
    } = {}) {
      if (!store?.persistenceEnabled) {
        throw new Error("Music store is not configured.");
      }

      let track = spotifyTrackId
        ? await store.getTrackBySpotifyId(spotifyTrackId, { userScope })
        : null;

      if (track && musicTrackId && track.musicTrackId !== musicTrackId) {
        logger?.warn?.("[music] Preference track id mismatch; using exact Spotify track id", {
          userScope,
          suppliedMusicTrackId: musicTrackId,
          spotifyTrackId,
          resolvedMusicTrackId: track.musicTrackId,
        });
      }

      if (!track && spotifyTrackId && spotify?.fetchTrackById && store?.upsertTrack) {
        const spotifyTrack = await spotify.fetchTrackById({
          userScope,
          spotifyTrackId,
        });

        if (spotifyTrack) {
          track = await store.upsertTrack(spotifyTrack, {
            userScope,
            source: "spotify_preference",
          });
          wakeMusicEnrichment({ userScope });

          logger?.info?.("[music] Imported Spotify track for preference note", {
            userScope,
            spotifyTrackId: track.spotifyTrackId,
            musicTrackId: track.musicTrackId,
          });
        }
      }

      if (!track && !spotifyTrackId && musicTrackId) {
        track = await store.getTrackById(musicTrackId, { userScope });
      }

      if (!track) {
        logger?.warn?.("[music] Preference track was not found", {
          userScope,
          musicTrackId: musicTrackId || "",
          spotifyTrackId: spotifyTrackId || "",
        });
        throw new Error("Music track was not found in the library.");
      }

      const affinity = await store.upsertAffinity({
        musicTrackId: track.musicTrackId,
        userScope,
        actor,
        reaction,
        note,
        tags,
        personaName: config.chat?.promptBlocks?.personaName || "Ghostlight",
        actorDisplayName: actor === "ai"
          ? config.chat?.promptBlocks?.personaName || "Ghostlight"
          : config.chat?.promptBlocks?.userName || userScope,
      });

      await syncMusicTracksToQdrant({
        config,
        musicStore: store,
        tracks: [track],
        deps,
      });

      return {
        track,
        affinity,
      };
    },

    async updateTrackUserGenres({ userScope, musicTrackId, userGenres = [] } = {}) {
      if (!store?.persistenceEnabled || !store.updateTrackUserGenres) {
        throw new Error("Music store is not configured.");
      }

      const track = await store.updateTrackUserGenres(musicTrackId, {
        userScope,
        userGenres,
      });

      if (!track) {
        throw new Error("Music track was not found in the library.");
      }

      await syncMusicTracksToQdrant({
        config,
        musicStore: store,
        tracks: [track],
        deps,
      });

      return {
        track,
      };
    },

    async updatePlaylistProfile({ userScope, musicPlaylistId, userNote = "", tags = [] } = {}) {
      if (!store?.persistenceEnabled || !store.updatePlaylistProfile) {
        throw new Error("Music store is not configured.");
      }

      const playlist = await store.updatePlaylistProfile(musicPlaylistId, {
        userScope,
        userNote,
        tags,
      });

      if (!playlist) {
        throw new Error("Music playlist was not found in the library.");
      }

      await syncMusicPlaylistsToQdrant({
        config,
        playlists: [playlist],
        deps,
      });

      return {
        playlist,
      };
    },

    async updatePlaylistFavorite({ userScope, musicPlaylistId, isFavorite = false } = {}) {
      if (!store?.persistenceEnabled || !store.updatePlaylistFavorite) {
        throw new Error("Music store is not configured.");
      }

      const playlist = await store.updatePlaylistFavorite(musicPlaylistId, {
        userScope,
        isFavorite,
      });

      if (!playlist) {
        throw new Error("Music playlist was not found in the library.");
      }

      await syncMusicPlaylistsToQdrant({
        config,
        playlists: [playlist],
        deps,
      });

      return {
        playlist,
      };
    },

    async deletePlaylist({ userScope, musicPlaylistId } = {}) {
      if (!store?.persistenceEnabled || !store.deletePlaylist) {
        throw new Error("Music store is not configured.");
      }

      const result = await store.deletePlaylist({ userScope, musicPlaylistId });
      const qdrantResult = await deleteMusicTrackPointsFromQdrant({
        config,
        trackIds: result.deletedPlaylistIds || [],
        deps,
        logger,
      });

      return {
        ...result,
        qdrantDeletedCount: qdrantResult.deletedCount,
        qdrantDeleteSkipped: qdrantResult.skipped,
        qdrantDeleteError: qdrantResult.error || "",
      };
    },
  };
}

module.exports = {
  normalizeSearchLimit,
  normalizeMusicFilterTerms,
  buildMusicPayloadMatchCondition,
  payloadMatchesMusicFilters,
  buildMusicEmbeddingText,
  buildMusicQdrantPoint,
  buildMusicSearchFilter,
  buildMusicPlaylistEmbeddingText,
  buildMusicPlaylistQdrantPoint,
  buildMusicPlaylistSearchFilter,
  canSyncMusic,
  deleteMusicTrackPointsFromQdrant,
  deleteMusicUserScopePointsFromQdrant,
  syncMusicTracksToQdrant,
  syncMusicPlaylistsToQdrant,
  searchMusicLibrary,
  searchMusicPlaylistsSemantic,
  createMusicLibraryService,
};
