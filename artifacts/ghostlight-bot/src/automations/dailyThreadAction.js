const DAILY_THREAD_ACTION_TYPE = "daily_thread";
const DAILY_THREAD_LABEL = "Daily Thread";
const DEFAULT_DAILY_THREAD_TITLE_TEMPLATE = "MMM-DD [Day] - Daily Thread";
const DEFAULT_DAILY_THREAD_MODE_KEY = "daily";

function isDailyThreadAction(action = {}) {
  return String(action.actionType || action.action_type || action.type || "").trim().toLowerCase() === DAILY_THREAD_ACTION_TYPE;
}

function findDailyThreadAction(actions = []) {
  return (Array.isArray(actions) ? actions : []).find(isDailyThreadAction) || null;
}

function mapDailyThreadActionToAutomation(action = {}, config = {}) {
  if (!action) {
    return null;
  }

  return {
    automationId: action.actionId,
    source: "proactive_action",
    triggerType: action.triggerType || "scheduled",
    type: DAILY_THREAD_ACTION_TYPE,
    label: action.name || DAILY_THREAD_LABEL,
    channelId: action.target || "",
    scheduleTime: action.scheduleTime || "09:00",
    timezone: action.timezone || config.chat?.timezone || "UTC",
    prompt: action.prompt || "",
    enabledTools: Array.isArray(action.enabledTools) ? action.enabledTools : [],
    threadTitleTemplate: action.threadTitleTemplate || DEFAULT_DAILY_THREAD_TITLE_TEMPLATE,
    threadStarterPrompt: action.threadStarterPrompt || action.prompt || "",
    threadModeKey: action.threadModeKey || DEFAULT_DAILY_THREAD_MODE_KEY,
    enabled: Boolean(action.enabled),
    mentionUser: false,
    userId: "",
    userScope: action.userScope || config.memory?.userScope || "",
    lastRunAt: action.lastRunAt || null,
    lastError: action.lastError || "",
  };
}

async function listDailyThreadActions({ proactiveActionStore, userScope } = {}) {
  if (!proactiveActionStore?.listActions) {
    return [];
  }

  const actions = await proactiveActionStore.listActions({
    userScope,
    triggerType: "scheduled",
  });

  return actions.filter(isDailyThreadAction);
}

async function loadDailyThreadAutomation({
  proactiveActionStore,
  automationStore,
  config = {},
  logger = console,
} = {}) {
  const userScope = config.memory?.userScope || "";

  try {
    const action = findDailyThreadAction(await listDailyThreadActions({
      proactiveActionStore,
      userScope,
    }));

    if (action) {
      return mapDailyThreadActionToAutomation(action, config);
    }
  } catch (error) {
    logger.warn?.("[daily-thread] Failed to load proactive daily thread action", {
      error: error?.message || String(error),
    });
  }

  try {
    return (await automationStore.listAutomations({
      userScope,
      type: DAILY_THREAD_ACTION_TYPE,
    }))[0] || null;
  } catch (error) {
    logger.warn?.("[daily-thread] Failed to load legacy daily thread automation", {
      error: error?.message || String(error),
    });
    return null;
  }
}

function buildDailyThreadActionRecord({
  settings = {},
  existing = null,
  config = {},
} = {}) {
  return {
    actionId: existing?.actionId || undefined,
    triggerType: "scheduled",
    name: DAILY_THREAD_LABEL,
    actionType: DAILY_THREAD_ACTION_TYPE,
    target: settings.channelId || existing?.target || existing?.channelId || "",
    prompt: settings.threadStarterPrompt || existing?.threadStarterPrompt || existing?.prompt || "",
    enabledTools: settings.enabledTools || existing?.enabledTools || [],
    enabled: Boolean(settings.enabled),
    scheduleMode: "daily",
    scheduleTime: settings.scheduleTime || existing?.scheduleTime || "09:00",
    scheduleDay: "monday",
    timezone: config.chat?.timezone || existing?.timezone || "UTC",
    mentionUser: false,
    threadTitleTemplate: settings.threadTitleTemplate || existing?.threadTitleTemplate || DEFAULT_DAILY_THREAD_TITLE_TEMPLATE,
    threadStarterPrompt: settings.threadStarterPrompt || existing?.threadStarterPrompt || existing?.prompt || "",
    threadModeKey: DEFAULT_DAILY_THREAD_MODE_KEY,
    lastRunAt: existing?.lastRunAt || "",
    lastError: existing?.lastError || "",
  };
}

module.exports = {
  DAILY_THREAD_ACTION_TYPE,
  DAILY_THREAD_LABEL,
  DEFAULT_DAILY_THREAD_TITLE_TEMPLATE,
  DEFAULT_DAILY_THREAD_MODE_KEY,
  isDailyThreadAction,
  findDailyThreadAction,
  mapDailyThreadActionToAutomation,
  listDailyThreadActions,
  loadDailyThreadAutomation,
  buildDailyThreadActionRecord,
};
