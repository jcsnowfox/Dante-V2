"use strict";

const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    trigger_type: r.trigger_type || "chat",
    channel_id: r.channel_id || "",
    sections_used: r.sections_used || [],
    prelude_length: r.prelude_length || 0,
    warnings_count: r.warnings_count || 0,
    created_at: r.created_at,
  };
}

function createFallbackStore() {
  const rows = [];
  let id = 1;

  return {
    available: true,
    persistenceEnabled: false,
    async init() {},
    async storeSnapshot(r) {
      const row = {
        id: id++,
        user_scope: r.user_scope || "",
        companion_id: r.companion_id || "",
        trigger_type: r.trigger_type || "chat",
        channel_id: r.channel_id || "",
        sections_used: Array.isArray(r.sections_used) ? r.sections_used : [],
        prelude_length: r.prelude_length || 0,
        warnings_count: r.warnings_count || 0,
        created_at: nowIso(),
      };
      rows.push(row);
      if (rows.length > 100) rows.splice(0, rows.length - 100);
      return mapRow(row);
    },
    async listRecent({ user_scope, companion_id, limit = 10 }) {
      const maxLimit = Math.min(limit, 50);
      return rows
        .filter((r) => r.user_scope === user_scope && r.companion_id === companion_id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, maxLimit)
        .map(mapRow);
    },
    async getLatest({ user_scope, companion_id }) {
      const recent = await this.listRecent({ user_scope, companion_id, limit: 1 });
      return recent[0] || null;
    },
  };
}

function createPostgresStore({ pool }) {
  return {
    available: true,
    persistenceEnabled: true,
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS situational_awareness_snapshots (
          id BIGSERIAL PRIMARY KEY,
          user_scope TEXT NOT NULL,
          companion_id TEXT NOT NULL,
          trigger_type TEXT NOT NULL DEFAULT 'chat',
          channel_id TEXT NOT NULL DEFAULT '',
          sections_used JSONB NOT NULL DEFAULT '[]',
          prelude_length INTEGER NOT NULL DEFAULT 0,
          warnings_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS situational_awareness_snapshots_scope_idx
         ON situational_awareness_snapshots (user_scope, companion_id, created_at DESC)`
      );
    },
    async storeSnapshot(r) {
      const result = await pool.query(
        `INSERT INTO situational_awareness_snapshots
           (user_scope, companion_id, trigger_type, channel_id, sections_used, prelude_length, warnings_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          r.user_scope || "",
          r.companion_id || "",
          r.trigger_type || "chat",
          r.channel_id || "",
          JSON.stringify(Array.isArray(r.sections_used) ? r.sections_used : []),
          r.prelude_length || 0,
          r.warnings_count || 0,
        ]
      );
      return mapRow(result.rows[0]);
    },
    async listRecent({ user_scope, companion_id, limit = 10 }) {
      const maxLimit = Math.min(limit, 50);
      const result = await pool.query(
        `SELECT * FROM situational_awareness_snapshots
         WHERE user_scope = $1 AND companion_id = $2
         ORDER BY created_at DESC LIMIT $3`,
        [user_scope, companion_id, maxLimit]
      );
      return result.rows.map(mapRow);
    },
    async getLatest({ user_scope, companion_id }) {
      const result = await pool.query(
        `SELECT * FROM situational_awareness_snapshots
         WHERE user_scope = $1 AND companion_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [user_scope, companion_id]
      );
      return mapRow(result.rows[0]) || null;
    },
  };
}

function createSituationalAwarenessStore({ config, logger }) {
  const databaseUrl = config?.database?.url || process.env.DATABASE_URL || "";

  if (!databaseUrl) {
    return createFallbackStore();
  }

  try {
    const pool = createPostgresPool({ databaseUrl, logger });
    return createPostgresStore({ pool });
  } catch (error) {
    logger?.warn?.("[situational-awareness-store] Postgres setup failed, using in-memory fallback", {
      error: error?.message,
    });
    return createFallbackStore();
  }
}

module.exports = { createSituationalAwarenessStore };
