"use strict";
const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    reflection_type: r.reflection_type || 'general',
    trigger_summary: r.trigger_summary || '',
    reflection_text: r.reflection_text || '',
    emotional_tone: r.emotional_tone || '',
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
    async saveReflection(p) {
      const row = {
        id: id++,
        user_scope: p.user_scope,
        companion_id: p.companion_id,
        reflection_type: p.reflection_type || 'general',
        trigger_summary: p.trigger_summary || '',
        reflection_text: p.reflection_text || '',
        emotional_tone: p.emotional_tone || '',
        privacy_scope: p.privacy_scope || 'normal',
        adult_context: !!p.adult_context,
        created_at: nowIso(),
      };
      rows.push(row);
      return mapRow(row);
    },
    async listReflections(q = {}) {
      const excludeAdult = !q.include_adult;
      return rows
        .filter(r =>
          (!q.user_scope || r.user_scope === q.user_scope) &&
          (!q.companion_id || r.companion_id === q.companion_id) &&
          (excludeAdult ? !r.adult_context : true)
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, Number(q.limit) || 50)
        .map(mapRow);
    },
    async deleteReflection({ id }) {
      const i = rows.findIndex(r => r.id === id);
      if (i === -1) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

function createSelfReflectionStore({ config, logger }) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }
  if (!pool) {
    logger?.warn?.('[self-reflection] DATABASE_URL not set; using in-memory fallback');
    return createFallbackStore();
  }

  return {
    available: true,
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS self_reflection_events (
          id BIGSERIAL PRIMARY KEY,
          user_scope TEXT NOT NULL,
          companion_id TEXT NOT NULL,
          reflection_type TEXT NOT NULL DEFAULT 'general',
          trigger_summary TEXT NOT NULL DEFAULT '',
          reflection_text TEXT NOT NULL DEFAULT '',
          emotional_tone TEXT NOT NULL DEFAULT '',
          privacy_scope TEXT NOT NULL DEFAULT 'normal',
          adult_context BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS self_reflection_scope_idx ON self_reflection_events (user_scope, companion_id, created_at DESC)');
      logger?.info?.('[self-reflection] storage initialised');
    },
    async saveReflection(p) {
      const { rows } = await pool.query(`
        INSERT INTO self_reflection_events (user_scope, companion_id, reflection_type, trigger_summary, reflection_text, emotional_tone, privacy_scope, adult_context)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [p.user_scope, p.companion_id, p.reflection_type || 'general', p.trigger_summary || '', p.reflection_text || '', p.emotional_tone || '', p.privacy_scope || 'normal', !!p.adult_context]
      );
      return mapRow(rows[0]);
    },
    async listReflections(q = {}) {
      const clauses = ['user_scope = $1', 'companion_id = $2'];
      const values = [q.user_scope, q.companion_id];
      if (!q.include_adult) clauses.push('adult_context = FALSE');
      const { rows } = await pool.query(
        `SELECT * FROM self_reflection_events WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT $${values.length + 1}`,
        [...values, Math.min(Number(q.limit) || 50, 200)]
      );
      return rows.map(mapRow);
    },
    async deleteReflection({ id }) {
      const { rowCount } = await pool.query('DELETE FROM self_reflection_events WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };
}

module.exports = { createSelfReflectionStore };
