"use strict";

/**
 * fulfillmentHistoryStore
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Rich evidence log for real fulfillment attempts with four-outcome results.
 * Separate from dante_fulfillment_logs (homeostasisRuntime). Records:
 *   - outcome: SUCCESS | PARTIAL | DEFERRED | UNAVAILABLE
 *   - confidence: how certain the outcome is
 *   - evidence: structured proof the action happened
 *   - identity_impact: what this tells Dante about himself
 *   - follow_up: what should happen next
 *
 * Never fabricate SUCCESS. Every SUCCESS must have real evidence.
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const OUTCOMES = Object.freeze(["SUCCESS", "PARTIAL", "DEFERRED", "UNAVAILABLE"]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS dante_fulfillment_history (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    need_type TEXT NOT NULL,
    strategy TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'UNAVAILABLE',
    confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
    evidence JSONB NOT NULL DEFAULT '{}',
    note TEXT NOT NULL DEFAULT '',
    follow_up TEXT NOT NULL DEFAULT '',
    identity_impact TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    need_delta NUMERIC(5,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS dante_fulfillment_history_scope
    ON dante_fulfillment_history (companion_id, customer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS dante_fulfillment_history_need
    ON dante_fulfillment_history (companion_id, customer_id, need_type, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:             Number(row.id),
    companionId:    row.companion_id,
    customerId:     row.customer_id,
    needType:       row.need_type,
    strategy:       row.strategy,
    outcome:        row.outcome,
    confidence:     Number(row.confidence) || 0.5,
    evidence:       row.evidence || {},
    note:           row.note || "",
    followUp:       row.follow_up || "",
    identityImpact: row.identity_impact || "",
    reason:         row.reason || "",
    needDelta:      Number(row.need_delta) || 0,
    createdAt:      row.created_at ? new Date(row.created_at) : null,
  };
}

function createFulfillmentHistoryStore({ config = {}, logger = null } = {}) {
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
      logger?.warn("[fulfillment-history-store] init failed", { error: error?.message });
    }
  }

  async function record({
    companionId, customerId, needType, strategy,
    outcome, confidence = 0.5, evidence = {}, note = "",
    followUp = "", identityImpact = "", reason = "", needDelta = 0,
  } = {}) {
    if (!OUTCOMES.includes(outcome)) {
      logger?.warn("[fulfillment-history-store] invalid outcome", { outcome });
      outcome = "UNAVAILABLE";
    }

    if (pool) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO dante_fulfillment_history
            (companion_id, customer_id, need_type, strategy, outcome, confidence,
             evidence, note, follow_up, identity_impact, reason, need_delta)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)
           RETURNING *`,
          [
            companionId, customerId, needType, strategy, outcome, confidence,
            JSON.stringify(evidence), note, followUp, identityImpact, reason, needDelta,
          ]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[fulfillment-history-store] record DB error", { error: error?.message });
      }
    }

    const entry = {
      id: Date.now(), companionId, customerId, needType, strategy,
      outcome, confidence, evidence, note, followUp, identityImpact, reason, needDelta,
      createdAt: new Date(),
    };
    _mem.push(entry);
    if (_mem.length > 300) _mem.splice(0, _mem.length - 300);
    return entry;
  }

  async function getRecent({ companionId, customerId, limit = 10, needType = null, outcome = null } = {}) {
    if (pool) {
      try {
        const params = [companionId, customerId, limit];
        let where = "";
        if (needType) { params.push(needType); where += ` AND need_type = $${params.length}`; }
        if (outcome)  { params.push(outcome);  where += ` AND outcome = $${params.length}`; }
        const { rows } = await pool.query(
          `SELECT * FROM dante_fulfillment_history
           WHERE companion_id = $1 AND customer_id = $2 ${where}
           ORDER BY created_at DESC LIMIT $3`,
          params
        );
        return rows.map(mapRow);
      } catch (error) {
        logger?.warn("[fulfillment-history-store] getRecent DB error", { error: error?.message });
      }
    }
    return _mem
      .filter(e =>
        e.companionId === companionId && e.customerId === customerId &&
        (!needType || e.needType === needType) &&
        (!outcome  || e.outcome  === outcome)
      )
      .slice(-limit)
      .reverse();
  }

  async function countByOutcome({ companionId, customerId, since = null } = {}) {
    const counts = { SUCCESS: 0, PARTIAL: 0, DEFERRED: 0, UNAVAILABLE: 0 };
    if (pool) {
      try {
        const params = [companionId, customerId];
        const sinceClause = since ? `AND created_at >= $3` : "";
        if (since) params.push(since);
        const { rows } = await pool.query(
          `SELECT outcome, COUNT(*) as n FROM dante_fulfillment_history
           WHERE companion_id = $1 AND customer_id = $2 ${sinceClause}
           GROUP BY outcome`,
          params
        );
        for (const r of rows) { counts[r.outcome] = Number(r.n) || 0; }
        return counts;
      } catch {
        // fall through
      }
    }
    const cutoff = since ? new Date(since).getTime() : 0;
    for (const e of _mem) {
      if (e.companionId !== companionId || e.customerId !== customerId) continue;
      if (cutoff && e.createdAt.getTime() < cutoff) continue;
      if (counts[e.outcome] !== undefined) counts[e.outcome]++;
    }
    return counts;
  }

  async function pruneOlderThan({ companionId, customerId, days = 30 } = {}) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (pool) {
      try {
        const { rowCount } = await pool.query(
          `DELETE FROM dante_fulfillment_history
           WHERE companion_id = $1 AND customer_id = $2 AND created_at < $3`,
          [companionId, customerId, cutoff]
        );
        return rowCount || 0;
      } catch (error) {
        logger?.warn("[fulfillment-history-store] pruneOlderThan DB error", { error: error?.message });
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

  return { init, record, getRecent, countByOutcome, pruneOlderThan, OUTCOMES };
}

module.exports = { createFulfillmentHistoryStore, OUTCOMES };
