"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const QUESTION_STATUSES = Object.freeze([
  "open", "maturing", "answered", "converted_to_intention", "dismissed", "expired",
]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_questions (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    question TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'general',
    topic TEXT NOT NULL DEFAULT '',
    emotional_weight NUMERIC(3,2) NOT NULL DEFAULT 0.50,
    curiosity_score NUMERIC(3,2) NOT NULL DEFAULT 0.50,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matures_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS life_questions_companion_status
    ON life_questions (companion_id, customer_id, status, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:              Number(row.id),
    companionId:     row.companion_id,
    customerId:      row.customer_id,
    question:        row.question,
    source:          row.source,
    topic:           row.topic,
    emotionalWeight: Number(row.emotional_weight),
    curiosityScore:  Number(row.curiosity_score),
    status:          row.status,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
    maturesAt:       row.matures_at ?? null,
    expiresAt:       row.expires_at ?? null,
    metadata:        row.metadata ?? {},
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createPrivateQuestionStore({ config = {}, logger = null } = {}) {
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

  async function logQuestion({
    companionId, customerId,
    question,
    source = "general",
    topic = "",
    emotionalWeight = 0.5,
    curiosityScore = 0.5,
    maturesAt = null,
    expiresAt = null,
    metadata = {},
  }) {
    const now = new Date();
    // Repair/emotional: mature in 2 h; others: 24 h
    const maturationHours = (source === "repair" || source === "emotional") ? 2 : 24;
    const resolvedMaturesAt = maturesAt ?? new Date(now.getTime() + maturationHours * 60 * 60 * 1000);
    const resolvedExpiresAt = expiresAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (!pool) {
      const entry = {
        id: _nextId++, companionId, customerId, question, source, topic,
        emotionalWeight: clamp(emotionalWeight),
        curiosityScore: clamp(curiosityScore),
        status: "open",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        maturesAt: resolvedMaturesAt.toISOString(),
        expiresAt: resolvedExpiresAt.toISOString(),
        metadata,
      };
      _scope(companionId, customerId).push(entry);
      return entry;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO life_questions
           (companion_id, customer_id, question, source, topic,
            emotional_weight, curiosity_score, matures_at, expires_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [companionId, customerId, question, source, topic,
         clamp(emotionalWeight), clamp(curiosityScore),
         resolvedMaturesAt.toISOString(), resolvedExpiresAt.toISOString(),
         JSON.stringify(metadata)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[question] logQuestion failed", { error: err?.message });
      return null;
    }
  }

  async function getOpen({ companionId, customerId, limit = 10 }) {
    if (!pool) {
      return _scope(companionId, customerId)
        .filter(q => q.status === "open" || q.status === "maturing")
        .slice(-limit)
        .reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_questions
         WHERE companion_id=$1 AND customer_id=$2
           AND status IN ('open','maturing')
         ORDER BY emotional_weight DESC, created_at DESC
         LIMIT $3`,
        [companionId, customerId, limit],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function advance({ id, companionId, customerId, status }) {
    if (!QUESTION_STATUSES.includes(status)) return null;
    if (!pool) {
      const q = _scope(companionId, customerId).find(x => x.id === id);
      if (!q) return null;
      q.status = status;
      q.updatedAt = new Date().toISOString();
      return q;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE life_questions SET status=$1, updated_at=NOW()
         WHERE id=$2 AND companion_id=$3 AND customer_id=$4
         RETURNING *`,
        [status, id, companionId, customerId],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[question] advance failed", { error: err?.message });
      return null;
    }
  }

  async function count({ companionId, customerId, status = null }) {
    if (!pool) {
      const qs = _scope(companionId, customerId);
      if (status) return qs.filter(q => q.status === status).length;
      return qs.length;
    }
    try {
      const q = status
        ? `SELECT COUNT(*) FROM life_questions WHERE companion_id=$1 AND customer_id=$2 AND status=$3`
        : `SELECT COUNT(*) FROM life_questions WHERE companion_id=$1 AND customer_id=$2`;
      const params = status ? [companionId, customerId, status] : [companionId, customerId];
      const { rows } = await pool.query(q, params);
      return Number(rows[0]?.count ?? 0);
    } catch { return 0; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 14 }) {
    const terminal = ["answered", "converted_to_intention", "dismissed", "expired"];
    if (!pool) {
      const qs = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = qs.length - 1; i >= 0; i--) {
        if (terminal.includes(qs[i].status) && new Date(qs[i].updatedAt).getTime() <= cutoff) {
          qs.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_questions
         WHERE companion_id=$1 AND customer_id=$2
           AND status=ANY($4)
           AND updated_at<=$3`,
        [companionId, customerId, cutoff, terminal],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, logQuestion, getOpen, advance, count, pruneOlderThan };
}

module.exports = { createPrivateQuestionStore, QUESTION_STATUSES };
