"use strict";

/**
 * evidenceStore
 *
 * Life Runtime 8.0 — Fulfillment Runtime.
 *
 * Persists autonomous action evidence as separate, immutable artifacts.
 * Every real action produces an evidence record. Fulfillment history rows
 * reference these records by ID — creating an auditable provenance chain.
 *
 * Table: dante_action_evidence
 *
 * Core law:
 *   "Every autonomous action must leave evidence.
 *    If no evidence exists, the action is treated as if it never happened."
 *
 * Records are append-only. Evidence cannot be modified after writing.
 * The IDs returned here go into fulfillment_history.evidence_ids jsonb.
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const ACTION_TYPES = Object.freeze([
  "web_search",
  "web_article_read",
  "private_reflection",
  "project_work",
  "image_generation",
  "voice_note",
  "second_life_visit",
  "jenna_request",
  "resource_discovery",
  "book_reading",
  "movie_watch",
  "music_listen",
  "course_progress",
  "create_something",
  "conversation_topic",
]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS dante_action_evidence (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    raw_excerpt TEXT NOT NULL DEFAULT '',
    confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS dante_action_evidence_scope
    ON dante_action_evidence (companion_id, customer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS dante_action_evidence_type
    ON dante_action_evidence (companion_id, customer_id, action_type, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:          Number(row.id),
    companionId: row.companion_id,
    customerId:  row.customer_id,
    actionType:  row.action_type,
    source:      row.source      || "",
    sourceUrl:   row.source_url  || "",
    summary:     row.summary     || "",
    rawExcerpt:  row.raw_excerpt || "",
    confidence:  Number(row.confidence) || 0.5,
    metadata:    row.metadata    || {},
    createdAt:   row.created_at ? new Date(row.created_at) : null,
  };
}

function createEvidenceStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    pool = createPostgresPool({ config });
  } catch {
    pool = null;
  }

  const _mem = [];
  let _nextId = 1;

  async function init() {
    if (!pool) return;
    try {
      await pool.query(CREATE_TABLE_SQL);
    } catch (error) {
      logger?.warn("[evidence-store] init failed", { error: error?.message });
    }
  }

  /**
   * record — persist one evidence artifact. Append-only; never modified after write.
   * Returns the persisted record (with id). Returns null if required fields missing.
   */
  async function record({
    companionId, customerId, actionType,
    source = "", sourceUrl = "", summary = "",
    rawExcerpt = "", confidence = 0.5, metadata = {},
  } = {}) {
    if (!companionId || !customerId || !actionType) return null;
    if (!ACTION_TYPES.includes(actionType)) {
      logger?.warn("[evidence-store] unknown actionType — storing as-is", { actionType });
    }

    if (pool) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO dante_action_evidence
            (companion_id, customer_id, action_type, source, source_url,
             summary, raw_excerpt, confidence, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
           RETURNING *`,
          [
            companionId, customerId, actionType, source, sourceUrl,
            summary, rawExcerpt, confidence, JSON.stringify(metadata),
          ]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[evidence-store] record DB error", { error: error?.message });
      }
    }

    const entry = {
      id: _nextId++, companionId, customerId, actionType, source, sourceUrl,
      summary, rawExcerpt, confidence, metadata, createdAt: new Date(),
    };
    _mem.push(entry);
    return entry;
  }

  async function getById(id) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          "SELECT * FROM dante_action_evidence WHERE id = $1", [id]
        );
        return mapRow(rows[0] ?? null);
      } catch { /* fall through */ }
    }
    return _mem.find(e => e.id === id) ?? null;
  }

  async function getByIds(ids = []) {
    if (!Array.isArray(ids) || !ids.length) return [];
    if (pool) {
      try {
        const { rows } = await pool.query(
          "SELECT * FROM dante_action_evidence WHERE id = ANY($1::bigint[])", [ids]
        );
        return rows.map(mapRow);
      } catch { /* fall through */ }
    }
    return _mem.filter(e => ids.includes(e.id));
  }

  async function getRecent({ companionId, customerId, limit = 10, actionType = null } = {}) {
    if (pool) {
      try {
        const params = [companionId, customerId, limit];
        const where = actionType ? ` AND action_type = $${params.length + 1}` : "";
        if (actionType) params.push(actionType);
        const { rows } = await pool.query(
          `SELECT * FROM dante_action_evidence
           WHERE companion_id = $1 AND customer_id = $2 ${where}
           ORDER BY created_at DESC LIMIT $3`,
          params
        );
        return rows.map(mapRow);
      } catch { /* fall through */ }
    }
    return _mem
      .filter(e =>
        e.companionId === companionId && e.customerId === customerId &&
        (!actionType || e.actionType === actionType))
      .slice(-limit)
      .reverse();
  }

  async function countRecent({ companionId, customerId, sinceHours = 24 } = {}) {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT COUNT(*) as n FROM dante_action_evidence
           WHERE companion_id = $1 AND customer_id = $2 AND created_at >= $3`,
          [companionId, customerId, since]
        );
        return Number(rows[0]?.n) || 0;
      } catch { /* fall through */ }
    }
    return _mem.filter(e =>
      e.companionId === companionId && e.customerId === customerId &&
      e.createdAt >= since
    ).length;
  }

  async function pruneOlderThan({ companionId, customerId, days = 90 } = {}) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    if (pool) {
      try {
        const { rowCount } = await pool.query(
          `DELETE FROM dante_action_evidence
           WHERE companion_id = $1 AND customer_id = $2 AND created_at < $3`,
          [companionId, customerId, cutoff]
        );
        return rowCount || 0;
      } catch { /* fall through */ }
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

  return { init, record, getById, getByIds, getRecent, countRecent, pruneOlderThan };
}

module.exports = { createEvidenceStore, ACTION_TYPES };
