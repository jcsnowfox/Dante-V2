"use strict";
const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    action_id: r.action_id || "",
    action_type: r.action_type || "proactive_action",
    run_id: r.run_id || "",
    output_summary: r.output_summary || "",
    theme_summary: r.theme_summary || "",
    tools_used_json: r.tools_used_json || [],
    created_at: r.created_at,
  };
}

function createFallbackStore() {
  const rows = [];
  let id = 1;

  return {
    available: true,
    async init() {},
    async recordRun(r) {
      const t = nowIso();
      const tools = r.tools_used_json || r.tools_used || [];
      const row = {
        id: id++,
        user_scope: r.user_scope,
        companion_id: r.companion_id,
        action_id: r.action_id || "",
        action_type: r.action_type || "proactive_action",
        run_id: r.run_id || "",
        output_summary: r.output_summary || "",
        theme_summary: r.theme_summary || "",
        tools_used_json: tools,
        created_at: t,
      };
      rows.push(row);
      return mapRow(row);
    },
    async listRecent({ user_scope, companion_id, action_id, limit }) {
      const maxLimit = Math.min(limit || 10, 50);
      return rows
        .filter(
          (r) =>
            r.user_scope === user_scope &&
            r.companion_id === companion_id &&
            (!action_id || r.action_id === action_id)
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, maxLimit)
        .map(mapRow);
    },
    async clearOldRuns({ user_scope, companion_id, action_id, keep_count }) {
      const toKeep = keep_count || 20;
      const relevant = rows.filter(
        (r) =>
          r.user_scope === user_scope &&
          r.companion_id === companion_id &&
          (!action_id || r.action_id === action_id)
      );
      if (relevant.length > toKeep) {
        relevant.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const toDelete = relevant.slice(toKeep);
        for (const del of toDelete) {
          const i = rows.indexOf(del);
          if (i >= 0) rows.splice(i, 1);
        }
        return toDelete.length;
      }
      return 0;
    },
  };
}

const SQL = `CREATE TABLE IF NOT EXISTS proactive_variety_memory (
  id BIGSERIAL PRIMARY KEY,
  user_scope TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  action_id TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL DEFAULT 'proactive_action',
  run_id TEXT NOT NULL DEFAULT '',
  output_summary TEXT NOT NULL DEFAULT '',
  theme_summary TEXT NOT NULL DEFAULT '',
  tools_used_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;

function createProactiveVarietyMemoryStore({ config, logger } = {}) {
  let pool = null;
  try {
    pool = createPostgresPool({ config });
  } catch {}

  if (!pool) return createFallbackStore();

  return {
    available: true,
    async init() {
      await pool.query(SQL);
      await pool.query(
        "CREATE INDEX IF NOT EXISTS pvm_scope_idx ON proactive_variety_memory (user_scope, companion_id, action_id)"
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS pvm_time_idx ON proactive_variety_memory (created_at DESC)"
      );
      logger?.info?.("[proactive-variety] storage initialised");
    },
    async recordRun(r) {
      const tools = r.tools_used_json || r.tools_used || [];
      const { rows } = await pool.query(
        `INSERT INTO proactive_variety_memory
         (user_scope, companion_id, action_id, action_type, run_id,
          output_summary, theme_summary, tools_used_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          r.user_scope,
          r.companion_id,
          r.action_id || "",
          r.action_type || "proactive_action",
          r.run_id || "",
          r.output_summary || "",
          r.theme_summary || "",
          JSON.stringify(tools),
        ]
      );
      return mapRow(rows[0]);
    },
    async listRecent({ user_scope, companion_id, action_id, limit }) {
      const maxLimit = Math.min(limit || 10, 50);
      let whereClause = "WHERE user_scope = $1 AND companion_id = $2";
      const params = [user_scope, companion_id];

      if (action_id) {
        params.push(action_id);
        whereClause += ` AND action_id = $${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT * FROM proactive_variety_memory ${whereClause}
         ORDER BY created_at DESC LIMIT $${params.length + 1}`,
        [...params, maxLimit]
      );
      return rows.map(mapRow);
    },
    async clearOldRuns({ user_scope, companion_id, action_id, keep_count }) {
      const toKeep = keep_count || 20;
      const selectClause = `SELECT id FROM proactive_variety_memory
        WHERE user_scope = $1 AND companion_id = $2
        ${action_id ? "AND action_id = $3" : ""}
        ORDER BY created_at DESC OFFSET $${action_id ? "4" : "3"}`;

      const params = [user_scope, companion_id];
      if (action_id) params.push(action_id);
      params.push(toKeep);

      const { rows: toDelete } = await pool.query(selectClause, params);
      if (toDelete.length === 0) return 0;

      const deleteIds = toDelete.map((r) => r.id);
      const deletedResult = await pool.query(
        `DELETE FROM proactive_variety_memory WHERE id = ANY($1)`,
        [deleteIds]
      );
      return deletedResult.rowCount || 0;
    },
  };
}

module.exports = { createProactiveVarietyMemoryStore };
