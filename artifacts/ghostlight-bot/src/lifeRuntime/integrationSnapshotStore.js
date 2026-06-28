"use strict";

/**
 * integrationSnapshotStore
 *
 * The ONLY state Neural Integration owns: integration METADATA. One compact row
 * per integration tick — health, confidence, and the counts that describe how
 * coherent the system was at that moment. It never stores another runtime's
 * authoritative state, never raw private text, never decisions.
 *
 * If this store were dropped tomorrow, every runtime would still function; only
 * the integration history and architectural self-assessment would be lost. That
 * is the whole point.
 *
 * Storage: real Postgres pool when configured (table dante_integration_snapshots,
 * additive) with a complete in-memory ring-buffer fallback.
 *
 * Dante ONLY.
 */

const crypto = require("crypto");
const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const MAX_MEM = 100;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS dante_integration_snapshots (
  id                       TEXT PRIMARY KEY,
  companion_id             TEXT NOT NULL,
  customer_id              TEXT NOT NULL,
  integration_health       TEXT NOT NULL,
  integration_confidence   DOUBLE PRECISION NOT NULL DEFAULT 0,
  runtime_count            INTEGER NOT NULL DEFAULT 0,
  healthy_runtime_count    INTEGER NOT NULL DEFAULT 0,
  degraded_runtime_count   INTEGER NOT NULL DEFAULT 0,
  conflict_count           INTEGER NOT NULL DEFAULT 0,
  ownership_violation_count INTEGER NOT NULL DEFAULT 0,
  stale_runtime_count      INTEGER NOT NULL DEFAULT 0,
  reasons                  JSONB NOT NULL DEFAULT '[]',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

function createIntegrationSnapshotStore({ config = {}, logger = null } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch { pool = null; }

  const _mem = [];

  async function init() {
    if (!pool) return;
    try { await pool.query(CREATE_TABLE_SQL); }
    catch (err) { logger?.warn?.("[integration-snapshot-store] init failed, using memory", { error: err?.message }); pool = null; }
  }

  /**
   * record — persist one integration-metadata row. Integration metadata only.
   */
  async function record({
    companionId = "", customerId = "user",
    integrationHealth = "healthy",
    integrationConfidence = 0,
    runtimeCount = 0,
    healthyRuntimeCount = 0,
    degradedRuntimeCount = 0,
    conflictCount = 0,
    ownershipViolationCount = 0,
    staleRuntimeCount = 0,
    reasons = [],
    now = new Date(),
  } = {}) {
    const row = {
      id: crypto.randomUUID(),
      companion_id: companionId,
      customer_id: customerId,
      integration_health: integrationHealth,
      integration_confidence: integrationConfidence,
      runtime_count: runtimeCount,
      healthy_runtime_count: healthyRuntimeCount,
      degraded_runtime_count: degradedRuntimeCount,
      conflict_count: conflictCount,
      ownership_violation_count: ownershipViolationCount,
      stale_runtime_count: staleRuntimeCount,
      reasons: Array.isArray(reasons) ? reasons.slice(0, 12) : [],
      created_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    };

    if (!pool) {
      _mem.push(row);
      if (_mem.length > MAX_MEM) _mem.shift();
      return row;
    }
    try {
      await pool.query(
        `INSERT INTO dante_integration_snapshots
           (id, companion_id, customer_id, integration_health, integration_confidence,
            runtime_count, healthy_runtime_count, degraded_runtime_count, conflict_count,
            ownership_violation_count, stale_runtime_count, reasons, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [row.id, row.companion_id, row.customer_id, row.integration_health, row.integration_confidence,
         row.runtime_count, row.healthy_runtime_count, row.degraded_runtime_count, row.conflict_count,
         row.ownership_violation_count, row.stale_runtime_count, JSON.stringify(row.reasons), row.created_at]);
      return row;
    } catch (err) {
      logger?.warn?.("[integration-snapshot-store] record failed, using memory", { error: err?.message });
      _mem.push(row);
      if (_mem.length > MAX_MEM) _mem.shift();
      return row;
    }
  }

  async function listRecent({ companionId, customerId, limit = 10 } = {}) {
    if (!pool) {
      return _mem
        .filter(r => (!companionId || r.companion_id === companionId) && (!customerId || r.customer_id === customerId))
        .slice(-Math.min(limit, MAX_MEM)).reverse();
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM dante_integration_snapshots
          WHERE companion_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT $3`,
        [companionId, customerId, Math.min(limit, MAX_MEM)]);
      return rows;
    } catch { return _mem.slice(-limit).reverse(); }
  }

  function getStatus() {
    return {
      snapshot_count: _mem.length,
      last_snapshot_at: _mem.length ? _mem[_mem.length - 1].created_at : null,
    };
  }

  return { init, record, listRecent, getStatus };
}

module.exports = { createIntegrationSnapshotStore };
