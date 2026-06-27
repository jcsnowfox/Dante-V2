"use strict";

/**
 * identityValueStore
 *
 * Stores what Dante cares about deeply (values) and his evolving
 * "I choose to..." commitments (principles).
 *
 * Values are not binary. Each has strength (0–1), confidence (0–1),
 * supporting + contradicting evidence, and a full revision history.
 *
 * Principles evolve extremely slowly — they require repeated evidence.
 * Seed principles are immutable and never deleted.
 *
 * Storage: dante_identity_values, dante_identity_principles
 * In-memory fallback: _valuesStore Map, _principlesStore Map
 */

const MAX_EVIDENCE   = 20;
const MAX_REVISIONS  = 15;

function createIdentityValueStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try {
    const { createPostgresPool } = require("../storage/postgres/createPostgresPool");
    pool = createPostgresPool({ config });
  } catch { pool = null; }

  const _valuesStore     = new Map();
  const _principlesStore = new Map();

  // ── init ─────────────────────────────────────────────────────────────────

  async function init() {
    if (!pool) return;
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS dante_identity_values (
  id BIGSERIAL PRIMARY KEY,
  companion_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  value_key TEXT NOT NULL,
  label TEXT NOT NULL,
  strength NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  supporting_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  contradicting_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_reinforced TIMESTAMPTZ,
  last_challenged TIMESTAMPTZ,
  revision_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (companion_id, customer_id, value_key)
)`);

      await pool.query(`CREATE TABLE IF NOT EXISTS dante_identity_principles (
  id BIGSERIAL PRIMARY KEY,
  companion_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  principle_key TEXT NOT NULL,
  label TEXT NOT NULL,
  statement TEXT NOT NULL,
  why TEXT NOT NULL DEFAULT '',
  strength NUMERIC(4,3) NOT NULL DEFAULT 0.800,
  seed_origin BOOLEAN NOT NULL DEFAULT FALSE,
  immutable BOOLEAN NOT NULL DEFAULT FALSE,
  last_evolved_at TIMESTAMPTZ,
  revision_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (companion_id, customer_id, principle_key)
)`);
    } catch (err) {
      logger?.warn("[identityValues] init error", { error: err?.message });
    }
  }

  // ── values ────────────────────────────────────────────────────────────────

  function _vKey(companionId, customerId, valueKey) {
    return `${companionId}:${customerId}:value:${valueKey}`;
  }

  function _defaultValue(valueKey, label) {
    return {
      valueKey,
      label:                 label || valueKey,
      strength:              0.50,
      confidence:            0.50,
      supportingEvidence:    [],
      contradictingEvidence: [],
      lastReinforced:        null,
      lastChallenged:        null,
      revisionHistory:       [],
      discoveredAt:          new Date().toISOString(),
    };
  }

  function _mapValueRow(row) {
    return {
      valueKey:              row.value_key,
      label:                 row.label,
      strength:              parseFloat(row.strength)    || 0.50,
      confidence:            parseFloat(row.confidence)  || 0.50,
      supportingEvidence:    Array.isArray(row.supporting_evidence)    ? row.supporting_evidence    : [],
      contradictingEvidence: Array.isArray(row.contradicting_evidence) ? row.contradicting_evidence : [],
      lastReinforced:        row.last_reinforced ? new Date(row.last_reinforced).toISOString() : null,
      lastChallenged:        row.last_challenged ? new Date(row.last_challenged).toISOString() : null,
      revisionHistory:       Array.isArray(row.revision_history) ? row.revision_history : [],
      discoveredAt:          row.discovered_at   ? new Date(row.discovered_at).toISOString()   : null,
    };
  }

  async function getValue({ companionId, customerId, valueKey }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_values WHERE companion_id=$1 AND customer_id=$2 AND value_key=$3 LIMIT 1`,
          [companionId, customerId, valueKey],
        );
        if (rows[0]) return _mapValueRow(rows[0]);
      } catch { /* fall through */ }
    }
    return _valuesStore.get(_vKey(companionId, customerId, valueKey)) ?? null;
  }

  async function getValues({ companionId, customerId }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_values WHERE companion_id=$1 AND customer_id=$2 ORDER BY strength DESC`,
          [companionId, customerId],
        );
        return rows.map(_mapValueRow);
      } catch { /* fall through */ }
    }
    const prefix = `${companionId}:${customerId}:value:`;
    const results = [];
    for (const [k, v] of _valuesStore) {
      if (k.startsWith(prefix)) results.push(v);
    }
    return results.sort((a, b) => b.strength - a.strength);
  }

  async function reinforce({ companionId, customerId, valueKey, label, evidence, delta = 0.04, at = new Date() }) {
    const existing    = await getValue({ companionId, customerId, valueKey }) ?? _defaultValue(valueKey, label || valueKey);
    const prevStrength = existing.strength;
    const atStr        = at instanceof Date ? at.toISOString() : at;

    const newStrength   = Math.min(0.95, existing.strength + delta);
    const newConfidence = Math.min(0.95, existing.confidence + delta * 0.5);
    const newSupporting = [{ at: atStr, summary: evidence }, ...existing.supportingEvidence].slice(0, MAX_EVIDENCE);
    const revision      = { at: atStr, from: prevStrength, to: newStrength, reason: `reinforced: ${evidence}` };
    const newRevisions  = [revision, ...existing.revisionHistory].slice(0, MAX_REVISIONS);

    const updated = {
      ...existing,
      label:              label || existing.label,
      strength:           newStrength,
      confidence:         newConfidence,
      supportingEvidence: newSupporting,
      lastReinforced:     atStr,
      revisionHistory:    newRevisions,
    };

    await _persistValue({ companionId, customerId, data: updated });
    return updated;
  }

  async function challenge({ companionId, customerId, valueKey, label, evidence, delta = 0.03, at = new Date() }) {
    const existing    = await getValue({ companionId, customerId, valueKey }) ?? _defaultValue(valueKey, label || valueKey);
    const prevStrength = existing.strength;
    const atStr        = at instanceof Date ? at.toISOString() : at;

    const newStrength        = Math.max(0.05, existing.strength - delta);
    const newConfidence      = Math.max(0.05, existing.confidence - delta * 0.3);
    const newContradicting   = [{ at: atStr, summary: evidence }, ...existing.contradictingEvidence].slice(0, MAX_EVIDENCE);
    const revision           = { at: atStr, from: prevStrength, to: newStrength, reason: `challenged: ${evidence}` };
    const newRevisions       = [revision, ...existing.revisionHistory].slice(0, MAX_REVISIONS);

    const updated = {
      ...existing,
      label:                 label || existing.label,
      strength:              newStrength,
      confidence:            newConfidence,
      contradictingEvidence: newContradicting,
      lastChallenged:        atStr,
      revisionHistory:       newRevisions,
    };

    await _persistValue({ companionId, customerId, data: updated });
    return updated;
  }

  async function _persistValue({ companionId, customerId, data }) {
    _valuesStore.set(_vKey(companionId, customerId, data.valueKey), data);
    if (!pool) return;
    try {
      await pool.query(`
INSERT INTO dante_identity_values
  (companion_id, customer_id, value_key, label, strength, confidence,
   supporting_evidence, contradicting_evidence, last_reinforced, last_challenged,
   revision_history, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
ON CONFLICT (companion_id, customer_id, value_key) DO UPDATE SET
  label                  = EXCLUDED.label,
  strength               = EXCLUDED.strength,
  confidence             = EXCLUDED.confidence,
  supporting_evidence    = EXCLUDED.supporting_evidence,
  contradicting_evidence = EXCLUDED.contradicting_evidence,
  last_reinforced        = EXCLUDED.last_reinforced,
  last_challenged        = EXCLUDED.last_challenged,
  revision_history       = EXCLUDED.revision_history,
  updated_at             = NOW()
      `, [
        companionId, customerId, data.valueKey, data.label,
        data.strength, data.confidence,
        JSON.stringify(data.supportingEvidence),
        JSON.stringify(data.contradictingEvidence),
        data.lastReinforced ?? null,
        data.lastChallenged ?? null,
        JSON.stringify(data.revisionHistory),
      ]);
    } catch (err) {
      logger?.warn("[identityValues] persist error", { error: err?.message });
    }
  }

  // ── principles ────────────────────────────────────────────────────────────

  function _pKey(companionId, customerId, principleKey) {
    return `${companionId}:${customerId}:principle:${principleKey}`;
  }

  function _mapPrincipleRow(row) {
    return {
      principleKey:    row.principle_key,
      label:           row.label,
      statement:       row.statement,
      why:             row.why || "",
      strength:        parseFloat(row.strength) || 0.80,
      seedOrigin:      Boolean(row.seed_origin),
      immutable:       Boolean(row.immutable),
      lastEvolvedAt:   row.last_evolved_at ? new Date(row.last_evolved_at).toISOString() : null,
      revisionHistory: Array.isArray(row.revision_history) ? row.revision_history : [],
    };
  }

  async function getPrinciple({ companionId, customerId, principleKey }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_principles WHERE companion_id=$1 AND customer_id=$2 AND principle_key=$3 LIMIT 1`,
          [companionId, customerId, principleKey],
        );
        if (rows[0]) return _mapPrincipleRow(rows[0]);
      } catch { /* fall through */ }
    }
    return _principlesStore.get(_pKey(companionId, customerId, principleKey)) ?? null;
  }

  async function getPrinciples({ companionId, customerId }) {
    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dante_identity_principles WHERE companion_id=$1 AND customer_id=$2 ORDER BY strength DESC`,
          [companionId, customerId],
        );
        return rows.map(_mapPrincipleRow);
      } catch { /* fall through */ }
    }
    const prefix = `${companionId}:${customerId}:principle:`;
    const results = [];
    for (const [k, v] of _principlesStore) {
      if (k.startsWith(prefix)) results.push(v);
    }
    return results.sort((a, b) => b.strength - a.strength);
  }

  async function seedPrinciple({ companionId, customerId, principleKey, label, statement, why, at = new Date() }) {
    const existing = await getPrinciple({ companionId, customerId, principleKey });
    if (existing) return existing;

    const data = {
      principleKey,
      label,
      statement,
      why:             why || "",
      strength:        0.80,
      seedOrigin:      true,
      immutable:       true,
      lastEvolvedAt:   null,
      revisionHistory: [],
    };
    await _persistPrinciple({ companionId, customerId, data });
    return data;
  }

  async function _persistPrinciple({ companionId, customerId, data }) {
    _principlesStore.set(_pKey(companionId, customerId, data.principleKey), data);
    if (!pool) return;
    try {
      await pool.query(`
INSERT INTO dante_identity_principles
  (companion_id, customer_id, principle_key, label, statement, why, strength,
   seed_origin, immutable, last_evolved_at, revision_history)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
ON CONFLICT (companion_id, customer_id, principle_key) DO NOTHING
      `, [
        companionId, customerId, data.principleKey, data.label, data.statement, data.why,
        data.strength, data.seedOrigin, data.immutable, data.lastEvolvedAt ?? null,
        JSON.stringify(data.revisionHistory),
      ]);
    } catch (err) {
      logger?.warn("[identityPrinciples] persist error", { error: err?.message });
    }
  }

  return {
    init,
    getValue, getValues,
    reinforce, challenge,
    getPrinciple, getPrinciples,
    seedPrinciple,
  };
}

module.exports = { createIdentityValueStore };
