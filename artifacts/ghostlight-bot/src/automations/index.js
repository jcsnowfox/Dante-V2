const {
  resolveAutomationChannelId,
  isAutomationDueNow,
  automationRanToday,
  automationRanThisMinute,
  renderThreadTitle,
  getNextLocalMidnight,
  isCacheChannelReference,
  isDailySummaryDueNow,
  dailySummaryRanToday,
  isWeeklySummaryDueNow,
  weeklySummaryRanThisWeek,
} = require("./time");
const {
  buildAutomationInput,
  normalizeAutomationIdForJournalEntry,
  persistAutomationState,
  getAutomationConversationId,
  loadScopedAutomationRecentHistory,
} = require("./messageHelpers");
const {
  selectJournalConversationSlices,
  loadJournalContextPayload,
  retrieveJournalMemories,
} = require("./journalContext");
const {
  runCheckInAutomation,
  runJournalAutomation,
  runDailyThreadAutomation,
} = require("./runners");
const { findDailyThreadAction } = require("./dailyThreadAction");
const { runProactiveAction, isProactiveActionDueNow } = require("../proactiveActions");
const {
  eventMatchesSummaryScope,
  eventMatchesLocalDate,
  runDailySummary,
  runWeeklySummary,
} = require("./summaries");
const {
  runAutomatedMemoryCuratorScans,
  isMemoryCuratorAttentionScanDue,
  isMemoryCuratorLongScanDue,
} = require("./curator");

function summarizeScheduledFailure(error = null) {
  const message = String(error?.message || error || "").trim();
  const providerMatch = message.match(/\bprovider error:\s*([^.]*(?:\.[^ ]*)?)/i);
  const responseMatch = message.match(/\bresponse:\s*([^\s.]+)/i);
  const statusMatch = message.match(/\bstatus:\s*([^\s.]+)/i);

  return {
    error: message,
    errorCategory: /provider error|service temporarily unavailable|status:\s*failed/i.test(message)
      ? "provider_response_failed"
      : "scheduled_action_failed",
    providerError: providerMatch ? providerMatch[1].trim() : "",
    responseId: responseMatch ? responseMatch[1].trim() : "",
    status: statusMatch ? statusMatch[1].trim() : "",
  };
}

function createAutomationRunner({
  client,
  config,
  logger,
  automationStore,
  memory,
  memoryStore,
  generatedMemories,
  settingsStore,
  cache,
  summaryQueueStore,
  journalStore,
  tools,
  conversations,
  channelModes,
  reactionContext,
  proactiveActionStore,
  generatedImages,
  generatedAudio,
  imageStylePresets,
  imageAppearancePresets,
}) {
  let interval = null;
  let running = false;

  async function tick(now = new Date()) {
    if (running) {
      return;
    }

    running = true;

    try {
      const allProactiveActions = await proactiveActionStore.listActions({
        userScope: config.memory.userScope,
        triggerType: "scheduled",
      });
      const proactiveActions = allProactiveActions.filter((action) => action.enabled !== false);
      const automations = findDailyThreadAction(allProactiveActions)
        ? []
        : await automationStore.listAutomations({
          userScope: config.memory.userScope,
          enabledOnly: true,
          type: "daily_thread",
        });

      for (const automation of automations) {
        if (!isAutomationDueNow(automation, now)) {
          continue;
        }

        try {
          logger.info("[automations] Running scheduled automation", {
            automationId: automation.automationId,
            type: automation.type,
            label: automation.label,
            channelId: automation.channelId,
            scheduleTime: automation.scheduleTime,
          });

          if (automation.type === "journal") {
            await runJournalAutomation({
              automation,
              client,
              config,
              logger,
              memory,
              journalStore,
              tools,
              conversations,
              automationStore,
              cache,
              channelModes,
              generatedImages,
              generatedAudio,
              imageStylePresets,
              imageAppearancePresets,
              reactionContext,
            });
          } else if (automation.type === "daily_thread") {
            await runDailyThreadAutomation({
              automation,
              client,
              config,
              logger,
              memory,
              memoryStore,
              tools,
              conversations,
              automationStore,
              channelModes,
              cache,
              generatedImages,
              generatedAudio,
              imageStylePresets,
              imageAppearancePresets,
              reactionContext,
              now,
            });
          } else {
            await runCheckInAutomation({
              automation,
              client,
              config,
              logger,
              memory,
              tools,
              conversations,
              automationStore,
              cache,
              channelModes,
              generatedImages,
              generatedAudio,
              imageStylePresets,
              imageAppearancePresets,
              reactionContext,
            });
          }
        } catch (error) {
          const failure = summarizeScheduledFailure(error);
          logger.error("[automations] Automation run failed", {
            automationId: automation.automationId,
            label: automation.label,
            type: automation.type,
            target: automation.channelId,
            scheduleTime: automation.scheduleTime,
            timezone: automation.timezone,
            enabledTools: Array.isArray(automation.enabledTools) ? automation.enabledTools : [],
            ...failure,
          }, error);

          await persistAutomationState(automationStore, automation, {
            lastError: error.message,
          });
        }
      }

      for (const action of proactiveActions) {
        if (!isProactiveActionDueNow(action, now)) {
          continue;
        }

        try {
          logger.info("[automations] Running proactive scheduled action", {
            actionId: action.actionId,
            actionType: action.actionType,
            triggerType: action.triggerType,
            name: action.name,
            target: action.target,
            scheduleMode: action.scheduleMode,
            scheduleDay: action.scheduleDay,
            scheduleTime: action.scheduleTime,
          });

          await runProactiveAction({
            action,
            client,
            config,
            logger,
            memory,
            memoryStore,
            journalStore,
            tools,
            conversations,
            proactiveActionStore,
            cache,
            channelModes,
            generatedImages,
            generatedAudio,
            imageStylePresets,
            imageAppearancePresets,
            reactionContext,
            now,
          });
        } catch (error) {
          const failure = summarizeScheduledFailure(error);
          logger.error("[automations] Proactive scheduled action failed", {
            actionId: action.actionId,
            name: action.name,
            actionType: action.actionType,
            target: action.target,
            scheduleMode: action.scheduleMode,
            scheduleDay: action.scheduleDay,
            scheduleTime: action.scheduleTime,
            timezone: action.timezone,
            enabledTools: Array.isArray(action.enabledTools) ? action.enabledTools : [],
            lastRunAt: action.lastRunAt || null,
            ...failure,
          }, error);

          await proactiveActionStore.upsertAction({
            ...action,
            lastError: error.message,
          }, {
            userScope: action.userScope,
          });
        }
      }

      if (isDailySummaryDueNow(config, now)) {
        try {
          if (cache?.deleteExpired) {
            await cache.deleteExpired({ now });
          }
          if (summaryQueueStore?.deleteExpired) {
            await summaryQueueStore.deleteExpired({ now });
          }

          await runDailySummary({
            config,
            logger,
            conversations,
            memoryStore,
            generatedMemories,
            summaryQueueStore,
            settingsStore,
            now,
          });
        } catch (error) {
          logger.error("[automations] Daily summary run failed", {
            error: error.message,
          }, error);
        }
      }

      if (isWeeklySummaryDueNow(config, now)) {
        try {
          if (summaryQueueStore?.deleteExpired) {
            await summaryQueueStore.deleteExpired({ now });
          }

          await runWeeklySummary({
            config,
            logger,
            memoryStore,
            generatedMemories,
            summaryQueueStore,
            settingsStore,
            now,
          });
        } catch (error) {
          logger.error("[automations] Weekly summary run failed", {
            error: error.message,
          }, error);
        }
      }

      await runAutomatedMemoryCuratorScans({
        config,
        logger,
        conversations,
        generatedMemories,
        memory,
        settingsStore,
        now,
      });
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (interval) {
        return;
      }

      interval = setInterval(() => {
        tick().catch((error) => {
          logger.error("[automations] Scheduler tick failed", {
            error: error.message,
          }, error);
        });
      }, 30_000);
    },
    async runNow(now = new Date()) {
      await tick(now);
    },
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  };
}

module.exports = {
  createAutomationRunner,
  buildAutomationInput,
  runCheckInAutomation,
  runJournalAutomation,
  normalizeAutomationIdForJournalEntry,
  isAutomationDueNow,
  automationRanToday,
  automationRanThisMinute,
  selectJournalConversationSlices,
  loadJournalContextPayload,
  retrieveJournalMemories,
  renderThreadTitle,
  getNextLocalMidnight,
  isCacheChannelReference,
  resolveAutomationChannelId,
  isDailySummaryDueNow,
  dailySummaryRanToday,
  isWeeklySummaryDueNow,
  weeklySummaryRanThisWeek,
  eventMatchesSummaryScope,
  eventMatchesLocalDate,
  getAutomationConversationId,
  loadScopedAutomationRecentHistory,
  isMemoryCuratorAttentionScanDue,
  isMemoryCuratorLongScanDue,
  runAutomatedMemoryCuratorScans,
};
