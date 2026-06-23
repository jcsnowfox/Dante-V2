const crypto = require("node:crypto");
const { createPostgresPool } = require("../postgres/createPostgresPool");

const SUPPORTED_MUSIC_REACTIONS = Object.freeze([
  "likes",
  "dislikes",
  "neutral",
  "recommended",
  "curious",
]);

const CREATE_SPOTIFY_CONNECTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS music_spotify_connections (
    user_scope TEXT PRIMARY KEY,
    spotify_user_id TEXT NOT NULL DEFAULT '',
    spotify_display_name TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL DEFAULT '',
    access_token TEXT NOT NULL DEFAULT '',
    token_expires_at TIMESTAMPTZ,
    scope TEXT NOT NULL DEFAULT '',
    oauth_state TEXT NOT NULL DEFAULT '',
    oauth_state_created_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    last_import_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_MUSIC_TRACKS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS music_tracks (
    id BIGSERIAL PRIMARY KEY,
    music_track_id UUID NOT NULL UNIQUE,
    user_scope TEXT NOT NULL,
    spotify_track_id TEXT NOT NULL,
    spotify_uri TEXT NOT NULL,
    spotify_url TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    artists JSONB NOT NULL DEFAULT '[]'::jsonb,
    album_name TEXT NOT NULL DEFAULT '',
    album_release_date TEXT NOT NULL DEFAULT '',
    album_release_date_precision TEXT NOT NULL DEFAULT '',
    release_year INTEGER,
    artist_genres JSONB NOT NULL DEFAULT '[]'::jsonb,
    genre_families JSONB NOT NULL DEFAULT '[]'::jsonb,
    user_genres JSONB NOT NULL DEFAULT '[]'::jsonb,
    musicbrainz_recording_id TEXT NOT NULL DEFAULT '',
    musicbrainz_release_id TEXT NOT NULL DEFAULT '',
    musicbrainz_release_group_id TEXT NOT NULL DEFAULT '',
    musicbrainz_match_confidence REAL,
    musicbrainz_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    musicbrainz_enrichment_status TEXT NOT NULL DEFAULT 'pending',
    musicbrainz_last_error TEXT NOT NULL DEFAULT '',
    musicbrainz_enriched_at TIMESTAMPTZ,
    musicbrainz_next_fetch_after TIMESTAMPTZ,
    embedding_dirty_at TIMESTAMPTZ,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    explicit BOOLEAN NOT NULL DEFAULT FALSE,
    liked_at TIMESTAMPTZ,
    source TEXT NOT NULL DEFAULT 'spotify_liked',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    imported_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_scope, spotify_track_id)
  );
`;

const CREATE_MUSIC_TRACK_AFFINITIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS music_track_affinities (
    id BIGSERIAL PRIMARY KEY,
    affinity_id UUID NOT NULL UNIQUE,
    music_track_id UUID NOT NULL REFERENCES music_tracks(music_track_id) ON DELETE CASCADE,
    user_scope TEXT NOT NULL,
    actor_key TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_display_name TEXT NOT NULL,
    reaction TEXT NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (music_track_id, actor_key)
  );
`;

const CREATE_MUSIC_PLAYLISTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS music_playlists (
    id BIGSERIAL PRIMARY KEY,
    music_playlist_id UUID NOT NULL UNIQUE,
    user_scope TEXT NOT NULL,
    spotify_playlist_id TEXT NOT NULL,
    spotify_uri TEXT NOT NULL DEFAULT '',
    spotify_url TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'ai_curated',
    prompt TEXT NOT NULL DEFAULT '',
    created_by_actor_key TEXT NOT NULL DEFAULT '',
    created_by_actor_type TEXT NOT NULL DEFAULT 'ai',
    created_by_display_name TEXT NOT NULL DEFAULT '',
    track_count INTEGER NOT NULL DEFAULT 0,
    discovery_track_count INTEGER NOT NULL DEFAULT 0,
    cover_image_id TEXT NOT NULL DEFAULT '',
    spotify_cover_url TEXT NOT NULL DEFAULT '',
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    user_note TEXT NOT NULL DEFAULT '',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_scope, spotify_playlist_id)
  );
`;

const CREATE_MUSIC_PLAYLIST_TRACKS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS music_playlist_tracks (
    id BIGSERIAL PRIMARY KEY,
    music_playlist_id UUID NOT NULL REFERENCES music_playlists(music_playlist_id) ON DELETE CASCADE,
    music_track_id UUID NOT NULL REFERENCES music_tracks(music_track_id) ON DELETE CASCADE,
    spotify_track_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (music_playlist_id, spotify_track_id),
    UNIQUE (music_playlist_id, position)
  );
`;

const CREATE_MUSIC_INDEXES_SQL = [
  "CREATE UNIQUE INDEX IF NOT EXISTS music_spotify_connections_user_scope_uidx ON music_spotify_connections (user_scope);",
  "CREATE UNIQUE INDEX IF NOT EXISTS music_tracks_scope_spotify_track_uidx ON music_tracks (user_scope, spotify_track_id);",
  "CREATE UNIQUE INDEX IF NOT EXISTS music_playlists_scope_spotify_playlist_uidx ON music_playlists (user_scope, spotify_playlist_id);",
  "CREATE INDEX IF NOT EXISTS music_tracks_scope_updated_idx ON music_tracks (user_scope, updated_at DESC);",
  "CREATE INDEX IF NOT EXISTS music_tracks_scope_active_idx ON music_tracks (user_scope, active);",
  "CREATE INDEX IF NOT EXISTS music_tracks_musicbrainz_status_idx ON music_tracks (user_scope, musicbrainz_enrichment_status, musicbrainz_next_fetch_after);",
  "CREATE INDEX IF NOT EXISTS music_tracks_embedding_dirty_idx ON music_tracks (user_scope, embedding_dirty_at) WHERE embedding_dirty_at IS NOT NULL;",
  "CREATE INDEX IF NOT EXISTS music_tracks_liked_at_idx ON music_tracks (liked_at DESC);",
  "CREATE INDEX IF NOT EXISTS music_track_affinities_track_idx ON music_track_affinities (music_track_id);",
  "CREATE INDEX IF NOT EXISTS music_track_affinities_actor_idx ON music_track_affinities (user_scope, actor_key);",
  "CREATE INDEX IF NOT EXISTS music_track_affinities_tags_gin_idx ON music_track_affinities USING GIN (tags);",
  "CREATE INDEX IF NOT EXISTS music_playlists_scope_updated_idx ON music_playlists (user_scope, updated_at DESC);",
  "CREATE INDEX IF NOT EXISTS music_playlists_scope_source_idx ON music_playlists (user_scope, source);",
  "CREATE INDEX IF NOT EXISTS music_playlist_tracks_playlist_position_idx ON music_playlist_tracks (music_playlist_id, position);",
  "CREATE INDEX IF NOT EXISTS music_playlist_tracks_track_idx ON music_playlist_tracks (music_track_id);",
];

const MUSIC_SCHEMA_TABLES = Object.freeze([
  "music_spotify_connections",
  "music_tracks",
  "music_track_affinities",
  "music_playlists",
  "music_playlist_tracks",
]);

const ALTER_SPOTIFY_CONNECTIONS_TABLE_SQL = [
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS user_scope TEXT NOT NULL DEFAULT 'user';",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS spotify_user_id TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS spotify_display_name TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS refresh_token TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS access_token TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS oauth_state TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS oauth_state_created_at TIMESTAMPTZ;",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS last_import_at TIMESTAMPTZ;",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
  "ALTER TABLE music_spotify_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
];

const ALTER_MUSIC_TRACKS_TABLE_SQL = [
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS id BIGSERIAL;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS music_track_id UUID;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS user_scope TEXT NOT NULL DEFAULT 'user';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS spotify_track_id TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS spotify_uri TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS spotify_url TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS artists JSONB NOT NULL DEFAULT '[]'::jsonb;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS album_name TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS album_release_date TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS album_release_date_precision TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS release_year INTEGER;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS artist_genres JSONB NOT NULL DEFAULT '[]'::jsonb;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS genre_families JSONB NOT NULL DEFAULT '[]'::jsonb;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS user_genres JSONB NOT NULL DEFAULT '[]'::jsonb;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS musicbrainz_recording_id TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS musicbrainz_release_id TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS musicbrainz_release_group_id TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS musicbrainz_match_confidence REAL;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS musicbrainz_tags JSONB NOT NULL DEFAULT '[]'::jsonb;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS musicbrainz_enrichment_status TEXT NOT NULL DEFAULT 'pending';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS musicbrainz_last_error TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS musicbrainz_enriched_at TIMESTAMPTZ;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS musicbrainz_next_fetch_after TIMESTAMPTZ;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS embedding_dirty_at TIMESTAMPTZ;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS duration_ms INTEGER NOT NULL DEFAULT 0;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS explicit BOOLEAN NOT NULL DEFAULT FALSE;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS liked_at TIMESTAMPTZ;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'spotify_liked';",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
  "ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
];

const ALTER_MUSIC_TRACK_AFFINITIES_TABLE_SQL = [
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS id BIGSERIAL;",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS affinity_id UUID;",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS music_track_id UUID;",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS user_scope TEXT NOT NULL DEFAULT 'user';",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS actor_key TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'user';",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS actor_display_name TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS reaction TEXT NOT NULL DEFAULT 'neutral';",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
  "ALTER TABLE music_track_affinities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
];

const ALTER_MUSIC_PLAYLISTS_TABLE_SQL = [
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS id BIGSERIAL;",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS music_playlist_id UUID;",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS user_scope TEXT NOT NULL DEFAULT 'user';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS spotify_playlist_id TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS spotify_uri TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS spotify_url TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ai_curated';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS prompt TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS created_by_actor_key TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS created_by_actor_type TEXT NOT NULL DEFAULT 'ai';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS created_by_display_name TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS track_count INTEGER NOT NULL DEFAULT 0;",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS discovery_track_count INTEGER NOT NULL DEFAULT 0;",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS cover_image_id TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS spotify_cover_url TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS user_note TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
  "ALTER TABLE music_playlists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
];

const ALTER_MUSIC_PLAYLIST_TRACKS_TABLE_SQL = [
  "ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS id BIGSERIAL;",
  "ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS music_playlist_id UUID;",
  "ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS music_track_id UUID;",
  "ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS spotify_track_id TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;",
  "ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
  "ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
  "ALTER TABLE music_playlist_tracks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();",
];

const MUSIC_SCHEMA_BACKFILL_SQL = [
  "UPDATE music_tracks SET updated_at = COALESCE(updated_at, created_at, NOW()), created_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL OR created_at IS NULL;",
  "UPDATE music_track_affinities SET updated_at = COALESCE(updated_at, created_at, NOW()), created_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL OR created_at IS NULL;",
  "UPDATE music_playlists SET updated_at = COALESCE(updated_at, created_at, NOW()), created_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL OR created_at IS NULL;",
  "UPDATE music_playlist_tracks SET updated_at = COALESCE(updated_at, created_at, added_at, NOW()), created_at = COALESCE(created_at, added_at, NOW()), added_at = COALESCE(added_at, created_at, NOW()) WHERE updated_at IS NULL OR created_at IS NULL OR added_at IS NULL;",
];

function normalizeText(value = "", { maxLength = 0 } = {}) {
  const normalized = String(value || "").trim();
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function normalizeUserScope(value = "user") {
  return normalizeText(value) || "user";
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

function normalizeTimestamp(value, fallbackValue = null) {
  if (!value) {
    return fallbackValue;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp value "${value}".`);
  }

  return date.toISOString();
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeArtists(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((artist) => {
      if (typeof artist === "string") {
        const name = normalizeText(artist, { maxLength: 240 });
        return name ? { name, spotifyId: "", uri: "" } : null;
      }

      if (!artist || typeof artist !== "object") {
        return null;
      }

      const name = normalizeText(artist.name, { maxLength: 240 });
      if (!name) {
        return null;
      }

      return {
        name,
        spotifyId: normalizeText(artist.spotifyId || artist.spotify_id || artist.id || extractSpotifyArtistId(artist), { maxLength: 120 }),
        uri: normalizeText(artist.uri, { maxLength: 240 }),
        genres: normalizeTags(artist.genres || []),
      };
    })
    .filter(Boolean);
}

function extractSpotifyArtistId(artist = {}) {
  const uriMatch = normalizeText(artist.uri).match(/^spotify:artist:([^:]+)$/);
  if (uriMatch?.[1]) {
    return uriMatch[1];
  }

  const hrefMatch = normalizeText(artist.href || artist.external_urls?.spotify || artist.externalUrls?.spotify)
    .match(/\/artist\/([^/?#]+)/);
  return hrefMatch?.[1] || "";
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .map((tag) => normalizeText(tag, { maxLength: 48 }).toLowerCase())
    .filter(Boolean)))
    .slice(0, 20);
}

function normalizeMusicBrainzStatus(value = "pending") {
  const normalized = normalizeText(value, { maxLength: 40 }).toLowerCase();
  return ["pending", "matched", "no_match", "failed", "rate_limited"].includes(normalized)
    ? normalized
    : "pending";
}

function normalizeNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeReleaseDate(value = "") {
  const normalized = normalizeText(value, { maxLength: 20 });
  return /^\d{4}(-\d{2}){0,2}$/.test(normalized) ? normalized : "";
}

function deriveReleaseYear(value = "") {
  const normalized = normalizeReleaseDate(value);
  const year = Number.parseInt(normalized.slice(0, 4), 10);
  return Number.isFinite(year) && year > 0 ? year : null;
}

function slugifyActorName(value = "", fallback = "ghostlight") {
  const slug = normalizeText(value, { maxLength: 80 })
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function buildMusicActorKey({ actor = "user", userScope = "user", personaName = "Ghostlight" } = {}) {
  const actorType = normalizeText(actor).toLowerCase() === "ai" ? "ai" : "user";

  if (actorType === "ai") {
    return `ai:${slugifyActorName(personaName, "ghostlight")}`;
  }

  return `user:${normalizeUserScope(userScope)}`;
}

function resolveMusicActor({ actor = "user", userScope = "user", personaName = "Ghostlight", displayName = "" } = {}) {
  const actorType = normalizeText(actor).toLowerCase() === "ai" ? "ai" : "user";
  const fallbackDisplayName = actorType === "ai"
    ? normalizeText(personaName) || "Ghostlight"
    : normalizeUserScope(userScope);

  return {
    actorType,
    actorKey: buildMusicActorKey({ actor: actorType, userScope, personaName }),
    actorDisplayName: normalizeText(displayName) || fallbackDisplayName,
  };
}

function normalizeSpotifyTrackRecord(record = {}, defaults = {}) {
  const spotifyTrackId = normalizeText(extractSpotifyTrackId(record.spotifyTrackId || record.spotify_track_id || record.id || record.spotifyUri || record.spotify_uri || record.uri), { maxLength: 120 });
  const spotifyUri = normalizeText(record.spotifyUri || record.spotify_uri || record.uri, { maxLength: 240 });
  const title = normalizeText(record.title || record.name, { maxLength: 500 });
  const artists = normalizeArtists(record.artists);
  const artistGenres = normalizeTags(record.artistGenres || record.artist_genres || artists.flatMap((artist) => artist.genres || []));

  if (!spotifyTrackId) {
    throw new Error("Spotify track ID is required.");
  }

  if (!spotifyUri) {
    throw new Error("Spotify track URI is required.");
  }

  if (!title) {
    throw new Error("Track title is required.");
  }

  return {
    musicTrackId: normalizeText(record.musicTrackId || record.music_track_id, { maxLength: 120 }) || crypto.randomUUID(),
    userScope: normalizeUserScope(record.userScope || record.user_scope || defaults.userScope),
    spotifyTrackId,
    spotifyUri,
    spotifyUrl: normalizeText(record.spotifyUrl || record.spotify_url || record.externalUrl || record.external_url, { maxLength: 500 }),
    title,
    artists,
    albumName: normalizeText(record.albumName || record.album_name || record.album, { maxLength: 500 }),
    albumReleaseDate: normalizeReleaseDate(record.albumReleaseDate || record.album_release_date || record.releaseDate || record.release_date),
    albumReleaseDatePrecision: normalizeText(record.albumReleaseDatePrecision || record.album_release_date_precision || record.releaseDatePrecision || record.release_date_precision, { maxLength: 20 }),
    releaseYear: deriveReleaseYear(record.releaseYear || record.release_year || record.albumReleaseDate || record.album_release_date || record.releaseDate || record.release_date),
    artistGenres,
    genreFamilies: normalizeTags(record.genreFamilies || record.genre_families),
    userGenres: normalizeTags(record.userGenres || record.user_genres),
    musicBrainzRecordingId: normalizeText(record.musicBrainzRecordingId || record.musicbrainz_recording_id, { maxLength: 120 }),
    musicBrainzReleaseId: normalizeText(record.musicBrainzReleaseId || record.musicbrainz_release_id, { maxLength: 120 }),
    musicBrainzReleaseGroupId: normalizeText(record.musicBrainzReleaseGroupId || record.musicbrainz_release_group_id, { maxLength: 120 }),
    musicBrainzMatchConfidence: normalizeNullableNumber(record.musicBrainzMatchConfidence ?? record.musicbrainz_match_confidence),
    musicBrainzTags: normalizeTags(record.musicBrainzTags || record.musicbrainz_tags),
    musicBrainzEnrichmentStatus: normalizeMusicBrainzStatus(record.musicBrainzEnrichmentStatus || record.musicbrainz_enrichment_status || defaults.musicBrainzEnrichmentStatus || "pending"),
    musicBrainzLastError: normalizeText(record.musicBrainzLastError || record.musicbrainz_last_error, { maxLength: 1000 }),
    musicBrainzEnrichedAt: normalizeTimestamp(record.musicBrainzEnrichedAt || record.musicbrainz_enriched_at, null),
    musicBrainzNextFetchAfter: normalizeTimestamp(record.musicBrainzNextFetchAfter || record.musicbrainz_next_fetch_after, null),
    embeddingDirtyAt: normalizeTimestamp(record.embeddingDirtyAt || record.embedding_dirty_at, null),
    durationMs: Math.max(0, Number.parseInt(String(record.durationMs || record.duration_ms || 0), 10) || 0),
    explicit: normalizeBoolean(record.explicit, false),
    likedAt: normalizeTimestamp(record.likedAt || record.liked_at || record.addedAt || record.added_at, null),
    source: normalizeText(record.source || defaults.source || "spotify_liked", { maxLength: 80 }) || "spotify_liked",
    active: normalizeBoolean(record.active, defaults.active ?? true),
    importedAt: normalizeTimestamp(record.importedAt || record.imported_at || defaults.importedAt, new Date().toISOString()),
    syncedAt: normalizeTimestamp(record.syncedAt || record.synced_at, null),
  };
}

function normalizeAffinityRecord(record = {}, defaults = {}) {
  const userScope = normalizeUserScope(record.userScope || record.user_scope || defaults.userScope);
  const resolvedActor = record.actorKey || record.actor_key
    ? {
      actorKey: normalizeText(record.actorKey || record.actor_key, { maxLength: 160 }),
      actorType: normalizeText(record.actorType || record.actor_type || defaults.actorType || "user").toLowerCase() === "ai" ? "ai" : "user",
      actorDisplayName: normalizeText(record.actorDisplayName || record.actor_display_name || defaults.actorDisplayName, { maxLength: 160 }),
    }
    : resolveMusicActor({
      actor: record.actor || defaults.actor || "user",
      userScope,
      personaName: record.personaName || defaults.personaName || "Ghostlight",
      displayName: record.actorDisplayName || record.actor_display_name || defaults.actorDisplayName,
    });
  const reaction = normalizeText(record.reaction || defaults.reaction || "neutral").toLowerCase();

  if (!SUPPORTED_MUSIC_REACTIONS.includes(reaction)) {
    throw new Error(`Unsupported music reaction "${reaction}". Expected one of: ${SUPPORTED_MUSIC_REACTIONS.join(", ")}.`);
  }

  const musicTrackId = normalizeText(record.musicTrackId || record.music_track_id || defaults.musicTrackId, { maxLength: 120 });

  if (!musicTrackId) {
    throw new Error("Music track ID is required.");
  }

  return {
    affinityId: normalizeText(record.affinityId || record.affinity_id, { maxLength: 120 }) || crypto.randomUUID(),
    musicTrackId,
    userScope,
    actorKey: resolvedActor.actorKey,
    actorType: resolvedActor.actorType,
    actorDisplayName: resolvedActor.actorDisplayName || resolvedActor.actorKey,
    reaction,
    tags: normalizeTags(record.tags),
    note: normalizeText(record.note || record.notes, { maxLength: 1200 }),
  };
}

function normalizeMusicPlaylistRecord(record = {}, defaults = {}) {
  const spotifyPlaylistId = normalizeText(record.spotifyPlaylistId || record.spotify_playlist_id || record.id, { maxLength: 160 });
  const name = normalizeText(record.name || record.playlistName || record.playlist_name, { maxLength: 300 });

  if (!spotifyPlaylistId) {
    throw new Error("Spotify playlist ID is required.");
  }

  if (!name) {
    throw new Error("Playlist name is required.");
  }

  return {
    musicPlaylistId: normalizeText(record.musicPlaylistId || record.music_playlist_id, { maxLength: 120 }) || crypto.randomUUID(),
    userScope: normalizeUserScope(record.userScope || record.user_scope || defaults.userScope),
    spotifyPlaylistId,
    spotifyUri: normalizeText(record.spotifyUri || record.spotify_uri || record.uri, { maxLength: 240 }),
    spotifyUrl: normalizeText(record.spotifyUrl || record.spotify_url || record.externalUrl || record.external_url, { maxLength: 500 }),
    name,
    description: normalizeText(record.description, { maxLength: 500 }),
    source: normalizeText(record.source || defaults.source || "ai_curated", { maxLength: 80 }) || "ai_curated",
    prompt: normalizeText(record.prompt, { maxLength: 1000 }),
    createdByActorKey: normalizeText(record.createdByActorKey || record.created_by_actor_key, { maxLength: 160 }),
    createdByActorType: normalizeText(record.createdByActorType || record.created_by_actor_type || "ai", { maxLength: 40 }) || "ai",
    createdByDisplayName: normalizeText(record.createdByDisplayName || record.created_by_display_name, { maxLength: 160 }),
    trackCount: Math.max(0, Number.parseInt(String(record.trackCount || record.track_count || 0), 10) || 0),
    discoveryTrackCount: Math.max(0, Number.parseInt(String(record.discoveryTrackCount || record.discovery_track_count || 0), 10) || 0),
    coverImageId: normalizeText(record.coverImageId || record.cover_image_id, { maxLength: 160 }),
    spotifyCoverUrl: normalizeText(record.spotifyCoverUrl || record.spotify_cover_url, { maxLength: 1000 }),
    isFavorite: normalizeBoolean(record.isFavorite ?? record.is_favorite, false),
    userNote: normalizeText(record.userNote || record.user_note, { maxLength: 1000 }),
    tags: normalizeTags(record.tags),
  };
}

function normalizeMusicPlaylistTrackRecord(record = {}, defaults = {}) {
  const musicPlaylistId = normalizeText(record.musicPlaylistId || record.music_playlist_id || defaults.musicPlaylistId, { maxLength: 120 });
  const musicTrackId = normalizeText(record.musicTrackId || record.music_track_id, { maxLength: 120 });
  const spotifyTrackId = normalizeText(record.spotifyTrackId || record.spotify_track_id, { maxLength: 120 });

  if (!musicPlaylistId) {
    throw new Error("Music playlist ID is required.");
  }

  if (!musicTrackId) {
    throw new Error("Music track ID is required.");
  }

  if (!spotifyTrackId) {
    throw new Error("Spotify track ID is required.");
  }

  return {
    musicPlaylistId,
    musicTrackId,
    spotifyTrackId,
    position: Math.max(0, Number.parseInt(String(record.position || 0), 10) || 0),
    source: normalizeText(record.source || defaults.source, { maxLength: 80 }),
  };
}

function mapSpotifyConnectionRow(row) {
  if (!row) {
    return null;
  }

  return {
    userScope: row.user_scope,
    spotifyUserId: row.spotify_user_id,
    spotifyDisplayName: row.spotify_display_name,
    refreshToken: row.refresh_token,
    accessToken: row.access_token || '',
    tokenExpiresAt: row.token_expires_at || null,
    scope: row.scope,
    oauthState: row.oauth_state,
    oauthStateCreatedAt: row.oauth_state_created_at,
    connectedAt: row.connected_at,
    lastImportAt: row.last_import_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrackRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    musicTrackId: row.music_track_id,
    userScope: row.user_scope,
    spotifyTrackId: row.spotify_track_id,
    spotifyUri: row.spotify_uri,
    spotifyUrl: row.spotify_url,
    title: row.title,
    artists: Array.isArray(row.artists) ? row.artists : [],
    albumName: row.album_name,
    albumReleaseDate: row.album_release_date,
    albumReleaseDatePrecision: row.album_release_date_precision,
    releaseYear: row.release_year === null || row.release_year === undefined ? null : Number(row.release_year),
    artistGenres: Array.isArray(row.artist_genres) ? row.artist_genres : [],
    genreFamilies: Array.isArray(row.genre_families) ? row.genre_families : [],
    userGenres: Array.isArray(row.user_genres) ? row.user_genres : [],
    musicBrainzRecordingId: row.musicbrainz_recording_id || "",
    musicBrainzReleaseId: row.musicbrainz_release_id || "",
    musicBrainzReleaseGroupId: row.musicbrainz_release_group_id || "",
    musicBrainzMatchConfidence: row.musicbrainz_match_confidence === null || row.musicbrainz_match_confidence === undefined
      ? null
      : Number(row.musicbrainz_match_confidence),
    musicBrainzTags: Array.isArray(row.musicbrainz_tags) ? row.musicbrainz_tags : [],
    musicBrainzEnrichmentStatus: row.musicbrainz_enrichment_status || "",
    musicBrainzLastError: row.musicbrainz_last_error || "",
    musicBrainzEnrichedAt: row.musicbrainz_enriched_at || null,
    musicBrainzNextFetchAfter: row.musicbrainz_next_fetch_after || null,
    embeddingDirtyAt: row.embedding_dirty_at || null,
    durationMs: Number(row.duration_ms || 0),
    explicit: Boolean(row.explicit),
    likedAt: row.liked_at,
    source: row.source,
    active: Boolean(row.active),
    importedAt: row.imported_at,
    syncedAt: row.synced_at,
    affinityUpdatedAt: row.affinity_updated_at || null,
    userAffinityReaction: row.user_affinity_reaction || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAffinityRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    affinityId: row.affinity_id,
    musicTrackId: row.music_track_id,
    userScope: row.user_scope,
    actorKey: row.actor_key,
    actorType: row.actor_type,
    actorDisplayName: row.actor_display_name,
    reaction: row.reaction,
    tags: Array.isArray(row.tags) ? row.tags : [],
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlaylistRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    musicPlaylistId: row.music_playlist_id,
    userScope: row.user_scope,
    spotifyPlaylistId: row.spotify_playlist_id,
    spotifyUri: row.spotify_uri,
    spotifyUrl: row.spotify_url,
    name: row.name,
    description: row.description,
    source: row.source,
    prompt: row.prompt,
    createdByActorKey: row.created_by_actor_key,
    createdByActorType: row.created_by_actor_type,
    createdByDisplayName: row.created_by_display_name,
    trackCount: Number(row.track_count || 0),
    discoveryTrackCount: Number(row.discovery_track_count || 0),
    coverImageId: row.cover_image_id,
    spotifyCoverUrl: row.spotify_cover_url || "",
    isFavorite: Boolean(row.is_favorite),
    userNote: row.user_note || "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlaylistTrackRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    musicPlaylistId: row.music_playlist_id,
    musicTrackId: row.music_track_id,
    spotifyTrackId: row.spotify_track_id,
    position: Number(row.position || 0),
    source: row.source,
    title: row.track_title || "",
    artists: Array.isArray(row.track_artists) ? row.track_artists : [],
    addedAt: row.added_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildMusicTrackOrderClause(sort = "updated", direction = "desc") {
  const normalizedDirection = String(direction || "").trim().toLowerCase() === "asc" ? "ASC" : "DESC";
  const normalizedSort = String(sort || "").trim().toLowerCase();

  if (normalizedSort === "title") {
    return `LOWER(title) ${normalizedDirection}, updated_at DESC`;
  }

  if (normalizedSort === "artist") {
    return `LOWER(COALESCE(artists->0->>'name', '')) ${normalizedDirection}, LOWER(title) ASC, updated_at DESC`;
  }

  if (normalizedSort === "reaction") {
    return `user_affinity_reaction ${normalizedDirection} NULLS LAST, LOWER(title) ASC`;
  }

  return `COALESCE(affinity_updated_at, updated_at) ${normalizedDirection}, updated_at DESC`;
}

function createNoopMusicStore({ logger }) {
  return {
    persistenceEnabled: false,
    async init() {
      logger.warn("[music] DATABASE_URL is not set; music persistence is disabled.");
    },
    async getSpotifyConnection() {
      return null;
    },
    async saveSpotifyOAuthState() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async upsertSpotifyConnection() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async markSpotifyImportComplete() {
      return null;
    },
    async upsertTrack() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async getTrackById() {
      return null;
    },
    async getTrackBySpotifyId() {
      return null;
    },
    async listTracks() {
      return [];
    },
    async countTracks() {
      return 0;
    },
    async listDistinctTrackTags() {
      return [];
    },
    async exportLibrary() {
      return {
        tracks: [],
        affinities: [],
        playlists: [],
        playlistTracks: [],
      };
    },
    async deleteUnprofiledTracks() {
      return {
        deletedCount: 0,
        deletedTrackIds: [],
      };
    },
    async deleteTrack() {
      return {
        deletedCount: 0,
        deletedTrackIds: [],
        track: null,
      };
    },
    async resetLibrary() {
      return {
        deletedTrackCount: 0,
        deletedAffinityCount: 0,
        deletedPlaylistCount: 0,
        deletedTrackIds: [],
        deletedPlaylistIds: [],
      };
    },
    async listExistingSpotifyTrackIds() {
      return [];
    },
    async upsertAffinity() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async updateTrackUserGenres() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async getMusicBrainzWorkStatus() {
      return {
        pendingTrackCount: 0,
        dirtyTrackCount: 0,
      };
    },
    async getNextMusicBrainzTrackToEnrich() {
      return null;
    },
    async saveMusicBrainzEnrichment() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async listDirtyMusicTracks() {
      return [];
    },
    async listAffinitiesForTrackIds() {
      return [];
    },
    async upsertPlaylist() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async replacePlaylistTracks() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async appendPlaylistTracks() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async getPlaylistBySpotifyId() {
      return null;
    },
    async listPlaylistTracks() {
      return [];
    },
    async listPlaylists() {
      return [];
    },
    async listDistinctPlaylistTags() {
      return [];
    },
    async updatePlaylistProfile() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async updatePlaylistFavorite() {
      throw new Error("Music store is disabled because DATABASE_URL is not set.");
    },
    async deletePlaylist() {
      return {
        deletedCount: 0,
        deletedPlaylistIds: [],
        playlist: null,
      };
    },
    async countPlaylists() {
      return 0;
    },
    async markTracksSynced() {
      return 0;
    },
    async close() {},
  };
}

function createMusicStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopMusicStore({ logger });
  }

  return {
    persistenceEnabled: true,

    async init() {
      await pool.query(CREATE_SPOTIFY_CONNECTIONS_TABLE_SQL);
      for (const statement of ALTER_SPOTIFY_CONNECTIONS_TABLE_SQL) {
        await pool.query(statement);
      }

      await pool.query(CREATE_MUSIC_TRACKS_TABLE_SQL);
      for (const statement of ALTER_MUSIC_TRACKS_TABLE_SQL) {
        await pool.query(statement);
      }
      await pool.query(CREATE_MUSIC_TRACK_AFFINITIES_TABLE_SQL);
      for (const statement of ALTER_MUSIC_TRACK_AFFINITIES_TABLE_SQL) {
        await pool.query(statement);
      }
      await pool.query(CREATE_MUSIC_PLAYLISTS_TABLE_SQL);
      for (const statement of ALTER_MUSIC_PLAYLISTS_TABLE_SQL) {
        await pool.query(statement);
      }
      await pool.query(CREATE_MUSIC_PLAYLIST_TRACKS_TABLE_SQL);
      for (const statement of ALTER_MUSIC_PLAYLIST_TRACKS_TABLE_SQL) {
        await pool.query(statement);
      }
      for (const statement of MUSIC_SCHEMA_BACKFILL_SQL) {
        await pool.query(statement);
      }
      for (const statement of CREATE_MUSIC_INDEXES_SQL) {
        await pool.query(statement);
      }

      logger.info?.("[db:migration] music schema ensured", {
        tables: MUSIC_SCHEMA_TABLES,
      });
      logger.debug?.("[music] Music store ready", {
        provider: "postgres",
      });
    },

    async saveSpotifyOAuthState({ userScope, state }) {
      const normalizedUserScope = normalizeUserScope(userScope);
      const normalizedState = normalizeText(state, { maxLength: 240 });

      if (!normalizedState) {
        throw new Error("Spotify OAuth state is required.");
      }

      const { rows } = await pool.query(
        `
          INSERT INTO music_spotify_connections (
            user_scope,
            oauth_state,
            oauth_state_created_at,
            updated_at
          )
          VALUES ($1, $2, NOW(), NOW())
          ON CONFLICT (user_scope)
          DO UPDATE SET
            oauth_state = EXCLUDED.oauth_state,
            oauth_state_created_at = EXCLUDED.oauth_state_created_at,
            updated_at = NOW()
          RETURNING *
        `,
        [normalizedUserScope, normalizedState],
      );

      return mapSpotifyConnectionRow(rows[0]);
    },

    async getSpotifyConnection({ userScope }) {
      const { rows } = await pool.query(
        `
          SELECT *
          FROM music_spotify_connections
          WHERE user_scope = $1
          LIMIT 1
        `,
        [normalizeUserScope(userScope)],
      );

      return mapSpotifyConnectionRow(rows[0]);
    },

    async upsertSpotifyConnection(record = {}) {
      const normalizedUserScope = normalizeUserScope(record.userScope || record.user_scope);
      const { rows } = await pool.query(
        `
          INSERT INTO music_spotify_connections (
            user_scope,
            spotify_user_id,
            spotify_display_name,
            refresh_token,
            access_token,
            token_expires_at,
            scope,
            oauth_state,
            oauth_state_created_at,
            connected_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, '', NULL, NOW(), NOW())
          ON CONFLICT (user_scope)
          DO UPDATE SET
            spotify_user_id = EXCLUDED.spotify_user_id,
            spotify_display_name = EXCLUDED.spotify_display_name,
            refresh_token = COALESCE(NULLIF(EXCLUDED.refresh_token, ''), music_spotify_connections.refresh_token),
            access_token = EXCLUDED.access_token,
            token_expires_at = EXCLUDED.token_expires_at,
            scope = EXCLUDED.scope,
            oauth_state = '',
            oauth_state_created_at = NULL,
            connected_at = COALESCE(music_spotify_connections.connected_at, NOW()),
            updated_at = NOW()
          RETURNING *
        `,
        [
          normalizedUserScope,
          normalizeText(record.spotifyUserId || record.spotify_user_id, { maxLength: 240 }),
          normalizeText(record.spotifyDisplayName || record.spotify_display_name, { maxLength: 500 }),
          normalizeText(record.refreshToken || record.refresh_token),
          normalizeText(record.accessToken || record.access_token),
          normalizeTimestamp(record.tokenExpiresAt || record.token_expires_at, null),
          normalizeText(record.scope, { maxLength: 1000 }),
        ],
      );

      return mapSpotifyConnectionRow(rows[0]);
    },

    async markSpotifyImportComplete({ userScope, importedAt = new Date().toISOString() } = {}) {
      const { rows } = await pool.query(
        `
          UPDATE music_spotify_connections
          SET last_import_at = $2,
              updated_at = NOW()
          WHERE user_scope = $1
          RETURNING *
        `,
        [normalizeUserScope(userScope), normalizeTimestamp(importedAt, new Date().toISOString())],
      );

      return mapSpotifyConnectionRow(rows[0]);
    },

    async upsertTrack(record = {}, defaults = {}) {
      const normalized = normalizeSpotifyTrackRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO music_tracks (
            music_track_id,
            user_scope,
            spotify_track_id,
            spotify_uri,
            spotify_url,
            title,
            artists,
            album_name,
            album_release_date,
            album_release_date_precision,
            release_year,
            artist_genres,
            genre_families,
            user_genres,
            musicbrainz_recording_id,
            musicbrainz_release_id,
            musicbrainz_release_group_id,
            musicbrainz_match_confidence,
            musicbrainz_tags,
            musicbrainz_enrichment_status,
            musicbrainz_last_error,
            musicbrainz_enriched_at,
            musicbrainz_next_fetch_after,
            embedding_dirty_at,
            duration_ms,
            explicit,
            liked_at,
            source,
            active,
            imported_at,
            synced_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17, $18::real, $19::jsonb, $20, $21, $22::timestamptz, $23::timestamptz, $24::timestamptz, $25, $26, $27, $28, $29, $30, $31, NOW())
          ON CONFLICT (user_scope, spotify_track_id)
          DO UPDATE SET
            spotify_uri = EXCLUDED.spotify_uri,
            spotify_url = COALESCE(NULLIF(EXCLUDED.spotify_url, ''), music_tracks.spotify_url),
            title = EXCLUDED.title,
            artists = CASE
              WHEN EXISTS (
                SELECT 1
                FROM jsonb_array_elements(music_tracks.artists) AS existing_artist(value)
                WHERE COALESCE(existing_artist.value->>'spotifyId', existing_artist.value->>'spotify_id', existing_artist.value->>'id', '') <> ''
              ) AND NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(EXCLUDED.artists) AS incoming_artist(value)
                WHERE COALESCE(incoming_artist.value->>'spotifyId', incoming_artist.value->>'spotify_id', incoming_artist.value->>'id', '') <> ''
              ) THEN music_tracks.artists
              ELSE EXCLUDED.artists
            END,
            album_name = COALESCE(NULLIF(EXCLUDED.album_name, ''), music_tracks.album_name),
            album_release_date = COALESCE(NULLIF(EXCLUDED.album_release_date, ''), music_tracks.album_release_date),
            album_release_date_precision = COALESCE(NULLIF(EXCLUDED.album_release_date_precision, ''), music_tracks.album_release_date_precision),
            release_year = COALESCE(EXCLUDED.release_year, music_tracks.release_year),
            artist_genres = CASE
              WHEN jsonb_array_length(music_tracks.artist_genres) > 0 AND jsonb_array_length(EXCLUDED.artist_genres) = 0 THEN music_tracks.artist_genres
              ELSE EXCLUDED.artist_genres
            END,
            genre_families = CASE
              WHEN jsonb_array_length(music_tracks.genre_families) > 0 AND jsonb_array_length(EXCLUDED.genre_families) = 0 THEN music_tracks.genre_families
              ELSE EXCLUDED.genre_families
            END,
            user_genres = CASE
              WHEN jsonb_array_length(music_tracks.user_genres) > 0 AND jsonb_array_length(EXCLUDED.user_genres) = 0 THEN music_tracks.user_genres
              ELSE EXCLUDED.user_genres
            END,
            musicbrainz_recording_id = COALESCE(NULLIF(EXCLUDED.musicbrainz_recording_id, ''), music_tracks.musicbrainz_recording_id),
            musicbrainz_release_id = COALESCE(NULLIF(EXCLUDED.musicbrainz_release_id, ''), music_tracks.musicbrainz_release_id),
            musicbrainz_release_group_id = COALESCE(NULLIF(EXCLUDED.musicbrainz_release_group_id, ''), music_tracks.musicbrainz_release_group_id),
            musicbrainz_match_confidence = COALESCE(EXCLUDED.musicbrainz_match_confidence, music_tracks.musicbrainz_match_confidence),
            musicbrainz_tags = CASE
              WHEN jsonb_array_length(music_tracks.musicbrainz_tags) > 0 AND jsonb_array_length(EXCLUDED.musicbrainz_tags) = 0 THEN music_tracks.musicbrainz_tags
              ELSE EXCLUDED.musicbrainz_tags
            END,
            musicbrainz_enrichment_status = CASE
              WHEN music_tracks.musicbrainz_enrichment_status IN ('matched', 'no_match')
                AND EXCLUDED.musicbrainz_enrichment_status = 'pending'
                THEN music_tracks.musicbrainz_enrichment_status
              ELSE EXCLUDED.musicbrainz_enrichment_status
            END,
            musicbrainz_last_error = CASE
              WHEN EXCLUDED.musicbrainz_last_error = '' THEN music_tracks.musicbrainz_last_error
              ELSE EXCLUDED.musicbrainz_last_error
            END,
            musicbrainz_enriched_at = COALESCE(EXCLUDED.musicbrainz_enriched_at, music_tracks.musicbrainz_enriched_at),
            musicbrainz_next_fetch_after = COALESCE(EXCLUDED.musicbrainz_next_fetch_after, music_tracks.musicbrainz_next_fetch_after),
            embedding_dirty_at = COALESCE(music_tracks.embedding_dirty_at, EXCLUDED.embedding_dirty_at),
            duration_ms = CASE
              WHEN EXCLUDED.duration_ms = 0 AND music_tracks.duration_ms > 0 THEN music_tracks.duration_ms
              ELSE EXCLUDED.duration_ms
            END,
            explicit = EXCLUDED.explicit,
            liked_at = COALESCE(EXCLUDED.liked_at, music_tracks.liked_at),
            source = CASE
              WHEN music_tracks.source = 'spotify_liked' THEN music_tracks.source
              WHEN music_tracks.source = 'spotify_playlist' AND EXCLUDED.source = 'spotify_ai_playlist' THEN music_tracks.source
              WHEN music_tracks.source = 'spotify_ai_playlist' AND EXCLUDED.source = 'spotify_playlist' THEN music_tracks.source
              ELSE EXCLUDED.source
            END,
            active = EXCLUDED.active,
            imported_at = EXCLUDED.imported_at,
            updated_at = NOW()
          RETURNING *
        `,
        [
          normalized.musicTrackId,
          normalized.userScope,
          normalized.spotifyTrackId,
          normalized.spotifyUri,
          normalized.spotifyUrl,
          normalized.title,
          JSON.stringify(normalized.artists),
          normalized.albumName,
          normalized.albumReleaseDate,
          normalized.albumReleaseDatePrecision,
          normalized.releaseYear,
          JSON.stringify(normalized.artistGenres),
          JSON.stringify(normalized.genreFamilies),
          JSON.stringify(normalized.userGenres),
          normalized.musicBrainzRecordingId,
          normalized.musicBrainzReleaseId,
          normalized.musicBrainzReleaseGroupId,
          normalized.musicBrainzMatchConfidence,
          JSON.stringify(normalized.musicBrainzTags),
          normalized.musicBrainzEnrichmentStatus,
          normalized.musicBrainzLastError,
          normalized.musicBrainzEnrichedAt,
          normalized.musicBrainzNextFetchAfter,
          normalized.embeddingDirtyAt,
          normalized.durationMs,
          normalized.explicit,
          normalized.likedAt,
          normalized.source,
          normalized.active,
          normalized.importedAt,
          normalized.syncedAt,
        ],
      );

      return mapTrackRow(rows[0]);
    },

    async getTrackById(musicTrackId, { userScope } = {}) {
      const values = [normalizeText(musicTrackId, { maxLength: 120 })];
      const clauses = ["music_track_id = $1"];

      if (!values[0]) {
        return null;
      }

      if (userScope) {
        values.push(normalizeUserScope(userScope));
        clauses.push(`user_scope = $${values.length}`);
      }

      const { rows } = await pool.query(
        `SELECT * FROM music_tracks WHERE ${clauses.join(" AND ")} LIMIT 1`,
        values,
      );

      return mapTrackRow(rows[0]);
    },

    async getTrackBySpotifyId(spotifyTrackId, { userScope } = {}) {
      const normalizedId = normalizeText(extractSpotifyTrackId(spotifyTrackId), { maxLength: 120 });
      const normalizedUri = normalizedId ? `spotify:track:${normalizedId}` : "";
      const values = [normalizedId, normalizedUri];
      const clauses = ["(spotify_track_id = $1 OR spotify_track_id = $2 OR spotify_uri = $2)"];

      if (!normalizedId) {
        return null;
      }

      if (userScope) {
        values.push(normalizeUserScope(userScope));
        clauses.push(`user_scope = $${values.length}`);
      }

      const { rows } = await pool.query(
        `SELECT * FROM music_tracks WHERE ${clauses.join(" AND ")} LIMIT 1`,
        values,
      );

      return mapTrackRow(rows[0]);
    },

    async listTracks({ userScope, limit = 100, offset = 0, activeOnly = true, q = "", source = "", tags = [], hasAffinitiesOnly = false, sort = "updated", direction = "desc" } = {}) {
      const normalizedUserScope = normalizeUserScope(userScope);
      const values = [normalizedUserScope, Math.max(1, Math.min(Number(limit) || 100, 5000)), Math.max(0, Number(offset) || 0)];
      const clauses = ["user_scope = $1"];
      const normalizedQuery = normalizeText(q, { maxLength: 240 }).toLowerCase();
      const normalizedSource = normalizeText(source, { maxLength: 80 });
      const normalizedTags = normalizeTags(tags);
      values.push(buildMusicActorKey({ actor: "user", userScope: normalizedUserScope }));
      const userActorKeyIndex = values.length;
      const orderClause = buildMusicTrackOrderClause(sort, direction);

      if (activeOnly) {
        clauses.push("active = TRUE");
      }

      if (hasAffinitiesOnly) {
        clauses.push("EXISTS (SELECT 1 FROM music_track_affinities WHERE music_track_affinities.music_track_id = music_tracks.music_track_id)");
      }

      if (normalizedSource) {
        values.push(normalizedSource);
        clauses.push(`source = $${values.length}`);
      }

      if (normalizedTags.length) {
        values.push(JSON.stringify(normalizedTags));
        clauses.push(`EXISTS (
          SELECT 1
          FROM music_track_affinities
          WHERE music_track_affinities.music_track_id = music_tracks.music_track_id
            AND music_track_affinities.tags @> $${values.length}::jsonb
        )`);
      }

      if (normalizedQuery) {
        values.push(`%${normalizedQuery}%`);
        clauses.push(`(
          LOWER(title) LIKE $${values.length}
          OR LOWER(album_name) LIKE $${values.length}
          OR LOWER(album_release_date) LIKE $${values.length}
          OR CAST(release_year AS TEXT) LIKE $${values.length}
          OR LOWER(spotify_track_id) LIKE $${values.length}
          OR LOWER(artists::text) LIKE $${values.length}
          OR LOWER(artist_genres::text) LIKE $${values.length}
          OR LOWER(genre_families::text) LIKE $${values.length}
          OR LOWER(musicbrainz_tags::text) LIKE $${values.length}
        )`);
      }

      const { rows } = await pool.query(
        `
          WITH track_rows AS (
            SELECT music_tracks.*,
                   (
                     SELECT MAX(updated_at)
                     FROM music_track_affinities
                     WHERE music_track_affinities.music_track_id = music_tracks.music_track_id
                   ) AS affinity_updated_at,
                   (
                     SELECT reaction
                     FROM music_track_affinities
                     WHERE music_track_affinities.music_track_id = music_tracks.music_track_id
                       AND music_track_affinities.actor_key = $${userActorKeyIndex}
                     LIMIT 1
                   ) AS user_affinity_reaction
            FROM music_tracks
            WHERE ${clauses.join(" AND ")}
          )
          SELECT *
          FROM track_rows
          ORDER BY ${orderClause}
          LIMIT $2 OFFSET $3
        `,
        values,
      );

      return rows.map(mapTrackRow);
    },

    async countTracks({ userScope, activeOnly = true, q = "", source = "", tags = [], hasAffinitiesOnly = false } = {}) {
      const normalizedUserScope = normalizeUserScope(userScope);
      const values = [normalizedUserScope];
      const clauses = ["user_scope = $1"];
      const normalizedQuery = normalizeText(q, { maxLength: 240 }).toLowerCase();
      const normalizedSource = normalizeText(source, { maxLength: 80 });
      const normalizedTags = normalizeTags(tags);

      if (activeOnly) {
        clauses.push("active = TRUE");
      }

      if (hasAffinitiesOnly) {
        clauses.push("EXISTS (SELECT 1 FROM music_track_affinities WHERE music_track_affinities.music_track_id = music_tracks.music_track_id)");
      }

      if (normalizedSource) {
        values.push(normalizedSource);
        clauses.push(`source = $${values.length}`);
      }

      if (normalizedTags.length) {
        values.push(JSON.stringify(normalizedTags));
        clauses.push(`EXISTS (
          SELECT 1
          FROM music_track_affinities
          WHERE music_track_affinities.music_track_id = music_tracks.music_track_id
            AND music_track_affinities.tags @> $${values.length}::jsonb
        )`);
      }

      if (normalizedQuery) {
        values.push(`%${normalizedQuery}%`);
        clauses.push(`(
          LOWER(title) LIKE $${values.length}
          OR LOWER(album_name) LIKE $${values.length}
          OR LOWER(album_release_date) LIKE $${values.length}
          OR CAST(release_year AS TEXT) LIKE $${values.length}
          OR LOWER(spotify_track_id) LIKE $${values.length}
          OR LOWER(artists::text) LIKE $${values.length}
          OR LOWER(artist_genres::text) LIKE $${values.length}
          OR LOWER(genre_families::text) LIKE $${values.length}
          OR LOWER(musicbrainz_tags::text) LIKE $${values.length}
        )`);
      }

      const { rows } = await pool.query(
        `SELECT COUNT(*)::integer AS count FROM music_tracks WHERE ${clauses.join(" AND ")}`,
        values,
      );

      return Number(rows[0]?.count || 0);
    },

    async listDistinctTrackTags({ userScope } = {}) {
      const { rows } = await pool.query(
        `
          SELECT DISTINCT LOWER(TRIM(tag_value)) AS tag
          FROM music_track_affinities
          CROSS JOIN LATERAL jsonb_array_elements_text(tags) AS tag_value
          WHERE user_scope = $1
            AND TRIM(tag_value) <> ''
          ORDER BY tag ASC
          LIMIT 250
        `,
        [normalizeUserScope(userScope)],
      );

      return rows.map((row) => row.tag).filter(Boolean);
    },

    async exportLibrary({ userScope } = {}) {
      const normalizedUserScope = normalizeUserScope(userScope);
      const [
        trackRows,
        affinityRows,
        playlistRows,
        playlistTrackRows,
      ] = await Promise.all([
        pool.query(
          "SELECT * FROM music_tracks WHERE user_scope = $1 ORDER BY updated_at DESC",
          [normalizedUserScope],
        ),
        pool.query(
          "SELECT * FROM music_track_affinities WHERE user_scope = $1 ORDER BY updated_at DESC",
          [normalizedUserScope],
        ),
        pool.query(
          "SELECT * FROM music_playlists WHERE user_scope = $1 ORDER BY updated_at DESC",
          [normalizedUserScope],
        ),
        pool.query(
          `
            SELECT music_playlist_tracks.*
            FROM music_playlist_tracks
            INNER JOIN music_playlists
              ON music_playlists.music_playlist_id = music_playlist_tracks.music_playlist_id
            WHERE music_playlists.user_scope = $1
            ORDER BY music_playlist_tracks.music_playlist_id ASC, music_playlist_tracks.position ASC
          `,
          [normalizedUserScope],
        ),
      ]);

      return {
        tracks: trackRows.rows.map(mapTrackRow),
        affinities: affinityRows.rows.map(mapAffinityRow),
        playlists: playlistRows.rows.map(mapPlaylistRow),
        playlistTracks: playlistTrackRows.rows.map(mapPlaylistTrackRow),
      };
    },

    async deleteUnprofiledTracks({ userScope } = {}) {
      const normalizedUserScope = normalizeUserScope(userScope);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `
            DELETE FROM music_tracks
            WHERE user_scope = $1
              AND NOT EXISTS (
                SELECT 1
                FROM music_track_affinities
                WHERE music_track_affinities.music_track_id = music_tracks.music_track_id
              )
            RETURNING *
          `,
          [normalizedUserScope],
        );

        await client.query(
          `
            UPDATE music_playlists
            SET track_count = COALESCE((
                  SELECT COUNT(*)::integer
                  FROM music_playlist_tracks
                  WHERE music_playlist_tracks.music_playlist_id = music_playlists.music_playlist_id
                ), 0),
                updated_at = NOW()
            WHERE user_scope = $1
          `,
          [normalizedUserScope],
        );
        await client.query("COMMIT");

        const deletedTracks = rows.map(mapTrackRow);
        return {
          deletedCount: deletedTracks.length,
          deletedTrackIds: deletedTracks.map((track) => track.musicTrackId).filter(Boolean),
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteTrack({ userScope, musicTrackId } = {}) {
      const normalizedUserScope = normalizeUserScope(userScope);
      const normalizedTrackId = normalizeText(musicTrackId);

      if (!normalizedTrackId) {
        return {
          deletedCount: 0,
          deletedTrackIds: [],
          track: null,
        };
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `
            DELETE FROM music_tracks
            WHERE user_scope = $1
              AND music_track_id = $2
            RETURNING *
          `,
          [normalizedUserScope, normalizedTrackId],
        );

        await client.query(
          `
            UPDATE music_playlists
            SET track_count = COALESCE((
                  SELECT COUNT(*)::integer
                  FROM music_playlist_tracks
                  WHERE music_playlist_tracks.music_playlist_id = music_playlists.music_playlist_id
                ), 0),
                updated_at = NOW()
            WHERE user_scope = $1
          `,
          [normalizedUserScope],
        );
        await client.query("COMMIT");

        const track = rows[0] ? mapTrackRow(rows[0]) : null;
        return {
          deletedCount: track ? 1 : 0,
          deletedTrackIds: track?.musicTrackId ? [track.musicTrackId] : [],
          track,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async resetLibrary({ userScope } = {}) {
      const normalizedUserScope = normalizeUserScope(userScope);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const trackRows = await client.query(
          "SELECT music_track_id FROM music_tracks WHERE user_scope = $1",
          [normalizedUserScope],
        );
        const playlistRows = await client.query(
          "SELECT music_playlist_id FROM music_playlists WHERE user_scope = $1",
          [normalizedUserScope],
        );
        const affinityCountRows = await client.query(
          "SELECT COUNT(*)::integer AS count FROM music_track_affinities WHERE user_scope = $1",
          [normalizedUserScope],
        );
        const playlistCountRows = await client.query(
          "SELECT COUNT(*)::integer AS count FROM music_playlists WHERE user_scope = $1",
          [normalizedUserScope],
        );

        await client.query("DELETE FROM music_playlists WHERE user_scope = $1", [normalizedUserScope]);
        await client.query("DELETE FROM music_track_affinities WHERE user_scope = $1", [normalizedUserScope]);
        await client.query("DELETE FROM music_tracks WHERE user_scope = $1", [normalizedUserScope]);
        await client.query("COMMIT");

        const deletedTrackIds = trackRows.rows
          .map((row) => String(row.music_track_id || "").trim())
          .filter(Boolean);
        const deletedPlaylistIds = playlistRows.rows
          .map((row) => String(row.music_playlist_id || "").trim())
          .filter(Boolean);

        return {
          deletedTrackCount: deletedTrackIds.length,
          deletedAffinityCount: Number(affinityCountRows.rows[0]?.count || 0),
          deletedPlaylistCount: Number(playlistCountRows.rows[0]?.count || 0),
          deletedTrackIds,
          deletedPlaylistIds,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listExistingSpotifyTrackIds(spotifyTrackIds, { userScope } = {}) {
      const normalizedIds = Array.isArray(spotifyTrackIds)
        ? Array.from(new Set(spotifyTrackIds.map((id) => normalizeText(id, { maxLength: 120 })).filter(Boolean)))
        : [];

      if (!normalizedIds.length) {
        return [];
      }

      const values = [normalizedIds];
      const clauses = ["spotify_track_id = ANY($1::text[])"];

      if (userScope) {
        values.push(normalizeUserScope(userScope));
        clauses.push(`user_scope = $${values.length}`);
      }

      const { rows } = await pool.query(
        `
          SELECT spotify_track_id
          FROM music_tracks
          WHERE ${clauses.join(" AND ")}
        `,
        values,
      );

      return rows.map((row) => row.spotify_track_id).filter(Boolean);
    },

    async upsertAffinity(record = {}, defaults = {}) {
      const normalized = normalizeAffinityRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO music_track_affinities (
            affinity_id,
            music_track_id,
            user_scope,
            actor_key,
            actor_type,
            actor_display_name,
            reaction,
            tags,
            note,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW())
          ON CONFLICT (music_track_id, actor_key)
          DO UPDATE SET
            actor_type = EXCLUDED.actor_type,
            actor_display_name = EXCLUDED.actor_display_name,
            reaction = EXCLUDED.reaction,
            tags = EXCLUDED.tags,
            note = EXCLUDED.note,
            updated_at = NOW()
          RETURNING *
        `,
        [
          normalized.affinityId,
          normalized.musicTrackId,
          normalized.userScope,
          normalized.actorKey,
          normalized.actorType,
          normalized.actorDisplayName,
          normalized.reaction,
          JSON.stringify(normalized.tags),
          normalized.note,
        ],
      );

      return mapAffinityRow(rows[0]);
    },

    async updateTrackUserGenres(musicTrackId, { userScope, userGenres = [] } = {}) {
      const normalizedTrackId = normalizeText(musicTrackId, { maxLength: 120 });
      const normalizedUserScope = normalizeUserScope(userScope);
      const normalizedGenres = normalizeTags(userGenres);

      if (!normalizedTrackId) {
        throw new Error("Music track ID is required.");
      }

      const { rows } = await pool.query(
        `
          UPDATE music_tracks
          SET user_genres = $3::jsonb,
              embedding_dirty_at = NOW(),
              updated_at = NOW()
          WHERE music_track_id = $1
            AND user_scope = $2
          RETURNING *
        `,
        [normalizedTrackId, normalizedUserScope, JSON.stringify(normalizedGenres)],
      );

      return mapTrackRow(rows[0]);
    },

    async getMusicBrainzWorkStatus({ userScope } = {}) {
      const normalizedUserScope = normalizeUserScope(userScope);
      const { rows } = await pool.query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE active = TRUE
                AND musicbrainz_enrichment_status IN ('pending', 'failed', 'rate_limited')
                AND (musicbrainz_next_fetch_after IS NULL OR musicbrainz_next_fetch_after <= NOW())
            )::integer AS pending_track_count,
            COUNT(*) FILTER (
              WHERE active = TRUE
                AND embedding_dirty_at IS NOT NULL
            )::integer AS dirty_track_count,
            COUNT(*) FILTER (WHERE musicbrainz_enrichment_status = 'matched')::integer AS matched_track_count,
            COUNT(*) FILTER (WHERE musicbrainz_enrichment_status = 'no_match')::integer AS no_match_track_count,
            COUNT(*) FILTER (WHERE musicbrainz_enrichment_status = 'failed')::integer AS failed_track_count,
            COUNT(*) FILTER (WHERE musicbrainz_enrichment_status = 'rate_limited')::integer AS rate_limited_track_count
          FROM music_tracks
          WHERE user_scope = $1
        `,
        [normalizedUserScope],
      );
      const row = rows[0] || {};

      return {
        pendingTrackCount: Number(row.pending_track_count || 0),
        dirtyTrackCount: Number(row.dirty_track_count || 0),
        matchedTrackCount: Number(row.matched_track_count || 0),
        noMatchTrackCount: Number(row.no_match_track_count || 0),
        failedTrackCount: Number(row.failed_track_count || 0),
        rateLimitedTrackCount: Number(row.rate_limited_track_count || 0),
      };
    },

    async getNextMusicBrainzTrackToEnrich({ userScope } = {}) {
      const { rows } = await pool.query(
        `
          SELECT *
          FROM music_tracks
          WHERE user_scope = $1
            AND active = TRUE
            AND musicbrainz_enrichment_status IN ('pending', 'failed', 'rate_limited')
            AND (musicbrainz_next_fetch_after IS NULL OR musicbrainz_next_fetch_after <= NOW())
          ORDER BY
            CASE musicbrainz_enrichment_status
              WHEN 'pending' THEN 0
              WHEN 'failed' THEN 1
              ELSE 2
            END ASC,
            imported_at ASC NULLS LAST,
            updated_at ASC
          LIMIT 1
        `,
        [normalizeUserScope(userScope)],
      );

      return mapTrackRow(rows[0]);
    },

    async saveMusicBrainzEnrichment(musicTrackId, {
      userScope,
      status = "pending",
      recordingId = "",
      releaseId = "",
      releaseGroupId = "",
      confidence = null,
      genres = [],
      genreFamilies = [],
      tags = [],
      lastError = "",
      retryAfterSeconds = 0,
      nextFetchAfter = null,
    } = {}) {
      const normalizedTrackId = normalizeText(musicTrackId, { maxLength: 120 });
      const normalizedUserScope = normalizeUserScope(userScope);
      const normalizedStatus = normalizeMusicBrainzStatus(status);
      const normalizedGenres = normalizeTags(genres);
      const normalizedGenreFamilies = normalizeTags(genreFamilies);
      const normalizedTags = normalizeTags(tags);
      const shouldDirtyEmbedding = normalizedStatus === "matched";
      const retrySeconds = Math.max(0, Number.parseInt(String(retryAfterSeconds || 0), 10) || 0);
      const resolvedNextFetchAfter = nextFetchAfter
        ? normalizeTimestamp(nextFetchAfter, null)
        : retrySeconds > 0
          ? new Date(Date.now() + (retrySeconds * 1000)).toISOString()
          : null;

      if (!normalizedTrackId) {
        throw new Error("Music track ID is required.");
      }

      const { rows } = await pool.query(
        `
          UPDATE music_tracks
          SET musicbrainz_recording_id = CASE WHEN $3 = '' THEN musicbrainz_recording_id ELSE $3 END,
              musicbrainz_release_id = CASE WHEN $4 = '' THEN musicbrainz_release_id ELSE $4 END,
              musicbrainz_release_group_id = CASE WHEN $5 = '' THEN musicbrainz_release_group_id ELSE $5 END,
              musicbrainz_match_confidence = COALESCE($6::real, musicbrainz_match_confidence),
              artist_genres = CASE WHEN $7::jsonb = '[]'::jsonb THEN artist_genres ELSE $7::jsonb END,
              genre_families = CASE WHEN $8::jsonb = '[]'::jsonb THEN genre_families ELSE $8::jsonb END,
              musicbrainz_tags = CASE WHEN $9::jsonb = '[]'::jsonb THEN musicbrainz_tags ELSE $9::jsonb END,
              musicbrainz_enrichment_status = $10,
              musicbrainz_last_error = $11,
              musicbrainz_enriched_at = CASE WHEN $10 IN ('matched', 'no_match') THEN NOW() ELSE musicbrainz_enriched_at END,
              musicbrainz_next_fetch_after = $12::timestamptz,
              embedding_dirty_at = CASE WHEN $13::boolean THEN NOW() ELSE embedding_dirty_at END,
              updated_at = NOW()
          WHERE music_track_id = $1
            AND user_scope = $2
          RETURNING *
        `,
        [
          normalizedTrackId,
          normalizedUserScope,
          normalizeText(recordingId, { maxLength: 120 }),
          normalizeText(releaseId, { maxLength: 120 }),
          normalizeText(releaseGroupId, { maxLength: 120 }),
          normalizeNullableNumber(confidence),
          JSON.stringify(normalizedGenres),
          JSON.stringify(normalizedGenreFamilies),
          JSON.stringify(normalizedTags),
          normalizedStatus,
          normalizeText(lastError, { maxLength: 1000 }),
          resolvedNextFetchAfter,
          shouldDirtyEmbedding,
        ],
      );

      return mapTrackRow(rows[0]);
    },

    async listDirtyMusicTracks({ userScope, limit = 25 } = {}) {
      const normalizedLimit = Math.max(1, Math.min(Number.parseInt(String(limit || 25), 10) || 25, 100));
      const { rows } = await pool.query(
        `
          SELECT *
          FROM music_tracks
          WHERE user_scope = $1
            AND active = TRUE
            AND embedding_dirty_at IS NOT NULL
          ORDER BY embedding_dirty_at ASC, updated_at ASC
          LIMIT $2
        `,
        [normalizeUserScope(userScope), normalizedLimit],
      );

      return rows.map(mapTrackRow);
    },

    async listAffinitiesForTrackIds(musicTrackIds, { userScope } = {}) {
      const normalizedIds = Array.isArray(musicTrackIds)
        ? musicTrackIds.map((id) => normalizeText(id, { maxLength: 120 })).filter(Boolean)
        : [];

      if (!normalizedIds.length) {
        return [];
      }

      const values = [normalizedIds];
      const clauses = ["music_track_id = ANY($1::uuid[])"];

      if (userScope) {
        values.push(normalizeUserScope(userScope));
        clauses.push(`user_scope = $${values.length}`);
      }

      const { rows } = await pool.query(
        `
          SELECT *
          FROM music_track_affinities
          WHERE ${clauses.join(" AND ")}
          ORDER BY updated_at DESC
        `,
        values,
      );

      return rows.map(mapAffinityRow);
    },

    async upsertPlaylist(record = {}, defaults = {}) {
      const normalized = normalizeMusicPlaylistRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO music_playlists (
            music_playlist_id,
            user_scope,
            spotify_playlist_id,
            spotify_uri,
            spotify_url,
            name,
            description,
            source,
            prompt,
            created_by_actor_key,
            created_by_actor_type,
            created_by_display_name,
            track_count,
            discovery_track_count,
            cover_image_id,
            spotify_cover_url,
            is_favorite,
            user_note,
            tags,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, NOW())
          ON CONFLICT (user_scope, spotify_playlist_id)
          DO UPDATE SET
            spotify_uri = EXCLUDED.spotify_uri,
            spotify_url = EXCLUDED.spotify_url,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            source = EXCLUDED.source,
            prompt = EXCLUDED.prompt,
            created_by_actor_key = EXCLUDED.created_by_actor_key,
            created_by_actor_type = EXCLUDED.created_by_actor_type,
            created_by_display_name = EXCLUDED.created_by_display_name,
            track_count = EXCLUDED.track_count,
            discovery_track_count = EXCLUDED.discovery_track_count,
            cover_image_id = EXCLUDED.cover_image_id,
            spotify_cover_url = CASE
              WHEN EXCLUDED.spotify_cover_url = '' THEN music_playlists.spotify_cover_url
              ELSE EXCLUDED.spotify_cover_url
            END,
            is_favorite = music_playlists.is_favorite OR EXCLUDED.is_favorite,
            user_note = CASE
              WHEN music_playlists.user_note <> '' AND EXCLUDED.user_note = '' THEN music_playlists.user_note
              ELSE EXCLUDED.user_note
            END,
            tags = CASE
              WHEN jsonb_array_length(music_playlists.tags) > 0 AND jsonb_array_length(EXCLUDED.tags) = 0 THEN music_playlists.tags
              ELSE EXCLUDED.tags
            END,
            updated_at = NOW()
          RETURNING *
        `,
        [
          normalized.musicPlaylistId,
          normalized.userScope,
          normalized.spotifyPlaylistId,
          normalized.spotifyUri,
          normalized.spotifyUrl,
          normalized.name,
          normalized.description,
          normalized.source,
          normalized.prompt,
          normalized.createdByActorKey,
          normalized.createdByActorType,
          normalized.createdByDisplayName,
          normalized.trackCount,
          normalized.discoveryTrackCount,
          normalized.coverImageId,
          normalized.spotifyCoverUrl,
          normalized.isFavorite,
          normalized.userNote,
          JSON.stringify(normalized.tags),
        ],
      );

      return mapPlaylistRow(rows[0]);
    },

    async updatePlaylistProfile(musicPlaylistId, { userScope, userNote = "", tags = [] } = {}) {
      const normalizedPlaylistId = normalizeText(musicPlaylistId, { maxLength: 120 });
      const normalizedUserScope = normalizeUserScope(userScope);
      const normalizedTags = normalizeTags(tags);

      if (!normalizedPlaylistId) {
        throw new Error("Music playlist ID is required.");
      }

      const { rows } = await pool.query(
        `
          UPDATE music_playlists
          SET user_note = $3,
              tags = $4::jsonb,
              updated_at = NOW()
          WHERE music_playlist_id = $1
            AND user_scope = $2
          RETURNING *
        `,
        [
          normalizedPlaylistId,
          normalizedUserScope,
          normalizeText(userNote, { maxLength: 1000 }),
          JSON.stringify(normalizedTags),
        ],
      );

      return mapPlaylistRow(rows[0]);
    },

    async updatePlaylistFavorite(musicPlaylistId, { userScope, isFavorite = false } = {}) {
      const normalizedPlaylistId = normalizeText(musicPlaylistId, { maxLength: 120 });
      const normalizedUserScope = normalizeUserScope(userScope);

      if (!normalizedPlaylistId) {
        throw new Error("Music playlist ID is required.");
      }

      const { rows } = await pool.query(
        `
          UPDATE music_playlists
          SET is_favorite = $3,
              updated_at = NOW()
          WHERE music_playlist_id = $1
            AND user_scope = $2
          RETURNING *
        `,
        [
          normalizedPlaylistId,
          normalizedUserScope,
          normalizeBoolean(isFavorite, false),
        ],
      );

      return mapPlaylistRow(rows[0]);
    },

    async deletePlaylist({ userScope, musicPlaylistId } = {}) {
      const normalizedUserScope = normalizeUserScope(userScope);
      const normalizedPlaylistId = normalizeText(musicPlaylistId, { maxLength: 120 });

      if (!normalizedPlaylistId) {
        return {
          deletedCount: 0,
          deletedPlaylistIds: [],
          playlist: null,
        };
      }

      const { rows } = await pool.query(
        `
          DELETE FROM music_playlists
          WHERE user_scope = $1
            AND music_playlist_id = $2
          RETURNING *
        `,
        [normalizedUserScope, normalizedPlaylistId],
      );

      const playlist = rows[0] ? mapPlaylistRow(rows[0]) : null;
      return {
        deletedCount: playlist ? 1 : 0,
        deletedPlaylistIds: playlist?.musicPlaylistId ? [playlist.musicPlaylistId] : [],
        playlist,
      };
    },

    async replacePlaylistTracks(musicPlaylistId, tracks = []) {
      const normalizedPlaylistId = normalizeText(musicPlaylistId, { maxLength: 120 });
      const normalizedTracks = Array.isArray(tracks)
        ? tracks.map((track, index) => normalizeMusicPlaylistTrackRecord({
          ...track,
          position: track.position ?? index,
        }, { musicPlaylistId: normalizedPlaylistId }))
        : [];

      if (!normalizedPlaylistId) {
        throw new Error("Music playlist ID is required.");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "DELETE FROM music_playlist_tracks WHERE music_playlist_id = $1",
          [normalizedPlaylistId],
        );

        const inserted = [];
        for (const track of normalizedTracks) {
          const { rows } = await client.query(
            `
              INSERT INTO music_playlist_tracks (
                music_playlist_id,
                music_track_id,
                spotify_track_id,
                position,
                source,
                updated_at
              )
              VALUES ($1, $2, $3, $4, $5, NOW())
              ON CONFLICT (music_playlist_id, spotify_track_id)
              DO UPDATE SET
                music_track_id = EXCLUDED.music_track_id,
                position = LEAST(music_playlist_tracks.position, EXCLUDED.position),
                source = EXCLUDED.source,
                updated_at = NOW()
              RETURNING *
            `,
            [
              track.musicPlaylistId,
              track.musicTrackId,
              track.spotifyTrackId,
              track.position,
              track.source,
            ],
          );
          inserted.push(mapPlaylistTrackRow(rows[0]));
        }

        await client.query(
          `
            UPDATE music_playlists
            SET track_count = $2,
                updated_at = NOW()
            WHERE music_playlist_id = $1
          `,
          [normalizedPlaylistId, inserted.length],
        );

        await client.query("COMMIT");
        return inserted;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async appendPlaylistTracks(musicPlaylistId, tracks = []) {
      const normalizedPlaylistId = normalizeText(musicPlaylistId, { maxLength: 120 });
      const normalizedTracks = Array.isArray(tracks)
        ? tracks.map((track, index) => normalizeMusicPlaylistTrackRecord({
          ...track,
          position: track.position ?? index,
        }, { musicPlaylistId: normalizedPlaylistId }))
        : [];

      if (!normalizedPlaylistId) {
        throw new Error("Music playlist ID is required.");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: positionRows } = await client.query(
          "SELECT COALESCE(MAX(position), -1)::integer AS max_position FROM music_playlist_tracks WHERE music_playlist_id = $1",
          [normalizedPlaylistId],
        );
        let nextPosition = Number(positionRows[0]?.max_position ?? -1) + 1;
        const inserted = [];

        for (const track of normalizedTracks) {
          const { rows } = await client.query(
            `
              INSERT INTO music_playlist_tracks (
                music_playlist_id,
                music_track_id,
                spotify_track_id,
                position,
                source,
                updated_at
              )
              VALUES ($1, $2, $3, $4, $5, NOW())
              ON CONFLICT (music_playlist_id, spotify_track_id) DO NOTHING
              RETURNING *
            `,
            [
              track.musicPlaylistId,
              track.musicTrackId,
              track.spotifyTrackId,
              nextPosition,
              track.source,
            ],
          );
          if (rows[0]) {
            inserted.push(mapPlaylistTrackRow(rows[0]));
            nextPosition += 1;
          }
        }

        const discoveryInsertedCount = inserted
          .filter((track) => String(track.source || "").startsWith("spotify_catalog"))
          .length;

        await client.query(
          `
            UPDATE music_playlists
            SET track_count = GREATEST(track_count + $2, track_count),
                discovery_track_count = GREATEST(discovery_track_count + $3, discovery_track_count),
                updated_at = NOW()
            WHERE music_playlist_id = $1
          `,
          [normalizedPlaylistId, inserted.length, discoveryInsertedCount],
        );

        await client.query("COMMIT");
        return inserted;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getPlaylistBySpotifyId({ userScope, spotifyPlaylistId } = {}) {
      const normalizedUserScope = normalizeUserScope(userScope);
      const normalizedSpotifyPlaylistId = normalizeText(spotifyPlaylistId, { maxLength: 160 });

      if (!normalizedSpotifyPlaylistId) {
        return null;
      }

      const { rows } = await pool.query(
        `
          SELECT *
          FROM music_playlists
          WHERE user_scope = $1 AND spotify_playlist_id = $2
          LIMIT 1
        `,
        [normalizedUserScope, normalizedSpotifyPlaylistId],
      );

      return mapPlaylistRow(rows[0]);
    },

    async listPlaylistTracks(musicPlaylistId) {
      const normalizedPlaylistId = normalizeText(musicPlaylistId, { maxLength: 120 });

      if (!normalizedPlaylistId) {
        return [];
      }

      const { rows } = await pool.query(
        `
          SELECT music_playlist_tracks.*,
                 music_tracks.title AS track_title,
                 music_tracks.artists AS track_artists
          FROM music_playlist_tracks
          LEFT JOIN music_tracks
            ON music_tracks.music_track_id = music_playlist_tracks.music_track_id
          WHERE music_playlist_tracks.music_playlist_id = $1
          ORDER BY music_playlist_tracks.position ASC
        `,
        [normalizedPlaylistId],
      );

      return rows.map(mapPlaylistTrackRow);
    },

    async listPlaylists({ userScope, query = "", source = "", tags = [], limit = 10, offset = 0 } = {}) {
      const normalizedLimit = Math.max(1, Math.min(Number.parseInt(String(limit || 10), 10) || 10, 25));
      const normalizedOffset = Math.max(0, Number.parseInt(String(offset || 0), 10) || 0);
      const values = [normalizeUserScope(userScope), normalizedLimit, normalizedOffset];
      const clauses = ["user_scope = $1"];
      const normalizedSource = normalizeText(source, { maxLength: 80 });
      const normalizedQuery = normalizeText(query, { maxLength: 240 }).toLowerCase();
      const normalizedTags = normalizeTags(tags);

      if (normalizedSource) {
        values.push(normalizedSource);
        clauses.push(`source = $${values.length}`);
      }

      if (normalizedTags.length) {
        values.push(JSON.stringify(normalizedTags));
        clauses.push(`tags @> $${values.length}::jsonb`);
      }

      if (normalizedQuery) {
        values.push(`%${normalizedQuery}%`);
        clauses.push(`(
          LOWER(name) LIKE $${values.length}
          OR LOWER(description) LIKE $${values.length}
          OR LOWER(prompt) LIKE $${values.length}
          OR LOWER(user_note) LIKE $${values.length}
          OR LOWER(tags::text) LIKE $${values.length}
        )`);
      }

      const { rows } = await pool.query(
        `
          SELECT *
          FROM music_playlists
          WHERE ${clauses.join(" AND ")}
          ORDER BY updated_at DESC
          LIMIT $2 OFFSET $3
        `,
        values,
      );

      return rows.map(mapPlaylistRow);
    },

    async listDistinctPlaylistTags({ userScope } = {}) {
      const { rows } = await pool.query(
        `
          SELECT DISTINCT LOWER(TRIM(tag_value)) AS tag
          FROM music_playlists
          CROSS JOIN LATERAL jsonb_array_elements_text(tags) AS tag_value
          WHERE user_scope = $1
            AND TRIM(tag_value) <> ''
          ORDER BY tag ASC
          LIMIT 250
        `,
        [normalizeUserScope(userScope)],
      );

      return rows.map((row) => row.tag).filter(Boolean);
    },

    async countPlaylists({ userScope, query = "", source = "", tags = [] } = {}) {
      const values = [normalizeUserScope(userScope)];
      const clauses = ["user_scope = $1"];
      const normalizedSource = normalizeText(source, { maxLength: 80 });
      const normalizedQuery = normalizeText(query, { maxLength: 240 }).toLowerCase();
      const normalizedTags = normalizeTags(tags);

      if (normalizedSource) {
        values.push(normalizedSource);
        clauses.push(`source = $${values.length}`);
      }

      if (normalizedTags.length) {
        values.push(JSON.stringify(normalizedTags));
        clauses.push(`tags @> $${values.length}::jsonb`);
      }

      if (normalizedQuery) {
        values.push(`%${normalizedQuery}%`);
        clauses.push(`(
          LOWER(name) LIKE $${values.length}
          OR LOWER(description) LIKE $${values.length}
          OR LOWER(prompt) LIKE $${values.length}
          OR LOWER(user_note) LIKE $${values.length}
          OR LOWER(tags::text) LIKE $${values.length}
        )`);
      }

      const { rows } = await pool.query(
        `SELECT COUNT(*)::integer AS count FROM music_playlists WHERE ${clauses.join(" AND ")}`,
        values,
      );

      return Number(rows[0]?.count || 0);
    },

    async markTracksSynced(musicTrackIds, { syncedAt = new Date().toISOString() } = {}) {
      const normalizedIds = Array.isArray(musicTrackIds)
        ? musicTrackIds.map((id) => normalizeText(id, { maxLength: 120 })).filter(Boolean)
        : [];

      if (!normalizedIds.length) {
        return 0;
      }

      const { rows } = await pool.query(
        `
          UPDATE music_tracks
          SET synced_at = $2,
              embedding_dirty_at = NULL,
              updated_at = NOW()
          WHERE music_track_id = ANY($1::uuid[])
          RETURNING music_track_id
        `,
        [normalizedIds, normalizeTimestamp(syncedAt, new Date().toISOString())],
      );

      return rows.length;
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  createMusicStore,
  normalizeSpotifyTrackRecord,
  normalizeAffinityRecord,
  normalizeMusicPlaylistRecord,
  normalizeMusicPlaylistTrackRecord,
  normalizeTags,
  buildMusicTrackOrderClause,
  slugifyActorName,
  buildMusicActorKey,
  resolveMusicActor,
  SUPPORTED_MUSIC_REACTIONS,
};
