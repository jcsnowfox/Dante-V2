"use strict";

/**
 * alive/aliveEventsStore
 *
 * Append-only audit log for the Dante Alive Layer. Every presence change,
 * intention lifecycle event, reach-out decision, repair, and error is written
 * here so the admin UI can render the "clockwork" in real time and so the
 * scheduler can enforce per-day caps by counting today's events.
 *
 * Follows the standard Ghostlight storage pattern: try to build a Postgres
 * pool from config; if DATABASE_URL is not set, fall back to an in-memory
 * store so unit tests and DB-less deployments still work. Schema is migrated
 * inline in init() — no external migration files.
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const SUPPORTED_EVENT_TYPES = Object.freeze([
  "presence_update",
  "intention_created",
  "intention_completed",
  "reachout_sent",
  "reachout_suppressed",
  "repair_started",
  "repair_completed",
  "voice_note_sent",
  "image_sent",
  "pushback_triggered",
  "error",
]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS alive_events (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    decision TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS alive_events_scope_idx ON alive_events (companion_id, customer_id, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS alive_events_type_idx ON alive_events (companion_id, customer_id, event_type, created_at DESC);",
];

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    customerId: row.customer_id,
    eventType: row.event_type,
    reason: row.reason || "",
    decision: row.decision || "",
    payload: row.payload || {},
    createdAt: row.created_at,
  };
}

function startOfTodayUtc(now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function createMemoryEventsStore() {
  const rows = [];
  let id = 1;
  return {
    available: true,
    async init() {},
    async logEvent({ companionId, customerId, eventType, reason = "", decision = "", payload = {} } = {}) {
      const row = {
        id: id++,
        companion_id: companionId,
        customer_id: customerId,
        event_type: eventType,
        reason: reason || "",
        decision: decision || "",
        payload: payload || {},
        created_at: new Date().toISOString(),
      };
      rows.push(row);
      return mapRow(row);
    },
    async listRecent({ companionId, customerId, limit = 20, eventType = "" } = {}) {
      return rows
        .filter((r) => (!companionId || r.companion_id === companionId)
          && (!customerId || r.customer_id === customerId)
          && (!eventType || r.event_type === eventType))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, Math.min(Number(limit) || 20, 200))
        .map(mapRow);
    },
    async countTodayByType({ companionId, customerId, eventType, now = new Date() } = {}) {
      const since = startOfTodayUtc(now).getTime();
      return rows.filter((r) => r.companion_id === companionId
        && r.customer_id === customerId
        && r.event_type === eventType
        && new Date(r.created_at).getTime() >= since).length;
    },
  };
}

function createAliveEventsStore({ pool: providedPool, config, logger } = {}) {
  let pool = providedPool || null;
  if (!pool) {
    try {
      pool = createPostgresPool({ config });
    } catch {
      pool = null;
    }
  }

  if (!pool) {
    return createMemoryEventsStore();
  }

  return {
    available: true,

    async init() {
      await pool.query(CREATE_TABLE_SQL);
      for (const sql of CREATE_INDEXES_SQL) {
        await pool.query(sql);
      }
      logger?.info?.("[alive-events] storage initialised", { provider: "postgres" });
    },

    async logEvent({ companionId, customerId, eventType, reason = "", decision = "", payload = {} } = {}) {
      if (!companionId || !customerId || !eventType) return null;
      const { rows } = await pool.query(
        `INSERT INTO alive_events (companion_id, customer_id, event_type, reason, decision, payload)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [companionId, customerId, eventType, reason || "", decision || "", JSON.stringify(payload || {})],
      );
      return mapRow(rows[0]);
    },

    async listRecent({ companionId, customerId, limit = 20, eventType = "" } = {}) {
      const values = [companionId, customerId];
      const clauses = ["companion_id = $1", "customer_id = $2"];
      if (eventType) {
        values.push(eventType);
        clauses.push(`event_type = $${values.length}`);
      }
      values.push(Math.min(Number(limit) || 20, 200));
      const { rows } = await pool.query(
        `SELECT * FROM alive_events WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length}`,
        values,
      );
      return rows.map(mapRow);
    },

    async countTodayByType({ companionId, customerId, eventType, now = new Date() } = {}) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM alive_events
         WHERE companion_id = $1 AND customer_id = $2 AND event_type = $3
           AND created_at >= $4`,
        [companionId, customerId, eventType, startOfTodayUtc(now).toISOString()],
      );
      return Number(rows[0]?.count) || 0;
    },
  };
}

module.exports = {
  createAliveEventsStore,
  SUPPORTED_EVENT_TYPES,
};
