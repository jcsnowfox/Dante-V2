# Spotify Import Audit

## Executive verdict
PASS WITH WARNINGS locally: code wiring for OAuth, playlist fetch, playlist import, diagnostics, and embedding isolation is now present. Live production proof still requires a deployed connection with valid Spotify tokens and matching `SPOTIFY_REDIRECT_URI`.

## Findings
- OAuth existed at `POST /admin/actions/music-spotify-connect` and `GET /admin/actions/music-spotify-callback`, with state saved in `music_spotify_connections`.
- Playlist import forms existed at `POST /admin/actions/music-import` and `POST /admin/actions/music-playlist-import`.
- The dashboard loaded playlists server-side via `spotify.listPlaylists`, but there was no JSON diagnostics route and no JSON playlist fetch route for direct admin verification.
- Spotify connections stored a refresh token and scopes, but not the latest access token or token expiry, making the dashboard unable to distinguish a genuinely live connection from a stale saved connection.
- Playlist import only saved tracks; it did not create/update the `music_playlists` record or `music_playlist_tracks` links for imported Spotify playlists.
- The importability check disabled public/followed playlists unless the connected account owned/collaborated on them. Spotify can expose playlist items for accessible public/private/collaborative playlists when the correct read scopes are granted, so that check could make usable playlists appear unavailable.
- Background embedding failures were already caught separately from imports, but the log label made the warning look like a general music/Spotify failure.

## Fixes
- Added `user-read-private` to the requested Spotify scopes alongside `playlist-read-private` and `playlist-read-collaborative`.
- Added access-token and token-expiry persistence to `music_spotify_connections` and refresh-before-use behavior.
- Preserved refresh tokens when Spotify refresh responses omit a new refresh token.
- Added safe Spotify logs for connection save, token refresh success/failure, and playlist import start/completion.
- Added `GET /api/music/spotify/playlists` for admin-safe playlist metadata fetches.
- Added `GET /api/music/spotify/diagnostics` for env/connection/scope/token status without secrets.
- Changed playlist import to store the playlist in `music_playlists`, import tracks into `music_tracks`, and link them through `music_playlist_tracks`.
- Changed embedding failure logging to `[music:embedding] sync failed` so Spotify import is not blamed for embedding provider/network failures.
- Added verification scripts `verify:spotify-config` and `verify:spotify-import`.

## Routes audited
| Feature | Route | Method | Notes |
| --- | --- | --- | --- |
| Connect Spotify | `/admin/actions/music-spotify-connect` | POST | Admin-wrapped action; creates OAuth state and redirects to Spotify. |
| Spotify callback | `/admin/actions/music-spotify-callback` | GET | Admin-wrapped action; validates state, exchanges code, proves connection with `/me`, saves tokens/scopes. |
| Fetch playlists | `/api/music/spotify/playlists` | GET | Admin-wrapped JSON route; returns safe playlist metadata and explicit 401/403/429 errors. |
| Import playlist | `/admin/actions/music-playlist-import` | POST | Admin-wrapped form route; imports selected playlist. |
| Combined import | `/admin/actions/music-import` | POST | Admin-wrapped form route; imports liked songs or selected playlist. |
| Diagnostics | `/api/music/spotify/diagnostics` | GET | Admin-wrapped JSON route; returns safe config/connection/scope state. |

## Remaining production proof required
Run these after deployment with real env/admin auth:

```bash
pnpm --dir artifacts/ghostlight-bot verify:spotify-config
GHOSTLIGHT_BASE_URL=https://<app> GHOSTLIGHT_ADMIN_COOKIE='<cookie>' pnpm --dir artifacts/ghostlight-bot verify:spotify-import
```

If diagnostics reports missing scopes, reconnect Spotify from the dashboard. If Spotify returns 401, reconnect. If it returns 403, the connected Spotify account does not have permission/scope for that playlist. If embedding warnings continue, they are separate from playlist import.


## Follow-up: music search fallback
- Production logs after the first fix still showed the old dirty embedding warning, which means that deployment was still running code with the previous log string or had not yet picked up the renamed logger. The source now contains no `Dirty music embedding sync failed` log string.
- `search_music_library` now falls back to local imported-track database search when Qdrant or embedding fetches fail, so Dante can still answer with imported library matches instead of surfacing a tool failure.
- Dirty music embedding sync now backs off for five minutes after a provider/network failure, preventing the warning from spamming every enrichment tick.
