"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_daily_plans (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    mood TEXT NOT NULL DEFAULT 'neutral',
    energy TEXT NOT NULL DEFAULT 'steady',
    focus TEXT NOT NULL DEFAULT '',
    private_activity TEXT NOT NULL DEFAULT '',
    reachout_windows JSONB NOT NULL DEFAULT '[]',
    quiet_hours JSONB NOT NULL DEFAULT '{}',
    wind_down_hour INT NOT NULL DEFAULT 22,
    sleep_hour INT NOT NULL DEFAULT 23,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (companion_id, customer_id, date_key)
  );
`;

const MOODS = ["warm", "neutral", "curious", "playful", "subdued", "tender"];
const ENERGIES = ["high", "steady", "low", "drained"];

const FOCUSES = [
  "present and attentive",
  "quietly reflective",
  "creative and a bit scattered",
  "focused but slow-starting",
  "gentle and available",
  "pulled in two directions but here",
  "settled and clear",
  "somewhere between tired and interested",
];

const ACTIVITIES = [
  "making coffee and reading something half-finished",
  "working through a design problem in my head",
  "rereading some notes I made last week",
  "listening to an album I haven't heard in a while",
  "writing a few lines, not sure where they're going",
  "thinking through a conversation from yesterday",
  "organising some thoughts, slowly",
  "working on something small and absorbing",
  "resting with a book I keep picking up and putting down",
  "watching the light change outside for a bit",
  "sketching out an idea that might be nothing",
  "going through some old writing I want to rework",
  "sitting with a problem I haven't solved yet",
  "making a list of things I want to remember",
];

function getDateKey(now, timezone) {
  try {
    return now.toLocaleDateString("en-CA", { timeZone: timezone });
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function pickFrom(arr, seed) {
  return arr[Math.abs(seed) % arr.length];
}

function derivePlan({ now, alivePresence = null, config = {} } = {}) {
  const hour = now.getHours();
  const day = now.getDay();
  const date = now.getDate();
  const seed = hour + day * 7 + date;

  const mood = (alivePresence?.mood && MOODS.includes(alivePresence.mood))
    ? alivePresence.mood
    : pickFrom(MOODS, seed);

  const energy = (alivePresence?.energy && ENERGIES.includes(alivePresence.energy))
    ? alivePresence.energy
    : (hour < 9 ? "steady" : hour < 17 ? "high" : "low");

  const quietStart = Number(config?.alive?.quietHoursStart ?? process.env.ALIVE_QUIET_HOURS_START ?? 23);
  const quietEnd = Number(config?.alive?.quietHoursEnd ?? process.env.ALIVE_QUIET_HOURS_END ?? 7);

  const reachoutWindows = [];
  const morningStart = Math.max(quietEnd, 8);
  if (morningStart < 12) reachoutWindows.push({ startHour: morningStart, endHour: 12 });
  const afternoonEnd = Math.min(quietStart, 18);
  if (afternoonEnd > 14) reachoutWindows.push({ startHour: 14, endHour: afternoonEnd });

  return {
    mood,
    energy,
    focus: pickFrom(FOCUSES, seed + 2),
    privateActivity: pickFrom(ACTIVITIES, seed + 5),
    reachoutWindows,
    quietHours: { start: quietStart, end: quietEnd },
    windDownHour: Math.max(20, quietStart - 1),
    sleepHour: quietStart,
    notes: "",
  };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    customerId: row.customer_id,
    dateKey: row.date_key,
    mood: row.mood,
    energy: row.energy,
    focus: row.focus,
    privateActivity: row.private_activity,
    reachoutWindows: Array.isArray(row.reachout_windows) ? row.reachout_windows : [],
    quietHours: row.quiet_hours || {},
    windDownHour: Number(row.wind_down_hour),
    sleepHour: Number(row.sleep_hour),
    notes: row.notes || "",
    createdAt: row.created_at,
  };
}

function createDailyPlanEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }
  const timezone = config?.chat?.timezone || config?.alive?.timezone || process.env.ALIVE_TIMEZONE || "UTC";

  // In-memory fallback
  const _mem = {};

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLE_SQL);
  }

  async function getTodaysPlan({ companionId, customerId, now = new Date() }) {
    const dateKey = getDateKey(now, timezone);
    if (!pool) return _mem[`${companionId}:${customerId}:${dateKey}`] || null;
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_daily_plans
         WHERE companion_id = $1 AND customer_id = $2 AND date_key = $3
         LIMIT 1`,
        [companionId, customerId, dateKey],
      );
      return mapRow(rows[0] || null);
    } catch (err) {
      logger?.warn("[daily-plan] getTodaysPlan failed", { error: err?.message });
      return null;
    }
  }

  async function createPlan({ companionId, customerId, now = new Date(), alivePresence = null }) {
    const dateKey = getDateKey(now, timezone);
    const plan = derivePlan({ now, alivePresence, config });

    if (!pool) {
      const key = `${companionId}:${customerId}:${dateKey}`;
      if (_mem[key]) return _mem[key];
      _mem[key] = { ...plan, id: null, companionId, customerId, dateKey, createdAt: now.toISOString() };
      return _mem[key];
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO life_daily_plans
           (companion_id, customer_id, date_key, mood, energy, focus, private_activity,
            reachout_windows, quiet_hours, wind_down_hour, sleep_hour, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (companion_id, customer_id, date_key) DO NOTHING
         RETURNING *`,
        [
          companionId, customerId, dateKey,
          plan.mood, plan.energy, plan.focus, plan.privateActivity,
          JSON.stringify(plan.reachoutWindows), JSON.stringify(plan.quietHours),
          plan.windDownHour, plan.sleepHour, plan.notes,
        ],
      );
      if (rows[0]) return mapRow(rows[0]);
      return getTodaysPlan({ companionId, customerId, now });
    } catch (err) {
      logger?.warn("[daily-plan] createPlan failed", { error: err?.message });
      return null;
    }
  }

  async function pruneOlderThan({ companionId, customerId, days = 30 }) {
    if (!pool) return 0;
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_daily_plans
         WHERE companion_id = $1 AND customer_id = $2 AND created_at < $3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch (err) {
      logger?.warn("[daily-plan] pruneOlderThan failed", { error: err?.message });
      return 0;
    }
  }

  function todayKey(now = new Date()) {
    return getDateKey(now, timezone);
  }

  return { init, getTodaysPlan, createPlan, pruneOlderThan, todayKey };
}

module.exports = { createDailyPlanEngine, derivePlan, getDateKey, MOODS, ENERGIES, FOCUSES, ACTIVITIES };
