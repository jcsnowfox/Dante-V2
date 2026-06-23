const assert = require("node:assert/strict");
const test = require("node:test");

const { formatSafeMusicImportError } = require("./musicActions");

test("music import UI errors do not expose raw Postgres duplicate constraint names", () => {
  const message = formatSafeMusicImportError(new Error('duplicate key value violates unique constraint "music_playlist_tracks_music_playlist_id_spotify_track_id_key"'));

  assert.equal(message.includes("music_playlist_tracks_music_playlist_id_spotify_track_id_key"), false);
  assert.equal(message.includes("duplicate key value violates unique constraint"), false);
  assert.match(message, /Playlist import failed/);
});
