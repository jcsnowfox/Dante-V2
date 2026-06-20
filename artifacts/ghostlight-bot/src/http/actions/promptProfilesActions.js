const { parseRequestForm } = require("../adminRequestUtils");
const { normalizeTheme, buildReturnLocation } = require("../adminUiHelpers");
const { PROMPT_FIELDS } = require("../../companion/promptProfileService");

const RETURN_PATH = "/admin/prompt-profiles";

function fieldValue(fields, key) {
  const raw = fields[key];
  return String(Array.isArray(raw) ? raw[0] : raw == null ? "" : raw);
}

function buildPromptsFromFields(fields) {
  const prompts = {};
  for (const field of PROMPT_FIELDS) {
    prompts[field] = fieldValue(fields, field);
  }
  return prompts;
}

function redirect(innerRes, { returnTo, theme, message, error, extra }) {
  return innerRes.writeHead(303, {
    Location: buildReturnLocation({
      returnTo,
      fallbackPath: RETURN_PATH,
      theme,
      message,
      error,
      extra: extra || {},
    }),
  }).end();
}

function storeReady(service) {
  return Boolean(service && service.store && service.store.available === true);
}

async function handlePromptProfilesActions({ req, res, url, context, withAdmin }) {
  if (req.method === "POST" && url.pathname === "/admin/actions/prompt-profiles-save") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo").trim() || RETURN_PATH;
      const service = innerContext.promptProfiles || null;

      if (!storeReady(service)) {
        return redirect(innerRes, {
          returnTo,
          theme,
          error: "Could not save — no database is configured, so prompt profiles stay read-only.",
        });
      }

      const profileId = fieldValue(fields, "profileId").trim();
      const profileName = fieldValue(fields, "profileName").trim() || "Default";
      const prompts = buildPromptsFromFields(fields);
      const setActive = Boolean(fields.set_active);

      try {
        let saved;
        if (profileId) {
          saved = await service.saveProfile({ id: profileId, profileName, prompts });
        } else {
          saved = await service.createProfile({ profileName, prompts });
        }

        const savedId = saved && saved.id ? String(saved.id) : profileId;
        if (setActive && savedId) {
          await service.setActive(savedId);
        }

        return redirect(innerRes, {
          returnTo,
          theme,
          message: setActive ? "Saved and activated prompt profile." : "Saved prompt profile.",
          extra: savedId ? { profileId: savedId } : {},
        });
      } catch (error) {
        innerContext.logger?.error?.("[prompt-profiles] Failed to save profile from dashboard.", {
          error: error.message,
        });
        return redirect(innerRes, { returnTo, theme, error: "Failed to save prompt profile." });
      }
    })(req, res, context);
  }

  if (req.method === "POST" && url.pathname === "/admin/actions/prompt-profiles-reset") {
    return withAdmin(async (innerReq, innerRes, innerContext) => {
      const { fields } = await parseRequestForm(innerReq);
      const theme = normalizeTheme(fields.theme);
      const returnTo = fieldValue(fields, "returnTo").trim() || RETURN_PATH;
      const service = innerContext.promptProfiles || null;

      if (!storeReady(service)) {
        return redirect(innerRes, {
          returnTo,
          theme,
          error: "Could not reset — no database is configured, so prompt profiles stay read-only.",
        });
      }

      const profileId = fieldValue(fields, "profileId").trim();
      if (!profileId) {
        return redirect(innerRes, {
          returnTo,
          theme,
          error: "Save the profile once before resetting it to defaults.",
        });
      }

      try {
        await service.resetToDefaults(profileId);
        return redirect(innerRes, {
          returnTo,
          theme,
          message: "Reset prompt profile to generic defaults.",
          extra: { profileId },
        });
      } catch (error) {
        innerContext.logger?.error?.("[prompt-profiles] Failed to reset profile from dashboard.", {
          error: error.message,
        });
        return redirect(innerRes, { returnTo, theme, error: "Failed to reset prompt profile." });
      }
    })(req, res, context);
  }

  return false;
}

module.exports = { handlePromptProfilesActions };
