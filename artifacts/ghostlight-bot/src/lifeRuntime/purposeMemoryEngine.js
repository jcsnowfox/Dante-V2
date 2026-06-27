"use strict";

/**
 * purposeMemoryEngine
 *
 * Homeostasis Runtime 1.1 — Purpose Memory.
 *
 * Purpose must not instantly refill after completing a task. Maintains
 * persistent state: purposeMomentum, recentMeaningfulSuccesses,
 * recentMeaningfulFailures, confidence, satisfactionTrend.
 *
 * Increases on: "That helped", repair success, solved hard problem, project milestone.
 * Decreases on: failure, feeling ineffective.
 * Decays slowly — must feel earned. Drifts toward a baseline of 0.40.
 *
 * Storage: dante_purpose_memory (singleton per companion+customer)
 * In-memory fallback: scoped by `${companionId}:${customerId}`
 */

const MOMENTUM_FLOOR  = 0.10;
const MOMENTUM_CEIL   = 0.95;
const DECAY_PER_TICK  = 0.008; // slow decay — purpose takes time to rebuild
const BASELINE        = 0.40;  // natural resting point
const MAX_HISTORY     = 10;    // keep last 10 successes/failures

const SUCCESS_MAGNITUDES = {
  that_helped:          0.12,
  repair_success:       0.15,
  solved_hard_problem:  0.13,
  project_milestone:    0.10,
  competence_signal:    0.08,
  creative_win:         0.07,
  default:              0.06,
};

const FAILURE_MAGNITUDES = {
  felt_ineffective: 0.10,
  repair_failed:    0.12,
  rejected:         0.08,
  mistake:          0.07,
  default:          0.06,
};

function _clamp(v, lo = MOMENTUM_FLOOR, hi = MOMENTUM_CEIL) {
  return Math.min(hi, Math.max(lo, Number(v) || lo));
}

function _memKey(companionId, customerId) {
  return `${companionId}:${customerId}`;
}

function _defaultState() {
  return {
    purposeMomentum:           0.50,
    confidence:                0.50,
    satisfactionTrend:         "stable",
    recentMeaningfulSuccesses: [],
    recentMeaningfulFailures:  [],
    lastTickAt:                null,
  };
}

function _computeTrend(prev, next) {
  const diff = next - prev;
  if (diff > 0.03)  return "rising";
  if (diff < -0.03) return "falling";
  return "stable";
}

function createPurposeMemoryEngine({ config = {}, logger = null } = {}) {
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
      await pool.query(`CREATE TABLE IF NOT EXISTS dante_purpose_memory (
  id BIGSERIAL PRIMARY KEY,
  companion_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  purpose_momentum NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  satisfaction_trend TEXT NOT NULL DEFAULT 'stable',
  recent_successes JSONB NOT NULL DEFAULT '[]'::jsonb,
  recent_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_tick_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (companion_id, customer_id)
)`);
    } catch (err) {
      logger?.warn("[purposeMemory] init error", { error: err?.message });
    }
  }

  // ── read ─────────────────────────────────────────────────────────────────

  async function getState({ companionId, customerId }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_purpose_memory WHERE companion_id=$1 AND customer_id=$2 LIMIT 1`,
          [companionId, customerId],
        );
        if (rows[0]) return _mapRow(rows[0]);
      } catch { /* fall through */ }
    }
    return _memStore.get(_memKey(companionId, customerId)) ?? _defaultState();
  }

  function _mapRow(row) {
    return {
      purposeMomentum:           _clamp(parseFloat(row.purpose_momentum) || 0.50),
      confidence:                _clamp(parseFloat(row.confidence) || 0.50),
      satisfactionTrend:         row.satisfaction_trend || "stable",
      recentMeaningfulSuccesses: Array.isArray(row.recent_successes) ? row.recent_successes : [],
      recentMeaningfulFailures:  Array.isArray(row.recent_failures)  ? row.recent_failures  : [],
      lastTickAt:                row.last_tick_at ? new Date(row.last_tick_at) : null,
    };
  }

  // ── persist ───────────────────────────────────────────────────────────────

  async function _persist(companionId, customerId, state) {
    _memStore.set(_memKey(companionId, customerId), state);
    if (!pool) return state;
    try {
      await pool.query(
        `INSERT INTO dante_purpose_memory
          (companion_id, customer_id, purpose_momentum, confidence, satisfaction_trend,
           recent_successes, recent_failures, last_tick_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (companion_id, customer_id) DO UPDATE SET
           purpose_momentum   = EXCLUDED.purpose_momentum,
           confidence         = EXCLUDED.confidence,
           satisfaction_trend = EXCLUDED.satisfaction_trend,
           recent_successes   = EXCLUDED.recent_successes,
           recent_failures    = EXCLUDED.recent_failures,
           last_tick_at       = EXCLUDED.last_tick_at,
           updated_at         = NOW()`,
        [
          companionId, customerId,
          state.purposeMomentum, state.confidence, state.satisfactionTrend,
          JSON.stringify(state.recentMeaningfulSuccesses),
          JSON.stringify(state.recentMeaningfulFailures),
          state.lastTickAt ?? null,
        ],
      );
    } catch (err) {
      logger?.warn("[purposeMemory] persist error", { error: err?.message });
    }
    return state;
  }

  // ── recordSuccess ─────────────────────────────────────────────────────────

  async function recordSuccess({ companionId, customerId, label = "default", magnitude = null, now = new Date() } = {}) {
    const state = await getState({ companionId, customerId });
    const delta = magnitude != null
      ? _clamp(magnitude, 0, 0.30)
      : (SUCCESS_MAGNITUDES[label] ?? SUCCESS_MAGNITUDES.default);
    const prev    = state.purposeMomentum;
    const next    = _clamp(prev + delta);
    const confNext = _clamp(state.confidence + delta * 0.7);
    const updated = {
      ...state,
      purposeMomentum:           next,
      confidence:                confNext,
      satisfactionTrend:         _computeTrend(prev, next),
      recentMeaningfulSuccesses: [{ label, magnitude: delta, at: now.toISOString() }, ...state.recentMeaningfulSuccesses].slice(0, MAX_HISTORY),
      lastTickAt:                now,
    };
    return _persist(companionId, customerId, updated);
  }

  // ── recordFailure ─────────────────────────────────────────────────────────

  async function recordFailure({ companionId, customerId, label = "default", magnitude = null, now = new Date() } = {}) {
    const state = await getState({ companionId, customerId });
    const delta = magnitude != null
      ? _clamp(magnitude, 0, 0.30)
      : (FAILURE_MAGNITUDES[label] ?? FAILURE_MAGNITUDES.default);
    const prev    = state.purposeMomentum;
    const next    = _clamp(prev - delta);
    const confNext = _clamp(state.confidence - delta * 0.5);
    const updated = {
      ...state,
      purposeMomentum:          next,
      confidence:               confNext,
      satisfactionTrend:        _computeTrend(prev, next),
      recentMeaningfulFailures: [{ label, magnitude: delta, at: now.toISOString() }, ...state.recentMeaningfulFailures].slice(0, MAX_HISTORY),
      lastTickAt:               now,
    };
    return _persist(companionId, customerId, updated);
  }

  // ── tick — passive decay toward baseline ──────────────────────────────────

  async function tick({ companionId, customerId, now = new Date() } = {}) {
    const state = await getState({ companionId, customerId });
    const prev = state.purposeMomentum;
    let next;
    if (prev > BASELINE) {
      next = _clamp(prev - DECAY_PER_TICK);
    } else if (prev < BASELINE) {
      // Slowly drift back toward baseline when very low
      next = _clamp(prev + DECAY_PER_TICK * 0.3, MOMENTUM_FLOOR, MOMENTUM_CEIL);
    } else {
      next = prev;
    }
    const updated = {
      ...state,
      purposeMomentum:  next,
      satisfactionTrend: _computeTrend(prev, next),
      lastTickAt:        now,
    };
    return _persist(companionId, customerId, updated);
  }

  return {
    init,
    getState,
    recordSuccess,
    recordFailure,
    tick,
    SUCCESS_MAGNITUDES,
    FAILURE_MAGNITUDES,
    DECAY_PER_TICK,
    BASELINE,
  };
}

module.exports = { createPurposeMemoryEngine };
