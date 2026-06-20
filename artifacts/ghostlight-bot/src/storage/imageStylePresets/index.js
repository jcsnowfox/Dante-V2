const { createPresetStore } = require("../imagePresets/shared");

function createImageStylePresetStore({ config, logger }) {
  return createPresetStore({
    config,
    logger,
    tableName: "image_style_presets",
    logLabel: "image-style-presets",
  });
}

module.exports = {
  createImageStylePresetStore,
};
