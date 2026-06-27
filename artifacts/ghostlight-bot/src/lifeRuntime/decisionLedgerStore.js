"use strict";

// Defensive require — pg may not be available in test environments; in-memory fallback handles that case.
let createPostgresPool = () => null;
try {
  ({ createPostgresPool } = require("../storage/postgres/createPostgresPool"));
} catch { /* pg unavailable — use in-memory fallback */ }

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS affective_decisions (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    decision_type TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'unknown',
    confidence NUMERIC(5,3) NOT NULL DEFAULT 0.5,
    reasons JSONB NOT NULL DEFAULT '[]',
    blocking_reasons JSONB NOT NULL DEFAULT '[]',
    supporting_votes JSONB NOT NULL DEFAULT '[]',
    opposing_votes JSONB NOT NULL DEFAULT '[]',
    chosen_action JSONB,
    source_event_ids JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS affective_decisions_companion_created
    ON affective_decisions (companion_id, customer_id, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    customerId: row.customer_id,
    decision_type: row.decision_type,
    outcome: row.outcome,
    confidence: Number(row.confidence ?? 0.5),
    reasons: Array.isArray(row.reasons) ? row.reasons : (row.reasons || []),
    blocking_reasons: Array.isArray(row.blocking_reasons) ? row.blocking_reasons : (row.blocking_reasons || []),
    supporting_votes: Array.isArray(row.supporting_votes) ? row.supporting_votes : (row.supporting_votes || []),
    opposing_votes: Array.isArray(row.opposing_votes) ? row.opposing_votes : (row.opposing_votes || []),
    chosen_action: row.chosen_action || null,
    source_event_ids: Array.isArray(row.source_event_ids) ? row.source_event_ids : (row.source_event_ids || []),
    created_at: row.created_at,
  };
}

function createDecisionLedgerStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = [];

  async function init() {
    if (!pool) return;
    try {
      await pool.query(CREATE_TABLE_SQL);
    } catch (err) {
      logger?.warn("[affective-ledger] init failed", { error: err?.message });
    }
  }

  async function persist({
    companionId,
    customerId,
    decision_type,
    outcome = "unknown",
    confidence = 0.5,
    reasons = [],
    blocking_reasons = [],
    supporting_votes = [],
    opposing_votes = [],
    chosen_action = null,
    source_event_ids = [],
    created_at,
  }) {
    const safeConf = Math.min(1, Math.max(0, Number(confidence) || 0.5));
    const ts = created_at || new Date().toISOString();

    if (!pool) {
      const entry = {
        id: _mem.length + 1,
        companionId,
        customerId,
        decision_type,
        outcome,
        confidence: safeConf,
        reasons: Array.isArray(reasons) ? reasons : [],
        blocking_reasons: Array.isArray(blocking_reasons) ? blocking_reasons : [],
        supporting_votes: Array.isArray(supporting_votes) ? supporting_votes : [],
        opposing_votes: Array.isArray(opposing_votes) ? opposing_votes : [],
        chosen_action: chosen_action || null,
        source_event_ids: Array.isArray(source_event_ids) ? source_event_ids : [],
        created_at: ts,
      };
      _mem.push(entry);
      return entry;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO affective_decisions
           (companion_id, customer_id, decision_type, outcome, confidence,
            reasons, blocking_reasons, supporting_votes, opposing_votes,
            chosen_action, source_event_ids, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          companionId, customerId, decision_type, outcome, safeConf,
          JSON.stringify(Array.isArray(reasons) ? reasons : []),
          JSON.stringify(Array.isArray(blocking_reasons) ? blocking_reasons : []),
          JSON.stringify(Array.isArray(supporting_votes) ? supporting_votes : []),
          JSON.stringify(Array.isArray(opposing_votes) ? opposing_votes : []),
          chosen_action ? JSON.stringify(chosen_action) : null,
          JSON.stringify(Array.isArray(source_event_ids) ? source_event_ids : []),
          ts,
        ],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[affective-ledger] persist failed", { error: err?.message });
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
        `SELECT * FROM affective_decisions
         WHERE companion_id = $1 AND customer_id = $2
         ORDER BY created_at DESC LIMIT $3`,
        [companionId, customerId, limit],
      );
      return rows.map(mapRow);
    } catch (err) {
      logger?.warn("[affective-ledger] listRecent failed", { error: err?.message });
      return [];
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
        `DELETE FROM affective_decisions
         WHERE companion_id = $1 AND customer_id = $2 AND created_at < $3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch (err) {
      logger?.warn("[affective-ledger] pruneOlderThan failed", { error: err?.message });
      return 0;
    }
  }

  return { init, persist, listRecent, pruneOlderThan, _mem };
}

module.exports = { createDecisionLedgerStore };
