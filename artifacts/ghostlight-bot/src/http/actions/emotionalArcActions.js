const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");

const VALID_DEPTHS = ["off", "light", "realistic", "intense"];

const TEMPERAMENT_KEYS = [
  "warmth", "patience", "directness", "playfulness", "protectiveness", "anger", "jealousy",
];
const THRESHOLD_KEYS = ["annoyance", "hurt", "anger", "guilt", "remorse", "distance"];
const EXPRESSION_STYLE_KEYS = ["annoyance", "hurt", "anger", "guilt", "remorse", "longing"];
const REPAIR_STYLE_KEYS = [
  "admitFault", "apologizeDirectly", "explainWithoutExcuses",
  "offerRepairAction", "doNotOverGrovel", "doNotCenterCompanionPain",
];

function readNumber(fields, key, { min, max }) {
  const raw = fields[key];
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function collectNumberGroup(fields, prefix, keys, bounds) {
  const result = {};
  for (const key of keys) {
    const value = readNumber(fields, `${prefix}.${key}`, bounds);
    if (value !== null) {
      result[key] = value;
    }
  }
  return result;
}

function collectTextGroup(fields, prefix, keys) {
  const result = {};
  for (const key of keys) {
    const raw = fields[`${prefix}.${key}`];
    const value = String(Array.isArray(raw) ? raw[0] : raw || "").trim();
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

function collectBooleanGroup(fields, prefix, keys) {
  const result = {};
  for (const key of keys) {
    result[key] = Boolean(fields[`${prefix}.${key}`]);
  }
  return result;
}

function parseBlockedExpressions(value) {
  const raw = Array.isArray(value) ? value.join("\n") : String(value || "");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function handleEmotionalArcActions({ req, res, url, context, withAdmin }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/emotional-arc-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = String(fields.returnTo || "/admin/emotional-arc").trim() || "/admin/emotional-arc";
      const engine = innerContext.emotionalArc || null;

      if (!engine || !engine.store || typeof engine.store.upsertProfile !== "function") {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo,
            fallbackPath: "/admin/emotional-arc",
            theme,
            error: "Emotional Arc engine is not available.",
          }),
        }).end();
      }

      const depthRaw = String(fields.emotionalDepth || "light").trim();
      const emotionalDepth = VALID_DEPTHS.includes(depthRaw) ? depthRaw : "light";

      const profile = {
        enabled: Boolean(fields.enabled),
        emotionalDepth,
        baselineTemperament: collectNumberGroup(fields, "baselineTemperament", TEMPERAMENT_KEYS, { min: 0, max: 10 }),
        thresholds: collectNumberGroup(fields, "thresholds", THRESHOLD_KEYS, { min: 1, max: 10 }),
        expressionStyle: collectTextGroup(fields, "expressionStyle", EXPRESSION_STYLE_KEYS),
        blockedExpressions: parseBlockedExpressions(fields.blockedExpressions),
        repairStyle: collectBooleanGroup(fields, "repairStyle", REPAIR_STYLE_KEYS),
      };

      let companionId = "";
      try {
        companionId = engine.stateService.resolveCompanionId();
      } catch {
        companionId = "";
      }

      let saved = null;
      try {
        saved = await engine.store.upsertProfile({ companionId, profile });
        if (engine.stateService && typeof engine.stateService.invalidateProfileCache === "function") {
          engine.stateService.invalidateProfileCache();
        }
      } catch (error) {
        innerContext.logger?.error?.("[emotional-arc] Failed to save profile from dashboard.", {
          companionId,
          error: error.message,
        });
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo,
            fallbackPath: "/admin/emotional-arc",
            theme,
            error: "Failed to save Emotional Arc profile.",
          }),
        }).end();
      }

      // upsertProfile returns null when no database is configured. Fail loudly
      // instead of reporting a save that never persisted.
      if (!saved) {
        return innerRes.writeHead(303, {
          Location: buildReturnLocation({
            returnTo,
            fallbackPath: "/admin/emotional-arc",
            theme,
            error: "Could not save — no database is configured, so the Emotional Arc engine stays inactive.",
          }),
        }).end();
      }

      return innerRes.writeHead(303, {
        Location: buildReturnLocation({
          returnTo,
          fallbackPath: "/admin/emotional-arc",
          theme,
          message: "Saved Emotional Arc settings.",
        }),
      }).end();
    })(req, res, context);
  }

  return false;
}

module.exports = { handleEmotionalArcActions };
