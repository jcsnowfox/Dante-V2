"use strict";

/**
 * needMomentumEngine
 *
 * Homeostasis Runtime 1.1 — Need Momentum.
 *
 * Needs remember their recent history. A connection need declining for
 * three days vs a sudden drop this tick should be addressed differently.
 *
 * Tracks per-need: direction, velocity (EMA of level changes), momentum
 * (how sustained the movement is), recentFulfillments, recentFrustrations.
 *
 * Storage: dante_need_momentum (one row per need per companion+customer)
 * In-memory fallback: scoped map.
 */

const MAX_HISTORY      = 8;    // keep last 8 fulfillments / frustrations
const STABLE_THRESHOLD = 0.01; // velocity below this → "stable"
const VELOCITY_ALPHA   = 0.30; // EMA weight for new observations

function _clamp01(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

function _memKey(companionId, customerId, needType) {
  return `${companionId}:${customerId}:${needType}`;
}

function _defaultMomentum(needType) {
  return {
    needType,
    direction:          "stable",
    velocity:           0,
    momentum:           0,
    recentFulfillments: [],
    recentFrustrations: [],
    lastUpdatedAt:      null,
  };
}

function _computeDirection(velocity) {
  if (velocity > STABLE_THRESHOLD)  return "rising";
  if (velocity < -STABLE_THRESHOLD) return "falling";
  return "stable";
}

function createNeedMomentumEngine({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    const { createPostgresPool } = require("../storage/postgres/createPostgresPool");
    pool = createPostgresPool({ config });
  } catch { pool = null; }

  const _memStore = new Map();

  // ── init ─────────────────────────────────────────────────────────────────

  async function init() {
    if (!pool) return;
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS dante_need_momentum (
  id BIGSERIAL PRIMARY KEY,
  companion_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  need_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'stable',
  velocity NUMERIC(7,5) NOT NULL DEFAULT 0,
  momentum NUMERIC(5,4) NOT NULL DEFAULT 0,
  recent_fulfillments JSONB NOT NULL DEFAULT '[]'::jsonb,
  recent_frustrations JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (companion_id, customer_id, need_type)
)`);
    } catch (err) {
      logger?.warn("[needMomentum] init error", { error: err?.message });
    }
  }

  // ── read ─────────────────────────────────────────────────────────────────

  async function getMomentum({ companionId, customerId, needType }) {
    const key = _memKey(companionId, customerId, needType);
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_need_momentum WHERE companion_id=$1 AND customer_id=$2 AND need_type=$3 LIMIT 1`,
          [companionId, customerId, needType],
        );
        if (rows[0]) return _mapRow(rows[0]);
      } catch { /* fall through */ }
    }
    return _memStore.get(key) ?? _defaultMomentum(needType);
  }

  async function getAllMomentum({ companionId, customerId }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_need_momentum WHERE companion_id=$1 AND customer_id=$2`,
          [companionId, customerId],
        );
        const result = {};
        for (const row of rows) result[row.need_type] = _mapRow(row);
        return result;
      } catch { /* fall through */ }
    }
    // In-memory fallback: scan keys with this companion+customer prefix
    const result = {};
    const prefix = `${companionId}:${customerId}:`;
    for (const [k, v] of _memStore) {
      if (k.startsWith(prefix)) result[v.needType] = v;
    }
    return result;
  }

  function _mapRow(row) {
    return {
      needType:           row.need_type,
      direction:          row.direction || "stable",
      velocity:           parseFloat(row.velocity) || 0,
      momentum:           _clamp01(parseFloat(row.momentum) || 0),
      recentFulfillments: Array.isArray(row.recent_fulfillments) ? row.recent_fulfillments : [],
      recentFrustrations: Array.isArray(row.recent_frustrations) ? row.recent_frustrations : [],
      lastUpdatedAt:      row.last_updated_at ? new Date(row.last_updated_at) : null,
    };
  }

  // ── persist ───────────────────────────────────────────────────────────────

  async function _persist(companionId, customerId, state) {
    _memStore.set(_memKey(companionId, customerId, state.needType), state);
    if (!pool) return state;
    try {
      await pool.query(
        `INSERT INTO dante_need_momentum
          (companion_id, customer_id, need_type, direction, velocity, momentum,
           recent_fulfillments, recent_frustrations, last_updated_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (companion_id, customer_id, need_type) DO UPDATE SET
           direction           = EXCLUDED.direction,
           velocity            = EXCLUDED.velocity,
           momentum            = EXCLUDED.momentum,
           recent_fulfillments = EXCLUDED.recent_fulfillments,
           recent_frustrations = EXCLUDED.recent_frustrations,
           last_updated_at     = EXCLUDED.last_updated_at,
           updated_at          = NOW()`,
        [
          companionId, customerId, state.needType,
          state.direction, state.velocity, state.momentum,
          JSON.stringify(state.recentFulfillments),
          JSON.stringify(state.recentFrustrations),
          state.lastUpdatedAt ?? null,
        ],
      );
    } catch (err) {
      logger?.warn("[needMomentum] persist error", { error: err?.message });
    }
    return state;
  }

  // ── tick — update velocity/direction from level change ────────────────────

  async function tick({ companionId, customerId, needType, currentLevel, prevLevel, now = new Date() } = {}) {
    const state = await getMomentum({ companionId, customerId, needType });
    const delta      = (Number(currentLevel) || 0) - (Number(prevLevel) || 0);
    const newVelocity = state.velocity * (1 - VELOCITY_ALPHA) + delta * VELOCITY_ALPHA;
    const newMomentum = _clamp01(Math.abs(newVelocity) * 10);
    const updated = {
      ...state,
      needType,
      direction:    _computeDirection(newVelocity),
      velocity:     newVelocity,
      momentum:     newMomentum,
      lastUpdatedAt: now,
    };
    return _persist(companionId, customerId, updated);
  }

  // ── recordFulfillment ─────────────────────────────────────────────────────

  async function recordFulfillment({ companionId, customerId, needType, strategy, magnitude = 0, now = new Date() } = {}) {
    const state = await getMomentum({ companionId, customerId, needType });
    const fulfillments = [
      { strategy, magnitude, at: now.toISOString() },
      ...state.recentFulfillments,
    ].slice(0, MAX_HISTORY);
    return _persist(companionId, customerId, { ...state, recentFulfillments: fulfillments, lastUpdatedAt: now });
  }

  // ── recordFrustration ─────────────────────────────────────────────────────

  async function recordFrustration({ companionId, customerId, needType, reason, now = new Date() } = {}) {
    const state = await getMomentum({ companionId, customerId, needType });
    const frustrations = [
      { reason, at: now.toISOString() },
      ...state.recentFrustrations,
    ].slice(0, MAX_HISTORY);
    return _persist(companionId, customerId, { ...state, recentFrustrations: frustrations, lastUpdatedAt: now });
  }

  return {
    init,
    getMomentum,
    getAllMomentum,
    tick,
    recordFulfillment,
    recordFrustration,
    STABLE_THRESHOLD,
  };
}

module.exports = { createNeedMomentumEngine };
