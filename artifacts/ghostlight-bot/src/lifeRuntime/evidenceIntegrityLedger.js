"use strict";

// Defensive require — pg may not be available in test environments.
let createPostgresPool = () => null;
try {
  ({ createPostgresPool } = require("../storage/postgres/createPostgresPool"));
} catch { /* pg unavailable — use in-memory fallback */ }

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS evidence_integrity_events (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    confabulation_type TEXT,
    violations JSONB NOT NULL DEFAULT '[]',
    severity TEXT NOT NULL DEFAULT 'none',
    reply_excerpt TEXT,
    recommended_action TEXT,
    side_effects JSONB NOT NULL DEFAULT '[]',
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS evidence_integrity_events_companion_created
    ON evidence_integrity_events (companion_id, customer_id, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    customerId: row.customer_id,
    event_type: row.event_type,
    confabulation_type: row.confabulation_type || null,
    violations: Array.isArray(row.violations) ? row.violations : (row.violations || []),
    severity: row.severity,
    reply_excerpt: row.reply_excerpt || null,
    recommended_action: row.recommended_action || null,
    side_effects: Array.isArray(row.side_effects) ? row.side_effects : (row.side_effects || []),
    resolved: Boolean(row.resolved),
    created_at: row.created_at,
  };
}

function createEvidenceIntegrityLedger({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = [];

  async function init() {
    if (!pool) return;
    try {
      await pool.query(CREATE_TABLE_SQL);
    } catch (err) {
      logger?.warn("[evidence-integrity-ledger] init failed", { error: err?.message });
    }
  }

  async function record({
    companionId,
    customerId,
    event_type,
    confabulation_type = null,
    violations = [],
    severity = "none",
    reply_excerpt = null,
    recommended_action = null,
    side_effects = [],
    resolved = false,
    created_at,
  }) {
    const ts = created_at || new Date().toISOString();
    const excerpt = reply_excerpt ? String(reply_excerpt).slice(0, 200) : null;

    if (!pool) {
      const entry = {
        id: _mem.length + 1,
        companionId,
        customerId,
        event_type,
        confabulation_type: confabulation_type || null,
        violations: Array.isArray(violations) ? violations : [],
        severity,
        reply_excerpt: excerpt,
        recommended_action: recommended_action || null,
        side_effects: Array.isArray(side_effects) ? side_effects : [],
        resolved: Boolean(resolved),
        created_at: ts,
      };
      _mem.push(entry);
      return entry;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO evidence_integrity_events
           (companion_id, customer_id, event_type, confabulation_type, violations,
            severity, reply_excerpt, recommended_action, side_effects, resolved, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          companionId, customerId, event_type, confabulation_type || null,
          JSON.stringify(Array.isArray(violations) ? violations : []),
          severity, excerpt, recommended_action || null,
          JSON.stringify(Array.isArray(side_effects) ? side_effects : []),
          Boolean(resolved), ts,
        ],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[evidence-integrity-ledger] record failed", { error: err?.message });
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
        `SELECT * FROM evidence_integrity_events
         WHERE companion_id = $1 AND customer_id = $2
         ORDER BY created_at DESC LIMIT $3`,
        [companionId, customerId, limit],
      );
      return rows.map(mapRow);
    } catch (err) {
      logger?.warn("[evidence-integrity-ledger] listRecent failed", { error: err?.message });
      return [];
    }
  }

  async function listUnresolved({ companionId, customerId, limit = 5 } = {}) {
    if (!pool) {
      return _mem
        .filter(e => e.companionId === companionId && e.customerId === customerId && !e.resolved)
        .slice(-Math.abs(limit))
        .reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM evidence_integrity_events
         WHERE companion_id = $1 AND customer_id = $2 AND resolved = FALSE
         ORDER BY created_at DESC LIMIT $3`,
        [companionId, customerId, limit],
      );
      return rows.map(mapRow);
    } catch (err) {
      logger?.warn("[evidence-integrity-ledger] listUnresolved failed", { error: err?.message });
      return [];
    }
  }

  async function markResolved({ companionId, customerId, id }) {
    if (!pool) {
      const entry = _mem.find(e => e.id === id && e.companionId === companionId && e.customerId === customerId);
      if (entry) entry.resolved = true;
      return entry || null;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE evidence_integrity_events SET resolved = TRUE
         WHERE id = $1 AND companion_id = $2 AND customer_id = $3
         RETURNING *`,
        [id, companionId, customerId],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[evidence-integrity-ledger] markResolved failed", { error: err?.message });
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
        `DELETE FROM evidence_integrity_events
         WHERE companion_id = $1 AND customer_id = $2 AND created_at < $3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch (err) {
      logger?.warn("[evidence-integrity-ledger] pruneOlderThan failed", { error: err?.message });
      return 0;
    }
  }

  return { init, record, listRecent, listUnresolved, markResolved, pruneOlderThan, _mem };
}

module.exports = { createEvidenceIntegrityLedger };
