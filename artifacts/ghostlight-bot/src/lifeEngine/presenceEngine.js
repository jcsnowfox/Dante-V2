/**
 * lifeEngine/presenceEngine
 *
 * Phase 14 — presence.
 *
 * Derives the companion's high-level presence mode (active / activity / away /
 * sleep) from the current schedule window and behavioral state, and resolves the
 * home landmark used by "return home" autonomy. This does not move the avatar —
 * it only decides intent; the movement/teleport engines and command queue carry
 * out anything in-world.
 *
 * Safe with no DB: home resolution returns null and modes fall back to "active".
 */

const PRESENCE_MODES = ["active", "activity", "away", "sleep"];

function createPresenceEngine({ secondLife = null, config = null, logger = null } = {}) {
  /**
   * Decide the presence mode. Night windows or a "tired" state → sleep; an
   * explicit non-idle scheduled activity → activity; a quiet/withdrawn state with
   * no owner around → away; otherwise active.
   */
  function getPresenceMode({ scheduleEntry = null, state = "", ownerPresent = false } = {}) {
    const activityType = String(scheduleEntry?.activityType || "").toLowerCase();
    const behavioral = String(state || "").toLowerCase();

    if (activityType === "night" || behavioral === "tired") return "sleep";
    if (ownerPresent) return "active";
    if (behavioral === "quiet" || behavioral === "reflective" || behavioral === "focused") return "away";
    if (scheduleEntry && scheduleEntry.activityType) return "activity";
    return "active";
  }

  function isSleeping(mode) {
    return mode === "sleep";
  }

  function isAway(mode) {
    return mode === "away" || mode === "sleep";
  }

  async function getHome({ companionId } = {}) {
    if (!secondLife || typeof secondLife.getHomeLandmark !== "function") return null;
    try {
      return await secondLife.getHomeLandmark({ companionId });
    } catch (error) {
      logger?.warn?.("[life-engine] getHomeLandmark failed.", { error: error.message });
      return null;
    }
  }

  return { getPresenceMode, isSleeping, isAway, getHome, PRESENCE_MODES };
}

module.exports = {
  createPresenceEngine,
  PRESENCE_MODES,
};
