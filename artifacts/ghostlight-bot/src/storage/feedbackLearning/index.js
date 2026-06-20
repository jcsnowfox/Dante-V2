/**
 * storage/feedbackLearning
 *
 * Raw `pg` store for the Feedback & Learning Engine. Mirrors the emotionalArc
 * store: CREATE TABLE IF NOT EXISTS migrations inline, BEGIN/COMMIT in init(),
 * mapRow helpers, and companion_id on every table + every query for strict
 * isolation. When there is no pool (no DATABASE_URL), every method is a safe
 * no-op so the engine stays inert.
 *
 * Tables:
 *   companion_system_settings      — shared owner-config table (per system_key)
 *   companion_feedback_events      — raw owner feedback
 *   companion_learning_proposals   — inert suggestions awaiting review
 *   companion_learning_applications— record of applied proposals
 *   companion_feedback_audit_log   — every decision + reason
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

function mapEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    feedbackEventId: row.id,
    companionId: row.companion_id,
    feedbackTypeId: row.feedback_type_id,
    feedbackLabel: row.feedback_label,
    feedbackText: row.feedback_text,
    sourceMessageId: row.source_message_id,
    channelId: row.channel_id,
    ownerId: row.owner_id,
    targetExcerpt: row.target_excerpt,
    contextSummary: row.context_summary,
    createdAt: row.created_at,
  };
}

function mapProposalRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    proposalId: row.id,
    companionId: row.companion_id,
    feedbackEventId: row.feedback_event_id,
    proposalType: row.proposal_type,
    targetSystem: row.target_system,
    riskLevel: row.risk_level,
    summary: row.summary,
    proposedChange: row.proposed_change_json || {},
    status: row.status,
    requiresReview: row.requires_review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApplicationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companionId: row.companion_id,
    proposalId: row.proposal_id,
    appliedChange: row.applied_change_json || {},
    appliedBy: row.applied_by,
    createdAt: row.created_at,
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

function createFeedbackLearningStore({ pool, logger }) {
  const available = Boolean(pool);

  async function init() {
    if (!available) {
      logger?.info?.("[feedback-learning] No database pool; store is inert.");
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
        CREATE TABLE IF NOT EXISTS companion_feedback_events (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          feedback_type_id TEXT NOT NULL,
          feedback_label TEXT,
          feedback_text TEXT,
          source_message_id TEXT,
          channel_id TEXT,
          owner_id TEXT,
          target_excerpt TEXT,
          context_summary TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_companion_feedback_events_companion
        ON companion_feedback_events (companion_id, created_at DESC)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_learning_proposals (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          feedback_event_id BIGINT,
          proposal_type TEXT NOT NULL,
          target_system TEXT NOT NULL,
          risk_level TEXT NOT NULL DEFAULT 'low',
          summary TEXT,
          proposed_change_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          status TEXT NOT NULL DEFAULT 'pending_review',
          requires_review BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_companion_learning_proposals_companion
        ON companion_learning_proposals (companion_id, status, created_at DESC)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_learning_applications (
          id BIGSERIAL PRIMARY KEY,
          companion_id TEXT NOT NULL,
          proposal_id BIGINT NOT NULL,
          applied_change_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          applied_by TEXT NOT NULL DEFAULT 'owner',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_companion_learning_applications_companion
        ON companion_learning_applications (companion_id, created_at DESC)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS companion_feedback_audit_log (
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
        CREATE INDEX IF NOT EXISTS idx_companion_feedback_audit_companion
        ON companion_feedback_audit_log (companion_id, created_at DESC)
      `);

      await client.query("COMMIT");
      logger?.info?.("[feedback-learning] Storage initialised.");
    } catch (error) {
      await client.query("ROLLBACK");
      logger?.error?.("[feedback-learning] Storage init failed.", { error: error.message });
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

  async function insertFeedbackEvent({
    companionId,
    feedbackTypeId,
    feedbackLabel,
    feedbackText,
    sourceMessageId,
    channelId,
    ownerId,
    targetExcerpt,
    contextSummary,
  }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_feedback_events
        (companion_id, feedback_type_id, feedback_label, feedback_text, source_message_id, channel_id, owner_id, target_excerpt, context_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        companionId,
        feedbackTypeId,
        feedbackLabel || null,
        feedbackText || null,
        sourceMessageId || null,
        channelId || null,
        ownerId || null,
        targetExcerpt || null,
        contextSummary || null,
      ],
    );
    return mapEventRow(rows[0]);
  }

  async function listFeedbackEvents({ companionId, limit = 50 }) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM companion_feedback_events WHERE companion_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [companionId, limit],
    );
    return rows.map(mapEventRow);
  }

  async function insertProposal({
    companionId,
    feedbackEventId,
    proposalType,
    targetSystem,
    riskLevel,
    summary,
    proposedChange,
    status,
    requiresReview,
  }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_learning_proposals
        (companion_id, feedback_event_id, proposal_type, target_system, risk_level, summary, proposed_change_json, status, requires_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       RETURNING *`,
      [
        companionId,
        feedbackEventId || null,
        proposalType,
        targetSystem,
        riskLevel || "low",
        summary || null,
        JSON.stringify(proposedChange || {}),
        status || "pending_review",
        Boolean(requiresReview),
      ],
    );
    return mapProposalRow(rows[0]);
  }

  async function listProposals({ companionId, status = null, limit = 50 }) {
    if (!available) return [];
    if (status) {
      const { rows } = await pool.query(
        `SELECT * FROM companion_learning_proposals WHERE companion_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3`,
        [companionId, status, limit],
      );
      return rows.map(mapProposalRow);
    }
    const { rows } = await pool.query(
      `SELECT * FROM companion_learning_proposals WHERE companion_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [companionId, limit],
    );
    return rows.map(mapProposalRow);
  }

  async function getProposal({ companionId, proposalId }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `SELECT * FROM companion_learning_proposals WHERE companion_id = $1 AND id = $2 LIMIT 1`,
      [companionId, proposalId],
    );
    return mapProposalRow(rows[0]);
  }

  async function updateProposalStatus({ companionId, proposalId, status }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `UPDATE companion_learning_proposals SET status = $3, updated_at = NOW()
       WHERE companion_id = $1 AND id = $2 RETURNING *`,
      [companionId, proposalId, status],
    );
    return mapProposalRow(rows[0]);
  }

  async function countProposalsSince({ companionId, since }) {
    if (!available) return 0;
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM companion_learning_proposals WHERE companion_id = $1 AND created_at >= $2`,
      [companionId, since],
    );
    return rows[0]?.count || 0;
  }

  async function listAppliedByTypes({ companionId, types, limit = 25 }) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT p.*, a.applied_change_json AS applied_change_json
       FROM companion_learning_proposals p
       LEFT JOIN LATERAL (
         SELECT applied_change_json FROM companion_learning_applications
         WHERE proposal_id = p.id AND companion_id = p.companion_id
         ORDER BY created_at DESC LIMIT 1
       ) a ON TRUE
       WHERE p.companion_id = $1 AND p.status = 'applied' AND p.proposal_type = ANY($2)
       ORDER BY p.updated_at DESC LIMIT $3`,
      [companionId, types, limit],
    );
    return rows.map((row) => {
      const proposal = mapProposalRow(row);
      proposal.appliedChange = row.applied_change_json || proposal.proposedChange;
      return proposal;
    });
  }

  async function insertApplication({ companionId, proposalId, appliedChange, appliedBy }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_learning_applications (companion_id, proposal_id, applied_change_json, applied_by)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING *`,
      [companionId, proposalId, JSON.stringify(appliedChange || {}), appliedBy || "owner"],
    );
    return mapApplicationRow(rows[0]);
  }

  async function appendAuditLog({ companionId, eventType, decision, reason, inputSummary, outputSummary }) {
    if (!available) return null;
    const { rows } = await pool.query(
      `INSERT INTO companion_feedback_audit_log
        (companion_id, event_type, decision, reason, input_summary, output_summary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        companionId,
        eventType,
        decision,
        reason || null,
        inputSummary || null,
        outputSummary || null,
      ],
    );
    return mapAuditRow(rows[0]);
  }

  async function listAuditLog({ companionId, limit = 50 }) {
    if (!available) return [];
    const { rows } = await pool.query(
      `SELECT * FROM companion_feedback_audit_log WHERE companion_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [companionId, limit],
    );
    return rows.map(mapAuditRow);
  }

  async function getStoreSummary({ companionId }) {
    if (!available) return { available: false };
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM companion_feedback_events WHERE companion_id = $1) AS events,
         (SELECT COUNT(*)::int FROM companion_learning_proposals WHERE companion_id = $1) AS proposals,
         (SELECT COUNT(*)::int FROM companion_learning_applications WHERE companion_id = $1) AS applications`,
      [companionId],
    );
    return {
      available: true,
      events: rows[0]?.events || 0,
      proposals: rows[0]?.proposals || 0,
      applications: rows[0]?.applications || 0,
    };
  }

  return {
    available,
    init,
    loadSystemSettings,
    upsertSystemSettings,
    insertFeedbackEvent,
    listFeedbackEvents,
    insertProposal,
    listProposals,
    getProposal,
    updateProposalStatus,
    countProposalsSince,
    listAppliedByTypes,
    insertApplication,
    appendAuditLog,
    listAuditLog,
    getStoreSummary,
  };
}

module.exports = { createFeedbackLearningStore };
