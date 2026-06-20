const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const {
  BOOLEAN_FLAGS,
  NUMERIC_FIELDS,
  STRING_FIELDS,
} = require("../../companionSystems/relationalState/relationalConfigSchema");

const RETURN_PATH = "/admin/relational-state";

function fieldValue(fields, key) {
  const raw = fields[key];
  return String(Array.isArray(raw) ? raw[0] : raw || "").trim();
}

function buildConfigFromFields(fields) {
  const config = {};
  for (const flag of BOOLEAN_FLAGS) {
    config[flag] = Boolean(fields[flag]);
  }
  for (const [field, spec] of Object.entries(NUMERIC_FIELDS)) {
    const n = Number(fieldValue(fields, field));
    config[field] = Number.isFinite(n) ? n : spec.default;
  }
  for (const field of STRING_FIELDS) {
    config[field] = fieldValue(fields, field);
  }
  config.relational_depth = fieldValue(fields, "relational_depth");
  return config;
}

function redirect(innerRes, { returnTo, theme, message, error }) {
  return innerRes.writeHead(303, {
    Location: buildReturnLocation({
      returnTo,
      fallbackPath: RETURN_PATH,
      theme,
      message,
      error,
    }),
  }).end();
}

async function handleRelationalStateActions({ req, res, url, context, withAdmin }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/relational-state-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const engine = innerContext.relationalState || null;

      if (!engine || !engine.store || engine.store.available !== true) {
        return redirect(innerRes, {
          returnTo,
          theme,
          error: "Could not save — no database is configured, so the Relational State engine stays inert.",
        });
      }

      try {
        await engine.settingsService.saveSettings({
          enabled: Boolean(fields.row_enabled),
          ownerEditable: Boolean(fields.owner_editable),
          config: buildConfigFromFields(fields),
        });
      } catch (error) {
        innerContext.logger?.error?.("[relational-state] Failed to save settings from dashboard.", {
          error: error.message,
        });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save Relational State settings." });
      }

      return redirect(innerRes, { returnTo, theme, message: "Saved Relational State settings." });
    })(req, res, context);
  }

  return false;
}

module.exports = { handleRelationalStateActions };
