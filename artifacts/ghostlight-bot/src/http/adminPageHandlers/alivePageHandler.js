"use strict";

const { renderAlivePage } = require("../renderAdminPages/alivePage");

async function handleAlivePageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell } = helpers;

  const companionId = innerContext.config?.memory?.companionId || innerContext.config?.companion?.id || "";
  const customerId = innerContext.config?.memory?.userScope || "user";

  const aliveEngine = innerContext.aliveEngine || null;
  const aliveEventsStore = innerContext.aliveEventsStore || null;
  const intentionQueue = innerContext.intentionQueue || null;

  const scope = { companionId, customerId };

  const [recentEvents, pendingIntentions, recentIntentions] = await Promise.all([
    aliveEventsStore?.listRecent
      ? aliveEventsStore.listRecent({ ...scope, limit: 30 }).catch(() => [])
      : [],
    intentionQueue?.listPending
      ? intentionQueue.listPending({ ...scope, limit: 20 }).catch(() => [])
      : [],
    intentionQueue?.listRecent
      ? intentionQueue.listRecent({ ...scope, limit: 30 }).catch(() => [])
      : [],
  ]);

  const pendingCount = pendingIntentions.length;

  const data = {
    companionId,
    customerId,
    engineStatus: aliveEngine?.getStatus?.() || { enabled: false, running: false },
    pendingCount,
    pendingIntentions,
    recentIntentions,
    recentEvents,
  };

  innerRes.end(
    renderAdminShell({
      currentSection: "alive",
      theme,
      themeLinks,
      message: getMessage(url),
      error: getError(url),
      pageBody: renderAlivePage({ data, helpers }),
    }),
  );
}

module.exports = { handleAlivePageRequest };
