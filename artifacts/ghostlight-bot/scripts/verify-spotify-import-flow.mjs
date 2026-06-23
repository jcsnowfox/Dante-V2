#!/usr/bin/env node
const baseUrl = String(process.env.GHOSTLIGHT_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/+$/, '');
const cookie = String(process.env.GHOSTLIGHT_ADMIN_COOKIE || process.env.ADMIN_COOKIE || '');
const dryRun = process.argv.includes('--dry-run') || process.env.SPOTIFY_VERIFY_DRY_RUN === '1';


if (dryRun) {
  const library = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/music/library.js', import.meta.url), 'utf8'));
  const store = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/storage/music/index.js', import.meta.url), 'utf8'));
  if (!library.includes('[spotify] playlist import completed') || !library.includes('[spotify] playlist import failed')) {
    console.error('[spotify:import] FAIL static staged completion/failure logs are missing.');
    process.exit(1);
  }
  for (const stage of ['token_refresh','playlist_metadata_fetch','playlist_items_fetch','pagination','track_upsert','playlist_track_upsert','embedding_enqueue','dashboard_response']) {
    if (!library.includes(stage)) {
      console.error(`[spotify:import] FAIL static stage missing ${stage}`);
      process.exit(1);
    }
  }
  const importStart = library.indexOf('async importPlaylist');
  const importEnd = library.indexOf('async syncTrackedPlaylist', importStart);
  const importBody = importStart >= 0 && importEnd > importStart ? library.slice(importStart, importEnd) : '';
  if (importBody.includes('syncMusicTracksToQdrant')) {
    console.error('[spotify:import] FAIL playlist import still blocks on immediate embedding sync.');
    process.exit(1);
  }
  if (!library.includes('Spotify rejected this playlist with 403') || !library.includes('Playlist import failed during track save')) {
    console.error('[spotify:import] FAIL dashboard-safe Spotify import messages are missing.');
    process.exit(1);
  }
  if (!store.includes('ON CONFLICT (music_playlist_id, spotify_track_id)')) {
    console.error('[spotify:import] FAIL playlist track duplicate ON CONFLICT is missing.');
    process.exit(1);
  }
  console.log('[spotify:import] PASS dry-run static flow verification: staged logs, background embeddings, duplicate-safe playlist links.');
  process.exit(0);
}

if (!baseUrl) {
  console.error('[spotify:import] NO LIVE TOKEN: set GHOSTLIGHT_BASE_URL and admin auth cookie to verify a deployed connection. Use --dry-run for static flow verification.');
  process.exit(dryRun ? 0 : 2);
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie, accept: 'application/json' } : { accept: 'application/json' } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { response, body };
}

const diagnostics = await getJson('/api/music/spotify/diagnostics');
console.log(`[spotify:import] diagnostics status=${diagnostics.response.status} connection=${Boolean(diagnostics.body.connectionExists)} refresh=${Boolean(diagnostics.body.hasRefreshToken)} missingScopes=${(diagnostics.body.missingScopes || []).join(',')}`);
if (!diagnostics.response.ok || !diagnostics.body.connectionExists || !diagnostics.body.hasRefreshToken) {
  console.error('[spotify:import] NO LIVE TOKEN: no usable Spotify connection is available to this deployment.');
  process.exit(2);
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
console.log('[spotify:import] PASS playlist fetch works. Dry-run import intentionally avoids modifying Spotify/local library.');
