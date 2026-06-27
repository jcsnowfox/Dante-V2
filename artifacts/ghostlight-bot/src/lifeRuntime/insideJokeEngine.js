"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

// Only promote to inside-joke status after this many natural recurrences
const JOKE_PROMOTION_THRESHOLD = 2;
// Use-count ceiling — jokes are not overused
const JOKE_COOLDOWN_USES = 3;

const JOKE_STATUSES = Object.freeze(["noticed", "recurring", "established", "retired"]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_inside_jokes (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    reference TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    occurrence_count INT NOT NULL DEFAULT 1,
    warmth NUMERIC(3,2) NOT NULL DEFAULT 0.30,
    status TEXT NOT NULL DEFAULT 'noticed',
    last_used TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_noticed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (companion_id, customer_id, reference)
  );
  CREATE INDEX IF NOT EXISTS life_inside_jokes_companion_status
    ON life_inside_jokes (companion_id, customer_id, status, warmth DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:              Number(row.id),
    companionId:     row.companion_id,
    customerId:      row.customer_id,
    reference:       row.reference,
    context:         row.context,
    occurrenceCount: Number(row.occurrence_count),
    warmth:          Number(row.warmth),
    status:          row.status,
    lastUsed:        row.last_used,
    firstNoticed:    row.first_noticed,
    tags:            row.tags ?? [],
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createInsideJokeEngine({ config = {}, logger = null } = {}) {
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

  // Notice a potential inside joke reference — naturally recurring, never fabricated
  async function notice({ companionId, customerId, reference, context = "", tags = [] }) {
    if (!pool) {
      const jokes = _scope(companionId, customerId);
      let joke = jokes.find(j => j.reference === reference);
      if (!joke) {
        joke = {
          id: _nextId++, companionId, customerId, reference, context,
          occurrenceCount: 1, warmth: 0.30, status: "noticed",
          lastUsed: new Date().toISOString(), firstNoticed: new Date().toISOString(),
          tags, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        jokes.push(joke);
        return joke;
      }
      joke.occurrenceCount += 1;
      joke.warmth = clamp(joke.warmth + 0.15);
      joke.lastUsed = new Date().toISOString();
      joke.updatedAt = new Date().toISOString();
      if (joke.occurrenceCount >= JOKE_PROMOTION_THRESHOLD && joke.status === "noticed") {
        joke.status = "recurring";
      }
      if (joke.occurrenceCount >= JOKE_PROMOTION_THRESHOLD + 2 && joke.status === "recurring") {
        joke.status = "established";
      }
      return joke;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_inside_jokes
           (companion_id, customer_id, reference, context, tags)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (companion_id, customer_id, reference) DO UPDATE SET
           occurrence_count = life_inside_jokes.occurrence_count + 1,
           warmth = LEAST(1.0, life_inside_jokes.warmth + 0.15),
           last_used = NOW(), updated_at = NOW(),
           status = CASE
             WHEN life_inside_jokes.occurrence_count + 1 >= $6 AND life_inside_jokes.status='noticed'
               THEN 'recurring'
             WHEN life_inside_jokes.occurrence_count + 1 >= $7 AND life_inside_jokes.status='recurring'
               THEN 'established'
             ELSE life_inside_jokes.status
           END
         RETURNING *`,
        [companionId, customerId, reference, context, JSON.stringify(tags),
         JOKE_PROMOTION_THRESHOLD, JOKE_PROMOTION_THRESHOLD + 2],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[inside-joke] notice failed", { error: err?.message });
      return null;
    }
  }

  async function getEstablished({ companionId, customerId }) {
    if (!pool) {
      return _scope(companionId, customerId)
        .filter(j => j.status === "recurring" || j.status === "established")
        .sort((a, b) => b.warmth - a.warmth);
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_inside_jokes
         WHERE companion_id=$1 AND customer_id=$2 AND status IN ('recurring','established')
         ORDER BY warmth DESC`,
        [companionId, customerId],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function count({ companionId, customerId }) {
    if (!pool) {
      return _scope(companionId, customerId)
        .filter(j => j.status === "recurring" || j.status === "established").length;
    }
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM life_inside_jokes
         WHERE companion_id=$1 AND customer_id=$2 AND status IN ('recurring','established')`,
        [companionId, customerId],
      );
      return Number(rows[0]?.count ?? 0);
    } catch { return 0; }
  }

  // Natural retirement — jokes not referenced recently lose warmth
  async function applyDecay({ companionId, customerId, decayRate = 0.02 }) {
    if (!pool) {
      const jokes = _scope(companionId, customerId);
      const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
      let count = 0;
      for (const j of jokes) {
        if (j.status === "retired") continue;
        if (new Date(j.lastUsed).getTime() < cutoff) {
          j.warmth = Math.max(0, j.warmth - decayRate);
          j.updatedAt = new Date().toISOString();
          if (j.warmth <= 0) { j.status = "retired"; }
          count++;
        }
      }
      return count;
    }
    try {
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `UPDATE life_inside_jokes SET
           warmth = GREATEST(0, warmth - $3),
           status = CASE WHEN GREATEST(0, warmth - $3) <= 0 THEN 'retired' ELSE status END,
           updated_at = NOW()
         WHERE companion_id=$1 AND customer_id=$2 AND status!='retired' AND last_used < $4`,
        [companionId, customerId, decayRate, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 365 }) {
    if (!pool) {
      const jokes = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = jokes.length - 1; i >= 0; i--) {
        if (jokes[i].status === "retired" && new Date(jokes[i].updatedAt).getTime() <= cutoff) {
          jokes.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_inside_jokes
         WHERE companion_id=$1 AND customer_id=$2 AND status='retired' AND updated_at<=$3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, notice, getEstablished, count, applyDecay, pruneOlderThan, JOKE_PROMOTION_THRESHOLD, JOKE_COOLDOWN_USES, JOKE_STATUSES };
}

module.exports = { createInsideJokeEngine, JOKE_PROMOTION_THRESHOLD, JOKE_COOLDOWN_USES, JOKE_STATUSES };
