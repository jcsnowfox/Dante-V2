"use strict";
const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    channel_id: r.channel_id || "",
    thread_id: r.thread_id || "",
    last_user_message_id: r.last_user_message_id || "",
    last_companion_message_id: r.last_companion_message_id || "",
    last_topic_summary: r.last_topic_summary || "",
    follow_up_due_at: r.follow_up_due_at || null,
    follow_up_sent_at: r.follow_up_sent_at || null,
    status: r.status || "pending",
    cooldown_key: r.cooldown_key || "",
    privacy_scope: r.privacy_scope || "normal",
    adult_context: !!r.adult_context,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function createFallbackStore() {
  const rows = [];
  let id = 1;

  return {
    available: true,
    async init() {},
    async createFollowUp(f) {
      const t = nowIso();
      const row = {
        id: id++,
        user_scope: f.user_scope,
        companion_id: f.companion_id,
        channel_id: f.channel_id || "",
        thread_id: f.thread_id || "",
        last_user_message_id: f.last_user_message_id || "",
        last_companion_message_id: f.last_companion_message_id || "",
        last_topic_summary: f.last_topic_summary || "",
        follow_up_due_at: f.follow_up_due_at || null,
        follow_up_sent_at: null,
        status: "pending",
        cooldown_key: f.cooldown_key || "",
        privacy_scope: f.privacy_scope || "normal",
        adult_context: !!f.adult_context,
        created_at: t,
        updated_at: t,
      };
      rows.push(row);
      return mapRow(row);
    },
    async getState({ user_scope, companion_id, channel_id }) {
      return rows.find(
        (r) =>
          r.user_scope === user_scope &&
          r.companion_id === companion_id &&
          r.channel_id === channel_id
      );
    },
    async listDue({ user_scope, companion_id, include_adult }) {
      const now = new Date();
      return rows
        .filter(
          (r) =>
            r.user_scope === user_scope &&
            r.companion_id === companion_id &&
            (include_adult || !r.adult_context) &&
            r.status === "pending" &&
            r.follow_up_due_at &&
            new Date(r.follow_up_due_at) <= now
        )
        .map(mapRow);
    },
    async updateStatus({ id, status, follow_up_sent_at }) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      row.status = status || row.status;
      row.follow_up_sent_at = follow_up_sent_at || row.follow_up_sent_at;
      row.updated_at = nowIso();
      return mapRow(row);
    },
    async deleteState({ id }) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) {
        rows.splice(i, 1);
        return true;
      }
      return false;
    },
  };
}

const SQL = `CREATE TABLE IF NOT EXISTS conversation_followup_state (
  id BIGSERIAL PRIMARY KEY,
  user_scope TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  channel_id TEXT NOT NULL DEFAULT '',
  thread_id TEXT NOT NULL DEFAULT '',
  last_user_message_id TEXT NOT NULL DEFAULT '',
  last_companion_message_id TEXT NOT NULL DEFAULT '',
  last_topic_summary TEXT NOT NULL DEFAULT '',
  follow_up_due_at TIMESTAMPTZ,
  follow_up_sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  cooldown_key TEXT NOT NULL DEFAULT '',
  privacy_scope TEXT NOT NULL DEFAULT 'normal',
  adult_context BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_scope, companion_id, channel_id)
);`;

function createConversationFollowupStore({ config, logger } = {}) {
  let pool = null;
  try {
    pool = createPostgresPool({ config });
  } catch {}

  if (!pool) return createFallbackStore();

  return {
    available: true,
    async init() {
      await pool.query(SQL);
      await pool.query(
        "CREATE INDEX IF NOT EXISTS cfs_status_idx ON conversation_followup_state (user_scope, companion_id, status, follow_up_due_at)"
      );
      logger?.info?.("[conversation-followup] storage initialised");
    },
    async createFollowUp(f) {
      const { rows } = await pool.query(
        `INSERT INTO conversation_followup_state
         (user_scope, companion_id, channel_id, thread_id, last_user_message_id,
          last_companion_message_id, last_topic_summary, follow_up_due_at, status,
          cooldown_key, privacy_scope, adult_context)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (user_scope, companion_id, channel_id) DO UPDATE SET
           last_user_message_id = EXCLUDED.last_user_message_id,
           last_companion_message_id = EXCLUDED.last_companion_message_id,
           last_topic_summary = EXCLUDED.last_topic_summary,
           follow_up_due_at = EXCLUDED.follow_up_due_at,
           status = EXCLUDED.status,
           updated_at = NOW()
         RETURNING *`,
        [
          f.user_scope,
          f.companion_id,
          f.channel_id || "",
          f.thread_id || "",
          f.last_user_message_id || "",
          f.last_companion_message_id || "",
          f.last_topic_summary || "",
          f.follow_up_due_at || null,
          "pending",
          f.cooldown_key || "",
          f.privacy_scope || "normal",
          !!f.adult_context,
        ]
      );
      return mapRow(rows[0]);
    },
    async getState({ user_scope, companion_id, channel_id }) {
      const { rows } = await pool.query(
        `SELECT * FROM conversation_followup_state
         WHERE user_scope = $1 AND companion_id = $2 AND channel_id = $3 LIMIT 1`,
        [user_scope, companion_id, channel_id]
      );
      return mapRow(rows[0]);
    },
    async listDue({ user_scope, companion_id, include_adult }) {
      const { rows } = await pool.query(
        `SELECT * FROM conversation_followup_state
         WHERE user_scope = $1 AND companion_id = $2 AND status = 'pending'
         AND follow_up_due_at IS NOT NULL AND follow_up_due_at <= NOW()
         ${include_adult ? "" : "AND adult_context = FALSE"}
         ORDER BY follow_up_due_at ASC LIMIT 20`,
        [user_scope, companion_id]
      );
      return rows.map(mapRow);
    },
    async updateStatus({ id, status, follow_up_sent_at }) {
      const sets = ["status = $2", "updated_at = NOW()"];
      const vals = [id, status];
      if (follow_up_sent_at) {
        vals.push(follow_up_sent_at);
        sets.push(`follow_up_sent_at = $${vals.length}`);
      }
      const { rows } = await pool.query(
        `UPDATE conversation_followup_state SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
        vals
      );
      return mapRow(rows[0]);
    },
    async deleteState({ id }) {
      const r = await pool.query(
        "DELETE FROM conversation_followup_state WHERE id = $1",
        [id]
      );
      return r.rowCount > 0;
    },
  };
}

module.exports = { createConversationFollowupStore };
