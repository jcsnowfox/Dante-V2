"use strict";

const { createInnerLifeStore: createInnerLifeStoreWrapper } = require("./innerLifeStore");
const { createInnerLifeStore: createRawStore } = require("../storage/innerLife");
const { loadInnerLifeConfig } = require("./innerLifeConfig");
const { buildInnerLifePrelude } = require("./innerLifePrelude");
const { capturePrivateThought } = require("./privateThoughts");
const { captureUnsentThought } = require("./unsentThoughts");
const { updateBetweenMessages } = require("./betweenMessages");
const { captureMoodCarryover } = require("./moodCarryover");
const { captureMicroRepair } = require("./microRepair");
const { captureRoomSense } = require("./roomSense");
const { capturePrivateLexicon } = require("./privateLexicon");
const { captureHabitMarker } = require("./companionHabits");
const { captureLittleRitual } = require("./littleRituals");
const { captureRepeatedTell } = require("./repeatedTells");
const { captureTasteMarker } = require("./tasteAndPreferenceDrift");
const { applyAliveTexture } = require("./aliveTexture");
const { createAlivenessScheduler } = require("./alivenessScheduler");

function createInnerLifeEngine({ config: appConfig, logger }) {
  const rawStore = createRawStore({ config: appConfig, logger });

  const userScope = appConfig?.memory?.userScope || "default";
  const companionId = appConfig?.memory?.companionId || userScope;
  const ownerId = userScope;

  const ilConfig = loadInnerLifeConfig(appConfig?.innerLife || {});

  const store = createInnerLifeStoreWrapper({ store: rawStore, companionId, ownerId, logger });

  const scheduler = createAlivenessScheduler({ store, config: ilConfig, logger });

  async function init() {
    await rawStore.init();
    logger.info("[inner-life] config loaded", { companionId, enabled: ilConfig.inner_life_enabled });
    if (ilConfig.inner_life_enabled) {
      scheduler.start();
    }
  }

  async function processMessage({
    message = "",
    channelContext = {},
    recentHistory = [],
    sourceMessageId = "",
    sourceChannelId = "",
    responseContext = {},
  } = {}) {
    if (!ilConfig.inner_life_enabled) {
      return { preludeSection: null };
    }

    // Fire all capture operations in parallel — each is fully guarded
    const captureOps = [
      capturePrivateThought({ store, config: ilConfig, message, sourceMessageId, sourceChannelId, logger }),
      captureUnsentThought({ store, config: ilConfig, message, sourceMessageId, sourceChannelId, logger }),
      captureMoodCarryover({ store, config: ilConfig, message, sourceMessageId, sourceChannelId, logger }),
      captureMicroRepair({ store, config: ilConfig, message, sourceMessageId, sourceChannelId, logger }),
      captureRoomSense({ store, config: ilConfig, channelContext, sourceChannelId, logger }),
      capturePrivateLexicon({ store, config: ilConfig, message, sourceMessageId, sourceChannelId, logger }),
      captureHabitMarker({ store, config: ilConfig, message, sourceMessageId, sourceChannelId, logger }),
      captureLittleRitual({ store, config: ilConfig, message, sourceMessageId, sourceChannelId, logger }),
      captureRepeatedTell({ store, config: ilConfig, message, sourceMessageId, sourceChannelId, logger }),
      captureTasteMarker({ store, config: ilConfig, message, sourceMessageId, sourceChannelId, logger }),
      updateBetweenMessages({ store, config: ilConfig, message, responseContext, sourceMessageId, sourceChannelId, logger }),
    ];

    // Run all captures — we don't await individual failures, the store wrapper handles them
    const results = await Promise.allSettled(captureOps);

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.warn("[inner-life] some capture operations failed", { failCount: failures.length });
    }

    // Build prelude from active entries
    const entries = await store.listForPrelude({ maxItems: ilConfig.max_inner_life_prelude_items });
    const preludeSection = buildInnerLifePrelude({ entries, config: ilConfig, logger, companionId });

    return { preludeSection };
  }

  function postProcessResponse({ text = "", contextType = "" } = {}) {
    if (!text) return { text, applied: false };
    const result = applyAliveTexture({ text, config: ilConfig, contextType, logger });
    return result;
  }

  function resolveCompanionId() {
    return companionId;
  }

  return {
    init,
    processMessage,
    postProcessResponse,
    resolveCompanionId,
    store: rawStore,
    storeWrapper: store,
    config: ilConfig,
    scheduler,
  };
}

module.exports = { createInnerLifeEngine };
