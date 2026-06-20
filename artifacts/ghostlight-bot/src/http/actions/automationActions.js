const { parseProactiveActionForm } = require("../adminFormParsers");
const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const {
  buildProactiveActionPackImportRecords,
  buildProactiveActionImportSummary,
} = require("../adminDataExchange");

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

async function deleteLegacyScheduleMirror(context, actionId, { userScope } = {}) {
  const normalizedActionId = String(actionId || "").trim();

  if (!normalizedActionId || !isUuidLike(normalizedActionId) || !context.automationStore?.deleteAutomationById) {
    return null;
  }

  return context.automationStore.deleteAutomationById(normalizedActionId, { userScope });
}

async function handleAutomationActions({ req, res, url, context, withAdmin }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/automation-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const submitted = parseProactiveActionForm(fields, { triggerType: "scheduled" });
      const isEditing = Boolean(submitted.actionId);

      const saved = await innerContext.proactiveActionStore.upsertAction({
        actionId: submitted.actionId || undefined,
        triggerType: "scheduled",
        name: submitted.name,
        actionType: submitted.actionType,
        target: submitted.target,
        prompt: submitted.prompt,
        enabledTools: submitted.enabledTools,
        enabled: submitted.enabled,
        scheduleMode: submitted.scheduleMode,
        scheduleTime: submitted.scheduleTime,
        scheduleDay: submitted.scheduleDay,
        timezone: innerContext.config.chat?.timezone || "UTC",
        mentionUser: submitted.mentionUser,
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/schedules",
          theme,
          message: `${isEditing ? "Saved" : "Added"} schedule "${saved.name}".`,
          extra: {
            journalPage: fields.journalPage || 1,
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/automation-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const actionId = fields.actionId || fields.automationId;
      const legacyDeleted = await deleteLegacyScheduleMirror(innerContext, actionId, {
        userScope: innerContext.config.memory.userScope,
      });

      const deleted = await innerContext.proactiveActionStore.deleteActionById(actionId, {
        userScope: innerContext.config.memory.userScope,
      });
      const deletedName = deleted?.name || legacyDeleted?.label || "";

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/schedules",
          theme,
          message: deleted || legacyDeleted
            ? (deletedName ? `Deleted schedule "${deletedName}".` : "Deleted schedule.")
            : "Nothing was deleted.",
          extra: {
            journalPage: fields.journalPage || 1,
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/automation-toggle") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const existing = await innerContext.proactiveActionStore.getActionById(fields.actionId || fields.automationId, {
        userScope: innerContext.config.memory.userScope,
      });

      if (!existing) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/schedules",
            theme,
            extra: {
              journalPage: fields.journalPage || 1,
            },
            error: "Automation not found.",
          }),
        }).end();
      }

      const saved = await innerContext.proactiveActionStore.upsertAction({
        ...existing,
        enabled: !existing.enabled,
      }, {
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/schedules",
          theme,
          extra: {
            journalPage: fields.journalPage || 1,
          },
          message: `${saved.enabled ? "Turned on" : "Turned off"} schedule "${saved.name}".`,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/automation-error-clear") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const existing = await innerContext.proactiveActionStore.getActionById(fields.actionId || fields.automationId, {
        userScope: innerContext.config.memory.userScope,
      });

      if (!existing) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || fields.view,
            fallbackPath: "/admin/schedules",
            theme,
            error: "Automation not found.",
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
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/schedules",
          theme,
          message: `Cleared error for "${existing.name}".`,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/automation-pack-import") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields, files } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const imported = buildProactiveActionPackImportRecords({
        files,
        config: innerContext.config,
        triggerType: "scheduled",
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
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/schedules",
          theme,
          message: buildProactiveActionImportSummary({
            importedCount: imported.records.length,
            skippedWrongType: imported.skippedWrongType,
            skippedInvalid: imported.skippedInvalid,
            targetSelectionRequired: imported.records.filter((record) => !String(record.target || "").trim()).length,
            triggerType: "scheduled",
          }),
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/journal-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const deleted = await innerContext.journalStore.deleteEntryById(fields.entryId, {
        userScope: innerContext.config.memory.userScope,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || fields.view,
          fallbackPath: "/admin/schedules",
          theme,
          extra: {
            journalPage: fields.journalPage || 1,
          },
          message: deleted
            ? `Deleted journal entry "${deleted.title}".`
            : "Nothing was deleted.",
        }),
      }).end();
    })(req, res, context);
  }

  return false;
}

module.exports = {
  handleAutomationActions,
};
