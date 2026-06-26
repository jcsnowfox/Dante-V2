async function listPresetsSafe(store, userScope) {
  if (!store?.listPresets) {
    return [];
  }

  try {
    return await store.listPresets({ userScope });
  } catch (_error) {
    return [];
  }
}

function normalizePresetName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function buildImagePresetContextSection({ imageStylePresets = [], imageAppearancePresets = [], config }) {
  if (!config.imageGeneration?.enabled) {
    return null;
  }

  const parts = [
    `Image generation is ${config.imageGeneration.enabled ? "enabled" : "disabled"} for chat.`,
    `Allowed image aspect ratios: ${(Array.isArray(config.imageGeneration.allowedAspectRatios) ? config.imageGeneration.allowedAspectRatios : []).join(", ") || "1:1, 9:16, 16:9"}.`,
  ];

  if (imageAppearancePresets.length) {
    const personaName = String(config.chat?.promptBlocks?.personaName || "").trim();
    const normalizedPersonaName = normalizePresetName(personaName);
    const ownPreset = personaName
      ? imageAppearancePresets.find((p) => normalizePresetName(p.name) === normalizedPersonaName
          || (normalizedPersonaName && normalizePresetName(p.name).includes(normalizedPersonaName))
          || (normalizedPersonaName && normalizedPersonaName.includes(normalizePresetName(p.name))))
      : null;

    const presetLines = [
      "Available appearance presets:",
      "Appearance presets describe stable face/body identity only. They do not replace clothing, pose, expression, framing, scene, or lighting details.",
      "When one of these people or characters is the visual subject of the image, explicitly choose the best matching appearance preset id in the tool call by default.",
      "Do not skip a matching appearance preset unless the image is clearly about someone else or the preset would be misleading for this request.",
      imageAppearancePresets.map((preset) => `- ${preset.presetId}: ${preset.name}`).join("\n"),
    ];

    if (ownPreset) {
      presetLines.push(`YOUR OWN appearance preset is "${ownPreset.name}" (id: ${ownPreset.presetId}). Always include this preset ID when generating any image that includes you — selfies, portraits, images of you with the user, etc. Never generate an image of yourself without it.`);
    }

    parts.push(presetLines.join("\n"));
  }

  if (imageStylePresets.length) {
    parts.push([
      "Available style presets:",
      imageStylePresets.map((preset) => `- ${preset.presetId}: ${preset.name}`).join("\n"),
    ].join("\n"));
  }

  return {
    label: "Image Generation Context",
    content: parts.join("\n\n"),
  };
}

async function loadImagePresetContextSection({
  config,
  userScope,
  imageStylePresetsStore,
  imageAppearancePresetsStore,
}) {
  const [stylePresets, appearancePresets] = await Promise.all([
    listPresetsSafe(imageStylePresetsStore, userScope),
    listPresetsSafe(imageAppearancePresetsStore, userScope),
  ]);

  return buildImagePresetContextSection({
    imageStylePresets: stylePresets,
    imageAppearancePresets: appearancePresets,
    config,
  });
}

module.exports = {
  listPresetsSafe,
  buildImagePresetContextSection,
  loadImagePresetContextSection,
};
