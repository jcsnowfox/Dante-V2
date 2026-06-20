const { createPostgresPool } = require("../postgres/createPostgresPool");

const CREATE_EMOTION_PROFILES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS companion_emotion_profiles (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    emotional_depth TEXT NOT NULL DEFAULT 'light',
    baseline_temperament_json JSONB NOT NULL DEFAULT '{}',
    thresholds_json JSONB NOT NULL DEFAULT '{}',
    decay_rates_json JSONB NOT NULL DEFAULT '{}',
    expression_style_json JSONB NOT NULL DEFAULT '{}',
    blocked_expressions_json JSONB NOT NULL DEFAULT '[]',
    allowed_expressions_json JSONB NOT NULL DEFAULT '[]',
    repair_style_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_EMOTION_STATES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS companion_emotion_states (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    primary_emotion TEXT NOT NULL,
    secondary_emotion TEXT,
    intensity NUMERIC(4,2) NOT NULL DEFAULT 0,
    trigger_summary TEXT,
    source_event_id TEXT,
    expression_allowed BOOLEAN NOT NULL DEFAULT false,
    expression_mode TEXT NOT NULL DEFAULT 'internal_only',
    action_allowed BOOLEAN NOT NULL DEFAULT false,
    repair_needed BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_EMOTION_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS companion_emotion_events (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_message_id TEXT,
    event_type TEXT NOT NULL,
    context_summary TEXT,
    detected_emotions_json JSONB NOT NULL DEFAULT '[]',
    confidence NUMERIC(4,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_EMOTION_ARCS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS companion_emotion_arcs (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    arc_type TEXT NOT NULL,
    start_emotion TEXT NOT NULL,
    current_emotion TEXT NOT NULL,
    target_resolution TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_EMOTION_REPAIRS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS companion_emotion_repairs (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    emotion_state_id BIGINT,
    repair_type TEXT NOT NULL,
    repair_message TEXT,
    accepted BOOLEAN,
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_EMOTION_AUDIT_LOG_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS companion_emotion_audit_log (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT,
    input_summary TEXT,
    output_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS emotion_profiles_companion_id_idx ON companion_emotion_profiles (companion_id);",
  "CREATE INDEX IF NOT EXISTS emotion_states_companion_id_idx ON companion_emotion_states (companion_id, updated_at DESC);",
  "CREATE INDEX IF NOT EXISTS emotion_events_companion_id_idx ON companion_emotion_events (companion_id, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS emotion_arcs_companion_status_idx ON companion_emotion_arcs (companion_id, status, updated_at DESC);",
  "CREATE INDEX IF NOT EXISTS emotion_repairs_companion_id_idx ON companion_emotion_repairs (companion_id, resolved, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS emotion_audit_companion_id_idx ON companion_emotion_audit_log (companion_id, created_at DESC);",
];

function mapProfileRow(row) {
  return {
    id: row.id,
    companionId: row.companion_id,
    enabled: row.enabled,
    emotionalDepth: row.emotional_depth,
    baselineTemperament: row.baseline_temperament_json || {},
    thresholds: row.thresholds_json || {},
    decayRates: row.decay_rates_json || {},
    expressionStyle: row.expression_style_json || {},
    blockedExpressions: row.blocked_expressions_json || [],
    allowedExpressions: row.allowed_expressions_json || [],
    repairStyle: row.repair_style_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStateRow(row) {
  return {
    id: row.id,
    companionId: row.companion_id,
    primaryEmotion: row.primary_emotion,
    secondaryEmotion: row.secondary_emotion || null,
    intensity: Number(row.intensity || 0),
    triggerSummary: row.trigger_summary || null,
    sourceEventId: row.source_event_id || null,
    expressionAllowed: row.expression_allowed,
    expressionMode: row.expression_mode,
    actionAllowed: row.action_allowed,
    repairNeeded: row.repair_needed,
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEventRow(row) {
  return {
    id: row.id,
    companionId: row.companion_id,
    source: row.source,
    sourceMessageId: row.source_message_id || null,
    eventType: row.event_type,
    contextSummary: row.context_summary || null,
    detectedEmotions: row.detected_emotions_json || [],
    confidence: Number(row.confidence || 0),
    createdAt: row.created_at,
  };
}

function mapArcRow(row) {
  return {
    id: row.id,
    companionId: row.companion_id,
    arcType: row.arc_type,
    startEmotion: row.start_emotion,
    currentEmotion: row.current_emotion,
    targetResolution: row.target_resolution || null,
    status: row.status,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRepairRow(row) {
  return {
    id: row.id,
    companionId: row.companion_id,
    emotionStateId: row.emotion_state_id || null,
    repairType: row.repair_type,
    repairMessage: row.repair_message || null,
    accepted: row.accepted,
    resolved: row.resolved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditRow(row) {
  return {
    id: row.id,
    companionId: row.companion_id,
    eventType: row.event_type,
    decision: row.decision,
    reason: row.reason || null,
    inputSummary: row.input_summary || null,
    outputSummary: row.output_summary || null,
    createdAt: row.created_at,
  };
}

function createEmotionalArcStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  async function init() {
    if (!pool) {
      logger.warn("[emotional-arc:storage] No database configured, skipping table creation.");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(CREATE_EMOTION_PROFILES_TABLE_SQL);
      await client.query(CREATE_EMOTION_STATES_TABLE_SQL);
      await client.query(CREATE_EMOTION_EVENTS_TABLE_SQL);
      await client.query(CREATE_EMOTION_ARCS_TABLE_SQL);
      await client.query(CREATE_EMOTION_REPAIRS_TABLE_SQL);
      await client.query(CREATE_EMOTION_AUDIT_LOG_TABLE_SQL);
      for (const indexSql of CREATE_INDEXES_SQL) {
        await client.query(indexSql);
      }
      await client.query("COMMIT");
      logger.info("[emotional-arc:storage] Tables initialised.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function upsertProfile({ companionId, profile }) {
    if (!pool) return null;
    const result = await pool.query(
      `INSERT INTO companion_emotion_profiles
        (companion_id, enabled, emotional_depth, baseline_temperament_json, thresholds_json,
         decay_rates_json, expression_style_json, blocked_expressions_json, allowed_expressions_json,
         repair_style_json, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (companion_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         emotional_depth = EXCLUDED.emotional_depth,
         baseline_temperament_json = EXCLUDED.baseline_temperament_json,
         thresholds_json = EXCLUDED.thresholds_json,
         decay_rates_json = EXCLUDED.decay_rates_json,
         expression_style_json = EXCLUDED.expression_style_json,
         blocked_expressions_json = EXCLUDED.blocked_expressions_json,
         allowed_expressions_json = EXCLUDED.allowed_expressions_json,
         repair_style_json = EXCLUDED.repair_style_json,
         updated_at = NOW()
       RETURNING *`,
      [
        companionId,
        profile.enabled !== false,
        profile.emotionalDepth || "light",
        JSON.stringify(profile.baselineTemperament || {}),
        JSON.stringify(profile.thresholds || {}),
        JSON.stringify(profile.decayRates || {}),
        JSON.stringify(profile.expressionStyle || {}),
        JSON.stringify(profile.blockedExpressions || []),
        JSON.stringify(profile.allowedExpressions || []),
        JSON.stringify(profile.repairStyle || {}),
      ],
    );
    return result.rows[0] ? mapProfileRow(result.rows[0]) : null;
  }

  async function loadProfile(companionId) {
    if (!pool) return null;
    const result = await pool.query(
      "SELECT * FROM companion_emotion_profiles WHERE companion_id = $1 LIMIT 1",
      [companionId],
    );
    return result.rows[0] ? mapProfileRow(result.rows[0]) : null;
  }

  async function saveEmotionState({ companionId, primaryEmotion, secondaryEmotion = null, intensity, triggerSummary = null, sourceEventId = null, expressionAllowed = false, expressionMode = "internal_only", actionAllowed = false, repairNeeded = false, expiresAt = null }) {
    if (!pool) return null;
    const result = await pool.query(
      `INSERT INTO companion_emotion_states
        (companion_id, primary_emotion, secondary_emotion, intensity, trigger_summary,
         source_event_id, expression_allowed, expression_mode, action_allowed, repair_needed, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [companionId, primaryEmotion, secondaryEmotion, intensity, triggerSummary,
        sourceEventId, expressionAllowed, expressionMode, actionAllowed, repairNeeded, expiresAt],
    );
    return result.rows[0] ? mapStateRow(result.rows[0]) : null;
  }

  async function loadCurrentEmotionState(companionId) {
    if (!pool) return null;
    const result = await pool.query(
      `SELECT * FROM companion_emotion_states
       WHERE companion_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY updated_at DESC LIMIT 1`,
      [companionId],
    );
    return result.rows[0] ? mapStateRow(result.rows[0]) : null;
  }

  async function updateEmotionState({ id, intensity, expressionAllowed, expressionMode, actionAllowed, repairNeeded, expiresAt }) {
    if (!pool) return null;
    const result = await pool.query(
      `UPDATE companion_emotion_states SET
         intensity = COALESCE($2, intensity),
         expression_allowed = COALESCE($3, expression_allowed),
         expression_mode = COALESCE($4, expression_mode),
         action_allowed = COALESCE($5, action_allowed),
         repair_needed = COALESCE($6, repair_needed),
         expires_at = COALESCE($7, expires_at),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, intensity, expressionAllowed, expressionMode, actionAllowed, repairNeeded, expiresAt],
    );
    return result.rows[0] ? mapStateRow(result.rows[0]) : null;
  }

  async function recordEmotionEvent({ companionId, source, sourceMessageId = null, eventType, contextSummary = null, detectedEmotions = [], confidence = 0 }) {
    if (!pool) return null;
    const result = await pool.query(
      `INSERT INTO companion_emotion_events
        (companion_id, source, source_message_id, event_type, context_summary, detected_emotions_json, confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [companionId, source, sourceMessageId, eventType, contextSummary, JSON.stringify(detectedEmotions), confidence],
    );
    return result.rows[0] ? mapEventRow(result.rows[0]) : null;
  }

  async function listRecentEmotionEvents({ companionId, limit = 20 }) {
    if (!pool) return [];
    const result = await pool.query(
      "SELECT * FROM companion_emotion_events WHERE companion_id = $1 ORDER BY created_at DESC LIMIT $2",
      [companionId, limit],
    );
    return result.rows.map(mapEventRow);
  }

  async function saveEmotionArc({ companionId, arcType, startEmotion, currentEmotion, targetResolution = null }) {
    if (!pool) return null;
    const result = await pool.query(
      `INSERT INTO companion_emotion_arcs
        (companion_id, arc_type, start_emotion, current_emotion, target_resolution)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [companionId, arcType, startEmotion, currentEmotion, targetResolution],
    );
    return result.rows[0] ? mapArcRow(result.rows[0]) : null;
  }

  async function loadActiveArc(companionId) {
    if (!pool) return null;
    const result = await pool.query(
      "SELECT * FROM companion_emotion_arcs WHERE companion_id = $1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
      [companionId],
    );
    return result.rows[0] ? mapArcRow(result.rows[0]) : null;
  }

  async function updateArcStatus({ id, currentEmotion, status, resolvedAt = null }) {
    if (!pool) return null;
    const result = await pool.query(
      `UPDATE companion_emotion_arcs SET
         current_emotion = COALESCE($2, current_emotion),
         status = COALESCE($3, status),
         resolved_at = COALESCE($4, resolved_at),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, currentEmotion, status, resolvedAt],
    );
    return result.rows[0] ? mapArcRow(result.rows[0]) : null;
  }

  async function saveRepair({ companionId, emotionStateId = null, repairType, repairMessage = null }) {
    if (!pool) return null;
    const result = await pool.query(
      `INSERT INTO companion_emotion_repairs (companion_id, emotion_state_id, repair_type, repair_message)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [companionId, emotionStateId, repairType, repairMessage],
    );
    return result.rows[0] ? mapRepairRow(result.rows[0]) : null;
  }

  async function resolveRepair({ id, accepted }) {
    if (!pool) return null;
    const result = await pool.query(
      "UPDATE companion_emotion_repairs SET accepted = $2, resolved = true, updated_at = NOW() WHERE id = $1 RETURNING *",
      [id, accepted],
    );
    return result.rows[0] ? mapRepairRow(result.rows[0]) : null;
  }

  async function listOpenRepairs(companionId) {
    if (!pool) return [];
    const result = await pool.query(
      "SELECT * FROM companion_emotion_repairs WHERE companion_id = $1 AND resolved = false ORDER BY created_at DESC",
      [companionId],
    );
    return result.rows.map(mapRepairRow);
  }

  async function appendAuditLog({ companionId, eventType, decision, reason = null, inputSummary = null, outputSummary = null }) {
    if (!pool) return null;
    const result = await pool.query(
      `INSERT INTO companion_emotion_audit_log
        (companion_id, event_type, decision, reason, input_summary, output_summary)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [companionId, eventType, decision, reason, inputSummary, outputSummary],
    );
    return result.rows[0] ? mapAuditRow(result.rows[0]) : null;
  }

  async function listAuditLog({ companionId, limit = 50 }) {
    if (!pool) return [];
    const result = await pool.query(
      "SELECT * FROM companion_emotion_audit_log WHERE companion_id = $1 ORDER BY created_at DESC LIMIT $2",
      [companionId, limit],
    );
    return result.rows.map(mapAuditRow);
  }

  async function getStoreSummary(companionId) {
    if (!pool) return { available: false };
    const [states, events, arcs, repairs] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM companion_emotion_states WHERE companion_id = $1", [companionId]),
      pool.query("SELECT COUNT(*) FROM companion_emotion_events WHERE companion_id = $1", [companionId]),
      pool.query("SELECT COUNT(*) FROM companion_emotion_arcs WHERE companion_id = $1", [companionId]),
      pool.query("SELECT COUNT(*) FROM companion_emotion_repairs WHERE companion_id = $1 AND resolved = false", [companionId]),
    ]);
    return {
      available: true,
      companionId,
      totalStates: Number(states.rows[0].count),
      totalEvents: Number(events.rows[0].count),
      totalArcs: Number(arcs.rows[0].count),
      openRepairs: Number(repairs.rows[0].count),
    };
  }

  return {
    init,
    upsertProfile,
    loadProfile,
    saveEmotionState,
    loadCurrentEmotionState,
    updateEmotionState,
    recordEmotionEvent,
    listRecentEmotionEvents,
    saveEmotionArc,
    loadActiveArc,
    updateArcStatus,
    saveRepair,
    resolveRepair,
    listOpenRepairs,
    appendAuditLog,
    listAuditLog,
    getStoreSummary,
  };
}

module.exports = { createEmotionalArcStore };
