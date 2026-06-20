const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const { normalizeModeKey } = require("../../storage/channelModes");
const {
  fetchAvailableOpenRouterModelMetadata,
  formatToolSupportWarning,
} = require("../../llm/modelValidation");

function readArrayField(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const normalized = String(value || "").trim();
  return normalized ? [normalized] : [];
}

function wantsJsonResponse(req, fields = {}) {
  return fields.responseMode === "json" || String(req.headers?.accept || "").includes("application/json");
}

function sendJson(res, statusCode, payload) {
  return res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  }).end(JSON.stringify(payload));
}

async function handleChannelModeActions({ req, res, url, context, withAdmin }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/channel-mode-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const submittedModeKey = String(fields.modeKey || "").trim() || normalizeModeKey(fields.label);
      const existingMode = (await innerContext.channelModes.listModes())
        .find((mode) => mode.modeKey === submittedModeKey);
      const mode = await innerContext.channelModes.saveModeDefinition({
        modeKey: submittedModeKey,
        label: fields.label,
        instructions: fields.instructions,
        chatModel: fields.chatModel,
        memoryTypes: readArrayField(fields.memoryTypes),
        memorySensitivity: fields.memorySensitivity,
        includeTimeContext: fields.includeTimeContext,
        retrievalSource: fields.retrievalSource,
        retrievalAccess: fields.retrievalAccess,
        heartbeatRole: existingMode?.heartbeatRole || "",
        isBuiltin: Boolean(existingMode?.isBuiltin),
      });
      let toolSupportMessage = "";
      const chatModel = String(fields.chatModel || "").trim();

      if (chatModel) {
        try {
          const metadata = await fetchAvailableOpenRouterModelMetadata({
            config: innerContext.config,
            capability: "chat",
          });
          const modelCapability = metadata.modelCapabilities.get(chatModel);

          if (modelCapability && modelCapability.supportsTools === false) {
            toolSupportMessage = ` ${formatToolSupportWarning(chatModel)}`;
          }
        } catch (error) {
          innerContext.logger?.warn?.("[channel-modes] Could not check model tool support", {
            modeKey: submittedModeKey,
            model: chatModel,
            error: error.message,
          });
        }
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/admin/channel-modes",
          fallbackPath: "/admin/admin/channel-modes",
          theme,
          message: `Saved channel mode "${mode.label}".${toolSupportMessage}`,
          extra: {
            mode: mode.modeKey,
          },
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/channel-mode-assignment-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const guildId = innerContext.config.discord.guildId || "";
      const channelId = String(fields.channelId || "").trim();
      const modeKey = String(fields.modeKey || "").trim();

      if (!channelId) {
        if (wantsJsonResponse(innerReq, fields)) {
          return sendJson(innerRes, 400, {
            ok: false,
            error: "Missing channel id.",
          });
        }

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/admin/channel-modes",
            fallbackPath: "/admin/admin/channel-modes",
            theme,
            error: "Missing channel id.",
          }),
        }).end();
      }

      if (!modeKey) {
        const cleared = await innerContext.channelModes.clearChannelMode({
          guildId,
          channelId,
        });

        if (wantsJsonResponse(innerReq, fields)) {
          return sendJson(innerRes, 200, {
            ok: true,
            channelId,
            modeKey: "",
            cleared: Boolean(cleared),
            message: "Using default mode.",
          });
        }

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/admin/channel-modes",
            fallbackPath: "/admin/admin/channel-modes",
            theme,
            message: cleared
              ? `Cleared channel mode for ${channelId}.`
              : "No channel mode assignment was cleared.",
          }),
        }).end();
      }

      const assignment = await innerContext.channelModes.assignModeToChannel({
        guildId,
        channelId,
        modeKey,
      });

      if (wantsJsonResponse(innerReq, fields)) {
        return sendJson(innerRes, 200, {
          ok: true,
          channelId: assignment.channelId,
          modeKey: assignment.modeKey,
          message: `Assigned ${assignment.modeKey}.`,
        });
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/admin/channel-modes",
          fallbackPath: "/admin/admin/channel-modes",
          theme,
          message: `Assigned mode "${assignment.modeKey}" to channel ${assignment.channelId}.`,
        }),
      }).end();
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/channel-mode-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const modeKey = String(fields.modeKey || "").trim();

      if (!modeKey) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/admin/channel-modes",
            fallbackPath: "/admin/admin/channel-modes",
            theme,
            error: "Missing channel mode.",
          }),
        }).end();
      }

      try {
        const deleted = await innerContext.channelModes.deleteModeDefinition(modeKey);

        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/admin/channel-modes",
            fallbackPath: "/admin/admin/channel-modes",
            theme,
            message: deleted
              ? `Deleted channel mode "${deleted.label}".`
              : "No custom channel mode was deleted.",
          }),
        }).end();
      } catch (error) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo: fields.returnTo || "/admin/admin/channel-modes",
            fallbackPath: "/admin/admin/channel-modes",
            theme,
            error: error.message || "Failed to delete channel mode.",
          }),
        }).end();
      }
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/channel-mode-assignment-clear") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const cleared = await innerContext.channelModes.clearChannelMode({
        guildId: innerContext.config.discord.guildId || "",
        channelId: fields.channelId,
      });

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo: fields.returnTo || "/admin/admin/channel-modes",
          fallbackPath: "/admin/admin/channel-modes",
          theme,
          message: cleared
            ? `Cleared channel mode for ${fields.channelId}.`
            : "No channel mode assignment was cleared.",
        }),
      }).end();
    })(req, res, context);
  }

  return false;
}

module.exports = {
  handleChannelModeActions,
};
