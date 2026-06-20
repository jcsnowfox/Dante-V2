"use strict";

const { createPostgresPool } = require("../postgres/createPostgresPool");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS continuity_items (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    source_message_id TEXT NOT NULL DEFAULT '',
    source_channel_id TEXT NOT NULL DEFAULT '',
    source_platform TEXT NOT NULL DEFAULT 'discord',
    source_text TEXT NOT NULL DEFAULT '',
    evidence_json JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'medium',
    emotional_weight REAL NOT NULL DEFAULT 0,
    certainty TEXT NOT NULL DEFAULT 'definite',
    sensitivity TEXT NOT NULL DEFAULT 'normal',
    visibility TEXT NOT NULL DEFAULT 'private',
    allowed_channels_json JSONB NOT NULL DEFAULT '[]',
    due_at TIMESTAMPTZ,
    follow_up_after TIMESTAMPTZ,
    last_touched_at TIMESTAMPTZ,
    asked_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution TEXT NOT NULL DEFAULT '',
    next_action TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json JSONB NOT NULL DEFAULT '{}'
  );
`;

const CREATE_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS continuity_items_companion_idx ON continuity_items (companion_id, owner_id, status, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS continuity_items_type_idx ON continuity_items (companion_id, owner_id, type, status);",
  "CREATE INDEX IF NOT EXISTS continuity_items_due_idx ON continuity_items (follow_up_after) WHERE follow_up_after IS NOT NULL AND status NOT IN ('resolved','archived','cancelled','expired');",
  "CREATE INDEX IF NOT EXISTS continuity_items_status_idx ON continuity_items (status, updated_at DESC);",
];

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    ownerId: row.owner_id,
    type: row.type,
    title: row.title || "",
    summary: row.summary || "",
    sourceMessageId: row.source_message_id || "",
    sourceChannelId: row.source_channel_id || "",
    sourcePlatform: row.source_platform || "discord",
    sourceText: row.source_text || "",
    evidence: row.evidence_json || [],
    status: row.status || "open",
    priority: row.priority || "medium",
    emotionalWeight: Number(row.emotional_weight) || 0,
    certainty: row.certainty || "definite",
    sensitivity: row.sensitivity || "normal",
    visibility: row.visibility || "private",
    allowedChannels: row.allowed_channels_json || [],
    dueAt: row.due_at || null,
    followUpAfter: row.follow_up_after || null,
    lastTouchedAt: row.last_touched_at || null,
    askedAt: row.asked_at || null,
    resolvedAt: row.resolved_at || null,
    resolution: row.resolution || "",
    nextAction: row.next_action || "",
    createdBy: row.created_by || "system",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata_json || {},
  };
}

function createNoopContinuityStore({ logger }) {
  return {
    available: false,
    async init() {
      logger.warn("[continuity] DATABASE_URL is not set; continuity persistence is disabled.");
    },
    async listItems() { return []; },
    async getItem() { return null; },
    async createItem() { throw new Error("Continuity store disabled — DATABASE_URL not set."); },
    async updateItem() { throw new Error("Continuity store disabled — DATABASE_URL not set."); },
    async deleteItem() { return false; },
    async archiveItem() { return null; },
    async resolveItem() { return null; },
    async listDueFollowUps() { return []; },
    async countTodayFollowUps() { return 0; },
    async expireStale() { return 0; },
    async close() {},
  };
}

function createContinuityStore({ config, logger }) {
  let pool = null;
  try {
    pool = createPostgresPool({ config });
  } catch {
    pool = null;
  }

  if (!pool) return createNoopContinuityStore({ logger });

  return {
    available: true,

    async init() {
      await pool.query(CREATE_TABLE_SQL);
      for (const sql of CREATE_INDEXES_SQL) {
        await pool.query(sql);
      }
      logger.info("[continuity] storage initialised", { provider: "postgres" });
    },

    async listItems({
      companionId,
      ownerId,
      type = "",
      status = "",
      priority = "",
      limit = 100,
      orderBy = "created_at DESC",
    } = {}) {
      const values = [companionId, ownerId];
      const clauses = ["companion_id = $1", "owner_id = $2"];
      if (type) { values.push(type); clauses.push(`type = $${values.length}`); }
      if (status) { values.push(status); clauses.push(`status = $${values.length}`); }
      if (priority) { values.push(priority); clauses.push(`priority = $${values.length}`); }
      const safeOrder = [
        "created_at DESC", "created_at ASC", "updated_at DESC",
        "emotional_weight DESC", "follow_up_after ASC", "due_at ASC",
      ].includes(orderBy) ? orderBy : "created_at DESC";
      const { rows } = await pool.query(
        `SELECT * FROM continuity_items WHERE ${clauses.join(" AND ")} ORDER BY ${safeOrder} LIMIT $${values.length + 1}`,
        [...values, Math.min(Number(limit) || 100, 500)],
      );
      return rows.map(mapRow);
    },

    async getItem({ id, companionId, ownerId }) {
      const { rows } = await pool.query(
        "SELECT * FROM continuity_items WHERE id = $1 AND companion_id = $2 AND owner_id = $3 LIMIT 1",
        [id, companionId, ownerId],
      );
      return mapRow(rows[0]);
    },

    async createItem({
      companionId, ownerId, type, title = "", summary = "",
      sourceMessageId = "", sourceChannelId = "", sourcePlatform = "discord",
      sourceText = "", evidence = [], status = "open", priority = "medium",
      emotionalWeight = 0, certainty = "definite", sensitivity = "normal",
      visibility = "private", allowedChannels = [], dueAt = null,
      followUpAfter = null, nextAction = "", createdBy = "system", metadata = {},
    }) {
      const { rows } = await pool.query(
        `INSERT INTO continuity_items
          (companion_id, owner_id, type, title, summary,
           source_message_id, source_channel_id, source_platform, source_text,
           evidence_json, status, priority, emotional_weight, certainty,
           sensitivity, visibility, allowed_channels_json, due_at,
           follow_up_after, next_action, created_by, last_touched_at, metadata_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),$22)
         RETURNING *`,
        [
          companionId, ownerId, type, title, summary,
          sourceMessageId, sourceChannelId, sourcePlatform, sourceText,
          JSON.stringify(evidence || []), status, priority,
          Number(emotionalWeight) || 0, certainty, sensitivity, visibility,
          JSON.stringify(allowedChannels || []), dueAt || null,
          followUpAfter || null, nextAction, createdBy,
          JSON.stringify(metadata || {}),
        ],
      );
      return mapRow(rows[0]);
    },

    async updateItem({ id, companionId, ownerId, updates = {} }) {
      const colMap = {
        title: "title", summary: "summary", status: "status", priority: "priority",
        emotionalWeight: "emotional_weight", certainty: "certainty",
        sensitivity: "sensitivity", visibility: "visibility",
        dueAt: "due_at", followUpAfter: "follow_up_after",
        lastTouchedAt: "last_touched_at", askedAt: "asked_at",
        resolvedAt: "resolved_at", resolution: "resolution",
        nextAction: "next_action", metadata: "metadata_json",
        evidence: "evidence_json", allowedChannels: "allowed_channels_json",
        sourceText: "source_text",
      };
      const setClauses = [];
      const values = [];
      for (const [key, val] of Object.entries(updates)) {
        const col = colMap[key];
        if (!col) continue;
        const isJson = ["metadata_json", "evidence_json", "allowed_channels_json"].includes(col);
        values.push(isJson ? JSON.stringify(val) : val);
        setClauses.push(`${col} = $${values.length}`);
      }
      if (!setClauses.length) return null;
      values.push(id, companionId, ownerId);
      const { rows } = await pool.query(
        `UPDATE continuity_items SET ${setClauses.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length - 2} AND companion_id = $${values.length - 1} AND owner_id = $${values.length}
         RETURNING *`,
        values,
      );
      return mapRow(rows[0]);
    },

    async deleteItem({ id, companionId, ownerId }) {
      const { rowCount } = await pool.query(
        "DELETE FROM continuity_items WHERE id = $1 AND companion_id = $2 AND owner_id = $3",
        [id, companionId, ownerId],
      );
      return rowCount > 0;
    },

    async archiveItem({ id, companionId, ownerId }) {
      return this.updateItem({ id, companionId, ownerId, updates: { status: "archived" } });
    },

    async resolveItem({ id, companionId, ownerId, resolution = "" }) {
      return this.updateItem({
        id, companionId, ownerId,
        updates: { status: "resolved", resolution, resolvedAt: new Date() },
      });
    },

    async listDueFollowUps({ companionId, ownerId, now = new Date() }) {
      const { rows } = await pool.query(
        `SELECT * FROM continuity_items
         WHERE companion_id = $1 AND owner_id = $2
           AND follow_up_after IS NOT NULL AND follow_up_after <= $3
           AND status IN ('open','waiting','follow_up_due')
         ORDER BY follow_up_after ASC LIMIT 20`,
        [companionId, ownerId, now],
      );
      return rows.map(mapRow);
    },

    async countTodayFollowUps({ companionId, ownerId }) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM continuity_items
         WHERE companion_id = $1 AND owner_id = $2
           AND status = 'asked'
           AND asked_at >= NOW() - INTERVAL '24 hours'`,
        [companionId, ownerId],
      );
      return Number(rows[0]?.cnt) || 0;
    },

    async expireStale() {
      const { rowCount } = await pool.query(
        `UPDATE continuity_items SET status = 'expired', updated_at = NOW()
         WHERE due_at IS NOT NULL AND due_at < NOW() - INTERVAL '30 days'
           AND status IN ('open','waiting','follow_up_due')`
      );
      return rowCount || 0;
    },

    async close() {
      await pool.end?.();
    },
  };
}

module.exports = { createContinuityStore };
