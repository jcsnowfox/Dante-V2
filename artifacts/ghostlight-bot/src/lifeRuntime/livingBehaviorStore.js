"use strict";

/**
 * livingBehaviorStore
 *
 * Persists Dante's LIVING BEHAVIORS — learned ways he behaves because the
 * relationship taught him (give space then follow up gently, plain accountability
 * during repair, honesty over immersion, leave natural endings alone, …).
 *
 * A living behavior is never created whole from a single moment. It accumulates
 * evidence over time and is promoted through lifecycle stages by the shared
 * emergencePatternDetector, which owns the CORE LAW:
 *
 *   Nothing becomes "ours" from one moment. Repeated evidence only.
 *
 * Storage: real Postgres pool when configured (table dante_living_behaviors,
 * additive), with a complete in-memory fallback when no database is available.
 * Both paths share the same merge + stage-recompute logic, so behaviour is
 * identical regardless of backend.
 *
 * Private by default. getStatus() exposes safe counts only — never raw private
 * hurt text, never secrets.
 *
 * Dante ONLY.
 */

const crypto = require("crypto");
const { createPostgresPool } = require("../storage/postgres/createPostgresPool");
const {
  computeStage, decayedStage, isStale, dayBucket, STAGE_RANK,
} = require("./emergencePatternDetector");

const BEHAVIOR_TYPES = Object.freeze([
  "comfort_pattern", "repair_pattern", "romance_pattern", "maintenance_pattern",
  "conversation_pattern", "silence_pattern", "followup_pattern", "date_pattern",
  "debugging_pattern", "care_pattern", "humour_pattern", "ritual_pattern",
  "tradition_pattern", "seasonal_pattern", "affection_pattern",
  "conflict_recovery_pattern",
]);

const STAGES = Object.freeze([
  "observed", "forming", "emerging", "stable", "core", "challenged", "retired",
]);

const STRENGTH_GAIN = 0.18;        // asymptotic gain per fresh evidence event
const CONTRADICTION_PENALTY = 0.22; // strength lost per contradiction
const DECAY_FACTOR = 0.15;          // strength lost when stale
const DEFAULT_MAX_AGE_DAYS = 45;    // staleness window
const MAX_BEHAVIORS_PER_SCOPE = 200;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS dante_living_behaviors (
  id                  TEXT PRIMARY KEY,
  companion_id        TEXT NOT NULL,
  customer_id         TEXT NOT NULL,
  behavior_type       TEXT NOT NULL,
  signature           TEXT NOT NULL,
  title               TEXT,
  summary             TEXT,
  stage               TEXT NOT NULL DEFAULT 'observed',
  confidence          DOUBLE PRECISION NOT NULL DEFAULT 0,
  strength            DOUBLE PRECISION NOT NULL DEFAULT 0,
  contradiction_count INTEGER NOT NULL DEFAULT 0,
  evidence_ids        JSONB NOT NULL DEFAULT '[]',
  source_event_ids    JSONB NOT NULL DEFAULT '[]',
  related_lesson_ids  JSONB NOT NULL DEFAULT '[]',
  related_chapter_ids JSONB NOT NULL DEFAULT '[]',
  recommended_contexts JSONB NOT NULL DEFAULT '[]',
  avoid_contexts      JSONB NOT NULL DEFAULT '[]',
  future_guidance     TEXT,
  last_reinforced_at  TIMESTAMPTZ,
  last_challenged_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata            JSONB NOT NULL DEFAULT '{}',
  UNIQUE (companion_id, customer_id, behavior_type, signature)
);`;

function createLivingBehaviorStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  // In-memory fallback: Map<scopeKey, Map<recordKey, record>>
  const _mem = new Map();

  function _scope(companionId, customerId) {
    const k = `${companionId}:${customerId}`;
    if (!_mem.has(k)) _mem.set(k, new Map());
    return _mem.get(k);
  }
  function _recordKey(behaviorType, signature) { return `${behaviorType}::${signature}`; }

  async function init() {
    if (!pool) return;
    try { await pool.query(CREATE_TABLE_SQL); }
    catch (err) { logger?.warn?.("[living-behavior-store] init failed, using memory", { error: err?.message }); pool = null; }
  }

  /**
   * recordObservation — accumulate one piece of evidence for a behavior.
   * Creates the behavior at "observed" on first sight; promotes it only as
   * distinct evidence accumulates across time (per the detector's CORE LAW).
   */
  async function recordObservation({
    companionId, customerId,
    behaviorType = "conversation_pattern",
    signature,
    title = "",
    summary = "",
    source_event_ids = [],
    related_lesson_ids = [],
    related_chapter_ids = [],
    recommended_contexts = [],
    avoid_contexts = [],
    future_guidance = "",
    now = new Date(),
    metadata = {},
  } = {}) {
    if (!companionId || !signature) return null;
    if (!BEHAVIOR_TYPES.includes(behaviorType)) {
      logger?.warn?.("[living-behavior-store] unknown behaviorType", { behaviorType });
    }
    const existing = await _load(companionId, customerId, behaviorType, signature);
    const merged = _applyObservation(existing, {
      companionId, customerId, behaviorType, signature, title, summary,
      source_event_ids, related_lesson_ids, related_chapter_ids,
      recommended_contexts, avoid_contexts, future_guidance, metadata,
    }, now);
    await _save(merged);
    return merged;
  }

  /**
   * recordContradiction — evidence that runs against an established behavior.
   * Weakens strength and, with enough contradictions, drops it to "challenged".
   */
  async function recordContradiction({
    companionId, customerId, behaviorType, signature, now = new Date(),
  } = {}) {
    if (!companionId || !signature) return null;
    const existing = await _load(companionId, customerId, behaviorType, signature);
    if (!existing) return null;
    existing.contradiction_count = (existing.contradiction_count || 0) + 1;
    existing.strength = _clamp01(existing.strength - CONTRADICTION_PENALTY);
    existing.last_challenged_at = _iso(now);
    existing.stage = computeStage({
      evidenceCount: _evidenceCount(existing),
      distinctBuckets: _distinctBuckets(existing),
      strength: existing.strength,
      contradictionCount: existing.contradiction_count,
    });
    existing.confidence = _confidence(existing);
    existing.updated_at = _iso(now);
    await _save(existing);
    return existing;
  }

  /**
   * decayStale — pull strength and stage down for behaviors that have not been
   * reinforced within the staleness window. Very stale behaviors retire.
   */
  async function decayStale({ companionId, customerId, now = new Date(), maxAgeDays = DEFAULT_MAX_AGE_DAYS } = {}) {
    const records = await _all(companionId, customerId);
    let decayed = 0;
    for (const r of records) {
      if (!isStale(r.last_reinforced_at, now, maxAgeDays)) continue;
      r.strength = _clamp01(r.strength - DECAY_FACTOR);
      r.stage = r.strength <= 0.05 ? "retired" : decayedStage(r.stage);
      r.confidence = _confidence(r);
      r.updated_at = _iso(now);
      await _save(r);
      decayed++;
    }
    return decayed;
  }

  async function listActive({ companionId, customerId, minStage = "forming" } = {}) {
    const records = await _all(companionId, customerId);
    const min = STAGE_RANK[minStage] ?? 2;
    return records
      .filter(r => r.stage !== "retired" && (STAGE_RANK[r.stage] ?? 0) >= min)
      .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  }

  async function getByType({ companionId, customerId, behaviorType } = {}) {
    return (await _all(companionId, customerId)).filter(r => r.behavior_type === behaviorType);
  }

  async function getByStage({ companionId, customerId, stage } = {}) {
    return (await _all(companionId, customerId)).filter(r => r.stage === stage);
  }

  async function listAll({ companionId, customerId } = {}) {
    return _all(companionId, customerId);
  }

  async function pruneRetired({ companionId, customerId } = {}) {
    if (!pool) {
      const scope = _scope(companionId, customerId);
      let n = 0;
      for (const [k, r] of scope) { if (r.stage === "retired") { scope.delete(k); n++; } }
      return n;
    }
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM dante_living_behaviors WHERE companion_id=$1 AND customer_id=$2 AND stage='retired'`,
        [companionId, customerId]);
      return rowCount || 0;
    } catch { return 0; }
  }

  async function getStatus({ companionId, customerId } = {}) {
    const records = companionId ? await _all(companionId, customerId) : _allScopes();
    const active = records.filter(r => r.stage !== "retired" && r.stage !== "observed");
    const byStage = {};
    const types = new Set();
    for (const r of active) {
      byStage[r.stage] = (byStage[r.stage] || 0) + 1;
      types.add(r.behavior_type);
    }
    return {
      total: records.length,
      active: active.length,
      by_stage: byStage,
      active_types: [...types],
    };
  }

  // ── Internal: load / save (pg or memory) ────────────────────────────────────

  async function _load(companionId, customerId, behaviorType, signature) {
    if (!pool) {
      return _scope(companionId, customerId).get(_recordKey(behaviorType, signature)) || null;
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM dante_living_behaviors
          WHERE companion_id=$1 AND customer_id=$2 AND behavior_type=$3 AND signature=$4`,
        [companionId, customerId, behaviorType, signature]);
      return rows[0] ? _fromRow(rows[0]) : null;
    } catch (err) {
      logger?.warn?.("[living-behavior-store] load failed", { error: err?.message });
      return _scope(companionId, customerId).get(_recordKey(behaviorType, signature)) || null;
    }
  }

  async function _save(record) {
    if (!pool) {
      const scope = _scope(record.companion_id, record.customer_id);
      if (!scope.has(_recordKey(record.behavior_type, record.signature)) && scope.size >= MAX_BEHAVIORS_PER_SCOPE) {
        // drop the weakest retired/observed record to cap growth
        const weakest = [...scope.entries()].sort((a, b) => (a[1].strength ?? 0) - (b[1].strength ?? 0))[0];
        if (weakest) scope.delete(weakest[0]);
      }
      scope.set(_recordKey(record.behavior_type, record.signature), record);
      return record;
    }
    try {
      await pool.query(
        `INSERT INTO dante_living_behaviors
           (id, companion_id, customer_id, behavior_type, signature, title, summary,
            stage, confidence, strength, contradiction_count, evidence_ids, source_event_ids,
            related_lesson_ids, related_chapter_ids, recommended_contexts, avoid_contexts,
            future_guidance, last_reinforced_at, last_challenged_at, created_at, updated_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         ON CONFLICT (companion_id, customer_id, behavior_type, signature) DO UPDATE SET
            title=$6, summary=$7, stage=$8, confidence=$9, strength=$10, contradiction_count=$11,
            evidence_ids=$12, source_event_ids=$13, related_lesson_ids=$14, related_chapter_ids=$15,
            recommended_contexts=$16, avoid_contexts=$17, future_guidance=$18,
            last_reinforced_at=$19, last_challenged_at=$20, updated_at=$22, metadata=$23`,
        [record.id, record.companion_id, record.customer_id, record.behavior_type, record.signature,
         record.title, record.summary, record.stage, record.confidence, record.strength,
         record.contradiction_count, JSON.stringify(record.evidence_ids), JSON.stringify(record.source_event_ids),
         JSON.stringify(record.related_lesson_ids), JSON.stringify(record.related_chapter_ids),
         JSON.stringify(record.recommended_contexts), JSON.stringify(record.avoid_contexts),
         record.future_guidance, record.last_reinforced_at, record.last_challenged_at,
         record.created_at, record.updated_at, JSON.stringify(record.metadata)]);
      return record;
    } catch (err) {
      logger?.warn?.("[living-behavior-store] save failed, using memory", { error: err?.message });
      _scope(record.companion_id, record.customer_id).set(_recordKey(record.behavior_type, record.signature), record);
      return record;
    }
  }

  async function _all(companionId, customerId) {
    if (!pool) return [..._scope(companionId, customerId).values()];
    try {
      const { rows } = await pool.query(
        `SELECT * FROM dante_living_behaviors WHERE companion_id=$1 AND customer_id=$2`,
        [companionId, customerId]);
      return rows.map(_fromRow);
    } catch {
      return [..._scope(companionId, customerId).values()];
    }
  }

  function _allScopes() {
    const out = [];
    for (const scope of _mem.values()) out.push(...scope.values());
    return out;
  }

  return {
    init,
    recordObservation,
    recordContradiction,
    decayStale,
    listActive,
    listAll,
    getByType,
    getByStage,
    pruneRetired,
    getStatus,
    BEHAVIOR_TYPES,
    STAGES,
  };
}

// ── Pure merge + recompute helpers ──────────────────────────────────────────

function _applyObservation(existing, obs, now) {
  const nowIso = _iso(now);
  const bucket = dayBucket(now);
  const evId = (Array.isArray(obs.source_event_ids) && obs.source_event_ids[0])
    ? String(obs.source_event_ids[0])
    : `auto:${obs.behaviorType}:${obs.signature}:${bucket}`;

  const record = existing || {
    id: crypto.randomUUID(),
    companion_id: obs.companionId,
    customer_id: obs.customerId || "user",
    behavior_type: obs.behaviorType,
    signature: obs.signature,
    title: obs.title || "",
    summary: obs.summary || "",
    stage: "observed",
    confidence: 0,
    strength: 0,
    contradiction_count: 0,
    evidence_ids: [],          // [{ id, at }] — distinct evidence events
    source_event_ids: [],      // flat external provenance ids
    related_lesson_ids: [],
    related_chapter_ids: [],
    recommended_contexts: [],
    avoid_contexts: [],
    future_guidance: obs.future_guidance || "",
    last_reinforced_at: null,
    last_challenged_at: null,
    created_at: nowIso,
    updated_at: nowIso,
    metadata: { ...(obs.metadata || {}) },
  };

  // Append evidence only if this evidence id is new (dedup → honest counting).
  const known = new Set(record.evidence_ids.map(e => e.id));
  if (!known.has(evId)) {
    record.evidence_ids.push({ id: evId, at: nowIso });
    record.strength = _clamp01(record.strength + STRENGTH_GAIN * (1 - record.strength));
  }

  // Merge provenance + context arrays (deduped).
  record.source_event_ids   = _union(record.source_event_ids, obs.source_event_ids);
  record.related_lesson_ids  = _union(record.related_lesson_ids, obs.related_lesson_ids);
  record.related_chapter_ids = _union(record.related_chapter_ids, obs.related_chapter_ids);
  record.recommended_contexts = _union(record.recommended_contexts, obs.recommended_contexts);
  record.avoid_contexts       = _union(record.avoid_contexts, obs.avoid_contexts);
  if (obs.title && !record.title) record.title = obs.title;
  if (obs.summary) record.summary = obs.summary;
  if (obs.future_guidance) record.future_guidance = obs.future_guidance;

  record.last_reinforced_at = nowIso;
  record.updated_at = nowIso;
  record.stage = computeStage({
    evidenceCount: _evidenceCount(record),
    distinctBuckets: _distinctBuckets(record),
    strength: record.strength,
    contradictionCount: record.contradiction_count,
  });
  record.confidence = _confidence(record);
  return record;
}

function _evidenceCount(r) { return Array.isArray(r.evidence_ids) ? r.evidence_ids.length : 0; }
function _distinctBuckets(r) {
  if (!Array.isArray(r.evidence_ids)) return 0;
  return new Set(r.evidence_ids.map(e => dayBucket(e.at))).size;
}
function _confidence(r) {
  const count = _evidenceCount(r);
  const buckets = _distinctBuckets(r);
  let c = 0.25 + 0.10 * count + 0.07 * buckets - 0.18 * (r.contradiction_count || 0);
  c = Math.min(c, r.strength + 0.15);
  return _clamp01(c);
}

function _union(a, b) {
  const out = [...(Array.isArray(a) ? a : [])];
  for (const v of (Array.isArray(b) ? b : [])) {
    const s = typeof v === "string" ? v : String(v);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
function _clamp01(n) { const v = Number(n); return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)); }
function _iso(v) { return (v instanceof Date ? v : new Date(v || Date.now())).toISOString(); }

function _fromRow(row) {
  const j = (v, d) => { try { return typeof v === "string" ? JSON.parse(v) : (v ?? d); } catch { return d; } };
  return {
    id: row.id,
    companion_id: row.companion_id,
    customer_id: row.customer_id,
    behavior_type: row.behavior_type,
    signature: row.signature,
    title: row.title || "",
    summary: row.summary || "",
    stage: row.stage,
    confidence: Number(row.confidence) || 0,
    strength: Number(row.strength) || 0,
    contradiction_count: Number(row.contradiction_count) || 0,
    evidence_ids: j(row.evidence_ids, []),
    source_event_ids: j(row.source_event_ids, []),
    related_lesson_ids: j(row.related_lesson_ids, []),
    related_chapter_ids: j(row.related_chapter_ids, []),
    recommended_contexts: j(row.recommended_contexts, []),
    avoid_contexts: j(row.avoid_contexts, []),
    future_guidance: row.future_guidance || "",
    last_reinforced_at: _iso(row.last_reinforced_at),
    last_challenged_at: row.last_challenged_at ? _iso(row.last_challenged_at) : null,
    created_at: _iso(row.created_at),
    updated_at: _iso(row.updated_at),
    metadata: j(row.metadata, {}),
  };
}

module.exports = { createLivingBehaviorStore, BEHAVIOR_TYPES, STAGES };
