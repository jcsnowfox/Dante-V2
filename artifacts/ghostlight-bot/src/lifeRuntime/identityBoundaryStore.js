"use strict";

/**
 * identityBoundaryStore
 *
 * Boundaries Dante has set for himself. Always explainable.
 * Never "just no" — always "I won't X because Y."
 *
 * Category: "consent" | "values" | "repair" | "integrity" | "autonomy"
 *
 * Storage: dante_identity_boundaries
 * In-memory fallback: _memStore Map
 */

function createIdentityBoundaryStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    const { createPostgresPool } = require("../storage/postgres/createPostgresPool");
    pool = createPostgresPool({ config });
  } catch { pool = null; }

  const _memStore = new Map();

  function _key(companionId, customerId, boundaryKey) {
    return `${companionId}:${customerId}:${boundaryKey}`;
  }

  function _mapRow(row) {
    return {
      boundaryKey:  row.boundary_key,
      statement:    row.statement,
      explanation:  row.explanation,
      category:     row.category || "values",
      activeFrom:   row.active_from ? new Date(row.active_from).toISOString() : null,
      updatedAt:    row.updated_at  ? new Date(row.updated_at).toISOString()  : null,
    };
  }

  async function init() {
    if (!pool) return;
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS dante_identity_boundaries (
  id BIGSERIAL PRIMARY KEY,
  companion_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  boundary_key TEXT NOT NULL,
  statement TEXT NOT NULL,
  explanation TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'values',
  active_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (companion_id, customer_id, boundary_key)
)`);
    } catch (err) {
      logger?.warn("[identityBoundaries] init error", { error: err?.message });
    }
  }

  async function getBoundary({ companionId, customerId, boundaryKey }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_boundaries WHERE companion_id=$1 AND customer_id=$2 AND boundary_key=$3 LIMIT 1`,
          [companionId, customerId, boundaryKey],
        );
        if (rows[0]) return _mapRow(rows[0]);
      } catch { /* fall through */ }
    }
    return _memStore.get(_key(companionId, customerId, boundaryKey)) ?? null;
  }

  async function getBoundaries({ companionId, customerId }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_boundaries WHERE companion_id=$1 AND customer_id=$2 ORDER BY active_from ASC`,
          [companionId, customerId],
        );
        return rows.map(_mapRow);
      } catch { /* fall through */ }
    }
    const prefix = `${companionId}:${customerId}:`;
    const results = [];
    for (const [k, v] of _memStore) {
      if (k.startsWith(prefix)) results.push(v);
    }
    return results;
  }

  async function setBoundary({ companionId, customerId, boundaryKey, statement, explanation, category = "values", at = new Date() }) {
    const atStr = at instanceof Date ? at.toISOString() : at;
    const data  = { boundaryKey, statement, explanation, category, activeFrom: atStr, updatedAt: atStr };
    await _persist({ companionId, customerId, data });
    return data;
  }

  async function _persist({ companionId, customerId, data }) {
    _memStore.set(_key(companionId, customerId, data.boundaryKey), data);
    if (!pool) return;
    try {
      await pool.query(`
INSERT INTO dante_identity_boundaries
  (companion_id, customer_id, boundary_key, statement, explanation, category, active_from, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
ON CONFLICT (companion_id, customer_id, boundary_key) DO UPDATE SET
  statement   = EXCLUDED.statement,
  explanation = EXCLUDED.explanation,
  category    = EXCLUDED.category,
  updated_at  = NOW()
      `, [
        companionId, customerId, data.boundaryKey, data.statement,
        data.explanation, data.category, data.activeFrom ?? new Date().toISOString(),
      ]);
    } catch (err) {
      logger?.warn("[identityBoundaries] persist error", { error: err?.message });
    }
  }

  return { init, getBoundary, getBoundaries, setBoundary };
}

module.exports = { createIdentityBoundaryStore };
