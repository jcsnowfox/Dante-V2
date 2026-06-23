import { Pool } from "pg";

const expectedTables = {
  music_spotify_connections: [
    "user_scope",
    "spotify_user_id",
    "spotify_display_name",
    "refresh_token",
    "access_token",
    "token_expires_at",
    "scope",
    "oauth_state",
    "oauth_state_created_at",
    "connected_at",
    "last_import_at",
    "created_at",
    "updated_at",
  ],
  music_tracks: [
    "id",
    "music_track_id",
    "user_scope",
    "spotify_track_id",
    "spotify_uri",
    "spotify_url",
    "title",
    "artists",
    "album_name",
    "album_release_date",
    "album_release_date_precision",
    "release_year",
    "artist_genres",
    "genre_families",
    "user_genres",
    "musicbrainz_recording_id",
    "musicbrainz_release_id",
    "musicbrainz_release_group_id",
    "musicbrainz_match_confidence",
    "musicbrainz_tags",
    "musicbrainz_enrichment_status",
    "musicbrainz_last_error",
    "musicbrainz_enriched_at",
    "musicbrainz_next_fetch_after",
    "embedding_dirty_at",
    "duration_ms",
    "explicit",
    "liked_at",
    "source",
    "active",
    "imported_at",
    "synced_at",
    "created_at",
    "updated_at",
  ],
  music_track_affinities: [
    "id",
    "affinity_id",
    "music_track_id",
    "user_scope",
    "actor_key",
    "actor_type",
    "actor_display_name",
    "reaction",
    "tags",
    "note",
    "created_at",
    "updated_at",
  ],
  music_playlists: [
    "id",
    "music_playlist_id",
    "user_scope",
    "spotify_playlist_id",
    "spotify_uri",
    "spotify_url",
    "name",
    "description",
    "source",
    "prompt",
    "created_by_actor_key",
    "created_by_actor_type",
    "created_by_display_name",
    "track_count",
    "discovery_track_count",
    "cover_image_id",
    "spotify_cover_url",
    "is_favorite",
    "user_note",
    "tags",
    "created_at",
    "updated_at",
  ],
  music_playlist_tracks: [
    "id",
    "music_playlist_id",
    "music_track_id",
    "spotify_track_id",
    "position",
    "source",
    "added_at",
    "created_at",
    "updated_at",
  ],
};

const expectedIndexes = [
  "music_spotify_connections_user_scope_uidx",
  "music_tracks_scope_spotify_track_uidx",
  "music_playlists_scope_spotify_playlist_uidx",
  "music_tracks_scope_updated_idx",
  "music_tracks_scope_active_idx",
  "music_tracks_musicbrainz_status_idx",
  "music_tracks_embedding_dirty_idx",
  "music_tracks_liked_at_idx",
  "music_track_affinities_track_idx",
  "music_track_affinities_actor_idx",
  "music_track_affinities_tags_gin_idx",
  "music_playlists_scope_updated_idx",
  "music_playlists_scope_source_idx",
  "music_playlist_tracks_playlist_position_idx",
  "music_playlist_tracks_track_idx",
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } });
const failures = [];

try {
  const tableNames = Object.keys(expectedTables);
  const { rows: tableRows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [tableNames],
  );
  const foundTables = new Set(tableRows.map((row) => row.table_name));

  for (const tableName of tableNames) {
    if (!foundTables.has(tableName)) {
      failures.push(`missing table: ${tableName}`);
      continue;
    }

    const { rows: columnRows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [tableName],
    );
    const foundColumns = new Set(columnRows.map((row) => row.column_name));
    for (const columnName of expectedTables[tableName]) {
      if (!foundColumns.has(columnName)) {
        failures.push(`missing column: ${tableName}.${columnName}`);
      }
    }
  }

  const { rows: indexRows } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [expectedIndexes],
  );
  const foundIndexes = new Set(indexRows.map((row) => row.indexname));
  for (const indexName of expectedIndexes) {
    if (!foundIndexes.has(indexName)) {
      failures.push(`missing index: ${indexName}`);
    }
  }

  if (failures.length > 0) {
    console.error("Music schema verification failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`[db:verify] music schema ok tables=${JSON.stringify(tableNames)} indexes=${JSON.stringify(expectedIndexes)}`);
} finally {
  await pool.end();
}
