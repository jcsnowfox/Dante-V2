"use strict";
const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    rule_type: r.rule_type || 'cooldown',
    topic_key: r.topic_key || '',
    rule_summary: r.rule_summary || '',
    cooldown_seconds: Number(r.cooldown_seconds) || 3600,
    quiet_hours_start: r.quiet_hours_start || null,
    quiet_hours_end: r.quiet_hours_end || null,
    requires_approval: !!r.requires_approval,
    privacy_scope: r.privacy_scope || 'normal',
    adult_context: !!r.adult_context,
    active: r.active !== false && r.active !== 'false',
    last_triggered_at: r.last_triggered_at || null,
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
    async upsertRule(p) {
      const t = nowIso();
      let row = rows.find(x =>
        x.user_scope === p.user_scope &&
        x.companion_id === p.companion_id &&
        x.topic_key === p.topic_key
      );
      if (row) {
        Object.assign(row, {
          rule_type: p.rule_type || row.rule_type,
          rule_summary: p.rule_summary || row.rule_summary,
          cooldown_seconds: p.cooldown_seconds !== undefined ? Number(p.cooldown_seconds) : row.cooldown_seconds,
          quiet_hours_start: p.quiet_hours_start !== undefined ? p.quiet_hours_start : row.quiet_hours_start,
          quiet_hours_end: p.quiet_hours_end !== undefined ? p.quiet_hours_end : row.quiet_hours_end,
          requires_approval: p.requires_approval !== undefined ? !!p.requires_approval : row.requires_approval,
          active: true,
          updated_at: t,
        });
        return mapRow(row);
      }
      row = {
        id: id++,
        user_scope: p.user_scope,
        companion_id: p.companion_id,
        rule_type: p.rule_type || 'cooldown',
        topic_key: p.topic_key || '',
        rule_summary: p.rule_summary || '',
        cooldown_seconds: Number(p.cooldown_seconds) || 3600,
        quiet_hours_start: p.quiet_hours_start || null,
        quiet_hours_end: p.quiet_hours_end || null,
        requires_approval: !!p.requires_approval,
        privacy_scope: p.privacy_scope || 'normal',
        adult_context: !!p.adult_context,
        active: true,
        last_triggered_at: null,
        created_at: t,
        updated_at: t,
      };
      rows.push(row);
      return mapRow(row);
    },
    async listRules(q = {}) {
      const excludeAdult = !q.include_adult;
      return rows
        .filter(r =>
          (!q.user_scope || r.user_scope === q.user_scope) &&
          (!q.companion_id || r.companion_id === q.companion_id) &&
          (q.active_only ? r.active : true) &&
          (excludeAdult ? !r.adult_context : true)
        )
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, Number(q.limit) || 50)
        .map(mapRow);
    },
    async deactivate({ id }) {
      const row = rows.find(r => r.id === id);
      if (!row) return false;
      row.active = false;
      row.updated_at = nowIso();
      return true;
    },
    async markTriggered({ id }) {
      const row = rows.find(r => r.id === id);
      if (!row) return false;
      row.last_triggered_at = nowIso();
      return true;
    },
  };
}

function createProactivePresenceRuleStore({ config, logger }) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }
  if (!pool) {
    logger?.warn?.('[proactive-presence] DATABASE_URL not set; using in-memory fallback');
    return createFallbackStore();
  }

  return {
    available: true,
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS proactive_presence_rules (
          id BIGSERIAL PRIMARY KEY,
          user_scope TEXT NOT NULL,
          companion_id TEXT NOT NULL,
          rule_type TEXT NOT NULL DEFAULT 'cooldown',
          topic_key TEXT NOT NULL,
          rule_summary TEXT NOT NULL DEFAULT '',
          cooldown_seconds INTEGER NOT NULL DEFAULT 3600,
          quiet_hours_start TEXT,
          quiet_hours_end TEXT,
          requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
          privacy_scope TEXT NOT NULL DEFAULT 'normal',
          adult_context BOOLEAN NOT NULL DEFAULT FALSE,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          last_triggered_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_scope, companion_id, topic_key)
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS proactive_presence_scope_idx ON proactive_presence_rules (user_scope, companion_id, active)');
      logger?.info?.('[proactive-presence] storage initialised');
    },
    async upsertRule(p) {
      const { rows } = await pool.query(`
        INSERT INTO proactive_presence_rules (user_scope, companion_id, rule_type, topic_key, rule_summary, cooldown_seconds, quiet_hours_start, quiet_hours_end, requires_approval, privacy_scope, adult_context, active, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, NOW())
        ON CONFLICT (user_scope, companion_id, topic_key) DO UPDATE SET
          rule_type = EXCLUDED.rule_type,
          rule_summary = EXCLUDED.rule_summary,
          cooldown_seconds = EXCLUDED.cooldown_seconds,
          quiet_hours_start = EXCLUDED.quiet_hours_start,
          quiet_hours_end = EXCLUDED.quiet_hours_end,
          requires_approval = EXCLUDED.requires_approval,
          active = TRUE,
          updated_at = NOW()
        RETURNING *`,
        [p.user_scope, p.companion_id, p.rule_type || 'cooldown', p.topic_key, p.rule_summary || '', Number(p.cooldown_seconds) || 3600, p.quiet_hours_start || null, p.quiet_hours_end || null, !!p.requires_approval, p.privacy_scope || 'normal', !!p.adult_context]
      );
      return mapRow(rows[0]);
    },
    async listRules(q = {}) {
      const clauses = ['user_scope = $1', 'companion_id = $2'];
      const values = [q.user_scope, q.companion_id];
      if (q.active_only) clauses.push('active = TRUE');
      if (!q.include_adult) clauses.push('adult_context = FALSE');
      const { rows } = await pool.query(
        `SELECT * FROM proactive_presence_rules WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC LIMIT $${values.length + 1}`,
        [...values, Math.min(Number(q.limit) || 50, 200)]
      );
      return rows.map(mapRow);
    },
    async deactivate({ id }) {
      const { rowCount } = await pool.query('UPDATE proactive_presence_rules SET active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
      return rowCount > 0;
    },
    async markTriggered({ id }) {
      const { rowCount } = await pool.query('UPDATE proactive_presence_rules SET last_triggered_at = NOW() WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };
}

module.exports = { createProactivePresenceRuleStore };
