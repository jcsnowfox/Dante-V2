"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

// 9 weather dimensions — all float [0,1]
// trust, comfort, playfulness, repair, distance, curiosity, sharedMomentum, routine, adventure
const WEATHER_DIMENSIONS = Object.freeze([
  "trust", "comfort", "playfulness", "repair", "distance",
  "curiosity", "sharedMomentum", "routine", "adventure",
]);

const DEFAULTS = Object.freeze({
  trust: 0.6, comfort: 0.6, playfulness: 0.4, repair: 0.0,
  distance: 0.1, curiosity: 0.5, sharedMomentum: 0.4, routine: 0.3, adventure: 0.2,
});

// Max delta per tick — weather never jumps
const MAX_DELTA = 0.03;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_relationship_weather (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    trust NUMERIC(4,3) NOT NULL DEFAULT 0.600,
    comfort NUMERIC(4,3) NOT NULL DEFAULT 0.600,
    playfulness NUMERIC(4,3) NOT NULL DEFAULT 0.400,
    repair NUMERIC(4,3) NOT NULL DEFAULT 0.000,
    distance NUMERIC(4,3) NOT NULL DEFAULT 0.100,
    curiosity NUMERIC(4,3) NOT NULL DEFAULT 0.500,
    shared_momentum NUMERIC(4,3) NOT NULL DEFAULT 0.400,
    routine NUMERIC(4,3) NOT NULL DEFAULT 0.300,
    adventure NUMERIC(4,3) NOT NULL DEFAULT 0.200,
    weather_summary TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (companion_id, customer_id)
  );
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:             Number(row.id),
    companionId:    row.companion_id,
    customerId:     row.customer_id,
    trust:          Number(row.trust),
    comfort:        Number(row.comfort),
    playfulness:    Number(row.playfulness),
    repair:         Number(row.repair),
    distance:       Number(row.distance),
    curiosity:      Number(row.curiosity),
    sharedMomentum: Number(row.shared_momentum),
    routine:        Number(row.routine),
    adventure:      Number(row.adventure),
    weatherSummary: row.weather_summary,
    updatedAt:      row.updated_at,
    createdAt:      row.created_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function capDelta(delta) {
  return Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
}

function buildSummary(w) {
  if (w.repair > 0.3) return "in quiet repair";
  if (w.distance > 0.5) return "a little distant right now";
  if (w.trust > 0.8 && w.comfort > 0.7) return "settled and warm";
  if (w.sharedMomentum > 0.7) return "flowing well together";
  if (w.playfulness > 0.6) return "light and playful";
  if (w.adventure > 0.6) return "in an adventurous stretch";
  if (w.routine > 0.7) return "in a comfortable rhythm";
  return "steady";
}

function createRelationshipWeatherEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = {};

  function _scope(companionId, customerId) {
    const k = `${companionId}:${customerId}`;
    if (!_mem[k]) _mem[k] = { ...DEFAULTS, weatherSummary: buildSummary(DEFAULTS) };
    return _mem[k];
  }

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLE_SQL);
  }

  async function getWeather({ companionId, customerId }) {
    if (!pool) return _scope(companionId, customerId);
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_relationship_weather WHERE companion_id=$1 AND customer_id=$2`,
        [companionId, customerId],
      );
      if (rows[0]) return mapRow(rows[0]);
      return await _upsertDefaults({ companionId, customerId });
    } catch { return { ...DEFAULTS, companionId, customerId, weatherSummary: buildSummary(DEFAULTS) }; }
  }

  async function _upsertDefaults({ companionId, customerId }) {
    if (!pool) return _scope(companionId, customerId);
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_relationship_weather
           (companion_id, customer_id, trust, comfort, playfulness, repair, distance,
            curiosity, shared_momentum, routine, adventure, weather_summary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (companion_id, customer_id) DO NOTHING
         RETURNING *`,
        [companionId, customerId,
         DEFAULTS.trust, DEFAULTS.comfort, DEFAULTS.playfulness, DEFAULTS.repair, DEFAULTS.distance,
         DEFAULTS.curiosity, DEFAULTS.sharedMomentum, DEFAULTS.routine, DEFAULTS.adventure,
         buildSummary(DEFAULTS)],
      );
      if (rows[0]) return mapRow(rows[0]);
      const r2 = await pool.query(
        `SELECT * FROM life_relationship_weather WHERE companion_id=$1 AND customer_id=$2`,
        [companionId, customerId],
      );
      return mapRow(r2.rows[0]) ?? { ...DEFAULTS, companionId, customerId };
    } catch { return { ...DEFAULTS, companionId, customerId }; }
  }

  // Apply gradual deltas — each dimension capped at MAX_DELTA per call
  async function applyShift({ companionId, customerId, deltas = {} }) {
    const current = await getWeather({ companionId, customerId });
    const next = { ...current };

    for (const dim of WEATHER_DIMENSIONS) {
      const key = dim === "sharedMomentum" ? "sharedMomentum" : dim;
      const rawDelta = deltas[key] ?? 0;
      const safeKey = dim;
      next[safeKey] = clamp((current[safeKey] ?? DEFAULTS[safeKey]) + capDelta(rawDelta));
    }
    next.weatherSummary = buildSummary(next);

    if (!pool) {
      Object.assign(_scope(companionId, customerId), next);
      return _scope(companionId, customerId);
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_relationship_weather
           (companion_id, customer_id, trust, comfort, playfulness, repair, distance,
            curiosity, shared_momentum, routine, adventure, weather_summary, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (companion_id, customer_id) DO UPDATE SET
           trust=$3, comfort=$4, playfulness=$5, repair=$6, distance=$7,
           curiosity=$8, shared_momentum=$9, routine=$10, adventure=$11,
           weather_summary=$12, updated_at=NOW()
         RETURNING *`,
        [companionId, customerId,
         next.trust, next.comfort, next.playfulness, next.repair, next.distance,
         next.curiosity, next.sharedMomentum, next.routine, next.adventure,
         next.weatherSummary],
      );
      return mapRow(rows[0]) ?? next;
    } catch (err) {
      logger?.warn("[relationship-weather] applyShift failed", { error: err?.message });
      return next;
    }
  }

  // Passive tick — repair restores slowly, momentum decays gently without interaction
  async function tick({ companionId, customerId, hadInteraction = false }) {
    const deltas = {};
    if (hadInteraction) {
      // Interaction: slightly boost trust, comfort, sharedMomentum; reduce distance
      deltas.trust          =  0.01;
      deltas.comfort        =  0.01;
      deltas.sharedMomentum =  0.02;
      deltas.distance       = -0.01;
    } else {
      // No interaction: slow decay of shared momentum and routine reinforcement
      deltas.sharedMomentum = -0.01;
      deltas.routine        =  0.005;
    }
    // Repair always decays toward 0 (resolves over time)
    deltas.repair = -0.005;
    return applyShift({ companionId, customerId, deltas });
  }

  return { init, getWeather, applyShift, tick, WEATHER_DIMENSIONS, DEFAULTS, buildSummary };
}

module.exports = { createRelationshipWeatherEngine, WEATHER_DIMENSIONS, WEATHER_DEFAULTS: DEFAULTS };
