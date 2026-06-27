"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const DECISION_TYPES = Object.freeze([
  "act", "wait", "send_voice", "send_image", "remain_silent",
  "repair", "pushback", "give_space", "reach_out", "defer",
]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_decisions (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    decision_type TEXT NOT NULL,
    considered JSONB NOT NULL DEFAULT '[]',
    chosen TEXT NOT NULL DEFAULT '',
    rejected JSONB NOT NULL DEFAULT '[]',
    confidence NUMERIC(4,2) NOT NULL DEFAULT 0.5,
    reason TEXT NOT NULL DEFAULT '',
    context_summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS life_decisions_companion_created
    ON life_decisions (companion_id, customer_id, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    customerId: row.customer_id,
    decisionType: row.decision_type,
    considered: Array.isArray(row.considered) ? row.considered : [],
    chosen: row.chosen,
    rejected: Array.isArray(row.rejected) ? row.rejected : [],
    confidence: Number(row.confidence ?? 0.5),
    reason: row.reason,
    contextSummary: row.context_summary,
    createdAt: row.created_at,
  };
}

function createDecisionEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  // In-memory fallback
  const _mem = [];

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLE_SQL);
  }

  async function decide({
    companionId, customerId,
    decisionType,
    considered = [],
    chosen = "",
    rejected = [],
    confidence = 0.5,
    reason = "",
    contextSummary = "",
  }) {
    const safeConfidence = Math.min(1, Math.max(0, Number(confidence) || 0.5));

    if (!pool) {
      const entry = {
        id: _mem.length + 1, companionId, customerId, decisionType,
        considered, chosen, rejected, confidence: safeConfidence,
        reason, contextSummary, createdAt: new Date().toISOString(),
      };
      _mem.push(entry);
      return entry;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO life_decisions
           (companion_id, customer_id, decision_type, considered, chosen, rejected,
            confidence, reason, context_summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          companionId, customerId, decisionType,
          JSON.stringify(considered), chosen, JSON.stringify(rejected),
          safeConfidence, reason, contextSummary,
        ],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[decision] decide failed", { error: err?.message });
      return null;
    }
  }

  async function listRecent({ companionId, customerId, limit = 10 }) {
    if (!pool) {
      return _mem
        .filter((e) => e.companionId === companionId && e.customerId === customerId)
        .slice(-limit)
        .reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_decisions
         WHERE companion_id = $1 AND customer_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [companionId, customerId, limit],
      );
      return rows.map(mapRow);
    } catch (err) {
      logger?.warn("[decision] listRecent failed", { error: err?.message });
      return [];
    }
  }

  async function pruneOlderThan({ companionId, customerId, days = 7 }) {
    if (!pool) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = _mem.length - 1; i >= 0; i--) {
        if (_mem[i].companionId === companionId && _mem[i].customerId === customerId && new Date(_mem[i].createdAt).getTime() <= cutoff) {
          _mem.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_decisions
         WHERE companion_id = $1 AND customer_id = $2 AND created_at < $3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch (err) {
      logger?.warn("[decision] pruneOlderThan failed", { error: err?.message });
      return 0;
    }
  }

  return { init, decide, listRecent, pruneOlderThan };
}

module.exports = { createDecisionEngine, DECISION_TYPES };
