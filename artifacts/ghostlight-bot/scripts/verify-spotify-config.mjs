#!/usr/bin/env node
import fs from 'node:fs';

const required = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI'];
const missing = required.filter((key) => !String(process.env[key] || '').trim());
const actions = fs.readFileSync(new URL('../src/http/actions/musicActions.js', import.meta.url), 'utf8');
const spotify = fs.readFileSync(new URL('../src/music/spotify.js', import.meta.url), 'utf8');
const callbackRoute = actions.includes('/admin/actions/music-spotify-callback');
const playlistApi = actions.includes('/api/music/spotify/playlists');
const diagnosticsApi = actions.includes('/api/music/spotify/diagnostics');
const scopes = ['playlist-read-private', 'playlist-read-collaborative', 'user-read-private'];
const missingScopeConstants = scopes.filter((scope) => !spotify.includes(scope));

console.log(`[spotify:config] env clientId=${Boolean(process.env.SPOTIFY_CLIENT_ID)} clientSecret=${Boolean(process.env.SPOTIFY_CLIENT_SECRET)} redirectUri=${Boolean(process.env.SPOTIFY_REDIRECT_URI)}`);
console.log(`[spotify:config] routes callback=${callbackRoute} playlistsApi=${playlistApi} diagnosticsApi=${diagnosticsApi}`);
console.log(`[spotify:config] requiredScopes=${scopes.join(',')}`);

if (!callbackRoute || !playlistApi || !diagnosticsApi || missingScopeConstants.length) {
  console.error(`[spotify:config] FAIL route/scope wiring incomplete missingScopesInCode=${missingScopeConstants.join(',')}`);
  process.exit(1);
}

if (missing.length) {
  console.error(`[spotify:config] NO LIVE ENV missing=${missing.join(',')}`);
  process.exit(2);
}

try {
  const url = new URL(process.env.SPOTIFY_REDIRECT_URI);
  if (!url.pathname.endsWith('/admin/actions/music-spotify-callback')) {
    console.error('[spotify:config] FAIL redirect URI must end with /admin/actions/music-spotify-callback');
    process.exit(1);
  }
} catch {
  console.error('[spotify:config] FAIL SPOTIFY_REDIRECT_URI is not a valid URL');
  process.exit(1);
}

console.log('[spotify:config] PASS');
