const { createPresetStore } = require("../imagePresets/shared");

function createImageAppearancePresetStore({ config, logger }) {
  return createPresetStore({
    config,
    logger,
    tableName: "image_appearance_presets",
    logLabel: "image-appearance-presets",
  });
}

module.exports = {
  createImageAppearancePresetStore,
};
