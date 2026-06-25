"use strict";
const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    rule_type: r.rule_type || 'do_not_ask',
    topic_key: r.topic_key,
    rule_summary: r.rule_summary || '',
    exact_phrase: r.exact_phrase || null,
    scope: r.scope || 'all_channels',
    expiry_at: r.expiry_at || null,
    privacy_scope: r.privacy_scope || 'normal',
    adult_context: !!r.adult_context,
    source_channel_id: r.source_channel_id || '',
    source_message_id: r.source_message_id || '',
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
          exact_phrase: p.exact_phrase !== undefined ? p.exact_phrase : row.exact_phrase,
          scope: p.scope || row.scope,
          expiry_at: p.expiry_at !== undefined ? p.expiry_at : row.expiry_at,
          privacy_scope: p.privacy_scope || row.privacy_scope,
          adult_context: p.adult_context !== undefined ? !!p.adult_context : row.adult_context,
          source_channel_id: p.source_channel_id || row.source_channel_id,
          source_message_id: p.source_message_id || row.source_message_id,
          active: true,
          updated_at: t,
        });
        return mapRow(row);
      }
      row = {
        id: id++,
        user_scope: p.user_scope,
        companion_id: p.companion_id,
        rule_type: p.rule_type || 'do_not_ask',
        topic_key: p.topic_key,
        rule_summary: p.rule_summary || '',
        exact_phrase: p.exact_phrase || null,
        scope: p.scope || 'all_channels',
        expiry_at: p.expiry_at || null,
        privacy_scope: p.privacy_scope || 'normal',
        adult_context: !!p.adult_context,
        source_channel_id: p.source_channel_id || '',
        source_message_id: p.source_message_id || '',
        active: true,
        created_at: t,
        updated_at: t,
      };
      rows.push(row);
      return mapRow(row);
    },
    async listRules(q = {}) {
      const excludeAdult = !q.include_adult;
      const now = new Date();
      return rows
        .filter(r =>
          (!q.user_scope || r.user_scope === q.user_scope) &&
          (!q.companion_id || r.companion_id === q.companion_id) &&
          (!q.active_only || r.active !== false) &&
          (excludeAdult ? !r.adult_context : true) &&
          (!r.expiry_at || new Date(r.expiry_at) > now)
        )
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, Math.min(q.limit || 100, 200))
        .map(mapRow);
    },
    async deactivate({ id }) {
      const row = rows.find(r => r.id === id);
      if (row) { row.active = false; row.updated_at = nowIso(); }
      return mapRow(row) || null;
    },
    async setExpiry({ id, expiry_at }) {
      const row = rows.find(r => r.id === id);
      if (row) { row.expiry_at = expiry_at; row.updated_at = nowIso(); }
      return mapRow(row) || null;
    },
  };
}

const SQL = `CREATE TABLE IF NOT EXISTS do_not_ask_rules (
  id BIGSERIAL PRIMARY KEY,
  user_scope TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'do_not_ask',
  topic_key TEXT NOT NULL,
  rule_summary TEXT NOT NULL DEFAULT '',
  exact_phrase TEXT,
  scope TEXT NOT NULL DEFAULT 'all_channels',
  expiry_at TIMESTAMPTZ,
  privacy_scope TEXT NOT NULL DEFAULT 'normal',
  adult_context BOOLEAN NOT NULL DEFAULT FALSE,
  source_channel_id TEXT NOT NULL DEFAULT '',
  source_message_id TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_scope, companion_id, topic_key)
);`;

function createDoNotAskStore({ config, logger } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch {}
  if (!pool) return createFallbackStore();
  return {
    available: true,
    async init() {
      await pool.query(SQL);
      await pool.query("CREATE INDEX IF NOT EXISTS dna_scope_idx ON do_not_ask_rules (user_scope, companion_id, active)");
      logger?.info?.("[do-not-ask] storage initialised");
    },
    async upsertRule(p) {
      const { rows } = await pool.query(
        `INSERT INTO do_not_ask_rules
           (user_scope, companion_id, rule_type, topic_key, rule_summary, exact_phrase, scope, expiry_at, privacy_scope, adult_context, source_channel_id, source_message_id, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
         ON CONFLICT (user_scope, companion_id, topic_key) DO UPDATE SET
           rule_type=EXCLUDED.rule_type,
           rule_summary=EXCLUDED.rule_summary,
           exact_phrase=COALESCE(EXCLUDED.exact_phrase, do_not_ask_rules.exact_phrase),
           scope=EXCLUDED.scope,
           expiry_at=EXCLUDED.expiry_at,
           privacy_scope=EXCLUDED.privacy_scope,
           adult_context=EXCLUDED.adult_context,
           source_channel_id=EXCLUDED.source_channel_id,
           source_message_id=EXCLUDED.source_message_id,
           active=true,
           updated_at=NOW()
         RETURNING *`,
        [
          p.user_scope, p.companion_id, p.rule_type || 'do_not_ask', p.topic_key,
          p.rule_summary || '', p.exact_phrase || null, p.scope || 'all_channels',
          p.expiry_at || null, p.privacy_scope || 'normal', !!p.adult_context,
          p.source_channel_id || '', p.source_message_id || '',
        ]
      );
      return mapRow(rows[0]);
    },
    async listRules(q = {}) {
      const excludeAdult = !q.include_adult;
      const { rows } = await pool.query(
        `SELECT * FROM do_not_ask_rules
         WHERE user_scope=$1 AND companion_id=$2
         ${q.active_only ? ' AND active=true' : ''}
         ${excludeAdult ? ' AND adult_context=false' : ''}
         AND (expiry_at IS NULL OR expiry_at > NOW())
         ORDER BY updated_at DESC LIMIT $3`,
        [q.user_scope, q.companion_id, Math.min(q.limit || 100, 200)]
      );
      return rows.map(mapRow);
    },
    async deactivate({ id }) {
      const { rows } = await pool.query(
        'UPDATE do_not_ask_rules SET active=false, updated_at=NOW() WHERE id=$1 RETURNING *',
        [id]
      );
      return mapRow(rows[0]) || null;
    },
    async setExpiry({ id, expiry_at }) {
      const { rows } = await pool.query(
        'UPDATE do_not_ask_rules SET expiry_at=$2, updated_at=NOW() WHERE id=$1 RETURNING *',
        [id, expiry_at]
      );
      return mapRow(rows[0]) || null;
    },
  };
}

module.exports = { createDoNotAskStore };
