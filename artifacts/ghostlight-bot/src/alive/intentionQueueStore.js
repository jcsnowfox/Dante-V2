"use strict";

/**
 * alive/intentionQueueStore
 *
 * Postgres-backed queue for Alive Layer intentions. An intention is a decision
 * by the aliveEngine that the companion should reach out or take some action.
 * Intentions are created by the engine, consumed by the executor, and expire
 * if not acted on within a TTL.
 *
 * Follows the standard Ghostlight storage pattern: Postgres pool from config;
 * in-memory fallback if DATABASE_URL is not set. Schema migrated inline.
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const INTENTION_TYPES = Object.freeze([
  "reach_out",
  "check_in",
  "share_thought",
  "repair_bridge",
  "voice_note",
  "image",
]);

const INTENTION_STATUSES = Object.freeze(["pending", "completed", "expired", "cancelled"]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS alive_intentions (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    intention_type TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}',
    priority INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ
  );
`;

const CREATE_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS alive_intentions_scope_idx ON alive_intentions (companion_id, customer_id, status, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS alive_intentions_pending_idx ON alive_intentions (companion_id, customer_id, priority DESC, created_at ASC) WHERE status = 'pending';",
];

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    customerId: row.customer_id,
    intentionType: row.intention_type,
    reason: row.reason || "",
    payload: row.payload || {},
    priority: Number(row.priority) || 5,
    status: row.status || "pending",
    createdAt: row.created_at,
    expiresAt: row.expires_at || null,
    executedAt: row.executed_at || null,
  };
}

function createMemoryIntentionQueue() {
  const rows = [];
  let id = 1;
  return {
    available: true,
    async init() {},
    async enqueue({ companionId, customerId, intentionType, reason = "", payload = {}, priority = 5, expiresAt = null } = {}) {
      const row = {
        id: id++,
        companion_id: companionId,
        customer_id: customerId,
        intention_type: intentionType,
        reason: reason || "",
        payload: payload || {},
        priority: priority || 5,
        status: "pending",
        created_at: new Date().toISOString(),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        executed_at: null,
      };
      rows.push(row);
      return mapRow(row);
    },
    async listPending({ companionId, customerId, limit = 10 } = {}) {
      const now = Date.now();
      return rows
        .filter((r) => r.companion_id === companionId && r.customer_id === customerId
          && r.status === "pending"
          && (!r.expires_at || new Date(r.expires_at).getTime() > now))
        .sort((a, b) => (b.priority - a.priority) || (new Date(a.created_at) - new Date(b.created_at)))
        .slice(0, Math.min(Number(limit) || 10, 50))
        .map(mapRow);
    },
    async listRecent({ companionId, customerId, limit = 20, status = "" } = {}) {
      return rows
        .filter((r) => r.companion_id === companionId && r.customer_id === customerId
          && (!status || r.status === status))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, Math.min(Number(limit) || 20, 100))
        .map(mapRow);
    },
    async countPending({ companionId, customerId } = {}) {
      const now = Date.now();
      return rows.filter((r) => r.companion_id === companionId && r.customer_id === customerId
        && r.status === "pending"
        && (!r.expires_at || new Date(r.expires_at).getTime() > now)).length;
    },
    async markCompleted({ id: targetId } = {}) {
      const row = rows.find((r) => r.id === targetId);
      if (row) { row.status = "completed"; row.executed_at = new Date().toISOString(); }
      return row ? mapRow(row) : null;
    },
    async markCancelled({ id: targetId } = {}) {
      const row = rows.find((r) => r.id === targetId);
      if (row) row.status = "cancelled";
      return row ? mapRow(row) : null;
    },
    async pruneExpired({ now = new Date() } = {}) {
      const ts = now.getTime();
      let count = 0;
      rows.forEach((r) => {
        if (r.status === "pending" && r.expires_at && new Date(r.expires_at).getTime() <= ts) {
          r.status = "expired";
          count++;
        }
      });
      return count;
    },
  };
}

function createIntentionQueueStore({ pool: providedPool, config, logger } = {}) {
  let pool = providedPool || null;
  if (!pool) {
    try {
      pool = createPostgresPool({ config });
    } catch {
      pool = null;
    }
  }

  if (!pool) {
    return createMemoryIntentionQueue();
  }

  return {
    available: true,

    async init() {
      await pool.query(CREATE_TABLE_SQL);
      for (const sql of CREATE_INDEXES_SQL) {
        await pool.query(sql);
      }
      logger?.info?.("[alive-intentions] storage initialised", { provider: "postgres" });
    },

    async enqueue({ companionId, customerId, intentionType, reason = "", payload = {}, priority = 5, expiresAt = null } = {}) {
      if (!companionId || !customerId || !intentionType) return null;
      const { rows } = await pool.query(
        `INSERT INTO alive_intentions (companion_id, customer_id, intention_type, reason, payload, priority, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [companionId, customerId, intentionType, reason || "", JSON.stringify(payload || {}), priority || 5, expiresAt || null],
      );
      return mapRow(rows[0]);
    },

    async listPending({ companionId, customerId, limit = 10 } = {}) {
      const { rows } = await pool.query(
        `SELECT * FROM alive_intentions
         WHERE companion_id = $1 AND customer_id = $2 AND status = 'pending'
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY priority DESC, created_at ASC
         LIMIT $3`,
        [companionId, customerId, Math.min(Number(limit) || 10, 50)],
      );
      return rows.map(mapRow);
    },

    async listRecent({ companionId, customerId, limit = 20, status = "" } = {}) {
      const values = [companionId, customerId];
      const clauses = ["companion_id = $1", "customer_id = $2"];
      if (status) {
        values.push(status);
        clauses.push(`status = $${values.length}`);
      }
      values.push(Math.min(Number(limit) || 20, 100));
      const { rows } = await pool.query(
        `SELECT * FROM alive_intentions WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length}`,
        values,
      );
      return rows.map(mapRow);
    },

    async countPending({ companionId, customerId } = {}) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM alive_intentions
         WHERE companion_id = $1 AND customer_id = $2 AND status = 'pending'
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [companionId, customerId],
      );
      return Number(rows[0]?.count) || 0;
    },

    async markCompleted({ id: targetId } = {}) {
      const { rows } = await pool.query(
        `UPDATE alive_intentions SET status = 'completed', executed_at = NOW()
         WHERE id = $1 RETURNING *`,
        [targetId],
      );
      return mapRow(rows[0]) || null;
    },

    async markCancelled({ id: targetId } = {}) {
      const { rows } = await pool.query(
        `UPDATE alive_intentions SET status = 'cancelled'
         WHERE id = $1 RETURNING *`,
        [targetId],
      );
      return mapRow(rows[0]) || null;
    },

    async pruneExpired({ now = new Date() } = {}) {
      const { rowCount } = await pool.query(
        `UPDATE alive_intentions SET status = 'expired'
         WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= $1`,
        [now.toISOString()],
      );
      return rowCount || 0;
    },
  };
}

module.exports = {
  createIntentionQueueStore,
  INTENTION_TYPES,
  INTENTION_STATUSES,
};
