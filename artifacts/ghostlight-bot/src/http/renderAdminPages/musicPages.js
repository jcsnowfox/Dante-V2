const { renderHelpIcon, renderPageIntro, renderSubnav } = require("./shared");
const { SPOTIFY_CURATION_GUIDANCE_LIMIT } = require("../../config/runtimeSettings");
const {
  DEFAULT_IMPORT_LIMIT,
  MAX_IMPORT_LIMIT,
  SPOTIFY_CURRENTLY_PLAYING_SCOPE,
  SPOTIFY_PLAYLIST_MODIFY_PRIVATE_SCOPE,
  SPOTIFY_PLAYLIST_MODIFY_PUBLIC_SCOPE,
  SPOTIFY_PLAYBACK_MODIFY_SCOPE,
  SPOTIFY_PLAYLIST_READ_PRIVATE_SCOPE,
  SPOTIFY_UGC_IMAGE_UPLOAD_SCOPE,
  hasSpotifyConfig,
  hasSpotifyScope,
} = require("../../music/spotify");

function renderMusicToolsPage({
  config,
  connection = null,
  trackCount = 0,
  playlists = [],
  playlistError = "",
  inferredRedirectUri = "",
  url = null,
  currentSection = "tools",
  theme = "light",
  helpers,
}) {
  const {
    escapeHtml,
    getMessage,
    getError,
    formatDateValue,
    withThemeField,
  } = helpers;
  const renderConfirmOnSubmit = helpers.renderConfirmOnSubmit
    || ((messageText) => ` onsubmit="return confirm('${escapeHtml(String(messageText || "").replace(/'/g, "\\'"))}')"`); 
  const tabs = [
    { key: "images", label: "Image Generation", path: "/admin/tools/images" },
    { key: "audio", label: "Voice & Audio", path: "/admin/tools/audio" },
    { key: "gifs", label: "GIF Search", path: "/admin/tools/gifs" },
    { key: "music", label: "Spotify", path: "/admin/tools/music" },
  ];
  const callbackUrl = String(config.spotify?.redirectUri || inferredRedirectUri || "").trim()
    || "https://YOUR-GHOSTLIGHT-APP.up.railway.app/admin/actions/music-spotify-callback";
  const spotifyReady = hasSpotifyConfig(config, { redirectUri: callbackUrl });
  const connected = Boolean(connection?.refreshToken);
  const currentTrackScopeReady = !connected || hasSpotifyScope(connection?.scope || "", SPOTIFY_CURRENTLY_PLAYING_SCOPE);
  const playlistScopeReady = !connected || hasSpotifyScope(connection?.scope || "", SPOTIFY_PLAYLIST_READ_PRIVATE_SCOPE);
  const playlistCreateScopeReady = !connected || (
    hasSpotifyScope(connection?.scope || "", SPOTIFY_PLAYLIST_MODIFY_PRIVATE_SCOPE)
    && hasSpotifyScope(connection?.scope || "", SPOTIFY_PLAYLIST_MODIFY_PUBLIC_SCOPE)
  );
  const coverUploadScopeReady = !connected || hasSpotifyScope(connection?.scope || "", SPOTIFY_UGC_IMAGE_UPLOAD_SCOPE);
  const playbackScopeReady = !connected || hasSpotifyScope(connection?.scope || "", SPOTIFY_PLAYBACK_MODIFY_SCOPE);
  const qdrantReady = Boolean(config.qdrant?.url && config.qdrant?.musicCollection);
  const imageGenerationReady = Boolean(config.imageGeneration?.enabled);
  const spotifyEnabled = config.spotify?.enabled !== false;
  const playlistCoversEnabled = Boolean(config.spotify?.createPlaylistCovers);
  const curationGuidance = String(config.spotify?.curationGuidance || "").slice(0, SPOTIFY_CURATION_GUIDANCE_LIMIT);
  const configuredRedirectUri = String(config.spotify?.redirectUri || "").trim();
  const detectedRedirectUri = String(inferredRedirectUri || "").trim();
  const redirectUriMatchesDetected = Boolean(configuredRedirectUri && detectedRedirectUri && configuredRedirectUri === detectedRedirectUri);
  const callbackSource = config.spotify?.redirectUri
    ? "configured"
    : inferredRedirectUri
      ? "detected"
      : "placeholder";
  const message = getMessage && url ? getMessage(url) : "";
  const error = getError && url ? getError(url) : "";
  const playlistOptions = Array.isArray(playlists)
    ? playlists.map((playlist) => {
      const importable = playlist.importable !== false;
      const ownerText = playlist.ownerDisplayName ? `, ${playlist.ownerDisplayName}` : "";
      const unavailableText = importable ? "" : " — cannot import unless owned/collaborative";
      return [
        `<option value="playlist:${escapeHtml(playlist.spotifyPlaylistId)}"${importable ? "" : " disabled"}>`,
        escapeHtml(`${playlist.name} (${playlist.trackCount || 0} tracks${ownerText})${unavailableText}`),
        "</option>",
      ].join("");
    })
    : [];
  const importSourceOptions = [
    "<option value=\"\">Select a playlist</option>",
    "<option value=\"liked\">Import liked songs</option>",
    ...playlistOptions,
  ];

  return [
    renderPageIntro({
      title: "Tools",
      copy: "",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: "music", theme, helpers }),
    "</section>",
    message ? `<div class="notice success">${escapeHtml(message)}</div>` : "",
    error ? `<div class="notice error">${escapeHtml(error)}</div>` : "",
    "<section class=\"lite-panel page-frame settings-form no-divider\">",
    `<form method="post" action="/admin/actions/settings-save" class="stack">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/tools/music\">",
    "<input type=\"hidden\" name=\"spotifyEnabled\" value=\"false\">",
    "<input type=\"hidden\" name=\"spotifyCreatePlaylistCovers\" value=\"false\">",
    "<label class=\"switch-field image-settings-toggle\">",
    "<span class=\"switch-control\">",
    `<input type="checkbox" name="spotifyEnabled" value="true"${spotifyEnabled ? " checked" : ""}>`,
    "<span></span>",
    "</span>",
    "<span class=\"switch-label\">Enable Spotify Music Curation</span>",
    "</label>",
    "<label class=\"switch-field image-settings-toggle\">",
    "<span class=\"switch-control\">",
    `<input type="checkbox" name="spotifyCreatePlaylistCovers" value="true"${playlistCoversEnabled ? " checked" : ""}${imageGenerationReady ? "" : " disabled"}>`,
    "<span></span>",
    "</span>",
    `<span class="switch-label">${imageGenerationReady ? "Create playlist covers for AI Spotify playlists" : "Image generation must be enabled before playlist covers can be created"}</span>`,
    "</label>",
    `<label class="stack"><span class="field-label-with-help"><span>Curation Guidance</span>${renderHelpIcon({ help: "Short standing guidance for AI playlist curation, such as artists to avoid, broad taste boundaries, or playlist habits to respect." }, helpers)}</span>`,
    `<textarea name="spotifyCurationGuidance" maxlength="${SPOTIFY_CURATION_GUIDANCE_LIMIT}" rows="4" placeholder="Example: Avoid Florence + The Machine. Prefer strange, moody, specific picks over generic pop.">${escapeHtml(curationGuidance)}</textarea></label>`,
    "<div class=\"toolbar command-save-row\"><button type=\"submit\" class=\"toolbar-button secondary\">Save Spotify Settings</button></div>",
    "</form>",
    "<div class=\"form-divider\"></div>",
    "<div class=\"copy-block\"><h3>Spotify Connection</h3>",
    spotifyReady ? "" : "<p class=\"meta\">Add Spotify app credentials in Railway before connecting.</p>",
    "</div>",
    spotifyReady && redirectUriMatchesDetected
      ? ""
      : [
        "<div class=\"copy-block\">",
        "<h3>Spotify Redirect URI</h3>",
        `<p class="meta">${callbackSource === "detected" ? "Ghostlight detected this from the current admin page URL." : "Copy this into Spotify Developer Dashboard → your app → Redirect URIs."} It should also be saved in Railway as SPOTIFY_REDIRECT_URI.</p>`,
        `<p><code>${escapeHtml(callbackUrl)}</code></p>`,
        "</div>",
      ].join(""),
    connected && !currentTrackScopeReady
      ? "<div class=\"notice\">Reconnect Spotify to enable currently-playing track lookup.</div>"
      : "",
    connected && !playlistScopeReady
      ? "<div class=\"notice\">Reconnect Spotify to enable playlist import.</div>"
      : "",
    connected && !playlistCreateScopeReady
      ? "<div class=\"notice\">Reconnect Spotify to enable AI-created playlists and track adding.</div>"
      : "",
    connected && playlistCoversEnabled && !coverUploadScopeReady
      ? "<div class=\"notice\">Reconnect Spotify to enable AI-created playlist cover uploads.</div>"
      : "",
    connected && !playbackScopeReady
      ? "<div class=\"notice\">Reconnect Spotify to enable active-player music starting.</div>"
      : "",
    "<div class=\"model-table-wrap\"><table class=\"model-table\"><thead><tr><th>Status</th><th>Account</th><th>Tracks</th><th>Last Import</th></tr></thead><tbody><tr>",
    `<td data-label="Status">${escapeHtml(connected ? "Connected" : "Not connected")}</td>`,
    `<td data-label="Account">${escapeHtml(connection?.spotifyDisplayName || "-")}</td>`,
    `<td data-label="Tracks">${escapeHtml(String(trackCount || 0))}</td>`,
    `<td data-label="Last Import">${escapeHtml(formatDateValue(connection?.lastImportAt) || "-")}</td>`,
    "</tr></tbody></table></div>",
    "<div class=\"toolbar section-offset\">",
    `<form method="post" action="/admin/actions/music-spotify-connect" class="inline-form">`,
    withThemeField(theme),
    `<button type="submit" class="toolbar-button secondary"${spotifyReady ? "" : " disabled"}>${connected ? "Reconnect Spotify" : "Connect Spotify"}</button>`,
    "</form>",
    "</div>",
    "<div class=\"form-divider\"></div>",
    `<div class="copy-block"><h3>Import Music ${renderHelpIcon({ help: "Import track data to let your AI search and recommend music, and create playlists." }, helpers)}</h3></div>`,
    playlistError
      ? `<p class="notice error">${escapeHtml(playlistError)}</p>`
      : "",
    `<form method="post" action="/admin/actions/music-import" class="toolbar schedule-inline-actions music-import-row">`,
    withThemeField(theme),
    "<div class=\"toolbar-field select music-import-source\"><label for=\"musicImportSource\">Source</label>",
    `<select id="musicImportSource" name="source"${connected ? "" : " disabled"}>`,
    importSourceOptions.join(""),
    "</select></div>",
    "<div class=\"toolbar-field\"><label for=\"musicImportLimit\">Limit</label>",
    `<input id="musicImportLimit" name="importLimit" type="number" min="1" max="${MAX_IMPORT_LIMIT}" value="${DEFAULT_IMPORT_LIMIT}"${connected ? "" : " disabled"}></div>`,
    `<button type="submit" class="toolbar-button secondary"${connected ? "" : " disabled"}>Import</button>`,
    "</form>",
    qdrantReady
      ? ""
      : "<p class=\"meta section-offset\">Music search sync needs Qdrant and embeddings configured. Imports can still save tracks locally once Spotify is connected.</p>",
    "<div class=\"form-divider\"></div>",
    `<div class="copy-block"><h3>Music Search Index ${renderHelpIcon({ help: "Rebuild the Qdrant music search index from the current Postgres library. Use this if search returns stale tracks or old ids." }, helpers)}</h3></div>`,
    "<div class=\"toolbar schedule-inline-actions\">",
    `<form method="post" action="/admin/actions/music-search-rebuild" class="inline-form"${renderConfirmOnSubmit("Rebuild the music search index from the current local music library?\n\nThis clears and recreates Ghostlight's music search points in Qdrant. Spotify will not be affected.")}>`,
    withThemeField(theme),
    `<button type="submit" class="toolbar-button secondary"${qdrantReady ? "" : " disabled"}>Rebuild Music Search</button>`,
    "</form>",
    "</div>",
    "<div class=\"form-divider\"></div>",
    `<div class="copy-block"><h3>Music Library Backup ${renderHelpIcon({ help: "Export, restore, or clean up your local music library. This doesn't affect anything on your Spotify account." }, helpers)}</h3></div>`,
    `<form method="post" action="/admin/actions/music-library-import" enctype="multipart/form-data" class="toolbar backup-action-row">`,
    withThemeField(theme),
    "<div class=\"file-picker-row admin-file-picker-row\">",
    "<label class=\"toolbar-button secondary file-picker-button\" for=\"musicLibraryImportFile\">Choose file</label>",
    "<span class=\"file-picker-label\" data-file-picker-label=\"musicLibraryImportFile\">No file selected</span>",
    "<input id=\"musicLibraryImportFile\" name=\"musicLibraryFile\" type=\"file\" accept=\"application/json,.json\" required aria-label=\"Import music library JSON\" class=\"file-picker-input\">",
    "</div>",
    "<button type=\"submit\" class=\"toolbar-button secondary\">Import Data</button>",
    `<a class="toolbar-button secondary" href="/admin/exports/music-library?theme=${escapeHtml(theme)}">Export Music Data</a>`,
    "</form>",
    "<div class=\"form-divider\"></div>",
    `<div class="copy-block"><h3>Delete Data ${renderHelpIcon({ help: "Remove tracks you haven't added notes or tags to, or start fresh and clear your whole library. Spotify won't be affected." }, helpers)}</h3></div>`,
    "<div class=\"toolbar schedule-inline-actions\">",
    `<form method="post" action="/admin/actions/music-delete-unprofiled" class="inline-form"${renderConfirmOnSubmit("Delete unprofiled music tracks from Ghostlight?\n\nThis removes local tracks with no user or AI notes. It will not change Spotify.")}>`,
    withThemeField(theme),
    "<button type=\"submit\" class=\"toolbar-button secondary\">Remove Untagged Tracks</button>",
    "</form>",
    `<form method="post" action="/admin/actions/music-reset" class="inline-form schedule-inline-actions"${renderConfirmOnSubmit("Reset the local music library?\n\nThis deletes local tracks, music notes, tracked playlists, and music search points. It will not disconnect Spotify or change Spotify playlists.")}>`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"confirmReset\" value=\"true\">",
    "<button type=\"submit\" class=\"toolbar-button danger\">Clear Imported Music Library</button>",
    "</form>",
    "</div>",
    "<script>",
    "(()=>{",
    "document.querySelectorAll('.admin-file-picker-row .file-picker-input').forEach((fileInput)=>{",
    "const fileLabel=document.querySelector(`[data-file-picker-label=\"${fileInput.id}\"]`);",
    "fileInput.addEventListener('change',()=>{",
    "if(!fileLabel){return;}",
    "const count=fileInput.files?.length||0;",
    "fileLabel.textContent=count?(count===1?fileInput.files[0].name:`${count} files selected`):'No file selected';",
    "});",
    "});",
    "})();",
    "</script>",
    "</section>",
  ].filter(Boolean).join("");
}

function formatMusicArtists(artists = []) {
  return (Array.isArray(artists) ? artists : [])
    .map((artist) => (typeof artist === "string" ? artist : artist?.name))
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .join(", ");
}

function formatMusicSourceLabel(source = "") {
  return {
    spotify_liked: "Liked songs",
    spotify_playlist: "Imported playlist",
    spotify_ai_playlist: "AI playlist",
    ai_curated: "AI curated",
  }[source] || source || "Unknown";
}

function formatMusicReactionLabel(reaction = "") {
  return {
    likes: "Likes",
    dislikes: "Dislikes",
    neutral: "Neutral",
    recommended: "Recommended",
    curious: "Curious",
  }[reaction] || reaction || "Neutral";
}

function formatMusicTags(tags = [], helpers) {
  const { escapeHtml } = helpers;
  const normalized = Array.isArray(tags)
    ? tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];

  if (!normalized.length) {
    return "";
  }

  return `<div class="memory-chip-row">${normalized.map((tag) => `<span class="badge domain">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function formatMusicTagsInput(tags = []) {
  return Array.isArray(tags)
    ? tags.map((tag) => String(tag || "").trim()).filter(Boolean).join(", ")
    : "";
}

function renderMusicSelectedFilterPills(selectedOptions = [], helpers) {
  const { escapeHtml } = helpers;
  const options = Array.isArray(selectedOptions) ? selectedOptions.filter((option) => option?.value) : [];

  if (!options.length) {
    return "<div class=\"memory-chip-row\" data-selected-filter-pills></div>";
  }

  return [
    "<div class=\"memory-chip-row\" data-selected-filter-pills>",
    ...options.map((option) => `<button type="button" class="toolbar-button secondary" data-filter-remove="${escapeHtml(option.value)}">${escapeHtml(option.label || option.value)} ×</button>`),
    "</div>",
  ].join("");
}

function formatMusicYear(track = {}) {
  const year = Number.parseInt(String(track.releaseYear || "").trim(), 10);
  if (Number.isFinite(year) && year > 0) {
    return String(year);
  }

  const match = String(track.albumReleaseDate || "").match(/\b\d{4}\b/);
  return match ? match[0] : "";
}

function formatMusicNoteExcerpt(note = "", maxLength = 120) {
  const normalized = String(note || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function formatMusicAiNotesExcerpt(affinities = [], helpers) {
  const { escapeHtml } = helpers;
  const lines = (Array.isArray(affinities) ? affinities : [])
    .map((affinity) => {
      const name = affinity.actorDisplayName || affinity.actorKey || "AI";
      const note = String(affinity.note || "").trim();
      const tags = Array.isArray(affinity.tags) && affinity.tags.length
        ? ` Tags: ${affinity.tags.join(", ")}.`
        : "";
      const text = note || `${formatMusicReactionLabel(affinity.reaction)}.${tags}`;
      return text ? `${name}: ${text}${note && tags ? tags : ""}` : "";
    })
    .filter(Boolean);

  if (!lines.length) {
    return "";
  }

  const excerpt = lines.join(" ").slice(0, 280);
  return `<p class="meta music-ai-note-excerpt">${escapeHtml(excerpt)}${lines.join(" ").length > 280 ? "..." : ""}</p>`;
}

function renderMusicGalleryPage({
  currentTab = "tracks",
  tracks = [],
  playlists = [],
  availableTrackTags = [],
  availablePlaylistTags = [],
  filters = {},
  page = 1,
  pageSize = 25,
  totalItems = 0,
  theme = "light",
  helpers,
}) {
  const {
    escapeHtml,
    buildAdminLocation,
    formatDateValue,
    withThemeField,
    renderIconImage = () => "×",
  } = helpers;
  const renderConfirmOnSubmit = helpers.renderConfirmOnSubmit
    || ((messageText) => ` onsubmit="return confirm('${escapeHtml(String(messageText || "").replace(/'/g, "\\'"))}')"`); 
  const selectedTab = currentTab === "playlists" ? "playlists" : "tracks";
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
  const previousPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const basePath = selectedTab === "playlists" ? "/admin/gallery/music/playlists" : "/admin/gallery/music";
  const filterExtras = {
    q: filters.q || "",
    ...(selectedTab === "playlists"
      ? {
        filterTags: Array.isArray(filters.filterTags) ? filters.filterTags.join(",") : "",
      }
      : {
        filterTags: Array.isArray(filters.filterTags) ? filters.filterTags.join(",") : "",
        sort: filters.sort || "",
        direction: filters.direction || "",
      }),
  };
  const availableFilterTags = selectedTab === "playlists" ? availablePlaylistTags : availableTrackTags;
  const availableFilterTagMap = new Map((availableFilterTags || []).map((option) => [option.value, option.label]));
  const selectedFilterTagOptions = (Array.isArray(filters.filterTags) ? filters.filterTags : [])
    .map((value) => ({
      value,
      label: availableFilterTagMap.get(value) || value,
    }));
  const trackSortKey = filters.sort || "updated";
  const trackSortDirection = filters.direction === "asc" ? "asc" : "desc";
  const buildTrackSortLink = (sortKey) => {
    const nextDirection = trackSortKey === sortKey && trackSortDirection === "asc" ? "desc" : "asc";
    return buildAdminLocation({
      path: basePath,
      theme,
      extra: {
        ...filterExtras,
        sort: sortKey,
        direction: nextDirection,
        page: 1,
      },
    });
  };
  const renderSortableTrackHeader = (label, sortKey) => {
    const marker = trackSortKey === sortKey ? (trackSortDirection === "asc" ? " ↑" : " ↓") : "";
    return `<a class="sort-link" href="${escapeHtml(buildTrackSortLink(sortKey))}">${escapeHtml(`${label}${marker}`)}</a>`;
  };
  const pagination = [
    "<div class=\"form-divider\"></div>",
    "<div class=\"toolbar\" style=\"justify-content:center\">",
    previousPage
      ? `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: basePath, theme, extra: { ...filterExtras, page: previousPage } }))}">Previous</a>`
      : "<span class=\"button-link button-link-secondary\" aria-disabled=\"true\">Previous</span>",
    `<span class="meta">Page ${escapeHtml(String(page))} of ${escapeHtml(String(totalPages))}</span>`,
    nextPage
      ? `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: basePath, theme, extra: { ...filterExtras, page: nextPage } }))}">Next</a>`
      : "<span class=\"button-link button-link-secondary\" aria-disabled=\"true\">Next</span>",
    "</div>",
  ].join("");
  const reactionOptions = [
    ["likes", "Likes"],
    ["dislikes", "Dislikes"],
    ["neutral", "Neutral"],
    ["curious", "Curious"],
    ["recommended", "Recommended"],
  ];
  const returnTo = buildAdminLocation({
    path: basePath,
    theme,
    extra: { ...filterExtras, page: page > 1 ? page : "" },
  });
  const trackRows = tracks.map((track) => {
    const userAffinity = track.userAffinity || {};
    const aiAffinities = Array.isArray(track.aiAffinities) ? track.aiAffinities : [];
    const selectedReaction = userAffinity.reaction || "neutral";
    const safeTrackId = String(track.musicTrackId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const formId = `musicPreferenceForm${safeTrackId}`;
    const deleteFormId = `musicTrackDeleteForm${safeTrackId}`;
    const detailId = `musicTrackDetail${safeTrackId}`;
    const title = track.title || "Untitled";
    const artist = formatMusicArtists(track.artists) || "Unknown artist";
    const year = formatMusicYear(track);
    const noteExcerpt = formatMusicNoteExcerpt(userAffinity.note || "");
    const genrePlaceholder = formatMusicTagsInput(track.artistGenres) || "Add genres";
    return [
      `<tr class="music-track-summary-row" data-music-track-summary-row data-music-track-target="${escapeHtml(detailId)}" tabindex="0">`,
      "<td data-label=\"Song\" class=\"table-detail-cell music-track-title-cell\">",
      `<button type="button" class="music-track-toggle" data-music-track-toggle="${escapeHtml(detailId)}" aria-expanded="false" aria-controls="${escapeHtml(detailId)}">`,
      "<span class=\"music-track-toggle-icon\" aria-hidden=\"true\">+</span>",
      `<span class="music-track-summary-title">${escapeHtml(title)}</span>`,
      "</button>",
      "</td>",
      `<td data-label="Artist">${escapeHtml(artist)}</td>`,
      `<td data-label="Reaction" data-music-track-reaction>${escapeHtml(formatMusicReactionLabel(selectedReaction))}</td>`,
      `<td data-label="Notes" class="table-detail-cell music-note-excerpt-cell" data-music-track-note>${noteExcerpt ? `<p class="music-note-excerpt">${escapeHtml(noteExcerpt)}</p>` : ""}</td>`,
      "</tr>",
      `<tr id="${escapeHtml(detailId)}" class="music-track-detail-row" hidden>`,
      "<td colspan=\"4\">",
      "<div class=\"music-track-drawer\">",
      "<div class=\"music-track-drawer-head\">",
      `<h3>${track.spotifyUrl ? `<a href="${escapeHtml(track.spotifyUrl)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>` : escapeHtml(title)} <span>${escapeHtml(artist)}</span></h3>`,
      "<div class=\"memory-chip-row\">",
      year ? `<span class="badge">${escapeHtml(year)}</span>` : "",
      `<span class="badge type">${escapeHtml(formatMusicSourceLabel(track.source))}</span>`,
      "</div>",
      "</div>",
      `<form id="${escapeHtml(deleteFormId)}" method="post" action="/admin/actions/music-track-delete" class="music-track-delete-form"${renderConfirmOnSubmit("Delete this track from the local Ghostlight music library?\\n\\nThis removes local notes, playlist membership, and search data for this entry. Spotify will not be changed.")}>`,
      withThemeField(theme),
      `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">`,
      `<input type="hidden" name="musicTrackId" value="${escapeHtml(track.musicTrackId)}">`,
      "</form>",
      `<form id="${escapeHtml(formId)}" method="post" action="/admin/actions/music-preference-save" class="music-track-editor-form">`,
      withThemeField(theme),
      `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">`,
      `<input type="hidden" name="musicTrackId" value="${escapeHtml(track.musicTrackId)}">`,
      "<div class=\"music-track-editor-field\">",
      "<label>Reaction</label>",
      "<select name=\"reaction\" aria-label=\"Reaction\">",
      ...reactionOptions.map(([value, label]) => `<option value="${escapeHtml(value)}"${selectedReaction === value ? " selected" : ""}>${escapeHtml(label)}</option>`),
      "</select>",
      "</div>",
      "<div class=\"music-track-editor-field music-track-editor-notes\">",
      "<label>Notes</label>",
      `<input name="note" type="text" value="${escapeHtml(userAffinity.note || "")}" placeholder="Why this track matters" aria-label="Notes">`,
      "</div>",
      "<div class=\"music-track-editor-field\">",
      "<label>Tags</label>",
      `<input name="tags" type="text" value="${escapeHtml(formatMusicTagsInput(userAffinity.tags))}" placeholder="favourite, nostalgic" aria-label="Tags">`,
      "</div>",
      "<div class=\"music-track-editor-field\">",
      "<label>Genres</label>",
      `<input name="userGenres" type="text" value="${escapeHtml(formatMusicTagsInput(track.userGenres))}" placeholder="${escapeHtml(genrePlaceholder)}" aria-label="Genres">`,
      "</div>",
      "<div class=\"music-track-editor-save\"><button type=\"submit\" class=\"toolbar-button secondary\" data-music-track-save-button>Save</button></div>",
      `<div class="music-track-editor-delete"><button type="submit" form="${escapeHtml(deleteFormId)}" class="icon-button gallery-round-action gallery-round-action-delete audio-delete-button music-track-delete-button" aria-label="Delete local music entry" title="Delete local music entry">${renderIconImage("delete", theme, "", "table-action-icon")}</button></div>`,
      "</form>",
      aiAffinities.length
        ? `<div class="music-track-ai-comments"><h4>AI comments</h4>${formatMusicAiNotesExcerpt(aiAffinities, helpers)}</div>`
        : "",
      "</div>",
      "</td>",
      "</tr>",
    ].join("");
  }).join("");
  const playlistRows = playlists.map((playlist, index) => {
    const formId = `musicPlaylistProfile${index}`;
    const syncFormId = `musicPlaylistSync${index}`;
    const favoriteLabel = playlist.isFavorite ? "Remove from favourites" : "Add to favourites";
    const nextFavoriteValue = playlist.isFavorite ? "false" : "true";
    const playlistNote = playlist.userNote || playlist.description || playlist.prompt || "";
    const coverPreviewUrl = playlist.coverPreviewUrl || playlist.spotifyCoverUrl || "";
    return [
    `<article class="review-card music-playlist-card" data-music-playlist-card data-music-playlist-id="${escapeHtml(playlist.musicPlaylistId || "")}">`,
    coverPreviewUrl
      ? `<a class="music-playlist-cover" href="${escapeHtml(playlist.spotifyUrl || coverPreviewUrl)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(coverPreviewUrl)}" alt="${escapeHtml(`${playlist.name || "Playlist"} cover`)}" loading="lazy" decoding="async"></a>`
      : `<a class="music-playlist-cover is-empty" href="${escapeHtml(playlist.spotifyUrl || "#")}"${playlist.spotifyUrl ? " target=\"_blank\" rel=\"noreferrer\"" : ""}><span>Spotify</span></a>`,
    "<div class=\"music-playlist-card-heading\">",
    `<h3 class="review-card-title">${playlist.spotifyUrl ? `<a href="${escapeHtml(playlist.spotifyUrl)}" target="_blank" rel="noreferrer">${escapeHtml(playlist.name || "Untitled")}</a>` : escapeHtml(playlist.name || "Untitled")}</h3>`,
    "<div class=\"music-playlist-card-actions\" aria-label=\"Playlist actions\">",
    `<form method="post" action="/admin/actions/music-playlist-favorite-toggle" class="music-playlist-favorite-form" data-music-playlist-favorite-form>`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">`,
    `<input type="hidden" name="musicPlaylistId" value="${escapeHtml(playlist.musicPlaylistId || "")}">`,
    `<input type="hidden" name="isFavorite" value="${escapeHtml(nextFavoriteValue)}" data-music-playlist-favorite-target>`,
    `<button type="submit" class="feature-toggle-pill gallery-round-action music-playlist-favorite-pill${playlist.isFavorite ? " is-active" : ""}" aria-label="${escapeHtml(favoriteLabel)}" title="${escapeHtml(favoriteLabel)}"><span class="music-playlist-heart" aria-hidden="true">${playlist.isFavorite ? "♥" : "♡"}</span></button>`,
    "</form>",
    `<form method="post" action="/admin/actions/music-playlist-delete" class="music-playlist-delete-form"${renderConfirmOnSubmit("Delete this playlist from the local Ghostlight music library?\\n\\nThis removes the local playlist record and playlist search data. Spotify will not be changed.")}>`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">`,
    `<input type="hidden" name="musicPlaylistId" value="${escapeHtml(playlist.musicPlaylistId || "")}">`,
    `<button type="submit" class="feature-toggle-pill gallery-round-action gallery-round-action-delete music-playlist-delete-pill" aria-label="Delete local playlist" title="Delete local playlist"><span class="music-playlist-icon">${renderIconImage("delete", theme, "Delete", "table-action-icon")}</span></button>`,
    "</form>",
    "</div>",
    "</div>",
    playlistNote ? `<p class="review-card-note">${escapeHtml(playlistNote)}</p>` : "",
    "<div class=\"review-card-tags music-playlist-badges\">",
    `<span class="badge sensitivity" data-music-playlist-favorite-badge${playlist.isFavorite ? "" : " hidden"}>favourite</span>`,
    `<span class="badge">${escapeHtml(String(playlist.trackCount || 0))} tracks</span>`,
    playlist.discoveryTrackCount ? `<span class="badge domain">${escapeHtml(String(playlist.discoveryTrackCount))} discovery</span>` : "",
    playlist.coverImageId ? "<span class=\"badge sensitivity\">cover</span>" : "",
    formatMusicTags(playlist.tags, helpers),
    "</div>",
    `<form id="${escapeHtml(formId)}" method="post" action="/admin/actions/music-playlist-profile-save" class="music-playlist-profile-form">`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">`,
    `<input type="hidden" name="musicPlaylistId" value="${escapeHtml(playlist.musicPlaylistId || "")}">`,
    `<input name="tags" type="text" value="${escapeHtml(formatMusicTagsInput(playlist.tags))}" placeholder="drive, focus, rainy" aria-label="Playlist tags">`,
    `<textarea name="userNote" rows="2" placeholder="When would you listen to this playlist?" aria-label="Playlist note">${escapeHtml(playlist.userNote || "")}</textarea>`,
    "</form>",
    `<form id="${escapeHtml(syncFormId)}" method="post" action="/admin/actions/music-playlist-sync" class="music-playlist-sync-form">`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">`,
    `<input type="hidden" name="playlistId" value="${escapeHtml(playlist.spotifyPlaylistId || "")}">`,
    "</form>",
    "<div class=\"music-playlist-card-buttons\">",
    `<button type="submit" form="${escapeHtml(formId)}" class="toolbar-button secondary">Save Details</button>`,
    `<button type="submit" form="${escapeHtml(syncFormId)}" class="toolbar-button secondary"${playlist.spotifyPlaylistId ? "" : " disabled"}>Spotify Sync</button>`,
    "</div>",
    "</article>",
    ].join("");
  }).join("");

  return [
    "<section class=\"lite-panel page-frame settings-form no-divider\">",
    `<form method="get" action="${escapeHtml(buildAdminLocation({ path: basePath, theme }))}" class="stack">`,
    withThemeField(theme),
    `<div class="gallery-filter-grid ${selectedTab === "playlists" ? "music-playlist-filter-grid" : "music-track-filter-grid"}">`,
    `<div><label for="musicGalleryQuery">Search</label><input id="musicGalleryQuery" name="q" type="text" value="${escapeHtml(filters.q || "")}" placeholder="${selectedTab === "playlists" ? "Search playlist names and prompts" : "Search tracks, artists, albums"}"></div>`,
    `<input type="hidden" name="filterTags" value="${escapeHtml(filterExtras.filterTags || "")}" data-filter-tags-hidden>`,
    "<div class=\"gallery-tag-field\">",
    `<label for="${selectedTab === "playlists" ? "musicPlaylistTagSearch" : "musicTrackTagSearch"}">Tags</label>`,
    `<input id="${selectedTab === "playlists" ? "musicPlaylistTagSearch" : "musicTrackTagSearch"}" type="text" list="${selectedTab === "playlists" ? "musicPlaylistTagOptions" : "musicTrackTagOptions"}" placeholder="Type to search tags" data-filter-tag-search>`,
    `<datalist id="${selectedTab === "playlists" ? "musicPlaylistTagOptions" : "musicTrackTagOptions"}">`,
    ...(availableFilterTags || []).map((option) => `<option value="${escapeHtml(option.label)}" data-filter-value="${escapeHtml(option.value)}"></option>`),
    "</datalist>",
    `<select class="filter-options-source" data-filter-tag-options>${(availableFilterTags || []).map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}</select>`,
    "</div>",
    "<div class=\"gallery-filter-action\">",
    "<label>&nbsp;</label>",
    "<div class=\"toolbar\">",
    "<button type=\"submit\" class=\"toolbar-button secondary\">Filter</button>",
    "</div>",
    "</div>",
    "</div>",
    renderMusicSelectedFilterPills(selectedFilterTagOptions, helpers),
    "</form>",
    `<script>
(() => {
  const form = document.currentScript?.previousElementSibling;
  if (!form) return;
  const hidden = form.querySelector('[data-filter-tags-hidden]');
  const search = form.querySelector('[data-filter-tag-search]');
  const optionsSelect = form.querySelector('[data-filter-tag-options]');
  const pills = form.querySelector('[data-selected-filter-pills]');
  if (!hidden || !search || !optionsSelect || !pills) return;

  const optionMap = new Map(Array.from(optionsSelect.options).map((option) => [option.textContent, option.value]));
  const normalizedOptionMap = new Map(Array.from(optionsSelect.options).map((option) => [option.textContent.trim().toLowerCase(), option.value]));
  let selected = hidden.value ? hidden.value.split(',').map((value) => value.trim()).filter(Boolean) : [];

  const escapeValue = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const render = () => {
    hidden.value = selected.join(',');
    pills.innerHTML = selected.map((value) => {
      const option = Array.from(optionsSelect.options).find((item) => item.value === value);
      const label = option ? option.textContent : value;
      return '<button type="button" class="toolbar-button secondary" data-filter-remove="' + escapeValue(value) + '">' + escapeValue(label) + ' ×</button>';
    }).join('');
  };

  const commitPendingTag = () => {
    const rawSearchValue = search.value.trim();
    if (!rawSearchValue) return false;
    const value = optionMap.get(rawSearchValue) || normalizedOptionMap.get(rawSearchValue.toLowerCase());
    if (!value || selected.includes(value)) return false;
    selected.push(value);
    search.value = '';
    render();
    return true;
  };

  search.addEventListener('input', () => {
    commitPendingTag();
  });

  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitPendingTag();
  });

  form.addEventListener('submit', () => {
    commitPendingTag();
  });

  pills.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter-remove]');
    if (!button) return;
    const value = button.getAttribute('data-filter-remove') || '';
    if (!value) return;
    selected = selected.filter((item) => item !== value);
    render();
  });
})();
</script>`,
    "<div class=\"form-divider\"></div>",
    selectedTab === "playlists"
      ? [
        playlistRows
          ? `<div class="review-card-grid music-playlist-grid" data-music-playlist-grid>${playlistRows}</div>`
          : "<p class=\"empty-state review-card-empty\">No playlists matched those filters yet.</p>",
        "<script>",
        "(()=>{",
        "const grid=document.querySelector('[data-music-playlist-grid]');",
        "if(!grid){return;}",
        "const setFavoriteButton=(button,isFavorite)=>{",
        "const label=isFavorite?'Remove from favourites':'Add to favourites';",
        "button.classList.toggle('is-active',isFavorite);",
        "button.setAttribute('aria-label',label);",
        "button.setAttribute('title',label);",
        "const icon=button.querySelector('.music-playlist-heart');",
        "if(icon){icon.textContent=isFavorite?'♥':'♡';}",
        "};",
        "grid.addEventListener('submit',async(event)=>{",
        "const form=event.target.closest('[data-music-playlist-favorite-form]');",
        "if(!form){return;}",
        "event.preventDefault();",
        "const button=form.querySelector('.music-playlist-favorite-pill');",
        "if(!button){return;}",
        "button.disabled=true;",
        "try{",
        "const response=await fetch(form.action,{method:'POST',body:new FormData(form),headers:{Accept:'application/json'}});",
        "const result=await response.json();",
        "if(!response.ok||!result.ok){throw new Error(result.error||'Favourite update failed.');}",
        "const isFavorite=Boolean(result.isFavorite);",
        "setFavoriteButton(button,isFavorite);",
        "const target=form.querySelector('[data-music-playlist-favorite-target]');",
        "if(target){target.value=isFavorite?'false':'true';}",
        "const card=form.closest('[data-music-playlist-card]');",
        "const badge=card?.querySelector('[data-music-playlist-favorite-badge]');",
        "if(badge){badge.hidden=!isFavorite;}",
        "}catch(error){",
        "}finally{",
        "button.disabled=false;",
        "}",
        "});",
        "})();",
        "</script>",
      ].join("")
      : [
        "<div class=\"memory-table-wrap\"><table class=\"memory-table music-gallery-table\" data-music-gallery-table><thead><tr>",
        `<th>${renderSortableTrackHeader("Song", "title")}</th>`,
        `<th>${renderSortableTrackHeader("Artist", "artist")}</th>`,
        `<th>${renderSortableTrackHeader("Reaction", "reaction")}</th>`,
        "<th>Notes</th>",
        "</tr></thead><tbody>",
        trackRows || "<tr><td class=\"empty-state\" colspan=\"4\">No tracks matched those filters yet.</td></tr>",
        "</tbody></table></div>",
        "<script>",
        "(()=>{",
        "const table=document.querySelector('[data-music-gallery-table]');",
        "if(!table){return;}",
        "const reactionLabels={likes:'Likes',dislikes:'Dislikes',neutral:'Neutral',curious:'Curious',recommended:'Recommended'};",
        "const noteExcerpt=(value)=>{const normalized=String(value||'').replace(/\\s+/g,' ').trim();return normalized.length>120?`${normalized.slice(0,119).trimEnd()}...`:normalized;};",
        "const setButtonState=(button,label,disabled=false)=>{if(button){button.textContent=label;button.disabled=disabled;}};",
        "const setOpen=(id,open)=>{",
        "const detail=document.getElementById(id);",
        "const button=table.querySelector(`[data-music-track-toggle=\"${id}\"]`);",
        "const row=table.querySelector(`[data-music-track-target=\"${id}\"]`);",
        "if(!detail||!button){return;}",
        "detail.hidden=!open;",
        "button.setAttribute('aria-expanded',open?'true':'false');",
        "button.querySelector('.music-track-toggle-icon').textContent=open?'-':'+';",
        "row?.classList.toggle('is-open',open);",
        "};",
        "const toggle=(id)=>{const detail=document.getElementById(id);if(detail){setOpen(id,detail.hidden);}};",
        "table.addEventListener('click',(event)=>{",
        "const button=event.target.closest('[data-music-track-toggle]');",
        "if(button){toggle(button.dataset.musicTrackToggle);return;}",
        "const row=event.target.closest('[data-music-track-summary-row]');",
        "if(row&&!event.target.closest('a,input,select,textarea,label')){toggle(row.dataset.musicTrackTarget);}",
        "});",
        "table.addEventListener('keydown',(event)=>{",
        "if(event.key!=='Enter'&&event.key!==' '){return;}",
        "const row=event.target.closest('[data-music-track-summary-row]');",
        "if(row){event.preventDefault();toggle(row.dataset.musicTrackTarget);}",
        "});",
        "table.addEventListener('submit',async(event)=>{",
        "const form=event.target.closest('.music-track-editor-form');",
        "if(!form){return;}",
        "event.preventDefault();",
        "const button=form.querySelector('[data-music-track-save-button]');",
        "setButtonState(button,'Saving...',true);",
        "try{",
        "const response=await fetch(form.action,{method:'POST',body:new FormData(form),headers:{Accept:'application/json'}});",
        "const result=await response.json();",
        "if(!response.ok||!result.ok){throw new Error(result.error||'Save failed.');}",
        "const detailRow=form.closest('.music-track-detail-row');",
        "const summaryRow=detailRow?.previousElementSibling;",
        "const reactionCell=summaryRow?.querySelector('[data-music-track-reaction]');",
        "const noteCell=summaryRow?.querySelector('[data-music-track-note]');",
        "if(reactionCell){reactionCell.textContent=reactionLabels[result.reaction]||result.reaction||'Neutral';}",
        "if(noteCell){const excerpt=noteExcerpt(result.note);noteCell.textContent='';if(excerpt){const p=document.createElement('p');p.className='music-note-excerpt';p.textContent=excerpt;noteCell.appendChild(p);}}",
        "setButtonState(button,'Saved',true);",
        "setTimeout(()=>setButtonState(button,'Save',false),1100);",
        "}catch(error){",
        "setButtonState(button,'Failed',false);",
        "setTimeout(()=>setButtonState(button,'Save',false),1600);",
        "}",
        "});",
        "})();",
        "</script>",
      ].join(""),
    pagination,
    "</section>",
  ].join("");
}

module.exports = {
  renderMusicToolsPage,
  renderMusicGalleryPage,
};
