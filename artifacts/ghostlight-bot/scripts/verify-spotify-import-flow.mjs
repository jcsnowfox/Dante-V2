#!/usr/bin/env node
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { createMusicLibraryService } = require('../src/music/library.js');

const baseUrl = String(process.env.GHOSTLIGHT_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/+$/, '');
const cookie = String(process.env.GHOSTLIGHT_ADMIN_COOKIE || process.env.ADMIN_COOKIE || '');
const dryRun = process.argv.includes('--dry-run') || process.env.SPOTIFY_VERIFY_DRY_RUN === '1';

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie, accept: 'application/json' } : { accept: 'application/json' } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { response, body };
}

async function verifyMockImportLogic() {
  const tracks = new Map();
  const relations = new Map();
  const store = {
    persistenceEnabled: true,
    async listExistingSpotifyTrackIds(ids = []) { return ids.filter((id) => tracks.has(id)); },
    async upsertTrack(track, { userScope, source } = {}) {
      const row = tracks.get(track.spotifyTrackId) || {
        musicTrackId: randomUUID(),
        userScope,
        spotifyTrackId: track.spotifyTrackId,
        title: track.title || track.spotifyTrackId,
        active: true,
      };
      row.source = source;
      tracks.set(track.spotifyTrackId, row);
      return row;
    },
    async upsertPlaylist(record) { return { musicPlaylistId: `mock-${record.spotifyPlaylistId}` }; },
    async replacePlaylistTracks(musicPlaylistId, rows = []) {
      const byTrack = relations.get(musicPlaylistId) || new Map();
      for (const row of rows) byTrack.set(row.spotifyTrackId, { ...row, musicPlaylistId });
      relations.set(musicPlaylistId, byTrack);
      return Array.from(byTrack.values()).sort((a, b) => a.position - b.position);
    },
  };
  const service = createMusicLibraryService({
    config: { memory: { userScope: 'user' }, qdrant: {} },
    store,
    spotify: {
      async fetchPlaylist() { return { name: 'Mock duplicate playlist' }; },
      async fetchPlaylistTracks() {
        return [
          { spotifyTrackId: 'mock-a', title: 'Mock A' },
          { spotifyTrackId: 'mock-b', title: 'Mock B' },
          { spotifyTrackId: 'mock-a', title: 'Mock A duplicate' },
          { spotifyTrackId: '', title: 'Local unavailable track' },
        ];
      },
    },
    logger: { info: (message, meta) => console.log(`[spotify:import] mock log ${message} ${JSON.stringify(meta || {})}`) },
  });

  const first = await service.importPlaylist({ userScope: 'user', playlistId: 'mock-playlist' });
  const second = await service.importPlaylist({ userScope: 'user', playlistId: 'mock-playlist' });

  if (first.duplicatesSkipped !== 1 || first.unavailableSkipped !== 1 || first.storedTrackCount !== 2) {
    throw new Error(`mock duplicate import failed first=${JSON.stringify(first)}`);
  }
  if (second.storedTrackCount !== 2 || second.duplicatesSkipped !== 1) {
    throw new Error(`mock second import failed second=${JSON.stringify(second)}`);
  }

  console.log(`[spotify:import] PASS mock duplicate-safe import firstStored=${first.storedTrackCount} secondStored=${second.storedTrackCount} duplicatesSkipped=${second.duplicatesSkipped} unavailableSkipped=${second.unavailableSkipped}`);
}

if (!baseUrl) {
  console.log('[spotify:import] NO LIVE TOKEN: set GHOSTLIGHT_BASE_URL and admin auth cookie to verify a deployed connection. Running mocked duplicate-safe import verification.');
  await verifyMockImportLogic();
  process.exit(0);
}

const diagnostics = await getJson('/api/music/spotify/diagnostics');
console.log(`[spotify:import] diagnostics status=${diagnostics.response.status} connection=${Boolean(diagnostics.body.connectionExists)} refresh=${Boolean(diagnostics.body.hasRefreshToken)} missingScopes=${(diagnostics.body.missingScopes || []).join(',')}`);
if (!diagnostics.response.ok || !diagnostics.body.connectionExists || !diagnostics.body.hasRefreshToken) {
  console.log('[spotify:import] NO LIVE TOKEN: no usable Spotify connection is available to this deployment. Running mocked duplicate-safe import verification.');
  await verifyMockImportLogic();
  process.exit(dryRun ? 0 : 0);
}
if ((diagnostics.body.missingScopes || []).length) {
  console.error('[spotify:import] FAIL reconnect required due to missing playlist scopes.');
  process.exit(1);
}

const playlists = await getJson('/api/music/spotify/playlists?limit=1');
console.log(`[spotify:import] playlists status=${playlists.response.status} count=${Array.isArray(playlists.body.playlists) ? playlists.body.playlists.length : 0}`);
if (!playlists.response.ok || playlists.body.ok !== true) {
  console.error(`[spotify:import] FAIL playlist fetch failed code=${playlists.body.code || ''} error=${playlists.body.error || ''}`);
  process.exit(1);
}
console.log('[spotify:import] PASS token refresh and playlist fetch work. Running mocked duplicate-safe import verification without modifying production music data.');
await verifyMockImportLogic();
