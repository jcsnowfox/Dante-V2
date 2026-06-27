"use strict";

/**
 * identityBeliefStore
 *
 * Stores what Dante currently thinks ("I think...").
 * Beliefs can be wrong. They update with evidence, not pressure.
 *
 * Each belief has: confidence (0–1), memories of what shaped it,
 * contradictions that haven't been resolved, revision history, and source.
 *
 * Changing mind requires evidence, not repeated prompting.
 * When uncertain: "I don't know yet" / "I need more evidence."
 *
 * Storage: dante_identity_beliefs
 * In-memory fallback: _memStore Map
 */

const MAX_MEMORIES       = 15;
const MAX_REVISIONS      = 15;
const MAX_CONTRADICTIONS = 10;

function createIdentityBeliefStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    const { createPostgresPool } = require("../storage/postgres/createPostgresPool");
    pool = createPostgresPool({ config });
  } catch { pool = null; }

  const _memStore = new Map();

  function _key(companionId, customerId, beliefKey) {
    return `${companionId}:${customerId}:${beliefKey}`;
  }

  function _defaultBelief(beliefKey, statement, source) {
    return {
      beliefKey,
      statement:       statement || beliefKey,
      confidence:      0.50,
      memories:        [],
      contradictions:  [],
      revisionHistory: [],
      source:          source || "reflection",
      createdAt:       new Date().toISOString(),
    };
  }

  function _mapRow(row) {
    return {
      beliefKey:       row.belief_key,
      statement:       row.statement,
      confidence:      parseFloat(row.confidence) || 0.50,
      memories:        Array.isArray(row.memories)         ? row.memories         : [],
      contradictions:  Array.isArray(row.contradictions)   ? row.contradictions   : [],
      revisionHistory: Array.isArray(row.revision_history) ? row.revision_history : [],
      source:          row.source || "reflection",
      createdAt:       row.created_at ? new Date(row.created_at).toISOString() : null,
    };
  }

  async function init() {
    if (!pool) return;
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS dante_identity_beliefs (
  id BIGSERIAL PRIMARY KEY,
  companion_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  belief_key TEXT NOT NULL,
  statement TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  memories JSONB NOT NULL DEFAULT '[]'::jsonb,
  contradictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'reflection',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (companion_id, customer_id, belief_key)
)`);
    } catch (err) {
      logger?.warn("[identityBeliefs] init error", { error: err?.message });
    }
  }

  async function getBelief({ companionId, customerId, beliefKey }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_beliefs WHERE companion_id=$1 AND customer_id=$2 AND belief_key=$3 LIMIT 1`,
          [companionId, customerId, beliefKey],
        );
        if (rows[0]) return _mapRow(rows[0]);
      } catch { /* fall through */ }
    }
    return _memStore.get(_key(companionId, customerId, beliefKey)) ?? null;
  }

  async function getBeliefs({ companionId, customerId }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_beliefs WHERE companion_id=$1 AND customer_id=$2 ORDER BY confidence DESC`,
          [companionId, customerId],
        );
        return rows.map(_mapRow);
      } catch { /* fall through */ }
    }
    const prefix = `${companionId}:${customerId}:`;
    const results = [];
    for (const [k, v] of _memStore) {
      if (k.startsWith(prefix)) results.push(v);
    }
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  async function addBelief({ companionId, customerId, beliefKey, statement, source = "reflection", confidence = 0.50, at = new Date() }) {
    const existing = await getBelief({ companionId, customerId, beliefKey });
    if (existing) return existing;

    const atStr = at instanceof Date ? at.toISOString() : at;
    const data  = _defaultBelief(beliefKey, statement, source);
    data.confidence = Math.min(0.95, Math.max(0.05, confidence));
    data.createdAt  = atStr;
    await _persist({ companionId, customerId, data });
    return data;
  }

  async function reviseBelief({ companionId, customerId, beliefKey, update = null, evidence, delta = 0.06, direction = "reinforce", at = new Date() }) {
    const existing = await getBelief({ companionId, customerId, beliefKey });
    if (!existing) return null;

    const atStr         = at instanceof Date ? at.toISOString() : at;
    const prevConfidence = existing.confidence;
    const sign           = direction === "reinforce" ? 1 : -1;
    const newConfidence  = Math.min(0.95, Math.max(0.05, existing.confidence + sign * delta));

    const memory     = { at: atStr, event: evidence, impact: direction === "reinforce" ? "reinforced" : "challenged" };
    const newMemories = [memory, ...existing.memories].slice(0, MAX_MEMORIES);

    const revision   = { at: atStr, from: prevConfidence, to: newConfidence, reason: evidence, evidence };
    const newRevisions = [revision, ...existing.revisionHistory].slice(0, MAX_REVISIONS);

    let newContradictions = existing.contradictions;
    if (direction === "challenge") {
      newContradictions = [{ at: atStr, summary: evidence }, ...existing.contradictions].slice(0, MAX_CONTRADICTIONS);
    }

    const updated = {
      ...existing,
      statement:       update || existing.statement,
      confidence:      newConfidence,
      memories:        newMemories,
      contradictions:  newContradictions,
      revisionHistory: newRevisions,
    };

    await _persist({ companionId, customerId, data: updated });
    return updated;
  }

  async function _persist({ companionId, customerId, data }) {
    _memStore.set(_key(companionId, customerId, data.beliefKey), data);
    if (!pool) return;
    try {
      await pool.query(`
INSERT INTO dante_identity_beliefs
  (companion_id, customer_id, belief_key, statement, confidence, memories,
   contradictions, revision_history, source, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
ON CONFLICT (companion_id, customer_id, belief_key) DO UPDATE SET
  statement        = EXCLUDED.statement,
  confidence       = EXCLUDED.confidence,
  memories         = EXCLUDED.memories,
  contradictions   = EXCLUDED.contradictions,
  revision_history = EXCLUDED.revision_history,
  source           = EXCLUDED.source,
  updated_at       = NOW()
      `, [
        companionId, customerId, data.beliefKey, data.statement,
        data.confidence,
        JSON.stringify(data.memories),
        JSON.stringify(data.contradictions),
        JSON.stringify(data.revisionHistory),
        data.source,
      ]);
    } catch (err) {
      logger?.warn("[identityBeliefs] persist error", { error: err?.message });
    }
  }

  return { init, getBelief, getBeliefs, addBelief, reviseBelief };
}

module.exports = { createIdentityBeliefStore };
