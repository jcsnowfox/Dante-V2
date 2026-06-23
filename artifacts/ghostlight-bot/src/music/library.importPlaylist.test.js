const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");

const { createMusicLibraryService } = require("./library");

function createImportHarness({ tracks }) {
  const trackRows = new Map();
  const playlistTracks = new Map();
  const logs = [];
  let upsertCalls = 0;

  const store = {
    persistenceEnabled: true,
    async listExistingSpotifyTrackIds(ids = []) {
      return ids.filter((id) => trackRows.has(id));
    },
    async upsertTrack(track, { userScope, source } = {}) {
      upsertCalls += 1;
      const existing = trackRows.get(track.spotifyTrackId);
      const row = {
        musicTrackId: existing?.musicTrackId || randomUUID(),
        userScope,
        spotifyTrackId: track.spotifyTrackId,
        title: track.title || track.name || track.spotifyTrackId,
        source,
        active: true,
      };
      trackRows.set(track.spotifyTrackId, row);
      return row;
    },
    async upsertPlaylist(record) {
      return {
        musicPlaylistId: `playlist-${record.spotifyPlaylistId}`,
        spotifyPlaylistId: record.spotifyPlaylistId,
      };
    },
    async replacePlaylistTracks(musicPlaylistId, rows = []) {
      const byTrackId = playlistTracks.get(musicPlaylistId) || new Map();
      for (const row of rows) {
        if (byTrackId.has(row.spotifyTrackId) && row.failOnDuplicate) {
          throw new Error('duplicate key value violates unique constraint "music_playlist_tracks_music_playlist_id_spotify_track_id_key"');
        }
        byTrackId.set(row.spotifyTrackId, { ...row, musicPlaylistId });
      }
      playlistTracks.set(musicPlaylistId, byTrackId);
      return Array.from(byTrackId.values()).sort((a, b) => a.position - b.position);
    },
  };

  const service = createMusicLibraryService({
    config: { memory: { userScope: "user" }, qdrant: {} },
    store,
    spotify: {
      async fetchPlaylist() {
        return { name: "Duplicate Fixture" };
      },
      async fetchPlaylistTracks() {
        return tracks;
      },
    },
    logger: { info: (message, meta) => logs.push({ message, meta }) },
  });

  return { service, store, logs, playlistTracks, get upsertCalls() { return upsertCalls; } };
}

const baseTracks = [
  { spotifyTrackId: "track-a", title: "A" },
  { spotifyTrackId: "track-b", title: "B" },
  { spotifyTrackId: "track-a", title: "A duplicate" },
  { spotifyTrackId: "track-c", title: "C" },
];

test("Spotify playlist import skips duplicate track relations instead of surfacing unique constraint failures", async () => {
  const harness = createImportHarness({ tracks: baseTracks });
  const result = await harness.service.importPlaylist({ userScope: "user", playlistId: "playlist-1" });

  assert.equal(result.processedCount, 4);
  assert.equal(result.storedTrackCount, 3);
  assert.equal(result.duplicatesSkipped, 1);
  assert.equal(result.unavailableSkipped, 0);
  assert.equal(harness.playlistTracks.get("playlist-playlist-1").size, 3);
  assert.equal(harness.logs.some((entry) => entry.message === "[spotify] playlist import duplicate skipped"), true);
});

test("Spotify playlist import is idempotent when the same playlist is imported twice", async () => {
  const harness = createImportHarness({ tracks: baseTracks });

  await harness.service.importPlaylist({ userScope: "user", playlistId: "playlist-2" });
  const second = await harness.service.importPlaylist({ userScope: "user", playlistId: "playlist-2" });

  assert.equal(second.storedTrackCount, 3);
  assert.equal(second.newTrackCount, 0);
  assert.equal(second.updatedTrackCount, 4);
  assert.equal(second.duplicatesSkipped, 1);
});

test("Spotify playlist import retries safely after a partial relation import", async () => {
  const harness = createImportHarness({ tracks: baseTracks });
  harness.playlistTracks.set("playlist-playlist-3", new Map([
    ["track-a", { musicPlaylistId: "playlist-playlist-3", spotifyTrackId: "track-a", position: 0 }],
  ]));

  const result = await harness.service.importPlaylist({ userScope: "user", playlistId: "playlist-3" });

  assert.equal(result.storedTrackCount, 3);
  assert.equal(harness.playlistTracks.get("playlist-playlist-3").size, 3);
});

test("Spotify playlist import skips unavailable or local tracks safely", async () => {
  const harness = createImportHarness({ tracks: [
    { spotifyTrackId: "track-a", title: "A" },
    { spotifyTrackId: "", title: "Local file" },
    null,
  ] });

  const result = await harness.service.importPlaylist({ userScope: "user", playlistId: "playlist-4" });

  assert.equal(result.processedCount, 3);
  assert.equal(result.importedCount, 1);
  assert.equal(result.unavailableSkipped, 2);
  assert.equal(result.storedTrackCount, 1);
});

test("Spotify playlist pagination duplicates do not create duplicate relation failures", async () => {
  const harness = createImportHarness({ tracks: [
    { spotifyTrackId: "page-1" },
    { spotifyTrackId: "page-2" },
    { spotifyTrackId: "page-1" },
    { spotifyTrackId: "page-3" },
    { spotifyTrackId: "page-2" },
  ] });

  const result = await harness.service.importPlaylist({ userScope: "user", playlistId: "playlist-5", limit: 5 });

  assert.equal(result.processedCount, 5);
  assert.equal(result.storedTrackCount, 3);
  assert.equal(result.duplicatesSkipped, 2);
});
