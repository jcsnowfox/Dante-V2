/**
 * emotionalArcScheduler — Phase B implementation
 *
 * Runs decay cycles on a schedule so emotions fade over time even when no
 * new messages arrive. Loads the live profile + current state on each tick
 * and delegates the actual decay maths to emotionalDecayEngine.
 *
 * The interval is unref'd so it never keeps the process alive on its own.
 */

const { runDecayCycle } = require("./emotionalDecayEngine");

const ARC_STATUS = Object.freeze({
  ACTIVE: "active",
  PAUSED: "paused",
  RESOLVED: "resolved",
  ABANDONED: "abandoned",
});

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function createEmotionalArcScheduler({ stateService, logger, companionId }) {
  let _decayIntervalId = null;

  async function runCycle({ now = new Date() } = {}) {
    const profile = await stateService.loadProfile();
    if (!profile || !profile.enabled || profile.emotionalDepth === "off") {
      return null;
    }

    return runDecayCycle({ companionId, stateService, profile, logger, now });
  }

  function start({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    if (_decayIntervalId) {
      return;
    }

    logger.info("[emotional-arc] Arc scheduler started.", { companionId, intervalMs });

    _decayIntervalId = setInterval(() => {
      runCycle().catch((error) => {
        logger.warn("[emotional-arc] Decay cycle error.", {
          companionId,
          error: error.message,
        });
      });
    }, intervalMs);

    if (_decayIntervalId?.unref) {
      _decayIntervalId.unref();
    }
  }

  function stop() {
    if (_decayIntervalId) {
      clearInterval(_decayIntervalId);
      _decayIntervalId = null;
      logger.info("[emotional-arc] Arc scheduler stopped.", { companionId });
    }
  }

  return { start, stop, runCycle, runDecayCycle: runCycle };
}

module.exports = { createEmotionalArcScheduler, ARC_STATUS, DEFAULT_INTERVAL_MS };
