const AUDIO_GALLERY_SOURCE_SURFACES = Object.freeze([
  { value: "read_aloud", label: "Read Aloud" },
  { value: "chat", label: "Chat / Manual" },
  { value: "scheduled", label: "Scheduled" },
  { value: "heartbeat", label: "Heartbeat" },
]);

const KNOWN_AUDIO_GALLERY_SOURCE_SURFACES = new Set(
  AUDIO_GALLERY_SOURCE_SURFACES.map((option) => option.value),
);

function normalizeAudioSourceSurface(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeAudioGallerySavedSourceSurfaces(value, { defaultToAll = true } = {}) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? "")
      .split(",");
  const selected = Array.from(new Set(rawValues
    .map(normalizeAudioSourceSurface)
    .filter((item) => KNOWN_AUDIO_GALLERY_SOURCE_SURFACES.has(item))));

  if (!selected.length && defaultToAll && (value === undefined || value === null || value === "")) {
    return AUDIO_GALLERY_SOURCE_SURFACES.map((option) => option.value);
  }

  return selected;
}

function getAudioGallerySavedSourceSurfaces(config = {}) {
  return normalizeAudioGallerySavedSourceSurfaces(config.audio?.gallerySavedSourceSurfaces, {
    defaultToAll: true,
  });
}

function shouldSaveAudioToGallery(config = {}, sourceSurface = "chat") {
  const normalizedSurface = normalizeAudioSourceSurface(sourceSurface) || "chat";

  if (!KNOWN_AUDIO_GALLERY_SOURCE_SURFACES.has(normalizedSurface)) {
    return true;
  }

  return getAudioGallerySavedSourceSurfaces(config).includes(normalizedSurface);
}

module.exports = {
  AUDIO_GALLERY_SOURCE_SURFACES,
  getAudioGallerySavedSourceSurfaces,
  normalizeAudioGallerySavedSourceSurfaces,
  normalizeAudioSourceSurface,
  shouldSaveAudioToGallery,
};
