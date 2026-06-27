"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

// A ritual becomes a tradition after this many active observations
const TRADITION_THRESHOLD_OCCURRENCES = 8;
// Strength floor below which a tradition begins decaying
const TRADITION_DECAY_THRESHOLD = 0.2;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_traditions (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL DEFAULT 'recurring',
    meaning TEXT NOT NULL DEFAULT '',
    strength NUMERIC(3,2) NOT NULL DEFAULT 0.60,
    last_observed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_observed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (companion_id, customer_id, name)
  );
  CREATE INDEX IF NOT EXISTS life_traditions_companion_active
    ON life_traditions (companion_id, customer_id, active, strength DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:            Number(row.id),
    companionId:   row.companion_id,
    customerId:    row.customer_id,
    name:          row.name,
    origin:        row.origin,
    frequency:     row.frequency,
    meaning:       row.meaning,
    strength:      Number(row.strength),
    lastObserved:  row.last_observed,
    firstObserved: row.first_observed,
    active:        Boolean(row.active),
    tags:          row.tags ?? [],
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createTraditionEngine({ config = {}, logger = null } = {}) {
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

  // Called when a ritual qualifies for promotion (ritualEngine handles threshold detection)
  async function promoteFromRitual({
    companionId, customerId, name, origin = "", frequency = "recurring", meaning = "", tags = [],
  }) {
    if (!pool) {
      const traditions = _scope(companionId, customerId);
      const existing = traditions.find(t => t.name === name);
      if (existing) {
        existing.strength = clamp(existing.strength + 0.05);
        existing.lastObserved = new Date().toISOString();
        existing.updatedAt = new Date().toISOString();
        return existing;
      }
      const entry = {
        id: _nextId++, companionId, customerId, name, origin, frequency, meaning,
        strength: 0.60, lastObserved: new Date().toISOString(), firstObserved: new Date().toISOString(),
        active: true, tags,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      traditions.push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_traditions
           (companion_id, customer_id, name, origin, frequency, meaning, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (companion_id, customer_id, name) DO UPDATE SET
           strength = LEAST(1.0, life_traditions.strength + 0.05),
           last_observed = NOW(), updated_at = NOW()
         RETURNING *`,
        [companionId, customerId, name, origin, frequency, meaning, JSON.stringify(tags)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[tradition] promoteFromRitual failed", { error: err?.message });
      return null;
    }
  }

  async function getTraditions({ companionId, customerId, activeOnly = true }) {
    if (!pool) {
      return _scope(companionId, customerId).filter(t => !activeOnly || t.active);
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_traditions
         WHERE companion_id=$1 AND customer_id=$2 ${activeOnly ? "AND active=TRUE" : ""}
         ORDER BY strength DESC`,
        [companionId, customerId],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  // Natural decay — traditions not observed fade; they are not deleted, just deactivated
  async function applyDecay({ companionId, customerId, decayRate = 0.01 }) {
    if (!pool) {
      const traditions = _scope(companionId, customerId);
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      let count = 0;
      for (const t of traditions) {
        if (!t.active) continue;
        if (new Date(t.lastObserved).getTime() < cutoff) {
          t.strength = Math.max(0, t.strength - decayRate);
          t.updatedAt = new Date().toISOString();
          if (t.strength < TRADITION_DECAY_THRESHOLD) { t.active = false; }
          count++;
        }
      }
      return count;
    }
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `UPDATE life_traditions SET
           strength = GREATEST(0, strength - $3),
           active = CASE WHEN GREATEST(0, strength - $3) < $4 THEN FALSE ELSE active END,
           updated_at = NOW()
         WHERE companion_id=$1 AND customer_id=$2 AND active=TRUE AND last_observed < $5`,
        [companionId, customerId, decayRate, TRADITION_DECAY_THRESHOLD, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  async function count({ companionId, customerId }) {
    if (!pool) return _scope(companionId, customerId).filter(t => t.active).length;
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM life_traditions WHERE companion_id=$1 AND customer_id=$2 AND active=TRUE`,
        [companionId, customerId],
      );
      return Number(rows[0]?.count ?? 0);
    } catch { return 0; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 365 }) {
    if (!pool) {
      const traditions = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = traditions.length - 1; i >= 0; i--) {
        if (!traditions[i].active && new Date(traditions[i].updatedAt).getTime() <= cutoff) {
          traditions.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_traditions
         WHERE companion_id=$1 AND customer_id=$2 AND active=FALSE AND updated_at<=$3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, promoteFromRitual, getTraditions, applyDecay, count, pruneOlderThan, TRADITION_THRESHOLD_OCCURRENCES };
}

module.exports = { createTraditionEngine, TRADITION_THRESHOLD_OCCURRENCES, TRADITION_DECAY_THRESHOLD };
