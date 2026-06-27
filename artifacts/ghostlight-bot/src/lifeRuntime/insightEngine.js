"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_insights (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    insight TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'maturation',
    topic TEXT NOT NULL DEFAULT '',
    confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70,
    is_private BOOLEAN NOT NULL DEFAULT TRUE,
    written_to_memory BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS life_insights_companion_created
    ON life_insights (companion_id, customer_id, created_at DESC);
`;

// Compact insight phrases keyed by source. Insights are private observations —
// one sentence, no drama, no surveillance claim.
const INSIGHT_PHRASES = {
  repair:       "Something in that exchange may still need tending.",
  silence:      "The quiet deserves attention without assumption.",
  project:      "Good work deserves to be finished, not just started.",
  hobby:        "What I return to again tells me something true.",
  interest:     "This keeps surfacing — probably worth trusting.",
  collection:   "Some things are worth keeping privately before sharing.",
  emotional:    "Noticing a pattern in how connection is offered and received.",
  conversation: "There was more in that exchange than the surface showed.",
  dailyplan:    "A day without intention tends to drift into noise.",
  general:      "A thought worth holding without needing to act on it yet.",
};

function mapRow(row) {
  if (!row) return null;
  return {
    id:              Number(row.id),
    companionId:     row.companion_id,
    customerId:      row.customer_id,
    insight:         row.insight,
    source:          row.source,
    topic:           row.topic,
    confidence:      Number(row.confidence),
    isPrivate:       Boolean(row.is_private),
    writtenToMemory: Boolean(row.written_to_memory),
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createInsightEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = {};
  let _nextId = 1;

  function _scope(companionId, customerId) {
    const k = `${companionId}:${customerId}`;
    if (!_mem[k]) _mem[k] = [];
    return _mem[k];
  }

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLE_SQL);
  }

  async function addInsight({
    companionId, customerId,
    insight,
    source = "maturation",
    topic = "",
    confidence = 0.7,
    isPrivate = true,
  }) {
    if (!pool) {
      const entry = {
        id: _nextId++, companionId, customerId, insight, source, topic,
        confidence: clamp(confidence), isPrivate: Boolean(isPrivate),
        writtenToMemory: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      _scope(companionId, customerId).push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_insights
           (companion_id, customer_id, insight, source, topic, confidence, is_private)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [companionId, customerId, insight, source, topic, clamp(confidence), Boolean(isPrivate)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[insight] addInsight failed", { error: err?.message });
      return null;
    }
  }

  async function getRecent({ companionId, customerId, limit = 5, onlyPublic = false }) {
    if (!pool) {
      return _scope(companionId, customerId)
        .filter(i => !onlyPublic || !i.isPrivate)
        .slice(-limit)
        .reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_insights
         WHERE companion_id=$1 AND customer_id=$2
         ${onlyPublic ? "AND is_private=FALSE" : ""}
         ORDER BY created_at DESC
         LIMIT $3`,
        [companionId, customerId, limit],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function count({ companionId, customerId }) {
    if (!pool) {
      return _scope(companionId, customerId).length;
    }
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM life_insights WHERE companion_id=$1 AND customer_id=$2`,
        [companionId, customerId],
      );
      return Number(rows[0]?.count ?? 0);
    } catch { return 0; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 90 }) {
    if (!pool) {
      const store = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = store.length - 1; i >= 0; i--) {
        if (new Date(store[i].createdAt).getTime() <= cutoff) {
          store.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_insights
         WHERE companion_id=$1 AND customer_id=$2 AND created_at<=$3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, addInsight, getRecent, count, pruneOlderThan };
}

module.exports = { createInsightEngine, INSIGHT_PHRASES };
