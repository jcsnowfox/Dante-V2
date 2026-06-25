"use strict";
const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    topic_key: r.topic_key || '',
    topic_summary: r.topic_summary || '',
    confidence_level: r.confidence_level || 'medium',
    evidence_summary: r.evidence_summary || '',
    last_verified_at: r.last_verified_at || null,
    privacy_scope: r.privacy_scope || 'normal',
    adult_context: !!r.adult_context,
    active: r.active !== false && r.active !== 'false',
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function createFallbackStore() {
  const rows = [];
  let id = 1;
  return {
    available: true,
    async init() {},
    async upsertProfile(p) {
      const t = nowIso();
      let row = rows.find(x =>
        x.user_scope === p.user_scope &&
        x.companion_id === p.companion_id &&
        x.topic_key === p.topic_key
      );
      if (row) {
        Object.assign(row, {
          topic_summary: p.topic_summary || row.topic_summary,
          confidence_level: p.confidence_level || row.confidence_level,
          evidence_summary: p.evidence_summary || row.evidence_summary,
          last_verified_at: t,
          updated_at: t,
        });
        return mapRow(row);
      }
      row = {
        id: id++,
        user_scope: p.user_scope,
        companion_id: p.companion_id,
        topic_key: p.topic_key || '',
        topic_summary: p.topic_summary || '',
        confidence_level: p.confidence_level || 'medium',
        evidence_summary: p.evidence_summary || '',
        last_verified_at: t,
        privacy_scope: p.privacy_scope || 'normal',
        adult_context: !!p.adult_context,
        active: true,
        created_at: t,
        updated_at: t,
      };
      rows.push(row);
      return mapRow(row);
    },
    async listProfiles(q = {}) {
      const excludeAdult = !q.include_adult;
      return rows
        .filter(r =>
          (!q.user_scope || r.user_scope === q.user_scope) &&
          (!q.companion_id || r.companion_id === q.companion_id) &&
          (excludeAdult ? !r.adult_context : true)
        )
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, Number(q.limit) || 50)
        .map(mapRow);
    },
    async deleteProfile({ id }) {
      const i = rows.findIndex(r => r.id === id);
      if (i === -1) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

function createMemoryConfidenceProfileStore({ config, logger }) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }
  if (!pool) {
    logger?.warn?.('[memory-confidence] DATABASE_URL not set; using in-memory fallback');
    return createFallbackStore();
  }

  return {
    available: true,
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS memory_confidence_profiles (
          id BIGSERIAL PRIMARY KEY,
          user_scope TEXT NOT NULL,
          companion_id TEXT NOT NULL,
          topic_key TEXT NOT NULL,
          topic_summary TEXT NOT NULL DEFAULT '',
          confidence_level TEXT NOT NULL DEFAULT 'medium',
          evidence_summary TEXT NOT NULL DEFAULT '',
          last_verified_at TIMESTAMPTZ,
          privacy_scope TEXT NOT NULL DEFAULT 'normal',
          adult_context BOOLEAN NOT NULL DEFAULT FALSE,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_scope, companion_id, topic_key)
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS memory_confidence_scope_idx ON memory_confidence_profiles (user_scope, companion_id, active)');
      logger?.info?.('[memory-confidence] storage initialised');
    },
    async upsertProfile(p) {
      const { rows } = await pool.query(`
        INSERT INTO memory_confidence_profiles (user_scope, companion_id, topic_key, topic_summary, confidence_level, evidence_summary, last_verified_at, privacy_scope, adult_context, active, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, TRUE, NOW())
        ON CONFLICT (user_scope, companion_id, topic_key) DO UPDATE SET
          topic_summary = EXCLUDED.topic_summary,
          confidence_level = EXCLUDED.confidence_level,
          evidence_summary = EXCLUDED.evidence_summary,
          last_verified_at = NOW(),
          updated_at = NOW()
        RETURNING *`,
        [p.user_scope, p.companion_id, p.topic_key, p.topic_summary || '', p.confidence_level || 'medium', p.evidence_summary || '', p.privacy_scope || 'normal', !!p.adult_context]
      );
      return mapRow(rows[0]);
    },
    async listProfiles(q = {}) {
      const clauses = ['user_scope = $1', 'companion_id = $2'];
      const values = [q.user_scope, q.companion_id];
      if (!q.include_adult) clauses.push('adult_context = FALSE');
      const { rows } = await pool.query(
        `SELECT * FROM memory_confidence_profiles WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC LIMIT $${values.length + 1}`,
        [...values, Math.min(Number(q.limit) || 50, 200)]
      );
      return rows.map(mapRow);
    },
    async deleteProfile({ id }) {
      const { rowCount } = await pool.query('DELETE FROM memory_confidence_profiles WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };
}

module.exports = { createMemoryConfidenceProfileStore };
