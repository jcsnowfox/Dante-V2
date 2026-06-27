"use strict";

/**
 * lifeRuntimeScheduler
 *
 * Registers the Life Runtime tick with the existing schedulerRegistry.
 * Does NOT create a new scheduler loop — uses the registry already wired
 * in src/index.js.
 *
 * Respects quiet hours using the same isInQuietHours guard as the alive executor,
 * so Dante's private life pauses during sleep hours.
 */

const { isInQuietHours } = require("../alive/aliveExecutor");

const DEFAULT_TICK_MS = 20 * 60 * 1000; // 20 minutes

function registerLifeRuntime({ schedulerRegistry, lifeRuntime, config = {}, logger = null }) {
  if (!schedulerRegistry || !lifeRuntime) return;

  const lifeConfig = config?.lifeRuntime || {};
  const tickIntervalMs = Number(
    lifeConfig.tickIntervalMs ?? process.env.LIFE_RUNTIME_TICK_MS ?? DEFAULT_TICK_MS,
  );
  const quietStart = Number(
    lifeConfig.quietHoursStart ?? config?.alive?.quietHoursStart ?? process.env.ALIVE_QUIET_HOURS_START ?? 23,
  );
  const quietEnd = Number(
    lifeConfig.quietHoursEnd ?? config?.alive?.quietHoursEnd ?? process.env.ALIVE_QUIET_HOURS_END ?? 7,
  );
  const timezone = lifeConfig.timezone ?? config?.chat?.timezone ?? process.env.ALIVE_TIMEZONE ?? "UTC";

  schedulerRegistry.registerPostLogin("lifeRuntime", () => {
    lifeRuntime.setRunning(true);

    const timer = setInterval(async () => {
      const now = new Date();
      if (isInQuietHours(now, { quietStart, quietEnd, timezone })) return;
      try {
        await lifeRuntime.tick(now);
      } catch (err) {
        logger?.warn("[life-runtime-scheduler] tick error", { error: err?.message });
      }
    }, tickIntervalMs);

    if (typeof timer.unref === "function") timer.unref();
    logger?.info("[life-runtime-scheduler] Life Runtime registered", { tickIntervalMs });
  });
}

module.exports = { registerLifeRuntime };
