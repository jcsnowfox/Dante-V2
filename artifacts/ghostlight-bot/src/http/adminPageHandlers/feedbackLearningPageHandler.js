/**
 * handleFeedbackLearningPageRequest
 *
 * Loads the Feedback & Learning engine state (settings, proposals, events,
 * audit) for the Admin dashboard. Mirrors handleEmotionalArcPageRequest. Every
 * load is guarded so the page renders even when the engine is inert.
 */

async function handleFeedbackLearningPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderFeedbackLearningPage } = helpers;
  const engine = innerContext.feedbackLearning || null;

  let settings = null;
  let proposals = [];
  let events = [];
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
      proposals = await engine.proposalService.listProposals({ limit: 50 });
    } catch {
      proposals = [];
    }

    try {
      events = await engine.eventService.listEvents({ limit: 50 });
    } catch {
      events = [];
    }

    try {
      auditEntries = await engine.auditLog.list({ limit: 50 });
    } catch {
      auditEntries = [];
    }
  }

  innerRes.end(renderAdminShell({
    currentSection: "feedbackLearning",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderFeedbackLearningPage({
      settings,
      proposals,
      events,
      auditEntries,
      companionId,
      storeAvailable,
      theme,
      helpers,
    }),
  }));
}

module.exports = { handleFeedbackLearningPageRequest };
