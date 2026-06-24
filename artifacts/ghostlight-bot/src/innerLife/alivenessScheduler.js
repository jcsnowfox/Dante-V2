"use strict";

const { generateJournalEntry } = require("./journalEngine");
const { generateDream } = require("./dreamEngine");
const { isQuietHours } = require("./innerLifeConfig");

const TICK_INTERVAL_MS = 30 * 60 * 1000; // 30 min check
const JOURNAL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DREAM_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

function createAlivenessScheduler({ store, config, logger, callModel = null } = {}) {
  let timer = null;
  let lastJournalAt = null;
  let lastDreamAt = null;

  async function tick() {
    if (!config.inner_life_enabled) return;
    if (isQuietHours(config)) {
      logger.debug("[inner-life] scheduler tick skipped — quiet hours");
      return;
    }

    const now = Date.now();

    // Expire stale entries
    try {
      const expired = await store.expireStale();
      if (expired > 0) logger.debug("[inner-life] expired stale entries", { count: expired });
    } catch (err) {
      logger.warn("[inner-life] failed to expire stale entries", { error: err?.message });
    }

    // Journal generation
    if (config.journal_enabled) {
      if (!lastJournalAt || now - lastJournalAt >= JOURNAL_INTERVAL_MS) {
        try {
          const entry = await generateJournalEntry({ store, config, callModel, logger });
          if (entry) {
            lastJournalAt = now;
            logger.info("[inner-life] journal created", { id: entry.id });
          }
        } catch (err) {
          logger.warn("[inner-life] journal generation failed", { error: err?.message });
        }
      }
    }

    // Dream generation
    if (config.dreams_enabled) {
      if (!lastDreamAt || now - lastDreamAt >= DREAM_INTERVAL_MS) {
        try {
          const entry = await generateDream({ store, config, callModel, logger });
          if (entry) {
            lastDreamAt = now;
            logger.info("[inner-life] dream created", { id: entry.id });
          }
        } catch (err) {
          logger.warn("[inner-life] dream generation failed", { error: err?.message });
        }
      }
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      tick().catch((err) => {
        logger.warn("[inner-life] scheduler tick error", { error: err?.message });
      });
    }, TICK_INTERVAL_MS);
    logger.debug("[inner-life] scheduler started", { intervalMs: TICK_INTERVAL_MS });
    tick().catch((err) => {
      logger.warn("[inner-life] scheduler initial tick error", { error: err?.message });
    });
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop, tick };
}

module.exports = { createAlivenessScheduler };
