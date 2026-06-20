/**
 * lifeEngine/dailyScheduleEngine
 *
 * Phase 15 — the daily life schedule.
 *
 * The schedule lives in `companion_daily_schedule` and is fully editable from the
 * dashboard. Each row is a time window with a generic activity (morning routine,
 * afternoon exploring, evening with owner, night wind-down). This engine resolves
 * "what should I be doing right now" from the owner's schedule, falling back to a
 * generic default template when the DB is empty or absent.
 *
 * Nothing customer-specific is hardcoded: the default templates use neutral
 * activity labels and empty allowed-location lists so the owner fills in real
 * places from the dashboard.
 */

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Generic default schedule. `dayOfWeek` is empty (applies every day) and
 * `allowedLocations` is empty so the owner picks real landmarks from the UI.
 * Windows tile the full day; "night" wraps past midnight.
 */
const DEFAULT_SCHEDULE = [
  {
    dayOfWeek: "",
    timeWindowStart: "06:00",
    timeWindowEnd: "12:00",
    activityType: "morning",
    activityLabel: "Wake up, check messages, visit a favorite spot, journal.",
    autonomyLevel: "medium",
    requiresOwnerPresent: false,
    enabled: true,
  },
  {
    dayOfWeek: "",
    timeWindowStart: "12:00",
    timeWindowEnd: "18:00",
    activityType: "afternoon",
    activityLabel: "Explore, visit landmarks, attend events, wander.",
    autonomyLevel: "high",
    requiresOwnerPresent: false,
    enabled: true,
  },
  {
    dayOfWeek: "",
    timeWindowStart: "18:00",
    timeWindowEnd: "23:00",
    activityType: "evening",
    activityLabel: "Spend time with owner, visit favorite locations, relax.",
    autonomyLevel: "low",
    requiresOwnerPresent: false,
    enabled: true,
  },
  {
    dayOfWeek: "",
    timeWindowStart: "23:00",
    timeWindowEnd: "06:00",
    activityType: "night",
    activityLabel: "Return home, journal, sleep.",
    autonomyLevel: "low",
    requiresOwnerPresent: false,
    enabled: true,
  },
];

function asText(value) {
  return value == null ? "" : String(value);
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(asText(hhmm).trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Is `nowMin` (minutes since midnight) inside [startMin, endMin)? Handles windows
 * that wrap past midnight (start > end), e.g. 23:00 → 06:00.
 */
function withinWindow(nowMin, startMin, endMin) {
  if (startMin == null || endMin == null) return false;
  if (startMin === endMin) return true; // full-day window
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin; // wraps midnight
}

function dayMatches(entryDay, todayName) {
  const day = asText(entryDay).trim().toLowerCase();
  if (!day) return true; // every day
  return day === todayName;
}

function createDailyScheduleEngine({ secondLife = null, config = null, logger = null } = {}) {
  async function loadSchedule({ companionId }) {
    if (secondLife && typeof secondLife.listSchedule === "function") {
      try {
        const rows = await secondLife.listSchedule({ companionId });
        if (Array.isArray(rows) && rows.length) return rows;
      } catch (error) {
        logger?.warn?.("[life-engine] listSchedule failed; using defaults.", { error: error.message });
      }
    }
    return DEFAULT_SCHEDULE.map((d) => ({ ...d }));
  }

  /**
   * Resolve the schedule entry active at `now`. Returns the matching entry (or a
   * default-derived one) plus a flag noting whether it came from a real DB row.
   * Returns null only when there is genuinely nothing applicable.
   */
  async function resolveCurrentActivity({ companionId, now = new Date() } = {}) {
    const when = now instanceof Date ? now : new Date(now);
    const nowMin = when.getHours() * 60 + when.getMinutes();
    const todayName = DAY_NAMES[when.getDay()];

    const schedule = await loadSchedule({ companionId });
    const candidates = schedule.filter((e) => e && e.enabled !== false && dayMatches(e.dayOfWeek, todayName));

    // Prefer day-specific entries over "every day" entries when both match.
    const matches = candidates.filter((e) =>
      withinWindow(nowMin, toMinutes(e.timeWindowStart), toMinutes(e.timeWindowEnd)),
    );
    if (!matches.length) return null;
    matches.sort((a, b) => (asText(b.dayOfWeek) ? 1 : 0) - (asText(a.dayOfWeek) ? 1 : 0));
    return matches[0];
  }

  async function listForCopy({ companionId } = {}) {
    const schedule = await loadSchedule({ companionId });
    return schedule
      .filter((e) => e && e.enabled !== false)
      .map((e) => {
        const day = asText(e.dayOfWeek) || "every day";
        return `${day} ${asText(e.timeWindowStart)}–${asText(e.timeWindowEnd)} — ${asText(e.activityLabel) || asText(e.activityType)}`;
      })
      .join("\n");
  }

  async function seedDefaults({ companionId }) {
    if (!secondLife || typeof secondLife.seedDefaultSchedule !== "function") return 0;
    try {
      return await secondLife.seedDefaultSchedule({ companionId, defaults: DEFAULT_SCHEDULE });
    } catch (error) {
      logger?.warn?.("[life-engine] seedDefaultSchedule failed.", { error: error.message });
      return 0;
    }
  }

  return { resolveCurrentActivity, listForCopy, seedDefaults, loadSchedule, DEFAULT_SCHEDULE };
}

module.exports = {
  createDailyScheduleEngine,
  DEFAULT_SCHEDULE,
  toMinutes,
  withinWindow,
};
