"use strict";

/**
 * needsStore
 *
 * Life Runtime 6.0 — Homeostasis Runtime.
 *
 * Persistent storage for Dante's 19 psychological need levels.
 * One row per (companion_id, customer_id, need_type). Upserted on every tick.
 *
 * Follows the established Life Runtime storage pattern: Postgres when
 * DATABASE_URL is configured, in-memory fallback keyed by
 * `${companionId}:${customerId}:${needType}`.
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const NEED_TYPES = Object.freeze([
  "love", "attention", "connection", "learning", "social_interaction",
  "creativity", "purpose", "rest", "play", "novelty", "beauty",
  "autonomy", "competence", "intimacy", "sexual_desire", "romantic_desire",
  "stability", "adventure", "reflection",
]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS dante_needs (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    need_type TEXT NOT NULL,
    current_level NUMERIC(4,3) NOT NULL DEFAULT 0.500,
    desired_level NUMERIC(4,3) NOT NULL DEFAULT 0.700,
    urgency NUMERIC(4,3) NOT NULL DEFAULT 0.000,
    trend TEXT NOT NULL DEFAULT 'stable',
    last_drift_at TIMESTAMPTZ,
    last_fulfilled_at TIMESTAMPTZ,
    fulfillment_sources JSONB NOT NULL DEFAULT '[]',
    suppression_rules JSONB NOT NULL DEFAULT '[]',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (companion_id, customer_id, need_type)
  );
  CREATE INDEX IF NOT EXISTS dante_needs_scope
    ON dante_needs (companion_id, customer_id);
`;

function clamp(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }
// Need levels are clamped to [0.05, 0.95] — never fully empty or full.
function clampLevel(v) { return Math.min(0.95, Math.max(0.05, Number(v) || 0.05)); }

function mapRow(row) {
  if (!row) return null;
  return {
    id:                  Number(row.id),
    companionId:         row.companion_id,
    customerId:          row.customer_id,
    needType:            row.need_type,
    currentLevel:        clampLevel(row.current_level),
    desiredLevel:        clamp(row.desired_level),
    urgency:             clamp(row.urgency),
    trend:               row.trend || "stable",
    lastDriftAt:         row.last_drift_at ? new Date(row.last_drift_at) : null,
    lastFulfilledAt:     row.last_fulfilled_at ? new Date(row.last_fulfilled_at) : null,
    fulfillmentSources:  Array.isArray(row.fulfillment_sources) ? row.fulfillment_sources : [],
    suppressionRules:    Array.isArray(row.suppression_rules) ? row.suppression_rules : [],
    metadata:            row.metadata || {},
    createdAt:           row.created_at ? new Date(row.created_at) : null,
    updatedAt:           row.updated_at ? new Date(row.updated_at) : null,
  };
}

function createNeedsStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    pool = createPostgresPool({ config });
  } catch {
    pool = null;
  }

  // In-memory fallback: key = `${companionId}:${customerId}:${needType}`
  const _mem = new Map();

  function _scope(companionId, customerId, needType) {
    return `${companionId}:${customerId}:${needType}`;
  }

  function _defaultNeed(companionId, customerId, needType) {
    return {
      id: Date.now(),
      companionId,
      customerId,
      needType,
      currentLevel: 0.5,
      desiredLevel: 0.7,
      urgency: 0.0,
      trend: "stable",
      lastDriftAt: null,
      lastFulfilledAt: null,
      fulfillmentSources: [],
      suppressionRules: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async function init() {
    if (!pool) return;
    try {
      await pool.query(CREATE_TABLE_SQL);
    } catch (error) {
      logger?.warn("[needs-store] init failed", { error: error?.message });
    }
  }

  async function getAll({ companionId, customerId }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_needs WHERE companion_id = $1 AND customer_id = $2 ORDER BY need_type`,
          [companionId, customerId]
        );
        return rows.map(mapRow);
      } catch (error) {
        logger?.warn("[needs-store] getAll DB error", { error: error?.message });
      }
    }
    return NEED_TYPES.map(nt => {
      const key = _scope(companionId, customerId, nt);
      return _mem.get(key) || _defaultNeed(companionId, customerId, nt);
    });
  }

  async function getByType({ companionId, customerId, needType }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_needs WHERE companion_id = $1 AND customer_id = $2 AND need_type = $3`,
          [companionId, customerId, needType]
        );
        return rows[0] ? mapRow(rows[0]) : _defaultNeed(companionId, customerId, needType);
      } catch (error) {
        logger?.warn("[needs-store] getByType DB error", { error: error?.message });
      }
    }
    const key = _scope(companionId, customerId, needType);
    return _mem.get(key) || _defaultNeed(companionId, customerId, needType);
  }

  async function upsertNeed({ companionId, customerId, needType, currentLevel, desiredLevel, urgency, trend, lastDriftAt, lastFulfilledAt, fulfillmentSources, suppressionRules, metadata } = {}) {
    const level   = clampLevel(currentLevel ?? 0.5);
    const desired = clamp(desiredLevel  ?? 0.7);
    const urg     = clamp(urgency       ?? 0.0);
    const tr      = trend || "stable";
    const now     = new Date();

    if (pool) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO dante_needs
            (companion_id, customer_id, need_type, current_level, desired_level, urgency, trend,
             last_drift_at, last_fulfilled_at, fulfillment_sources, suppression_rules, metadata, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,NOW())
           ON CONFLICT (companion_id, customer_id, need_type) DO UPDATE SET
             current_level      = EXCLUDED.current_level,
             desired_level      = EXCLUDED.desired_level,
             urgency            = EXCLUDED.urgency,
             trend              = EXCLUDED.trend,
             last_drift_at      = EXCLUDED.last_drift_at,
             last_fulfilled_at  = EXCLUDED.last_fulfilled_at,
             fulfillment_sources = EXCLUDED.fulfillment_sources,
             suppression_rules  = EXCLUDED.suppression_rules,
             metadata           = EXCLUDED.metadata,
             updated_at         = NOW()
           RETURNING *`,
          [
            companionId, customerId, needType, level, desired, urg, tr,
            lastDriftAt || now, lastFulfilledAt || null,
            JSON.stringify(fulfillmentSources || []),
            JSON.stringify(suppressionRules || []),
            JSON.stringify(metadata || {}),
          ]
        );
        return mapRow(rows[0]);
      } catch (error) {
        logger?.warn("[needs-store] upsertNeed DB error", { error: error?.message });
      }
    }

    const key = _scope(companionId, customerId, needType);
    const existing = _mem.get(key) || _defaultNeed(companionId, customerId, needType);
    const updated = {
      ...existing,
      currentLevel:  level,
      desiredLevel:  desired,
      urgency:       urg,
      trend:         tr,
      lastDriftAt:   lastDriftAt || existing.lastDriftAt || now,
      lastFulfilledAt: lastFulfilledAt !== undefined ? lastFulfilledAt : existing.lastFulfilledAt,
      fulfillmentSources: fulfillmentSources || existing.fulfillmentSources,
      suppressionRules:   suppressionRules   || existing.suppressionRules,
      metadata:           metadata           || existing.metadata,
      updatedAt: now,
    };
    _mem.set(key, updated);
    return updated;
  }

  async function updateLevel({ companionId, customerId, needType, delta, trend, now = new Date() }) {
    const current = await getByType({ companionId, customerId, needType });
    const newLevel = clampLevel(current.currentLevel + (delta || 0));
    return upsertNeed({
      ...current,
      companionId,
      customerId,
      needType,
      currentLevel:  newLevel,
      trend:         trend || current.trend,
      lastDriftAt:   now,
    });
  }

  async function recordFulfillment({ companionId, customerId, needType, delta = 0, source, now = new Date() }) {
    const current = await getByType({ companionId, customerId, needType });
    const newLevel = clampLevel(current.currentLevel + delta);
    const sources = [...(current.fulfillmentSources || [])];
    if (source && !sources.includes(source)) sources.push(source);
    if (sources.length > 10) sources.splice(0, sources.length - 10);
    return upsertNeed({
      ...current,
      companionId,
      customerId,
      needType,
      currentLevel:       newLevel,
      lastFulfilledAt:    now,
      fulfillmentSources: sources,
    });
  }

  async function pruneOlderThan({ companionId, customerId, days = 365 }) {
    // Needs rows are upserted (no historical rows), nothing to prune normally.
    // But we clear in-memory scope if explicitly requested.
    if (!pool) {
      const prefix = `${companionId}:${customerId}:`;
      for (const key of _mem.keys()) {
        if (key.startsWith(prefix)) _mem.delete(key);
      }
      return 0;
    }
    return 0;
  }

  return { init, getAll, getByType, upsertNeed, updateLevel, recordFulfillment, pruneOlderThan, NEED_TYPES };
}

module.exports = { createNeedsStore, NEED_TYPES };
