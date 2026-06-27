"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

// Only meaningful moments — NOT every conversation
const MOMENT_TYPES = Object.freeze([
  "milestone",        // first conversation, 100th interaction, etc.
  "creative",         // built something together
  "emotional",        // vulnerable or connecting moment
  "playful",          // funny or light exchange
  "shared_discovery", // found something new together
  "ritual_formed",    // a new ritual emerged
  "recovery",         // repaired after distance or tension
  "celebration",      // marked something special
]);

// Minimum importance threshold for recording
const RECORD_THRESHOLD = 0.4;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_shared_history (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    moment_type TEXT NOT NULL DEFAULT 'milestone',
    summary TEXT NOT NULL DEFAULT '',
    importance NUMERIC(3,2) NOT NULL DEFAULT 0.50,
    emotional_weight NUMERIC(3,2) NOT NULL DEFAULT 0.30,
    participants JSONB NOT NULL DEFAULT '[]',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    linked_project TEXT NOT NULL DEFAULT '',
    linked_hobby TEXT NOT NULL DEFAULT '',
    linked_ritual TEXT NOT NULL DEFAULT '',
    tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS life_shared_history_companion_importance
    ON life_shared_history (companion_id, customer_id, importance DESC, occurred_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:             Number(row.id),
    companionId:    row.companion_id,
    customerId:     row.customer_id,
    momentType:     row.moment_type,
    summary:        row.summary,
    importance:     Number(row.importance),
    emotionalWeight: Number(row.emotional_weight),
    participants:   row.participants ?? [],
    occurredAt:     row.occurred_at,
    linkedProject:  row.linked_project,
    linkedHobby:    row.linked_hobby,
    linkedRitual:   row.linked_ritual,
    tags:           row.tags ?? [],
    createdAt:      row.created_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createSharedHistoryEngine({ config = {}, logger = null } = {}) {
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

  async function recordMoment({
    companionId, customerId,
    momentType = "milestone",
    summary = "",
    importance = 0.5,
    emotionalWeight = 0.3,
    participants = [],
    occurredAt = null,
    linkedProject = "",
    linkedHobby = "",
    linkedRitual = "",
    tags = [],
  }) {
    if (clamp(importance) < RECORD_THRESHOLD) return null;
    const now = occurredAt ? new Date(occurredAt) : new Date();

    if (!pool) {
      const entry = {
        id: _nextId++, companionId, customerId,
        momentType, summary,
        importance: clamp(importance), emotionalWeight: clamp(emotionalWeight),
        participants, occurredAt: now.toISOString(),
        linkedProject, linkedHobby, linkedRitual, tags,
        createdAt: new Date().toISOString(),
      };
      _scope(companionId, customerId).push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_shared_history
           (companion_id, customer_id, moment_type, summary, importance, emotional_weight,
            participants, occurred_at, linked_project, linked_hobby, linked_ritual, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [companionId, customerId, momentType, summary,
         clamp(importance), clamp(emotionalWeight),
         JSON.stringify(participants), now.toISOString(),
         linkedProject, linkedHobby, linkedRitual, JSON.stringify(tags)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[shared-history] recordMoment failed", { error: err?.message });
      return null;
    }
  }

  async function getRecent({ companionId, customerId, limit = 5, minImportance = 0 }) {
    if (!pool) {
      return _scope(companionId, customerId)
        .filter(m => m.importance >= minImportance)
        .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
        .slice(0, limit);
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_shared_history
         WHERE companion_id=$1 AND customer_id=$2 AND importance>=$3
         ORDER BY occurred_at DESC LIMIT $4`,
        [companionId, customerId, minImportance, limit],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function count({ companionId, customerId }) {
    if (!pool) return _scope(companionId, customerId).length;
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM life_shared_history WHERE companion_id=$1 AND customer_id=$2`,
        [companionId, customerId],
      );
      return Number(rows[0]?.count ?? 0);
    } catch { return 0; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 365, keepMinImportance = 0.7 }) {
    if (!pool) {
      const moments = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = moments.length - 1; i >= 0; i--) {
        const m = moments[i];
        if (m.importance >= keepMinImportance) continue;
        if (new Date(m.createdAt).getTime() <= cutoff) {
          moments.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_shared_history
         WHERE companion_id=$1 AND customer_id=$2
           AND importance<$3 AND created_at<=$4`,
        [companionId, customerId, keepMinImportance, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, recordMoment, getRecent, count, pruneOlderThan, MOMENT_TYPES, RECORD_THRESHOLD };
}

module.exports = { createSharedHistoryEngine, MOMENT_TYPES, RECORD_THRESHOLD };
