"use strict";

/**
 * consequenceStore
 *
 * Life Runtime 5.0 — Relational Consequences.
 *
 * Persistent storage for emotionally meaningful events between Dante and Jenna.
 * Each row is a "fingerprint" — a consequence that should keep shaping Dante's
 * inner life and behaviour until it is resolved, not snap back to normal.
 *
 * Follows the established Life Runtime storage pattern: a real Postgres pool
 * when DATABASE_URL is configured, otherwise an in-memory fallback scoped by
 * `${companionId}:${customerId}`.
 *
 * Resolution rules (enforced here, never by accident):
 *   - "active" means resolved_at IS NULL.
 *   - Minor / positive consequences carry an expires_at and fade by timeout.
 *   - Major consequences carry NO expires_at — they never auto-resolve.
 *   - Repair-required consequences only gain an expires_at once repair is
 *     completed (a short grace window), so they resolve gradually, never
 *     instantly and never silently.
 */

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

// Hours a minor (non-repair) consequence lingers before fading by timeout.
const MINOR_TTL_HOURS = 12;
// Hours a positive consequence (affection, promise kept, victory) lingers.
const POSITIVE_TTL_HOURS = 24;
// Grace window after repair_completed before a consequence resolves — this is
// what makes repair resolve *gradually* rather than the instant it is accepted.
const REPAIR_GRACE_HOURS = 12;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS relationship_consequences (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'moderate',
    source TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    emotional_weight NUMERIC(3,2) NOT NULL DEFAULT 0.50,
    repair_required BOOLEAN NOT NULL DEFAULT FALSE,
    repair_started BOOLEAN NOT NULL DEFAULT FALSE,
    repair_completed BOOLEAN NOT NULL DEFAULT FALSE,
    trust_delta NUMERIC(4,3) NOT NULL DEFAULT 0,
    comfort_delta NUMERIC(4,3) NOT NULL DEFAULT 0,
    playfulness_delta NUMERIC(4,3) NOT NULL DEFAULT 0,
    distance_delta NUMERIC(4,3) NOT NULL DEFAULT 0,
    attention_bias TEXT,
    suppression_rules JSONB NOT NULL DEFAULT '[]',
    expires_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS relationship_consequences_active
    ON relationship_consequences (companion_id, customer_id, resolved_at);
`;

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function clamp(v) { return Math.min(1, Math.max(0, num(v, 0))); }

function mapRow(row) {
  if (!row) return null;
  return {
    id:               Number(row.id),
    companionId:      row.companion_id,
    customerId:       row.customer_id,
    eventType:        row.event_type,
    severity:         row.severity,
    source:           row.source,
    summary:          row.summary,
    emotionalWeight:  num(row.emotional_weight),
    repairRequired:   Boolean(row.repair_required),
    repairStarted:    Boolean(row.repair_started),
    repairCompleted:  Boolean(row.repair_completed),
    trustDelta:       num(row.trust_delta),
    comfortDelta:     num(row.comfort_delta),
    playfulnessDelta: num(row.playfulness_delta),
    distanceDelta:    num(row.distance_delta),
    attentionBias:    row.attention_bias ?? null,
    suppressionRules: row.suppression_rules ?? [],
    expiresAt:        row.expires_at ?? null,
    resolvedAt:       row.resolved_at ?? null,
    metadata:         row.metadata ?? {},
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

function _toIso(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function createConsequenceStore({ config = {}, logger = null } = {}) {
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

  async function create({
    companionId, customerId,
    eventType,
    severity = "moderate",
    source = "",
    summary = "",
    emotionalWeight = 0.5,
    repairRequired = false,
    trustDelta = 0,
    comfortDelta = 0,
    playfulnessDelta = 0,
    distanceDelta = 0,
    attentionBias = null,
    suppressionRules = [],
    expiresAt = null,
    metadata = {},
    now = new Date(),
  }) {
    const nowIso = _toIso(now);
    const expIso = _toIso(expiresAt);

    if (!pool) {
      const entry = {
        id: _nextId++, companionId, customerId, eventType, severity, source, summary,
        emotionalWeight: clamp(emotionalWeight),
        repairRequired: Boolean(repairRequired),
        repairStarted: false, repairCompleted: false,
        trustDelta: num(trustDelta), comfortDelta: num(comfortDelta),
        playfulnessDelta: num(playfulnessDelta), distanceDelta: num(distanceDelta),
        attentionBias: attentionBias ?? null,
        suppressionRules: Array.isArray(suppressionRules) ? suppressionRules : [],
        expiresAt: expIso, resolvedAt: null,
        metadata: metadata && typeof metadata === "object" ? { ...metadata } : {},
        createdAt: nowIso, updatedAt: nowIso,
      };
      _scope(companionId, customerId).push(entry);
      return { ...entry };
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO relationship_consequences
           (companion_id, customer_id, event_type, severity, source, summary,
            emotional_weight, repair_required, trust_delta, comfort_delta,
            playfulness_delta, distance_delta, attention_bias, suppression_rules,
            expires_at, metadata, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
         RETURNING *`,
        [companionId, customerId, eventType, severity, source, summary,
         clamp(emotionalWeight), Boolean(repairRequired), num(trustDelta), num(comfortDelta),
         num(playfulnessDelta), num(distanceDelta), attentionBias,
         JSON.stringify(Array.isArray(suppressionRules) ? suppressionRules : []),
         expIso, JSON.stringify(metadata || {}), nowIso],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn?.("[consequence-store] create failed", { error: err?.message });
      return null;
    }
  }

  // Active = unresolved. Expiry is a deliberate resolution step (see expireStale),
  // not an implicit exclusion — so nothing slips out of view without being resolved.
  async function getActive({ companionId, customerId }) {
    if (!pool) {
      return _scope(companionId, customerId)
        .filter(c => !c.resolvedAt)
        .map(c => ({ ...c }));
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM relationship_consequences
         WHERE companion_id=$1 AND customer_id=$2 AND resolved_at IS NULL
         ORDER BY created_at DESC`,
        [companionId, customerId],
      );
      return rows.map(mapRow);
    } catch { return []; }
  }

  async function getById({ companionId, customerId, id }) {
    if (!pool) {
      const found = _scope(companionId, customerId).find(c => c.id === id);
      return found ? { ...found } : null;
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM relationship_consequences WHERE id=$1 AND companion_id=$2 AND customer_id=$3`,
        [id, companionId, customerId],
      );
      return mapRow(rows[0]);
    } catch { return null; }
  }

  async function _patchMem(companionId, customerId, id, patch) {
    const found = _scope(companionId, customerId).find(c => c.id === id);
    if (!found) return null;
    Object.assign(found, patch, { updatedAt: _toIso(patch.now || new Date()) });
    delete found.now;
    return { ...found };
  }

  async function markRepairStarted({ companionId, customerId, id, now = new Date() }) {
    if (!pool) return _patchMem(companionId, customerId, id, { repairStarted: true, now });
    try {
      const { rows } = await pool.query(
        `UPDATE relationship_consequences
           SET repair_started=TRUE, updated_at=$4
         WHERE id=$1 AND companion_id=$2 AND customer_id=$3
         RETURNING *`,
        [id, companionId, customerId, _toIso(now)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn?.("[consequence-store] markRepairStarted failed", { error: err?.message });
      return null;
    }
  }

  // Repair completed begins a grace window (expires_at) — it does NOT resolve
  // the consequence immediately. Resolution comes later, gradually.
  async function markRepairCompleted({ companionId, customerId, id, now = new Date(), graceHours = REPAIR_GRACE_HOURS }) {
    const expiresAt = new Date(_toMs(now) + graceHours * 3600 * 1000);
    if (!pool) {
      return _patchMem(companionId, customerId, id, {
        repairStarted: true, repairCompleted: true, expiresAt: _toIso(expiresAt), now,
      });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE relationship_consequences
           SET repair_started=TRUE, repair_completed=TRUE, expires_at=$4, updated_at=$5
         WHERE id=$1 AND companion_id=$2 AND customer_id=$3
         RETURNING *`,
        [id, companionId, customerId, _toIso(expiresAt), _toIso(now)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn?.("[consequence-store] markRepairCompleted failed", { error: err?.message });
      return null;
    }
  }

  async function update({ companionId, customerId, id, patch = {}, now = new Date() }) {
    if (!pool) {
      return _patchMem(companionId, customerId, id, { ...patch, now });
    }
    const cols = [];
    const vals = [];
    let i = 4;
    const map = {
      emotionalWeight: "emotional_weight", repairRequired: "repair_required",
      repairStarted: "repair_started", repairCompleted: "repair_completed",
      attentionBias: "attention_bias", expiresAt: "expires_at", summary: "summary",
      metadata: "metadata",
    };
    for (const [k, v] of Object.entries(patch)) {
      const col = map[k];
      if (!col) continue;
      cols.push(`${col}=$${i++}`);
      if (k === "expiresAt") vals.push(_toIso(v));
      else if (k === "metadata") vals.push(JSON.stringify(v || {}));
      else vals.push(v);
    }
    if (!cols.length) return getById({ companionId, customerId, id });
    try {
      const { rows } = await pool.query(
        `UPDATE relationship_consequences SET ${cols.join(", ")}, updated_at=$${i}
         WHERE id=$1 AND companion_id=$2 AND customer_id=$3 RETURNING *`,
        [id, companionId, customerId, ...vals, _toIso(now)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn?.("[consequence-store] update failed", { error: err?.message });
      return null;
    }
  }

  /**
   * patchMetadata — the structurally-safe way to write consequence metadata.
   *
   * `metadata` is a shared JSONB column with partitioned ownership: the
   * relational engine owns keys like giveSpace / positive / positiveSignals,
   * while repairPersistence owns the repairFollowUp sub-document. Because a raw
   * `update({ metadata })` replaces the whole column, every writer previously
   * had to remember to spread `{ ...c.metadata, ... }` by hand — one forgetful
   * caller could clobber another owner's keys.
   *
   * patchMetadata removes that footgun: it re-reads the current row and merges
   * only the keys the caller passes, so a writer can set the keys it owns and
   * can never drop keys it doesn't. Callers pass bare keys, never the full map.
   */
  async function patchMetadata({ companionId, customerId, id, patch = {}, now = new Date() }) {
    const current = await getById({ companionId, customerId, id });
    const base = current && current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    return update({ companionId, customerId, id, patch: { metadata: { ...base, ...patch } }, now });
  }

  async function resolve({ companionId, customerId, id, now = new Date() }) {
    if (!pool) return _patchMem(companionId, customerId, id, { resolvedAt: _toIso(now), now });
    try {
      const { rows } = await pool.query(
        `UPDATE relationship_consequences
           SET resolved_at=$4, updated_at=$4
         WHERE id=$1 AND companion_id=$2 AND customer_id=$3 AND resolved_at IS NULL
         RETURNING *`,
        [id, companionId, customerId, _toIso(now)],
      );
      return mapRow(rows[0]);
    } catch (err) {
      logger?.warn?.("[consequence-store] resolve failed", { error: err?.message });
      return null;
    }
  }

  /**
   * expireStale — resolves only what is SAFE to resolve by timeout:
   *   - never a major consequence (major requires explicit repair),
   *   - never an unresolved repair-required consequence unless repair is
   *     completed (then its grace window may lapse → gradual resolution).
   * Returns the number of consequences resolved.
   */
  async function expireStale({ companionId, customerId, now = new Date() }) {
    const nowMs = _toMs(now);
    if (!pool) {
      let resolved = 0;
      for (const c of _scope(companionId, customerId)) {
        if (c.resolvedAt) continue;
        if (!c.expiresAt) continue;
        if (_toMs(c.expiresAt) > nowMs) continue;
        if (c.severity === "major") continue;
        if (c.repairRequired && !c.repairCompleted) continue;
        c.resolvedAt = _toIso(now);
        c.updatedAt = _toIso(now);
        resolved++;
      }
      return resolved;
    }
    try {
      const { rowCount } = await pool.query(
        `UPDATE relationship_consequences
           SET resolved_at=$3, updated_at=$3
         WHERE companion_id=$1 AND customer_id=$2
           AND resolved_at IS NULL
           AND expires_at IS NOT NULL
           AND expires_at <= $3
           AND severity <> 'major'
           AND (repair_required = FALSE OR repair_completed = TRUE)`,
        [companionId, customerId, _toIso(now)],
      );
      return rowCount || 0;
    } catch (err) {
      logger?.warn?.("[consequence-store] expireStale failed", { error: err?.message });
      return 0;
    }
  }

  async function count({ companionId, customerId, activeOnly = true }) {
    if (!pool) {
      const list = _scope(companionId, customerId);
      return activeOnly ? list.filter(c => !c.resolvedAt).length : list.length;
    }
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS n FROM relationship_consequences
         WHERE companion_id=$1 AND customer_id=$2 ${activeOnly ? "AND resolved_at IS NULL" : ""}`,
        [companionId, customerId],
      );
      return Number(rows[0]?.n || 0);
    } catch { return 0; }
  }

  async function pruneOlderThan({ companionId, customerId, days = 90 }) {
    const cutoffMs = Date.now() - days * 24 * 3600 * 1000;
    if (!pool) {
      const list = _scope(companionId, customerId);
      let removed = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        // Only prune resolved consequences past the cutoff — never an open one.
        if (list[i].resolvedAt && _toMs(list[i].resolvedAt) <= cutoffMs) {
          list.splice(i, 1);
          removed++;
        }
      }
      return removed;
    }
    try {
      const cutoff = new Date(cutoffMs).toISOString();
      const { rowCount } = await pool.query(
        `DELETE FROM relationship_consequences
         WHERE companion_id=$1 AND customer_id=$2
           AND resolved_at IS NOT NULL AND resolved_at <= $3`,
        [companionId, customerId, cutoff],
      );
      return rowCount || 0;
    } catch { return 0; }
  }

  return {
    init, create, getActive, getById,
    markRepairStarted, markRepairCompleted, update, patchMetadata, resolve,
    expireStale, count, pruneOlderThan,
    MINOR_TTL_HOURS, POSITIVE_TTL_HOURS, REPAIR_GRACE_HOURS,
  };
}

function _toMs(v) {
  if (v instanceof Date) return v.getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

module.exports = {
  createConsequenceStore,
  MINOR_TTL_HOURS,
  POSITIVE_TTL_HOURS,
  REPAIR_GRACE_HOURS,
};
