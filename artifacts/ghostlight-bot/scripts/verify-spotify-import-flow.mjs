#!/usr/bin/env node
const baseUrl = String(process.env.GHOSTLIGHT_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/+$/, '');
const cookie = String(process.env.GHOSTLIGHT_ADMIN_COOKIE || process.env.ADMIN_COOKIE || '');
const dryRun = process.argv.includes('--dry-run') || process.env.SPOTIFY_VERIFY_DRY_RUN === '1';

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
