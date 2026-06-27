"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

// A ritual only forms after this many repeated occurrences
const RITUAL_FORMATION_THRESHOLD = 3;

// Ritual statuses
const RITUAL_STATUSES = Object.freeze(["forming", "active", "fading", "abandoned"]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_rituals (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    occurrence_count INT NOT NULL DEFAULT 1,
    strength NUMERIC(3,2) NOT NULL DEFAULT 0.10,
    status TEXT NOT NULL DEFAULT 'forming',
    last_observed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_observed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (companion_id, customer_id, name)
  );
  CREATE INDEX IF NOT EXISTS life_rituals_companion_status
    ON life_rituals (companion_id, customer_id, status, strength DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:              Number(row.id),
    companionId:     row.companion_id,
    customerId:      row.customer_id,
    name:            row.name,
    pattern:         row.pattern,
    description:     row.description,
    occurrenceCount: Number(row.occurrence_count),
    strength:        Number(row.strength),
    status:          row.status,
    lastObserved:    row.last_observed,
    firstObserved:   row.first_observed,
    tags:            row.tags ?? [],
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createRitualEngine({ config = {}, logger = null } = {}) {
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

  // Observe a potential ritual — increments occurrence counter, promotes to active after threshold
  async function observe({ companionId, customerId, name, pattern = "", description = "", tags = [] }) {
    if (!pool) {
      const rituals = _scope(companionId, customerId);
      let ritual = rituals.find(r => r.name === name);
      if (!ritual) {
        ritual = {
          id: _nextId++, companionId, customerId, name, pattern, description,
          occurrenceCount: 1, strength: 0.10, status: "forming",
          lastObserved: new Date().toISOString(), firstObserved: new Date().toISOString(),
          tags, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        rituals.push(ritual);
        return ritual;
      }
      ritual.occurrenceCount += 1;
      ritual.strength = clamp(ritual.strength + 0.10);
      ritual.lastObserved = new Date().toISOString();
      ritual.updatedAt = new Date().toISOString();
      if (ritual.occurrenceCount >= RITUAL_FORMATION_THRESHOLD && ritual.status === "forming") {
        ritual.status = "active";
      }
      return ritual;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_rituals
           (companion_id, customer_id, name, pattern, description, tags)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (companion_id, customer_id, name) DO UPDATE SET
           occurrence_count = life_rituals.occurrence_count + 1,
           strength = LEAST(1.0, life_rituals.strength + 0.10),
           last_observed = NOW(),
           updated_at = NOW(),
           status = CASE
             WHEN life_rituals.occurrence_count + 1 >= $7 AND life_rituals.status = 'forming'
             THEN 'active'
             ELSE life_rituals.status
           END
         RETURNING *`,
        [companionId, customerId, name, pattern, description, JSON.stringify(tags), RITUAL_FORMATION_THRESHOLD],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[ritual] observe failed", { error: err?.message });
      return null;
    }
  }

  async function getRituals({ companionId, customerId, status = null }) {
    if (!pool) {
      const rituals = _scope(companionId, customerId);
      if (status) return rituals.filter(r => r.status === status);
      return rituals.filter(r => r.status !== "abandoned");
    }
    try {
      const q = status
        ? `SELECT * FROM life_rituals WHERE companion_id=$1 AND customer_id=$2 AND status=$3 ORDER BY strength DESC`
        : `SELECT * FROM life_rituals WHERE companion_id=$1 AND customer_id=$2 AND status!='abandoned' ORDER BY strength DESC`;
      const params = status ? [companionId, customerId, status] : [companionId, customerId];
      const { rows } = await pool.query(q, params);
      return rows.map(mapRow);
    } catch { return []; }
  }

  // Natural decay — rituals not observed recently fade
  async function applyDecay({ companionId, customerId, decayRate = 0.02 }) {
    if (!pool) {
      const rituals = _scope(companionId, customerId);
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      let count = 0;
      for (const r of rituals) {
        if (r.status === "abandoned") continue;
        if (new Date(r.lastObserved).getTime() < cutoff) {
          r.strength = Math.max(0, r.strength - decayRate);
          r.updatedAt = new Date().toISOString();
          if (r.strength <= 0 && r.status === "active") { r.status = "fading"; }
          if (r.strength <= 0 && r.status === "fading") { r.status = "abandoned"; }
          count++;
        }
      }
      return count;
    }
    try {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `UPDATE life_rituals SET
           strength = GREATEST(0, strength - $3),
           status = CASE
             WHEN GREATEST(0, strength - $3) <= 0 AND status='active' THEN 'fading'
             WHEN GREATEST(0, strength - $3) <= 0 AND status='fading' THEN 'abandoned'
             ELSE status
           END,
           updated_at = NOW()
         WHERE companion_id=$1 AND customer_id=$2 AND status NOT IN ('abandoned')
           AND last_observed < $4`,
        [companionId, customerId, decayRate, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  async function count({ companionId, customerId }) {
    if (!pool) return _scope(companionId, customerId).filter(r => r.status === "active").length;
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM life_rituals WHERE companion_id=$1 AND customer_id=$2 AND status='active'`,
        [companionId, customerId],
      );
      return Number(rows[0]?.count ?? 0);
    } catch { return 0; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 180 }) {
    if (!pool) {
      const rituals = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = rituals.length - 1; i >= 0; i--) {
        if (rituals[i].status === "abandoned" && new Date(rituals[i].updatedAt).getTime() <= cutoff) {
          rituals.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_rituals
         WHERE companion_id=$1 AND customer_id=$2 AND status='abandoned' AND updated_at<=$3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, observe, getRituals, applyDecay, count, pruneOlderThan, RITUAL_FORMATION_THRESHOLD, RITUAL_STATUSES };
}

module.exports = { createRitualEngine, RITUAL_FORMATION_THRESHOLD, RITUAL_STATUSES };
