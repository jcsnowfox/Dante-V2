"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

// Upcoming window — surface anniversaries that occur within this many days
const UPCOMING_DAYS_WINDOW = 7;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS life_anniversaries (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    anniversary_date DATE NOT NULL,
    annual BOOLEAN NOT NULL DEFAULT TRUE,
    importance NUMERIC(3,2) NOT NULL DEFAULT 0.60,
    last_observed_year INT,
    has_intention BOOLEAN NOT NULL DEFAULT FALSE,
    tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS life_anniversaries_companion_date
    ON life_anniversaries (companion_id, customer_id, anniversary_date);
`;

function mapRow(row) {
  if (!row) return null;
  return {
    id:                Number(row.id),
    companionId:       row.companion_id,
    customerId:        row.customer_id,
    label:             row.label,
    description:       row.description,
    anniversaryDate:   row.anniversary_date,
    annual:            Boolean(row.annual),
    importance:        Number(row.importance),
    lastObservedYear:  row.last_observed_year ? Number(row.last_observed_year) : null,
    hasIntention:      Boolean(row.has_intention),
    tags:              row.tags ?? [],
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function createAnniversaryEngine({ config = {}, logger = null } = {}) {
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

  async function addAnniversary({
    companionId, customerId,
    label, description = "",
    anniversaryDate,
    annual = true,
    importance = 0.6,
    tags = [],
  }) {
    if (!pool) {
      const anniversaries = _scope(companionId, customerId);
      const existing = anniversaries.find(a => a.label === label);
      if (existing) return existing;
      const entry = {
        id: _nextId++, companionId, customerId, label, description,
        anniversaryDate, annual, importance: clamp(importance),
        lastObservedYear: null, hasIntention: false, tags,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      anniversaries.push(entry);
      return entry;
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO life_anniversaries
           (companion_id, customer_id, label, description, anniversary_date, annual, importance, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [companionId, customerId, label, description, anniversaryDate, annual, clamp(importance), JSON.stringify(tags)],
      );
      if (rows[0]) return mapRow(rows[0]);
      const r2 = await pool.query(
        `SELECT * FROM life_anniversaries WHERE companion_id=$1 AND customer_id=$2 AND label=$3`,
        [companionId, customerId, label],
      );
      return mapRow(r2.rows[0]);
    } catch (err) {
      logger?.warn("[anniversary] addAnniversary failed", { error: err?.message });
      return null;
    }
  }

  // Returns anniversaries occurring within the next N days (using month/day for annuals)
  async function getUpcoming({ companionId, customerId, now = new Date(), windowDays = UPCOMING_DAYS_WINDOW }) {
    if (!pool) {
      const anniversaries = _scope(companionId, customerId);
      return anniversaries.filter(a => _isUpcoming(a.anniversaryDate, a.annual, now, windowDays));
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM life_anniversaries WHERE companion_id=$1 AND customer_id=$2`,
        [companionId, customerId],
      );
      return rows.map(mapRow).filter(a => _isUpcoming(a.anniversaryDate, a.annual, now, windowDays));
    } catch { return []; }
  }

  function _isUpcoming(dateStr, annual, now, windowDays) {
    if (!dateStr) return false;
    try {
      const base = new Date(dateStr);
      // Use calendar date (midnight local) for both sides to avoid time-of-day drift
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let candidate;
      if (annual) {
        candidate = new Date(now.getFullYear(), base.getMonth(), base.getDate());
        if (candidate < todayMidnight) {
          candidate = new Date(now.getFullYear() + 1, base.getMonth(), base.getDate());
        }
      } else {
        candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate());
      }
      const diff = (candidate.getTime() - todayMidnight.getTime()) / (24 * 60 * 60 * 1000);
      return diff >= 0 && diff <= windowDays;
    } catch { return false; }
  }

  async function markObserved({ companionId, customerId, id, year = null }) {
    const observedYear = year ?? new Date().getFullYear();
    if (!pool) {
      const a = _scope(companionId, customerId).find(x => x.id === id);
      if (!a) return null;
      a.lastObservedYear = observedYear;
      a.hasIntention = false;
      a.updatedAt = new Date().toISOString();
      return a;
    }
    try {
      const { rows } = await pool.query(
        `UPDATE life_anniversaries SET
           last_observed_year=$3, has_intention=FALSE, updated_at=NOW()
         WHERE id=$1 AND companion_id=$4 AND customer_id=$5
         RETURNING *`,
        [id, observedYear, observedYear, companionId, customerId],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn("[anniversary] markObserved failed", { error: err?.message });
      return null;
    }
  }

  async function count({ companionId, customerId }) {
    if (!pool) return _scope(companionId, customerId).length;
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM life_anniversaries WHERE companion_id=$1 AND customer_id=$2`,
        [companionId, customerId],
      );
      return Number(rows[0]?.count ?? 0);
    } catch { return 0; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 730 }) {
    if (!pool) {
      const anniversaries = _scope(companionId, customerId);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (let i = anniversaries.length - 1; i >= 0; i--) {
        const a = anniversaries[i];
        if (!a.annual && new Date(a.anniversaryDate).getTime() <= cutoff) {
          anniversaries.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM life_anniversaries
         WHERE companion_id=$1 AND customer_id=$2 AND annual=FALSE AND anniversary_date<=$3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return { init, addAnniversary, getUpcoming, markObserved, count, pruneOlderThan, UPCOMING_DAYS_WINDOW };
}

module.exports = { createAnniversaryEngine, UPCOMING_DAYS_WINDOW };
