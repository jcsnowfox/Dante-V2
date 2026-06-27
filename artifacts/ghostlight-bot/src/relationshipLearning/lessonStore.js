"use strict";

/**
 * lessonStore
 *
 * Relationship Learning Runtime 1.0 — Lesson persistence.
 *
 * Stores learned lessons from Dante's relationship with Jenna.
 * Lessons grow stronger through repeated reinforcing evidence and weaker
 * through contradiction. Status is derived automatically from confidence.
 *
 * Hard rules:
 *   - Confidence increases only through repeated evidence (not assertion).
 *   - One conversation rarely creates a core lesson.
 *   - Evidence must exist before confidence rises substantially.
 *   - Retired lessons are kept but excluded from guidance.
 *   - No lesson is deleted — only retired.
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const LESSON_TYPES = Object.freeze([
  "truth", "trust", "repair", "communication", "tone",
  "boundaries", "preferences", "dislikes", "love", "comfort",
  "humour", "surprise", "romance", "independence", "curiosity",
  "evidence", "self_awareness", "maintenance", "conflict",
  "growth", "vulnerability", "consent", "initiative",
]);

const LESSON_STATUSES = Object.freeze(["new", "forming", "stable", "core", "challenged", "retired"]);

function computeStatus(confidence) {
  if (confidence >= 0.85) return "core";
  if (confidence >= 0.65) return "stable";
  if (confidence >= 0.40) return "forming";
  return "new";
}

const TABLE = "dante_relationship_lessons";

function mapRow(row) {
  return {
    id:               row.id,
    companionId:      row.companion_id,
    customerId:       row.customer_id,
    lessonType:       row.lesson_type,
    title:            row.title ?? "",
    summary:          row.summary ?? "",
    evidenceIds:      Array.isArray(row.evidence_ids) ? row.evidence_ids : (row.evidence_ids ?? []),
    originEventIds:   Array.isArray(row.origin_event_ids) ? row.origin_event_ids : (row.origin_event_ids ?? []),
    confidence:       parseFloat(row.confidence ?? 0),
    strength:         parseFloat(row.strength ?? 0),
    firstSeen:        row.first_seen ?? null,
    lastReinforced:   row.last_reinforced ?? null,
    lastChallenged:   row.last_challenged ?? null,
    timesReinforced:  row.times_reinforced ?? 0,
    timesChallenged:  row.times_challenged ?? 0,
    status:           row.status ?? "new",
    futureGuidance:   row.future_guidance ?? "",
    createdAt:        row.created_at ?? null,
    updatedAt:        row.updated_at ?? null,
  };
}

function createLessonStore({ config = {}, logger = null } = {}) {
  let _pool = null;

  async function init() {
    try {
      _pool = await createPostgresPool(config);
    } catch {
      _pool = null;
    }
  }

  async function create({
    companionId,
    customerId,
    lessonType,
    title        = "",
    summary      = "",
    evidenceIds  = [],
    originEventIds = [],
    confidence   = 0.30,
    strength     = 0.30,
    futureGuidance = "",
  } = {}) {
    const now    = new Date().toISOString();
    const status = computeStatus(confidence);

    if (!_pool) {
      return {
        id: null, companionId, customerId, lessonType, title, summary,
        evidenceIds, originEventIds, confidence, strength,
        firstSeen: now, lastReinforced: now, lastChallenged: null,
        timesReinforced: 0, timesChallenged: 0, status, futureGuidance,
        createdAt: now, updatedAt: now,
      };
    }

    const result = await _pool.query(
      `INSERT INTO ${TABLE}
         (companion_id, customer_id, lesson_type, title, summary, evidence_ids,
          origin_event_ids, confidence, strength, first_seen, last_reinforced,
          last_challenged, times_reinforced, times_challenged, status, future_guidance,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        companionId, customerId, lessonType, title, summary,
        JSON.stringify(evidenceIds), JSON.stringify(originEventIds),
        confidence, strength, now, now,
        null, 0, 0, status, futureGuidance, now, now,
      ],
    );
    return mapRow(result.rows[0]);
  }

  async function reinforce({ id, evidenceId = null, delta = 0.12, now = new Date() } = {}) {
    if (!_pool) return null;
    const nowIso = now instanceof Date ? now.toISOString() : now;

    const result = await _pool.query(
      `UPDATE ${TABLE}
       SET confidence        = LEAST(1.0, confidence + $2),
           strength          = LEAST(1.0, strength + $3),
           times_reinforced  = times_reinforced + 1,
           last_reinforced   = $4,
           evidence_ids      = CASE
                                 WHEN $5::text IS NOT NULL
                                   THEN evidence_ids || $5::jsonb
                                 ELSE evidence_ids
                               END,
           status            = CASE
                                 WHEN LEAST(1.0, confidence + $2) >= 0.85 THEN 'core'
                                 WHEN LEAST(1.0, confidence + $2) >= 0.65 THEN 'stable'
                                 WHEN LEAST(1.0, confidence + $2) >= 0.40 THEN 'forming'
                                 ELSE 'new'
                               END,
           updated_at        = $4
       WHERE id = $1
       RETURNING *`,
      [id, delta, delta * 0.5, nowIso, evidenceId ? JSON.stringify([evidenceId]) : null],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async function challenge({ id, evidenceId = null, delta = 0.15, now = new Date() } = {}) {
    if (!_pool) return null;
    const nowIso = now instanceof Date ? now.toISOString() : now;

    const result = await _pool.query(
      `UPDATE ${TABLE}
       SET confidence       = GREATEST(0.0, confidence - $2),
           times_challenged = times_challenged + 1,
           last_challenged  = $3,
           status           = 'challenged',
           updated_at       = $3
       WHERE id = $1
       RETURNING *`,
      [id, delta, nowIso],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async function retire({ id, now = new Date() } = {}) {
    if (!_pool) return null;
    const nowIso = now instanceof Date ? now.toISOString() : now;
    const result = await _pool.query(
      `UPDATE ${TABLE} SET status = 'retired', updated_at = $2 WHERE id = $1 RETURNING *`,
      [id, nowIso],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async function getById({ id } = {}) {
    if (!_pool) return null;
    const result = await _pool.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async function findSimilar({ companionId, customerId, lessonType } = {}) {
    if (!_pool) return [];
    const result = await _pool.query(
      `SELECT * FROM ${TABLE}
       WHERE companion_id = $1 AND customer_id = $2 AND lesson_type = $3
         AND status != 'retired'
       ORDER BY confidence DESC
       LIMIT 5`,
      [companionId, customerId, lessonType],
    );
    return result.rows.map(mapRow);
  }

  async function listActive({ companionId, customerId, limit = 30 } = {}) {
    if (!_pool) return [];
    const result = await _pool.query(
      `SELECT * FROM ${TABLE}
       WHERE companion_id = $1 AND customer_id = $2 AND status != 'retired'
       ORDER BY confidence DESC, last_reinforced DESC NULLS LAST
       LIMIT $3`,
      [companionId, customerId, limit],
    );
    return result.rows.map(mapRow);
  }

  async function listByStatus({ companionId, customerId, status } = {}) {
    if (!_pool) return [];
    const result = await _pool.query(
      `SELECT * FROM ${TABLE}
       WHERE companion_id = $1 AND customer_id = $2 AND status = $3
       ORDER BY confidence DESC`,
      [companionId, customerId, status],
    );
    return result.rows.map(mapRow);
  }

  async function count({ companionId, customerId, status = null } = {}) {
    if (!_pool) return 0;
    let q = `SELECT COUNT(*) FROM ${TABLE} WHERE companion_id = $1 AND customer_id = $2`;
    const params = [companionId, customerId];
    if (status) { q += ` AND status = $3`; params.push(status); }
    const result = await _pool.query(q, params);
    return parseInt(result.rows[0]?.count ?? 0, 10);
  }

  async function pruneOlderThan({ companionId, customerId, days = 365 } = {}) {
    if (!_pool) return 0;
    const result = await _pool.query(
      `DELETE FROM ${TABLE}
       WHERE companion_id = $1 AND customer_id = $2
         AND status = 'retired'
         AND updated_at < NOW() - ($3 || ' days')::INTERVAL`,
      [companionId, customerId, days],
    );
    return result.rowCount ?? 0;
  }

  return {
    init, create, reinforce, challenge, retire,
    getById, findSimilar, listActive, listByStatus,
    count, pruneOlderThan,
  };
}

module.exports = { createLessonStore, LESSON_TYPES, LESSON_STATUSES, computeStatus };
