/**
 * storage/relationalState
 *
 * Raw `pg` store for the Relational State Engine. Mirrors the emotionalArc and
 * feedbackLearning stores: CREATE TABLE IF NOT EXISTS migrations inline,
 * BEGIN/COMMIT in init(), mapRow helpers, and companion_id on every table +
 * every query for strict isolation. When there is no pool (no DATABASE_URL),
 * every method is a safe no-op so the engine stays inert.
 *
 * Tables:
 *   companion_system_settings        — shared owner-config table (per system_key)
 *   companion_relational_states      — current relational state per companion
 *   companion_relational_events      — raw appraised relational events
 *   companion_relational_arcs        — longer relationship arcs
 *   companion_relational_repairs     — repair records (inert suggestions)
 *   companion_relational_desires     — internal desires (never executed)
 *   companion_relational_audit_log   — every decision + reason
 *
 * This engine does NOT create emotion or learning tables — those are owned by
 * the Emotional Arc and Feedback & Learning engines and are reused, not copied.
 */

function mapSettingsRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companionId: row.companion_id,
    systemKey: row.system_key,
    enabled: row.enabled,
    ownerEditable: row.owner_editable,
    config: row.config_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStateRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companionId: row.companion_id,
    trustLevel: Number(row.trust_level),
    closenessLevel: Number(row.closeness_level),
    distanceLevel: Number(row.distance_level),
    currentEmotion: row.current_emotion,
    currentWant: row.current_want,
    currentDesire: row.current_desire,
    repairNeeded: row.repair_needed,
    activeTension: Number(row.active_tension),
    activeLonging: Number(row.active_longing),
    lastTriggerSummary: row.last_trigger_summary,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    relationalEventId: row.id,
    companionId: row.companion_id,
    source: row.source,
    sourceMessageId: row.source_message_id,
    channelId: row.channel_id,
    eventType: row.event_type,
    triggerSummary: row.trigger_summary,
    detectedState: row.detected_state_json || {},
    confidence: row.confidence == null ? null : Number(row.confidence),
    createdAt: row.created_at,
  };
}

function mapArcRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companionId: row.companion_id,
    arcType: row.arc_type,
    startState: row.start_state_json || {},
    currentState: row.current_state_json || {},
    targetResolution: row.target_resolution,
    status: row.status,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRepairRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    repairId: row.id,
    companionId: row.companion_id,
    relationalEventId: row.relational_event_id,
    repairType: row.repair_type,
    repairNeeded: row.repair_needed,
    repairMessage: row.repair_message,
    accepted: row.accepted,
    resolved: row.resolved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDesireRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    desireId: row.id,
    companionId: row.companion_id,
    desireType: row.desire_type,
    intensity: Number(row.intensity),
    reason: row.reason,
    allowedAction: row.allowed_action,
    requiresPermission: row.requires_permission,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companionId: row.companion_id,
    eventType: row.event_type,
    decision: row.decision,
    reason: row.reason,
    inputSummary: row.input_summary,
    outputSummary: row.output_summary,
    createdAt: row.created_at,
  };
}

function createRelationalStateStore({ pool, logger }) {
  const available = Boolean(pool);

  async function init() {
    if (!available) {
      logger?.info?.("[relational-state] No database pool; store is inert.");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_system_settings (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          system_key TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          owner_editable BOOLEAN NOT NULL DEFAULT TRUE,
          config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (companion_id, system_key)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_relational_states (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          trust_level NUMERIC NOT NULL DEFAULT 5,
          closeness_level NUMERIC NOT NULL DEFAULT 5,
          distance_level NUMERIC NOT NULL DEFAULT 0,
          current_emotion TEXT,
          current_want TEXT,
          current_desire TEXT,
          repair_needed BOOLEAN NOT NULL DEFAULT FALSE,
          active_tension NUMERIC NOT NULL DEFAULT 0,
          active_longing NUMERIC NOT NULL DEFAULT 0,
          last_trigger_summary TEXT,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (companion_id)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_relational_events (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'chat',
          source_message_id TEXT,
          channel_id TEXT,
          event_type TEXT NOT NULL,
          trigger_summary TEXT,
          detected_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          confidence NUMERIC,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_companion_relational_events_companion
        ON companion_relational_events (companion_id, created_at DESC)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_relational_arcs (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          arc_type TEXT NOT NULL,
          start_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          current_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          target_resolution TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_companion_relational_arcs_companion
        ON companion_relational_arcs (companion_id, status, created_at DESC)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_relational_repairs (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          relational_event_id BIGINT,
          repair_type TEXT NOT NULL,
          repair_needed BOOLEAN NOT NULL DEFAULT TRUE,
          repair_message TEXT,
          accepted BOOLEAN,
          resolved BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_companion_relational_repairs_companion
        ON companion_relational_repairs (companion_id, resolved, created_at DESC)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_relational_desires (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          desire_type TEXT NOT NULL,
          intensity NUMERIC NOT NULL DEFAULT 0,
          reason TEXT,
          allowed_action TEXT,
          requires_permission BOOLEAN NOT NULL DEFAULT TRUE,
          status TEXT NOT NULL DEFAULT 'internal',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_companion_relational_desires_companion
        ON companion_relational_desires (companion_id, status, created_at DESC)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_relational_audit_log (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          decision TEXT NOT NULL,
          reason TEXT,
          input_summary TEXT,
          output_summary TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_companion_relational_audit_companion
        ON companion_relational_audit_log (companion_id, created_at DESC)
      `);

      await client.query("COMMIT");
      logger?.info?.("[relational-state] Storage initialised.");
    } catch (error) {
      await client.query("ROLLBACK");
      logger?.error?.("[relational-state] Storage init failed.", { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  async function loadSystemSettings({ companionId, systemKey }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `SELECT * FROM companion_system_settings WHERE companion_id = $1 AND system_key = $2 LIMIT 1`,
      [companionId, systemKey],
    );
    return mapSettingsRow(rows[0]);
  }

  async function upsertSystemSettings({ companionId, systemKey, enabled, ownerEditable, config }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_system_settings (companion_id, system_key, enabled, owner_editable, config_json, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (companion_id, system_key)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     owner_editable = EXCLUDED.owner_editable,
                     config_json = EXCLUDED.config_json,
                     updated_at = NOW()
       RETURNING *`,
      [companionId, systemKey, Boolean(enabled), Boolean(ownerEditable), JSON.stringify(config || {})],
    );
    return mapSettingsRow(rows[0]);
  }

  async function loadState({ companionId }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `SELECT * FROM companion_relational_states WHERE companion_id = $1 LIMIT 1`,
      [companionId],
    );
    return mapStateRow(rows[0]);
  }

  async function upsertState({
    companionId,
    trustLevel,
    closenessLevel,
    distanceLevel,
    currentEmotion,
    currentWant,
    currentDesire,
    repairNeeded,
    activeTension,
    activeLonging,
    lastTriggerSummary,
    expiresAt,
  }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_relational_states
        (companion_id, trust_level, closeness_level, distance_level, current_emotion, current_want, current_desire,
         repair_needed, active_tension, active_longing, last_trigger_summary, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT (companion_id)
       DO UPDATE SET trust_level = EXCLUDED.trust_level,
                     closeness_level = EXCLUDED.closeness_level,
                     distance_level = EXCLUDED.distance_level,
                     current_emotion = EXCLUDED.current_emotion,
                     current_want = EXCLUDED.current_want,
                     current_desire = EXCLUDED.current_desire,
                     repair_needed = EXCLUDED.repair_needed,
                     active_tension = EXCLUDED.active_tension,
                     active_longing = EXCLUDED.active_longing,
                     last_trigger_summary = EXCLUDED.last_trigger_summary,
                     expires_at = EXCLUDED.expires_at,
                     updated_at = NOW()
       RETURNING *`,
      [
        companionId,
        Number(trustLevel ?? 5),
        Number(closenessLevel ?? 5),
        Number(distanceLevel ?? 0),
        currentEmotion || null,
        currentWant || null,
        currentDesire || null,
        Boolean(repairNeeded),
        Number(activeTension ?? 0),
        Number(activeLonging ?? 0),
        lastTriggerSummary || null,
        expiresAt || null,
      ],
    );
    return mapStateRow(rows[0]);
  }

  async function insertEvent({
    companionId,
    source,
    sourceMessageId,
    channelId,
    eventType,
    triggerSummary,
    detectedState,
    confidence,
  }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_relational_events
        (companion_id, source, source_message_id, channel_id, event_type, trigger_summary, detected_state_json, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [
        companionId,
        source || "chat",
        sourceMessageId || null,
        channelId || null,
        eventType,
        triggerSummary || null,
        JSON.stringify(detectedState || {}),
        confidence == null ? null : Number(confidence),
      ],
    );
    return mapEventRow(rows[0]);
  }

  async function listEvents({ companionId, limit = 50 }) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM companion_relational_events WHERE companion_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [companionId, limit],
    );
    return rows.map(mapEventRow);
  }

  async function countEventsSince({ companionId, since }) {
    if (!available) return 0;
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM companion_relational_events WHERE companion_id = $1 AND created_at >= $2`,
      [companionId, since],
    );
    return rows[0]?.count || 0;
  }

  async function insertArc({ companionId, arcType, startState, currentState, targetResolution, status }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_relational_arcs
        (companion_id, arc_type, start_state_json, current_state_json, target_resolution, status)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
       RETURNING *`,
      [
        companionId,
        arcType,
        JSON.stringify(startState || {}),
        JSON.stringify(currentState || {}),
        targetResolution || null,
        status || "open",
      ],
    );
    return mapArcRow(rows[0]);
  }

  async function listArcs({ companionId, status = null, limit = 25 }) {
    if (!available) return [];
    if (status) {
      const { rows } = await pool.query(
        `SELECT * FROM companion_relational_arcs WHERE companion_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3`,
        [companionId, status, limit],
      );
      return rows.map(mapArcRow);
    }
    const { rows } = await pool.query(
      `SELECT * FROM companion_relational_arcs WHERE companion_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [companionId, limit],
    );
    return rows.map(mapArcRow);
  }

  async function insertRepair({ companionId, relationalEventId, repairType, repairNeeded, repairMessage }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_relational_repairs
        (companion_id, relational_event_id, repair_type, repair_needed, repair_message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        companionId,
        relationalEventId || null,
        repairType,
        repairNeeded == null ? true : Boolean(repairNeeded),
        repairMessage || null,
      ],
    );
    return mapRepairRow(rows[0]);
  }

  async function listRepairs({ companionId, resolved = null, limit = 50 }) {
    if (!available) return [];
    if (resolved === null) {
      const { rows } = await pool.query(
        `SELECT * FROM companion_relational_repairs WHERE companion_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [companionId, limit],
      );
      return rows.map(mapRepairRow);
    }
    const { rows } = await pool.query(
      `SELECT * FROM companion_relational_repairs WHERE companion_id = $1 AND resolved = $2 ORDER BY created_at DESC LIMIT $3`,
      [companionId, Boolean(resolved), limit],
    );
    return rows.map(mapRepairRow);
  }

  async function resolveRepair({ companionId, repairId, accepted }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `UPDATE companion_relational_repairs
       SET resolved = TRUE, accepted = $3, updated_at = NOW()
       WHERE companion_id = $1 AND id = $2 RETURNING *`,
      [companionId, repairId, accepted == null ? null : Boolean(accepted)],
    );
    return mapRepairRow(rows[0]);
  }

  async function insertDesire({ companionId, desireType, intensity, reason, allowedAction, requiresPermission, status }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_relational_desires
        (companion_id, desire_type, intensity, reason, allowed_action, requires_permission, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        companionId,
        desireType,
        Number(intensity ?? 0),
        reason || null,
        allowedAction || null,
        requiresPermission == null ? true : Boolean(requiresPermission),
        status || "internal",
      ],
    );
    return mapDesireRow(rows[0]);
  }

  async function listDesires({ companionId, status = null, limit = 50 }) {
    if (!available) return [];
    if (status) {
      const { rows } = await pool.query(
        `SELECT * FROM companion_relational_desires WHERE companion_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3`,
        [companionId, status, limit],
      );
      return rows.map(mapDesireRow);
    }
    const { rows } = await pool.query(
      `SELECT * FROM companion_relational_desires WHERE companion_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [companionId, limit],
    );
    return rows.map(mapDesireRow);
  }

  async function appendAuditLog({ companionId, eventType, decision, reason, inputSummary, outputSummary }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_relational_audit_log
        (companion_id, event_type, decision, reason, input_summary, output_summary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [companionId, eventType, decision, reason || null, inputSummary || null, outputSummary || null],
    );
    return mapAuditRow(rows[0]);
  }

  async function listAuditLog({ companionId, limit = 50 }) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM companion_relational_audit_log WHERE companion_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [companionId, limit],
    );
    return rows.map(mapAuditRow);
  }

  async function getStoreSummary({ companionId }) {
    if (!available) return { available: false };
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM companion_relational_events WHERE companion_id = $1) AS events,
         (SELECT COUNT(*)::int FROM companion_relational_desires WHERE companion_id = $1) AS desires,
         (SELECT COUNT(*)::int FROM companion_relational_repairs WHERE companion_id = $1) AS repairs,
         (SELECT COUNT(*)::int FROM companion_relational_arcs WHERE companion_id = $1) AS arcs`,
      [companionId],
    );
    return {
      available: true,
      events: rows[0]?.events || 0,
      desires: rows[0]?.desires || 0,
      repairs: rows[0]?.repairs || 0,
      arcs: rows[0]?.arcs || 0,
    };
  }

  return {
    available,
    init,
    loadSystemSettings,
    upsertSystemSettings,
    loadState,
    upsertState,
    insertEvent,
    listEvents,
    countEventsSince,
    insertArc,
    listArcs,
    insertRepair,
    listRepairs,
    resolveRepair,
    insertDesire,
    listDesires,
    appendAuditLog,
    listAuditLog,
    getStoreSummary,
  };
}

module.exports = { createRelationalStateStore };
