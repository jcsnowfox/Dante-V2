const { applyRuntimeSettings } = require("../../config/runtimeSettings");
const { parseHeartbeatSettingsForm, parseProactiveActionForm } = require("../adminFormParsers");
const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const {
  buildProactiveActionPackImportRecords,
  buildProactiveActionImportSummary,
} = require("../adminDataExchange");

function normalizeDismissedBuiltinActionIds(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.map((item) => String(item || "").trim()).filter(Boolean)));
      }
    } catch {
      return [];
    }
  }

  return [];
}

async function handleHeartbeatActions({ req, res, url, context, withAdmin }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/heartbeat-settings-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const settings = parseHeartbeatSettingsForm(fields);

      if (Object.keys(settings).length) {
        await innerContext.settingsStore.upsertSettings(settings);
        applyRuntimeSettings(innerContext.config, settings);
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/heartbeat/overview",
          fallbackPath: "/admin/heartbeat/overview",
          message: "Saved Heartbeat settings.",
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/heartbeat-action-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const submitted = parseProactiveActionForm(fields, { triggerType: "heartbeat" });
      const isEditing = Boolean(submitted.actionId);
      let existing = null;

      if (submitted.actionId) {
        existing = await innerContext.proactiveActionStore.getActionById(submitted.actionId, {
          userScope: innerContext.config.memory.userScope,
        });
      }

      await innerContext.proactiveActionStore.upsertAction({
        actionId: submitted.actionId || undefined,
        triggerType: "heartbeat",
        name: submitted.name || existing?.name,
        actionType: submitted.actionType || existing?.actionType,
        target: submitted.target,
        prompt: submitted.prompt,
        enabledTools: submitted.enabledTools,
        enabled: submitted.enabled,
        frequency: submitted.frequency,
        quietHoursAllowed: submitted.quietHoursAllowed,
        mentionUser: submitted.mentionUser,
        isBuiltin: existing?.isBuiltin ?? false,
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/heartbeat/modules",
          fallbackPath: "/admin/heartbeat/modules",
          message: `${isEditing ? "Saved" : "Added"} Heartbeat action "${submitted.name || existing?.name || "Action"}".`,
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/heartbeat-action-toggle") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const existing = await innerContext.proactiveActionStore.getActionById(fields.actionId, {
        userScope: innerContext.config.memory.userScope,
      });

      if (!existing) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/heartbeat/modules",
            fallbackPath: "/admin/heartbeat/modules",
            error: "Heartbeat action not found.",
            theme,
          }),
        }).end();
      }

      await innerContext.proactiveActionStore.upsertAction({
        ...existing,
        enabled: !existing.enabled,
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/heartbeat/modules",
          fallbackPath: "/admin/heartbeat/modules",
          message: `${existing.enabled ? "Turned off" : "Turned on"} Heartbeat action "${existing.name}".`,
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/heartbeat-action-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const deleted = await innerContext.proactiveActionStore.deleteActionById(fields.actionId, {
        userScope: innerContext.config.memory.userScope,
      });

      if (deleted?.isBuiltin && innerContext.settingsStore?.listSettings && innerContext.settingsStore?.upsertSettings) {
        const settings = await innerContext.settingsStore.listSettings();
        const dismissedBuiltinActionIds = normalizeDismissedBuiltinActionIds(
          settings?.["heartbeat.dismissedBuiltinActionIds"],
        );

        if (!dismissedBuiltinActionIds.includes(deleted.actionId)) {
          await innerContext.settingsStore.upsertSettings({
            "heartbeat.dismissedBuiltinActionIds": JSON.stringify([...dismissedBuiltinActionIds, deleted.actionId]),
          });
        }
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/heartbeat/modules",
          fallbackPath: "/admin/heartbeat/modules",
          message: deleted ? `Deleted Heartbeat action "${deleted.name}".` : "Nothing was deleted.",
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/heartbeat-action-error-clear") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const existing = await innerContext.proactiveActionStore.getActionById(fields.actionId, {
        userScope: innerContext.config.memory.userScope,
      });

      if (!existing) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/heartbeat/modules",
            fallbackPath: "/admin/heartbeat/modules",
            error: "Heartbeat action not found.",
            theme,
          }),
        }).end();
      }

      await innerContext.proactiveActionStore.upsertAction({
        ...existing,
        lastError: "",
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/heartbeat/modules",
          fallbackPath: "/admin/heartbeat/modules",
          message: `Cleared error for "${existing.name}".`,
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/heartbeat-errors-clear") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const clearedCount = await innerContext.heartbeat.clearRecentErrors();

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/heartbeat/overview",
          fallbackPath: "/admin/heartbeat/overview",
          message: clearedCount === 1
            ? "Cleared 1 Heartbeat error."
            : `Cleared ${clearedCount} Heartbeat errors.`,
          theme,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/heartbeat-pack-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields, files } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const imported = buildProactiveActionPackImportRecords({
        files,
        config: innerContext.config,
        triggerType: "heartbeat",
      });

      for (const record of imported.records) {
        await innerContext.proactiveActionStore.upsertAction({
          ...record,
          enabled: false,
        }, {
          userScope: innerContext.config.memory.userScope,
        });
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/heartbeat/modules",
          fallbackPath: "/admin/heartbeat/modules",
          theme,
          message: buildProactiveActionImportSummary({
            importedCount: imported.records.length,
            skippedWrongType: imported.skippedWrongType,
            skippedInvalid: imported.skippedInvalid,
            targetSelectionRequired: imported.targetSelectionRequired,
            triggerType: "heartbeat",
          }),
        }),
      }).end();
    })(req, res, context);
  }

  return false;
}

module.exports = {
  handleHeartbeatActions,
};
