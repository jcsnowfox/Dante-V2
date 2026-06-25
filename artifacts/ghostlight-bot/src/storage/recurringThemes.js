"use strict";
const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    theme_key: r.theme_key || '',
    theme_label: r.theme_label || '',
    evidence_count: Number(r.evidence_count) || 1,
    evidence_summary: r.evidence_summary || '',
    last_seen_at: r.last_seen_at || r.created_at,
    first_seen_at: r.first_seen_at || r.created_at,
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
    async upsertTheme(p) {
      const t = nowIso();
      let row = rows.find(x =>
        x.user_scope === p.user_scope &&
        x.companion_id === p.companion_id &&
        x.theme_key === p.theme_key
      );
      if (row) {
        Object.assign(row, {
          evidence_count: (Number(row.evidence_count) || 1) + 1,
          evidence_summary: p.evidence_summary || row.evidence_summary,
          last_seen_at: t,
          privacy_scope: p.privacy_scope || row.privacy_scope,
          adult_context: p.adult_context !== undefined ? !!p.adult_context : row.adult_context,
          active: true,
          updated_at: t,
        });
        return mapRow(row);
      }
      row = {
        id: id++,
        user_scope: p.user_scope,
        companion_id: p.companion_id,
        theme_key: p.theme_key || '',
        theme_label: p.theme_label || p.theme_key || '',
        evidence_count: 1,
        evidence_summary: p.evidence_summary || '',
        last_seen_at: t,
        first_seen_at: t,
        privacy_scope: p.privacy_scope || 'normal',
        adult_context: !!p.adult_context,
        active: true,
        created_at: t,
        updated_at: t,
      };
      rows.push(row);
      return mapRow(row);
    },
    async listThemes(q = {}) {
      const excludeAdult = !q.include_adult;
      return rows
        .filter(r =>
          (!q.user_scope || r.user_scope === q.user_scope) &&
          (!q.companion_id || r.companion_id === q.companion_id) &&
          (q.active_only ? r.active : true) &&
          (excludeAdult ? !r.adult_context : true)
        )
        .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))
        .slice(0, Number(q.limit) || 50)
        .map(mapRow);
    },
    async deleteTheme({ id }) {
      const i = rows.findIndex(r => r.id === id);
      if (i === -1) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

function createRecurringThemeStore({ config, logger }) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }
  if (!pool) {
    logger?.warn?.('[recurring-themes] DATABASE_URL not set; using in-memory fallback');
    return createFallbackStore();
  }

  return {
    available: true,
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS recurring_themes (
          id BIGSERIAL PRIMARY KEY,
          user_scope TEXT NOT NULL,
          companion_id TEXT NOT NULL,
          theme_key TEXT NOT NULL,
          theme_label TEXT NOT NULL DEFAULT '',
          evidence_count INTEGER NOT NULL DEFAULT 1,
          evidence_summary TEXT NOT NULL DEFAULT '',
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          privacy_scope TEXT NOT NULL DEFAULT 'normal',
          adult_context BOOLEAN NOT NULL DEFAULT FALSE,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_scope, companion_id, theme_key)
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS recurring_themes_scope_idx ON recurring_themes (user_scope, companion_id, active, last_seen_at DESC)');
      logger?.info?.('[recurring-themes] storage initialised');
    },
    async upsertTheme(p) {
      const { rows } = await pool.query(`
        INSERT INTO recurring_themes (user_scope, companion_id, theme_key, theme_label, evidence_count, evidence_summary, last_seen_at, first_seen_at, privacy_scope, adult_context, active, updated_at)
        VALUES ($1, $2, $3, $4, 1, $5, NOW(), NOW(), $6, $7, TRUE, NOW())
        ON CONFLICT (user_scope, companion_id, theme_key) DO UPDATE SET
          evidence_count = recurring_themes.evidence_count + 1,
          evidence_summary = EXCLUDED.evidence_summary,
          last_seen_at = NOW(),
          privacy_scope = EXCLUDED.privacy_scope,
          adult_context = EXCLUDED.adult_context,
          active = TRUE,
          updated_at = NOW()
        RETURNING *`,
        [p.user_scope, p.companion_id, p.theme_key, p.theme_label || p.theme_key, p.evidence_summary || '', p.privacy_scope || 'normal', !!p.adult_context]
      );
      return mapRow(rows[0]);
    },
    async listThemes(q = {}) {
      const clauses = ['user_scope = $1', 'companion_id = $2'];
      const values = [q.user_scope, q.companion_id];
      if (q.active_only) clauses.push('active = TRUE');
      if (!q.include_adult) clauses.push('adult_context = FALSE');
      const { rows } = await pool.query(
        `SELECT * FROM recurring_themes WHERE ${clauses.join(' AND ')} ORDER BY last_seen_at DESC LIMIT $${values.length + 1}`,
        [...values, Math.min(Number(q.limit) || 50, 200)]
      );
      return rows.map(mapRow);
    },
    async deleteTheme({ id }) {
      const { rowCount } = await pool.query('DELETE FROM recurring_themes WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };
}

module.exports = { createRecurringThemeStore };
