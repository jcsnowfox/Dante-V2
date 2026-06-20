/**
 * handleRelationalStatePageRequest
 *
 * Loads the Relational State engine state (settings, current state, events,
 * desires, repairs, audit) for the Admin dashboard. Mirrors
 * handleFeedbackLearningPageRequest. Every load is guarded so the page renders
 * even when the engine is inert.
 */

async function handleRelationalStatePageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderRelationalStatePage } = helpers;
  const engine = innerContext.relationalState || null;

  let settings = null;
  let state = null;
  let events = [];
  let desires = [];
  let repairs = [];
  let auditEntries = [];
  let companionId = "";
  let storeAvailable = false;

  if (engine) {
    try {
      companionId = engine.resolveCompanionId();
    } catch {
      companionId = "";
    }

    try {
      settings = await engine.settingsService.loadSettings({ force: true });
    } catch {
      settings = null;
    }

    try {
      const summary = await engine.settingsService.getStoreSummary();
      storeAvailable = Boolean(summary && summary.available);
    } catch {
      storeAvailable = false;
    }

    try {
      state = await engine.stateService.getState();
    } catch {
      state = null;
    }

    try {
      events = await engine.eventService.listEvents({ limit: 50 });
    } catch {
      events = [];
    }

    try {
      desires = await engine.desireService.listDesires({ limit: 50 });
    } catch {
      desires = [];
    }

    try {
      repairs = await engine.repairService.listRepairs({ limit: 50 });
    } catch {
      repairs = [];
    }

    try {
      auditEntries = await engine.auditLog.list({ limit: 50 });
    } catch {
      auditEntries = [];
    }
  }

  innerRes.end(renderAdminShell({
    currentSection: "relationalState",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderRelationalStatePage({
      settings,
      state,
      events,
      desires,
      repairs,
      auditEntries,
      companionId,
      storeAvailable,
      theme,
      helpers,
    }),
  }));
}

module.exports = { handleRelationalStatePageRequest };
