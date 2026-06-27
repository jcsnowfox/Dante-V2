"use strict";

/**
 * pendingRequestStore
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Tracks requests Dante would like to make to Jenna — resource recommendations,
 * help with learning goals, activity suggestions. These are real, queued
 * requests — not fabricated.
 *
 * Rules (hard law):
 *   - Never guilt-trip Jenna
 *   - Never spam — one pending request per needType per cooldown window
 *   - Respect give-space: no requests while give-space is active
 *   - Respect repair: no requests while repair is required and not started
 *   - Respect quiet hours: checked by canExecute gate before create() is called
 *   - Respect cooldowns: listRecent() + caller checks
 *
 * Table: dante_pending_resource_requests
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const REQUEST_TYPES  = Object.freeze(["ask_resource", "ask_help", "share_discovery", "ask_activity"]);
const REQUEST_STATUSES = Object.freeze(["pending", "fulfilled", "cancelled", "expired"]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS dante_pending_resource_requests (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    request_type TEXT NOT NULL DEFAULT 'ask_resource',
    need_type TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS dante_pending_resource_requests_scope
    ON dante_pending_resource_requests (companion_id, customer_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS dante_pending_resource_requests_need
    ON dante_pending_resource_requests (companion_id, customer_id, need_type, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:          Number(row.id),
    companionId: row.companion_id,
    customerId:  row.customer_id,
    requestType: row.request_type,
    needType:    row.need_type     || "",
    message:     row.message       || "",
    status:      row.status,
    createdAt:   row.created_at  ? new Date(row.created_at)  : null,
    updatedAt:   row.updated_at  ? new Date(row.updated_at)  : null,
    resolvedAt:  row.resolved_at ? new Date(row.resolved_at) : null,
  };
}

function createPendingRequestStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    pool = createPostgresPool({ config });
  } catch {
    pool = null;
  }

  const _mem  = [];
  let _nextId = 1;

  async function init() {
    if (!pool) return;
    try {
      await pool.query(CREATE_TABLE_SQL);
    } catch (error) {
      logger?.warn("[pending-request-store] init failed", { error: error?.message });
    }
  }

  async function create({
    companionId, customerId,
    requestType = "ask_resource",
    needType = "", message = "",
  } = {}) {
    if (!companionId || !customerId) return null;
    const safeType = REQUEST_TYPES.includes(requestType) ? requestType : "ask_resource";

    if (pool) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO dante_pending_resource_requests
            (companion_id, customer_id, request_type, need_type, message)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING *`,
          [companionId, customerId, safeType, needType, message]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[pending-request-store] create DB error", { error: error?.message });
      }
    }

    const entry = {
      id: _nextId++, companionId, customerId,
      requestType: safeType, needType, message,
      status: "pending",
      createdAt: new Date(), updatedAt: new Date(), resolvedAt: null,
    };
    _mem.push(entry);
    return entry;
  }

  async function listRecent({
    companionId, customerId, needType = null, sinceHours = 24, status = null,
  } = {}) {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    if (pool) {
      try {
        const params = [companionId, customerId, since];
        let where = "";
        if (needType) { params.push(needType); where += ` AND need_type = $${params.length}`; }
        if (status)   { params.push(status);   where += ` AND status = $${params.length}`; }
        const { rows } = await pool.query(
          `SELECT * FROM dante_pending_resource_requests
           WHERE companion_id = $1 AND customer_id = $2 AND created_at >= $3 ${where}
           ORDER BY created_at DESC`,
          params
        );
        return rows.map(mapRow);
      } catch (error) {
        logger?.warn("[pending-request-store] listRecent DB error", { error: error?.message });
      }
    }

    return _mem.filter(e =>
      e.companionId === companionId && e.customerId === customerId &&
      e.createdAt >= since &&
      (!needType || e.needType === needType) &&
      (!status   || e.status   === status)
    );
  }

  async function listPending({ companionId, customerId, limit = 10 } = {}) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_pending_resource_requests
           WHERE companion_id = $1 AND customer_id = $2 AND status = 'pending'
           ORDER BY created_at DESC LIMIT $3`,
          [companionId, customerId, limit]
        );
        return rows.map(mapRow);
      } catch (error) {
        logger?.warn("[pending-request-store] listPending DB error", { error: error?.message });
      }
    }
    return _mem
      .filter(e => e.companionId === companionId && e.customerId === customerId && e.status === "pending")
      .slice(-limit)
      .reverse();
  }

  async function updateStatus({ id, status, resolvedAt = null } = {}) {
    const safeStatus = REQUEST_STATUSES.includes(status) ? status : "pending";
    const now = new Date();

    if (pool) {
      try {
        const params = [safeStatus, now];
        let resolvedClause = "";
        if (resolvedAt !== null) { params.push(resolvedAt); resolvedClause = `, resolved_at = $${params.length}`; }
        params.push(id);
        const { rows } = await pool.query(
          `UPDATE dante_pending_resource_requests
           SET status = $1, updated_at = $2 ${resolvedClause}
           WHERE id = $${params.length}
           RETURNING *`,
          params
        );
        return mapRow(rows[0] ?? null);
      } catch (error) {
        logger?.warn("[pending-request-store] updateStatus DB error", { error: error?.message });
      }
    }

    const entry = _mem.find(e => e.id === id);
    if (!entry) return null;
    entry.status    = safeStatus;
    entry.updatedAt = now;
    if (resolvedAt !== null) entry.resolvedAt = resolvedAt;
    return mapRow(entry);
  }

  async function count({ companionId, customerId, status = null } = {}) {
    if (pool) {
      try {
        const params = [companionId, customerId];
        const where  = status ? `AND status = $3` : "";
        if (status) params.push(status);
        const { rows } = await pool.query(
          `SELECT COUNT(*) as n FROM dante_pending_resource_requests
           WHERE companion_id = $1 AND customer_id = $2 ${where}`,
          params
        );
        return Number(rows[0]?.n) || 0;
      } catch { /* fall through */ }
    }
    return _mem.filter(e =>
      e.companionId === companionId && e.customerId === customerId &&
      (!status || e.status === status)
    ).length;
  }

  async function expireOldPending({ companionId, customerId, olderThanHours = 72 } = {}) {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    if (pool) {
      try {
        const { rowCount } = await pool.query(
          `UPDATE dante_pending_resource_requests
           SET status = 'expired', updated_at = NOW()
           WHERE companion_id = $1 AND customer_id = $2
             AND status = 'pending' AND created_at < $3`,
          [companionId, customerId, cutoff]
        );
        return rowCount || 0;
      } catch { /* fall through */ }
    }
    let updated = 0;
    for (const e of _mem) {
      if (e.companionId === companionId && e.customerId === customerId &&
          e.status === "pending" && e.createdAt < cutoff) {
        e.status = "expired";
        e.updatedAt = new Date();
        updated++;
      }
    }
    return updated;
  }

  return { init, create, listRecent, listPending, updateStatus, count, expireOldPending };
}

module.exports = { createPendingRequestStore, REQUEST_TYPES, REQUEST_STATUSES };
