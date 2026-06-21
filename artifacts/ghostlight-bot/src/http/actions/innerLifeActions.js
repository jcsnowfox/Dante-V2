"use strict";

const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const { applyRuntimeSettings } = require("../../config/runtimeSettings");
const { BOOLEAN_FLAGS, NUMERIC_FIELDS, STRING_FIELDS } = require("../../innerLife/innerLifeConfig");

const RETURN_PATH = "/admin/inner-life";

function fieldValue(fields, key) {
  const raw = fields[key];
  return String(Array.isArray(raw) ? raw[0] : raw || "").trim();
}

function redirect(innerRes, { returnTo, theme, message, error }) {
  return innerRes.writeHead(303, {
    Location: buildReturnLocation({ returnTo, fallbackPath: RETURN_PATH, theme, message, error }),
  }).end();
}

function buildConfigFromFields(fields) {
  const config = {};
  for (const flag of BOOLEAN_FLAGS) {
    const raw = fields[flag];
    const last = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    config[flag] = last === "true";
  }
  for (const [field, spec] of Object.entries(NUMERIC_FIELDS)) {
    const n = Number(fieldValue(fields, field));
    config[field] = Number.isFinite(n) ? Math.max(spec.min, Math.min(spec.max, n)) : spec.default;
  }
  for (const field of STRING_FIELDS) {
    config[field] = fieldValue(fields, field);
  }
  return config;
}

async function handleInnerLifeActions({ req, res, url, context, withAdmin }) {
  // Save settings
  if (req.method === "POST" && url.pathname === "/admin/actions/inner-life-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const engine = innerContext.innerLife || null;

      if (!engine || !engine.store || engine.store.available !== true) {
        return redirect(innerRes, { returnTo, theme, error: "No database configured — inner life engine is inert." });
      }

      const newConfig = buildConfigFromFields(fields);
      const settingsToSave = Object.fromEntries(
        Object.entries(newConfig).map(([k, v]) => [`innerLife.${k}`, v]),
      );
      try {
        await innerContext.settingsStore.upsertSettings(settingsToSave);
      } catch (err) {
        innerContext.logger?.warn?.("[inner-life] Failed to persist settings", { error: err.message });
      }
      applyRuntimeSettings(innerContext.config, settingsToSave);
      Object.assign(engine.config, newConfig);
      return redirect(innerRes, { returnTo, theme, message: "Inner life settings saved." });
    })(req, res, context);
  }

  // Archive entry
  if (req.method === "POST" && url.pathname === "/admin/actions/inner-life-archive") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const entryId = Number(fieldValue(fields, "entryId"));
      const engine = innerContext.innerLife || null;

      if (!engine || !entryId) return redirect(innerRes, { returnTo, theme, error: "Invalid request." });

      try {
        await engine.storeWrapper.archive(entryId);
        return redirect(innerRes, { returnTo, theme, message: "Entry archived." });
      } catch (err) {
        return redirect(innerRes, { returnTo, theme, error: `Archive failed: ${err.message}` });
      }
    })(req, res, context);
  }

  // Delete entry
  if (req.method === "POST" && url.pathname === "/admin/actions/inner-life-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const entryId = Number(fieldValue(fields, "entryId"));
      const engine = innerContext.innerLife || null;

      if (!engine || !entryId) return redirect(innerRes, { returnTo, theme, error: "Invalid request." });

      try {
        await engine.storeWrapper.delete(entryId);
        return redirect(innerRes, { returnTo, theme, message: "Entry deleted." });
      } catch (err) {
        return redirect(innerRes, { returnTo, theme, error: `Delete failed: ${err.message}` });
      }
    })(req, res, context);
  }

  // Mark reviewed
  if (req.method === "POST" && url.pathname === "/admin/actions/inner-life-review") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const entryId = Number(fieldValue(fields, "entryId"));
      const engine = innerContext.innerLife || null;

      if (!engine || !entryId) return redirect(innerRes, { returnTo, theme, error: "Invalid request." });

      try {
        await engine.storeWrapper.update(entryId, { status: "archived" });
        return redirect(innerRes, { returnTo, theme, message: "Entry marked reviewed." });
      } catch (err) {
        return redirect(innerRes, { returnTo, theme, error: `Review failed: ${err.message}` });
      }
    })(req, res, context);
  }

  // Pause / enable inner life
  if (req.method === "POST" && url.pathname === "/admin/actions/inner-life-toggle") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const engine = innerContext.innerLife || null;

      if (!engine) return redirect(innerRes, { returnTo, theme, error: "Engine not available." });

      const enable = fieldValue(fields, "enable") === "true";
      const settingsToSave = { "innerLife.inner_life_enabled": enable };
      try {
        await innerContext.settingsStore.upsertSettings(settingsToSave);
      } catch (err) {
        innerContext.logger?.warn?.("[inner-life] Failed to persist toggle", { error: err.message });
      }
      applyRuntimeSettings(innerContext.config, settingsToSave);
      engine.config.inner_life_enabled = enable;
      return redirect(innerRes, { returnTo, theme, message: enable ? "Inner life enabled." : "Inner life paused." });
    })(req, res, context);
  }

  return false;
}

module.exports = { handleInnerLifeActions };
