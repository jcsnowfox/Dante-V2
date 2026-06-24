"use strict";

const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const { applyRuntimeSettings } = require("../../config/runtimeSettings");
const { BOOLEAN_FLAGS, NUMERIC_FIELDS, STRING_FIELDS } = require("../../continuity/continuityConfig");

const RETURN_PATH = "/admin/continuity";

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

async function handleContinuityActions({ req, res, url, context, withAdmin }) {
  // Save settings
  if (req.method === "POST" && url.pathname === "/admin/actions/continuity-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const engine = innerContext.continuity || null;

      if (!engine || !engine.store || engine.store.available !== true) {
        return redirect(innerRes, { returnTo, theme, error: "No database configured — continuity engine is inert." });
      }

      const newConfig = buildConfigFromFields(fields);
      const settingsToSave = Object.fromEntries(
        Object.entries(newConfig).map(([k, v]) => [`continuity.${k}`, v]),
      );
      try {
        await innerContext.settingsStore.upsertSettings(settingsToSave);
      } catch (err) {
        innerContext.logger?.warn?.("[continuity] Failed to persist settings", { error: err.message });
      }
      applyRuntimeSettings(innerContext.config, settingsToSave);
      Object.assign(engine.config, newConfig);
      return redirect(innerRes, { returnTo, theme, message: "Continuity settings saved." });
    })(req, res, context);
  }

  // Toggle enable/pause
  if (req.method === "POST" && url.pathname === "/admin/actions/continuity-toggle") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const engine = innerContext.continuity || null;
      if (!engine) return redirect(innerRes, { returnTo, theme, error: "Engine not available." });
      const enable = fieldValue(fields, "enable") === "true";
      const settingsToSave = { "continuity.continuity_enabled": enable };
      try {
        await innerContext.settingsStore.upsertSettings(settingsToSave);
      } catch (err) {
        innerContext.logger?.warn?.("[continuity] Failed to persist toggle", { error: err.message });
      }
      applyRuntimeSettings(innerContext.config, settingsToSave);
      engine.config.continuity_enabled = enable;
      return redirect(innerRes, { returnTo, theme, message: enable ? "Continuity enabled." : "Continuity paused." });
    })(req, res, context);
  }

  // Resolve item
  if (req.method === "POST" && url.pathname === "/admin/actions/continuity-resolve") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const itemId = Number(fieldValue(fields, "itemId"));
      const engine = innerContext.continuity || null;
      if (!engine || !itemId) return redirect(innerRes, { returnTo, theme, error: "Invalid request." });
      try {
        await engine.storeWrapper.resolve(itemId, fieldValue(fields, "resolution") || "Resolved via admin.");
        return redirect(innerRes, { returnTo, theme, message: "Item resolved." });
      } catch (err) {
        return redirect(innerRes, { returnTo, theme, error: `Resolve failed: ${err.message}` });
      }
    })(req, res, context);
  }

  // Archive item
  if (req.method === "POST" && url.pathname === "/admin/actions/continuity-archive") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const itemId = Number(fieldValue(fields, "itemId"));
      const engine = innerContext.continuity || null;
      if (!engine || !itemId) return redirect(innerRes, { returnTo, theme, error: "Invalid request." });
      try {
        await engine.storeWrapper.archive(itemId);
        return redirect(innerRes, { returnTo, theme, message: "Item archived." });
      } catch (err) {
        return redirect(innerRes, { returnTo, theme, error: `Archive failed: ${err.message}` });
      }
    })(req, res, context);
  }

  // Delete item
  if (req.method === "POST" && url.pathname === "/admin/actions/continuity-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const itemId = Number(fieldValue(fields, "itemId"));
      const engine = innerContext.continuity || null;
      if (!engine || !itemId) return redirect(innerRes, { returnTo, theme, error: "Invalid request." });
      try {
        await engine.storeWrapper.delete(itemId);
        return redirect(innerRes, { returnTo, theme, message: "Item deleted." });
      } catch (err) {
        return redirect(innerRes, { returnTo, theme, error: `Delete failed: ${err.message}` });
      }
    })(req, res, context);
  }

  // Mark promise kept
  if (req.method === "POST" && url.pathname === "/admin/actions/continuity-promise-kept") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const itemId = Number(fieldValue(fields, "itemId"));
      const engine = innerContext.continuity || null;
      if (!engine || !itemId) return redirect(innerRes, { returnTo, theme, error: "Invalid request." });
      try {
        await engine.storeWrapper.resolve(itemId, "Promise kept.");
        return redirect(innerRes, { returnTo, theme, message: "Promise marked kept." });
      } catch (err) {
        return redirect(innerRes, { returnTo, theme, error: `Failed: ${err.message}` });
      }
    })(req, res, context);
  }

  // Pause all follow-ups (set proactive_followups_enabled = false)
  if (req.method === "POST" && url.pathname === "/admin/actions/continuity-pause-followups") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || RETURN_PATH;
      const engine = innerContext.continuity || null;
      if (!engine) return redirect(innerRes, { returnTo, theme, error: "Engine not available." });
      const settingsToSave = { "continuity.proactive_followups_enabled": false };
      try {
        await innerContext.settingsStore.upsertSettings(settingsToSave);
      } catch (err) {
        innerContext.logger?.warn?.("[continuity] Failed to persist pause-followups", { error: err.message });
      }
      applyRuntimeSettings(innerContext.config, settingsToSave);
      engine.config.proactive_followups_enabled = false;
      engine.scheduler?.stop?.();
      return redirect(innerRes, { returnTo, theme, message: "Proactive follow-ups paused." });
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/promise-status") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || "/admin/continuity/promises";
      const promiseId = Number(fieldValue(fields, "promiseId"));
      const status = fieldValue(fields, "status");
      const ledger = innerContext.promiseLedger;
      if (!ledger || !promiseId || !["fulfilled", "broken", "repaired", "archived"].includes(status)) return redirect(innerRes, { returnTo, theme, error: "Invalid promise request." });
      const stamp = status === "fulfilled" ? "fulfilled_at" : status === "broken" ? "broken_at" : status === "repaired" ? "repaired_at" : null;
      await ledger.updatePromise({ id: promiseId, updates: { status, ...(stamp ? { [stamp]: new Date() } : {}) } });
      return redirect(innerRes, { returnTo, theme, message: `Promise marked ${status}.` });
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/promise-delete") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo") || "/admin/continuity/promises";
      const promiseId = Number(fieldValue(fields, "promiseId"));
      if (!innerContext.promiseLedger || !promiseId) return redirect(innerRes, { returnTo, theme, error: "Invalid promise request." });
      await innerContext.promiseLedger.deletePromise({ id: promiseId });
      return redirect(innerRes, { returnTo, theme, message: "Promise deleted." });
    })(req, res, context);
  }

  return false;
}

module.exports = { handleContinuityActions };
