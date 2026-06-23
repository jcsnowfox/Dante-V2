async function handleNorwegianDashboardRequest({ url, innerRes, innerContext, helpers, theme, themeLinks, logger }) {
  const { getMessage, getError, renderAdminShell, renderNorwegianDashboard } = helpers;
  const store = innerContext.norwegianLearning || null;
  const userScope = innerContext.config?.memory?.userScope || 'user';

  const query = new URLSearchParams(url.search);
  const activeTab = query.get('tab') || 'overview';

  logger?.info('[norwegian-dashboard] view rendered', { userScope, tab: activeTab });

  let settings = null;
  let overview = null;
  let lessons = [];
  let corrections = [];
  let vocabulary = [];
  let mediaLinks = [];
  let reviewItems = [];
  let pronunciationAttempts = [];
  let storeAvailable = false;

  if (store && store.available === true) {
    storeAvailable = true;

    try {
      settings = await store.getProfile(userScope);
      logger?.info('[norwegian-dashboard] overview loaded', { userScope });
    } catch (error) {
      logger?.warn('[norwegian-dashboard] Failed to load profile', { error: error.message });
    }

    try {
      overview = await store.getOverview(userScope);
    } catch (error) {
      logger?.warn('[norwegian-dashboard] Failed to load overview', { error: error.message });
    }

    try {
      lessons = await store.listNorwegianLessons(userScope, 50);
      logger?.info('[norwegian-dashboard] lessons listed', { count: lessons.length });
    } catch (error) {
      logger?.warn('[norwegian-dashboard] Failed to load lessons', { error: error.message });
    }

    try {
      corrections = await store.listNorwegianCorrections(userScope, 50);
      logger?.info('[norwegian-dashboard] corrections listed', { count: corrections.length });
    } catch (error) {
      logger?.warn('[norwegian-dashboard] Failed to load corrections', { error: error.message });
    }

    try {
      vocabulary = await store.listNorwegianVocabulary(userScope, 100);
      logger?.info('[norwegian-dashboard] vocabulary listed', { count: vocabulary.length });
    } catch (error) {
      logger?.warn('[norwegian-dashboard] Failed to load vocabulary', { error: error.message });
    }

    try {
      mediaLinks = await store.listNorwegianMediaLinks(userScope, 50);
      logger?.info('[norwegian-dashboard] media listed', { count: mediaLinks.length });
    } catch (error) {
      logger?.warn('[norwegian-dashboard] Failed to load media', { error: error.message });
    }

    try {
      reviewItems = await store.listNorwegianReviewItems(userScope, 50);
      logger?.info('[norwegian-dashboard] review listed', { count: reviewItems.length });
    } catch (error) {
      logger?.warn('[norwegian-dashboard] Failed to load review items', { error: error.message });
    }

    try {
      pronunciationAttempts = await store.listNorwegianPronunciationAttempts(userScope, 50);
    } catch (error) {
      logger?.warn('[norwegian-dashboard] Failed to load pronunciation', { error: error.message });
    }
  }

  innerRes.end(renderAdminShell({
    currentSection: 'norwegian',
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderNorwegianDashboard({
      settings,
      overview,
      lessons,
      corrections,
      vocabulary,
      mediaLinks,
      reviewItems,
      pronunciationAttempts,
      storeAvailable,
      theme,
      helpers,
      activeTab,
    }),
  }));
}

module.exports = { handleNorwegianDashboardRequest };
