const { getRuntimeState, renderHelpIcon, renderPageIntro, renderSubnav } = require("./shared");
const { AUDIO_GALLERY_SOURCE_SURFACES } = require("../../audio/galleryPolicy");

const ELEVEN_V3_AUDIO_TAG_HELP = "Eleven v3 can use sparse delivery tags in the spoken text, such as [chuckles], [clears throat], [sighs], [whispers], or [pause]. Ghostlight will only be prompted to use these when this model is selected.";
const ELEVEN_V3_DELIVERY_TAGS_HELP = "Optional tags to prepend to Eleven v3 audio requests, such as [British accent] or [softly]. These only apply when the selected read-aloud or generated-audio model is Eleven v. 3.";
const ADVANCED_VOICE_SETTINGS_HELP = "Optional per-request ElevenLabs voice tuning. Leave this off to use the saved voice defaults exactly as ElevenLabs provides them.";
const FISH_NL_TAGS_HELP = "Fish Audio models support free-form natural language style cues in square brackets, such as [whispers sweetly] or [laughing nervously]. List suggested tags here — Ghostlight will weave them into generated audio text where they fit naturally.";

const FISH_AUDIO_MODEL_OPTIONS = Object.freeze([
  { value: "speech-1.6", label: "Speech 1.6 (latest)" },
  { value: "speech-1.5", label: "Speech 1.5" },
  { value: "s2.1-pro", label: "S2.1 Pro" },
  { value: "s2.1", label: "S2.1" },
]);

const AUDIO_MODEL_OPTIONS = Object.freeze([
  { value: "eleven_flash_v2_5", label: "Eleven Flash v. 2.5" },
  { value: "eleven_multilingual_v2", label: "Eleven Multilingual v. 2" },
  { value: "eleven_turbo_v2_5", label: "Eleven Turbo v. 2.5" },
  { value: "eleven_v3", label: "Eleven v. 3" },
]);

const AUDIO_OUTPUT_FORMAT_OPTIONS = Object.freeze([
  { value: "mp3_44100_128", label: "MP3 44.1kHz 128kbps" },
  { value: "mp3_44100_64", label: "MP3 44.1kHz 64kbps" },
  { value: "mp3_22050_32", label: "MP3 22.05kHz 32kbps" },
]);

function labelFromOptions(options = [], value = "", fallback = "Unknown") {
  const normalized = String(value || "").trim();
  const option = options.find((item) => item.value === normalized);

  return option?.label || fallback;
}

function labelForAudioModel(value = "") {
  return labelFromOptions(AUDIO_MODEL_OPTIONS, value, value ? "Unknown model" : "Unknown");
}

function labelForAudioOutputFormat(value = "", mimeType = "") {
  return labelFromOptions(AUDIO_OUTPUT_FORMAT_OPTIONS, value, mimeType || "Unknown");
}

function buildAudioVoiceOptions(voices = []) {
  return Array.from(new Map(
    (Array.isArray(voices) ? voices : [])
      .filter((voice) => voice?.voiceId && voice?.name)
      .map((voice) => [voice.voiceId, voice]),
  ).values());
}

function labelForAudioVoice(voiceId = "", voices = []) {
  const normalized = String(voiceId || "").trim();
  const voice = buildAudioVoiceOptions(voices).find((item) => item.voiceId === normalized);

  if (voice?.name) {
    return voice.name;
  }

  return normalized ? "Saved ElevenLabs voice" : "Unknown";
}

function renderOptions(options = [], selectedValue = "", helpers) {
  const { escapeHtml } = helpers;
  const normalizedSelected = String(selectedValue || "").trim();

  return options.map((option) => {
    const selected = option.value === normalizedSelected ? " selected" : "";
    return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
  }).join("");
}

function formatSliderValue(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;

  return safeValue.toFixed(2).replace(/\.?0+$/u, "");
}

function renderVoiceSlider({
  id,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  helpers,
}) {
  const { escapeHtml } = helpers;
  const displayValue = formatSliderValue(value, min);

  return [
    "<div class=\"audio-voice-slider\">",
    `<label for="${escapeHtml(id)}"><span>${escapeHtml(label)}</span><strong data-audio-slider-value="${escapeHtml(id)}">${escapeHtml(displayValue)}</strong></label>`,
    `<input id="${escapeHtml(id)}" name="${escapeHtml(id)}" type="range" min="${escapeHtml(min)}" max="${escapeHtml(max)}" step="${escapeHtml(step)}" value="${escapeHtml(displayValue)}" data-audio-slider="${escapeHtml(id)}">`,
    "</div>",
  ].join("");
}

function renderVoiceField({ selectedVoiceId = "", voices = [], helpers }) {
  const { escapeHtml } = helpers;
  const voiceOptions = buildAudioVoiceOptions(voices);
  const normalizedSelected = String(selectedVoiceId || "").trim();

  if (!voiceOptions.length) {
    return `<input id="audioElevenlabsVoiceId" name="audioElevenlabsVoiceId" type="text" value="${escapeHtml(normalizedSelected)}" placeholder="Paste an ElevenLabs voice ID">`;
  }

  const hasSelectedVoice = voiceOptions.some((voice) => voice.voiceId === normalizedSelected);
  const options = [
    normalizedSelected && !hasSelectedVoice
      ? `<option value="${escapeHtml(normalizedSelected)}" selected>Saved ElevenLabs voice</option>`
      : "",
    ...voiceOptions.map((voice) => {
      const selected = voice.voiceId === normalizedSelected ? " selected" : "";
      return `<option value="${escapeHtml(voice.voiceId)}"${selected}>${escapeHtml(voice.name)}</option>`;
    }),
  ].filter(Boolean);

  return `<select id="audioElevenlabsVoiceId" name="audioElevenlabsVoiceId">${options.join("")}</select>`;
}

function formatAudioSourceSurface(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  const labels = {
    read_aloud: "TTS",
    chat: "Chat",
    scheduled: "Scheduled",
    schedule: "Scheduled",
    heartbeat: "Heartbeat",
  };

  return labels[normalized] || "";
}

function buildAudioTags(audio = {}) {
  const tags = [];
  const sourceTag = formatAudioSourceSurface(audio.sourceSurface);

  if (sourceTag) {
    tags.push(sourceTag);
  }

  if (audio.status === "failed") {
    tags.push("Failed");
  }

  if (audio.isFavorite) {
    tags.push("Favourite");
  }

  if (Array.isArray(audio.customTags)) {
    tags.push(...audio.customTags);
  }

  return Array.from(new Set(tags.map((tag) => String(tag || "").trim()).filter(Boolean)));
}

function renderTagPills(tags = [], helpers) {
  const { escapeHtml } = helpers;
  const visibleTags = Array.isArray(tags) ? tags.filter(Boolean) : [];

  if (!visibleTags.length) {
    return "<p class=\"meta\">No tags yet.</p>";
  }

  return [
    "<div class=\"memory-chip-row\">",
    ...visibleTags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`),
    "</div>",
  ].join("");
}

function renderSelectedFilterPills(selectedOptions = [], helpers) {
  const { escapeHtml } = helpers;
  const options = Array.isArray(selectedOptions) ? selectedOptions.filter(Boolean) : [];

  return [
    "<div class=\"memory-chip-row\" data-selected-filter-pills>",
    ...options.map((option) => `<button type="button" class="toolbar-button secondary" data-filter-remove="${escapeHtml(option.value)}">${escapeHtml(option.label)} ×</button>`),
    "</div>",
  ].join("");
}

function formatAudioStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return "Unknown";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatAudioDate(value) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAudioGalleryKind(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  const labels = {
    read_aloud: "Read Aloud",
    chat: "Audio Clip",
    scheduled: "Scheduled Audio",
    schedule: "Scheduled Audio",
    heartbeat: "Heartbeat Audio",
  };

  return labels[normalized] || "Audio Clip";
}

function deriveAudioTitleFromDisplayName(value = "") {
  const withoutExtension = String(value || "").replace(/\.[a-z0-9]+$/i, "");
  const cleaned = withoutExtension
    .replace(/^(?:TTS|Audio)-\d{1,2}-[A-Za-z]{3,9}-?/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || /^[a-z0-9]{6,}$/i.test(cleaned)) {
    return "";
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatAudioGalleryTitle(audio = {}) {
  const sourceSurface = String(audio.sourceSurface || "").trim().toLowerCase();
  const conversationLabel = String(audio.conversationLabel || "").trim();
  const fileTitle = deriveAudioTitleFromDisplayName(audio.displayName || "");

  if (sourceSurface === "read_aloud") {
    return [
      formatAudioGalleryKind(audio.sourceSurface),
      conversationLabel,
    ].filter(Boolean).join(" - ");
  }

  return [
    formatAudioGalleryKind(audio.sourceSurface),
    conversationLabel || fileTitle,
  ].filter(Boolean).join(" - ");
}

function formatAudioBytes(value) {
  const bytes = Number(value || 0);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function truncateAudioText(value, maxLength = 120) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function renderGalleryLayout({ currentTab = "images", tabBody = "", theme = "light", helpers }) {
  const tabs = [
    { key: "images", label: "Images", path: "/admin/gallery/images" },
    { key: "audio", label: "Audio", path: "/admin/gallery/audio" },
    { key: "music", label: "Music", path: "/admin/gallery/music" },
    { key: "playlists", label: "Playlists", path: "/admin/gallery/music/playlists" },
  ];

  return [
    renderPageIntro({
      title: "Library",
      copy: "",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: currentTab, theme, helpers }),
    "</section>",
    tabBody,
  ].join("");
}

function renderToolsLayout({ currentTab = "images", tabBody = "", theme = "light", helpers }) {
  const tabs = [
    { key: "images", label: "Image Generation", path: "/admin/tools/images" },
    { key: "audio", label: "Voice & Audio", path: "/admin/tools/audio" },
    { key: "gifs", label: "GIF Search", path: "/admin/tools/gifs" },
    { key: "music", label: "Spotify", path: "/admin/tools/music" },
  ];

  return [
    renderPageIntro({
      title: "Tools",
      copy: "",
    }),
    "<section class=\"lite-panel page-frame subnav-frame\">",
    renderSubnav({ items: tabs, currentKey: currentTab, theme, helpers }),
    "</section>",
    tabBody,
  ].join("");
}

function renderGifToolsPage({ config, helpers }) {
  const { escapeHtml } = helpers;
  const enabled = Boolean(String(config.giphy?.apiKey || "").trim());

  return [
    "<section class=\"lite-panel page-frame settings-form no-divider\">",
    "<div class=\"copy-block\">",
    "<h3>GIF Search</h3>",
    `<p class="meta">GIF search is ${escapeHtml(enabled ? "enabled" : "not enabled yet")} for this instance.</p>`,
    "</div>",
    "<div class=\"model-table-wrap\">",
    "<table class=\"model-table\">",
    "<thead><tr><th>Tool</th><th>Status</th><th>Provider</th></tr></thead>",
    "<tbody>",
    "<tr>",
    "<td data-label=\"Tool\"><strong>GIF Search</strong></td>",
    `<td data-label="Status">${escapeHtml(enabled ? "Enabled" : "Not configured")}</td>`,
    "<td data-label=\"Provider\" class=\"notes\">Powered by GIPHY</td>",
    "</tr>",
    "</tbody>",
    "</table>",
    "</div>",
    "</section>",
  ].join("");
}

function renderAudioSettingsPage({ config, voiceOptions = [], theme = "light", helpers }) {
  const { escapeHtml, withThemeField, buildAdminLocation } = helpers;
  const state = getRuntimeState({ config, helpers });
  const savedSourceSurfaces = new Set(Array.isArray(state.audioGallerySavedSourceSurfaces) ? state.audioGallerySavedSourceSurfaces : []);
  const readAloudModelIsV3 = String(state.audioReadAloudModel || "").trim() === "eleven_v3";
  const generatedAudioModelIsV3 = String(state.audioGeneratedAudioModel || "").trim() === "eleven_v3";
  const anyAudioModelIsV3 = readAloudModelIsV3 || generatedAudioModelIsV3;

  return [
    "<section class=\"lite-panel page-frame settings-form no-divider\">",
    "<form method=\"post\" action=\"/admin/actions/settings-save\">",
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/tools/audio", theme }))}">`,
    "<div class=\"copy-block\">",
    "<h3>Voice Provider</h3>",
    "<p class=\"meta\">Choose which TTS provider powers read-aloud and generated audio.</p>",
    "</div>",
    "<div class=\"home-feature-row\" style=\"justify-content:flex-start;gap:.75rem;flex-wrap:wrap\">",
    `<label class="toolbar-button secondary"><input type="radio" name="audioTtsProvider" value="none"${!state.audioTtsEnabled || state.audioTtsProvider === "none" ? " checked" : ""}> Disabled / None</label>`,
    `<label class="toolbar-button secondary"><input type="radio" name="audioTtsProvider" value="elevenlabs"${state.audioTtsEnabled && state.audioTtsProvider !== "fish_audio" ? " checked" : ""}> ElevenLabs</label>`,
    `<label class="toolbar-button secondary"><input type="radio" name="audioTtsProvider" value="fish_audio"${state.audioTtsEnabled && state.audioTtsProvider === "fish_audio" ? " checked" : ""}> Fish Audio</label>`,
    "</div>",
    `<p class="meta">Fish Audio API key: ${state.fishAudioKeyConfigured ? "configured (masked)" : "not configured"}.</p>`,
    "<div class=\"image-settings-row audio-settings-model-row\">",
    "<div>",
    "<label for=\"audioReadAloudModel\">Read Aloud Model</label>",
    `<select id="audioReadAloudModel" name="audioReadAloudModel">${renderOptions(AUDIO_MODEL_OPTIONS, state.audioReadAloudModel || "eleven_flash_v2_5", helpers)}</select>`,
    "</div>",
    "<div>",
    "<label class=\"field-label-with-help\" for=\"audioGeneratedAudioModel\">",
    "<span>Generated Audio Model</span>",
    `<span data-audio-v3-tag-help${generatedAudioModelIsV3 ? "" : " hidden"}>${renderHelpIcon({ help: ELEVEN_V3_AUDIO_TAG_HELP }, helpers)}</span>`,
    "</label>",
    `<select id="audioGeneratedAudioModel" name="audioGeneratedAudioModel">${renderOptions(AUDIO_MODEL_OPTIONS, state.audioGeneratedAudioModel || "eleven_multilingual_v2", helpers)}</select>`,
    "</div>",
    "</div>",
    "<div class=\"image-settings-row audio-settings-voice-row\">",
    "<div>",
    "<label for=\"audioElevenlabsVoiceId\">Voice</label>",
    renderVoiceField({
      selectedVoiceId: state.audioElevenlabsVoiceId || "",
      voices: voiceOptions,
      helpers,
    }),
    "</div>",
    "<div>",
    "<label for=\"audioFishVoiceId\">Fish Audio Voice ID</label>",
    `<input id="audioFishVoiceId" name="audioFishVoiceId" type="text" value="${escapeHtml(state.audioFishVoiceId || "")}" placeholder="Paste a Fish Audio voice ID">`,
    "</div>",
    "<div>",
    "<label for=\"audioFishModelId\">Fish Audio Model</label>",
    `<select id="audioFishModelId" name="audioFishModelId">${renderOptions(FISH_AUDIO_MODEL_OPTIONS, state.audioFishModelId || "speech-1.6", helpers)}</select>`,
    "</div>",
    "<div class=\"image-settings-save\">",
    "<label>&nbsp;</label>",
    "<button type=\"submit\">Save Audio Settings</button>",
    "</div>",
    "</div>",
    "<div class=\"form-divider\"></div>",
    "<div class=\"copy-block\">",
    "<h3>Gallery Saving</h3>",
    "<p class=\"meta\">Choose which generated audio categories keep a gallery copy and bucket file.</p>",
    "</div>",
    "<input type=\"hidden\" name=\"audioGallerySavedSourceSurfaces\" value=\"\">",
    "<div class=\"audio-gallery-save-grid\">",
    ...AUDIO_GALLERY_SOURCE_SURFACES.map((option) => [
      "<label class=\"switch-field image-settings-toggle\">",
      "<span class=\"switch-control\">",
      `<input type="checkbox" name="audioGallerySavedSourceSurfaces" value="${escapeHtml(option.value)}"${savedSourceSurfaces.has(option.value) ? " checked" : ""}>`,
      "<span></span>",
      "</span>",
      `<span class="switch-label">${escapeHtml(option.label)}</span>`,
      "</label>",
    ].join("")),
    "</div>",
    "<div class=\"form-divider\"></div>",
    "<div class=\"audio-advanced-settings\">",
    "<label class=\"switch-field image-settings-toggle\">",
    "<input type=\"hidden\" name=\"audioVoiceSettingsEnabled\" value=\"false\">",
    "<span class=\"switch-control\">",
    `<input id="audioVoiceSettingsEnabled" type="checkbox" name="audioVoiceSettingsEnabled" value="true"${state.audioVoiceSettingsEnabled ? " checked" : ""}>`,
    "<span></span>",
    "</span>",
    "<span class=\"switch-label field-label-with-help\">",
    "<span>Use Advanced Voice Settings</span>",
    renderHelpIcon({ help: ADVANCED_VOICE_SETTINGS_HELP }, helpers),
    "</span>",
    "</label>",
    `<div class="audio-advanced-settings-panel"${state.audioVoiceSettingsEnabled ? "" : " hidden"} data-audio-voice-settings-panel>`,
    `<div class="audio-settings-v3-tags-row"${anyAudioModelIsV3 ? "" : " hidden"} data-audio-v3-tags-row>`,
    "<label class=\"field-label-with-help\" for=\"audioV3DeliveryTags\">",
    "<span>Eleven v3 Delivery Tags</span>",
    renderHelpIcon({ help: ELEVEN_V3_DELIVERY_TAGS_HELP }, helpers),
    "</label>",
    `<input id="audioV3DeliveryTags" name="audioV3DeliveryTags" type="text" value="${escapeHtml(state.audioV3DeliveryTags || "")}" placeholder="[British accent]">`,
    "<p class=\"meta\">Only applied when advanced settings are enabled and the selected audio model is Eleven v. 3.</p>",
    "</div>",
    `<div class="audio-settings-v3-tags-row"${state.audioTtsProvider === "fish_audio" ? "" : " hidden"} data-audio-fish-nl-tags-row>`,
    "<label class=\"field-label-with-help\" for=\"audioFishNlTags\">",
    "<span>Fish Audio Natural Language Tags</span>",
    renderHelpIcon({ help: FISH_NL_TAGS_HELP }, helpers),
    "</label>",
    `<input id="audioFishNlTags" name="audioFishNlTags" type="text" value="${escapeHtml(state.audioFishNlTags || "")}" placeholder="[whispers sweetly], [laughing nervously]">`,
    "<p class=\"meta\">Free-form bracket tags Ghostlight may use inline in generated Fish Audio text.</p>",
    "</div>",
    "<div class=\"audio-voice-settings-grid\">",
    renderVoiceSlider({ id: "audioVoiceStability", label: "Stability", value: state.audioVoiceStability, helpers }),
    renderVoiceSlider({ id: "audioVoiceSimilarityBoost", label: "Similarity", value: state.audioVoiceSimilarityBoost, helpers }),
    renderVoiceSlider({ id: "audioVoiceStyle", label: "Style", value: state.audioVoiceStyle, helpers }),
    renderVoiceSlider({ id: "audioVoiceSpeed", label: "Speed", value: state.audioVoiceSpeed, min: 0.7, max: 1.2, helpers }),
    "</div>",
    "<label class=\"switch-field audio-speaker-boost-toggle\">",
    "<input type=\"hidden\" name=\"audioVoiceSpeakerBoost\" value=\"false\">",
    "<span class=\"switch-control\">",
    `<input type="checkbox" name="audioVoiceSpeakerBoost" value="true"${state.audioVoiceSpeakerBoost ? " checked" : ""}>`,
    "<span></span>",
    "</span>",
    "<span class=\"switch-label\">Speaker Boost</span>",
    "</label>",
    "</div>",
    "</div>",
    "</form>",
    `<script>
(()=> {
  const readSelect = document.getElementById('audioReadAloudModel');
  const select = document.getElementById('audioGeneratedAudioModel');
  const help = document.querySelector('[data-audio-v3-tag-help]');
  const tagRow = document.querySelector('[data-audio-v3-tags-row]');
  const fishNlTagRow = document.querySelector('[data-audio-fish-nl-tags-row]');
  const voiceSettingsToggle = document.getElementById('audioVoiceSettingsEnabled');
  const voiceSettingsPanel = document.querySelector('[data-audio-voice-settings-panel]');
  const providerRadios = document.querySelectorAll('[name="audioTtsProvider"]');
  if (!select || !help) return;
  const getProvider = () => {
    const checked = document.querySelector('[name="audioTtsProvider"]:checked');
    return checked ? checked.value : 'none';
  };
  const sync = () => {
    const generatedIsV3 = select.value === 'eleven_v3';
    const anyIsV3 = generatedIsV3 || (readSelect && readSelect.value === 'eleven_v3');
    help.hidden = !generatedIsV3;
    if (tagRow) tagRow.hidden = !anyIsV3;
    if (fishNlTagRow) fishNlTagRow.hidden = getProvider() !== 'fish_audio';
  };
  const syncVoiceSettings = () => {
    if (voiceSettingsPanel && voiceSettingsToggle) voiceSettingsPanel.hidden = !voiceSettingsToggle.checked;
  };
  document.querySelectorAll('[data-audio-slider]').forEach((slider) => {
    const output = document.querySelector('[data-audio-slider-value="' + slider.dataset.audioSlider + '"]');
    if (!output) return;
    const syncSlider = () => {
      output.textContent = Number(slider.value).toFixed(2).replace(/\\.?0+$/u, '');
    };
    slider.addEventListener('input', syncSlider);
    syncSlider();
  });
  if (readSelect) readSelect.addEventListener('change', sync);
  select.addEventListener('change', sync);
  providerRadios.forEach((r) => r.addEventListener('change', sync));
  if (voiceSettingsToggle) voiceSettingsToggle.addEventListener('change', syncVoiceSettings);
  sync();
  syncVoiceSettings();
})();
</script>`,
    "</section>",
  ].join("");
}

function renderAudioGalleryPage({
  audioItems = [],
  filters = {},
  availableTags = [],
  page = 1,
  pageSize = 24,
  totalItems = 0,
  theme = "light",
  helpers,
}) {
  const { escapeHtml, buildAdminLocation, withThemeField, renderIconImage } = helpers;
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
  const previousPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const filterExtras = {
    favorites: filters.favoritesOnly ? "true" : "",
    q: filters.q || "",
    filterTags: Array.isArray(filters.filterTags) ? filters.filterTags.join(",") : "",
  };
  const availableTagMap = new Map((availableTags || []).map((option) => [option.value, option.label]));
  const selectedTagOptions = (Array.isArray(filters.filterTags) ? filters.filterTags : [])
    .map((value) => ({
      value,
      label: availableTagMap.get(value) || value,
    }));

  return [
    "<section class=\"lite-panel page-frame settings-form no-divider\">",
    `<form method="get" action="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/audio" }))}" class="stack">`,
    withThemeField(theme),
    `<input type="hidden" name="filterTags" value="${escapeHtml(filterExtras.filterTags)}" data-filter-tags-hidden>`,
    "<div class=\"gallery-filter-grid audio-gallery-filter-grid\">",
    `<div><label for="audioGalleryQuery">Search</label><input id="audioGalleryQuery" name="q" type="text" value="${escapeHtml(filters.q || "")}" placeholder="Search title, caption, or spoken text"></div>`,
    [
      "<div class=\"gallery-tag-field\">",
      "<label for=\"audioGalleryTagSearch\">Tags</label>",
      `<input id="audioGalleryTagSearch" type="text" list="audioGalleryTagOptions" placeholder="Type to search tags" data-filter-tag-search>`,
      "<datalist id=\"audioGalleryTagOptions\">",
      ...(availableTags || []).map((option) => `<option value="${escapeHtml(option.label)}" data-filter-value="${escapeHtml(option.value)}"></option>`),
      "</datalist>",
      `<select class="filter-options-source" data-filter-tag-options>${(availableTags || []).map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}</select>`,
      "</div>",
    ].join(""),
    "</div>",
    renderSelectedFilterPills(selectedTagOptions, helpers),
    "<div class=\"gallery-filter-actions\">",
    "<div class=\"toolbar\">",
    "<button type=\"submit\">Filter</button>",
    `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/audio", theme }))}">Clear Filters</a>`,
    "</div>",
    "<label class=\"switch-field image-gallery-favorite-toggle\">",
    `<span class="switch-control"><input type="checkbox" name="favorites" value="true"${filters.favoritesOnly ? " checked" : ""}><span aria-hidden="true"></span></span>`,
    "<span class=\"switch-label\">Favourites only</span>",
    "</label>",
    `<button type="submit" class="toolbar-button danger audio-gallery-selected-action" form="audioGalleryBulkDeleteForm" data-audio-gallery-delete-selected hidden disabled>Delete selected</button>`,
    "<span class=\"meta audio-gallery-selected-action\" data-audio-gallery-selected-count hidden>0 selected</span>",
    "<span class=\"meta\" data-audio-gallery-delete-status aria-live=\"polite\" hidden></span>",
    "</div>",
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

  const render = () => {
    hidden.value = selected.join(',');
    pills.innerHTML = selected.map((value) => {
      const option = Array.from(optionsSelect.options).find((item) => item.value === value);
      const label = option ? option.textContent : value;
      const safeValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<button type="button" class="toolbar-button secondary" data-filter-remove="' + safeValue + '">' + safeLabel + ' ×</button>';
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
    audioItems.length
      ? [
        `<form id="audioGalleryBulkDeleteForm" method="post" action="/admin/actions/audio-bulk-delete" data-audio-gallery-bulk-form hidden>`,
        withThemeField(theme),
        `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({
          path: "/admin/gallery/audio",
          theme,
          extra: { ...filterExtras, page: page > 1 ? page : "" },
        }))}">`,
        "</form>",
        `<div class="audio-gallery-list" data-audio-gallery-list data-favorites-only="${filters.favoritesOnly ? "true" : "false"}">`,
        ...audioItems.map((item) => [
          `<article class="audio-gallery-row" data-audio-gallery-row data-audio-id="${escapeHtml(item.audioId)}">`,
          "<div class=\"audio-gallery-select-cell\">",
          `<input class="audio-gallery-select-input" type="checkbox" name="audioId" value="${escapeHtml(item.audioId)}" form="audioGalleryBulkDeleteForm" aria-label="Select audio clip">`,
          "</div>",
          "<div class=\"audio-gallery-title-cell\">",
          `<p class="item-title"><a href="${escapeHtml(buildAdminLocation({ path: `/admin/gallery/audio/detail/${encodeURIComponent(item.audioId)}`, theme }))}">${escapeHtml(formatAudioGalleryTitle(item))}</a></p>`,
          item.caption ? `<p class="meta">${escapeHtml(item.caption)}</p>` : "",
          `<p class="meta">${escapeHtml(truncateAudioText(item.spokenText || item.prompt || ""))}</p>`,
          "</div>",
          "<div class=\"audio-gallery-tags-cell\">",
          renderTagPills(buildAudioTags(item), helpers),
          "</div>",
          "<div class=\"audio-gallery-player-cell\">",
          "<div class=\"audio-gallery-player-wrap\">",
          item.status === "completed" && item.downloadUrl
            ? `<audio class="audio-player" controls preload="none" src="${escapeHtml(item.downloadUrl)}"></audio>`
            : `<p class="meta">${escapeHtml(item.status === "failed" ? "Generation failed" : "Audio unavailable")}</p>`,
          "</div>",
          "</div>",
          "<div class=\"audio-gallery-favorite-cell audio-gallery-action-cell\">",
          "<form method=\"post\" action=\"/admin/actions/audio-favorite-toggle\" class=\"audio-gallery-favorite-form\">",
          withThemeField(theme),
          `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/audio", theme, extra: filterExtras }))}">`,
          `<input type="hidden" name="audioId" value="${escapeHtml(item.audioId)}">`,
          `<button type="submit" class="icon-button gallery-round-action audio-favorite-button${item.isFavorite ? " is-active" : ""}" aria-label="${escapeHtml(item.isFavorite ? "Remove from favourites" : "Add to favourites")}" title="${escapeHtml(item.isFavorite ? "Remove from favourites" : "Add to favourites")}">${item.isFavorite ? "♥" : "♡"}</button>`,
          "</form>",
          "</div>",
          "<div class=\"audio-gallery-delete-cell audio-gallery-action-cell\">",
          `<form method="post" action="/admin/actions/audio-delete"${helpers.renderConfirmOnSubmit("Delete this audio clip from the gallery and bucket storage?\n\nThis removes the file itself, not just the record.")}>`,
          withThemeField(theme),
          `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/audio", theme, extra: filterExtras }))}">`,
          `<input type="hidden" name="audioId" value="${escapeHtml(item.audioId)}">`,
          `<button type="submit" class="icon-button gallery-round-action gallery-round-action-delete audio-delete-button" aria-label="Delete audio" title="Delete audio">${renderIconImage("delete", theme, "", "table-action-icon")}</button>`,
          "</form>",
          "</div>",
          "</article>",
        ].join("")),
        "</div>",
        `<script>
(() => {
  const list = document.currentScript?.previousElementSibling;
  if (!list || !list.matches('[data-audio-gallery-list]')) return;
  const bulkForm = document.getElementById('audioGalleryBulkDeleteForm');
  const deleteButton = document.querySelector('[data-audio-gallery-delete-selected]');
  const selectedCount = document.querySelector('[data-audio-gallery-selected-count]');
  const deleteStatus = document.querySelector('[data-audio-gallery-delete-status]');
  const selectedActions = Array.from(document.querySelectorAll('.audio-gallery-selected-action'));

  const getSelectedInputs = () => Array.from(list.querySelectorAll('.audio-gallery-select-input:checked'));
  const syncSelectionUi = () => {
    const selected = getSelectedInputs();
    const count = selected.length;
    for (const row of list.querySelectorAll('[data-audio-gallery-row]')) {
      const input = row.querySelector('.audio-gallery-select-input');
      row.classList.toggle('is-selected', Boolean(input?.checked));
    }
    if (selectedCount) {
      selectedCount.textContent = count === 1 ? '1 selected' : count + ' selected';
    }
    if (deleteButton) {
      deleteButton.disabled = count === 0;
    }
    for (const action of selectedActions) {
      action.hidden = count === 0;
    }
    if (deleteStatus && !deleteStatus.textContent.trim()) {
      deleteStatus.hidden = count === 0;
    }
  };

  const submitFavoriteForm = async (form) => {
    const button = form.querySelector('.audio-favorite-button');
    if (!button) return;
    button.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Favourite update failed.');
      }

      const isFavorite = Boolean(result.isFavorite);
      const label = isFavorite ? 'Remove from favourites' : 'Add to favourites';
      button.classList.toggle('is-active', isFavorite);
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.textContent = isFavorite ? '♥' : '♡';

      if (!isFavorite && list.dataset.favoritesOnly === 'true') {
        form.closest('.audio-gallery-row')?.remove();
        syncSelectionUi();
      }
    } catch (error) {
      button.disabled = false;
      return;
    } finally {
      button.disabled = false;
    }
  };

  for (const form of list.querySelectorAll('.audio-gallery-favorite-form')) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitFavoriteForm(form);
    });
  }

  for (const input of list.querySelectorAll('.audio-gallery-select-input')) {
    input.addEventListener('change', syncSelectionUi);
  }

  bulkForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const selected = getSelectedInputs();
    if (!selected.length || !deleteButton) return;
    const confirmed = window.confirm('Delete ' + selected.length + ' selected audio clip' + (selected.length === 1 ? '' : 's') + ' from the gallery and bucket storage?');
    if (!confirmed) return;

    deleteButton.disabled = true;
    deleteButton.classList.add('is-loading');
    if (deleteStatus) {
      deleteStatus.textContent = 'Deleting...';
      deleteStatus.hidden = false;
    }

    try {
      const formData = new FormData(bulkForm);
      formData.delete('audioId');
      for (const input of selected) {
        formData.append('audioId', input.value);
      }
      const response = await fetch(bulkForm.action, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Delete failed.');
      }

      const deletedIds = new Set(result.deletedAudioIds || []);
      for (const audioId of deletedIds) {
        const row = list.querySelector('[data-audio-id="' + CSS.escape(audioId) + '"]');
        row?.remove();
      }
      if (deleteStatus) {
        const count = Number(result.deletedCount || deletedIds.size || 0);
        deleteStatus.textContent = count === 1 ? 'Deleted 1 audio clip.' : 'Deleted ' + count + ' audio clips.';
        deleteStatus.hidden = false;
      }
      syncSelectionUi();
    } catch (error) {
      if (deleteStatus) {
        deleteStatus.textContent = error.message || 'Delete failed.';
        deleteStatus.hidden = false;
      }
    } finally {
      deleteButton.classList.remove('is-loading');
      syncSelectionUi();
    }
  });

  list.addEventListener('click', (event) => {
    if (event.target.closest('a, button, input, form, audio')) return;
    const row = event.target.closest('[data-audio-gallery-row]');
    const input = row?.querySelector('.audio-gallery-select-input');
    if (!input) return;
    if (deleteStatus) {
      deleteStatus.textContent = '';
    }
    input.checked = !input.checked;
    syncSelectionUi();
  });

  syncSelectionUi();
})();
</script>`,
      ].join("")
      : "<p class=\"meta\">No audio clips matched those filters yet.</p>",
    "<div class=\"form-divider\"></div>",
    "<div class=\"toolbar\" style=\"justify-content:center\">",
    previousPage
      ? `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/audio", theme, extra: { ...filterExtras, page: previousPage } }))}">Previous</a>`
      : "<span class=\"button-link button-link-secondary\" aria-disabled=\"true\">Previous</span>",
    `<span class="meta">Page ${escapeHtml(String(page))} of ${escapeHtml(String(totalPages))}</span>`,
    nextPage
      ? `<a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/audio", theme, extra: { ...filterExtras, page: nextPage } }))}">Next</a>`
      : "<span class=\"button-link button-link-secondary\" aria-disabled=\"true\">Next</span>",
    "</div>",
    "</section>",
  ].join("");
}

function renderAudioDetailPage({ audio = null, voiceOptions = [], theme = "light", helpers }) {
  const { escapeHtml, buildAdminLocation, withThemeField, renderConfirmOnSubmit } = helpers;

  if (!audio) {
    return [
      "<section class=\"lite-panel page-frame no-divider\">",
      "<article class=\"card\"><p class=\"meta\">That audio clip couldn’t be found.</p></article>",
      "</section>",
    ].join("");
  }

  return [
    "<section class=\"lite-panel page-frame no-divider audio-detail-page\">",
    `<div class="toolbar toolbar-bottom-gap"><a class="button-link button-link-secondary" href="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/audio", theme }))}">Back to Audio</a></div>`,
    "<div class=\"audio-detail-stack\">",
    audio.status === "completed" && audio.downloadUrl
      ? `<audio class="audio-player" controls preload="metadata" src="${escapeHtml(audio.downloadUrl)}"></audio>`
      : `<div class="empty-state image-detail-empty">${escapeHtml(audio.status === "failed" ? "Generation failed" : "Audio unavailable")}</div>`,
    "<div class=\"toolbar\">",
    audio.downloadUrl
      ? `<a class="button-link" href="${escapeHtml(audio.downloadUrl)}" target="_blank" rel="noreferrer">Download Audio</a>`
      : "",
    `<form method="post" action="/admin/actions/audio-favorite-toggle">`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: `/admin/gallery/audio/detail/${encodeURIComponent(audio.audioId)}`, theme }))}">`,
    `<input type="hidden" name="audioId" value="${escapeHtml(audio.audioId)}">`,
    `<button type="submit" class="secondary">${escapeHtml(audio.isFavorite ? "Unfavourite" : "Favourite")}</button>`,
    "</form>",
    `<form method="post" action="/admin/actions/audio-delete"${renderConfirmOnSubmit("Delete this audio clip from the gallery and bucket storage?\n\nThis removes the file itself, not just the record.")}>`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: "/admin/gallery/audio", theme }))}">`,
    `<input type="hidden" name="audioId" value="${escapeHtml(audio.audioId)}">`,
    "<button type=\"submit\" class=\"secondary\">Delete Audio</button>",
    "</form>",
    "</div>",
    "<div class=\"audio-detail-tags-row\">",
    "<div class=\"audio-detail-tags-primary\"><h3>Tags</h3>",
    renderTagPills(buildAudioTags(audio), helpers),
    "</div>",
    "<form method=\"post\" action=\"/admin/actions/audio-tags-save\" class=\"audio-detail-tags-form\">",
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="${escapeHtml(buildAdminLocation({ path: `/admin/gallery/audio/detail/${encodeURIComponent(audio.audioId)}`, theme }))}">`,
    `<input type="hidden" name="audioId" value="${escapeHtml(audio.audioId)}">`,
    "<label for=\"audioCustomTags\">Custom Tags</label>",
    `<input id="audioCustomTags" name="customTags" type="text" value="${escapeHtml((audio.customTags || []).join(", "))}" placeholder="comma, separated, tags">`,
    "<button type=\"submit\">Save Tags</button>",
    "</form>",
    "</div>",
    "<div class=\"form-divider\"></div>",
    "<div class=\"audio-detail-copy-block\">",
    "<h3>Caption</h3>",
    `<p class="meta">${escapeHtml(audio.caption || "No caption saved.")}</p>`,
    "<h3>Spoken Text</h3>",
    `<p class="meta">${escapeHtml(audio.spokenText || "No spoken text saved.")}</p>`,
    "</div>",
    "<div class=\"form-divider\"></div>",
    "<h3>Details</h3>",
    "<div class=\"audio-detail-metadata\">",
    `<span><strong>Filename:</strong> ${escapeHtml(audio.displayName || "Audio clip")}</span>`,
    `<span><strong>Created:</strong> ${escapeHtml(formatAudioDate(audio.createdAt))}</span>`,
    `<span><strong>Model:</strong> ${escapeHtml(labelForAudioModel(audio.model || ""))}</span>`,
    `<span><strong>Voice:</strong> ${escapeHtml(labelForAudioVoice(audio.voiceId || "", voiceOptions))}</span>`,
    `<span><strong>Format:</strong> ${escapeHtml(labelForAudioOutputFormat(audio.outputFormat || "", audio.mimeType || ""))}</span>`,
    `<span><strong>File size:</strong> ${escapeHtml(formatAudioBytes(audio.fileSizeBytes))}</span>`,
    `<span><strong>Status:</strong> ${escapeHtml(formatAudioStatus(audio.status || ""))}</span>`,
    "</div>",
    audio.errorMessage ? `<p class="image-error-copy"><strong>Error:</strong> ${escapeHtml(audio.errorMessage)}</p>` : "",
    "</div>",
    "</section>",
  ].join("");
}

module.exports = {
  AUDIO_MODEL_OPTIONS,
  AUDIO_OUTPUT_FORMAT_OPTIONS,
  buildAudioTags,
  labelForAudioModel,
  labelForAudioOutputFormat,
  labelForAudioVoice,
  renderGalleryLayout,
  renderToolsLayout,
  renderGifToolsPage,
  renderAudioSettingsPage,
  renderAudioGalleryPage,
  renderAudioDetailPage,
};
