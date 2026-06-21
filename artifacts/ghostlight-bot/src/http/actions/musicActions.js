const { parseRequestForm, redirect, inferSpotifyRedirectUri } = require("../adminRequestUtils");
const { normalizeImportLimit } = require("../../music/spotify");

const MUSIC_GALLERY_PATHS = new Set([
  "/admin/gallery/music",
  "/admin/gallery/music/tracks",
  "/admin/gallery/music/playlists",
]);

function normalizeMusicPreferenceTags(value = "") {
  return Array.from(new Set(String(value || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)))
    .slice(0, 20);
}

function normalizeMusicCheckbox(value = "") {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeMusicGenreList(value = "") {
  return Array.from(new Set(String(value || "")
    .split(",")
    .map((genre) => genre.trim().toLowerCase())
    .filter(Boolean)))
    .slice(0, 20);
}

function normalizeMusicPreferenceReaction(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return ["likes", "dislikes", "neutral", "recommended", "curious"].includes(normalized)
    ? normalized
    : "neutral";
}

function formatMusicImportSummary(result = {}, itemLabel = "tracks") {
  const processedCount = Number(result.processedCount ?? result.importedCount ?? 0);
  const newTrackCount = Number(result.newTrackCount ?? result.importedCount ?? 0);
  const updatedTrackCount = Number(result.updatedTrackCount ?? Math.max(0, processedCount - newTrackCount));

  if (processedCount === newTrackCount && updatedTrackCount === 0) {
    return `Imported ${newTrackCount} Spotify ${itemLabel}.`;
  }

  return `Checked ${processedCount} Spotify ${itemLabel}; added ${newTrackCount} new and refreshed ${updatedTrackCount} already in your library.`;
}

function buildMusicReturnTo(theme = "light", extra = {}) {
  const params = new URLSearchParams({
    theme: String(theme || "light"),
    ...extra,
  });

  return `/admin/tools/music?${params.toString()}`;
}

function parseMusicLibraryImportPayload(files = {}) {
  const uploadedFile = files.musicLibraryFile || files.file || (Array.isArray(files.files) ? files.files[0] : files.files);
  const content = String(uploadedFile?.content || "").trim();

  if (!content) {
    throw new Error("Upload a Ghostlight music library export JSON file.");
  }

  try {
    return JSON.parse(content);
  } catch (_error) {
    throw new Error("Music library import file must be valid JSON.");
  }
}

function formatMusicQdrantDeleteNote(result = {}) {
  if (result.qdrantDeleteError) {
    return " Music search cleanup could not finish; rebuild or resync music search if stale results appear.";
  }

  if (result.qdrantDeleteSkipped) {
    return " Music search cleanup was skipped because Qdrant is not configured.";
  }

  return ` Removed ${result.qdrantDeletedCount || 0} music search point${result.qdrantDeletedCount === 1 ? "" : "s"}.`;
}

function wantsMusicJson(req = {}) {
  return String(req.headers?.accept || "").toLowerCase().includes("application/json");
}

function sendMusicJson(res, statusCode, payload = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function buildMusicGalleryReturnTo(value = "", theme = "light", extra = {}) {
  const fallback = `/admin/gallery/music?theme=${encodeURIComponent(theme || "light")}`;
  const raw = String(value || "").trim();

  if (!raw) {
    const params = new URLSearchParams({
      theme: String(theme || "light"),
      ...extra,
    });
    return `/admin/gallery/music?${params.toString()}`;
  }

  try {
    const parsed = new URL(raw, "https://ghostlight.local");
    if (!MUSIC_GALLERY_PATHS.has(parsed.pathname)) {
      return fallback;
    }
    for (const [key, val] of Object.entries(extra)) {
      if (val) {
        parsed.searchParams.set(key, String(val));
      }
    }
    if (!parsed.searchParams.get("theme")) {
      parsed.searchParams.set("theme", theme || "light");
    }
    return `${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch (_error) {
    return fallback;
  }
}

async function handleMusicActions({
  req,
  res,
  url,
  context,
  withAdmin,
}) {
  if (req.method === "POST" && url.pathname === "/admin/actions/music-spotify-connect") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";

      if (!innerContext.spotify?.startConnect) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Spotify setup is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const userScope = innerContext.config.memory?.userScope || "user";
      const redirectUri = innerContext.config.spotify?.redirectUri || inferSpotifyRedirectUri(innerReq);

      let connect;
      try {
        connect = await innerContext.spotify.startConnect({ userScope, redirectUri });
      } catch (err) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: `Spotify connection failed: ${err.message}`,
        }));
        return;
      }

      innerRes.writeHead(302, {
        Location: connect.url,
      });
      innerRes.end();
    })(req, res, context);
  }

  if (req.method === "GET" && url.pathname === "/admin/actions/music-spotify-callback") {
    return withAdmin(async (_innerReq, innerRes, innerContext) => {
      const theme = url.searchParams.get("theme") || "light";
      const code = url.searchParams.get("code") || "";
      const state = url.searchParams.get("state") || "";
      const error = url.searchParams.get("error") || "";

      if (error) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: `Spotify declined connection: ${error}`,
        }));
        return;
      }

      if (!innerContext.spotify?.completeConnect) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Spotify setup is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const redirectUri = innerContext.config.spotify?.redirectUri || inferSpotifyRedirectUri(_innerReq);

      try {
        await innerContext.spotify.completeConnect({
          userScope: innerContext.config.memory?.userScope || "user",
          code,
          state,
          redirectUri,
        });
      } catch (err) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: `Spotify connection could not be completed: ${err.message}`,
        }));
        return;
      }

      redirect(innerRes, buildMusicReturnTo(theme, {
        message: "Spotify connected.",
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";
      const limit = normalizeImportLimit(fields.importLimit || fields.limit);
      const source = String(fields.source || "").trim();
      const userScope = innerContext.config.memory?.userScope || "user";

      if (source === "liked") {
        if (!innerContext.musicLibrary?.importLikedSongs) {
          redirect(innerRes, buildMusicReturnTo(theme, {
            error: "Music library setup is not available yet. Please restart or redeploy Ghostlight.",
          }));
          return;
        }

        let result;
        try {
          result = await innerContext.musicLibrary.importLikedSongs({
            userScope,
            limit,
          });
        } catch (err) {
          redirect(innerRes, buildMusicReturnTo(theme, { error: err.message || "Failed to import liked songs." }));
          return;
        }
        const syncNote = result.syncSkipped
          ? " Music search sync was skipped because Qdrant or embeddings are not configured."
          : ` Synced ${result.syncedCount} to music search.`;

        redirect(innerRes, buildMusicReturnTo(theme, {
          message: `${formatMusicImportSummary(result, "liked songs")}${syncNote}`,
        }));
        return;
      }

      const playlistId = source.startsWith("playlist:")
        ? source.slice("playlist:".length).trim()
        : source;

      if (!playlistId) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Choose liked songs or a Spotify playlist to import.",
        }));
        return;
      }

      if (!innerContext.musicLibrary?.importPlaylist) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Music library setup is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      let result;
      try {
        result = await innerContext.musicLibrary.importPlaylist({
          userScope,
          playlistId,
          limit,
        });
      } catch (err) {
        redirect(innerRes, buildMusicReturnTo(theme, { error: err.message || "Failed to import playlist." }));
        return;
      }
      const syncNote = result.syncSkipped
        ? " Music search sync was skipped because Qdrant or embeddings are not configured."
        : ` Synced ${result.syncedCount} to music search.`;

      redirect(innerRes, buildMusicReturnTo(theme, {
        message: `${formatMusicImportSummary(result, "playlist tracks")}${syncNote}`,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-liked-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";
      const limit = normalizeImportLimit(fields.importLimit || fields.limit);

      if (!innerContext.musicLibrary?.importLikedSongs) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Music library setup is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const result = await innerContext.musicLibrary.importLikedSongs({
        userScope: innerContext.config.memory?.userScope || "user",
        limit,
      });
      const syncNote = result.syncSkipped
        ? " Music search sync was skipped because Qdrant or embeddings are not configured."
        : ` Synced ${result.syncedCount} to music search.`;

      redirect(innerRes, buildMusicReturnTo(theme, {
        message: `${formatMusicImportSummary(result, "liked songs")}${syncNote}`,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-playlist-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";
      const limit = normalizeImportLimit(fields.importLimit || fields.limit);
      const playlistId = String(fields.playlistId || "").trim();

      if (!playlistId) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Choose a Spotify playlist to import.",
        }));
        return;
      }

      if (!innerContext.musicLibrary?.importPlaylist) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Music library setup is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      let result;
      try {
        result = await innerContext.musicLibrary.importPlaylist({
          userScope: innerContext.config.memory?.userScope || "user",
          playlistId,
          limit,
        });
      } catch (err) {
        redirect(innerRes, buildMusicReturnTo(theme, { error: err.message || "Failed to import playlist." }));
        return;
      }
      const syncNote = result.syncSkipped
        ? " Music search sync was skipped because Qdrant or embeddings are not configured."
        : ` Synced ${result.syncedCount} to music search.`;

      redirect(innerRes, buildMusicReturnTo(theme, {
        message: `${formatMusicImportSummary(result, "playlist tracks")}${syncNote}`,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-library-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields, files } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";

      if (!innerContext.musicLibrary?.importLibraryData) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Music library import is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const result = await innerContext.musicLibrary.importLibraryData({
        userScope: innerContext.config.memory?.userScope || "user",
        payload: parseMusicLibraryImportPayload(files),
      });
      const syncNote = result.syncSkipped
        ? " Music search sync was skipped because Qdrant or embeddings are not configured."
        : ` Synced ${result.syncedCount} to music search.`;

      redirect(innerRes, buildMusicReturnTo(theme, {
        message: `Imported ${result.importedTrackCount} tracks, ${result.importedAffinityCount} notes, and ${result.importedPlaylistCount} playlists.${syncNote}`,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-search-rebuild") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";

      if (!innerContext.musicLibrary?.rebuildMusicSearchIndex) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Music search rebuild is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const result = await innerContext.musicLibrary.rebuildMusicSearchIndex({
        userScope: innerContext.config.memory?.userScope || "user",
      });

      if (result.skipped) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: result.reason || "Music search rebuild was skipped.",
        }));
        return;
      }

      redirect(innerRes, buildMusicReturnTo(theme, {
        message: `Rebuilt music search from Postgres: synced ${result.syncedTrackCount || 0} tracks and ${result.syncedPlaylistCount || 0} playlists.`,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-delete-unprofiled") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";

      if (!innerContext.musicLibrary?.deleteUnprofiledTracks) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Music library cleanup is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const result = await innerContext.musicLibrary.deleteUnprofiledTracks({
        userScope: innerContext.config.memory?.userScope || "user",
      });

      redirect(innerRes, buildMusicReturnTo(theme, {
        message: `Deleted ${result.deletedCount} unprofiled music track${result.deletedCount === 1 ? "" : "s"} from Ghostlight.${formatMusicQdrantDeleteNote(result)}`,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-reset") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";
      const confirmed = normalizeMusicCheckbox(fields.confirmReset);

      if (!confirmed) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Use the Clear Imported Music Library button to confirm the local music library reset.",
        }));
        return;
      }

      if (!innerContext.musicLibrary?.resetLibrary) {
        redirect(innerRes, buildMusicReturnTo(theme, {
          error: "Music library reset is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const result = await innerContext.musicLibrary.resetLibrary({
        userScope: innerContext.config.memory?.userScope || "user",
      });

      redirect(innerRes, buildMusicReturnTo(theme, {
        message: `Reset local music library: deleted ${result.deletedTrackCount} tracks, ${result.deletedAffinityCount} notes, and ${result.deletedPlaylistCount} playlists. Spotify remains connected.${formatMusicQdrantDeleteNote(result)}`,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-playlist-sync") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";
      const returnTo = buildMusicGalleryReturnTo(fields.returnTo, theme);
      const playlistId = String(fields.playlistId || "").trim();

      if (!playlistId) {
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Choose a tracked Spotify playlist to sync.",
        }));
        return;
      }

      if (!innerContext.musicLibrary?.syncTrackedPlaylist) {
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Music playlist sync is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const result = await innerContext.musicLibrary.syncTrackedPlaylist({
        userScope: innerContext.config.memory?.userScope || "user",
        spotifyPlaylistId: playlistId,
      });
      const syncNote = result.syncSkipped
        ? " Music search sync was skipped because Qdrant or embeddings are not configured."
        : ` Synced ${result.syncedCount} to music search.`;

      redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
        message: `Synced playlist; ${result.storedTrackCount} tracks are now tracked locally.${syncNote}`,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-track-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";
      const returnTo = buildMusicGalleryReturnTo(fields.returnTo, theme);
      const musicTrackId = String(fields.musicTrackId || "").trim();

      if (!musicTrackId) {
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Choose a track before deleting it.",
        }));
        return;
      }

      if (!innerContext.musicLibrary?.deleteTrack) {
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Music track deletion is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const result = await innerContext.musicLibrary.deleteTrack({
        userScope: innerContext.config.memory?.userScope || "user",
        musicTrackId,
      });

      const trackLabel = result.track?.title ? `"${result.track.title}"` : "that track";
      const message = result.deletedCount
        ? `Deleted ${trackLabel} from the local music library. Spotify was not changed.${formatMusicQdrantDeleteNote(result)}`
        : "That music track was not found in the local library.";

      redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
        [result.deletedCount ? "message" : "error"]: message,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-preference-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";
      const returnTo = buildMusicGalleryReturnTo(fields.returnTo, theme);
      const musicTrackId = String(fields.musicTrackId || "").trim();
      const wantsJson = wantsMusicJson(innerReq);

      if (!musicTrackId) {
        if (wantsJson) {
          return sendMusicJson(innerRes, 400, {
            ok: false,
            error: "Choose a track before saving a music note.",
          });
        }
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Choose a track before saving a music note.",
        }));
        return;
      }

      if (!innerContext.musicLibrary?.recordPreference) {
        if (wantsJson) {
          return sendMusicJson(innerRes, 503, {
            ok: false,
            error: "Music preference storage is not available yet. Please restart or redeploy Ghostlight.",
          });
        }
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Music preference storage is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const reaction = normalizeMusicPreferenceReaction(fields.reaction);
      const note = String(fields.note || "").trim();
      const tags = normalizeMusicPreferenceTags(fields.tags);
      const userGenres = normalizeMusicGenreList(fields.userGenres);
      const result = await innerContext.musicLibrary.recordPreference({
        userScope: innerContext.config.memory?.userScope || "user",
        musicTrackId,
        actor: "user",
        reaction,
        note,
        tags,
      });

      if (innerContext.musicLibrary.updateTrackUserGenres) {
        await innerContext.musicLibrary.updateTrackUserGenres({
          userScope: innerContext.config.memory?.userScope || "user",
          musicTrackId,
          userGenres,
        });
      }

      if (wantsJson) {
        return sendMusicJson(innerRes, 200, {
          ok: true,
          musicTrackId,
          trackTitle: result.track?.title || "",
          reaction,
          note,
          tags,
          userGenres,
          message: `Saved music note for "${result.track?.title || "track"}".`,
        });
      }

      redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
        message: `Saved music note for "${result.track.title}".`,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-playlist-profile-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";
      const returnTo = buildMusicGalleryReturnTo(fields.returnTo, theme);
      const musicPlaylistId = String(fields.musicPlaylistId || "").trim();

      if (!musicPlaylistId) {
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Choose a playlist before saving playlist details.",
        }));
        return;
      }

      if (!innerContext.musicLibrary?.updatePlaylistProfile) {
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Music playlist profile storage is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const result = await innerContext.musicLibrary.updatePlaylistProfile({
        userScope: innerContext.config.memory?.userScope || "user",
        musicPlaylistId,
        userNote: String(fields.userNote || "").trim(),
        tags: normalizeMusicPreferenceTags(fields.tags),
      });

      redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
        message: `Saved playlist details for "${result.playlist.name}".`,
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-playlist-favorite-toggle") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";
      const returnTo = buildMusicGalleryReturnTo(fields.returnTo, theme);
      const musicPlaylistId = String(fields.musicPlaylistId || "").trim();
      const wantsJson = wantsMusicJson(innerReq);

      if (!musicPlaylistId) {
        if (wantsJson) {
          return sendMusicJson(innerRes, 400, {
            ok: false,
            error: "Choose a playlist before updating favourite status.",
          });
        }
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Choose a playlist before updating favourite status.",
        }));
        return;
      }

      if (!innerContext.musicLibrary?.updatePlaylistFavorite) {
        if (wantsJson) {
          return sendMusicJson(innerRes, 503, {
            ok: false,
            error: "Music playlist favourite storage is not available yet. Please restart or redeploy Ghostlight.",
          });
        }
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Music playlist favourite storage is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const result = await innerContext.musicLibrary.updatePlaylistFavorite({
        userScope: innerContext.config.memory?.userScope || "user",
        musicPlaylistId,
        isFavorite: normalizeMusicCheckbox(fields.isFavorite),
      });

      if (wantsJson) {
        return sendMusicJson(innerRes, 200, {
          ok: true,
          musicPlaylistId,
          playlistName: result.playlist?.name || "",
          isFavorite: Boolean(result.playlist?.isFavorite),
          message: result.playlist?.isFavorite ? "Added to favourites." : "Removed from favourites.",
        });
      }

      redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
        message: result.playlist?.isFavorite ? "Added playlist to favourites." : "Removed playlist from favourites.",
      }));
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/music-playlist-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = fields.theme || url.searchParams.get("theme") || "light";
      const returnTo = buildMusicGalleryReturnTo(fields.returnTo, theme);
      const musicPlaylistId = String(fields.musicPlaylistId || "").trim();

      if (!musicPlaylistId) {
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Choose a playlist before deleting it.",
        }));
        return;
      }

      if (!innerContext.musicLibrary?.deletePlaylist) {
        redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
          error: "Music playlist deletion is not available yet. Please restart or redeploy Ghostlight.",
        }));
        return;
      }

      const result = await innerContext.musicLibrary.deletePlaylist({
        userScope: innerContext.config.memory?.userScope || "user",
        musicPlaylistId,
      });

      const playlistLabel = result.playlist?.name ? `"${result.playlist.name}"` : "that playlist";
      const message = result.deletedCount
        ? `Deleted ${playlistLabel} from the local music playlist library. Spotify was not changed.${formatMusicQdrantDeleteNote(result)}`
        : "That music playlist was not found in the local library.";

      redirect(innerRes, buildMusicGalleryReturnTo(returnTo, theme, {
        [result.deletedCount ? "message" : "error"]: message,
      }));
    })(req, res, context);
  }

  return false;
}

module.exports = {
  handleMusicActions,
  formatMusicImportSummary,
  parseMusicLibraryImportPayload,
  normalizeMusicGenreList,
};
