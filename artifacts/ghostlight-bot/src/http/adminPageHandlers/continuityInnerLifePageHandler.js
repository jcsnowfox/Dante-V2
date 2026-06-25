"use strict";

const { renderContinuityInnerLifePage } = require("../renderAdminPages/continuityInnerLifePage");

async function handleContinuityInnerLifePageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell } = helpers;

  const rawTab = url.pathname.split("/")[3] || "overview";
  const tab = rawTab || "overview";

  const userScope = innerContext.config?.memory?.userScope || "user";
  const companionId = innerContext.config?.memory?.companionId || innerContext.config?.companion?.id || "Dante";
  const scope = { user_scope: userScope, companion_id: companionId };

  const innerLifeEngine = innerContext.innerLife || null;
  const continuityEngine = innerContext.continuity || null;

  const [
    weatherHistory,
    innerLifeEntries,
    continuityItems,
    promises,
    decisions,
    followUps,
    emotionalBeats,
  ] = await Promise.all([
    innerContext.innerWeatherStore?.listHistory
      ? innerContext.innerWeatherStore.listHistory({ ...scope, limit: 50 }).catch(() => [])
      : [],
    (async () => {
      if (!innerLifeEngine) return [];
      try {
        const storeAvailable = innerLifeEngine.store?.available === true;
        if (!storeAvailable) return [];
        return await innerLifeEngine.storeWrapper.list({ status: "active", limit: 50 });
      } catch { return []; }
    })(),
    (async () => {
      if (!continuityEngine) return [];
      try {
        const storeAvailable = continuityEngine.store?.available === true;
        if (!storeAvailable) return [];
        return await continuityEngine.storeWrapper.list({ status: "", limit: 100 });
      } catch { return []; }
    })(),
    innerContext.promiseLedger?.listPromises
      ? innerContext.promiseLedger.listPromises({ ...scope, limit: 50, allowAdultPrivate: false }).catch(() => [])
      : [],
    innerContext.recentDecisionStore?.listDecisions
      ? innerContext.recentDecisionStore.listDecisions({ ...scope, limit: 100, include_adult: false }).catch(() => [])
      : [],
    innerContext.followUpStore?.listFollowUps
      ? innerContext.followUpStore.listFollowUps({ ...scope, status: "open", limit: 50 }).catch(() => [])
      : [],
    innerContext.emotionalBeatStore?.listBeats
      ? innerContext.emotionalBeatStore.listBeats({ ...scope, limit: 100 }).catch(() => [])
      : [],
  ]);

  const innerWeatherCurrent = weatherHistory[0] || null;
  const data = {
    innerWeatherCurrent,
    weatherHistory,
    innerLifeEntries,
    continuityItems,
    promises,
    decisions,
    followUps,
    emotionalBeats,
    recentDecisionsCount: decisions.length,
    followUpsOpen: followUps.filter((f) => f.status === "open").length,
    continuityOpen: continuityItems.filter((i) => ["open","waiting","follow_up_due","outcome_pending"].includes(i.status)).length,
    innerLifeActive: innerLifeEntries.filter((e) => (e.status || "active") === "active").length,
    emotionalBeatsCount: emotionalBeats.length,
  };

  innerRes.end(
    renderAdminShell({
      currentSection: "continuity",
      theme,
      themeLinks,
      message: getMessage(url),
      error: getError(url),
      pageBody: renderContinuityInnerLifePage({
        tab,
        data,
        config: innerContext.config,
        helpers,
        theme,
      }),
    }),
  );
}

module.exports = { handleContinuityInnerLifePageRequest };
