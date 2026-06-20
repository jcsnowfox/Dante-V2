"use strict";

const { createContinuityStore: createRawStore } = require("../storage/continuity");
const { createContinuityStore } = require("./continuityStore");
const { loadContinuityConfig } = require("./continuityConfig");
const { buildContinuityPrelude } = require("./continuityPrelude");
const { createContinuityScheduler } = require("./continuityScheduler");
const { captureOpenLoop, closeLoopIfOutcomeFound } = require("./openLoopRegistry");
const { extractFutureEvent } = require("./futureEventExtractor");
const { captureOutcome } = require("./outcomeCapture");
const { captureCompanionPromise, captureOwnerPromise } = require("./promiseLedger");
const { captureDecision } = require("./decisionLedger");
const { updateProjectState } = require("./projectStateTracker");
const { captureAttentionResidue } = require("./attentionResidue");
const { captureEmotionalResidue } = require("./emotionalResidue");
const { captureRepairThread } = require("./repairContinuity");
const { captureBoundary } = require("./boundaryContinuity");
const { captureRitual } = require("./ritualContinuity");
const { captureAbsenceReentry } = require("./absenceReentry");
const { captureTrustEvent } = require("./trustLedger");
const { injectDueFollowUpIntoPrelude } = require("./followUpPlanner");

function createContinuityEngine({ config: appConfig, logger }) {
  const rawStore = createRawStore({ config: appConfig, logger });

  const userScope = appConfig?.memory?.userScope || "default";
  const companionId = appConfig?.memory?.companionId || userScope;
  const ownerId = userScope;

  const continuityConfig = loadContinuityConfig(appConfig?.continuity || {});

  const store = createContinuityStore({ store: rawStore, companionId, ownerId, logger });

  const scheduler = createContinuityScheduler({
    store,
    config: continuityConfig,
    deliverFn: null, // wired externally after bot client is ready
    logger,
  });

  async function init() {
    await rawStore.init();
    logger.info("[continuity] config loaded", {
      companionId,
      enabled: continuityConfig.continuity_enabled,
      proactive: continuityConfig.proactive_followups_enabled,
    });
    if (continuityConfig.continuity_enabled && continuityConfig.proactive_followups_enabled) {
      scheduler.start();
    }
  }

  /**
   * Process an inbound owner message.
   * Returns { preludeSection } — null if nothing relevant.
   */
  async function processMessage({
    message = "",
    responseText = "",      // companion's reply text (for companion promise detection)
    channelContext = {},
    recentHistory = [],
    sourceMessageId = "",
    sourceChannelId = "",
    lastMessageAt = null,
    lastContext = "",
  } = {}) {
    if (!continuityConfig.continuity_enabled) {
      return { preludeSection: null };
    }

    // Run all capture operations in parallel — each is fully guarded
    const captureOps = [
      // 1. Extract future events from owner message
      extractFutureEvent({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 2. Capture owner promises
      captureOwnerPromise({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 3. Capture decisions
      captureDecision({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 4. Update project state
      updateProjectState({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 5. Try to capture outcomes on existing open loops
      captureOutcome({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 6. Open loop if unfinished thread detected
      captureOpenLoop({ store, config: continuityConfig, message, recentHistory, sourceMessageId, sourceChannelId, logger }),
      // 7. Attention residue
      captureAttentionResidue({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 8. Emotional residue
      captureEmotionalResidue({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 9. Repair thread if friction detected
      captureRepairThread({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 10. Boundary
      captureBoundary({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 11. Ritual
      captureRitual({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 12. Absence re-entry
      captureAbsenceReentry({ store, config: continuityConfig, lastMessageAt, lastContext, sourceMessageId, sourceChannelId, logger }),
      // 13. Trust event
      captureTrustEvent({ store, config: continuityConfig, message, sourceMessageId, sourceChannelId, logger }),
      // 14. Close open loops if outcome detected
      closeLoopIfOutcomeFound({ store, message, logger }),
    ];

    const results = await Promise.allSettled(captureOps);
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.warn("[continuity] some capture operations failed", { failCount: failures.length });
    }

    // Also capture companion promises from the outgoing response text
    if (responseText) {
      try {
        await captureCompanionPromise({ store, config: continuityConfig, responseText, sourceMessageId, sourceChannelId, logger });
      } catch {
        // silently skip
      }
    }

    // Select prelude items — prioritise due follow-ups first, then regular items
    const dueItems = await injectDueFollowUpIntoPrelude({ store, config: continuityConfig, logger });
    const regularItems = await store.listForPrelude({ maxItems: continuityConfig.max_active_prelude_items });

    // Merge — due items at front, then regular (deduplicated)
    const dueIds = new Set(dueItems.map((i) => i.id));
    const merged = [...dueItems, ...regularItems.filter((i) => !dueIds.has(i.id))];
    const selected = merged.slice(0, continuityConfig.max_active_prelude_items);

    const preludeSection = buildContinuityPrelude({
      items: selected,
      config: continuityConfig,
      messageContext: { channelId: sourceChannelId },
      logger,
      companionId,
    });

    return { preludeSection };
  }

  function resolveCompanionId() {
    return companionId;
  }

  function setDeliverFn(fn) {
    scheduler.deliverFn = fn;
  }

  return {
    init,
    processMessage,
    resolveCompanionId,
    setDeliverFn,
    store: rawStore,
    storeWrapper: store,
    config: continuityConfig,
    scheduler,
  };
}

module.exports = { createContinuityEngine };
