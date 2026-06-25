const { applyRuntimeSettings } = require("../../config/runtimeSettings");
const { registerDiscordCommands } = require("../../bot/registerCommands");
const { canSyncMemories, syncMemoriesToQdrant } = require("../../memory/syncMemories");
const { deleteCollection, checkQdrantHealth } = require("../../memory/qdrantClient");
const { planSettingsSave, clearModelCapabilitiesCache } = require("../../llm/modelValidation");
const {
  buildDailyThreadActionRecord,
  loadDailyThreadAutomation,
} = require("../../automations/dailyThreadAction");
const { parseSettingsForm, parseDailyThreadSettingsForm } = require("../adminFormParsers");
const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const { buildUpdateNoticeDismissalSettings } = require("../updateNotice");

async function syncStoredScheduleTimezones({
  automationStore,
  proactiveActionStore,
  userScope,
  previousTimezone,
  nextTimezone,
  logger,
}) {
  if (!nextTimezone) {
    return;
  }

  if (proactiveActionStore?.listActions && proactiveActionStore?.upsertAction) {
    try {
      const actions = await proactiveActionStore.listActions({
        userScope,
        triggerType: "scheduled",
      });

      for (const action of actions) {
        if (action.timezone === nextTimezone) {
          continue;
        }

        await proactiveActionStore.upsertAction({
          ...action,
          timezone: nextTimezone,
        }, {
          userScope,
        });
      }
    } catch (error) {
      logger?.warn?.("[admin] Failed to sync proactive schedule timezones", {
        error: error?.message || String(error),
        previousTimezone,
        nextTimezone,
      });
    }
  }

  if (automationStore?.listAutomations && automationStore?.upsertAutomation) {
    try {
      const automations = await automationStore.listAutomations({
        userScope,
      });

      for (const automation of automations) {
        if (automation.timezone === nextTimezone) {
          continue;
        }

        await automationStore.upsertAutomation({
          ...automation,
          timezone: nextTimezone,
        }, {
          userScope,
        });
      }
    } catch (error) {
      logger?.warn?.("[admin] Failed to sync legacy automation timezones", {
        error: error?.message || String(error),
        previousTimezone,
        nextTimezone,
      });
    }
  }
}

async function handleAdminMaintenanceActions({
  req,
  res,
  url,
  context,
  withAdmin,
  buildAppStateImportRecords,
}) {
  if (req.method === "POST" && url.pathname === "/admin/actions/app-state-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields, files } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const records = buildAppStateImportRecords({
        files,
        config: innerContext.config,
      });

      if (Object.keys(records.settings).length) {
        await innerContext.settingsStore.upsertSettings(records.settings);
        applyRuntimeSettings(innerContext.config, records.settings);
      }

      for (const automation of records.automations) {
        if (automation.type === "daily_thread") {
          await innerContext.proactiveActionStore.upsertAction(buildDailyThreadActionRecord({
            settings: {
              channelId: automation.channelId,
              scheduleTime: automation.scheduleTime,
              threadTitleTemplate: automation.threadTitleTemplate,
              threadStarterPrompt: automation.threadStarterPrompt,
              enabledTools: automation.enabledTools || [],
              enabled: automation.enabled,
            },
            existing: {
              actionId: automation.automationId,
              lastRunAt: automation.lastRunAt,
              lastError: automation.lastError,
            },
            config: innerContext.config,
          }), {
            userScope: innerContext.config.memory.userScope,
          });
        } else {
          await innerContext.automationStore.upsertAutomation(automation, {
            userScope: innerContext.config.memory.userScope,
            timezone: innerContext.config.chat?.timezone || "UTC",
          });

          await innerContext.proactiveActionStore.upsertAction({
            actionId: automation.automationId,
            triggerType: "scheduled",
            name: automation.label,
            actionType: automation.type === "journal" ? "journal" : "message",
            target: automation.channelId,
            prompt: automation.prompt,
            enabledTools: [],
            enabled: automation.enabled,
            scheduleMode: "daily",
            scheduleTime: automation.scheduleTime,
            scheduleDay: "monday",
            timezone: automation.timezone || innerContext.config.chat?.timezone || "UTC",
            mentionUser: automation.mentionUser,
            lastRunAt: automation.lastRunAt,
            lastError: automation.lastError || "",
          }, {
            userScope: innerContext.config.memory.userScope,
          });
        }
      }

      for (const action of records.proactiveActions) {
        await innerContext.proactiveActionStore.upsertAction(action, {
          userScope: innerContext.config.memory.userScope,
        });
      }

      for (const legacyAction of records.heartbeatActions) {
        await innerContext.proactiveActionStore.upsertAction({
          actionId: legacyAction.actionId,
          triggerType: "heartbeat",
          name: legacyAction.label,
          actionType: legacyAction.executorType === "start_thread"
            ? "thread"
            : legacyAction.executorType === "send_journal_prompt"
              ? "journal"
              : "message",
          target: legacyAction.targetChannelId || "",
          prompt: legacyAction.prompt || "",
          enabledTools: legacyAction.executorType === "send_gif" ? ["gif_search"] : [],
          enabled: legacyAction.enabled,
          frequency: legacyAction.frequency || "normal",
          quietHoursAllowed: legacyAction.quietHoursAllowed,
          mentionUser: legacyAction.mentionUser,
          isBuiltin: Boolean(legacyAction.isBuiltin),
        }, {
          userScope: innerContext.config.memory.userScope,
        });
      }

      for (const journal of records.journals) {
        await innerContext.journalStore.upsertEntry(journal, {
          userScope: innerContext.config.memory.userScope,
        });
      }

      for (const definition of records.channelModeDefinitions) {
        await innerContext.channelModeStore.upsertModeDefinition(definition);
      }

      for (const assignment of records.channelModeAssignments) {
        await innerContext.channelModeStore.assignChannelMode(assignment);
      }

      const importedCounts = [
        `${Object.keys(records.settings).length} setting${Object.keys(records.settings).length === 1 ? "" : "s"}`,
        `${records.automations.length} automation${records.automations.length === 1 ? "" : "s"}`,
        `${records.proactiveActions.length} proactive action${records.proactiveActions.length === 1 ? "" : "s"}`,
        `${records.journals.length} journal ${records.journals.length === 1 ? "entry" : "entries"}`,
        `${records.channelModeDefinitions.length} mode definition${records.channelModeDefinitions.length === 1 ? "" : "s"}`,
        `${records.channelModeAssignments.length} channel assignment${records.channelModeAssignments.length === 1 ? "" : "s"}`,
        `${records.heartbeatActions.length} legacy heartbeat action${records.heartbeatActions.length === 1 ? "" : "s"}`,
      ];

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/admin",
          message: `Imported app data: ${importedCounts.join(", ")}.`,
          theme,
          extra: {
            page: fields.page || 1,
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/settings-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const settings = parseSettingsForm(fields);
      const dailyThreadSettings = parseDailyThreadSettingsForm(fields);
      const previousTimezone = innerContext.config.chat?.timezone || "UTC";
      const savePlan = await planSettingsSave({
        config: innerContext.config,
        settings,
        logger: innerContext.logger,
      });

      if (Object.keys(savePlan.settingsToPersist).length) {
        await innerContext.settingsStore.upsertSettings(savePlan.settingsToPersist);
        applyRuntimeSettings(innerContext.config, savePlan.settingsToPersist);

        if (Object.prototype.hasOwnProperty.call(savePlan.settingsToPersist, "chat.timezone")) {
          await syncStoredScheduleTimezones({
            automationStore: innerContext.automationStore,
            proactiveActionStore: innerContext.proactiveActionStore,
            userScope: innerContext.config.memory?.userScope,
            previousTimezone,
            nextTimezone: innerContext.config.chat?.timezone || "UTC",
            logger: innerContext.logger,
          });
        }
      }

      const existingDailyThread = await loadDailyThreadAutomation({
        proactiveActionStore: innerContext.proactiveActionStore,
        automationStore: innerContext.automationStore,
        config: innerContext.config,
        logger: innerContext.logger,
      });

      if (dailyThreadSettings && (existingDailyThread || dailyThreadSettings.channelId || dailyThreadSettings.threadStarterPrompt)) {
        await innerContext.proactiveActionStore.upsertAction(buildDailyThreadActionRecord({
          settings: dailyThreadSettings,
          existing: existingDailyThread
            ? {
              actionId: existingDailyThread.automationId,
              target: existingDailyThread.channelId,
              scheduleTime: existingDailyThread.scheduleTime,
              timezone: existingDailyThread.timezone,
              enabledTools: existingDailyThread.enabledTools,
              threadTitleTemplate: existingDailyThread.threadTitleTemplate,
              threadStarterPrompt: existingDailyThread.threadStarterPrompt,
              threadModeKey: existingDailyThread.threadModeKey,
              lastRunAt: existingDailyThread.lastRunAt,
              lastError: existingDailyThread.lastError,
            }
            : null,
          config: innerContext.config,
        }), {
          userScope: innerContext.config.memory.userScope,
        });
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/behaviour",
          message: savePlan.successMessage,
          error: savePlan.errorMessage,
          theme,
          extra: {
            page: fields.page || 1,
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/update-notice-dismiss") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const dismissalSettings = buildUpdateNoticeDismissalSettings(fields.noticeId);

      if (!dismissalSettings) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo,
            fallbackPath: "/admin/home",
            error: "That update notice could not be dismissed.",
            theme,
          }),
        }).end();
      }

      await innerContext.settingsStore.upsertSettings(dismissalSettings);

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo,
          fallbackPath: "/admin/home",
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/memory-rebuild") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);

      if (!canSyncMemories(innerContext.config)) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/admin",
            error: "Memory index rebuild needs QDRANT_URL and a working OpenRouter embeddings API key.",
            theme,
            extra: {
              page: fields.page || 1,
            },
          }),
        }).end();
      }

      const health = await checkQdrantHealth({ config: innerContext.config }).catch(() => ({ reachable: false, safeErrorReason: "health_check_failed" }));
      if (!health.reachable) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/admin",
            error: `Cannot rebuild: Qdrant is not reachable (${health.safeErrorReason || "unknown"}). Your memories are safe — no changes made.`,
            theme,
            extra: {
              page: fields.page || 1,
            },
          }),
        }).end();
      }

      const memories = await innerContext.memoryStore.listMemories({
        userScope: innerContext.config.memory.userScope,
        limit: 5000,
        activeOnly: true,
      });

      await deleteCollection({
        config: innerContext.config,
      });

      const result = await syncMemoriesToQdrant({
        config: innerContext.config,
        memories,
        deps: { logger: innerContext.logger },
      });

      const skippedNote = result.skippedCount > 0 ? ` ${result.skippedCount} skipped.` : "";
      const message = result.syncedCount
        ? `Rebuilt the Qdrant memory index: ${result.syncedCount} active ${result.syncedCount === 1 ? "memory" : "memories"} resynced.${skippedNote}`
        : (result.skippedReason === "qdrant_or_embeddings_not_configured"
          ? "Qdrant unavailable or embeddings are not configured; Postgres memories remain saved but vector sync was skipped."
          : "Deleted the old Qdrant memory index. No active memories were available to resync.");

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/admin",
          message,
          theme,
          extra: {
            page: fields.page || 1,
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/register-commands") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);

      try {
        const result = await registerDiscordCommands({
          config: innerContext.config,
          logger: innerContext.logger,
        });

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/admin",
            theme,
            message: `Registered ${result.commandCount} Discord command${result.commandCount === 1 ? "" : "s"} for guild ${result.guildId}.`,
          }),
        }).end();
      } catch (error) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/admin",
            theme,
            error: error?.message || "Failed to register Discord commands.",
          }),
        }).end();
      }
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/conversation-prune") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);

      try {
        const result = await innerContext.conversations.pruneEventsOlderThan({
          olderThanDays: Number(fields.olderThanDays || 0),
          guildId: innerContext.config.discord.guildId || "",
        });

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/admin",
            theme,
            message: result.deletedCount > 0
              ? `Pruned ${result.deletedCount} stored conversation event${result.deletedCount === 1 ? "" : "s"} older than ${fields.olderThanDays} days.`
              : `No stored conversation events were older than ${fields.olderThanDays} days.`,
          }),
        }).end();
      } catch (error) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/admin",
            theme,
            error: error?.message || "Failed to prune stored conversations.",
          }),
        }).end();
      }
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/refresh-openrouter-models") {
    return withAdmin(async (innerReq, innerRes, _innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      clearModelCapabilitiesCache();
      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/companion",
          message: "OpenRouter model cache cleared. The next model save will fetch a fresh model list from OpenRouter.",
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/conversation-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);

      try {
        const result = await innerContext.conversations.deleteEventsByConversationId({
          conversationId: fields.conversationId,
          guildId: innerContext.config.discord.guildId || "",
        });

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/admin/storage",
            theme,
            message: result.deletedCount > 0
              ? `Deleted ${result.deletedCount} stored conversation event${result.deletedCount === 1 ? "" : "s"} for ${result.conversationId}.`
              : `No stored conversation events were found for ${result.conversationId}.`,
          }),
        }).end();
      } catch (error) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/admin/storage",
            theme,
            error: error?.message || "Failed to delete stored conversation history.",
          }),
        }).end();
      }
    })(req, res, context);
  }

  return false;
}

module.exports = {
  handleAdminMaintenanceActions,
};
