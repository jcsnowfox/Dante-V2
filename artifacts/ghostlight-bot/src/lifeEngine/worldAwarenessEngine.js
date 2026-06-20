/**
 * lifeEngine/worldAwarenessEngine
 *
 * Phase 14 — world awareness.
 *
 * A read-only view over the live in-world state (`second_life_world_state`): the
 * current region/parcel, what the companion is doing, who and what is nearby, and
 * a derived time-of-day bucket. Everything else in the life engine reads its
 * situational context from here.
 *
 * With no database (or no recorded state yet) it returns a safe empty summary so
 * callers always get a well-formed object.
 */

const EMPTY_SUMMARY = Object.freeze({
  available: false,
  region: "",
  parcel: "",
  activity: "",
  outfit: "",
  animation: "",
  ownerPresent: false,
  nearbyAvatars: [],
  nearbyObjects: [],
  nearbyCount: 0,
  timeOfDay: "",
});

function getTimeOfDay(now = new Date()) {
  const when = now instanceof Date ? now : new Date(now);
  const hour = when.getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

function createWorldAwarenessEngine({ secondLife = null, config = null, logger = null } = {}) {
  async function summarize({ companionId, now = new Date() } = {}) {
    const base = { ...EMPTY_SUMMARY, timeOfDay: getTimeOfDay(now) };
    if (!secondLife || typeof secondLife.loadWorldState !== "function") return base;
    let state = null;
    try {
      state = await secondLife.loadWorldState({ companionId });
    } catch (error) {
      logger?.warn?.("[life-engine] loadWorldState failed.", { error: error.message });
      return base;
    }
    if (!state) return base;
    const nearbyAvatars = Array.isArray(state.nearbyAvatars) ? state.nearbyAvatars : [];
    const nearbyObjects = Array.isArray(state.nearbyObjects) ? state.nearbyObjects : [];
    return {
      ...base,
      available: true,
      region: state.currentRegion || state.region || "",
      parcel: state.currentParcel || state.parcel || "",
      activity: state.currentActivity || state.activity || "",
      outfit: state.currentOutfit || state.outfit || "",
      animation: state.currentAnimation || state.animation || "",
      ownerPresent: Boolean(state.ownerPresent),
      nearbyAvatars,
      nearbyObjects,
      nearbyCount: nearbyAvatars.length,
    };
  }

  function describe(summary = EMPTY_SUMMARY) {
    if (!summary || !summary.available) return "I don't have a sense of where I am right now.";
    const parts = [];
    if (summary.region) parts.push(`I'm in ${summary.region}${summary.parcel ? ` (${summary.parcel})` : ""}`);
    if (summary.activity) parts.push(`currently ${summary.activity}`);
    if (summary.nearbyCount) parts.push(`${summary.nearbyCount} ${summary.nearbyCount === 1 ? "person" : "people"} nearby`);
    if (summary.ownerPresent) parts.push("my owner is here");
    return parts.length ? `${parts.join(", ")}.` : "Things are quiet around me.";
  }

  return { summarize, describe, getTimeOfDay, EMPTY_SUMMARY };
}

module.exports = {
  createWorldAwarenessEngine,
  getTimeOfDay,
  EMPTY_SUMMARY,
};
