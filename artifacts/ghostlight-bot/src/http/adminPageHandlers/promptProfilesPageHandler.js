/**
 * handlePromptProfilesPageRequest
 *
 * Loads the prompt profile editor state (companion id, store availability,
 * saved profiles, active profile, the profile being edited, generic defaults)
 * and computes the assembled-prompt previews for Discord and Second Life.
 * Every load is guarded so the page renders even when no DB is configured.
 */

const { assembleCompanionPrompt } = require("../../companion/assembleCompanionPrompt");

async function handlePromptProfilesPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderPromptProfilesPage } = helpers;
  const service = innerContext.promptProfiles || null;

  let companionId = "";
  let storeAvailable = false;
  let profiles = [];
  let activeProfile = null;
  let editing = null;
  const defaults = service && typeof service.getDefaults === "function" ? service.getDefaults() : {};

  if (service) {
    try {
      companionId = service.resolveCompanionId();
    } catch {
      companionId = "";
    }

    try {
      const summary = await service.getStoreSummary();
      storeAvailable = Boolean(summary && summary.available);
    } catch {
      storeAvailable = false;
    }

    try {
      profiles = await service.listProfiles();
    } catch {
      profiles = [];
    }

    try {
      activeProfile = await service.getActiveProfile({ force: true });
    } catch {
      activeProfile = null;
    }

    const requestedId = String(url.searchParams.get("profileId") || "").trim();
    if (requestedId) {
      try {
        editing = await service.getProfile(requestedId);
      } catch {
        editing = null;
      }
    }
    if (!editing) {
      editing = activeProfile || (Array.isArray(profiles) && profiles.length ? profiles[0] : null);
    }
  }

  const previewSource = editing || defaults || {};
  let previews = { discord: "", secondLife: "" };
  try {
    previews = {
      discord: assembleCompanionPrompt({
        config: innerContext.config || {},
        profile: previewSource,
        channelType: "discord",
      }),
      secondLife: assembleCompanionPrompt({
        config: innerContext.config || {},
        profile: previewSource,
        channelType: "second_life",
      }),
    };
  } catch {
    previews = { discord: "", secondLife: "" };
  }

  innerRes.end(renderAdminShell({
    currentSection: "promptProfiles",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderPromptProfilesPage({
      companionId,
      storeAvailable,
      profiles,
      activeProfile,
      editing,
      defaults,
      previews,
      theme,
      helpers,
    }),
  }));
}

module.exports = { handlePromptProfilesPageRequest };
