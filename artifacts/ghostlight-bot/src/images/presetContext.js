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

function buildImagePresetContextSection({ imageStylePresets = [], imageAppearancePresets = [], config }) {
  if (!config.imageGeneration?.enabled) {
    return null;
  }

  const parts = [
    `Image generation is ${config.imageGeneration.enabled ? "enabled" : "disabled"} for chat.`,
    `Allowed image aspect ratios: ${(Array.isArray(config.imageGeneration.allowedAspectRatios) ? config.imageGeneration.allowedAspectRatios : []).join(", ") || "1:1, 9:16, 16:9"}.`,
  ];

  if (imageAppearancePresets.length) {
    parts.push([
      "Available appearance presets:",
      "Appearance presets describe stable face/body identity only. They do not replace clothing, pose, expression, framing, scene, or lighting details.",
      "When one of these people or characters is the visual subject of the image, explicitly choose the best matching appearance preset id in the tool call by default.",
      "Do not skip a matching appearance preset unless the image is clearly about someone else or the preset would be misleading for this request.",
      imageAppearancePresets.map((preset) => `- ${preset.presetId}: ${preset.name}`).join("\n"),
    ].join("\n"));
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
