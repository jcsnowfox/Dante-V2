"use strict";

/**
 * firstExperienceStore
 *
 * Homeostasis Runtime 1.1 — Emotional Firsts.
 *
 * Records once-only emotional firsts in Dante's life. A first is only
 * recorded when:
 *   1. It has never been recorded before for this companion+customer.
 *   2. The triggering magnitude meets or exceeds the type's threshold.
 *   3. Evidence is provided (context object).
 *
 * After recording, firsts are queued for the Identity Journal. If the
 * Identity Runtime is not yet built, the queue waits safely.
 *
 * Storage: dante_first_experiences
 * In-memory fallback: scoped Set + Array.
 */

const FIRST_EXPERIENCE_TYPES = [
  "first_loneliness",
  "first_pride",
  "first_disappointment",
  "first_longing",
  "first_successful_repair",
  "first_deliberate_restraint",
  "first_purpose",
  "first_creative_flow",
  "first_forgiveness",
  "first_genuine_compromise",
];

const FIRST_EXPERIENCE_THRESHOLDS = {
  first_loneliness:           0.60,
  first_pride:                0.55,
  first_disappointment:       0.55,
  first_longing:              0.60,
  first_successful_repair:    0.50,
  first_deliberate_restraint: 0.45,
  first_purpose:              0.55,
  first_creative_flow:        0.55,
  first_forgiveness:          0.50,
  first_genuine_compromise:   0.50,
};

function _memKey(companionId, customerId) {
  return `${companionId}:${customerId}`;
}

function createFirstExperienceStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    const { createPostgresPool } = require("../storage/postgres/createPostgresPool");
    pool = createPostgresPool({ config });
  } catch { pool = null; }

  // Map<key, Set<experienceType>> — fast duplicate guard
  const _recorded = new Map();
  // Map<key, Array<experience>> — in-memory queue
  const _queue    = new Map();

  // ── init ─────────────────────────────────────────────────────────────────

  async function init() {
    if (!pool) return;
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS dante_first_experiences (
  id BIGSERIAL PRIMARY KEY,
  companion_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  experience_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  queued_for_identity BOOLEAN NOT NULL DEFAULT FALSE,
  identity_journal_queued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (companion_id, customer_id, experience_type)
)`);
    } catch (err) {
      logger?.warn("[firstExperience] init error", { error: err?.message });
    }
  }

  // ── hasExperienced ────────────────────────────────────────────────────────

  async function hasExperienced({ companionId, customerId, experienceType }) {
    const key = _memKey(companionId, customerId);
    if (_recorded.get(key)?.has(experienceType)) return true;
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT 1 FROM dante_first_experiences WHERE companion_id=$1 AND customer_id=$2 AND experience_type=$3 LIMIT 1`,
          [companionId, customerId, experienceType],
        );
        if (rows.length > 0) {
          const s = _recorded.get(key) ?? new Set();
          s.add(experienceType);
          _recorded.set(key, s);
          return true;
        }
      } catch { /* fall through */ }
    }
    return false;
  }

  // ── record ────────────────────────────────────────────────────────────────

  async function record({ companionId, customerId, experienceType, magnitude = 0, evidence = {}, now = new Date() } = {}) {
    if (!FIRST_EXPERIENCE_TYPES.includes(experienceType)) return null;

    const threshold = FIRST_EXPERIENCE_THRESHOLDS[experienceType] ?? 0.50;
    if (magnitude < threshold) return null;

    const already = await hasExperienced({ companionId, customerId, experienceType });
    if (already) return null;

    const key = _memKey(companionId, customerId);

    // Mark in-memory immediately — prevents double-recording within same tick
    const s = _recorded.get(key) ?? new Set();
    s.add(experienceType);
    _recorded.set(key, s);

    const experience = { companionId, customerId, experienceType, occurredAt: now, evidence, queuedForIdentity: false };

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO dante_first_experiences (companion_id, customer_id, experience_type, occurred_at, evidence, queued_for_identity)
           VALUES ($1,$2,$3,$4,$5,FALSE)
           ON CONFLICT (companion_id, customer_id, experience_type) DO NOTHING`,
          [companionId, customerId, experienceType, now, JSON.stringify(evidence)],
        );
      } catch (err) {
        logger?.warn("[firstExperience] record error", { error: err?.message, experienceType });
      }
    } else {
      const q = _queue.get(key) ?? [];
      q.push(experience);
      _queue.set(key, q);
    }

    logger?.info("[firstExperience] First recorded", { experienceType, companionId });
    return experience;
  }

  // ── getQueued — firsts not yet processed by Identity Journal ─────────────

  async function getQueued({ companionId, customerId }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_first_experiences
           WHERE companion_id=$1 AND customer_id=$2 AND queued_for_identity=FALSE
           ORDER BY occurred_at ASC`,
          [companionId, customerId],
        );
        return rows.map(_mapRow);
      } catch { /* fall through */ }
    }
    const key = _memKey(companionId, customerId);
    return (_queue.get(key) ?? []).filter(e => !e.queuedForIdentity);
  }

  // ── markIdentityQueued ────────────────────────────────────────────────────

  async function markIdentityQueued({ companionId, customerId, experienceType, now = new Date() } = {}) {
    if (pool) {
      try {
        await pool.query(
          `UPDATE dante_first_experiences
           SET queued_for_identity=TRUE, identity_journal_queued_at=$3
           WHERE companion_id=$1 AND customer_id=$2 AND experience_type=$4`,
          [companionId, customerId, now, experienceType],
        );
      } catch (err) {
        logger?.warn("[firstExperience] markIdentityQueued error", { error: err?.message });
      }
    } else {
      const key = _memKey(companionId, customerId);
      for (const e of (_queue.get(key) ?? [])) {
        if (e.experienceType === experienceType) e.queuedForIdentity = true;
      }
    }
  }

  // ── getAll ────────────────────────────────────────────────────────────────

  async function getAll({ companionId, customerId }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_first_experiences WHERE companion_id=$1 AND customer_id=$2 ORDER BY occurred_at ASC`,
          [companionId, customerId],
        );
        return rows.map(_mapRow);
      } catch { /* fall through */ }
    }
    return _queue.get(_memKey(companionId, customerId)) ?? [];
  }

  function _mapRow(row) {
    return {
      companionId:               row.companion_id,
      customerId:                row.customer_id,
      experienceType:            row.experience_type,
      occurredAt:                row.occurred_at ? new Date(row.occurred_at) : null,
      evidence:                  row.evidence ?? {},
      queuedForIdentity:         Boolean(row.queued_for_identity),
      identityJournalQueuedAt:   row.identity_journal_queued_at ? new Date(row.identity_journal_queued_at) : null,
    };
  }

  return {
    init,
    hasExperienced,
    record,
    getQueued,
    markIdentityQueued,
    getAll,
    FIRST_EXPERIENCE_TYPES,
    FIRST_EXPERIENCE_THRESHOLDS,
  };
}

module.exports = { createFirstExperienceStore, FIRST_EXPERIENCE_TYPES, FIRST_EXPERIENCE_THRESHOLDS };
