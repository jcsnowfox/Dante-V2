/**
 * relationalSettingsService
 *
 * Loads and persists the owner's Relational State settings from
 * companion_system_settings (system_key = relational_state). The engine is
 * "active" ONLY when:
 *   - a settings row exists, AND
 *   - the row is enabled, AND
 *   - the row is owner_editable, AND
 *   - config.enabled is true.
 *
 * If the DB is missing/unreachable, or no row exists, the engine is inert.
 * companion_id isolation is enforced here: every read/write is scoped to the
 * resolved companion id. Mirrors feedbackSettingsService exactly.
 */

const { DEFAULT_CONFIG, mergeWithDefaults } = require("./relationalConfigSchema");

const SYSTEM_KEY = "relational_state";

// Mirror emotionStateService / feedbackSettingsService: derive companion id from
// the persona name. Never hardcode a companion.
function resolveCompanionId(config) {
  const personaName = config?.chat?.promptBlocks?.personaName
    || config?.chat?.promptBlocks?.persona_name
    || config?.companionId
    || "companion";
  return String(personaName).trim().toLowerCase().replace(/\s+/g, "_") || "companion";
}

function createRelationalSettingsService({ store, config, logger }) {
  const companionId = resolveCompanionId(config);
  let cache = null;

  async function loadSettings({ force = false } = {}) {
    if (cache && !force) {
      return cache;
    }

    const inert = {
      exists: false,
      enabled: false,
      ownerEditable: false,
      active: false,
      companionId,
      config: { ...DEFAULT_CONFIG },
    };

    if (!store) {
      cache = inert;
      return cache;
    }

    let row = null;
    try {
      row = await store.loadSystemSettings({ companionId, systemKey: SYSTEM_KEY });
    } catch (error) {
      logger.warn("[relational-state:settings:loaded] Failed to load settings; treating as inert.", {
        companionId,
        error: error.message,
      });
      cache = inert;
      return cache;
    }

    if (!row) {
      cache = inert;
      return cache;
    }

    const mergedConfig = mergeWithDefaults(row.config || {});
    const enabled = Boolean(row.enabled);
    const ownerEditable = Boolean(row.ownerEditable);
    const active = enabled && ownerEditable && mergedConfig.enabled === true;

    cache = {
      exists: true,
      enabled,
      ownerEditable,
      active,
      companionId,
      config: mergedConfig,
    };

    logger.debug?.("[relational-state:settings:loaded] Settings loaded.", {
      companionId,
      active,
    });

    return cache;
  }

  async function saveSettings({ enabled, ownerEditable, config: configOverrides }) {
    if (!store) {
      throw new Error("Relational State storage is not available.");
    }

    const mergedConfig = mergeWithDefaults(configOverrides || {});

    await store.upsertSystemSettings({
      companionId,
      systemKey: SYSTEM_KEY,
      enabled: Boolean(enabled),
      ownerEditable: Boolean(ownerEditable),
      config: mergedConfig,
    });

    invalidate();
    return loadSettings({ force: true });
  }

  // True only when the engine is active AND the specific behaviour flag is on.
  async function isBehaviorEnabled(flag) {
    const settings = await loadSettings();
    if (!settings.active) return false;
    return settings.config[flag] === true;
  }

  function invalidate() {
    cache = null;
  }

  async function getStoreSummary() {
    if (!store) {
      return { available: false };
    }
    try {
      return await store.getStoreSummary({ companionId });
    } catch {
      return { available: false };
    }
  }

  return {
    SYSTEM_KEY,
    resolveCompanionId: () => companionId,
    loadSettings,
    saveSettings,
    isBehaviorEnabled,
    invalidate,
    getStoreSummary,
  };
}

module.exports = {
  SYSTEM_KEY,
  resolveCompanionId,
  createRelationalSettingsService,
};
