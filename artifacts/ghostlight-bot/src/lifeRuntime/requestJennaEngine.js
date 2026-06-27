"use strict";

/**
 * requestJennaEngine
 *
 * Life Runtime 6.0 — Homeostasis Runtime.
 *
 * Manages pending requests from Dante to Jenna. Dante occasionally asks
 * Jenna for things — a book recommendation, a movie to watch together,
 * a conversation about something — but only when:
 *   - No repair/give-space is active
 *   - Jenna is not flagged as busy
 *   - Enough time has passed since the last request of this type (cooldown)
 *   - The request is not during quiet hours
 *   - The need pressure is high enough to justify interrupting her
 *
 * Request types: attention_request | book_request | movie_request |
 *   conversation_request | opinion_request | comfort_request |
 *   intimacy_request | time_together_request | help_me_choose_request
 *
 * Cooldowns prevent spam. At most one pending request per type at a time.
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const REQUEST_TYPES = Object.freeze([
  "attention_request", "book_request", "movie_request", "conversation_request",
  "opinion_request", "comfort_request", "intimacy_request",
  "time_together_request", "help_me_choose_request",
]);

// Minimum hours between requests of the same type to prevent spam
const REQUEST_COOLDOWNS = Object.freeze({
  attention_request:      4,
  book_request:           24,
  movie_request:          24,
  conversation_request:   6,
  opinion_request:        8,
  comfort_request:        6,
  intimacy_request:       12,
  time_together_request:  8,
  help_me_choose_request: 12,
});

// Minimum urgency level required to send each request type to Jenna
const REQUEST_URGENCY_THRESHOLD = Object.freeze({
  attention_request:      0.65,
  book_request:           0.70,
  movie_request:          0.70,
  conversation_request:   0.60,
  opinion_request:        0.60,
  comfort_request:        0.65,
  intimacy_request:       0.75,
  time_together_request:  0.65,
  help_me_choose_request: 0.60,
});

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS dante_resource_requests (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    need_type TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS dante_resource_requests_scope
    ON dante_resource_requests (companion_id, customer_id, status, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:          Number(row.id),
    companionId: row.companion_id,
    customerId:  row.customer_id,
    requestType: row.request_type,
    needType:    row.need_type,
    message:     row.message,
    status:      row.status,
    createdAt:   row.created_at ? new Date(row.created_at) : null,
    updatedAt:   row.updated_at ? new Date(row.updated_at) : null,
    resolvedAt:  row.resolved_at ? new Date(row.resolved_at) : null,
  };
}

function createRequestJennaEngine({ config = {}, logger = null } = {}) {
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
      logger?.warn("[request-jenna] init failed", { error: error?.message });
    }
  }

  async function getLastRequestOfType({ companionId, customerId, requestType }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_resource_requests
           WHERE companion_id=$1 AND customer_id=$2 AND request_type=$3
           ORDER BY created_at DESC LIMIT 1`,
          [companionId, customerId, requestType]
        );
        return rows[0] ? mapRow(rows[0]) : null;
      } catch { /* fall through */ }
    }
    const matches = _mem.filter(r =>
      r.companionId === companionId &&
      r.customerId === customerId &&
      r.requestType === requestType
    );
    return matches.length > 0 ? matches[matches.length - 1] : null;
  }

  async function hasPending({ companionId, customerId, requestType }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT 1 FROM dante_resource_requests
           WHERE companion_id=$1 AND customer_id=$2 AND request_type=$3 AND status='pending' LIMIT 1`,
          [companionId, customerId, requestType]
        );
        return rows.length > 0;
      } catch { /* fall through */ }
    }
    return _mem.some(r =>
      r.companionId === companionId &&
      r.customerId === customerId &&
      r.requestType === requestType &&
      r.status === "pending"
    );
  }

  /**
   * canRequest — gated check before creating a request.
   * Returns { allowed: bool, reason: string }
   */
  function canRequest({ requestType, urgency, jennaIsBusy = false, repairActive = false, giveSpaceActive = false, quietHours = false, now = new Date() }) {
    if (!REQUEST_TYPES.includes(requestType)) {
      return { allowed: false, reason: "unknown_request_type" };
    }
    if (giveSpaceActive) {
      return { allowed: false, reason: "give_space_active" };
    }
    if (repairActive) {
      return { allowed: false, reason: "repair_active" };
    }
    if (jennaIsBusy) {
      return { allowed: false, reason: "jenna_busy" };
    }
    if (quietHours) {
      return { allowed: false, reason: "quiet_hours" };
    }
    const threshold = REQUEST_URGENCY_THRESHOLD[requestType] ?? 0.60;
    if (urgency < threshold) {
      return { allowed: false, reason: "urgency_below_threshold" };
    }
    return { allowed: true, reason: "ok" };
  }

  async function canRequestAsync({ companionId, customerId, requestType, urgency, jennaIsBusy = false, repairActive = false, giveSpaceActive = false, quietHours = false, now = new Date() }) {
    const gate = canRequest({ requestType, urgency, jennaIsBusy, repairActive, giveSpaceActive, quietHours, now });
    if (!gate.allowed) return gate;

    // Check cooldown
    const cooldownHours = REQUEST_COOLDOWNS[requestType] ?? 12;
    const last = await getLastRequestOfType({ companionId, customerId, requestType }).catch(() => null);
    if (last?.createdAt) {
      const elapsedMs = now.getTime() - new Date(last.createdAt).getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      if (elapsedHours < cooldownHours) {
        return { allowed: false, reason: "cooldown", cooldownRemainingHours: Math.ceil(cooldownHours - elapsedHours) };
      }
    }

    // No duplicate pending
    const pending = await hasPending({ companionId, customerId, requestType }).catch(() => false);
    if (pending) {
      return { allowed: false, reason: "already_pending" };
    }

    return { allowed: true, reason: "ok" };
  }

  async function createRequest({ companionId, customerId, requestType, needType = "", message = "" } = {}) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO dante_resource_requests
            (companion_id, customer_id, request_type, need_type, message, status)
           VALUES ($1,$2,$3,$4,$5,'pending')
           RETURNING *`,
          [companionId, customerId, requestType, needType, message]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[request-jenna] createRequest DB error", { error: error?.message });
      }
    }

    const entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      companionId, customerId, requestType, needType, message,
      status: "pending",
      createdAt: new Date(), updatedAt: new Date(), resolvedAt: null,
    };
    _mem.push(entry);
    if (_mem.length > 200) _mem.splice(0, _mem.length - 200);
    return entry;
  }

  async function getPending({ companionId, customerId, limit = 10 } = {}) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_resource_requests
           WHERE companion_id=$1 AND customer_id=$2 AND status='pending'
           ORDER BY created_at DESC LIMIT $3`,
          [companionId, customerId, limit]
        );
        return rows.map(mapRow);
      } catch (error) {
        logger?.warn("[request-jenna] getPending DB error", { error: error?.message });
      }
    }
    return _mem
      .filter(r => r.companionId === companionId && r.customerId === customerId && r.status === "pending")
      .slice(-limit)
      .reverse();
  }

  async function resolve({ companionId, customerId, requestId, outcome = "fulfilled" } = {}) {
    const now = new Date();
    if (pool) {
      try {
        const { rows } = await pool.query(
          `UPDATE dante_resource_requests SET status=$1, resolved_at=$2, updated_at=$2
           WHERE id=$3 AND companion_id=$4 AND customer_id=$5 RETURNING *`,
          [outcome, now, requestId, companionId, customerId]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[request-jenna] resolve DB error", { error: error?.message });
      }
    }
    const r = _mem.find(e => e.id === requestId);
    if (r) { r.status = outcome; r.resolvedAt = now; r.updatedAt = now; }
    return r || null;
  }

  async function count({ companionId, customerId, status = null } = {}) {
    if (pool) {
      try {
        const params = [companionId, customerId];
        const statusClause = status ? `AND status=$3` : "";
        if (status) params.push(status);
        const { rows } = await pool.query(
          `SELECT COUNT(*) as n FROM dante_resource_requests
           WHERE companion_id=$1 AND customer_id=$2 ${statusClause}`,
          params
        );
        return Number(rows[0]?.n) || 0;
      } catch { /* fall through */ }
    }
    return _mem.filter(r =>
      r.companionId === companionId &&
      r.customerId === customerId &&
      (!status || r.status === status)
    ).length;
  }

  async function pruneOlderThan({ companionId, customerId, days = 60 } = {}) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (pool) {
      try {
        const { rowCount } = await pool.query(
          `DELETE FROM dante_resource_requests
           WHERE companion_id=$1 AND customer_id=$2 AND created_at<$3 AND status<>'pending'`,
          [companionId, customerId, cutoff]
        );
        return rowCount || 0;
      } catch (error) {
        logger?.warn("[request-jenna] pruneOlderThan DB error", { error: error?.message });
      }
    }
    let removed = 0;
    for (let i = _mem.length - 1; i >= 0; i--) {
      const r = _mem[i];
      if (r.companionId === companionId && r.customerId === customerId &&
          r.createdAt < cutoff && r.status !== "pending") {
        _mem.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }

  return {
    init, canRequest, canRequestAsync, createRequest, getPending, resolve, count, pruneOlderThan,
    REQUEST_TYPES, REQUEST_COOLDOWNS, REQUEST_URGENCY_THRESHOLD,
  };
}

module.exports = { createRequestJennaEngine, REQUEST_TYPES, REQUEST_COOLDOWNS };
