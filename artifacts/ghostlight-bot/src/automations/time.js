const WEEKDAY_ORDER = Object.freeze([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

function getLocalDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    timeKey: `${map.hour}:${map.minute}`,
  };
}

function getPreviousLocalDateKey(date, timeZone) {
  const local = getLocalDateParts(date, timeZone);
  const previous = new Date(`${local.dateKey}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function getDateKeyOffset(dateKey, offsetDays) {
  const target = new Date(`${dateKey}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + offsetDays);
  return target.toISOString().slice(0, 10);
}

function getNextLocalMidnight(date, timeZone) {
  const localDateKey = getLocalDateParts(date, timeZone).dateKey;
  const next = new Date(`${localDateKey}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function getLocalWeekday(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(date).toLowerCase();
}

function getLocalWeekStartDateKey(date, timeZone, weekStartsOn = "monday") {
  const localDateKey = getLocalDateParts(date, timeZone).dateKey;
  const currentWeekday = getLocalWeekday(date, timeZone);
  const currentIndex = WEEKDAY_ORDER.indexOf(currentWeekday);
  const startIndex = WEEKDAY_ORDER.indexOf(String(weekStartsOn || "monday").toLowerCase());
  const distance = ((currentIndex - startIndex) + 7) % 7;
  return getDateKeyOffset(localDateKey, -distance);
}

function isCacheChannelReference(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "{{todays_thread}}" || normalized === "daily";
}

async function resolveAutomationChannelId(channelId, { cache, userScope } = {}) {
  const normalized = String(channelId || "").trim();

  if (!isCacheChannelReference(normalized)) {
    return normalized;
  }

  const resolved = await cache.getTodaysThreadId({ userScope });

  if (!resolved) {
    throw new Error("No current daily thread is cached for daily / todays_thread.");
  }

  return resolved;
}

function automationRanToday(automation, now = new Date()) {
  if (!automation?.lastRunAt) {
    return false;
  }

  const current = getLocalDateParts(now, automation.timezone || "UTC");
  const previous = getLocalDateParts(new Date(automation.lastRunAt), automation.timezone || "UTC");
  return current.dateKey === previous.dateKey;
}

function automationRanThisMinute(automation, now = new Date()) {
  if (!automation?.lastRunAt) {
    return false;
  }

  const timezone = automation.timezone || "UTC";
  const current = getLocalDateParts(now, timezone);
  const previous = getLocalDateParts(new Date(automation.lastRunAt), timezone);
  return current.dateKey === previous.dateKey && current.timeKey === previous.timeKey;
}

function isAutomationDueNow(automation, now = new Date()) {
  if (!automation?.enabled || !["check_in", "journal", "daily_thread"].includes(automation.type)) {
    return false;
  }

  const current = getLocalDateParts(now, automation.timezone || "UTC");
  return current.timeKey === automation.scheduleTime && !automationRanThisMinute(automation, now);
}

function dailySummaryRanToday(config, now = new Date()) {
  const lastRunAt = config.memory?.dailySummaryLastRunAt;

  if (!lastRunAt) {
    return false;
  }

  const timezone = config.chat?.timezone || "UTC";
  const current = getLocalDateParts(now, timezone);
  const previous = getLocalDateParts(new Date(lastRunAt), timezone);
  return current.dateKey === previous.dateKey;
}

function weeklySummaryRanThisWeek(config, now = new Date()) {
  const lastRunAt = config.memory?.weeklySummaryLastRunAt;

  if (!lastRunAt) {
    return false;
  }

  const timezone = config.chat?.timezone || "UTC";
  const currentWeekStart = getLocalWeekStartDateKey(now, timezone, config.memory?.weeklySummaryDay || "monday");
  const previousWeekStart = getLocalWeekStartDateKey(new Date(lastRunAt), timezone, config.memory?.weeklySummaryDay || "monday");
  return currentWeekStart === previousWeekStart;
}

function parseTimeToMinutes(value, fallback = "04:00") {
  const normalized = String(value || fallback).trim() || fallback;
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return parseTimeToMinutes(fallback, "04:00");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return parseTimeToMinutes(fallback, "04:00");
  }

  return (hours * 60) + minutes;
}

function isScheduledTimeReached(currentTimeKey, scheduleTime) {
  return parseTimeToMinutes(currentTimeKey) >= parseTimeToMinutes(scheduleTime);
}

function isDailySummaryDueNow(config, now = new Date()) {
  if (!config.memory?.dailySummaryEnabled) {
    return false;
  }

  const scheduleTime = String(config.memory?.dailySummaryTime || "04:00").trim() || "04:00";
  const timezone = config.chat?.timezone || "UTC";
  const current = getLocalDateParts(now, timezone);

  return isScheduledTimeReached(current.timeKey, scheduleTime) && !dailySummaryRanToday(config, now);
}

function isWeeklySummaryDueNow(config, now = new Date()) {
  if (!config.memory?.weeklySummaryEnabled) {
    return false;
  }

  const scheduleTime = String(config.memory?.weeklySummaryTime || "04:00").trim() || "04:00";
  const scheduleDay = String(config.memory?.weeklySummaryDay || "monday").trim().toLowerCase() || "monday";
  const timezone = config.chat?.timezone || "UTC";
  const current = getLocalDateParts(now, timezone);
  const currentWeekday = getLocalWeekday(now, timezone);

  return currentWeekday === scheduleDay
    && isScheduledTimeReached(current.timeKey, scheduleTime)
    && !weeklySummaryRanThisWeek(config, now);
}

function renderThreadTitle(template, now = new Date(), timezone = "UTC") {
  const shortFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "2-digit",
    weekday: "long",
  });
  const numericFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  });
  const shortParts = shortFormatter.formatToParts(now);
  const numericParts = numericFormatter.formatToParts(now);
  const shortMap = Object.fromEntries(shortParts.map((part) => [part.type, part.value]));
  const numericMap = Object.fromEntries(numericParts.map((part) => [part.type, part.value]));
  const map = {
    ...shortMap,
    year: numericMap.year,
    monthNumber: numericMap.month,
  };
  const titleTemplate = String(template || "").trim();

  if (!titleTemplate) {
    return `${map.month}-${map.day} [${map.weekday}] - Daily Thread`;
  }

  return titleTemplate
    .replace(/YYYY/g, map.year)
    .replace(/MMM/g, map.month)
    .replace(/MM/g, map.monthNumber)
    .replace(/DD/g, map.day)
    .replace(/Day/g, map.weekday);
}

module.exports = {
  getLocalDateParts,
  getPreviousLocalDateKey,
  getDateKeyOffset,
  getNextLocalMidnight,
  getLocalWeekday,
  getLocalWeekStartDateKey,
  isCacheChannelReference,
  resolveAutomationChannelId,
  automationRanToday,
  automationRanThisMinute,
  isAutomationDueNow,
  dailySummaryRanToday,
  weeklySummaryRanThisWeek,
  parseTimeToMinutes,
  isScheduledTimeReached,
  isDailySummaryDueNow,
  isWeeklySummaryDueNow,
  renderThreadTitle,
};
