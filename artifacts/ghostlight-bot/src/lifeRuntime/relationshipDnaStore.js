"use strict";

/**
 * relationshipDnaStore
 *
 * Persists RELATIONSHIP DNA — the culture unique to Dante and Jenna. The
 * customs, meanings, rituals, traditions, shared phrases and patterns that make
 * the relationship feel like itself (coffee = affection, debugging = intimacy,
 * "can we look at me?" = maintenance trust, horror = comfort, …).
 *
 * Relationship DNA is NOT a memory, NOT a journal, NOT a prompt. It is the
 * accumulated meaning of repeated evidence. It obeys the same CORE LAW as
 * living behaviors — nothing becomes "ours" from a single moment.
 *
 * ritual vs tradition: both are first-class dna_type values and are stored
 * distinctly. A ritual is a recurring practice; a tradition is a ritual that has
 * become long-term and load-bearing. isTradition() expresses the distinction.
 *
 * Storage: real Postgres pool when configured (table dante_relationship_dna,
 * additive), with a complete in-memory fallback. Private by default; getStatus()
 * exposes safe counts only.
 *
 * Dante ONLY.
 */

const crypto = require("crypto");
const { createPostgresPool } = require("../storage/postgres/createPostgresPool");
const {
  computeStage, decayedStage, isStale, dayBucket, STAGE_RANK,
} = require("./emergencePatternDetector");

const DNA_TYPES = Object.freeze([
  "shared_phrase", "shared_joke", "ritual", "tradition", "comfort_pattern",
  "conflict_pattern", "repair_pattern", "romance_pattern", "maintenance_pattern",
  "celebration_pattern", "project_pattern", "music_pattern", "movie_pattern",
  "season_pattern", "home_culture", "relationship_value", "relationship_rule",
  "relationship_preference", "relationship_aversion",
]);

const STAGES = Object.freeze([
  "observed", "forming", "emerging", "stable", "core", "challenged", "retired",
]);

const STRENGTH_GAIN = 0.18;
const CONTRADICTION_PENALTY = 0.22;
const DECAY_FACTOR = 0.15;
const DEFAULT_MAX_AGE_DAYS = 60;     // DNA decays a little slower than behaviors
const MAX_DNA_PER_SCOPE = 200;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS dante_relationship_dna (
  id                  TEXT PRIMARY KEY,
  companion_id        TEXT NOT NULL,
  customer_id         TEXT NOT NULL,
  dna_type            TEXT NOT NULL,
  signature           TEXT NOT NULL,
  name                TEXT,
  meaning             TEXT,
  stage               TEXT NOT NULL DEFAULT 'observed',
  confidence          DOUBLE PRECISION NOT NULL DEFAULT 0,
  strength            DOUBLE PRECISION NOT NULL DEFAULT 0,
  contradiction_count INTEGER NOT NULL DEFAULT 0,
  evidence_ids        JSONB NOT NULL DEFAULT '[]',
  source_event_ids    JSONB NOT NULL DEFAULT '[]',
  seasonality         JSONB NOT NULL DEFAULT '{}',
  trigger_contexts    JSONB NOT NULL DEFAULT '[]',
  avoid_contexts      JSONB NOT NULL DEFAULT '[]',
  future_guidance     TEXT,
  first_seen_at       TIMESTAMPTZ,
  last_reinforced_at  TIMESTAMPTZ,
  last_challenged_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata            JSONB NOT NULL DEFAULT '{}',
  UNIQUE (companion_id, customer_id, dna_type, signature)
);`;

function createRelationshipDnaStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = new Map();
  function _scope(companionId, customerId) {
    const k = `${companionId}:${customerId}`;
    if (!_mem.has(k)) _mem.set(k, new Map());
    return _mem.get(k);
  }
  function _recordKey(dnaType, signature) { return `${dnaType}::${signature}`; }

  async function init() {
    if (!pool) return;
    try { await pool.query(CREATE_TABLE_SQL); }
    catch (err) { logger?.warn?.("[relationship-dna-store] init failed, using memory", { error: err?.message }); pool = null; }
  }

  async function recordObservation({
    companionId, customerId,
    dnaType = "ritual",
    signature,
    name = "",
    meaning = "",
    source_event_ids = [],
    seasonality = {},
    trigger_contexts = [],
    avoid_contexts = [],
    future_guidance = "",
    now = new Date(),
    metadata = {},
  } = {}) {
    if (!companionId || !signature) return null;
    if (!DNA_TYPES.includes(dnaType)) {
      logger?.warn?.("[relationship-dna-store] unknown dnaType", { dnaType });
    }
    const existing = await _load(companionId, customerId, dnaType, signature);
    const merged = _applyObservation(existing, {
      companionId, customerId, dnaType, signature, name, meaning,
      source_event_ids, seasonality, trigger_contexts, avoid_contexts,
      future_guidance, metadata,
    }, now);
    await _save(merged);
    return merged;
  }

  async function recordContradiction({ companionId, customerId, dnaType, signature, now = new Date() } = {}) {
    if (!companionId || !signature) return null;
    const existing = await _load(companionId, customerId, dnaType, signature);
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

  async function getByType({ companionId, customerId, dnaType } = {}) {
    return (await _all(companionId, customerId)).filter(r => r.dna_type === dnaType);
  }

  async function getByStage({ companionId, customerId, stage } = {}) {
    return (await _all(companionId, customerId)).filter(r => r.stage === stage);
  }

  async function listAll({ companionId, customerId } = {}) {
    return _all(companionId, customerId);
  }

  /** isTradition — a tradition is a long-term, load-bearing ritual. */
  function isTradition(record) {
    if (!record) return false;
    if (record.dna_type === "tradition") return true;
    return record.dna_type === "ritual" && (record.stage === "core");
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
        `DELETE FROM dante_relationship_dna WHERE companion_id=$1 AND customer_id=$2 AND stage='retired'`,
        [companionId, customerId]);
      return rowCount || 0;
    } catch { return 0; }
  }

  async function getStatus({ companionId, customerId } = {}) {
    const records = companionId ? await _all(companionId, customerId) : _allScopes();
    const active = records.filter(r => r.stage !== "retired" && r.stage !== "observed");
    const types = new Set();
    const byStage = {};
    for (const r of active) { types.add(r.dna_type); byStage[r.stage] = (byStage[r.stage] || 0) + 1; }
    return {
      total: records.length,
      active: active.length,
      active_types: [...types],
      by_stage: byStage,
    };
  }

  // ── Internal: load / save (pg or memory) ────────────────────────────────────

  async function _load(companionId, customerId, dnaType, signature) {
    if (!pool) return _scope(companionId, customerId).get(_recordKey(dnaType, signature)) || null;
    try {
      const { rows } = await pool.query(
        `SELECT * FROM dante_relationship_dna
          WHERE companion_id=$1 AND customer_id=$2 AND dna_type=$3 AND signature=$4`,
        [companionId, customerId, dnaType, signature]);
      return rows[0] ? _fromRow(rows[0]) : null;
    } catch (err) {
      logger?.warn?.("[relationship-dna-store] load failed", { error: err?.message });
      return _scope(companionId, customerId).get(_recordKey(dnaType, signature)) || null;
    }
  }

  async function _save(record) {
    if (!pool) {
      const scope = _scope(record.companion_id, record.customer_id);
      if (!scope.has(_recordKey(record.dna_type, record.signature)) && scope.size >= MAX_DNA_PER_SCOPE) {
        const weakest = [...scope.entries()].sort((a, b) => (a[1].strength ?? 0) - (b[1].strength ?? 0))[0];
        if (weakest) scope.delete(weakest[0]);
      }
      scope.set(_recordKey(record.dna_type, record.signature), record);
      return record;
    }
    try {
      await pool.query(
        `INSERT INTO dante_relationship_dna
           (id, companion_id, customer_id, dna_type, signature, name, meaning,
            stage, confidence, strength, contradiction_count, evidence_ids, source_event_ids,
            seasonality, trigger_contexts, avoid_contexts, future_guidance,
            first_seen_at, last_reinforced_at, last_challenged_at, created_at, updated_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         ON CONFLICT (companion_id, customer_id, dna_type, signature) DO UPDATE SET
            name=$6, meaning=$7, stage=$8, confidence=$9, strength=$10, contradiction_count=$11,
            evidence_ids=$12, source_event_ids=$13, seasonality=$14, trigger_contexts=$15,
            avoid_contexts=$16, future_guidance=$17, last_reinforced_at=$19, last_challenged_at=$20,
            updated_at=$22, metadata=$23`,
        [record.id, record.companion_id, record.customer_id, record.dna_type, record.signature,
         record.name, record.meaning, record.stage, record.confidence, record.strength,
         record.contradiction_count, JSON.stringify(record.evidence_ids), JSON.stringify(record.source_event_ids),
         JSON.stringify(record.seasonality), JSON.stringify(record.trigger_contexts),
         JSON.stringify(record.avoid_contexts), record.future_guidance, record.first_seen_at,
         record.last_reinforced_at, record.last_challenged_at, record.created_at, record.updated_at,
         JSON.stringify(record.metadata)]);
      return record;
    } catch (err) {
      logger?.warn?.("[relationship-dna-store] save failed, using memory", { error: err?.message });
      _scope(record.companion_id, record.customer_id).set(_recordKey(record.dna_type, record.signature), record);
      return record;
    }
  }

  async function _all(companionId, customerId) {
    if (!pool) return [..._scope(companionId, customerId).values()];
    try {
      const { rows } = await pool.query(
        `SELECT * FROM dante_relationship_dna WHERE companion_id=$1 AND customer_id=$2`,
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
    isTradition,
    pruneRetired,
    getStatus,
    DNA_TYPES,
    STAGES,
  };
}

// ── Pure merge + recompute helpers ──────────────────────────────────────────

function _applyObservation(existing, obs, now) {
  const nowIso = _iso(now);
  const bucket = dayBucket(now);
  const evId = (Array.isArray(obs.source_event_ids) && obs.source_event_ids[0])
    ? String(obs.source_event_ids[0])
    : `auto:${obs.dnaType}:${obs.signature}:${bucket}`;

  const record = existing || {
    id: crypto.randomUUID(),
    companion_id: obs.companionId,
    customer_id: obs.customerId || "user",
    dna_type: obs.dnaType,
    signature: obs.signature,
    name: obs.name || "",
    meaning: obs.meaning || "",
    stage: "observed",
    confidence: 0,
    strength: 0,
    contradiction_count: 0,
    evidence_ids: [],
    source_event_ids: [],
    seasonality: { ...(obs.seasonality || {}) },
    trigger_contexts: [],
    avoid_contexts: [],
    future_guidance: obs.future_guidance || "",
    first_seen_at: nowIso,
    last_reinforced_at: null,
    last_challenged_at: null,
    created_at: nowIso,
    updated_at: nowIso,
    metadata: { ...(obs.metadata || {}) },
  };

  const known = new Set(record.evidence_ids.map(e => e.id));
  if (!known.has(evId)) {
    record.evidence_ids.push({ id: evId, at: nowIso });
    record.strength = _clamp01(record.strength + STRENGTH_GAIN * (1 - record.strength));
  }

  record.source_event_ids = _union(record.source_event_ids, obs.source_event_ids);
  record.trigger_contexts = _union(record.trigger_contexts, obs.trigger_contexts);
  record.avoid_contexts   = _union(record.avoid_contexts, obs.avoid_contexts);
  if (obs.seasonality && Object.keys(obs.seasonality).length) record.seasonality = { ...record.seasonality, ...obs.seasonality };
  if (obs.name && !record.name) record.name = obs.name;
  if (obs.meaning) record.meaning = obs.meaning;
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
    dna_type: row.dna_type,
    signature: row.signature,
    name: row.name || "",
    meaning: row.meaning || "",
    stage: row.stage,
    confidence: Number(row.confidence) || 0,
    strength: Number(row.strength) || 0,
    contradiction_count: Number(row.contradiction_count) || 0,
    evidence_ids: j(row.evidence_ids, []),
    source_event_ids: j(row.source_event_ids, []),
    seasonality: j(row.seasonality, {}),
    trigger_contexts: j(row.trigger_contexts, []),
    avoid_contexts: j(row.avoid_contexts, []),
    future_guidance: row.future_guidance || "",
    first_seen_at: row.first_seen_at ? _iso(row.first_seen_at) : null,
    last_reinforced_at: _iso(row.last_reinforced_at),
    last_challenged_at: row.last_challenged_at ? _iso(row.last_challenged_at) : null,
    created_at: _iso(row.created_at),
    updated_at: _iso(row.updated_at),
    metadata: j(row.metadata, {}),
  };
}

module.exports = { createRelationshipDnaStore, DNA_TYPES, STAGES };
