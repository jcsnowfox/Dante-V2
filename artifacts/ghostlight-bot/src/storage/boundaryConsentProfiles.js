"use strict";
const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    boundary_type: r.boundary_type || 'other',
    boundary_key: r.boundary_key,
    boundary_summary: r.boundary_summary || '',
    allowed: r.allowed !== false && r.allowed !== 'false',
    intensity_level: r.intensity_level || 'medium',
    consent_scope: r.consent_scope || 'all_channels',
    privacy_scope: r.privacy_scope || 'normal',
    adult_context: !!r.adult_context,
    source_channel_id: r.source_channel_id || '',
    source_message_id: r.source_message_id || '',
    confidence: Number(r.confidence) || 0.7,
    active: r.active !== false && r.active !== 'false',
    created_at: r.created_at,
    updated_at: r.updated_at,
    last_confirmed_at: r.last_confirmed_at || null,
  };
}

function createFallbackStore() {
  const rows = [];
  let id = 1;
  return {
    available: true,
    async init() {},
    async upsertBoundary(p) {
      const t = nowIso();
      let row = rows.find(x =>
        x.user_scope === p.user_scope &&
        x.companion_id === p.companion_id &&
        x.boundary_key === p.boundary_key
      );
      if (row) {
        Object.assign(row, {
          boundary_type: p.boundary_type || row.boundary_type,
          boundary_summary: p.boundary_summary || row.boundary_summary,
          allowed: p.allowed !== undefined ? p.allowed : row.allowed,
          intensity_level: p.intensity_level || row.intensity_level,
          consent_scope: p.consent_scope || row.consent_scope,
          privacy_scope: p.privacy_scope || row.privacy_scope,
          adult_context: p.adult_context !== undefined ? !!p.adult_context : row.adult_context,
          source_channel_id: p.source_channel_id || row.source_channel_id,
          source_message_id: p.source_message_id || row.source_message_id,
          confidence: Math.max(Number(row.confidence) || 0, Number(p.confidence) || 0),
          active: true,
          updated_at: t,
          last_confirmed_at: t,
        });
        return mapRow(row);
      }
      row = {
        id: id++,
        user_scope: p.user_scope,
        companion_id: p.companion_id,
        boundary_type: p.boundary_type || 'other',
        boundary_key: p.boundary_key,
        boundary_summary: p.boundary_summary || '',
        allowed: p.allowed !== undefined ? p.allowed : false,
        intensity_level: p.intensity_level || 'medium',
        consent_scope: p.consent_scope || 'all_channels',
        privacy_scope: p.privacy_scope || 'normal',
        adult_context: !!p.adult_context,
        source_channel_id: p.source_channel_id || '',
        source_message_id: p.source_message_id || '',
        confidence: p.confidence || 0.7,
        active: true,
        created_at: t,
        updated_at: t,
        last_confirmed_at: t,
      };
      rows.push(row);
      return mapRow(row);
    },
    async listBoundaries(q = {}) {
      const excludeAdult = !q.include_adult;
      return rows
        .filter(r =>
          (!q.user_scope || r.user_scope === q.user_scope) &&
          (!q.companion_id || r.companion_id === q.companion_id) &&
          (!q.active_only || r.active !== false) &&
          (excludeAdult ? !r.adult_context : true)
        )
        .sort((a, b) => (b.confidence - a.confidence) || (new Date(b.updated_at) - new Date(a.updated_at)))
        .slice(0, Math.min(q.limit || 100, 200))
        .map(mapRow);
    },
    async deactivate({ id }) {
      const row = rows.find(r => r.id === id);
      if (row) { row.active = false; row.updated_at = nowIso(); }
      return mapRow(row) || null;
    },
    async confirm({ id }) {
      const row = rows.find(r => r.id === id);
      if (row) { row.last_confirmed_at = nowIso(); row.updated_at = nowIso(); }
      return mapRow(row) || null;
    },
  };
}

const SQL = `CREATE TABLE IF NOT EXISTS boundary_consent_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_scope TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  boundary_type TEXT NOT NULL DEFAULT 'other',
  boundary_key TEXT NOT NULL,
  boundary_summary TEXT NOT NULL DEFAULT '',
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  intensity_level TEXT NOT NULL DEFAULT 'medium',
  consent_scope TEXT NOT NULL DEFAULT 'all_channels',
  privacy_scope TEXT NOT NULL DEFAULT 'normal',
  adult_context BOOLEAN NOT NULL DEFAULT FALSE,
  source_channel_id TEXT NOT NULL DEFAULT '',
  source_message_id TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.7,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_confirmed_at TIMESTAMPTZ,
  UNIQUE(user_scope, companion_id, boundary_key)
);`;

function createBoundaryConsentStore({ config, logger } = {}) {
  let pool = null;
  try { pool = createPostgresPool({ config }); } catch {}
  if (!pool) return createFallbackStore();
  return {
    available: true,
    async init() {
      await pool.query(SQL);
      await pool.query("CREATE INDEX IF NOT EXISTS bcp_scope_idx ON boundary_consent_profiles (user_scope, companion_id, active)");
      logger?.info?.("[boundary-consent] storage initialised");
    },
    async upsertBoundary(p) {
      const { rows } = await pool.query(
        `INSERT INTO boundary_consent_profiles
           (user_scope, companion_id, boundary_type, boundary_key, boundary_summary, allowed, intensity_level, consent_scope, privacy_scope, adult_context, source_channel_id, source_message_id, confidence, active, last_confirmed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,NOW())
         ON CONFLICT (user_scope, companion_id, boundary_key) DO UPDATE SET
           boundary_type=EXCLUDED.boundary_type,
           boundary_summary=EXCLUDED.boundary_summary,
           allowed=EXCLUDED.allowed,
           intensity_level=EXCLUDED.intensity_level,
           consent_scope=EXCLUDED.consent_scope,
           privacy_scope=EXCLUDED.privacy_scope,
           adult_context=EXCLUDED.adult_context,
           source_channel_id=EXCLUDED.source_channel_id,
           source_message_id=EXCLUDED.source_message_id,
           confidence=GREATEST(boundary_consent_profiles.confidence, EXCLUDED.confidence),
           active=true,
           last_confirmed_at=NOW(),
           updated_at=NOW()
         RETURNING *`,
        [
          p.user_scope, p.companion_id, p.boundary_type || 'other', p.boundary_key,
          p.boundary_summary || '', p.allowed !== false, p.intensity_level || 'medium',
          p.consent_scope || 'all_channels', p.privacy_scope || 'normal', !!p.adult_context,
          p.source_channel_id || '', p.source_message_id || '', p.confidence || 0.7,
        ]
      );
      return mapRow(rows[0]);
    },
    async listBoundaries(q = {}) {
      const excludeAdult = !q.include_adult;
      const { rows } = await pool.query(
        `SELECT * FROM boundary_consent_profiles
         WHERE user_scope=$1 AND companion_id=$2
         ${q.active_only ? ' AND active=true' : ''}
         ${excludeAdult ? ' AND adult_context=false' : ''}
         ORDER BY confidence DESC, updated_at DESC LIMIT $3`,
        [q.user_scope, q.companion_id, Math.min(q.limit || 100, 200)]
      );
      return rows.map(mapRow);
    },
    async deactivate({ id }) {
      const { rows } = await pool.query(
        'UPDATE boundary_consent_profiles SET active=false, updated_at=NOW() WHERE id=$1 RETURNING *',
        [id]
      );
      return mapRow(rows[0]) || null;
    },
    async confirm({ id }) {
      const { rows } = await pool.query(
        'UPDATE boundary_consent_profiles SET last_confirmed_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *',
        [id]
      );
      return mapRow(rows[0]) || null;
    },
  };
}

module.exports = { createBoundaryConsentStore };
