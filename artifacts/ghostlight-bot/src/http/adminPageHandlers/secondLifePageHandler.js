/**
 * handleSecondLifePageRequest
 *
 * Loads the Second Life bridge dashboard state (companion id, store availability,
 * bridge settings, live status, registry summary) and renders the page. Every
 * load is guarded so the page still renders when no DB is configured.
 */

const { resolveCompanionId } = require("../../companion/resolveCompanionId");

async function handleSecondLifePageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderSecondLifePage } = helpers;
  const store = innerContext.secondLife || null;
  const config = innerContext.config || {};

  let companionId = "";
  try {
    companionId = resolveCompanionId(config);
  } catch {
    companionId = "";
  }

  let storeAvailable = false;
  let settings = null;
  let status = null;
  let summary = null;
  let relationships = [];
  let objectRelationships = [];
  let commands = [];
  let outfits = [];
  let landmarks = [];
  let objects = [];
  let schedule = [];
  let discoveries = [];
  let scheduleEditing = null;
  let sharedExperiences = [];
  let experienceEditing = null;
  let goals = [];
  let goalEditing = null;
  let initiatives = [];
  let copyBlock = "";

  const config2 = config || {};
  const lifeEngineEnabled = Boolean(config2.secondLife?.lifeEngine?.enabled);
  const lifeEngineAutonomy = String(config2.secondLife?.lifeEngine?.autonomyLevel || "medium");
  const ini = config2.secondLife?.lifeEngine?.initiative || {};
  const initiativeSettings = {
    enabled: Boolean(ini.enabled),
    maxPerDay: Number.isFinite(Number(ini.maxPerDay)) ? Number(ini.maxPerDay) : 3,
    cooldownMinutes: Number.isFinite(Number(ini.cooldownMinutes)) ? Number(ini.cooldownMinutes) : 120,
    quietHoursStart: Number.isFinite(Number(ini.quietHoursStart)) ? Number(ini.quietHoursStart) : 22,
    quietHoursEnd: Number.isFinite(Number(ini.quietHoursEnd)) ? Number(ini.quietHoursEnd) : 7,
  };

  if (store && store.available === true && companionId) {
    storeAvailable = true;
    try {
      status = await store.getBridgeStatus({ companionId });
      settings = status && status.settings ? status.settings : null;
    } catch {
      status = null;
    }
    if (!settings) {
      try {
        settings = await store.loadBridgeSettings({ companionId });
      } catch {
        settings = null;
      }
    }
    try {
      summary = await store.getStoreSummary({ companionId });
    } catch {
      summary = null;
    }
    try {
      relationships = await store.listRelationships({ companionId });
    } catch {
      relationships = [];
    }
    try {
      objectRelationships = await store.listObjectRelationships({ companionId });
    } catch {
      objectRelationships = [];
    }
    try {
      commands = await store.listCommandDefinitions({ companionId });
    } catch {
      commands = [];
    }
    try {
      outfits = await store.listOutfits({ companionId });
    } catch {
      outfits = [];
    }
    try {
      landmarks = await store.listLandmarks({ companionId });
    } catch {
      landmarks = [];
    }
    try {
      objects = await store.listObjects({ companionId });
    } catch {
      objects = [];
    }
    try {
      schedule = await store.listSchedule({ companionId });
    } catch {
      schedule = [];
    }
    try {
      const editScheduleId = url.searchParams.get("editScheduleId");
      if (editScheduleId) {
        scheduleEditing = (Array.isArray(schedule) ? schedule : [])
          .find((e) => String(e.id) === String(editScheduleId)) || null;
      }
    } catch {
      scheduleEditing = null;
    }
    try {
      discoveries = await store.listDiscoveries({ companionId });
    } catch {
      discoveries = [];
    }
    try {
      sharedExperiences = await store.listSharedExperiences({ companionId });
    } catch {
      sharedExperiences = [];
    }
    try {
      const editExperienceId = url.searchParams.get("editExperienceId");
      if (editExperienceId) {
        experienceEditing = (Array.isArray(sharedExperiences) ? sharedExperiences : [])
          .find((e) => String(e.id) === String(editExperienceId)) || null;
      }
    } catch {
      experienceEditing = null;
    }
    try {
      goals = await store.listGoals({ companionId });
    } catch {
      goals = [];
    }
    try {
      const editGoalId = url.searchParams.get("editGoalId");
      if (editGoalId) {
        goalEditing = (Array.isArray(goals) ? goals : [])
          .find((g) => String(g.id) === String(editGoalId)) || null;
      }
    } catch {
      goalEditing = null;
    }
    try {
      initiatives = await store.listInitiatives({ companionId });
    } catch {
      initiatives = [];
    }
  }

  const commandRegistry = innerContext.secondLifeCommandRegistry || null;
  if (commandRegistry && typeof commandRegistry.listForCopy === "function") {
    try {
      copyBlock = await commandRegistry.listForCopy({ companionId });
    } catch {
      copyBlock = "";
    }
  } else {
    copyBlock = (Array.isArray(commands) ? commands : [])
      .filter((c) => c.enabled !== false)
      .map((c) => `${c.commandTrigger} — ${c.description || c.commandType || "custom"}`)
      .join("\n");
  }

  innerRes.end(renderAdminShell({
    currentSection: "secondLife",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderSecondLifePage({
      companionId,
      storeAvailable,
      settings,
      status,
      summary,
      relationships,
      objectRelationships,
      commands,
      outfits,
      landmarks,
      objects,
      schedule,
      discoveries,
      scheduleEditing,
      sharedExperiences,
      experienceEditing,
      goals,
      goalEditing,
      initiatives,
      initiativeSettings,
      lifeEngineEnabled,
      lifeEngineAutonomy,
      copyBlock,
      theme,
      helpers,
    }),
  }));
}

module.exports = { handleSecondLifePageRequest };
