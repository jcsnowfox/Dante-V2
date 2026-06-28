"use strict";

const { createPostgresPool } = require("../storage/postgres/createPostgresPool");

const STATUSES = new Set(["planned", "sent", "acknowledged", "dismissed", "expired", "blocked"]);
const CREATE_SCHEMA_REGISTRY_SQL = `
  CREATE TABLE IF NOT EXISTS runtime_schema_registry (
    schema_key TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL DEFAULT 1,
    owner_runtime TEXT NOT NULL DEFAULT '',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'
  );
`;
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS romantic_surprises (
    id TEXT PRIMARY KEY,
    companion_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    surprise_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    reason TEXT NOT NULL DEFAULT '',
    evidence_ids JSONB NOT NULL DEFAULT '[]',
    message TEXT NOT NULL DEFAULT '',
    planned_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    blocked_reason TEXT,
    acknowledged_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS romantic_surprises_scope_status_idx ON romantic_surprises (companion_id, customer_id, status, planned_for DESC);
  CREATE INDEX IF NOT EXISTS romantic_surprises_scope_created_idx ON romantic_surprises (companion_id, customer_id, created_at DESC);
`;

function iso(v = new Date()) { return (v instanceof Date ? v : new Date(v)).toISOString(); }
function makeId() { return `rs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function compareIsoDesc(a, b) { return String(b || "").localeCompare(String(a || "")); }
function compareIsoAsc(a, b) { return String(a || "").localeCompare(String(b || "")); }

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companion_id: row.companion_id,
    customer_id: row.customer_id,
    surprise_type: row.surprise_type,
    status: row.status,
    reason: row.reason || "",
    evidence_ids: row.evidence_ids || [],
    message: row.message || "",
    planned_for: row.planned_for ? iso(row.planned_for) : null,
    sent_at: row.sent_at ? iso(row.sent_at) : null,
    blocked_reason: row.blocked_reason || null,
    acknowledged_at: row.acknowledged_at ? iso(row.acknowledged_at) : null,
    metadata: row.metadata || {},
    created_at: row.created_at ? iso(row.created_at) : null,
    updated_at: row.updated_at ? iso(row.updated_at) : null,
  };
}

function createRomanticSurpriseStore({ db = null, pool: providedPool = null, config = {}, logger = null } = {}) {
  let pool = providedPool || db || null;
  if (!pool) {
    try { pool = createPostgresPool({ config }); } catch { pool = null; }
  }
  const rows = [];

  async function init() {
    if (!pool?.query) return;
    await pool.query(CREATE_SCHEMA_REGISTRY_SQL);
    await pool.query(CREATE_TABLE_SQL);
    await pool.query(
      `INSERT INTO runtime_schema_registry (schema_key, schema_version, owner_runtime, metadata)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (schema_key) DO UPDATE SET schema_version = EXCLUDED.schema_version, owner_runtime = EXCLUDED.owner_runtime, metadata = EXCLUDED.metadata, applied_at = NOW()`,
      ["romantic_surprises", 1, "romanticSurpriseRuntime", JSON.stringify({ table: "romantic_surprises" })],
    );
    logger?.info?.("[romantic-surprise-store] storage initialised", { provider: "postgres" });
  }

  async function create({ companionId, customerId, surpriseType, status = "planned", reason = "", evidenceIds = [], message = "", plannedFor = new Date(), blockedReason = null, metadata = {}, now = new Date() } = {}) {
    if (!STATUSES.has(status)) throw new Error(`invalid_status:${status}`);
    const row = { id: makeId(), companion_id: companionId, customer_id: customerId, surprise_type: surpriseType, status, reason, evidence_ids: evidenceIds, message, planned_for: iso(plannedFor), sent_at: null, blocked_reason: blockedReason, acknowledged_at: null, metadata, created_at: iso(now), updated_at: iso(now) };
    if (pool?.query) {
      const result = await pool.query(
        `INSERT INTO romantic_surprises (id, companion_id, customer_id, surprise_type, status, reason, evidence_ids, message, planned_for, blocked_reason, metadata, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12,$12) RETURNING *`,
        [row.id, companionId, customerId, surpriseType, status, reason || "", JSON.stringify(evidenceIds || []), message || "", row.planned_for, blockedReason, JSON.stringify(metadata || {}), row.created_at],
      );
      return mapRow(result.rows[0]);
    }
    rows.push(row); return row;
  }

  async function update({ id, companionId, customerId, patch = {}, now = new Date() } = {}) {
    if (pool?.query) {
      const current = (await pool.query("SELECT * FROM romantic_surprises WHERE id = $1 AND ($2::text = '' OR companion_id = $2) AND ($3::text = '' OR customer_id = $3)", [id, companionId || "", customerId || ""])).rows[0];
      if (!current) return null;
      const next = { ...mapRow(current), ...patch, updated_at: iso(now) };
      const result = await pool.query(
        `UPDATE romantic_surprises SET status=$2, reason=$3, evidence_ids=$4::jsonb, message=$5, planned_for=$6, sent_at=$7, blocked_reason=$8, acknowledged_at=$9, metadata=$10::jsonb, updated_at=$11 WHERE id=$1 RETURNING *`,
        [id, next.status, next.reason || "", JSON.stringify(next.evidence_ids || []), next.message || "", next.planned_for || iso(now), next.sent_at || null, next.blocked_reason || null, next.acknowledged_at || null, JSON.stringify(next.metadata || {}), next.updated_at],
      );
      return mapRow(result.rows[0]);
    }
    const row = rows.find(r => r.id === id && (!companionId || r.companion_id === companionId) && (!customerId || r.customer_id === customerId));
    if (!row) return null;
    Object.assign(row, patch, { updated_at: iso(now) }); return row;
  }

  async function listRecent({ companionId, customerId, limit = 10 } = {}) {
    if (pool?.query) {
      const result = await pool.query("SELECT * FROM romantic_surprises WHERE companion_id = $1 AND customer_id = $2 ORDER BY created_at DESC LIMIT $3", [companionId, customerId, Math.min(Number(limit) || 10, 100)]);
      return result.rows.map(mapRow);
    }
    return rows
      .filter(r => r.companion_id === companionId && r.customer_id === customerId)
      .sort((a, b) => compareIsoDesc(a.created_at, b.created_at))
      .slice(0, limit);
  }

  async function getDue({ companionId, customerId, now = new Date(), limit = 5 } = {}) {
    if (pool?.query) {
      const result = await pool.query("SELECT * FROM romantic_surprises WHERE companion_id = $1 AND customer_id = $2 AND status = 'planned' AND planned_for <= $3 ORDER BY planned_for ASC LIMIT $4", [companionId, customerId, iso(now), Math.min(Number(limit) || 5, 50)]);
      return result.rows.map(mapRow);
    }
    const t = now.getTime();
    return rows
      .filter(r => r.companion_id === companionId && r.customer_id === customerId && r.status === "planned" && new Date(r.planned_for).getTime() <= t)
      .sort((a, b) => compareIsoAsc(a.planned_for, b.planned_for))
      .slice(0, limit);
  }

  async function markSent({ id, companionId, customerId, now = new Date(), metadata = {} } = {}) { return update({ id, companionId, customerId, now, patch: { status: "sent", sent_at: iso(now), blocked_reason: null, metadata } }); }
  async function markBlocked({ id, companionId, customerId, reason, now = new Date() } = {}) { return update({ id, companionId, customerId, now, patch: { status: "blocked", blocked_reason: reason } }); }
  async function acknowledgeLatest({ companionId, customerId, now = new Date(), reaction = "" } = {}) {
    const candidates = pool?.query
      ? (await pool.query("SELECT * FROM romantic_surprises WHERE companion_id = $1 AND customer_id = $2 AND status = 'sent' AND acknowledged_at IS NULL ORDER BY sent_at DESC NULLS LAST LIMIT 1", [companionId, customerId])).rows.map(mapRow)
      : rows
        .filter(r => r.companion_id === companionId && r.customer_id === customerId && r.status === "sent" && !r.acknowledged_at)
        .sort((a, b) => compareIsoDesc(a.sent_at, b.sent_at))
        .slice(0, 1);
    const row = candidates[0];
    if (!row) return null;
    return update({ id: row.id, companionId, customerId, now, patch: { status: "acknowledged", acknowledged_at: iso(now), metadata: { ...(row.metadata || {}), acknowledgedReaction: reaction } } });
  }
  async function expireIgnored({ companionId, customerId, olderThan = new Date(Date.now() - 48 * 3600000), now = new Date() } = {}) {
    if (pool?.query) {
      const result = await pool.query("UPDATE romantic_surprises SET status = 'expired', updated_at = $4 WHERE companion_id = $1 AND customer_id = $2 AND status = 'sent' AND sent_at < $3", [companionId, customerId, iso(olderThan), iso(now)]);
      return result.rowCount || 0;
    }
    let expired = 0;
    for (const r of rows) if (r.companion_id === companionId && r.customer_id === customerId && r.status === "sent" && new Date(r.sent_at).getTime() < olderThan.getTime()) { r.status = "expired"; r.updated_at = iso(now); expired++; }
    return expired;
  }
  async function createTemporaryBlock({ companionId, customerId, reason = "not_now", until, now = new Date() } = {}) {
    return create({ companionId, customerId, surpriseType: "temporary_block", status: "blocked", reason, blockedReason: reason, plannedFor: until || now, metadata: { blockUntil: iso(until || now), temporaryBlock: true }, now });
  }
  async function getActiveTemporaryBlock({ companionId, customerId, now = new Date() } = {}) {
    if (pool?.query) {
      const result = await pool.query(
        "SELECT * FROM romantic_surprises WHERE companion_id = $1 AND customer_id = $2 AND status = 'blocked' AND metadata->>'temporaryBlock' = 'true' AND metadata->>'blockUntil' > $3 ORDER BY created_at DESC LIMIT 1",
        [companionId, customerId, iso(now)],
      );
      return mapRow(result.rows[0]) || null;
    }
    return rows
      .filter(r => r.companion_id === companionId && r.customer_id === customerId && r.status === "blocked" && r.metadata?.temporaryBlock && new Date(r.metadata.blockUntil || 0).getTime() > now.getTime())
      .sort((a, b) => compareIsoDesc(a.created_at, b.created_at))[0] || null;
  }
  return { init, create, update, listRecent, getDue, markSent, markBlocked, acknowledgeLatest, expireIgnored, createTemporaryBlock, getActiveTemporaryBlock, _rows: rows, db: pool, CREATE_TABLE_SQL, CREATE_SCHEMA_REGISTRY_SQL };
}

module.exports = { createRomanticSurpriseStore, CREATE_TABLE_SQL, CREATE_SCHEMA_REGISTRY_SQL };
