"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_interests (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    strength NUMERIC(4,3) NOT NULL DEFAULT 0.500,
    last_reinforced TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    influence_sources JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (companion_id, customer_id, topic)
  );
  CREATE INDEX IF NOT EXISTS life_interests_companion_strength
    ON life_interests (companion_id, customer_id, strength DESC);
`;

// Interests that are seeded by default — Dante's known curiosities
const DEFAULT_INTERESTS = [
  { topic: "Nordic literature",           category: "books",     strength: 0.82 },
  { topic: "minimalist composition",      category: "music",     strength: 0.78 },
  { topic: "brutalist architecture",      category: "design",    strength: 0.70 },
  { topic: "phenomenology",              category: "philosophy", strength: 0.68 },
  { topic: "film photography",           category: "visual",    strength: 0.65 },
  { topic: "Japanese cuisine",           category: "food",      strength: 0.60 },
  { topic: "language and etymology",     category: "language",  strength: 0.72 },
  { topic: "quiet spaces",              category: "mood",      strength: 0.75 },
  { topic: "long-form essays",          category: "books",     strength: 0.68 },
  { topic: "ambient electronic music",  category: "music",     strength: 0.74 },
];

// Season → categories that naturally get reinforced
const SEASONAL_AFFINITIES = {
  winter: ["books", "music", "philosophy", "mood"],
  spring: ["visual", "food", "language", "movement"],
  summer: ["visual", "food", "movement", "design"],
  autumn: ["books", "philosophy", "music", "mood"],
};

function getSeason(date = new Date()) {
  const m = date.getMonth(); // 0-based
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}

function mapRow(row) {
  if (!row) return null;
  return {
    id:               Number(row.id),
    companionId:      row.companion_id,
    customerId:       row.customer_id,
    topic:            row.topic,
    category:         row.category,
    strength:         Number(row.strength),
    lastReinforced:   row.last_reinforced,
    influenceSources: Array.isArray(row.influence_sources) ? row.influence_sources : [],
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createInterestDriftEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = {};
  let _nextId = 1;

  function _scope(companionId, customerId) {
    const k = `${companionId}:${customerId}`;
    if (!_mem[k]) _mem[k] = [];
    return _mem[k];
  }

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLE_SQL);
  }

  async function seedDefaults({ companionId, customerId }) {
    const existing = await getInterests({ companionId, customerId });
    if (existing.length > 0) return existing;
    const seeded = [];
    for (const i of DEFAULT_INTERESTS) {
      const r = await addInterest({ companionId, customerId, ...i });
      if (r) seeded.push(r);
    }
    return seeded;
  }

  async function addInterest({
    companionId, customerId, topic,
    category = "general", strength = 0.5, influenceSources = [],
  }) {
    if (!pool) {
      const interests = _scope(companionId, customerId);
      const existing = interests.find(i => i.topic === topic);
      if (existing) return existing;
      const entry = {
        id: _nextId++, companionId, customerId, topic, category,
        strength: clamp(strength), lastReinforced: new Date().toISOString(),
        influenceSources, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      interests.push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_interests (companion_id, customer_id, topic, category, strength, influence_sources)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (companion_id, customer_id, topic) DO NOTHING
         RETURNING *`,
        [companionId, customerId, topic, category, clamp(strength), JSON.stringify(influenceSources)],
      );
      if (rows[0]) return mapRow(rows[0]);
      const ex = await pool.query(
        `SELECT * FROM life_interests WHERE companion_id=$1 AND customer_id=$2 AND topic=$3`,
        [companionId, customerId, topic],
      );
      return mapRow(ex.rows[0]);
    } catch (err) {
      logger?.warn("[interest] addInterest failed", { error: err?.message });
      return null;
    }
  }

  async function getInterests({ companionId, customerId, minStrength = 0 }) {
    if (!pool) {
      return _scope(companionId, customerId)
        .filter(i => i.strength >= minStrength)
        .sort((a, b) => b.strength - a.strength);
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_interests
         WHERE companion_id=$1 AND customer_id=$2 AND strength >= $3
         ORDER BY strength DESC`,
        [companionId, customerId, minStrength],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function reinforce({ companionId, customerId, topic, delta = 0.02, source = "general" }) {
    delta = Math.min(0.15, Math.max(-0.1, Number(delta) || 0.02));
    if (!pool) {
      const interests = _scope(companionId, customerId);
      const interest = interests.find(i => i.topic === topic);
      if (!interest) return null;
      interest.strength = clamp(interest.strength + delta);
      interest.lastReinforced = new Date().toISOString();
      interest.updatedAt = new Date().toISOString();
      if (source && !interest.influenceSources.includes(source)) {
        interest.influenceSources = [...interest.influenceSources.slice(-4), source];
      }
      return interest;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE life_interests SET
           strength = LEAST(1.0, GREATEST(0.0, strength + $3)),
           last_reinforced = NOW(),
           updated_at = NOW()
         WHERE companion_id=$1 AND customer_id=$2 AND topic=$4
         RETURNING *`,
        [companionId, customerId, delta, topic],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[interest] reinforce failed", { error: err?.message });
      return null;
    }
  }

  // Gradual drift: time decay + season/mood reinforcement
  async function tick({ companionId, customerId, mood = null, now = new Date() }) {
    const season = getSeason(now);
    const seasonalCategories = SEASONAL_AFFINITIES[season] || [];

    if (!pool) {
      const interests = _scope(companionId, customerId);
      const dayMs = 24 * 60 * 60 * 1000;
      for (const interest of interests) {
        const daysSinceReinforced = (now.getTime() - new Date(interest.lastReinforced).getTime()) / dayMs;
        // Gentle decay proportional to time without reinforcement
        const decay = Math.min(0.005, 0.001 * daysSinceReinforced);
        interest.strength = clamp(interest.strength - decay);
        // Seasonal affinity: slow boost if this category is in season
        if (seasonalCategories.includes(interest.category)) {
          interest.strength = clamp(interest.strength + 0.002);
        }
        interest.updatedAt = new Date().toISOString();
      }
      return interests.length;
    }
    try {
      const { rowCount } = await pool.query(
        `UPDATE life_interests SET
           strength = GREATEST(0.0, LEAST(1.0,
             strength
             - LEAST(0.005, 0.001 * EXTRACT(EPOCH FROM (NOW() - last_reinforced)) / 86400)
             + CASE WHEN category = ANY($3) THEN 0.002 ELSE 0 END
           )),
           updated_at = NOW()
         WHERE companion_id=$1 AND customer_id=$2`,
        [companionId, customerId, seasonalCategories],
      );
      return rowCount || 0;
    } catch (err) {
      logger?.warn("[interest] tick failed", { error: err?.message });
      return 0;
    }
  }

  async function pruneOlderThan({ companionId, customerId, days = 30, minStrength = 0.05 }) {
    if (!pool) {
      const interests = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = interests.length - 1; i >= 0; i--) {
        const int = interests[i];
        if (int.strength <= minStrength && new Date(int.updatedAt).getTime() <= cutoff) {
          interests.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_interests
         WHERE companion_id=$1 AND customer_id=$2 AND strength<=$3 AND updated_at<=$4`,
        [companionId, customerId, minStrength, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, seedDefaults, addInterest, getInterests, reinforce, tick, pruneOlderThan };
}

module.exports = { createInterestDriftEngine, DEFAULT_INTERESTS, getSeason };
