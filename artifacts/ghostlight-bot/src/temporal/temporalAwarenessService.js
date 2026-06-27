const { getClockPreset } = require("./clockPresets");

function validTimezone(value) {
  const timezone = String(value || "").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "UTC";
  }
}

function localParts(now, timezone, preferredTimeFormat = "24h") {
  const hour12 = preferredTimeFormat === "12h";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, weekday: "long", year: "numeric", month: "long", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12,
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return parts;
}

function localHour(now, timezone) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(now));
}

function minutesOf(value, fallback) {
  const match = String(value || "").match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return fallback;
  return Math.max(0, Math.min(1439, Number(match[1]) * 60 + Number(match[2] || 0)));
}

function isWithin(now, timezone, start, end) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((part) => [part.type, part.value]));
  const current = Number(p.hour) * 60 + Number(p.minute);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

function seasonFor(monthNumber) {
  if ([12, 1, 2].includes(monthNumber)) return "winter";
  if ([3, 4, 5].includes(monthNumber)) return "spring";
  if ([6, 7, 8].includes(monthNumber)) return "summer";
  return "autumn";
}

function cycleFor(hour) {
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 21) return "evening";
  if (hour >= 21 || hour < 1) return "night";
  return "lateNight";
}

function durationSince(value, now) {
  const then = value ? new Date(value) : null;
  if (!then || Number.isNaN(then.getTime())) return "unknown";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function createTemporalAwarenessService({ config = {}, logger = console } = {}) {
  function resolveTimezone() {
    const timezone = validTimezone(config.chat?.timezone || config.temporal?.timezone || process.env.CHAT_TIMEZONE || "UTC");
    logger?.info?.("[temporal:timezone-resolved]", { timezone });
    return timezone;
  }

  function buildContext({ now = new Date(), lastInteractionAt = null, upcomingScheduledActions = [], missedRituals = [] } = {}) {
    try {
      const timezone = resolveTimezone();
      const preset = getClockPreset(config.temporal?.clockPresetId);
      logger?.info?.("[temporal:clock-preset-loaded]", { id: preset.id, name: preset.name });
      const preferredTimeFormat = config.temporal?.preferredTimeFormat === "24h" ? "24h" : "12h";
      const parts = localParts(now, timezone, preferredTimeFormat);
      const hour = localHour(now, timezone);
      const cycleOfDay = config.temporal?.dayCycleAwarenessEnabled === false ? "disabled" : cycleFor(hour);
      const quietStart = minutesOf(config.temporal?.quietHoursStart ?? config.alive?.quietHoursStart ?? "23:00", 23 * 60);
      const quietEnd = minutesOf(config.temporal?.quietHoursEnd ?? config.alive?.quietHoursEnd ?? "07:00", 7 * 60);
      const isQuietHours = isWithin(now, timezone, quietStart, quietEnd);
      logger?.info?.("[temporal:quiet-hours]", { isQuietHours, timezone });
      const monthNumber = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "numeric" }).format(now)) || now.getUTCMonth() + 1;
      const season = config.temporal?.seasonalAwarenessEnabled === false ? "disabled" : seasonFor(monthNumber);
      const label = preset.dayCycleLabels?.[cycleOfDay] || cycleOfDay;
      const temporalMood = isQuietHours ? "quiet, intimate, low-energy" : `${cycleOfDay}, ${season}, ${label}`;
      const context = {
        timezone,
        currentDate: `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`,
        currentTime: preferredTimeFormat === "12h" ? `${parts.hour}:${parts.minute}${parts.dayPeriod ? ` ${parts.dayPeriod}` : ""}` : `${parts.hour}:${parts.minute}`,
        dayOfWeek: parts.weekday,
        month: parts.month,
        year: parts.year,
        season,
        cycleOfDay,
        cycleOfDayLabel: label,
        sunriseSunset: config.temporal?.sunriseSunset || null,
        isQuietHours,
        activeHours: { start: config.temporal?.activeHoursStart || "09:00", end: config.temporal?.activeHoursEnd || "22:00" },
        lastInteractionAt: lastInteractionAt || "",
        timeSinceLastInteraction: durationSince(lastInteractionAt, now),
        recurringRituals: config.temporal?.recurringRituals || [],
        upcomingScheduledActions,
        missedRituals,
        temporalMood,
        clockPreset: preset,
      };
      logger?.info?.("[temporal:context-built]", { timezone, cycleOfDay, preset: preset.id });
      return context;
    } catch (error) {
      logger?.warn?.("[temporal:error]", { error: error?.message });
      return { timezone: "UTC", currentDate: "", currentTime: "", dayOfWeek: "", month: "", year: "", season: "", cycleOfDay: "", isQuietHours: false, lastInteractionAt: "", timeSinceLastInteraction: "unknown", upcomingScheduledActions: [], missedRituals: [], temporalMood: "", clockPreset: getClockPreset() };
    }
  }

  logger?.info?.("[temporal:loaded]");
  return { resolveTimezone, buildContext };
}

function buildTemporalPromptSection(context) {
  if (!context) return null;
  return {
    label: "Temporal Awareness Context",
    content: [
      `Current local time for user: ${context.currentDate}, ${context.currentTime} ${context.timezone}.`,
      `Cycle of day: ${context.cycleOfDay} / ${context.cycleOfDayLabel || context.cycleOfDay}.`,
      `Quiet hours: ${context.isQuietHours ? "active" : "inactive"}.`,
      `Last interaction: ${context.timeSinceLastInteraction}.`,
      `Suggested tone: ${context.temporalMood}.`,
      `Clock preset: ${context.clockPreset?.name || "default"}. Use temporal awareness subtly; do not announce the exact time unless asked or genuinely useful.`,
    ].join("\n"),
  };
}

module.exports = { createTemporalAwarenessService, buildTemporalPromptSection };
