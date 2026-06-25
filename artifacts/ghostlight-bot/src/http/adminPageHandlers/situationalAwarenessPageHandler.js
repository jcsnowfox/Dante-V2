"use strict";

const { renderSituationalAwarenessPage } = require("../renderAdminPages/situationalAwarenessPage");

async function handleSituationalAwarenessPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell } = helpers;

  const userScope = innerContext.config?.memory?.userScope || "user";
  const companionId = innerContext.config?.memory?.companionId || innerContext.config?.companion?.id || "";
  const scope = { user_scope: userScope, companion_id: companionId };

  const awarenessConfig = innerContext.config?.situationalAwareness || {};
  const engine = innerContext.situationalAwarenessEngine || null;
  const store = innerContext.situationalAwarenessStore || null;

  const [latestSnapshot, recentSnapshots] = await Promise.all([
    store?.getLatest ? store.getLatest(scope).catch(() => null) : null,
    store?.listRecent ? store.listRecent({ ...scope, limit: 10 }).catch(() => []) : [],
  ]);

  const data = {
    enabled: engine?.isEnabled?.() ?? (awarenessConfig.enabled !== false),
    persistenceEnabled: Boolean(store?.persistenceEnabled),
    storeSnapshots: Boolean(awarenessConfig.storeSnapshots),
    maxBullets: awarenessConfig.maxBullets || 8,
    sections: {
      time: awarenessConfig.includeTime !== false,
      presence: awarenessConfig.includePresence !== false,
      conversation: awarenessConfig.includeConversation !== false,
      relationship: awarenessConfig.includeRelationship !== false,
      memory: awarenessConfig.includeMemory !== false,
      projects: awarenessConfig.includeProjects !== false,
      world: awarenessConfig.includeWorld !== false,
      activity: awarenessConfig.includeActivity !== false,
      privacy: awarenessConfig.includePrivacy !== false,
      tools: awarenessConfig.includeTools !== false,
    },
    latestSnapshot,
    recentSnapshots: Array.isArray(recentSnapshots) ? recentSnapshots : [],
    userScope,
    companionId,
    warnings: latestSnapshot?.warnings_count ? [`Last snapshot had ${latestSnapshot.warnings_count} warning(s)`] : [],
  };

  innerRes.end(
    renderAdminShell({
      currentSection: "admin",
      theme,
      themeLinks,
      message: getMessage(url),
      error: getError(url),
      pageBody: renderSituationalAwarenessPage({
        data,
        config: innerContext.config,
        helpers,
        theme,
      }),
    }),
  );
}

module.exports = { handleSituationalAwarenessPageRequest };
