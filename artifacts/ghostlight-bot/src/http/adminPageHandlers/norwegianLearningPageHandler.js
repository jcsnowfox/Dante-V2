async function handleNorwegianLearningPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderNorwegianLearningPage } = helpers;
  const store = innerContext.norwegianLearning || null;
  const userScope = innerContext.config?.memory?.userScope || 'user';

  let settings = null;
  let overview = null;
  let storeAvailable = false;

  if (store && store.available === true) {
    storeAvailable = true;

    try {
      settings = await store.getProfile(userScope);
    } catch {
      settings = null;
    }

    try {
      overview = await store.getOverview(userScope);
    } catch {
      overview = null;
    }
  }

  innerRes.end(renderAdminShell({
    currentSection: 'norwegian',
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderNorwegianLearningPage({
      settings,
      overview,
      storeAvailable,
      theme,
      helpers,
    }),
  }));
}

module.exports = { handleNorwegianLearningPageRequest };
