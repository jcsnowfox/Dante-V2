"use strict";

/**
 * identityPreferenceStore
 *
 * Preferences (things Dante likes) and dislikes emerge from repeated exposure.
 * Same table, different valence column: "preference" | "dislike".
 *
 * A preference starts weak and strengthens with each exposure.
 * Dislikes can surprise even Dante — they emerge naturally from lived experience.
 *
 * Categories: books, music, rain, silence, food, environments, patterns, activities, etc.
 *
 * Storage: dante_identity_preferences
 * In-memory fallback: _memStore Map
 */

function createIdentityPreferenceStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    const { createPostgresPool } = require("../storage/postgres/createPostgresPool");
    pool = createPostgresPool({ config });
  } catch { pool = null; }

  const _memStore = new Map();

  function _key(companionId, customerId, category, item) {
    return `${companionId}:${customerId}:${category}:${item}`;
  }

  function _mapRow(row) {
    return {
      category:      row.category,
      item:          row.item,
      valence:       row.valence,
      strength:      parseFloat(row.strength) || 0.30,
      exposureCount: parseInt(row.exposure_count, 10) || 1,
      lastExposedAt: row.last_exposed_at ? new Date(row.last_exposed_at).toISOString() : null,
      discoveredAt:  row.discovered_at   ? new Date(row.discovered_at).toISOString()   : null,
      source:        row.source || "observation",
    };
  }

  async function init() {
    if (!pool) return;
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS dante_identity_preferences (
  id BIGSERIAL PRIMARY KEY,
  companion_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  category TEXT NOT NULL,
  item TEXT NOT NULL,
  valence TEXT NOT NULL DEFAULT 'preference',
  strength NUMERIC(4,3) NOT NULL DEFAULT 0.300,
  exposure_count INT NOT NULL DEFAULT 1,
  last_exposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'observation',
  UNIQUE (companion_id, customer_id, category, item)
)`);
    } catch (err) {
      logger?.warn("[identityPreferences] init error", { error: err?.message });
    }
  }

  async function getPreference({ companionId, customerId, category, item }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_preferences WHERE companion_id=$1 AND customer_id=$2 AND category=$3 AND item=$4 LIMIT 1`,
          [companionId, customerId, category, item],
        );
        if (rows[0]) return _mapRow(rows[0]);
      } catch { /* fall through */ }
    }
    return _memStore.get(_key(companionId, customerId, category, item)) ?? null;
  }

  async function getPreferences({ companionId, customerId, valence = null }) {
    if (pool) {
      try {
        const params = [companionId, customerId];
        const clause = valence ? " AND valence=$3" : "";
        if (valence) params.push(valence);
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_preferences WHERE companion_id=$1 AND customer_id=$2${clause} ORDER BY strength DESC`,
          params,
        );
        return rows.map(_mapRow);
      } catch { /* fall through */ }
    }
    const prefix = `${companionId}:${customerId}:`;
    const results = [];
    for (const [k, v] of _memStore) {
      if (k.startsWith(prefix) && (!valence || v.valence === valence)) results.push(v);
    }
    return results.sort((a, b) => b.strength - a.strength);
  }

  async function record({ companionId, customerId, category, item, valence = "preference", source = "observation", delta = 0.05, at = new Date() }) {
    const atStr    = at instanceof Date ? at.toISOString() : at;
    const existing = await getPreference({ companionId, customerId, category, item });

    if (existing) {
      const updated = {
        ...existing,
        strength:      Math.min(0.95, existing.strength + delta),
        exposureCount: existing.exposureCount + 1,
        lastExposedAt: atStr,
      };
      await _persist({ companionId, customerId, data: updated });
      return updated;
    }

    const data = {
      category,
      item,
      valence,
      strength:      Math.min(0.95, Math.max(0.05, 0.30 + delta)),
      exposureCount: 1,
      lastExposedAt: atStr,
      discoveredAt:  atStr,
      source,
    };
    await _persist({ companionId, customerId, data });
    return data;
  }

  async function _persist({ companionId, customerId, data }) {
    _memStore.set(_key(companionId, customerId, data.category, data.item), data);
    if (!pool) return;
    try {
      await pool.query(`
INSERT INTO dante_identity_preferences
  (companion_id, customer_id, category, item, valence, strength, exposure_count, last_exposed_at, source)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (companion_id, customer_id, category, item) DO UPDATE SET
  strength        = EXCLUDED.strength,
  exposure_count  = EXCLUDED.exposure_count,
  last_exposed_at = EXCLUDED.last_exposed_at,
  source          = EXCLUDED.source
      `, [
        companionId, customerId, data.category, data.item, data.valence,
        data.strength, data.exposureCount, data.lastExposedAt, data.source,
      ]);
    } catch (err) {
      logger?.warn("[identityPreferences] persist error", { error: err?.message });
    }
  }

  return { init, getPreference, getPreferences, record };
}

module.exports = { createIdentityPreferenceStore };
