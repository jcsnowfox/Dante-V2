"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_events (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'activity',
    description TEXT NOT NULL DEFAULT '',
    mood_effect NUMERIC(4,2) NOT NULL DEFAULT 0,
    energy_effect NUMERIC(4,2) NOT NULL DEFAULT 0,
    private BOOLEAN NOT NULL DEFAULT TRUE,
    tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS life_events_companion_created
    ON life_events (companion_id, customer_id, created_at DESC);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    customerId: row.customer_id,
    eventType: row.event_type,
    description: row.description,
    moodEffect: Number(row.mood_effect || 0),
    energyEffect: Number(row.energy_effect || 0),
    private: Boolean(row.private),
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
  };
}

function createMicroLifeEventsStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  // In-memory fallback when no DATABASE_URL
  const _mem = [];

  async function init() {
    if (!pool) return;
    await pool.query(CREATE_TABLE_SQL);
  }

  async function logEvent({
    companionId, customerId,
    eventType = "activity",
    description = "",
    moodEffect = 0,
    energyEffect = 0,
    isPrivate = true,
    tags = [],
  }) {
    if (!pool) {
      const entry = { id: _mem.length + 1, companionId, customerId, eventType, description, moodEffect, energyEffect, private: isPrivate, tags, createdAt: new Date().toISOString() };
      _mem.push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_events
           (companion_id, customer_id, event_type, description, mood_effect, energy_effect, private, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [companionId, customerId, eventType, description, moodEffect, energyEffect, isPrivate, JSON.stringify(tags)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[life-events] logEvent failed", { error: err?.message });
      return null;
    }
  }

  async function listRecent({ companionId, customerId, limit = 5, includePublic = false }) {
    if (!pool) {
      return _mem
        .filter((e) => e.companionId === companionId && e.customerId === customerId && (includePublic || e.private))
        .slice(-limit)
        .reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_events
         WHERE companion_id = $1 AND customer_id = $2
           AND ($3 OR private = TRUE)
         ORDER BY created_at DESC
         LIMIT $4`,
        [companionId, customerId, includePublic, limit],
      );
      return rows.map(mapRow);
    } catch (err) {
      logger?.warn("[life-events] listRecent failed", { error: err?.message });
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
        `DELETE FROM life_events
         WHERE companion_id = $1 AND customer_id = $2 AND created_at < $3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch (err) {
      logger?.warn("[life-events] pruneOlderThan failed", { error: err?.message });
      return 0;
    }
  }

  async function count({ companionId, customerId }) {
    if (!pool) {
      return _mem.filter((e) => e.companionId === companionId && e.customerId === customerId).length;
    }
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS n FROM life_events WHERE companion_id = $1 AND customer_id = $2`,
        [companionId, customerId],
      );
      return Number(rows[0]?.n || 0);
    } catch {
      return 0;
    }
  }

  return { init, logEvent, listRecent, pruneOlderThan, count };
}

module.exports = { createMicroLifeEventsStore };
