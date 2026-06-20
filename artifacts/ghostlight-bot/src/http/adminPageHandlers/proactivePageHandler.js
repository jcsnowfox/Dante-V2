const { loadConversationStorage, loadDailyThreadAutomation, loadDiscordTargetOptions, buildProactiveQueryState, buildConversationCleanupQueryState } = require("./shared");
const { isDailyThreadAction } = require("../../automations/dailyThreadAction");

function filterAndSortProactiveActions(actions = [], query = {}, { mode = "schedule" } = {}) {
  const items = Array.isArray(actions) ? [...actions] : [];
  const showInactive = query.showInactive === true;
  const sort = String(query.sort || "name").trim();
  const direction = String(query.direction || "asc").trim().toLowerCase() === "desc" ? -1 : 1;

  const filtered = items.filter((action) => showInactive || action.enabled !== false);

  const compareText = (left, right) => String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });

  filtered.sort((left, right) => {
    let comparison = 0;

    if (sort === "type") {
      comparison = compareText(left.actionType || left.executorType, right.actionType || right.executorType);
    } else if (sort === "status") {
      comparison = compareText(left.enabled === false ? "off" : "on", right.enabled === false ? "off" : "on");
    } else if (sort === "quietHours" && mode === "heartbeat") {
      comparison = compareText(left.quietHoursAllowed ? "on" : "off", right.quietHoursAllowed ? "on" : "off");
    } else if (sort === "frequency" && mode === "heartbeat") {
      const order = ["low", "normal", "high"];
      comparison = (order.indexOf(String(left.frequency || "").toLowerCase()) - order.indexOf(String(right.frequency || "").toLowerCase()));
    } else if (sort === "time" && mode === "schedule") {
      comparison = compareText(left.scheduleTime, right.scheduleTime);
    } else if (sort === "runs" && mode === "schedule") {
      comparison = compareText(
        left.scheduleMode === "weekly" ? `${left.scheduleMode}:${left.scheduleDay || ""}` : (left.scheduleMode || ""),
        right.scheduleMode === "weekly" ? `${right.scheduleMode}:${right.scheduleDay || ""}` : (right.scheduleMode || ""),
      );
    } else {
      comparison = compareText(left.name || left.label, right.name || right.label);
    }

    if (comparison === 0) {
      comparison = compareText(left.name || left.label, right.name || right.label);
    }

    return comparison * direction;
  });

  return filtered;
}

async function handleCompanionPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderCompanionPage } = helpers;
  const companionTab = url.searchParams.get("companionTab") || "identity";
  const customReactionEmojiOptions = companionTab === "emojis"
    ? await loadCustomReactionEmojiOptions({ innerContext })
    : [];

  innerRes.end(renderAdminShell({
    currentSection: "companion",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderCompanionPage({
      config: innerContext.config,
      theme,
      helpers,
      companionTab,
      customReactionEmojiOptions,
    }),
  }));
}

async function handleEmotionalArcPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderEmotionalArcPage } = helpers;
  const engine = innerContext.emotionalArc || null;

  let profile = {};
  let currentState = null;
  let auditEntries = [];
  let companionId = "";
  let storeAvailable = false;

  if (engine && engine.stateService) {
    try {
      companionId = engine.stateService.resolveCompanionId();
    } catch {
      companionId = "";
    }

    try {
      profile = (await engine.stateService.loadProfile()) || {};
    } catch {
      profile = {};
    }

    try {
      currentState = await engine.stateService.getCurrentState();
    } catch {
      currentState = null;
    }

    try {
      const summary = await engine.stateService.getStoreSummary();
      storeAvailable = Boolean(summary && summary.available);
    } catch {
      storeAvailable = false;
    }

    if (engine.auditLog && typeof engine.auditLog.list === "function") {
      try {
        auditEntries = await engine.auditLog.list({ limit: 50 });
      } catch {
        auditEntries = [];
      }
    }
  }

  innerRes.end(renderAdminShell({
    currentSection: "emotionalArc",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderEmotionalArcPage({
      profile,
      currentState,
      auditEntries,
      companionId,
      storeAvailable,
      theme,
    }),
  }));
}

function formatDiscordEmojiOption(emoji) {
  const id = String(emoji?.id || "").trim();
  const name = String(emoji?.name || "").trim();
  const animated = Boolean(emoji?.animated);

  if (!id || !name) {
    return null;
  }

  const extension = animated ? "gif" : "png";
  const fallbackUrl = `https://cdn.discordapp.com/emojis/${id}.${extension}?size=32&quality=lossless`;

  return {
    id,
    name,
    animated,
    available: emoji?.available !== false,
    url: emoji?.imageURL?.({ extension, size: 32 }) || fallbackUrl,
  };
}

async function loadCustomReactionEmojiOptions({ innerContext }) {
  const guildId = String(innerContext.config?.discord?.guildId || "").trim();
  const client = innerContext.client;

  if (!guildId || !client?.guilds) {
    return [];
  }

  try {
    const guild = client.guilds.cache?.get?.(guildId) || await client.guilds.fetch(guildId);
    const emojis = guild?.emojis?.fetch
      ? await guild.emojis.fetch()
      : guild?.emojis?.cache;

    return Array.from(emojis?.values?.() || [])
      .map(formatDiscordEmojiOption)
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
  } catch (error) {
    innerContext.logger?.warn?.("[admin] Failed to load Discord custom emojis", {
      guildId,
      error: error.message,
    });
    return [];
  }
}

async function handleBehaviourPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderCompanionPage } = helpers;
  const companionTab = url.searchParams.get("behaviourTab") || "models";
  const customReactionEmojiOptions = companionTab === "emojis"
    ? await loadCustomReactionEmojiOptions({ innerContext })
    : [];

  innerRes.end(renderAdminShell({
    currentSection: "companion",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderCompanionPage({
      config: innerContext.config,
      theme,
      helpers,
      companionTab,
      customReactionEmojiOptions,
    }),
  }));
}

async function handleSchedulesPageRequest({ url, route = {}, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderSchedulesPage } = helpers;
  const automationId = String(url.searchParams.get("automation") || "").trim();
  const query = buildProactiveQueryState(url, { defaultSort: "name", defaultDirection: "asc" });
  const allAutomations = await innerContext.proactiveActionStore.listActions({
    userScope: innerContext.config.memory.userScope,
    triggerType: "scheduled",
  });
  const scheduledActions = allAutomations.filter((action) => !isDailyThreadAction(action));
  const visibleAutomations = filterAndSortProactiveActions(scheduledActions, query, { mode: "schedule" });
  const failedAutomations = scheduledActions.filter((automation) => String(automation.lastError || "").trim());
  const editingAutomation = automationId
    ? await innerContext.proactiveActionStore.getActionById(automationId, {
      userScope: innerContext.config.memory.userScope,
    })
    : null;
  const dailyThreadAutomation = await loadDailyThreadAutomation(innerContext);
  const scheduleTargets = await loadDiscordTargetOptions(
    innerContext,
    allAutomations
      .map((action) => action.target)
      .concat(editingAutomation?.target || [])
      .concat(dailyThreadAutomation?.channelId || []),
  );

  innerRes.end(renderAdminShell({
    currentSection: "schedules",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderSchedulesPage({
      currentTab: route.tab || "actions",
      config: innerContext.config,
      automations: visibleAutomations,
      failedAutomations,
      editingAutomation,
      dailyThreadAutomation,
      targetOptions: scheduleTargets.options,
      targetLabelsByValue: scheduleTargets.labelsByValue,
      query,
      theme,
    }),
  }));
}

async function handleJournalsPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderJournalsPage } = helpers;
  const journalPage = Math.max(1, Number(url.searchParams.get("journalPage")) || 1);
  const journalPageSize = 8;
  const totalJournalEntries = await innerContext.journalStore.countEntries({
    userScope: innerContext.config.memory.userScope,
  });
  const journalEntries = await innerContext.journalStore.listRecentEntries({
    userScope: innerContext.config.memory.userScope,
    limit: journalPageSize,
    offset: (journalPage - 1) * journalPageSize,
  });
  const currentEntry = route.entry
    ? await innerContext.journalStore.getEntryById(route.entry, {
      userScope: innerContext.config.memory.userScope,
    })
    : null;

  if (route.entry && !currentEntry) {
    innerRes.end(renderAdminShell({
      currentSection: "journals",
      theme,
      themeLinks,
      message: getMessage(url),
      error: "Journal entry not found.",
      pageBody: renderJournalsPage({
        config: innerContext.config,
        journalEntries,
        journalPage,
        journalTotalPages: Math.max(1, Math.ceil(totalJournalEntries / journalPageSize)),
        theme,
      }),
    }));
    return;
  }

  innerRes.end(renderAdminShell({
    currentSection: "journals",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderJournalsPage({
      config: innerContext.config,
      journalEntries,
      currentEntry,
      journalPage,
      journalTotalPages: Math.max(1, Math.ceil(totalJournalEntries / journalPageSize)),
      theme,
    }),
  }));
}

async function handleHeartbeatPageRequest({ url, route, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderHeartbeatPage } = helpers;
  const query = buildProactiveQueryState(url, { defaultSort: "name", defaultDirection: "asc" });
  const heartbeatActions = await innerContext.proactiveActionStore.listActions({
    userScope: innerContext.config.memory.userScope,
    triggerType: "heartbeat",
  });
  const visibleHeartbeatActions = filterAndSortProactiveActions(heartbeatActions, query, { mode: "heartbeat" });
  const runtime = await innerContext.heartbeat.getRuntimeSnapshot();
  const selectedActionId = String(url.searchParams.get("action") || "").trim();
  const heartbeatTargets = await loadDiscordTargetOptions(
    innerContext,
    heartbeatActions.map((action) => action.target).concat(selectedActionId ? heartbeatActions.find((action) => action.actionId === selectedActionId)?.target || [] : []),
  );

  innerRes.end(renderAdminShell({
    currentSection: "heartbeat",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderHeartbeatPage({
      currentTab: route.tab || "overview",
      selectedActionId,
      theme,
      config: innerContext.config,
      actions: visibleHeartbeatActions,
      runtime,
      targetOptions: heartbeatTargets.options,
      targetLabelsByValue: heartbeatTargets.labelsByValue,
      query,
    }),
  }));
}

async function handleAdminToolsPageRequest({ url, route = {}, innerRes, innerContext, helpers, theme, themeLinks }) {
  const { getMessage, getError, renderAdminShell, renderAdminToolsPage } = helpers;
  const query = buildConversationCleanupQueryState(url);
  const conversationStorage = await loadConversationStorage(innerContext, query);

  innerRes.end(renderAdminShell({
    currentSection: "admin",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderAdminToolsPage({
      config: innerContext.config,
      conversationStorage,
      currentTab: route.tab || "storage",
      theme,
      query,
    }),
  }));
}

async function handleChannelModesPageRequest({ url, innerRes, innerContext, helpers, theme, themeLinks }) {
  const {
    getMessage,
    getError,
    renderAdminShell,
    renderChannelModesPage,
  } = helpers;
  const modes = await innerContext.channelModes.listModes();
  const channelTargets = await loadDiscordTargetOptions(innerContext, [], {
    includeThreads: false,
  });
  const guildId = String(innerContext.config.discord?.guildId || "").trim();
  const channelModeAssignments = innerContext.channelModes.listAssignments
    ? await innerContext.channelModes.listAssignments({ guildId })
    : [];

  innerRes.end(renderAdminShell({
    currentSection: "admin",
    theme,
    themeLinks,
    message: getMessage(url),
    error: getError(url),
    pageBody: renderChannelModesPage({
      config: innerContext.config,
      modes,
      channelOptions: channelTargets.options.filter((option) => option.value !== "daily"),
      channelModeAssignments,
      selectedModeKey: String(url.searchParams.get("mode") || "").trim(),
      theme,
    }),
  }));
}

module.exports = {
  handleCompanionPageRequest,
  handleBehaviourPageRequest,
  handleEmotionalArcPageRequest,
  handleSchedulesPageRequest,
  handleJournalsPageRequest,
  handleHeartbeatPageRequest,
  handleAdminToolsPageRequest,
  handleChannelModesPageRequest,
};
