const crypto = require("node:crypto");

const SPOTIFY_LIBRARY_SCOPE = "user-library-read";
const SPOTIFY_CURRENTLY_PLAYING_SCOPE = "user-read-currently-playing";
const SPOTIFY_PLAYLIST_READ_PRIVATE_SCOPE = "playlist-read-private";
const SPOTIFY_PLAYLIST_READ_COLLABORATIVE_SCOPE = "playlist-read-collaborative";
const SPOTIFY_PLAYLIST_MODIFY_PRIVATE_SCOPE = "playlist-modify-private";
const SPOTIFY_PLAYLIST_MODIFY_PUBLIC_SCOPE = "playlist-modify-public";
const SPOTIFY_UGC_IMAGE_UPLOAD_SCOPE = "ugc-image-upload";
const SPOTIFY_PLAYBACK_MODIFY_SCOPE = "user-modify-playback-state";
const SPOTIFY_DEFAULT_SCOPES = Object.freeze([
  SPOTIFY_LIBRARY_SCOPE,
  SPOTIFY_CURRENTLY_PLAYING_SCOPE,
  SPOTIFY_PLAYLIST_READ_PRIVATE_SCOPE,
  SPOTIFY_PLAYLIST_READ_COLLABORATIVE_SCOPE,
  SPOTIFY_PLAYLIST_MODIFY_PRIVATE_SCOPE,
  SPOTIFY_PLAYLIST_MODIFY_PUBLIC_SCOPE,
  SPOTIFY_UGC_IMAGE_UPLOAD_SCOPE,
  SPOTIFY_PLAYBACK_MODIFY_SCOPE,
]);
const DEFAULT_IMPORT_LIMIT = 500;
const MAX_IMPORT_LIMIT = 5000;
const DEFAULT_PLAYLIST_LIST_LIMIT = 50;
const GENRE_FAMILY_MATCHERS = Object.freeze([
  ["rock", /\b(rock|grunge|shoegaze|new wave|post-rock)\b/],
  ["metal", /\bmetal\b/],
  ["punk", /\bpunk\b/],
  ["pop", /\b(pop|synthpop)\b/],
  ["indie", /\bindie\b/],
  ["alternative", /\b(alternative|alt-)\b/],
  ["electronic", /\b(electronic|electronica|synth|edm|idm|ambient|downtempo|trip hop)\b/],
  ["dance", /\b(dance|house|techno|trance|garage|disco|club)\b/],
  ["hip-hop", /\b(hip hop|hip-hop|rap|trap|grime|drill)\b/],
  ["rnb-soul", /\b(r&b|rnb|soul|funk|motown|neo soul)\b/],
  ["jazz", /\bjazz\b/],
  ["blues", /\bblues\b/],
  ["folk", /\b(folk|singer-songwriter|americana)\b/],
  ["country", /\bcountry\b/],
  ["classical", /\b(classical|opera|orchestral|baroque|romantic)\b/],
  ["soundtrack", /\b(soundtrack|score|movie|broadway|musical)\b/],
  ["latin", /\b(latin|reggaeton|salsa|bachata|bossa nova)\b/],
  ["reggae", /\b(reggae|dub|dancehall)\b/],
  ["world", /\b(afro|afrobeats|k-pop|j-pop|mandopop|cantopop|world)\b/],
]);

function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/g, "");
}

function hasSpotifyConfig(config = {}, { redirectUri = "" } = {}) {
  return Boolean(
    String(config.spotify?.clientId || "").trim()
    && String(config.spotify?.clientSecret || "").trim()
    && String(redirectUri || config.spotify?.redirectUri || "").trim()
  );
}

function normalizeImportLimit(value, fallback = DEFAULT_IMPORT_LIMIT) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(parsed, MAX_IMPORT_LIMIT));
}

function buildBasicAuthHeader(config = {}) {
  const raw = `${String(config.spotify?.clientId || "")}:${String(config.spotify?.clientSecret || "")}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

function resolveSpotifyRedirectUri(config = {}, redirectUri = "") {
  return String(redirectUri || config.spotify?.redirectUri || "").trim();
}

function normalizeSpotifyScope(scope = SPOTIFY_DEFAULT_SCOPES) {
  const rawScopes = Array.isArray(scope)
    ? scope
    : String(scope || "").split(/\s+/);

  return Array.from(new Set(rawScopes
    .map((item) => String(item || "").trim())
    .filter(Boolean)))
    .join(" ");
}

function hasSpotifyScope(scope = "", requiredScope = "") {
  const required = String(requiredScope || "").trim();

  if (!required) {
    return true;
  }

  return new Set(String(scope || "").split(/\s+/).filter(Boolean)).has(required);
}

function normalizeSpotifyGenres(genres = []) {
  return Array.from(new Set((Array.isArray(genres) ? genres : [])
    .map((genre) => String(genre || "").trim().toLowerCase())
    .filter(Boolean)))
    .slice(0, 40);
}

function deriveGenreFamilies(genres = []) {
  const families = new Set();

  for (const genre of normalizeSpotifyGenres(genres)) {
    for (const [family, matcher] of GENRE_FAMILY_MATCHERS) {
      if (matcher.test(genre)) {
        families.add(family);
      }
    }
  }

  return Array.from(families).slice(0, 20);
}

function mergeGenreFamilies(...genreGroups) {
  return Array.from(new Set(genreGroups
    .flatMap((group) => deriveGenreFamilies(group))))
    .slice(0, 20);
}

function buildSpotifyAuthorizeUrl({ config, state, scope = SPOTIFY_DEFAULT_SCOPES, redirectUri = "" } = {}) {
  const resolvedRedirectUri = resolveSpotifyRedirectUri(config, redirectUri);

  if (!hasSpotifyConfig(config, { redirectUri: resolvedRedirectUri })) {
    throw new Error("Spotify client ID, client secret, and redirect URI are required.");
  }

  const baseUrl = normalizeBaseUrl(config.spotify.accountsBaseURL || "https://accounts.spotify.com");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: String(config.spotify.clientId || "").trim(),
    scope: normalizeSpotifyScope(scope),
    redirect_uri: resolvedRedirectUri,
    state,
    show_dialog: "true",
  });

  return `${baseUrl}/authorize?${params.toString()}`;
}

async function readSpotifyJson(response, {
  fallbackMessage = "Spotify request failed.",
  requestLabel = "",
} = {}) {
  const text = await response.text();
  let parsed = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      parsed = null;
    }
  }

  if (!response.ok) {
    const message = String(parsed?.error_description || parsed?.error?.message || parsed?.error || text || fallbackMessage).trim();
    const prefix = requestLabel ? `Spotify ${requestLabel} failed` : "Spotify request failed";
    const error = new Error(`${prefix} (${response.status}): ${message}`);
    error.status = response.status;
    error.spotifyMessage = message;
    error.requestLabel = requestLabel;
    error.retryAfterSeconds = Number.parseInt(String(response.headers?.get?.("Retry-After") || ""), 10) || 0;
    throw error;
  }

  return parsed || {};
}

async function requestSpotifyToken({ config, body, fetchImpl = globalThis.fetch }) {
  const baseUrl = normalizeBaseUrl(config.spotify?.accountsBaseURL || "https://accounts.spotify.com");
  const response = await fetchImpl(`${baseUrl}/api/token`, {
    method: "POST",
    headers: {
      "Authorization": buildBasicAuthHeader(config),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  return readSpotifyJson(response, { fallbackMessage: "Spotify token request failed." });
}

async function exchangeSpotifyCode({ config, code, redirectUri = "", fetchImpl = globalThis.fetch }) {
  const normalizedCode = String(code || "").trim();

  if (!normalizedCode) {
    throw new Error("Spotify authorization code is required.");
  }

  return requestSpotifyToken({
    config,
    fetchImpl,
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: normalizedCode,
      redirect_uri: resolveSpotifyRedirectUri(config, redirectUri),
    }),
  });
}

async function refreshSpotifyAccessToken({ config, refreshToken, fetchImpl = globalThis.fetch }) {
  const normalizedRefreshToken = String(refreshToken || "").trim();

  if (!normalizedRefreshToken) {
    throw new Error("Spotify refresh token is required.");
  }

  return requestSpotifyToken({
    config,
    fetchImpl,
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: normalizedRefreshToken,
    }),
  });
}

async function spotifyApiRequest({ config, accessToken, path, fetchImpl = globalThis.fetch }) {
  const baseUrl = normalizeBaseUrl(config.spotify?.apiBaseURL || "https://api.spotify.com/v1");
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  const label = `API GET ${String(path || "").split("?")[0] || "/"}`;
  return readSpotifyJson(response, {
    fallbackMessage: "Spotify API request failed.",
    requestLabel: label,
  });
}

async function spotifyApiJsonRequest({
  config,
  accessToken,
  path,
  method = "POST",
  body = null,
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = normalizeBaseUrl(config.spotify?.apiBaseURL || "https://api.spotify.com/v1");
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body === null ? undefined : JSON.stringify(body),
  });

  const label = `API ${method} ${String(path || "").split("?")[0] || "/"}`;
  return readSpotifyJson(response, {
    fallbackMessage: "Spotify API request failed.",
    requestLabel: label,
  });
}

async function spotifyApiRawRequest({
  config,
  accessToken,
  path,
  method = "PUT",
  body = "",
  contentType = "application/octet-stream",
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = normalizeBaseUrl(config.spotify?.apiBaseURL || "https://api.spotify.com/v1");
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": contentType,
    },
    body,
  });

  if (response.status === 202 || response.status === 204) {
    return {};
  }

  const label = `API ${method} ${String(path || "").split("?")[0] || "/"}`;
  return readSpotifyJson(response, {
    fallbackMessage: "Spotify API request failed.",
    requestLabel: label,
  });
}

async function getSpotifyProfile({ config, accessToken, fetchImpl = globalThis.fetch }) {
  return spotifyApiRequest({
    config,
    accessToken,
    path: "/me",
    fetchImpl,
  });
}

function mapSpotifySavedTrack(item = {}) {
  const track = item.track || {};
  const spotifyTrackId = String(track.id || "").trim();

  if (!spotifyTrackId || track.is_local) {
    return null;
  }

  return {
    spotifyTrackId,
    spotifyUri: String(track.uri || "").trim(),
    spotifyUrl: String(track.external_urls?.spotify || "").trim(),
    title: String(track.name || "").trim(),
    artists: mapSpotifyTrackArtists(track.artists),
    albumName: String(track.album?.name || "").trim(),
    albumReleaseDate: String(track.album?.release_date || "").trim(),
    albumReleaseDatePrecision: String(track.album?.release_date_precision || "").trim(),
    durationMs: Number(track.duration_ms || 0),
    explicit: Boolean(track.explicit),
    likedAt: item.added_at || null,
    source: "spotify_liked",
  };
}

function mapSpotifyTrack(track = {}, defaults = {}) {
  const spotifyTrackId = String(track.id || "").trim();

  if (!spotifyTrackId || track.is_local) {
    return null;
  }

  return {
    spotifyTrackId,
    spotifyUri: String(track.uri || "").trim(),
    spotifyUrl: String(track.external_urls?.spotify || "").trim(),
    title: String(track.name || "").trim(),
    artists: mapSpotifyTrackArtists(track.artists),
    albumName: String(track.album?.name || "").trim(),
    albumReleaseDate: String(track.album?.release_date || "").trim(),
    albumReleaseDatePrecision: String(track.album?.release_date_precision || "").trim(),
    durationMs: Number(track.duration_ms || 0),
    explicit: Boolean(track.explicit),
    likedAt: defaults.likedAt || null,
    source: defaults.source || "spotify",
  };
}

function extractSpotifyArtistId(artist = {}) {
  const directId = String(artist.spotifyId || artist.spotify_id || artist.id || "").trim();
  if (directId) {
    return directId;
  }

  const uriMatch = String(artist.uri || "").trim().match(/^spotify:artist:([^:]+)$/);
  if (uriMatch?.[1]) {
    return uriMatch[1];
  }

  const hrefMatch = String(artist.href || artist.external_urls?.spotify || artist.externalUrls?.spotify || "").trim()
    .match(/\/artist\/([^/?#]+)/);
  return hrefMatch?.[1] || "";
}

function mapSpotifyTrackArtists(artists = []) {
  return Array.isArray(artists)
    ? artists.map((artist) => ({
      name: String(artist.name || "").trim(),
      spotifyId: extractSpotifyArtistId(artist),
      uri: String(artist.uri || "").trim(),
      genres: normalizeSpotifyGenres(artist.genres),
    })).filter((artist) => artist.name)
    : [];
}

function mapSpotifyPlaylist(playlist = {}) {
  const spotifyPlaylistId = String(playlist.id || "").trim();
  const rawTrackCount = playlist.items?.total ?? playlist.tracks?.total ?? 0;
  const spotifyCoverUrl = Array.isArray(playlist.images)
    ? String(playlist.images[0]?.url || "").trim()
    : "";

  if (!spotifyPlaylistId) {
    return null;
  }

  return {
    spotifyPlaylistId,
    spotifyUri: String(playlist.uri || "").trim(),
    spotifyUrl: String(playlist.external_urls?.spotify || "").trim(),
    name: String(playlist.name || "").trim() || "Untitled playlist",
    description: String(playlist.description || "").trim(),
    ownerDisplayName: String(playlist.owner?.display_name || playlist.owner?.id || "").trim(),
    ownerId: String(playlist.owner?.id || "").trim(),
    public: playlist.public === null || playlist.public === undefined ? null : Boolean(playlist.public),
    collaborative: Boolean(playlist.collaborative),
    trackCount: Number(rawTrackCount || 0),
    spotifyCoverUrl,
  };
}

function mapSpotifyPlaylistTrackItem(item = {}) {
  return mapSpotifyTrack(item.item || item.track || {}, {
    likedAt: item.added_at || null,
    source: "spotify_playlist",
  });
}

async function fetchLikedSpotifyTracks({
  config,
  accessToken,
  limit = DEFAULT_IMPORT_LIMIT,
  fetchImpl = globalThis.fetch,
}) {
  const normalizedLimit = normalizeImportLimit(limit);
  const tracks = [];
  let offset = 0;

  while (tracks.length < normalizedLimit) {
    const pageLimit = Math.min(50, normalizedLimit - tracks.length);
    const params = new URLSearchParams({
      limit: String(pageLimit),
      offset: String(offset),
    });
    const response = await spotifyApiRequest({
      config,
      accessToken,
      path: `/me/tracks?${params.toString()}`,
      fetchImpl,
    });
    const items = Array.isArray(response.items) ? response.items : [];

    for (const item of items) {
      const mapped = mapSpotifySavedTrack(item);
      if (mapped) {
        tracks.push(mapped);
      }
    }

    if (!response.next || items.length < pageLimit) {
      break;
    }

    offset += items.length;
  }

  return tracks.slice(0, normalizedLimit);
}

async function fetchCurrentlyPlayingSpotifyTrack({
  config,
  accessToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  const baseUrl = normalizeBaseUrl(config.spotify?.apiBaseURL || "https://api.spotify.com/v1");
  const params = new URLSearchParams({
    additional_types: "track",
  });
  const response = await fetchImpl(`${baseUrl}/me/player/currently-playing?${params.toString()}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (response.status === 204) {
    return {
      isPlaying: false,
      currentlyPlayingType: "",
      track: null,
    };
  }

  const payload = await readSpotifyJson(response, {
    fallbackMessage: "Spotify currently playing request failed.",
    requestLabel: "currently playing request",
  });
  const type = String(payload.currently_playing_type || payload.item?.type || "").trim();
  const track = type === "track" ? mapSpotifyTrack(payload.item, { source: "spotify_currently_playing" }) : null;

  return {
    isPlaying: Boolean(payload.is_playing),
    currentlyPlayingType: type,
    progressMs: Number(payload.progress_ms || 0),
    timestamp: payload.timestamp || null,
    device: payload.device
      ? {
        id: String(payload.device.id || "").trim(),
        name: String(payload.device.name || "").trim(),
        type: String(payload.device.type || "").trim(),
        isActive: Boolean(payload.device.is_active),
      }
      : null,
    track,
  };
}

async function fetchCurrentUserSpotifyPlaylists({
  config,
  accessToken,
  limit = DEFAULT_PLAYLIST_LIST_LIMIT,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number.parseInt(String(limit || DEFAULT_PLAYLIST_LIST_LIMIT), 10) || DEFAULT_PLAYLIST_LIST_LIMIT, 500));
  const playlists = [];
  let offset = 0;

  while (playlists.length < normalizedLimit) {
    const pageLimit = Math.min(50, normalizedLimit - playlists.length);
    const params = new URLSearchParams({
      limit: String(pageLimit),
      offset: String(offset),
    });
    const response = await spotifyApiRequest({
      config,
      accessToken,
      path: `/me/playlists?${params.toString()}`,
      fetchImpl,
    });
    const items = Array.isArray(response.items) ? response.items : [];

    for (const item of items) {
      const mapped = mapSpotifyPlaylist(item);
      if (mapped) {
        playlists.push(mapped);
      }
    }

    if (!response.next || items.length < pageLimit) {
      break;
    }

    offset += items.length;
  }

  return playlists.slice(0, normalizedLimit);
}

async function fetchSpotifyPlaylistTracks({
  config,
  accessToken,
  playlistId,
  limit = DEFAULT_IMPORT_LIMIT,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedPlaylistId = String(playlistId || "").trim();

  if (!normalizedPlaylistId) {
    throw new Error("Spotify playlist ID is required.");
  }

  const normalizedLimit = normalizeImportLimit(limit);
  const tracks = [];
  let offset = 0;

  while (tracks.length < normalizedLimit) {
    const pageLimit = Math.min(50, normalizedLimit - tracks.length);
    const params = new URLSearchParams({
      limit: String(pageLimit),
      offset: String(offset),
      additional_types: "track",
    });
    const response = await spotifyApiRequest({
      config,
      accessToken,
      path: `/playlists/${encodeURIComponent(normalizedPlaylistId)}/items?${params.toString()}`,
      fetchImpl,
    });
    const items = Array.isArray(response.items) ? response.items : [];

    for (const item of items) {
      const mapped = mapSpotifyPlaylistTrackItem(item);
      if (mapped) {
        tracks.push(mapped);
      }
    }

    if (!response.next || items.length < pageLimit) {
      break;
    }

    offset += items.length;
  }

  return tracks.slice(0, normalizedLimit);
}

async function fetchSpotifyPlaylist({
  config,
  accessToken,
  playlistId,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedPlaylistId = String(playlistId || "").trim();

  if (!normalizedPlaylistId) {
    throw new Error("Spotify playlist ID is required.");
  }

  const params = new URLSearchParams({
    fields: "id,uri,external_urls,name,description,owner,public,collaborative,tracks.total,images",
  });
  const playlist = await spotifyApiRequest({
    config,
    accessToken,
    path: `/playlists/${encodeURIComponent(normalizedPlaylistId)}?${params.toString()}`,
    fetchImpl,
  });

  return mapSpotifyPlaylist(playlist);
}

async function searchSpotifyCatalogTracks({
  config,
  accessToken,
  query,
  limit = 10,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedQuery = String(query || "").trim().replace(/\s+/g, " ");

  if (!normalizedQuery) {
    return [];
  }

  const normalizedLimit = Math.max(1, Math.min(Number.parseInt(String(limit || 10), 10) || 10, 50));
  const params = new URLSearchParams({
    q: normalizedQuery,
    type: "track",
    limit: String(normalizedLimit),
  });
  const response = await spotifyApiRequest({
    config,
    accessToken,
    path: `/search?${params.toString()}`,
    fetchImpl,
  });

  return (Array.isArray(response.tracks?.items) ? response.tracks.items : [])
    .map((track) => mapSpotifyTrack(track, { source: "spotify_search" }))
    .filter(Boolean)
    .slice(0, normalizedLimit);
}

async function fetchSpotifyTrackById({
  config,
  accessToken,
  spotifyTrackId,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedTrackId = String(spotifyTrackId || "").trim();

  if (!normalizedTrackId) {
    return null;
  }

  const response = await spotifyApiRequest({
    config,
    accessToken,
    path: `/tracks/${encodeURIComponent(normalizedTrackId)}`,
    fetchImpl,
  });

  return mapSpotifyTrack(response, { source: "spotify_preference" });
}

function normalizeSpotifyTrackUris(uris = []) {
  const rawUris = Array.isArray(uris) ? uris : [uris];

  return Array.from(new Set(rawUris
    .map((uri) => String(uri || "").trim())
    .filter((uri) => /^spotify:track:[^:]+$/i.test(uri))))
    .slice(0, 50);
}

async function startSpotifyPlayback({
  config,
  accessToken,
  contextUri = "",
  uris = [],
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedContextUri = String(contextUri || "").trim();
  const normalizedUris = normalizeSpotifyTrackUris(uris);

  if (!normalizedContextUri && !normalizedUris.length) {
    throw new Error("Spotify playback needs a playlist, album, artist, or track URI.");
  }

  const body = normalizedContextUri
    ? { context_uri: normalizedContextUri }
    : { uris: normalizedUris };

  await spotifyApiJsonRequest({
    config,
    accessToken,
    path: "/me/player/play",
    method: "PUT",
    body,
    fetchImpl,
  });

  return {
    contextUri: normalizedContextUri,
    uris: normalizedUris,
  };
}

async function createSpotifyPlaylist({
  config,
  accessToken,
  name,
  description = "",
  isPublic = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedName = String(name || "").trim();

  if (!normalizedName) {
    throw new Error("Spotify playlist name is required.");
  }

  const playlist = await spotifyApiJsonRequest({
    config,
    accessToken,
    method: "POST",
    path: "/me/playlists",
    body: {
      name: normalizedName.slice(0, 100),
      description: String(description || "").trim().slice(0, 300),
      public: Boolean(isPublic),
    },
    fetchImpl,
  });

  return mapSpotifyPlaylist(playlist);
}

async function setSpotifyPlaylistPrivacy({
  config,
  accessToken,
  playlistId,
  isPublic = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedPlaylistId = String(playlistId || "").trim();

  if (!normalizedPlaylistId) {
    throw new Error("Spotify playlist ID is required.");
  }

  await spotifyApiJsonRequest({
    config,
    accessToken,
    method: "PUT",
    path: `/playlists/${encodeURIComponent(normalizedPlaylistId)}`,
    body: {
      public: Boolean(isPublic),
    },
    fetchImpl,
  });

  return {
    spotifyPlaylistId: normalizedPlaylistId,
    public: Boolean(isPublic),
  };
}

async function addSpotifyPlaylistItems({
  config,
  accessToken,
  playlistId,
  uris,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedPlaylistId = String(playlistId || "").trim();
  const normalizedUris = Array.from(new Set(
    (Array.isArray(uris) ? uris : [])
      .map((uri) => String(uri || "").trim())
      .filter((uri) => uri.startsWith("spotify:track:")),
  ));

  if (!normalizedPlaylistId) {
    throw new Error("Spotify playlist ID is required.");
  }

  let addedCount = 0;

  for (let index = 0; index < normalizedUris.length; index += 100) {
    const batch = normalizedUris.slice(index, index + 100);

    if (!batch.length) {
      continue;
    }

    await spotifyApiJsonRequest({
      config,
      accessToken,
      method: "POST",
      path: `/playlists/${encodeURIComponent(normalizedPlaylistId)}/items`,
      body: { uris: batch },
      fetchImpl,
    });
    addedCount += batch.length;
  }

  return { addedCount };
}

async function uploadSpotifyPlaylistCoverImage({
  config,
  accessToken,
  playlistId,
  jpegBase64,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedPlaylistId = String(playlistId || "").trim();
  const normalizedImage = String(jpegBase64 || "").trim();

  if (!normalizedPlaylistId) {
    throw new Error("Spotify playlist ID is required.");
  }

  if (!normalizedImage) {
    throw new Error("Spotify playlist cover image is required.");
  }

  await spotifyApiRawRequest({
    config,
    accessToken,
    method: "PUT",
    path: `/playlists/${encodeURIComponent(normalizedPlaylistId)}/images`,
    body: normalizedImage,
    contentType: "image/jpeg",
    fetchImpl,
  });

  return { uploaded: true };
}

function createSpotifyService({
  config,
  store,
  logger,
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    canConnect({ redirectUri = "" } = {}) {
      return hasSpotifyConfig(config, { redirectUri }) && Boolean(store?.persistenceEnabled);
    },

    createOAuthState() {
      return crypto.randomBytes(24).toString("hex");
    },

    buildAuthorizeUrl({ state, redirectUri = "" }) {
      return buildSpotifyAuthorizeUrl({ config, state, redirectUri });
    },

    async startConnect({ userScope, redirectUri = "" }) {
      if (!this.canConnect({ redirectUri })) {
        throw new Error("Spotify connection requires Spotify env vars and database persistence.");
      }

      const state = this.createOAuthState();
      await store.saveSpotifyOAuthState({ userScope, state });
      return {
        state,
        url: this.buildAuthorizeUrl({ state, redirectUri }),
      };
    },

    async completeConnect({ userScope, code, state, redirectUri = "" }) {
      if (!this.canConnect({ redirectUri })) {
        throw new Error("Spotify connection requires Spotify env vars and database persistence.");
      }

      const connection = await store.getSpotifyConnection({ userScope });
      const expectedState = String(connection?.oauthState || "").trim();

      if (!expectedState || expectedState !== String(state || "").trim()) {
        throw new Error("Spotify connection state did not match. Please try connecting again.");
      }

      const token = await exchangeSpotifyCode({ config, code, redirectUri, fetchImpl });
      const refreshToken = String(token.refresh_token || "").trim();

      if (!refreshToken) {
        throw new Error("Spotify did not return a refresh token. Disconnect the app in Spotify and try again.");
      }

      const profile = await getSpotifyProfile({
        config,
        accessToken: token.access_token,
        fetchImpl,
      });

      const saved = await store.upsertSpotifyConnection({
        userScope,
        spotifyUserId: profile.id || "",
        spotifyDisplayName: profile.display_name || profile.id || "Spotify user",
        refreshToken,
        scope: token.scope || normalizeSpotifyScope(),
      });

      logger?.info?.("[music] Spotify connected", {
        userScope,
        spotifyUserId: saved.spotifyUserId || "",
      });

      return saved;
    },

    async getAccessToken({ userScope }) {
      const connection = await store.getSpotifyConnection({ userScope });

      if (!connection?.refreshToken) {
        throw new Error("Spotify is not connected.");
      }

      const token = await refreshSpotifyAccessToken({
        config,
        refreshToken: connection.refreshToken,
        fetchImpl,
      });

      return {
        accessToken: token.access_token,
        scope: token.scope || connection.scope || "",
        connection,
      };
    },

    async fetchLikedTracks({ userScope, limit = DEFAULT_IMPORT_LIMIT }) {
      const { accessToken } = await this.getAccessToken({ userScope });
      return fetchLikedSpotifyTracks({
        config,
        accessToken,
        limit,
        fetchImpl,
        logger,
      });
    },

    async listPlaylists({ userScope, limit = DEFAULT_PLAYLIST_LIST_LIMIT } = {}) {
      const { accessToken, scope } = await this.getAccessToken({ userScope });

      if (!hasSpotifyScope(scope, SPOTIFY_PLAYLIST_READ_PRIVATE_SCOPE)) {
        throw new Error("Spotify playlist import requires reconnecting Spotify with playlist read scope.");
      }

      return fetchCurrentUserSpotifyPlaylists({
        config,
        accessToken,
        limit,
        fetchImpl,
      });
    },

    async fetchPlaylistTracks({ userScope, playlistId, limit = DEFAULT_IMPORT_LIMIT } = {}) {
      const { accessToken, scope } = await this.getAccessToken({ userScope });

      if (!hasSpotifyScope(scope, SPOTIFY_PLAYLIST_READ_PRIVATE_SCOPE)) {
        throw new Error("Spotify playlist import requires reconnecting Spotify with playlist read scope.");
      }

      const tracks = await fetchSpotifyPlaylistTracks({
        config,
        accessToken,
        playlistId,
        limit,
        fetchImpl,
      });

      return tracks;
    },

    async fetchPlaylist({ userScope, playlistId } = {}) {
      const { accessToken, scope } = await this.getAccessToken({ userScope });

      if (!hasSpotifyScope(scope, SPOTIFY_PLAYLIST_READ_PRIVATE_SCOPE)) {
        throw new Error("Spotify playlist import requires reconnecting Spotify with playlist read scope.");
      }

      return fetchSpotifyPlaylist({
        config,
        accessToken,
        playlistId,
        fetchImpl,
      });
    },

    async getCurrentlyPlayingTrack({ userScope }) {
      const { accessToken, scope } = await this.getAccessToken({ userScope });

      if (!hasSpotifyScope(scope, SPOTIFY_CURRENTLY_PLAYING_SCOPE)) {
        throw new Error("Spotify currently playing requires reconnecting Spotify with the current read scope.");
      }

      return fetchCurrentlyPlayingSpotifyTrack({
        config,
        accessToken,
        fetchImpl,
      });
    },

    async searchCatalogTracks({ userScope, query, limit = 10 } = {}) {
      const { accessToken } = await this.getAccessToken({ userScope });
      return searchSpotifyCatalogTracks({
        config,
        accessToken,
        query,
        limit,
        fetchImpl,
      });
    },

    async fetchTrackById({ userScope, spotifyTrackId } = {}) {
      const { accessToken } = await this.getAccessToken({ userScope });
      return fetchSpotifyTrackById({
        config,
        accessToken,
        spotifyTrackId,
        fetchImpl,
      });
    },

    async startPlayback({ userScope, contextUri = "", uris = [] } = {}) {
      const { accessToken, scope } = await this.getAccessToken({ userScope });

      if (!hasSpotifyScope(scope, SPOTIFY_CURRENTLY_PLAYING_SCOPE)) {
        throw new Error("Spotify playback requires reconnecting Spotify with the current read scope.");
      }

      if (!hasSpotifyScope(scope, SPOTIFY_PLAYBACK_MODIFY_SCOPE)) {
        throw new Error("Spotify playback requires reconnecting Spotify with playback control scope.");
      }

      const current = await fetchCurrentlyPlayingSpotifyTrack({
        config,
        accessToken,
        fetchImpl,
      });

      if (!current.isPlaying) {
        return {
          ok: false,
          reason: "spotify_not_active",
          current,
        };
      }

      const played = await startSpotifyPlayback({
        config,
        accessToken,
        contextUri,
        uris,
        fetchImpl,
      });

      return {
        ok: true,
        reason: "",
        current,
        ...played,
      };
    },

    async createPrivatePlaylist({ userScope, name, description = "", uris = [] } = {}) {
      const { accessToken, scope } = await this.getAccessToken({ userScope });

      if (
        !hasSpotifyScope(scope, SPOTIFY_PLAYLIST_MODIFY_PRIVATE_SCOPE)
        || !hasSpotifyScope(scope, SPOTIFY_PLAYLIST_MODIFY_PUBLIC_SCOPE)
      ) {
        throw new Error("Spotify playlist creation requires reconnecting Spotify with playlist write scopes.");
      }

      let playlist = null;
      let added = null;

      try {
        playlist = await createSpotifyPlaylist({
          config,
          accessToken,
          name,
          description,
          isPublic: false,
          fetchImpl,
        });
        await setSpotifyPlaylistPrivacy({
          config,
          accessToken,
          playlistId: playlist.spotifyPlaylistId,
          isPublic: false,
          fetchImpl,
        });
        added = await addSpotifyPlaylistItems({
          config,
          accessToken,
          playlistId: playlist.spotifyPlaylistId,
          uris,
          fetchImpl,
        });
      } catch (error) {
        const message = [
          error.message,
          `grantedScopes="${scope || ""}"`,
          playlist?.spotifyPlaylistId ? `createdPlaylistId="${playlist.spotifyPlaylistId}"` : "",
        ].filter(Boolean).join(" ");
        throw new Error(message);
      }

      return {
        ...playlist,
        trackCount: added.addedCount,
      };
    },

    async addPlaylistItems({ userScope, playlistId, uris = [] } = {}) {
      const { accessToken, scope } = await this.getAccessToken({ userScope });

      if (
        !hasSpotifyScope(scope, SPOTIFY_PLAYLIST_MODIFY_PRIVATE_SCOPE)
        || !hasSpotifyScope(scope, SPOTIFY_PLAYLIST_MODIFY_PUBLIC_SCOPE)
      ) {
        throw new Error("Spotify playlist editing requires reconnecting Spotify with playlist write scopes.");
      }

      return addSpotifyPlaylistItems({
        config,
        accessToken,
        playlistId,
        uris,
        fetchImpl,
      });
    },

    async uploadPlaylistCoverImage({ userScope, playlistId, jpegBase64 } = {}) {
      const { accessToken, scope } = await this.getAccessToken({ userScope });

      if (!hasSpotifyScope(scope, SPOTIFY_UGC_IMAGE_UPLOAD_SCOPE)) {
        throw new Error("Spotify playlist cover upload requires reconnecting Spotify with image upload scope.");
      }

      return uploadSpotifyPlaylistCoverImage({
        config,
        accessToken,
        playlistId,
        jpegBase64,
        fetchImpl,
      });
    },
  };
}

module.exports = {
  SPOTIFY_LIBRARY_SCOPE,
  SPOTIFY_CURRENTLY_PLAYING_SCOPE,
  SPOTIFY_PLAYLIST_READ_PRIVATE_SCOPE,
  SPOTIFY_PLAYLIST_READ_COLLABORATIVE_SCOPE,
  SPOTIFY_PLAYLIST_MODIFY_PRIVATE_SCOPE,
  SPOTIFY_PLAYLIST_MODIFY_PUBLIC_SCOPE,
  SPOTIFY_UGC_IMAGE_UPLOAD_SCOPE,
  SPOTIFY_PLAYBACK_MODIFY_SCOPE,
  SPOTIFY_DEFAULT_SCOPES,
  DEFAULT_IMPORT_LIMIT,
  MAX_IMPORT_LIMIT,
  DEFAULT_PLAYLIST_LIST_LIMIT,
  hasSpotifyConfig,
  hasSpotifyScope,
  normalizeImportLimit,
  normalizeSpotifyScope,
  normalizeSpotifyGenres,
  deriveGenreFamilies,
  mergeGenreFamilies,
  resolveSpotifyRedirectUri,
  buildSpotifyAuthorizeUrl,
  exchangeSpotifyCode,
  refreshSpotifyAccessToken,
  getSpotifyProfile,
  fetchLikedSpotifyTracks,
  fetchCurrentlyPlayingSpotifyTrack,
  fetchCurrentUserSpotifyPlaylists,
  fetchSpotifyPlaylist,
  fetchSpotifyPlaylistTracks,
  fetchSpotifyTrackById,
  startSpotifyPlayback,
  searchSpotifyCatalogTracks,
  createSpotifyPlaylist,
  setSpotifyPlaylistPrivacy,
  addSpotifyPlaylistItems,
  uploadSpotifyPlaylistCoverImage,
  mapSpotifySavedTrack,
  mapSpotifyTrack,
  mapSpotifyPlaylist,
  mapSpotifyPlaylistTrackItem,
  createSpotifyService,
};
