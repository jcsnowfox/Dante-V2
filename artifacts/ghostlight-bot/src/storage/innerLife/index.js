"use strict";

const { createPostgresPool } = require("../postgres/createPostgresPool");

const SUPPORTED_ENTRY_TYPES = Object.freeze([
  "private_thought",
  "unsent_thought",
  "between_message_note",
  "journal_entry",
  "dream",
  "micro_repair",
  "little_ritual",
  "habit_marker",
  "taste_marker",
  "mood_carryover",
  "private_lexicon",
  "repeated_tell",
  "room_sense",
  "almost_said",
  "affection_residue",
  "curiosity_seed",
]);

const SUPPORTED_STATUSES = Object.freeze([
  "active",
  "used_in_prelude",
  "archived",
  "expired",
  "review_required",
  "blocked",
]);

const SUPPORTED_VISIBILITIES = Object.freeze([
  "private",
  "admin_only",
  "deliverable",
]);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS inner_life_entries (
    id BIGSERIAL PRIMARY KEY,
    companion_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    source_event_type TEXT NOT NULL DEFAULT '',
    source_message_id TEXT NOT NULL DEFAULT '',
    source_channel_id TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'private',
    sensitivity TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'active',
    emotional_tone TEXT NOT NULL DEFAULT '',
    intensity REAL NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    metadata_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS inner_life_entries_companion_idx ON inner_life_entries (companion_id, owner_id, status, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS inner_life_entries_type_idx ON inner_life_entries (companion_id, entry_type, status);",
  "CREATE INDEX IF NOT EXISTS inner_life_entries_expires_idx ON inner_life_entries (expires_at) WHERE expires_at IS NOT NULL;",
];

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    companionId: row.companion_id,
    ownerId: row.owner_id,
    entryType: row.entry_type,
    title: row.title || "",
    summary: row.summary || "",
    body: row.body || "",
    sourceEventType: row.source_event_type || "",
    sourceMessageId: row.source_message_id || "",
    sourceChannelId: row.source_channel_id || "",
    visibility: row.visibility || "private",
    sensitivity: row.sensitivity || "normal",
    status: row.status || "active",
    emotionalTone: row.emotional_tone || "",
    intensity: Number(row.intensity) || 0,
    expiresAt: row.expires_at || null,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createNoopInnerLifeStore({ logger }) {
  return {
    available: false,
    async init() {
      logger.warn("[inner-life] DATABASE_URL is not set; inner life persistence is disabled.");
    },
    async listEntries() { return []; },
    async getEntry() { return null; },
    async createEntry() { throw new Error("Inner life store disabled — DATABASE_URL not set."); },
    async updateEntry() { throw new Error("Inner life store disabled — DATABASE_URL not set."); },
    async deleteEntry() { return false; },
    async archiveEntry() { return null; },
    async expireStale() { return 0; },
    async close() {},
  };
}

function createInnerLifeStore({ config, logger }) {
  let pool = null;
  try {
    pool = createPostgresPool({ config });
  } catch {
    pool = null;
  }

  if (!pool) {
    return createNoopInnerLifeStore({ logger });
  }

  return {
    available: true,

    async init() {
      await pool.query(CREATE_TABLE_SQL);
      for (const sql of CREATE_INDEXES_SQL) {
        await pool.query(sql);
      }
      logger.info("[inner-life] storage initialised", { provider: "postgres" });
    },

    async listEntries({
      companionId,
      ownerId,
      entryType = "",
      status = "",
      visibility = "",
      limit = 100,
      orderBy = "created_at DESC",
    } = {}) {
      const values = [companionId, ownerId];
      const clauses = ["companion_id = $1", "owner_id = $2"];

      if (entryType) {
        values.push(entryType);
        clauses.push(`entry_type = $${values.length}`);
      }
      if (status) {
        values.push(status);
        clauses.push(`status = $${values.length}`);
      }
      if (visibility) {
        values.push(visibility);
        clauses.push(`visibility = $${values.length}`);
      }

      clauses.push("(expires_at IS NULL OR expires_at > NOW())");

      const safeOrder = ["created_at DESC", "created_at ASC", "updated_at DESC", "intensity DESC"].includes(orderBy)
        ? orderBy
        : "created_at DESC";

      const { rows } = await pool.query(
        `SELECT * FROM inner_life_entries WHERE ${clauses.join(" AND ")} ORDER BY ${safeOrder} LIMIT $${values.length + 1}`,
        [...values, Math.min(Number(limit) || 100, 500)],
      );
      return rows.map(mapRow);
    },

    async getEntry({ id, companionId, ownerId }) {
      const { rows } = await pool.query(
        "SELECT * FROM inner_life_entries WHERE id = $1 AND companion_id = $2 AND owner_id = $3 LIMIT 1",
        [id, companionId, ownerId],
      );
      return mapRow(rows[0]);
    },

    async createEntry({
      companionId,
      ownerId,
      entryType,
      title = "",
      summary = "",
      body = "",
      sourceEventType = "",
      sourceMessageId = "",
      sourceChannelId = "",
      visibility = "private",
      sensitivity = "normal",
      status = "active",
      emotionalTone = "",
      intensity = 0,
      expiresAt = null,
      metadata = {},
    }) {
      const { rows } = await pool.query(
        `INSERT INTO inner_life_entries
          (companion_id, owner_id, entry_type, title, summary, body,
           source_event_type, source_message_id, source_channel_id,
           visibility, sensitivity, status, emotional_tone, intensity,
           expires_at, metadata_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
          companionId, ownerId, entryType, title, summary, body,
          sourceEventType, sourceMessageId, sourceChannelId,
          visibility, sensitivity, status, emotionalTone, Number(intensity) || 0,
          expiresAt || null, JSON.stringify(metadata || {}),
        ],
      );
      return mapRow(rows[0]);
    },

    async updateEntry({ id, companionId, ownerId, updates = {} }) {
      const allowed = ["title", "summary", "body", "status", "emotional_tone", "intensity", "visibility", "sensitivity", "expires_at", "metadata_json"];
      const setClauses = [];
      const values = [];

      for (const [key, val] of Object.entries(updates)) {
        const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        if (!allowed.includes(col)) continue;
        values.push(col === "metadata_json" ? JSON.stringify(val) : val);
        setClauses.push(`${col} = $${values.length}`);
      }

      if (!setClauses.length) return null;

      values.push(id, companionId, ownerId);
      const { rows } = await pool.query(
        `UPDATE inner_life_entries SET ${setClauses.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length - 2} AND companion_id = $${values.length - 1} AND owner_id = $${values.length}
         RETURNING *`,
        values,
      );
      return mapRow(rows[0]);
    },

    async deleteEntry({ id, companionId, ownerId }) {
      const { rowCount } = await pool.query(
        "DELETE FROM inner_life_entries WHERE id = $1 AND companion_id = $2 AND owner_id = $3",
        [id, companionId, ownerId],
      );
      return rowCount > 0;
    },

    async archiveEntry({ id, companionId, ownerId }) {
      return this.updateEntry({ id, companionId, ownerId, updates: { status: "archived" } });
    },

    async expireStale() {
      const { rowCount } = await pool.query(
        "UPDATE inner_life_entries SET status = 'expired', updated_at = NOW() WHERE expires_at <= NOW() AND status = 'active'",
      );
      return rowCount || 0;
    },

    async close() {
      await pool.end?.();
    },
  };
}

module.exports = {
  createInnerLifeStore,
  SUPPORTED_ENTRY_TYPES,
  SUPPORTED_STATUSES,
  SUPPORTED_VISIBILITIES,
};
