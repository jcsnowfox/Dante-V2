"use strict";
const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    energy_state: r.energy_state || 'unknown',
    confidence: Number(r.confidence) || 0.5,
    evidence_summary: r.evidence_summary || '',
    source_channel_id: r.source_channel_id || '',
    source_message_id: r.source_message_id || '',
    privacy_scope: r.privacy_scope || 'normal',
    adult_context: !!r.adult_context,
    created_at: r.created_at,
  };
}

function createFallbackStore() {
  const rows = [];
  let id = 1;
  return {
    available: true,
    async init() {},
    async saveObservation(p) {
      const row = {
        id: id++,
        user_scope: p.user_scope,
        companion_id: p.companion_id,
        energy_state: p.energy_state || 'unknown',
        confidence: p.confidence || 0.5,
        evidence_summary: p.evidence_summary || '',
        source_channel_id: p.source_channel_id || '',
        source_message_id: p.source_message_id || '',
        privacy_scope: p.privacy_scope || 'normal',
        adult_context: !!p.adult_context,
        created_at: nowIso(),
      };
      rows.push(row);
      return mapRow(row);
    },
    async getLatestObservation(q = {}) {
      const excludeAdult = !q.include_adult;
      const filtered = rows
        .filter(r =>
          (!q.user_scope || r.user_scope === q.user_scope) &&
          (!q.companion_id || r.companion_id === q.companion_id) &&
          (excludeAdult ? !r.adult_context : true)
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return filtered[0] ? mapRow(filtered[0]) : null;
    },
    async listObservations(q = {}) {
      const excludeAdult = !q.include_adult;
      return rows
        .filter(r =>
          (!q.user_scope || r.user_scope === q.user_scope) &&
          (!q.companion_id || r.companion_id === q.companion_id) &&
          (excludeAdult ? !r.adult_context : true)
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, Math.min(q.limit || 50, 200))
        .map(mapRow);
    },
    async deleteObservation({ id }) {
      const i = rows.findIndex(r => r.id === id);
      if (i >= 0) { rows.splice(i, 1); return true; }
      return false;
    },
  };
}

const SQL = `CREATE TABLE IF NOT EXISTS user_energy_observations (
  id BIGSERIAL PRIMARY KEY,
  user_scope TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  energy_state TEXT NOT NULL DEFAULT 'unknown',
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence_summary TEXT NOT NULL DEFAULT '',
  source_channel_id TEXT NOT NULL DEFAULT '',
  source_message_id TEXT NOT NULL DEFAULT '',
  privacy_scope TEXT NOT NULL DEFAULT 'normal',
  adult_context BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;

function createUserEnergyStore({ config, logger } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch {}
  if (!pool) return createFallbackStore();
  return {
    available: true,
    async init() {
      await pool.query(SQL);
      await pool.query("CREATE INDEX IF NOT EXISTS ueo_scope_idx ON user_energy_observations (user_scope, companion_id, created_at DESC)");
      logger?.info?.("[user-energy] storage initialised");
    },
    async saveObservation(p) {
      const { rows } = await pool.query(
        `INSERT INTO user_energy_observations
           (user_scope, companion_id, energy_state, confidence, evidence_summary, source_channel_id, source_message_id, privacy_scope, adult_context)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          p.user_scope, p.companion_id, p.energy_state || 'unknown',
          p.confidence || 0.5, p.evidence_summary || '',
          p.source_channel_id || '', p.source_message_id || '',
          p.privacy_scope || 'normal', !!p.adult_context,
        ]
      );
      return mapRow(rows[0]);
    },
    async getLatestObservation(q = {}) {
      const excludeAdult = !q.include_adult;
      const { rows } = await pool.query(
        `SELECT * FROM user_energy_observations
         WHERE user_scope=$1 AND companion_id=$2
         ${excludeAdult ? ' AND adult_context=false' : ''}
         ORDER BY created_at DESC LIMIT 1`,
        [q.user_scope, q.companion_id]
      );
      return mapRow(rows[0]) || null;
    },
    async listObservations(q = {}) {
      const excludeAdult = !q.include_adult;
      const { rows } = await pool.query(
        `SELECT * FROM user_energy_observations
         WHERE user_scope=$1 AND companion_id=$2
         ${excludeAdult ? ' AND adult_context=false' : ''}
         ORDER BY created_at DESC LIMIT $3`,
        [q.user_scope, q.companion_id, Math.min(q.limit || 50, 200)]
      );
      return rows.map(mapRow);
    },
    async deleteObservation({ id }) {
      const r = await pool.query('DELETE FROM user_energy_observations WHERE id=$1', [id]);
      return (r.rowCount || 0) > 0;
    },
  };
}

module.exports = { createUserEnergyStore };
