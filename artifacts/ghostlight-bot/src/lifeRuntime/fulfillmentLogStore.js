"use strict";

/**
 * fulfillmentLogStore
 *
 * Life Runtime 6.0 — Homeostasis Runtime.
 *
 * Persistent evidence log for real fulfillment attempts. Every strategy
 * Dante executes (or explicitly refuses) writes one row here. This is the
 * record that proves fulfillment was real — not a text claim.
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS dante_fulfillment_logs (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    need_type TEXT NOT NULL,
    strategy TEXT NOT NULL,
    action_type TEXT NOT NULL DEFAULT '',
    action_status TEXT NOT NULL DEFAULT 'pending',
    summary TEXT NOT NULL DEFAULT '',
    evidence JSONB NOT NULL DEFAULT '{}',
    need_delta NUMERIC(5,4) NOT NULL DEFAULT 0,
    cost NUMERIC(5,4) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS dante_fulfillment_logs_scope
    ON dante_fulfillment_logs (companion_id, customer_id, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:           Number(row.id),
    companionId:  row.companion_id,
    customerId:   row.customer_id,
    needType:     row.need_type,
    strategy:     row.strategy,
    actionType:   row.action_type,
    actionStatus: row.action_status,
    summary:      row.summary,
    evidence:     row.evidence || {},
    needDelta:    Number(row.need_delta) || 0,
    cost:         Number(row.cost) || 0,
    reason:       row.reason,
    createdAt:    row.created_at ? new Date(row.created_at) : null,
  };
}

function createFulfillmentLogStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    pool = createPostgresPool({ config });
  } catch {
    pool = null;
  }

  const _mem = [];

  async function init() {
    if (!pool) return;
    try {
      await pool.query(CREATE_TABLE_SQL);
    } catch (error) {
      logger?.warn("[fulfillment-log-store] init failed", { error: error?.message });
    }
  }

  async function logFulfillment({ companionId, customerId, needType, strategy, actionType = "", actionStatus = "completed", summary = "", evidence = {}, needDelta = 0, cost = 0, reason = "" } = {}) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO dante_fulfillment_logs
            (companion_id, customer_id, need_type, strategy, action_type, action_status,
             summary, evidence, need_delta, cost, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
           RETURNING *`,
          [
            companionId, customerId, needType, strategy, actionType, actionStatus,
            summary, JSON.stringify(evidence), needDelta, cost, reason,
          ]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[fulfillment-log-store] logFulfillment DB error", { error: error?.message });
      }
    }

    const entry = {
      id:           Date.now(),
      companionId, customerId, needType, strategy, actionType, actionStatus,
      summary, evidence, needDelta, cost, reason,
      createdAt: new Date(),
    };
    _mem.push(entry);
    if (_mem.length > 500) _mem.splice(0, _mem.length - 500);
    return entry;
  }

  async function getRecent({ companionId, customerId, limit = 10, needType = null } = {}) {
    if (pool) {
      try {
        const params = [companionId, customerId, limit];
        const needFilter = needType ? `AND need_type = $4` : "";
        if (needType) params.push(needType);
        const { rows } = await pool.query(
          `SELECT * FROM dante_fulfillment_logs
           WHERE companion_id = $1 AND customer_id = $2 ${needFilter}
           ORDER BY created_at DESC LIMIT $3`,
          params
        );
        return rows.map(mapRow);
      } catch (error) {
        logger?.warn("[fulfillment-log-store] getRecent DB error", { error: error?.message });
      }
    }
    return _mem
      .filter(e => e.companionId === companionId && e.customerId === customerId && (!needType || e.needType === needType))
      .slice(-limit)
      .reverse();
  }

  async function count({ companionId, customerId, since = null } = {}) {
    if (pool) {
      try {
        const params = [companionId, customerId];
        const sinceClause = since ? `AND created_at >= $3` : "";
        if (since) params.push(since);
        const { rows } = await pool.query(
          `SELECT COUNT(*) as n FROM dante_fulfillment_logs
           WHERE companion_id = $1 AND customer_id = $2 ${sinceClause}`,
          params
        );
        return Number(rows[0]?.n) || 0;
      } catch {
        // fall through
      }
    }
    const cutoff = since ? new Date(since).getTime() : 0;
    return _mem.filter(e =>
      e.companionId === companionId &&
      e.customerId  === customerId &&
      (!cutoff || e.createdAt.getTime() >= cutoff)
    ).length;
  }

  async function pruneOlderThan({ companionId, customerId, days = 30 } = {}) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (pool) {
      try {
        const { rowCount } = await pool.query(
          `DELETE FROM dante_fulfillment_logs
           WHERE companion_id = $1 AND customer_id = $2 AND created_at < $3`,
          [companionId, customerId, cutoff]
        );
        return rowCount || 0;
      } catch (error) {
        logger?.warn("[fulfillment-log-store] pruneOlderThan DB error", { error: error?.message });
      }
    }
    let removed = 0;
    for (let i = _mem.length - 1; i >= 0; i--) {
      const e = _mem[i];
      if (e.companionId === companionId && e.customerId === customerId && e.createdAt < cutoff) {
        _mem.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }

  return { init, logFulfillment, getRecent, count, pruneOlderThan };
}

module.exports = { createFulfillmentLogStore };
