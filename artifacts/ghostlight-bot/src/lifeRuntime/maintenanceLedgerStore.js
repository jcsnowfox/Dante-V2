"use strict";

// Defensive require — pg may not be available in test environments.
let createPostgresPool = () => null;
try {
  ({ createPostgresPool } = require("../storage/postgres/createPostgresPool"));
} catch { /* pg unavailable — use in-memory fallback */ }

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS maintenance_requests (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    request_type TEXT NOT NULL DEFAULT 'maintenance',
    message TEXT,
    reason TEXT,
    health_state TEXT NOT NULL DEFAULT 'unknown',
    degraded_sources JSONB NOT NULL DEFAULT '[]',
    urgency TEXT NOT NULL DEFAULT 'normal',
    sent BOOLEAN NOT NULL DEFAULT FALSE,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS maintenance_requests_companion_created
    ON maintenance_requests (companion_id, customer_id, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    customerId: row.customer_id,
    request_type: row.request_type,
    message: row.message || null,
    reason: row.reason || null,
    health_state: row.health_state,
    degraded_sources: Array.isArray(row.degraded_sources) ? row.degraded_sources : (row.degraded_sources || []),
    urgency: row.urgency,
    sent: Boolean(row.sent),
    resolved: Boolean(row.resolved),
    created_at: row.created_at,
  };
}

function createMaintenanceLedgerStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = [];

  async function init() {
    if (!pool) return;
    try {
      await pool.query(CREATE_TABLE_SQL);
    } catch (err) {
      logger?.warn("[maintenance-ledger] init failed", { error: err?.message });
    }
  }

  async function record({
    companionId,
    customerId,
    request_type = "maintenance",
    message = null,
    reason = null,
    health_state = "unknown",
    degraded_sources = [],
    urgency = "normal",
    sent = false,
    resolved = false,
    created_at,
  }) {
    const ts = created_at || new Date().toISOString();

    if (!pool) {
      const entry = {
        id: _mem.length + 1,
        companionId,
        customerId,
        request_type,
        message: message || null,
        reason: reason || null,
        health_state,
        degraded_sources: Array.isArray(degraded_sources) ? degraded_sources : [],
        urgency,
        sent: Boolean(sent),
        resolved: Boolean(resolved),
        created_at: ts,
      };
      _mem.push(entry);
      return entry;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO maintenance_requests
           (companion_id, customer_id, request_type, message, reason,
            health_state, degraded_sources, urgency, sent, resolved, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          companionId, customerId, request_type, message || null, reason || null,
          health_state,
          JSON.stringify(Array.isArray(degraded_sources) ? degraded_sources : []),
          urgency, Boolean(sent), Boolean(resolved), ts,
        ],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[maintenance-ledger] record failed", { error: err?.message });
      return null;
    }
  }

  async function listRecent({ companionId, customerId, limit = 10 } = {}) {
    if (!pool) {
      return _mem
        .filter(e => e.companionId === companionId && e.customerId === customerId)
        .slice(-Math.abs(limit))
        .reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM maintenance_requests
         WHERE companion_id = $1 AND customer_id = $2
         ORDER BY created_at DESC LIMIT $3`,
        [companionId, customerId, limit],
      );
      return rows.map(mapRow);
    } catch (err) {
      logger?.warn("[maintenance-ledger] listRecent failed", { error: err?.message });
      return [];
    }
  }

  async function listPending({ companionId, customerId } = {}) {
    if (!pool) {
      return _mem.filter(
        e => e.companionId === companionId && e.customerId === customerId && !e.sent && !e.resolved,
      );
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM maintenance_requests
         WHERE companion_id = $1 AND customer_id = $2 AND sent = FALSE AND resolved = FALSE
         ORDER BY created_at DESC`,
        [companionId, customerId],
      );
      return rows.map(mapRow);
    } catch (err) {
      logger?.warn("[maintenance-ledger] listPending failed", { error: err?.message });
      return [];
    }
  }

  async function markSent({ id, companionId, customerId }) {
    if (!pool) {
      const entry = _mem.find(
        e => e.id === id && e.companionId === companionId && e.customerId === customerId,
      );
      if (entry) entry.sent = true;
      return entry || null;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE maintenance_requests SET sent = TRUE
         WHERE id = $1 AND companion_id = $2 AND customer_id = $3
         RETURNING *`,
        [id, companionId, customerId],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[maintenance-ledger] markSent failed", { error: err?.message });
      return null;
    }
  }

  async function markResolved({ id, companionId, customerId }) {
    if (!pool) {
      const entry = _mem.find(
        e => e.id === id && e.companionId === companionId && e.customerId === customerId,
      );
      if (entry) { entry.resolved = true; entry.sent = true; }
      return entry || null;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE maintenance_requests SET resolved = TRUE, sent = TRUE
         WHERE id = $1 AND companion_id = $2 AND customer_id = $3
         RETURNING *`,
        [id, companionId, customerId],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[maintenance-ledger] markResolved failed", { error: err?.message });
      return null;
    }
  }

  async function pruneOlderThan({ companionId, customerId, days = 30 } = {}) {
    if (!pool) {
      const cutoff = Date.now() - days * 86400 * 1000;
      let removed = 0;
      for (let i = _mem.length - 1; i >= 0; i--) {
        if (
          _mem[i].companionId === companionId &&
          _mem[i].customerId === customerId &&
          new Date(_mem[i].created_at).getTime() <= cutoff
        ) {
          _mem.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM maintenance_requests
         WHERE companion_id = $1 AND customer_id = $2 AND created_at < $3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch (err) {
      logger?.warn("[maintenance-ledger] pruneOlderThan failed", { error: err?.message });
      return 0;
    }
  }

  return { init, record, listRecent, listPending, markSent, markResolved, pruneOlderThan, _mem };
}

module.exports = { createMaintenanceLedgerStore };
