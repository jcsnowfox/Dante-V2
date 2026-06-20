const path = require("node:path");
const fs = require("node:fs");
const { mergeWithDefaults, validateProfile } = require("./emotionProfileSchema");

const DEFAULT_PROFILE_PATH = path.resolve(__dirname, "../../../companions/default/emotionalArc.json");

function loadDefaultProfileFromDisk() {
  try {
    const raw = fs.readFileSync(DEFAULT_PROFILE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveCompanionId(config) {
  const name = config?.chat?.promptBlocks?.personaName
    || config?.companionId
    || "default";
  return String(name).trim().toLowerCase().replace(/\s+/g, "_") || "default";
}

function createEmotionStateService({ store, config, logger }) {
  let _cachedProfile = null;

  async function loadProfile() {
    const companionId = resolveCompanionId(config);

    if (_cachedProfile && _cachedProfile.companionId === companionId) {
      return _cachedProfile;
    }

    let dbProfile = null;
    try {
      dbProfile = store ? await store.loadProfile(companionId) : null;
    } catch (error) {
      logger.warn("[emotional-arc:profile] Failed to load DB profile, using defaults.", {
        companionId,
        error: error.message,
      });
    }

    const diskDefault = loadDefaultProfileFromDisk();
    const merged = mergeWithDefaults({
      ...diskDefault,
      ...(dbProfile ? {
        enabled: dbProfile.enabled,
        emotionalDepth: dbProfile.emotionalDepth,
        baselineTemperament: dbProfile.baselineTemperament,
        thresholds: dbProfile.thresholds,
        expressionStyle: dbProfile.expressionStyle,
        blockedExpressions: dbProfile.blockedExpressions,
        repairStyle: dbProfile.repairStyle,
      } : {}),
    });

    const { valid, errors } = validateProfile(merged);
    if (!valid) {
      logger.warn("[emotional-arc:profile] Profile has validation errors, using safe defaults.", {
        companionId,
        errors,
      });
    }

    // Fail-safe: the engine is only active once the owner has persisted a
    // profile to the database. Without a DB-backed profile the loaded values
    // are template defaults for the dashboard editor only — the runtime stays
    // inert so base companion behaviour is never altered.
    const persisted = Boolean(dbProfile);

    _cachedProfile = { companionId, persisted, ...merged };

    logger.info("[emotional-arc:profile:loaded] Emotional arc profile loaded.", {
      companionId,
      emotionalDepth: merged.emotionalDepth,
      enabled: merged.enabled,
      persisted,
    });

    return _cachedProfile;
  }

  function invalidateProfileCache() {
    _cachedProfile = null;
  }

  async function getCurrentState() {
    const companionId = resolveCompanionId(config);
    try {
      return store ? await store.loadCurrentEmotionState(companionId) : null;
    } catch (error) {
      logger.warn("[emotional-arc] Failed to load current emotion state.", {
        companionId,
        error: error.message,
      });
      return null;
    }
  }

  async function saveState(stateData) {
    const companionId = resolveCompanionId(config);
    try {
      return store ? await store.saveEmotionState({ companionId, ...stateData }) : null;
    } catch (error) {
      logger.error("[emotional-arc] Failed to save emotion state.", {
        companionId,
        error: error.message,
      });
      return null;
    }
  }

  async function updateState(id, updates) {
    try {
      return store ? await store.updateEmotionState({ id, ...updates }) : null;
    } catch (error) {
      logger.error("[emotional-arc] Failed to update emotion state.", {
        stateId: id,
        error: error.message,
      });
      return null;
    }
  }

  async function recordEvent(eventData) {
    const companionId = resolveCompanionId(config);
    try {
      return store ? await store.recordEmotionEvent({ companionId, ...eventData }) : null;
    } catch (error) {
      logger.warn("[emotional-arc] Failed to record emotion event.", {
        companionId,
        error: error.message,
      });
      return null;
    }
  }

  async function listRecentEvents(limit = 20) {
    const companionId = resolveCompanionId(config);
    try {
      return store ? await store.listRecentEmotionEvents({ companionId, limit }) : [];
    } catch {
      return [];
    }
  }

  async function saveArc(arcData) {
    const companionId = resolveCompanionId(config);
    try {
      return store ? await store.saveEmotionArc({ companionId, ...arcData }) : null;
    } catch (error) {
      logger.warn("[emotional-arc] Failed to save emotion arc.", { error: error.message });
      return null;
    }
  }

  async function loadActiveArc() {
    const companionId = resolveCompanionId(config);
    try {
      return store ? await store.loadActiveArc(companionId) : null;
    } catch {
      return null;
    }
  }

  async function updateArcStatus(id, updates) {
    try {
      return store ? await store.updateArcStatus({ id, ...updates }) : null;
    } catch {
      return null;
    }
  }

  async function saveRepair(repairData) {
    const companionId = resolveCompanionId(config);
    // No store = no database configured = inert (not an error). A genuine
    // persistence failure must NOT be swallowed silently here; let it propagate
    // so the caller (initiateRepair) can log a warning + write an audit entry.
    if (!store) {
      return null;
    }
    return store.saveRepair({ companionId, ...repairData });
  }

  async function resolveRepair(id, accepted) {
    try {
      return store ? await store.resolveRepair({ id, accepted }) : null;
    } catch {
      return null;
    }
  }

  async function listOpenRepairs() {
    const companionId = resolveCompanionId(config);
    try {
      return store ? await store.listOpenRepairs(companionId) : [];
    } catch {
      return [];
    }
  }

  async function getStoreSummary() {
    const companionId = resolveCompanionId(config);
    try {
      return store ? await store.getStoreSummary(companionId) : { available: false };
    } catch {
      return { available: false };
    }
  }

  return {
    resolveCompanionId: () => resolveCompanionId(config),
    loadProfile,
    invalidateProfileCache,
    getCurrentState,
    saveState,
    updateState,
    recordEvent,
    listRecentEvents,
    saveArc,
    loadActiveArc,
    updateArcStatus,
    saveRepair,
    resolveRepair,
    listOpenRepairs,
    getStoreSummary,
  };
}

module.exports = { createEmotionStateService, resolveCompanionId };
