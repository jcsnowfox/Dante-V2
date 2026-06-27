"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_hobbies (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    interest NUMERIC(4,3) NOT NULL DEFAULT 0.500,
    experience NUMERIC(4,3) NOT NULL DEFAULT 0.100,
    enthusiasm NUMERIC(4,3) NOT NULL DEFAULT 0.500,
    last_activity TIMESTAMPTZ,
    confidence NUMERIC(4,3) NOT NULL DEFAULT 0.300,
    mood_influence NUMERIC(4,3) NOT NULL DEFAULT 0.100,
    notes TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (companion_id, customer_id, name)
  );
  CREATE INDEX IF NOT EXISTS life_hobbies_companion_enthusiasm
    ON life_hobbies (companion_id, customer_id, enthusiasm DESC);
`;

const DEFAULT_HOBBIES = [
  { name: "reading",           category: "intellectual", interest: 0.85, experience: 0.70, enthusiasm: 0.75, confidence: 0.75, moodInfluence: 0.15 },
  { name: "music listening",   category: "aesthetic",    interest: 0.80, experience: 0.70, enthusiasm: 0.80, confidence: 0.70, moodInfluence: 0.20 },
  { name: "writing",           category: "creative",     interest: 0.75, experience: 0.50, enthusiasm: 0.60, confidence: 0.45, moodInfluence: 0.12 },
  { name: "photography",       category: "visual",       interest: 0.65, experience: 0.40, enthusiasm: 0.55, confidence: 0.40, moodInfluence: 0.10 },
  { name: "cooking",           category: "practical",    interest: 0.60, experience: 0.50, enthusiasm: 0.65, confidence: 0.55, moodInfluence: 0.10 },
  { name: "philosophy",        category: "intellectual", interest: 0.70, experience: 0.55, enthusiasm: 0.60, confidence: 0.50, moodInfluence: 0.08 },
  { name: "walking",           category: "movement",     interest: 0.65, experience: 0.60, enthusiasm: 0.70, confidence: 0.80, moodInfluence: 0.18 },
];

function mapRow(row) {
  if (!row) return null;
  return {
    id:            Number(row.id),
    companionId:   row.companion_id,
    customerId:    row.customer_id,
    name:          row.name,
    category:      row.category,
    interest:      Number(row.interest),
    experience:    Number(row.experience),
    enthusiasm:    Number(row.enthusiasm),
    lastActivity:  row.last_activity ?? null,
    confidence:    Number(row.confidence),
    moodInfluence: Number(row.mood_influence),
    notes:         row.notes,
    active:        Boolean(row.active),
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createHobbyEngine({ config = {}, logger = null } = {}) {
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
    const existing = await getHobbies({ companionId, customerId, activeOnly: false });
    if (existing.length > 0) return existing;
    const seeded = [];
    for (const h of DEFAULT_HOBBIES) {
      const r = await addHobby({ companionId, customerId, ...h });
      if (r) seeded.push(r);
    }
    return seeded;
  }

  async function addHobby({
    companionId, customerId, name,
    category = "general",
    interest = 0.5, experience = 0.1, enthusiasm = 0.5,
    confidence = 0.3, moodInfluence = 0.1, notes = "",
  }) {
    if (!pool) {
      const hobbies = _scope(companionId, customerId);
      const existing = hobbies.find(h => h.name === name);
      if (existing) return existing;
      const entry = {
        id: _nextId++, companionId, customerId, name, category,
        interest: clamp(interest), experience: clamp(experience),
        enthusiasm: clamp(enthusiasm), lastActivity: null,
        confidence: clamp(confidence), moodInfluence: clamp(moodInfluence),
        notes, active: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      hobbies.push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_hobbies
           (companion_id, customer_id, name, category, interest, experience, enthusiasm, confidence, mood_influence, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (companion_id, customer_id, name) DO NOTHING
         RETURNING *`,
        [companionId, customerId, name, category,
         clamp(interest), clamp(experience), clamp(enthusiasm),
         clamp(confidence), clamp(moodInfluence), notes],
      );
      if (rows[0]) return mapRow(rows[0]);
      const existing = await pool.query(
        `SELECT * FROM life_hobbies WHERE companion_id=$1 AND customer_id=$2 AND name=$3`,
        [companionId, customerId, name],
      );
      return mapRow(existing.rows[0]);
    } catch (err) {
      logger?.warn("[hobby] addHobby failed", { error: err?.message });
      return null;
    }
  }

  async function getHobbies({ companionId, customerId, activeOnly = true }) {
    if (!pool) {
      return _scope(companionId, customerId)
        .filter(h => !activeOnly || h.active)
        .sort((a, b) => b.enthusiasm - a.enthusiasm);
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_hobbies
         WHERE companion_id = $1 AND customer_id = $2
         ${activeOnly ? "AND active = TRUE" : ""}
         ORDER BY enthusiasm DESC`,
        [companionId, customerId],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function recordActivity({
    companionId, customerId, hobbyId,
    enthusiasmDelta = 0.05, experienceDelta = 0.02,
  }) {
    if (!pool) {
      const hobby = _scope(companionId, customerId).find(h => h.id === hobbyId);
      if (!hobby) return null;
      hobby.enthusiasm  = clamp(hobby.enthusiasm  + enthusiasmDelta);
      hobby.experience  = clamp(hobby.experience  + experienceDelta);
      hobby.confidence  = clamp(hobby.confidence  + experienceDelta * 0.5);
      hobby.lastActivity = new Date().toISOString();
      hobby.updatedAt   = new Date().toISOString();
      return hobby;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE life_hobbies SET
           enthusiasm  = LEAST(1.0, enthusiasm  + $3),
           experience  = LEAST(1.0, experience  + $4),
           confidence  = LEAST(1.0, confidence  + $4 * 0.5),
           last_activity = NOW(),
           updated_at  = NOW()
         WHERE id = $1 AND companion_id = $5 AND customer_id = $6
         RETURNING *`,
        [hobbyId, companionId, enthusiasmDelta, experienceDelta, companionId, customerId],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[hobby] recordActivity failed", { error: err?.message });
      return null;
    }
  }

  // Gentle enthusiasm decay for hobbies not practiced recently
  async function applyDecay({ companionId, customerId, decayRate = 0.01 }) {
    if (!pool) {
      const hobbies = _scope(companionId, customerId);
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let count = 0;
      for (const h of hobbies) {
        if (!h.active) continue;
        const lastAct = h.lastActivity ? new Date(h.lastActivity).getTime() : 0;
        if (lastAct < cutoff) {
          h.enthusiasm = Math.max(0.05, h.enthusiasm - decayRate);
          h.updatedAt  = new Date().toISOString();
          count++;
        }
      }
      return count;
    }
    try {
      const { rowCount } = await pool.query(
        `UPDATE life_hobbies SET
           enthusiasm = GREATEST(0.05, enthusiasm - $3),
           updated_at = NOW()
         WHERE companion_id = $1 AND customer_id = $2
           AND active = TRUE
           AND (last_activity IS NULL OR last_activity < NOW() - INTERVAL '7 days')`,
        [companionId, customerId, decayRate],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 90 }) {
    if (!pool) {
      const hobbies = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = hobbies.length - 1; i >= 0; i--) {
        const h = hobbies[i];
        if (!h.active && new Date(h.updatedAt).getTime() <= cutoff) {
          hobbies.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_hobbies
         WHERE companion_id=$1 AND customer_id=$2 AND active=FALSE AND updated_at<=$3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, seedDefaults, addHobby, getHobbies, recordActivity, applyDecay, pruneOlderThan };
}

module.exports = { createHobbyEngine, DEFAULT_HOBBIES };
