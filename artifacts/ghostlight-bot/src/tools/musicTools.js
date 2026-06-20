const { prepareSpotifyPlaylistCover } = require("../music/playlistCover");
const { safeJsonParse } = require("./toolUtils");

const MUSIC_LOOKUP_QUERY_LIMIT = 240;
const MUSIC_NOTE_LIMIT = 1200;
const PLAYLIST_BRIEF_LIMIT = 600;
const PLAYLIST_NAME_LIMIT = 100;
const PLAYLIST_DESCRIPTION_LIMIT = 300;
const SPOTIFY_PLAYLIST_VISIBILITY = "profile_hidden";
const SPOTIFY_PLAYLIST_VISIBILITY_NOTE = "Spotify was asked to create this with public=false, which keeps it off the user's public Spotify profile/search. Treat it as profile-hidden, not access-controlled private; someone with the link may still be able to open it.";
const DEFAULT_CURATED_PLAYLIST_TRACK_COUNT = 20;
const MAX_CURATED_PLAYLIST_TRACK_COUNT = 50;
const DEFAULT_CURATED_PLAYLIST_DISCOVERY_COUNT = 3;
const PLAYLIST_TRACK_PREVIEW_LIMIT = 50;

function normalizeMusicLookupQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MUSIC_LOOKUP_QUERY_LIMIT);
}

function normalizeMusicLookupLimit(value) {
  return Math.max(
    1,
    Math.min(
      Number.parseInt(String(value || 5), 10) || 5,
      10,
    ),
  );
}

function normalizeMusicLookupList(value = []) {
  const items = Array.isArray(value)
    ? value
    : String(value || "").split(",");

  return Array.from(new Set(items
    .map((item) => normalizeMusicLookupQuery(item).toLowerCase())
    .filter(Boolean)))
    .slice(0, 20);
}

function normalizeMusicReactionFilters(value = []) {
  const allowed = new Set(["likes", "dislikes", "neutral", "recommended", "curious"]);
  return normalizeMusicLookupList(value)
    .filter((reaction) => allowed.has(reaction));
}

function normalizeMusicReleaseYearFilter(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 9999 ? parsed : null;
}

function extractSpotifyTrackId(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const uriMatch = text.match(/spotify:track:([^?\s/#<>)"']+)/i);
  if (uriMatch?.[1]) {
    return uriMatch[1];
  }

  const urlMatch = text.match(/(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([^?\s/#<>)"']+)/i)
    || text.match(/api\.spotify\.com\/v1\/tracks\/([^?\s/#<>)"']+)/i)
    || text.match(/\/track\/([^?\s/#<>)"']+)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  return text;
}

function extractSpotifyPlaylistId(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const uriMatch = text.match(/spotify:playlist:([^?\s/#<>)"']+)/i);
  if (uriMatch?.[1]) {
    return uriMatch[1];
  }

  const urlMatch = text.match(/(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([^?\s/#<>)"']+)/i)
    || text.match(/api\.spotify\.com\/v1\/playlists\/([^?\s/#<>)"']+)/i)
    || text.match(/\/playlist\/([^?\s/#<>)"']+)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  return text;
}

function normalizeSpotifyPlaybackTarget(args = {}) {
  const spotifyUri = String(args.spotifyUri || args.spotify_url || args.spotifyUrl || "").trim();
  const spotifyUriLooksTrack = /spotify:track:/i.test(spotifyUri)
    || /(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?track\//i.test(spotifyUri)
    || /api\.spotify\.com\/v1\/tracks\//i.test(spotifyUri);
  const spotifyUriLooksPlaylist = /spotify:playlist:/i.test(spotifyUri)
    || /(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\//i.test(spotifyUri)
    || /api\.spotify\.com\/v1\/playlists\//i.test(spotifyUri);
  const spotifyPlaylistId = extractSpotifyPlaylistId(args.spotifyPlaylistId || args.playlistId || (spotifyUriLooksPlaylist ? spotifyUri : ""));
  const trackInputs = [
    args.spotifyTrackId,
    ...(Array.isArray(args.spotifyTrackIds) ? args.spotifyTrackIds : []),
    ...(Array.isArray(args.spotifyTrackUris) ? args.spotifyTrackUris : []),
  ];
  const trackUris = Array.from(new Set(trackInputs
    .map(extractSpotifyTrackId)
    .filter(Boolean)
    .map((trackId) => `spotify:track:${trackId}`)))
    .slice(0, 50);

  if (spotifyUriLooksTrack) {
    const trackId = extractSpotifyTrackId(spotifyUri);
    return {
      contextUri: "",
      uris: trackId ? [`spotify:track:${trackId}`] : [],
      targetType: "track",
    };
  }

  if (/^spotify:(playlist|album|artist):/i.test(spotifyUri)) {
    return {
      contextUri: spotifyUri,
      uris: [],
      targetType: spotifyUri.split(":")[1] || "context",
    };
  }

  if (spotifyPlaylistId) {
    return {
      contextUri: `spotify:playlist:${spotifyPlaylistId}`,
      uris: [],
      targetType: "playlist",
    };
  }

  return {
    contextUri: "",
    uris: trackUris,
    targetType: trackUris.length ? "tracks" : "",
  };
}

function formatPlaybackTrack(track = {}) {
  const candidate = normalizeMusicTrackCandidate(track, "spotify_catalog");

  if (!candidate) {
    return null;
  }

  return {
    spotifyTrackId: candidate.spotifyTrackId,
    spotifyUri: candidate.spotifyUri,
    spotifyUrl: candidate.spotifyUrl,
    title: candidate.title,
    artists: getMusicCandidateArtistNames(candidate.artists),
    albumName: candidate.albumName,
  };
}

function formatPlaybackTrackToolValue(track = {}) {
  if (!track) {
    return null;
  }

  return {
    spotifyUri: track.spotifyUri || (track.spotifyTrackId ? `spotify:track:${track.spotifyTrackId}` : ""),
    spotifyUrl: track.spotifyUrl,
    title: track.title,
    artists: Array.isArray(track.artists) ? track.artists : [],
    albumName: track.albumName,
  };
}

async function resolvePlaybackTrackQueries({
  spotify = null,
  userScope = "",
  trackQueries = [],
  warnings = [],
  source = "spotify_catalog_playback",
} = {}) {
  const resolved = [];
  const seenUris = new Set();

  if (!trackQueries.length) {
    return resolved;
  }

  if (!spotify?.searchCatalogTracks) {
    warnings.push("Spotify catalog search was unavailable for requested playback tracks.");
    return resolved;
  }

  for (const query of trackQueries) {
    const tracks = await spotify.searchCatalogTracks({
      userScope,
      query,
      limit: 5,
    });
    const candidate = (tracks || [])
      .map((track) => normalizeMusicTrackCandidate(track, source))
      .find((track) => track && !seenUris.has(track.spotifyUri));

    if (candidate) {
      resolved.push(candidate);
      seenUris.add(candidate.spotifyUri);
    } else {
      warnings.push(`No Spotify match found for requested playback track: ${query}.`);
    }
  }

  return resolved;
}

async function describePlaybackTrackUris({
  spotify = null,
  userScope = "",
  uris = [],
} = {}) {
  if (!spotify?.fetchTrackById) {
    return [];
  }

  const described = [];

  for (const uri of Array.isArray(uris) ? uris : []) {
    const spotifyTrackId = extractSpotifyTrackId(uri);

    if (!spotifyTrackId) {
      continue;
    }

    try {
      const track = await spotify.fetchTrackById({ userScope, spotifyTrackId });
      const formatted = formatPlaybackTrack(track);

      if (formatted) {
        described.push(formatted);
      }
    } catch (_error) {
      described.push({
        spotifyTrackId,
        spotifyUri: `spotify:track:${spotifyTrackId}`,
        spotifyUrl: "",
        title: "",
        artists: [],
        albumName: "",
      });
    }
  }

  return described;
}

function normalizeMusicPreferenceTrackIds({
  musicTrackId = "",
  spotifyTrackId = "",
  spotifyUri = "",
} = {}) {
  const rawMusicTrackId = String(musicTrackId || "").trim();
  const rawSpotifyTrackId = String(spotifyTrackId || spotifyUri || "").trim();
  const spotifyIdFromSpotifyField = extractSpotifyTrackId(rawSpotifyTrackId);
  const spotifyIdFromMusicField = extractSpotifyTrackId(rawMusicTrackId);
  const musicFieldLooksLikeSpotifyTrack = /spotify:track:/i.test(rawMusicTrackId)
    || /(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?track\//i.test(rawMusicTrackId)
    || /api\.spotify\.com\/v1\/tracks\//i.test(rawMusicTrackId)
    || /^\/?track\//i.test(rawMusicTrackId);

  return {
    musicTrackId: musicFieldLooksLikeSpotifyTrack ? "" : rawMusicTrackId,
    spotifyTrackId: spotifyIdFromSpotifyField || (musicFieldLooksLikeSpotifyTrack ? spotifyIdFromMusicField : ""),
  };
}

function isSpotifyTrackNotFoundError(error) {
  const message = String(error?.message || error || "");
  return /Spotify API GET \/tracks\//i.test(message)
    && /\(404\)|Resource not found/i.test(message);
}

function looksLikeCurrentTrackPreference({ args = {}, context = {} } = {}) {
  const text = [
    context.currentUserText,
    args.note,
  ].map((item) => String(item || "").toLowerCase()).join("\n");

  return /\b(?:current|currently|now playing|playing now|what'?s playing)\b/.test(text)
    || /\b(?:this|that)\s+(?:song|track|one|piece)\b/.test(text)
    || /\b(?:never heard this one|the song playing)\b/.test(text);
}

async function resolveCurrentSpotifyTrackForPreference({ spotify, userScope } = {}) {
  if (!spotify?.getCurrentlyPlayingTrack) {
    return null;
  }

  const current = await spotify.getCurrentlyPlayingTrack({ userScope });
  if (!current?.track?.spotifyTrackId) {
    return null;
  }

  return current.track;
}

function normalizeCuratedPlaylistTrackCount(value) {
  return Math.max(
    1,
    Math.min(
      Number.parseInt(String(value || DEFAULT_CURATED_PLAYLIST_TRACK_COUNT), 10) || DEFAULT_CURATED_PLAYLIST_TRACK_COUNT,
      MAX_CURATED_PLAYLIST_TRACK_COUNT,
    ),
  );
}

function normalizeCuratedPlaylistDiscoveryCount(value, targetTrackCount = DEFAULT_CURATED_PLAYLIST_TRACK_COUNT) {
  const fallback = Math.min(DEFAULT_CURATED_PLAYLIST_DISCOVERY_COUNT, Math.max(0, targetTrackCount - 1));
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  const count = Number.isFinite(parsed) ? parsed : fallback;

  return Math.max(
    0,
    Math.min(
      count,
      Math.max(0, targetTrackCount - 1),
    ),
  );
}

function normalizeCuratedPlaylistFillMode(value, {
  hasTrackQueries = false,
  hasLocalQueries = false,
  hasSpotifyQueries = false,
} = {}) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (["exact_only", "manual", "manual_curation", "specific", "specific_only"].includes(normalized)) {
    return "exact_only";
  }

  if (["curated_fill", "library", "library_fill", "local", "balanced"].includes(normalized)) {
    return "curated_fill";
  }

  if (["discovery", "discovery_fill", "catalog", "spotify"].includes(normalized)) {
    return "discovery";
  }

  if (hasTrackQueries && !hasLocalQueries && !hasSpotifyQueries) {
    return "exact_only";
  }

  return "curated_fill";
}

function normalizeCuratedPlaylistText(value, limit) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, limit);
}

function buildPlaylistCoverPrompt({ playlistName = "", prompt = "", coverPrompt = "" } = {}) {
  const explicit = normalizeCuratedPlaylistText(coverPrompt, PLAYLIST_DESCRIPTION_LIMIT);
  const base = explicit || [
    "Square playlist cover artwork for a music mix.",
    `Playlist title: ${playlistName || "Untitled playlist"}.`,
    `Mood brief: ${prompt || "music playlist"}.`,
    "Editorial album-cover style, visually striking.",
  ].join(" ");
  const safetyClauses = [
    /\bno\s+text\b|\bwithout\s+text\b/i.test(base) ? "" : "no text",
    /\bno\s+logos?\b|\bwithout\s+logos?\b/i.test(base) ? "" : "no logos",
    /\bno\s+ui\b|\bwithout\s+ui\b/i.test(base) ? "" : "no UI",
    /\bcopyrighted\s+characters?\b/i.test(base) ? "" : "no copyrighted characters",
  ].filter(Boolean);

  if (!safetyClauses.length) {
    return base;
  }

  const safety = safetyClauses.join(", ");
  return `${base.replace(/[. ]+$/, "")}. ${safety.charAt(0).toUpperCase()}${safety.slice(1)}.`;
}

function normalizeMusicQueryList(value, fallback = []) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n;]/)
      : fallback;
  return Array.from(new Set(source
    .map((item) => normalizeMusicLookupQuery(item))
    .filter(Boolean)))
    .slice(0, 5);
}

function normalizeMusicCandidateArtists(artists = []) {
  return Array.isArray(artists)
    ? artists.map((artist) => {
      if (typeof artist === "string") {
        const name = artist.trim();
        return name ? { name, spotifyId: "", uri: "", genres: [] } : null;
      }

      if (!artist || typeof artist !== "object") {
        return null;
      }

      const name = String(artist.name || "").trim();
      if (!name) {
        return null;
      }

      return {
        name,
        spotifyId: String(artist.spotifyId || artist.spotify_id || artist.id || "").trim(),
        uri: String(artist.uri || "").trim(),
        genres: Array.isArray(artist.genres)
          ? artist.genres.map((genre) => String(genre || "").trim()).filter(Boolean)
          : [],
      };
    }).filter(Boolean)
    : [];
}

function getMusicCandidateArtistNames(artists = []) {
  return (Array.isArray(artists) ? artists : [])
    .map((artist) => (typeof artist === "string" ? artist : artist?.name))
    .map((name) => String(name || "").trim())
    .filter(Boolean);
}

function buildPlaylistTrackPreview(tracks = [], limit = PLAYLIST_TRACK_PREVIEW_LIMIT) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || PLAYLIST_TRACK_PREVIEW_LIMIT, PLAYLIST_TRACK_PREVIEW_LIMIT));
  const normalizedTracks = Array.isArray(tracks) ? tracks : [];

  return {
    limit: normalizedLimit,
    returnedTrackCount: Math.min(normalizedTracks.length, normalizedLimit),
    totalKnownTrackCount: normalizedTracks.length,
    tracks: normalizedTracks.slice(0, normalizedLimit)
      .map((track) => ({
        title: String(track.title || "").trim(),
        artists: getMusicCandidateArtistNames(track.artists),
      }))
      .filter((track) => track.title || track.artists.length),
  };
}

function normalizeMusicTrackCandidate(track = {}, source = "local_library") {
  const spotifyTrackId = String(track.spotifyTrackId || track.spotify_track_id || "").trim();
  const spotifyUri = String(track.spotifyUri || track.spotify_uri || (spotifyTrackId ? `spotify:track:${spotifyTrackId}` : "")).trim();

  if (!spotifyUri.startsWith("spotify:track:")) {
    return null;
  }

  const artists = normalizeMusicCandidateArtists(track.artists);

  return {
    source,
    musicTrackId: String(track.musicTrackId || track.music_track_id || "").trim(),
    spotifyTrackId: spotifyTrackId || spotifyUri.replace(/^spotify:track:/, ""),
    spotifyUri,
    spotifyUrl: String(track.spotifyUrl || track.spotify_url || "").trim(),
    title: String(track.title || "").trim(),
    artists,
    albumName: String(track.albumName || track.album_name || "").trim(),
    albumReleaseDate: String(track.albumReleaseDate || track.album_release_date || track.releaseDate || track.release_date || "").trim(),
    albumReleaseDatePrecision: String(track.albumReleaseDatePrecision || track.album_release_date_precision || track.releaseDatePrecision || track.release_date_precision || "").trim(),
    releaseYear: track.releaseYear ?? track.release_year ?? null,
    artistGenres: Array.isArray(track.artistGenres || track.artist_genres) ? (track.artistGenres || track.artist_genres) : [],
    genreFamilies: Array.isArray(track.genreFamilies || track.genre_families) ? (track.genreFamilies || track.genre_families) : [],
    userGenres: Array.isArray(track.userGenres || track.user_genres) ? (track.userGenres || track.user_genres) : [],
    durationMs: track.durationMs ?? track.duration_ms ?? 0,
    explicit: Boolean(track.explicit),
    likedAt: track.likedAt || track.liked_at || null,
    score: Number(track.score || 0),
  };
}

async function collectCuratedPlaylistTracks({
  musicLibrary = null,
  spotify = null,
  userScope = "",
  targetTrackCount = DEFAULT_CURATED_PLAYLIST_TRACK_COUNT,
  discoveryTrackCount = DEFAULT_CURATED_PLAYLIST_DISCOVERY_COUNT,
  trackQueries = [],
  localQueries = [],
  spotifyQueries = [],
  includeSpotifySearch = true,
  fillMode = "curated_fill",
  excludeSpotifyTrackIds = [],
  warnings = [],
} = {}) {
  const exactCandidates = [];
  const localCandidates = [];
  const spotifyCandidates = [];
  const excludedTrackIds = new Set((Array.isArray(excludeSpotifyTrackIds) ? excludeSpotifyTrackIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean));
  const exactSeenUris = new Set();

  if (trackQueries.length && spotify?.searchCatalogTracks) {
    for (const query of trackQueries) {
      const tracks = await spotify.searchCatalogTracks({
        userScope,
        query,
        limit: 5,
      });
      const candidate = (tracks || [])
        .map((track) => normalizeMusicTrackCandidate(track, "spotify_catalog_exact"))
        .find((track) => track && !excludedTrackIds.has(track.spotifyTrackId) && !exactSeenUris.has(track.spotifyUri));

      if (candidate) {
        exactCandidates.push(candidate);
        exactSeenUris.add(candidate.spotifyUri);
      } else {
        warnings.push(`No Spotify match found for requested track: ${query}.`);
      }
    }
  } else if (trackQueries.length) {
    warnings.push("Spotify catalog search was unavailable for requested tracks.");
  }

  if (musicLibrary?.search && musicLibrary.canSearch?.()) {
    for (const query of localQueries) {
      const result = await musicLibrary.search({
        query,
        userScope,
        limit: Math.min(10, targetTrackCount),
      });
      for (const track of result.tracks || []) {
        const candidate = normalizeMusicTrackCandidate(track, "local_library");
        if (candidate && !excludedTrackIds.has(candidate.spotifyTrackId)) {
          localCandidates.push(candidate);
        }
      }
    }
  } else if (localQueries.length) {
    warnings.push("Local music library search was unavailable.");
  }

  if (includeSpotifySearch && spotify?.searchCatalogTracks) {
    for (const query of spotifyQueries) {
      const tracks = await spotify.searchCatalogTracks({
        userScope,
        query,
        limit: Math.min(10, targetTrackCount),
      });
      for (const track of tracks || []) {
        const candidate = normalizeMusicTrackCandidate(track, "spotify_catalog");
        if (candidate && !excludedTrackIds.has(candidate.spotifyTrackId)) {
          spotifyCandidates.push(candidate);
        }
      }
    }
  } else if (includeSpotifySearch && spotifyQueries.length) {
    warnings.push("Spotify catalog search was unavailable.");
  }

  const seenUris = new Set();
  const finalTracks = [];
  const addCandidate = (candidate) => {
    if (finalTracks.length >= targetTrackCount) {
      return false;
    }
    if (seenUris.has(candidate.spotifyUri)) {
      return false;
    }
    seenUris.add(candidate.spotifyUri);
    finalTracks.push(candidate);
    return true;
  };

  for (const candidate of exactCandidates) {
    addCandidate(candidate);
  }

  if (fillMode === "exact_only") {
    return {
      exactCandidates,
      localCandidates,
      spotifyCandidates,
      finalTracks,
    };
  }

  if (fillMode === "discovery") {
    for (const candidate of spotifyCandidates) {
      if (finalTracks.length >= targetTrackCount) {
        break;
      }
      addCandidate(candidate);
    }

    for (const candidate of localCandidates) {
      if (finalTracks.length >= targetTrackCount) {
        break;
      }
      addCandidate(candidate);
    }

    return {
      exactCandidates,
      localCandidates,
      spotifyCandidates,
      finalTracks,
    };
  }

  const discoveryCandidates = [];
  const discoverySeenUris = new Set(seenUris);
  for (const candidate of spotifyCandidates) {
    if (discoverySeenUris.has(candidate.spotifyUri)) {
      continue;
    }
    discoveryCandidates.push(candidate);
    discoverySeenUris.add(candidate.spotifyUri);

    if (discoveryCandidates.length >= discoveryTrackCount) {
      break;
    }
  }

  for (const candidate of localCandidates) {
    if (finalTracks.length >= targetTrackCount - discoveryCandidates.length) {
      break;
    }
    addCandidate(candidate);
  }

  for (const candidate of discoveryCandidates) {
    if (finalTracks.length >= targetTrackCount) {
      break;
    }
    addCandidate(candidate);
  }

  for (const candidate of [...localCandidates, ...spotifyCandidates]) {
    if (finalTracks.length >= targetTrackCount) {
      break;
    }
    addCandidate(candidate);
  }

  return {
    exactCandidates,
    localCandidates,
    spotifyCandidates,
    finalTracks,
  };
}

function normalizeMusicPreferenceNote(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MUSIC_NOTE_LIMIT);
}

function normalizeMusicPreferenceTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .map((tag) => String(tag || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 48))
    .filter(Boolean)))
    .slice(0, 20);
}

function normalizeMusicPreferenceActor(value) {
  return String(value || "").trim().toLowerCase() === "ai" ? "ai" : "user";
}

function normalizeToolBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeMusicPreferenceReaction(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["likes", "dislikes", "neutral", "recommended", "curious"].includes(normalized) ? normalized : "neutral";
}

function formatMusicSearchToolTrack(track = {}) {
  return {
    spotifyUri: track.spotifyUri || (track.spotifyTrackId ? `spotify:track:${track.spotifyTrackId}` : ""),
    spotifyUrl: track.spotifyUrl,
    title: track.title,
    artists: track.artists,
    albumName: track.albumName,
    albumReleaseDate: track.albumReleaseDate,
    releaseYear: track.releaseYear,
    artistGenres: track.artistGenres,
    genreFamilies: track.genreFamilies,
    userGenres: track.userGenres,
    musicBrainzTags: track.musicBrainzTags,
    effectiveGenres: track.effectiveGenres,
    effectiveGenreFamilies: track.effectiveGenreFamilies,
    likedAt: track.likedAt,
    affinities: track.affinities,
    score: track.score,
  };
}

function formatMusicAffinityToolValue(affinity = {}) {
  return {
    actorKey: affinity.actorKey || affinity.actor_key || "",
    actorType: affinity.actorType || affinity.actor_type || "",
    actorDisplayName: affinity.actorDisplayName || affinity.actor_display_name || "",
    reaction: affinity.reaction || "",
    tags: Array.isArray(affinity.tags) ? affinity.tags : [],
    note: affinity.note || "",
    updatedAt: affinity.updatedAt || affinity.updated_at || null,
  };
}

function formatCurrentSpotifyLibraryContext(track = null) {
  if (!track) {
    return {
      inLocalLibrary: false,
      source: "",
      likedAt: null,
      releaseYear: null,
      effectiveGenres: [],
      effectiveGenreFamilies: [],
      affinities: [],
    };
  }

  return {
    inLocalLibrary: true,
    source: track.source || "",
    likedAt: track.likedAt || null,
    releaseYear: track.releaseYear || null,
    effectiveGenres: Array.isArray(track.effectiveGenres) ? track.effectiveGenres : [],
    effectiveGenreFamilies: Array.isArray(track.effectiveGenreFamilies) ? track.effectiveGenreFamilies : [],
    affinities: Array.isArray(track.affinities)
      ? track.affinities.map(formatMusicAffinityToolValue)
      : [],
  };
}

function formatCurrentSpotifyTrackToolValue(track = null, libraryContext = {}) {
  if (!track) {
    return null;
  }

  return {
    spotifyUri: track.spotifyUri,
    spotifyUrl: track.spotifyUrl,
    title: track.title,
    artists: track.artists,
    albumName: track.albumName,
    durationMs: track.durationMs,
    explicit: track.explicit,
    ...libraryContext,
  };
}

function formatSpotifyPlaybackStateToolValue(playback = null) {
  if (!playback || typeof playback !== "object") {
    return null;
  }

  return {
    isPlaying: Boolean(playback.isPlaying),
    currentlyPlayingType: playback.currentlyPlayingType || "",
    progressMs: playback.progressMs || 0,
    timestamp: playback.timestamp || null,
    device: playback.device || null,
    track: formatCurrentSpotifyTrackToolValue(playback.track),
  };
}

function createMusicLibrarySearchTool({ config = {}, musicLibrary = null, logger = null }) {
  if (!musicLibrary?.search) {
    return null;
  }

  return {
    name: "search_music_library",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();
      return ["chat", "scheduled", "heartbeat"].includes(surface) && musicLibrary.canSearch?.();
    },
    definition: {
      type: "function",
      name: "search_music_library",
      description: [
        "Search the user's imported music library and saved taste notes.",
        "Use for music taste context, mood or task ideas, genre/era searches, preference questions, or when saved notes about a specific song would improve the reply.",
        "Use spotifyUri from results for follow-up actions; do not use or invent raw database or Spotify ids.",
        "Use genreFamilies for broad genres, genres for exact labels, tags for saved taste labels, and release-year filters for era requests.",
        "Read-only: not for playback, playlist creation, or saving preferences.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A short semantic search query, such as a mood, task, genre, artist, or music preference angle.",
          },
          limit: {
            type: "integer",
            description: "Maximum tracks to return. Defaults to 5 and is capped at 10.",
            minimum: 1,
            maximum: 10,
          },
          genreFamilies: {
            type: "array",
            items: { type: "string" },
            description: "Optional broad genre family filters such as rock, punk, metal, pop, indie, alternative, electronic, dance, hip-hop, rnb-soul, jazz, blues, folk, country, classical, soundtrack, or latin.",
          },
          genres: {
            type: "array",
            items: { type: "string" },
            description: "Optional exact genre filters from imported or user-corrected track genres, such as indie rock or dark cabaret.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional saved taste-note tag filters, such as favourite, nostalgic, driving, focus, or rainy.",
          },
          reactions: {
            type: "array",
            items: {
              type: "string",
              enum: ["likes", "dislikes", "neutral", "recommended", "curious"],
            },
            description: "Optional saved reaction filters.",
          },
          minReleaseYear: {
            type: "integer",
            description: "Optional earliest release year to include, e.g. 1990 for 90s or newer.",
            minimum: 1000,
            maximum: 9999,
          },
          maxReleaseYear: {
            type: "integer",
            description: "Optional latest release year to include, e.g. 1999 for 90s or 2009 for 2000s.",
            minimum: 1000,
            maximum: 9999,
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const query = normalizeMusicLookupQuery(args.query);
      const limit = normalizeMusicLookupLimit(args.limit);
      const genreFamilies = normalizeMusicLookupList(args.genreFamilies || args.genre_families);
      const genres = normalizeMusicLookupList(args.genres);
      const tags = normalizeMusicLookupList(args.tags);
      const reactions = normalizeMusicReactionFilters(args.reactions);
      const minReleaseYear = normalizeMusicReleaseYearFilter(args.minReleaseYear || args.min_release_year);
      const maxReleaseYear = normalizeMusicReleaseYearFilter(args.maxReleaseYear || args.max_release_year);
      const userScope = String(context.userScope || config.memory?.userScope || "").trim();

      if (!query) {
        return {
          ok: false,
          error: "A music search query is required.",
          query,
          limit,
          filters: {
            genres,
            genreFamilies,
            tags,
            reactions,
            minReleaseYear,
            maxReleaseYear,
          },
          tracks: [],
        };
      }

      if (!musicLibrary.canSearch?.()) {
        return {
          ok: false,
          error: "Music search is unavailable because the music library, Qdrant, or embeddings are not configured.",
          query,
          limit,
          filters: {
            genres,
            genreFamilies,
            tags,
            reactions,
            minReleaseYear,
            maxReleaseYear,
          },
          tracks: [],
        };
      }

      const result = await musicLibrary.search({
        query,
        userScope,
        limit,
        genres,
        genreFamilies,
        tags,
        reactions,
        minReleaseYear,
        maxReleaseYear,
      });

      logger?.debug?.("[tools] search_music_library completed", {
        query,
        limit,
        genres,
        genreFamilies: result.filters?.genreFamilies || genreFamilies,
        tags,
        reactions,
        minReleaseYear,
        maxReleaseYear,
        filterFallbackUsed: Boolean(result.filterFallbackUsed),
        metadataFilterRelaxed: Boolean(result.metadataFilterRelaxed),
        returnedTrackCount: result.tracks.length,
      });

      return {
        ok: true,
        query: result.query,
        limit: result.limit,
        filters: result.filters || {
          genres,
          genreFamilies,
          tags,
          reactions,
          minReleaseYear,
          maxReleaseYear,
        },
        filterFallbackUsed: Boolean(result.filterFallbackUsed),
        metadataFilterRelaxed: Boolean(result.metadataFilterRelaxed),
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        returnedTrackCount: result.tracks.length,
        tracks: result.tracks.map(formatMusicSearchToolTrack),
      };
    },
  };
}

function createSpotifyCurrentTrackTool({ config = {}, spotify = null, musicLibrary = null, logger = null }) {
  if (!spotify?.getCurrentlyPlayingTrack) {
    return null;
  }

  return {
    name: "get_current_spotify_track",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();
      return ["chat", "scheduled", "heartbeat"].includes(surface) && Boolean(spotify.getCurrentlyPlayingTrack);
    },
    definition: {
      type: "function",
      name: "get_current_spotify_track",
      description: [
        "Read the user's currently playing Spotify track, if Spotify is active.",
        "Use when the user refers to this song, the current track, what is playing, or a preference note depends on active playback.",
        "Prefer this over Discord presence for exact track identity.",
        "Read-only: not for starting, pausing, skipping, or changing playback.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    async execute(_rawArgs, context = {}) {
      const userScope = String(context.userScope || config.memory?.userScope || "").trim();
      const result = await spotify.getCurrentlyPlayingTrack({ userScope });
      let libraryContext = formatCurrentSpotifyLibraryContext(null);

      if (result.track?.spotifyTrackId && musicLibrary?.getTrackBySpotifyId) {
        try {
          const localResult = await musicLibrary.getTrackBySpotifyId({
            userScope,
            spotifyTrackId: result.track.spotifyTrackId,
            includeAffinities: true,
          });
          libraryContext = formatCurrentSpotifyLibraryContext(localResult?.track || null);
        } catch (error) {
          logger?.warn?.("[tools] get_current_spotify_track library lookup failed", {
            userScope,
            spotifyTrackId: result.track.spotifyTrackId,
            error: error?.message || String(error),
          });
        }
      }

      logger?.debug?.("[tools] get_current_spotify_track completed", {
        isPlaying: Boolean(result.isPlaying),
        currentlyPlayingType: result.currentlyPlayingType || "",
        spotifyTrackId: result.track?.spotifyTrackId || "",
        inLocalLibrary: Boolean(libraryContext.inLocalLibrary),
        affinityCount: Array.isArray(libraryContext.affinities) ? libraryContext.affinities.length : 0,
      });

      return {
        ok: true,
        isPlaying: Boolean(result.isPlaying),
        currentlyPlayingType: result.currentlyPlayingType || "",
        progressMs: result.progressMs || 0,
        timestamp: result.timestamp || null,
        device: result.device || null,
        track: formatCurrentSpotifyTrackToolValue(result.track, libraryContext),
      };
    },
  };
}

function createCuratedSpotifyPlaylistTool({
  config = {},
  musicLibrary = null,
  spotify = null,
  imageGeneration = null,
  logger = null,
}) {
  if (!spotify?.createPrivatePlaylist) {
    return null;
  }

  return {
    name: "create_curated_spotify_playlist",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();
      const hasCandidateSource = Boolean(
        spotify.searchCatalogTracks
        || (musicLibrary?.search && musicLibrary.canSearch?.()),
      );
      return ["chat", "scheduled", "heartbeat"].includes(surface)
        && Boolean(spotify.createPrivatePlaylist)
        && hasCandidateSource;
    },
    definition: {
      type: "function",
      name: "create_curated_spotify_playlist",
      description: [
        "Create a new Spotify playlist from an AI-curated brief and return its Spotify URL.",
        "Use when the user asks to create, save, build, or make a Spotify playlist, or clearly accepts your specific playlist offer.",
        "Do not use for ordinary recommendations, playlist ideas, or a written tracklist unless the user wants the playlist created in Spotify.",
        "Do not rely on the prompt alone for curation; translate the brief into useful localQueries and spotifyQueries.",
        "Use trackQueries only for exact named songs, localQueries for vibe-rich searches in the user's imported library, and spotifyQueries for literal Spotify catalog searches using genre, style, era, artist, or energy terms.",
        "For playlist cover art, set createCover=true and pass coverPrompt here; do not call generate_image separately for the cover.",
        "Spotify public=false makes the playlist profile-hidden/unlisted, not fully private.",
        "After success, share the raw Spotify playlist URL on its own line so Discord can preview it.",
        "Not for playback control.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Human-facing playlist brief: mood, event, purpose, or vibe. This may be expressive.",
          },
          playlistName: {
            type: "string",
            description: "Spotify playlist name to create.",
          },
          description: {
            type: "string",
            description: "Short Spotify playlist description.",
          },
          localQueries: {
            type: "array",
            items: { type: "string" },
            description: "Up to 5 vibe-rich semantic searches against the user's imported music library and taste notes.",
          },
          trackQueries: {
            type: "array",
            items: { type: "string" },
            description: "Up to 5 exact song lookups to include deliberately. Use song title plus artist when known.",
          },
          spotifyQueries: {
            type: "array",
            items: { type: "string" },
            description: "Up to 5 literal Spotify catalog searches for discovery picks. Use music terms like genre, style, era, artist reference, instrumentation, or energy; avoid story-only words.",
          },
          fillMode: {
            type: "string",
            enum: ["exact_only", "curated_fill", "discovery"],
            description: "Controls how much the tool fills beyond exact trackQueries. Use exact_only for specific-track curation, curated_fill for local library-led playlists, and discovery for Spotify catalog-heavy exploration. Defaults to exact_only when only trackQueries are provided; otherwise curated_fill.",
          },
          targetTrackCount: {
            type: "integer",
            description: "Target number of tracks. Defaults to 20 and is capped at 50.",
            minimum: 1,
            maximum: 50,
          },
          discoveryTrackCount: {
            type: "integer",
            description: "How many Spotify catalog discovery picks to reserve when available. Defaults to 3; may be set close to the target count when the user asks for new music.",
            minimum: 0,
            maximum: 49,
          },
          includeSpotifySearch: {
            type: "boolean",
            description: "Whether to search Spotify's catalog for extra candidates. Defaults to true.",
          },
          createCover: {
            type: "boolean",
            description: "Whether to create and upload a generated Spotify playlist cover when the user's Spotify cover setting and image generation are enabled. Defaults to true.",
          },
          coverPrompt: {
            type: "string",
            description: "Optional visual prompt for the playlist cover.",
          },
        },
        required: ["prompt", "playlistName"],
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const userScope = String(context.userScope || config.memory?.userScope || "").trim();
      const prompt = normalizeCuratedPlaylistText(args.prompt, PLAYLIST_BRIEF_LIMIT);
      const playlistName = normalizeCuratedPlaylistText(args.playlistName, PLAYLIST_NAME_LIMIT);
      const description = normalizeCuratedPlaylistText(args.description || prompt, PLAYLIST_DESCRIPTION_LIMIT);
      const targetTrackCount = normalizeCuratedPlaylistTrackCount(args.targetTrackCount);
      const includeSpotifySearch = args.includeSpotifySearch !== false;
      const shouldCreateCover = args.createCover !== false
        && Boolean(config.spotify?.createPlaylistCovers)
        && Boolean(imageGeneration?.canGenerate?.())
        && Boolean(spotify.uploadPlaylistCoverImage);
      const coverPrompt = buildPlaylistCoverPrompt({
        playlistName,
        prompt,
        coverPrompt: args.coverPrompt,
      });
      const fallbackQueries = prompt ? [prompt] : [];
      const trackQueries = normalizeMusicQueryList(args.trackQueries, []);
      const requestedLocalQueries = normalizeMusicQueryList(args.localQueries, []);
      const requestedSpotifyQueries = includeSpotifySearch
        ? normalizeMusicQueryList(args.spotifyQueries, [])
        : [];
      const fillMode = normalizeCuratedPlaylistFillMode(args.fillMode, {
        hasTrackQueries: Boolean(trackQueries.length),
        hasLocalQueries: Boolean(requestedLocalQueries.length),
        hasSpotifyQueries: Boolean(requestedSpotifyQueries.length),
      });
      const localQueries = fillMode === "exact_only"
        ? []
        : fillMode === "discovery"
          ? requestedLocalQueries
          : (requestedLocalQueries.length ? requestedLocalQueries : fallbackQueries);
      const spotifyQueries = fillMode === "exact_only" || !includeSpotifySearch
        ? []
        : (requestedSpotifyQueries.length ? requestedSpotifyQueries : fallbackQueries);
      const discoveryTrackCount = fillMode === "exact_only" || !includeSpotifySearch
        ? 0
        : normalizeCuratedPlaylistDiscoveryCount(args.discoveryTrackCount, targetTrackCount);
      const warnings = [];

      if (!prompt || !playlistName) {
        return {
          ok: false,
          error: "A playlist prompt and playlistName are required.",
          tracks: [],
        };
      }

      const {
        exactCandidates,
        localCandidates,
        spotifyCandidates,
        finalTracks,
      } = await collectCuratedPlaylistTracks({
        musicLibrary,
        spotify,
        userScope,
        targetTrackCount,
        discoveryTrackCount,
        trackQueries,
        localQueries,
        spotifyQueries,
        includeSpotifySearch,
        fillMode,
        warnings,
      });

      if (!finalTracks.length) {
        logger?.info?.("[tools] create_curated_spotify_playlist skipped", {
          userScope,
          playlistName,
          prompt,
          targetTrackCount,
          discoveryTrackCount,
          fillMode,
          trackQueryCount: trackQueries.length,
          localQueryCount: localQueries.length,
          spotifyQueryCount: spotifyQueries.length,
          exactCandidateCount: exactCandidates.length,
          localCandidateCount: localCandidates.length,
          spotifyCandidateCount: spotifyCandidates.length,
          warnings,
        });

        return {
          ok: false,
          error: "No playlist-ready Spotify tracks were found for this brief.",
          prompt,
          playlistName,
          targetTrackCount,
          discoveryTrackCount,
          fillMode,
          warnings,
          tracks: [],
        };
      }

      let playlist = null;
      let libraryImport = null;
      let cover = null;
      let playlistRecord = null;

      try {
        playlist = await spotify.createPrivatePlaylist({
          userScope,
          name: playlistName,
          description,
          uris: finalTracks.map((track) => track.spotifyUri),
        });
      } catch (error) {
        logger?.warn?.("[tools] create_curated_spotify_playlist failed", {
          userScope,
          playlistName,
          prompt,
          targetTrackCount,
          discoveryTrackCount,
          fillMode,
          trackQueryCount: trackQueries.length,
          localQueryCount: localQueries.length,
          spotifyQueryCount: spotifyQueries.length,
          exactCandidateCount: exactCandidates.length,
          localCandidateCount: localCandidates.length,
          spotifyCandidateCount: spotifyCandidates.length,
          finalTrackCount: finalTracks.length,
          error: error.message,
          warnings,
        });
        return {
          ok: false,
          error: error.message,
          prompt,
          playlistName,
          targetTrackCount,
          summary: {
            targetTrackCount,
            discoveryTrackCount,
            fillMode,
            trackQueryCount: trackQueries.length,
            localQueryCount: localQueries.length,
            spotifyQueryCount: spotifyQueries.length,
            exactCandidateCount: exactCandidates.length,
            localCandidateCount: localCandidates.length,
            spotifyCandidateCount: spotifyCandidates.length,
            finalTrackCount: finalTracks.length,
            warnings,
          },
          tracks: finalTracks.map((track) => ({
            source: track.source,
            spotifyUri: track.spotifyUri,
            spotifyUrl: track.spotifyUrl,
            title: track.title,
            artists: getMusicCandidateArtistNames(track.artists),
            albumName: track.albumName,
          })),
        };
      }

      if (musicLibrary?.importAiPlaylistTracks) {
        try {
          libraryImport = await musicLibrary.importAiPlaylistTracks({
            userScope,
            tracks: finalTracks,
          });
        } catch (error) {
          warnings.push("Playlist was created, but the selected tracks could not be imported into the local music library.");
          logger?.warn?.("[tools] create_curated_spotify_playlist library import failed", {
            userScope,
            playlistName,
            playlistId: playlist.spotifyPlaylistId || "",
            finalTrackCount: finalTracks.length,
            error: error.message,
          });
        }
      }

      if (shouldCreateCover) {
        try {
          const image = await imageGeneration.generate({
            prompt: coverPrompt,
            aspectRatio: "1:1",
            context: {
              sourceSurface: "spotify_playlist_cover",
              userScope,
              conversationId: context.conversationId || null,
              channelId: context.channelId || null,
            },
          });
          const preparedCover = await prepareSpotifyPlaylistCover({
            imageBuffer: image.file.attachment,
          });
          await spotify.uploadPlaylistCoverImage({
            userScope,
            playlistId: playlist.spotifyPlaylistId,
            jpegBase64: preparedCover.base64,
          });
          cover = {
            uploaded: true,
            imageId: image.image?.imageId || image.record?.imageId || "",
            byteLength: preparedCover.byteLength,
            size: preparedCover.size,
            quality: preparedCover.quality,
          };
        } catch (error) {
          warnings.push("Playlist was created, but the generated cover could not be uploaded.");
          logger?.warn?.("[tools] create_curated_spotify_playlist cover upload failed", {
            userScope,
            playlistName,
            playlistId: playlist.spotifyPlaylistId || "",
            error: error.message,
          });
        }
      }

      if (musicLibrary?.recordAiPlaylist) {
        try {
          playlistRecord = await musicLibrary.recordAiPlaylist({
            userScope,
            playlist: {
              ...playlist,
              name: playlist.name || playlistName,
              trackCount: playlist.trackCount || finalTracks.length,
            },
            prompt,
            description,
            tracks: finalTracks,
            importedTracks: libraryImport?.tracks || [],
            discoveryTrackCount,
            coverImageId: cover?.imageId || "",
          });
        } catch (error) {
          warnings.push("Playlist was created, but the playlist record could not be saved locally.");
          logger?.warn?.("[tools] create_curated_spotify_playlist record failed", {
            userScope,
            playlistName,
            playlistId: playlist.spotifyPlaylistId || "",
            error: error.message,
          });
        }
      }

        logger?.info?.("[tools] create_curated_spotify_playlist completed", {
        userScope,
        playlistName,
        prompt,
        targetTrackCount,
        discoveryTrackCount,
        fillMode,
        trackQueryCount: trackQueries.length,
        localQueryCount: localQueries.length,
        spotifyQueryCount: spotifyQueries.length,
        exactCandidateCount: exactCandidates.length,
        localCandidateCount: localCandidates.length,
        spotifyCandidateCount: spotifyCandidates.length,
        finalTrackCount: finalTracks.length,
        libraryImportedCount: libraryImport?.importedCount || 0,
        libraryNewTrackCount: libraryImport?.newTrackCount || 0,
        playlistStored: Boolean(playlistRecord?.playlist),
        coverUploaded: Boolean(cover?.uploaded),
        playlistId: playlist.spotifyPlaylistId || "",
        spotifyUrl: playlist.spotifyUrl || "",
        warnings,
      });

      return {
        ok: true,
        prompt,
        playlist: {
          name: playlist.name || playlistName,
          spotifyUri: playlist.spotifyUri || (playlist.spotifyPlaylistId ? `spotify:playlist:${playlist.spotifyPlaylistId}` : ""),
          spotifyUrl: playlist.spotifyUrl,
          trackCount: playlist.trackCount || finalTracks.length,
          public: playlist.public === true ? true : false,
          visibility: SPOTIFY_PLAYLIST_VISIBILITY,
          visibilityNote: SPOTIFY_PLAYLIST_VISIBILITY_NOTE,
        },
        summary: {
          targetTrackCount,
          discoveryTrackCount,
          fillMode,
          trackQueryCount: trackQueries.length,
          localQueryCount: localQueries.length,
          spotifyQueryCount: spotifyQueries.length,
          exactCandidateCount: exactCandidates.length,
          localCandidateCount: localCandidates.length,
          spotifyCandidateCount: spotifyCandidates.length,
          finalTrackCount: finalTracks.length,
          libraryImportedCount: libraryImport?.importedCount || 0,
          libraryNewTrackCount: libraryImport?.newTrackCount || 0,
          libraryUpdatedTrackCount: libraryImport?.updatedTrackCount || 0,
          librarySyncedCount: libraryImport?.syncedCount || 0,
          playlistStored: Boolean(playlistRecord?.playlist),
          coverUploaded: Boolean(cover?.uploaded),
          warnings,
        },
        cover: cover
          ? {
            uploaded: Boolean(cover.uploaded),
            byteLength: cover.byteLength || 0,
            size: cover.size || 0,
            quality: cover.quality || 0,
          }
          : null,
        tracks: finalTracks.map((track) => ({
          source: track.source,
          spotifyUri: track.spotifyUri,
          spotifyUrl: track.spotifyUrl,
          title: track.title,
          artists: getMusicCandidateArtistNames(track.artists),
          albumName: track.albumName,
        })),
      };
    },
  };
}

function createSpotifyPlaylistEditTool({
  config = {},
  musicLibrary = null,
  spotify = null,
  logger = null,
}) {
  if (!spotify?.addPlaylistItems) {
    return null;
  }

  return {
    name: "add_tracks_to_spotify_playlist",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();
      const hasCandidateSource = Boolean(
        spotify.searchCatalogTracks
        || (musicLibrary?.search && musicLibrary.canSearch?.()),
      );
      return ["chat", "scheduled", "heartbeat"].includes(surface)
        && Boolean(spotify.addPlaylistItems)
        && hasCandidateSource;
    },
    definition: {
      type: "function",
      name: "add_tracks_to_spotify_playlist",
      description: [
        "Add AI-curated tracks to an existing Ghostlight-tracked Spotify playlist.",
        "Use search_music_playlists first when the user names or refers to a playlist, then pass the returned spotifyUri.",
        "Use when the user asks to add songs, expand a playlist, continue a playlist, add another batch, or accepts your specific playlist edit offer.",
        "Do not use for removing, replacing, renaming, reordering, or changing playlist metadata.",
        "Do not rely on the prompt alone for curation; translate the brief into useful localQueries and spotifyQueries.",
        "Use trackQueries only for exact named songs, localQueries for vibe-rich searches in the user's imported library, and spotifyQueries for literal Spotify catalog searches using genre, style, era, artist, or energy terms.",
        "The tool avoids locally known duplicates, adds tracks to Spotify, and updates the local playlist record.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          spotifyUri: {
            type: "string",
            description: "Spotify playlist URI returned by search_music_playlists, such as spotify:playlist:...",
          },
          prompt: {
            type: "string",
            description: "Short brief for the tracks to add.",
          },
          localQueries: {
            type: "array",
            items: { type: "string" },
            description: "Up to 5 semantic searches against the user's imported music library.",
          },
          trackQueries: {
            type: "array",
            items: { type: "string" },
            description: "Up to 5 explicit song lookups to add exactly once when the user names specific tracks. Use song title plus artist when known.",
          },
          spotifyQueries: {
            type: "array",
            items: { type: "string" },
            description: "Up to 5 Spotify catalog searches for extra tracks beyond the user's imported library.",
          },
          fillMode: {
            type: "string",
            enum: ["exact_only", "curated_fill", "discovery"],
            description: "Controls how much the tool fills beyond explicit trackQueries. Use exact_only for manual/specific-track edits, curated_fill for local library-led additions, and discovery for Spotify catalog-heavy exploration. Defaults to exact_only when only trackQueries are provided; otherwise curated_fill.",
          },
          targetTrackCount: {
            type: "integer",
            description: "Target number of new tracks to add. Defaults to 10 and is capped at 50.",
            minimum: 1,
            maximum: 50,
          },
          discoveryTrackCount: {
            type: "integer",
            description: "How many Spotify catalog discovery picks to reserve when available. Defaults to 3; may be set close to the target count when the user asks for new music.",
            minimum: 0,
            maximum: 49,
          },
          includeSpotifySearch: {
            type: "boolean",
            description: "Whether to search Spotify's catalog for extra candidates. Defaults to true.",
          },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const userScope = String(context.userScope || config.memory?.userScope || "").trim();
      const spotifyPlaylistId = extractSpotifyPlaylistId(args.spotifyUri || args.spotifyPlaylistId || args.playlistId);
      const prompt = normalizeCuratedPlaylistText(args.prompt, PLAYLIST_BRIEF_LIMIT);
      const targetTrackCount = normalizeCuratedPlaylistTrackCount(args.targetTrackCount || 10);
      const includeSpotifySearch = args.includeSpotifySearch !== false;
      const fallbackQueries = prompt ? [prompt] : [];
      const trackQueries = normalizeMusicQueryList(args.trackQueries, []);
      const requestedLocalQueries = normalizeMusicQueryList(args.localQueries, []);
      const requestedSpotifyQueries = includeSpotifySearch
        ? normalizeMusicQueryList(args.spotifyQueries, [])
        : [];
      const fillMode = normalizeCuratedPlaylistFillMode(args.fillMode, {
        hasTrackQueries: Boolean(trackQueries.length),
        hasLocalQueries: Boolean(requestedLocalQueries.length),
        hasSpotifyQueries: Boolean(requestedSpotifyQueries.length),
      });
      const localQueries = fillMode === "exact_only"
        ? []
        : fillMode === "discovery"
          ? requestedLocalQueries
          : (requestedLocalQueries.length ? requestedLocalQueries : fallbackQueries);
      const spotifyQueries = fillMode === "exact_only" || !includeSpotifySearch
        ? []
        : (requestedSpotifyQueries.length ? requestedSpotifyQueries : fallbackQueries);
      const discoveryTrackCount = fillMode === "exact_only" || !includeSpotifySearch
        ? 0
        : normalizeCuratedPlaylistDiscoveryCount(args.discoveryTrackCount, targetTrackCount);
      const warnings = [];

      if (!spotifyPlaylistId || !prompt) {
        return {
          ok: false,
          error: "A spotifyUri and prompt are required.",
          tracks: [],
        };
      }

      let trackedPlaylist = null;
      if (musicLibrary?.getTrackedPlaylist) {
        trackedPlaylist = await musicLibrary.getTrackedPlaylist({ userScope, spotifyPlaylistId });
      }

      if (!trackedPlaylist?.playlist) {
        return {
          ok: false,
          error: "That playlist is not tracked locally yet. Use search_music_playlists to choose a known playlist before editing it.",
          spotifyPlaylistId,
          tracks: [],
        };
      }

      const excludeSpotifyTrackIds = (trackedPlaylist.tracks || [])
        .map((track) => track.spotifyTrackId)
        .filter(Boolean);
      const {
        exactCandidates,
        localCandidates,
        spotifyCandidates,
        finalTracks,
      } = await collectCuratedPlaylistTracks({
        musicLibrary,
        spotify,
        userScope,
        targetTrackCount,
        discoveryTrackCount,
        trackQueries,
        localQueries,
        spotifyQueries,
        includeSpotifySearch,
        fillMode,
        excludeSpotifyTrackIds,
        warnings,
      });

      if (!finalTracks.length) {
        logger?.info?.("[tools] add_tracks_to_spotify_playlist skipped", {
          userScope,
          playlistId: spotifyPlaylistId,
          prompt,
          targetTrackCount,
          discoveryTrackCount,
          fillMode,
          trackQueryCount: trackQueries.length,
          exactCandidateCount: exactCandidates.length,
          localCandidateCount: localCandidates.length,
          spotifyCandidateCount: spotifyCandidates.length,
          excludedTrackCount: excludeSpotifyTrackIds.length,
          warnings,
        });

        return {
          ok: false,
          error: "No new playlist-ready Spotify tracks were found for this brief.",
          spotifyUri: `spotify:playlist:${spotifyPlaylistId}`,
          prompt,
          summary: {
            targetTrackCount,
            discoveryTrackCount,
            fillMode,
            trackQueryCount: trackQueries.length,
            localQueryCount: localQueries.length,
            spotifyQueryCount: spotifyQueries.length,
            exactCandidateCount: exactCandidates.length,
            localCandidateCount: localCandidates.length,
            spotifyCandidateCount: spotifyCandidates.length,
            excludedTrackCount: excludeSpotifyTrackIds.length,
            warnings,
          },
          tracks: [],
        };
      }

      let added = null;
      let libraryImport = null;
      let playlistUpdate = null;

      try {
        added = await spotify.addPlaylistItems({
          userScope,
          playlistId: spotifyPlaylistId,
          uris: finalTracks.map((track) => track.spotifyUri),
        });
      } catch (error) {
        logger?.warn?.("[tools] add_tracks_to_spotify_playlist failed", {
          userScope,
          playlistId: spotifyPlaylistId,
          prompt,
          targetTrackCount,
          discoveryTrackCount,
          fillMode,
          trackQueryCount: trackQueries.length,
          localCandidateCount: localCandidates.length,
          spotifyCandidateCount: spotifyCandidates.length,
          exactCandidateCount: exactCandidates.length,
          finalTrackCount: finalTracks.length,
          error: error.message,
          warnings,
        });
        return {
          ok: false,
          error: error.message,
          spotifyUri: `spotify:playlist:${spotifyPlaylistId}`,
          prompt,
          summary: {
            targetTrackCount,
            discoveryTrackCount,
            fillMode,
            trackQueryCount: trackQueries.length,
            localQueryCount: localQueries.length,
            spotifyQueryCount: spotifyQueries.length,
            exactCandidateCount: exactCandidates.length,
            localCandidateCount: localCandidates.length,
            spotifyCandidateCount: spotifyCandidates.length,
            finalTrackCount: finalTracks.length,
            warnings,
          },
          tracks: finalTracks.map((track) => ({
            source: track.source,
            spotifyUri: track.spotifyUri,
            spotifyUrl: track.spotifyUrl,
            title: track.title,
            artists: getMusicCandidateArtistNames(track.artists),
            albumName: track.albumName,
          })),
        };
      }

      if (musicLibrary?.importAiPlaylistTracks) {
        try {
          libraryImport = await musicLibrary.importAiPlaylistTracks({
            userScope,
            tracks: finalTracks,
          });
        } catch (error) {
          warnings.push("Tracks were added to Spotify, but could not be imported into the local music library.");
          logger?.warn?.("[tools] add_tracks_to_spotify_playlist library import failed", {
            userScope,
            playlistId: spotifyPlaylistId,
            finalTrackCount: finalTracks.length,
            error: error.message,
          });
        }
      }

      if (musicLibrary?.appendAiPlaylistTracks) {
        try {
          playlistUpdate = await musicLibrary.appendAiPlaylistTracks({
            userScope,
            playlist: trackedPlaylist.playlist,
            tracks: finalTracks,
            importedTracks: libraryImport?.tracks || [],
          });
        } catch (error) {
          warnings.push("Tracks were added to Spotify, but the local playlist record could not be updated.");
          logger?.warn?.("[tools] add_tracks_to_spotify_playlist record failed", {
            userScope,
            playlistId: spotifyPlaylistId,
            error: error.message,
          });
        }
      }

      logger?.info?.("[tools] add_tracks_to_spotify_playlist completed", {
        userScope,
        playlistId: spotifyPlaylistId,
        prompt,
        targetTrackCount,
        discoveryTrackCount,
        fillMode,
        trackQueryCount: trackQueries.length,
        exactCandidateCount: exactCandidates.length,
        localCandidateCount: localCandidates.length,
        spotifyCandidateCount: spotifyCandidates.length,
        finalTrackCount: finalTracks.length,
        addedTrackCount: added?.addedCount || 0,
        libraryImportedCount: libraryImport?.importedCount || 0,
        playlistStored: Boolean(playlistUpdate?.playlist),
        warnings,
      });

      return {
        ok: true,
        prompt,
        playlist: {
          name: trackedPlaylist.playlist.name,
          spotifyUri: trackedPlaylist.playlist.spotifyUri || (spotifyPlaylistId ? `spotify:playlist:${spotifyPlaylistId}` : ""),
          spotifyUrl: trackedPlaylist.playlist.spotifyUrl,
          trackCount: playlistUpdate?.playlist?.trackCount || trackedPlaylist.playlist.trackCount || 0,
          discoveryTrackCount: playlistUpdate?.playlist?.discoveryTrackCount ?? trackedPlaylist.playlist.discoveryTrackCount ?? 0,
        },
        summary: {
          targetTrackCount,
          discoveryTrackCount,
          fillMode,
          trackQueryCount: trackQueries.length,
          localQueryCount: localQueries.length,
          spotifyQueryCount: spotifyQueries.length,
          exactCandidateCount: exactCandidates.length,
          localCandidateCount: localCandidates.length,
          spotifyCandidateCount: spotifyCandidates.length,
          finalTrackCount: finalTracks.length,
          excludedTrackCount: excludeSpotifyTrackIds.length,
          addedTrackCount: added?.addedCount || 0,
          libraryImportedCount: libraryImport?.importedCount || 0,
          libraryNewTrackCount: libraryImport?.newTrackCount || 0,
          libraryUpdatedTrackCount: libraryImport?.updatedTrackCount || 0,
          librarySyncedCount: libraryImport?.syncedCount || 0,
          playlistStored: Boolean(playlistUpdate?.playlist),
          warnings,
        },
        tracks: finalTracks.map((track) => ({
          source: track.source,
          spotifyUri: track.spotifyUri,
          spotifyUrl: track.spotifyUrl,
          title: track.title,
          artists: getMusicCandidateArtistNames(track.artists),
          albumName: track.albumName,
        })),
      };
    },
  };
}

function createMusicPlaylistSearchTool({ config = {}, musicLibrary = null, logger = null }) {
  if (!musicLibrary?.searchPlaylists && !musicLibrary?.listPlaylists) {
    return null;
  }

  return {
    name: "search_music_playlists",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();
      return ["chat", "scheduled", "heartbeat"].includes(surface) && Boolean(musicLibrary.searchPlaylists || musicLibrary.listPlaylists);
    },
    definition: {
      type: "function",
      name: "search_music_playlists",
      description: [
        "Search Spotify playlists you have previously created or tracked locally.",
        "Use when the user refers to an existing playlist, or when another playlist action needs the playlist URI or URL.",
        "Results include metadata and a compact track preview to help avoid obvious duplicate additions.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional search text for playlist name, description, original prompt, user note, tags, or mood/use case.",
          },
          source: {
            type: "string",
            description: "Optional playlist source filter, such as ai_curated.",
          },
          limit: {
            type: "integer",
            description: "Maximum playlists to return. Defaults to 5 and is capped at 10.",
            minimum: 1,
            maximum: 10,
          },
        },
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const userScope = String(context.userScope || config.memory?.userScope || "").trim();
      const query = normalizeMusicLookupQuery(args.query);
      const source = normalizeCuratedPlaylistText(args.source, 80);
      const limit = normalizeMusicLookupLimit(args.limit || 5);
      const result = musicLibrary.searchPlaylists
        ? await musicLibrary.searchPlaylists({
          userScope,
          query,
          source,
          limit,
        })
        : {
          playlists: await musicLibrary.listPlaylists({
            userScope,
            query,
            source,
            limit,
          }),
        };
      const playlists = Array.isArray(result?.playlists) ? result.playlists : [];

      logger?.debug?.("[tools] search_music_playlists completed", {
        userScope,
        query,
        source,
        limit,
        returnedPlaylistCount: playlists.length,
        semanticSkipped: Boolean(result?.semanticSkipped),
      });

      const playlistTrackPreviews = new Map();
      if (musicLibrary.getTrackedPlaylist) {
        await Promise.all(playlists.map(async (playlist) => {
          const spotifyPlaylistId = String(playlist.spotifyPlaylistId || "").trim();
          if (!spotifyPlaylistId) {
            return;
          }

          try {
            const tracked = await musicLibrary.getTrackedPlaylist({ userScope, spotifyPlaylistId });
            playlistTrackPreviews.set(spotifyPlaylistId, buildPlaylistTrackPreview(tracked?.tracks || []));
          } catch (error) {
            logger?.warn?.("[tools] search_music_playlists could not load playlist track preview", {
              userScope,
              spotifyPlaylistId,
              error: error.message,
            });
          }
        }));
      }

      return {
        ok: true,
        query,
        source,
        limit,
        semanticSkipped: Boolean(result?.semanticSkipped),
        returnedPlaylistCount: playlists.length,
        playlists: playlists.map((playlist) => ({
          spotifyUri: playlist.spotifyUri || (playlist.spotifyPlaylistId ? `spotify:playlist:${playlist.spotifyPlaylistId}` : ""),
          spotifyUrl: playlist.spotifyUrl,
          name: playlist.name,
          description: playlist.description,
          source: playlist.source,
          prompt: playlist.prompt,
          createdByActorKey: playlist.createdByActorKey,
          createdByDisplayName: playlist.createdByDisplayName,
          trackCount: playlist.trackCount,
          discoveryTrackCount: playlist.discoveryTrackCount,
          isFavorite: Boolean(playlist.isFavorite),
          userNote: playlist.userNote || "",
          tags: Array.isArray(playlist.tags) ? playlist.tags : [],
          trackPreview: playlistTrackPreviews.get(playlist.spotifyPlaylistId) || buildPlaylistTrackPreview([]),
          score: playlist.score,
          createdAt: playlist.createdAt,
          updatedAt: playlist.updatedAt,
        })),
      };
    },
  };
}

function createSpotifyPlaybackTool({ config = {}, spotify = null, logger = null }) {
  if (!spotify?.startPlayback) {
    return null;
  }

  return {
    name: "play_spotify_music",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();
      return ["chat", "scheduled", "heartbeat"].includes(surface) && Boolean(spotify.startPlayback);
    },
    definition: {
      type: "function",
      name: "play_spotify_music",
      description: [
        "Start Spotify playback for a chosen playlist, album, artist context, or exact track list.",
        "Use only when the user explicitly asks or allows music to start, or when an enabled proactive action permits playback.",
        "Not for pause, skip, volume, queue management, or general music recommendations.",
        "Spotify must already be active on a device; the tool fails safely if no active player is available.",
        "For tracked playlists, call search_music_playlists first and pass spotifyUri.",
        "For named tracks, use trackQueries with song title plus artist; do not construct Spotify track URIs or ids yourself.",
        "Only pass spotifyUri when copying an exact playlist, album, artist, or track URI returned by another tool.",
        "After success, describe the actual playedTarget or playedTracks returned by the tool.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          spotifyUri: {
            type: "string",
            description: "Spotify URI copied from a trusted tool result. Prefer playlist, album, or artist URIs for mood playback. For named songs, use trackQueries instead of writing a track URI.",
          },
          trackQueries: {
            type: "array",
            items: { type: "string" },
            description: "Up to 5 exact Spotify catalog lookups for named tracks to play. Use song title plus artist when known.",
          },
          reason: {
            type: "string",
            description: "Brief reason for starting this music, for logging/debug context.",
          },
        },
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const userScope = String(context.userScope || config.memory?.userScope || "").trim();
      const target = normalizeSpotifyPlaybackTarget(args);
      const reason = normalizeCuratedPlaylistText(args.reason, 500);
      const trackQueries = normalizeMusicQueryList(args.trackQueries, []).slice(0, 5);
      const warnings = [];
      let playedTracks = [];

      if (!target.contextUri && !target.uris.length && trackQueries.length) {
        const resolvedTracks = await resolvePlaybackTrackQueries({
          spotify,
          userScope,
          trackQueries,
          warnings,
        });
        target.uris = resolvedTracks.map((track) => track.spotifyUri).filter(Boolean);
        target.targetType = target.uris.length === 1 ? "track" : "tracks";
        playedTracks = resolvedTracks.map(formatPlaybackTrack).filter(Boolean);
      } else if (target.uris.length) {
        playedTracks = await describePlaybackTrackUris({
          spotify,
          userScope,
          uris: target.uris,
        });
      }

      if (!target.contextUri && !target.uris.length) {
        return {
          ok: false,
          reason: "missing_target",
          error: trackQueries.length
            ? "No matching Spotify tracks were found to start playback."
            : "Choose a Spotify playlist, album, artist, or track before starting playback.",
          warnings,
        };
      }

      const result = await spotify.startPlayback({
        userScope,
        contextUri: target.contextUri,
        uris: target.uris,
      });

      logger?.info?.("[tools] play_spotify_music completed", {
        userScope,
        ok: Boolean(result.ok),
        reason: result.reason || reason || "",
        targetType: target.targetType,
        contextUri: target.contextUri,
        trackCount: target.uris.length,
        targetTrackIds: playedTracks.map((track) => track.spotifyTrackId).filter(Boolean),
        targetTrackTitles: playedTracks.map((track) => [track.title, track.artists.join(", ")].filter(Boolean).join(" — ")).filter(Boolean),
        previousTrackId: result.current?.track?.spotifyTrackId || "",
      });

      if (!result.ok) {
        return {
          ok: false,
          reason: result.reason || "spotify_playback_failed",
          error: result.reason === "spotify_not_active"
            ? "Spotify needs to already be actively playing on a device before Ghostlight can start music."
            : "Spotify playback could not be started.",
          current: formatSpotifyPlaybackStateToolValue(result.current),
          warnings,
        };
      }

      return {
        ok: true,
        targetType: target.targetType,
        contextUri: result.contextUri || "",
        uris: result.uris || [],
        playedTracks: playedTracks.map(formatPlaybackTrackToolValue).filter(Boolean),
        playedTarget: playedTracks.length
          ? playedTracks.map((track) => [track.title, track.artists.join(", ")].filter(Boolean).join(" — ")).join("; ")
          : (result.contextUri || ""),
        reason,
        previousPlayback: formatSpotifyPlaybackStateToolValue(result.current),
        warnings,
      };
    },
  };
}

function createMusicPreferenceTool({ config = {}, musicLibrary = null, spotify = null, logger = null }) {
  if (!musicLibrary?.recordPreference) {
    return null;
  }

  return {
    name: "record_music_preference",
    isAvailable(context = {}) {
      const surface = String(context.surface || "").trim().toLowerCase();
      return surface === "chat" && Boolean(musicLibrary.recordPreference);
    },
    definition: {
      type: "function",
      name: "record_music_preference",
      description: [
        "Record one taste note for one identifiable Spotify track.",
        "Use when the current turn gives a clear like, dislike, correction, recommendation, curiosity, memory, mood association, running joke, or persona-side opinion about a specific track.",
        "Do not record a note just because a track was identified, searched, played, or returned with existing notes.",
        "Resolve the track before recording: use spotifyUri, trackQuery, or the current Spotify track.",
        "For named songs without a trusted URI copied from a tool result, use trackQuery with song title plus artist; do not construct Spotify track URIs or ids yourself.",
        "Use actor='ai' only for the AI persona's own clear recommendation, opinion, contrast, or association.",
        "Write a short note about taste, meaning, mood, memory, or context without repeating the track title or artist.",
        "Each actor has one current note per track.",
        "If updating an existing note, preserve useful existing details and add the new correction or detail.",
        "Do not use this for general memory saves, reminders, artists or genres without a track, projects, people, or non-music context.",
        "Do not overwrite user preferences unless the user clearly corrects or replaces them. Do not invent preferences.",
        "Do not say the note was saved unless the tool succeeds.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          spotifyUri: {
            type: "string",
            description: "Spotify track URI or URL copied from a trusted tool result. For named songs, use trackQuery instead of writing a track URI.",
          },
          trackQuery: {
            type: "string",
            description: "Spotify catalog lookup for a named track, using song title plus artist when known.",
          },
          useCurrentTrack: {
            type: "boolean",
            description: "Use when the note is clearly about this song, this one, the current track, or what is playing now.",
          },
          actor: {
            type: "string",
            enum: ["user", "ai"],
            description: "Who the note belongs to.",
          },
          reaction: {
            type: "string",
            enum: ["likes", "dislikes", "neutral", "recommended", "curious"],
            description: "Taste-note category.",
          },
          note: {
            type: "string",
            description: "Short summary of the preference, memory, mood, meaning, or context without repeating the track title or artist. Preserve useful existing details when updating a note.",
          },
          tags: {
            type: "array",
            items: {
              type: "string",
            },
            description: "Optional short taste tags.",
          },
        },
        required: ["actor", "reaction"],
        additionalProperties: false,
      },
    },
    async execute(rawArgs, context = {}) {
      const args = typeof rawArgs === "string" ? (safeJsonParse(rawArgs) || {}) : (rawArgs || {});
      const normalizedTrackIds = normalizeMusicPreferenceTrackIds({
        musicTrackId: args.musicTrackId,
        spotifyTrackId: args.spotifyTrackId,
        spotifyUri: args.spotifyUri || args.spotifyUrl,
      });
      let { musicTrackId, spotifyTrackId } = normalizedTrackIds;
      const userScope = String(context.userScope || config.memory?.userScope || "").trim();
      const useCurrentTrack = normalizeToolBoolean(args.useCurrentTrack, false);
      const trackQuery = normalizeCuratedPlaylistText(args.trackQuery, 240);
      const warnings = [];

      if (useCurrentTrack) {
        const currentTrack = await resolveCurrentSpotifyTrackForPreference({ spotify, userScope });

        if (!currentTrack?.spotifyTrackId) {
          warnings.push("No current Spotify track was available.");
          if (!trackQuery) {
            return {
              ok: false,
              error: "No current Spotify track is available to attach this preference to. If the song is named in the conversation, retry with trackQuery using song title plus artist.",
              retryHint: "Use trackQuery for named songs when current playback is unavailable.",
            };
          }
        } else {
          musicTrackId = "";
          spotifyTrackId = currentTrack.spotifyTrackId;
          warnings.push("Resolved the preference target from the current Spotify track.");
        }
      }

      if (!musicTrackId && !spotifyTrackId && trackQuery) {
        const resolvedTracks = await resolvePlaybackTrackQueries({
          spotify,
          userScope,
          trackQueries: [trackQuery],
          warnings,
          source: "spotify_catalog_preference",
        });

        if (resolvedTracks[0]?.spotifyTrackId) {
          spotifyTrackId = resolvedTracks[0].spotifyTrackId;
          warnings.push("Resolved the preference target from a Spotify track search.");
        }
      }

      if (!musicTrackId && !spotifyTrackId) {
        return {
          ok: false,
          error: "A spotifyUri, trackQuery, or useCurrentTrack=true is required.",
        };
      }

      const preferencePayload = {
        userScope,
        musicTrackId,
        spotifyTrackId,
        actor: normalizeMusicPreferenceActor(args.actor),
        reaction: normalizeMusicPreferenceReaction(args.reaction),
        note: normalizeMusicPreferenceNote(args.note),
        tags: normalizeMusicPreferenceTags(args.tags),
      };
      let result;
      let resolvedFromCurrentTrack = useCurrentTrack;

      try {
        result = await musicLibrary.recordPreference(preferencePayload);
      } catch (error) {
        if (!useCurrentTrack
          && spotifyTrackId
          && !musicTrackId
          && isSpotifyTrackNotFoundError(error)
          && looksLikeCurrentTrackPreference({ args, context })) {
          const currentTrack = await resolveCurrentSpotifyTrackForPreference({ spotify, userScope });

          if (currentTrack?.spotifyTrackId && currentTrack.spotifyTrackId !== spotifyTrackId) {
            logger?.warn?.("[tools] record_music_preference retrying with current Spotify track after invalid Spotify id", {
              userScope,
              suppliedSpotifyTrackId: spotifyTrackId,
              currentSpotifyTrackId: currentTrack.spotifyTrackId,
            });
            warnings.push("The supplied Spotify track id was not found, so the note was retried against the current Spotify track.");
            result = await musicLibrary.recordPreference({
              ...preferencePayload,
              spotifyTrackId: currentTrack.spotifyTrackId,
            });
            resolvedFromCurrentTrack = true;
          } else {
            throw error;
          }
        } else if (isSpotifyTrackNotFoundError(error)) {
          return {
            ok: false,
            error: "Spotify could not find that track. For named songs, retry with trackQuery using song title plus artist. Use useCurrentTrack=true only when the note is clearly about active Spotify playback.",
            retryHint: "Use trackQuery for named songs when a supplied Spotify URI is rejected.",
          };
        } else {
          throw error;
        }
      }

      logger?.debug?.("[tools] record_music_preference completed", {
        musicTrackId: result.track.musicTrackId,
        spotifyTrackId: result.track.spotifyTrackId,
        actorKey: result.affinity.actorKey,
        reaction: result.affinity.reaction,
        resolvedFromCurrentTrack,
      });

      return {
        ok: true,
        resolvedFromCurrentTrack,
        warnings,
        track: {
          spotifyUri: result.track.spotifyUri || (result.track.spotifyTrackId ? `spotify:track:${result.track.spotifyTrackId}` : ""),
          title: result.track.title,
          artists: result.track.artists,
          spotifyUrl: result.track.spotifyUrl,
        },
        affinity: {
          actorKey: result.affinity.actorKey,
          actorType: result.affinity.actorType,
          actorDisplayName: result.affinity.actorDisplayName,
          reaction: result.affinity.reaction,
          tags: result.affinity.tags,
          note: result.affinity.note,
        },
      };
    },
  };
}

module.exports = {
  createMusicLibrarySearchTool,
  createSpotifyCurrentTrackTool,
  createCuratedSpotifyPlaylistTool,
  createSpotifyPlaylistEditTool,
  createMusicPlaylistSearchTool,
  createSpotifyPlaybackTool,
  createMusicPreferenceTool,
  normalizeMusicTrackCandidate,
};
