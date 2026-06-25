const { getTimezoneOffset } = require("../config/timezones");

function getCycleOfDay(hour) {
  if (hour >= 5 && hour < 9) return "early morning";
  if (hour >= 9 && hour < 12) return "morning";
  if (hour >= 12 && hour < 14) return "midday";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 21) return "evening";
  return "late night";
}

function getSeason(month) {
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

function getQuarter(month) {
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

function getMonthName(month) {
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return names[Math.max(0, Math.min(11, month - 1))];
}

function getWeekday(date) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[date.getDay()];
}

function resolveTimezone(config = {}, companionConfig = {}, customerConfig = {}) {
  // Priority: user/customer setting > companion setting > env DEFAULT_TIMEZONE > UTC
  const tz = customerConfig?.timezone
    || companionConfig?.timezone
    || process.env.DEFAULT_TIMEZONE
    || "UTC";

  return {
    iana: tz,
    source: customerConfig?.timezone
      ? "customer_setting"
      : companionConfig?.timezone
        ? "companion_setting"
        : process.env.DEFAULT_TIMEZONE
          ? "env_default_timezone"
          : "fallback_utc",
  };
}

function buildWorldContext(options = {}) {
  const {
    now = new Date(),
    timezone = null,
    companionConfig = {},
    customerConfig = {},
    config = {},
    logger = null,
  } = options;

  const tzResolution = resolveTimezone(config, companionConfig, customerConfig);
  const resolvedTz = tzResolution.iana;

  let localDate;
  try {
    // Format using the resolved timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: resolvedTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const partsMap = {};
    parts.forEach((part) => {
      if (part.type !== "literal") {
        partsMap[part.type] = part.value;
      }
    });

    const year = parseInt(partsMap.year, 10);
    const month = parseInt(partsMap.month, 10);
    const day = parseInt(partsMap.day, 10);
    const hour = parseInt(partsMap.hour, 10);
    const minute = parseInt(partsMap.minute, 10);
    const second = parseInt(partsMap.second, 10);

    localDate = {
      year,
      month,
      day,
      hour,
      minute,
      second,
    };
  } catch (error) {
    if (logger) {
      logger.warn("[world-context] Failed to format date for timezone", {
        timezone: resolvedTz,
        error: error.message,
      });
    }
    // Fallback to UTC
    localDate = {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
      hour: now.getUTCHours(),
      minute: now.getUTCMinutes(),
      second: now.getUTCSeconds(),
    };
    tzResolution.source = "fallback_utc_format_error";
  }

  const cycleOfDay = getCycleOfDay(localDate.hour);
  const season = getSeason(localDate.month);
  const quarter = getQuarter(localDate.month);
  const monthName = getMonthName(localDate.month);
  const weekday = getWeekday(new Date(now.getTime()));

  let utcOffset = null;
  try {
    const tzOffset = getTimezoneOffset(resolvedTz);
    if (tzOffset !== null) {
      const offsetHours = Math.floor(Math.abs(tzOffset) / 60);
      const offsetMinutes = Math.abs(tzOffset) % 60;
      const sign = tzOffset >= 0 ? "+" : "-";
      utcOffset = `UTC${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;
    }
  } catch (_error) {
    // UTC offset calculation failed, will be null
  }

  const isoTimestamp = now.toISOString();
  const humanReadableTimestamp = `${weekday}, ${monthName} ${localDate.day}, ${localDate.year} at ${String(localDate.hour).padStart(2, "0")}:${String(localDate.minute).padStart(2, "0")}`;

  const context = {
    timestamp: {
      iso: isoTimestamp,
      humanReadable: humanReadableTimestamp,
      unix: Math.floor(now.getTime() / 1000),
    },
    timezone: {
      iana: resolvedTz,
      utcOffset,
      source: tzResolution.source,
    },
    time: {
      hour: localDate.hour,
      minute: localDate.minute,
      second: localDate.second,
      cycleOfDay,
    },
    date: {
      year: localDate.year,
      month: localDate.month,
      monthName,
      day: localDate.day,
      weekday,
    },
    seasonal: {
      season,
      quarter,
    },
  };

  return context;
}

function formatWorldContextForPrompt(worldContext) {
  if (!worldContext || typeof worldContext !== "object") {
    return "World context not available";
  }

  const { timestamp, time, date, seasonal, timezone } = worldContext;

  const lines = [
    "## WORLD CONTEXT",
    "",
    "### Current Time",
    `Local Time: ${timestamp.humanReadable}`,
    `Timezone: ${timezone.iana} (${timezone.utcOffset || "UTC offset unknown"})`,
    `Time of Day: ${time.cycleOfDay}`,
    "",
    "### Date",
    `Weekday: ${date.weekday}`,
    `Date: ${date.monthName} ${date.day}, ${date.year}`,
    `Season: ${seasonal.season} | Quarter: ${seasonal.quarter}`,
    "",
  ];

  return lines.join("\n");
}

module.exports = {
  buildWorldContext,
  formatWorldContextForPrompt,
  resolveTimezone,
  getCycleOfDay,
  getSeason,
  getQuarter,
};
