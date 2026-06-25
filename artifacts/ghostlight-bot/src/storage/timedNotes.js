"use strict";
const { createPostgresPool } = require("./postgres/createPostgresPool");

function nowIso() { return new Date().toISOString(); }

const STATUSES = Object.freeze(["active", "upcoming", "expired", "archived", "deleted"]);

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_scope: r.user_scope,
    companion_id: r.companion_id,
    title: r.title || "",
    note_summary: r.note_summary || "",
    starts_at: r.starts_at || null,
    ends_at: r.ends_at || null,
    relevance_window_minutes: r.relevance_window_minutes || 60,
    status: r.status || "active",
    source: r.source || "manual",
    source_channel_id: r.source_channel_id || "",
    source_message_id: r.source_message_id || "",
    privacy_scope: r.privacy_scope || "normal",
    adult_context: !!r.adult_context,
    tags_json: r.tags_json || [],
    created_at: r.created_at,
    updated_at: r.updated_at,
    archived_at: r.archived_at || null,
  };
}

function createFallbackStore() {
  const rows = [];
  let id = 1;

  return {
    available: true,
    async init() {},
    async createNote(n) {
      const t = nowIso();
      const tags = n.tags_json || n.tags || [];
      const row = {
        id: id++,
        user_scope: n.user_scope,
        companion_id: n.companion_id,
        title: n.title || "",
        note_summary: n.note_summary || "",
        starts_at: n.starts_at || null,
        ends_at: n.ends_at || null,
        relevance_window_minutes: n.relevance_window_minutes || 60,
        status: n.status || "active",
        source: n.source || "manual",
        source_channel_id: n.source_channel_id || "",
        source_message_id: n.source_message_id || "",
        privacy_scope: n.privacy_scope || "normal",
        adult_context: !!n.adult_context,
        tags_json: tags,
        created_at: t,
        updated_at: t,
        archived_at: null,
      };
      rows.push(row);
      return mapRow(row);
    },
    async listNotes(q = {}) {
      const now = new Date();
      return rows
        .filter(
          (r) =>
            r.user_scope === q.user_scope &&
            r.companion_id === q.companion_id &&
            (q.include_adult || !r.adult_context) &&
            (!q.status || r.status === q.status) &&
            r.status !== "deleted"
        )
        .filter((r) => {
          if (!q.active_only) return true;
          const start = r.starts_at ? new Date(r.starts_at) : new Date(0);
          const end = r.ends_at ? new Date(r.ends_at) : new Date(8640000000000000);
          return start <= now && now <= end;
        })
        .sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0))
        .slice(0, Math.min(q.limit || 100, 200))
        .map(mapRow);
    },
    async getNote({ id }) {
      return mapRow(rows.find((r) => r.id === id));
    },
    async updateNote({ id, title, note_summary, status, tags_json }) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      if (title !== undefined) row.title = title;
      if (note_summary !== undefined) row.note_summary = note_summary;
      if (status !== undefined) row.status = status;
      if (tags_json !== undefined) row.tags_json = tags_json;
      row.updated_at = nowIso();
      return mapRow(row);
    },
    async archiveNote({ id }) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      row.status = "archived";
      row.archived_at = nowIso();
      row.updated_at = nowIso();
      return mapRow(row);
    },
    async deleteNote({ id }) {
      const row = rows.find((r) => r.id === id);
      if (!row) return false;
      row.status = "deleted";
      row.updated_at = nowIso();
      return true;
    },
  };
}

const SQL = `CREATE TABLE IF NOT EXISTS timed_notes (
  id BIGSERIAL PRIMARY KEY,
  user_scope TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  note_summary TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  relevance_window_minutes INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'manual',
  source_channel_id TEXT NOT NULL DEFAULT '',
  source_message_id TEXT NOT NULL DEFAULT '',
  privacy_scope TEXT NOT NULL DEFAULT 'normal',
  adult_context BOOLEAN NOT NULL DEFAULT FALSE,
  tags_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);`;

function createTimedNotesStore({ config, logger } = {}) {
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
        "CREATE INDEX IF NOT EXISTS tn_scope_idx ON timed_notes (user_scope, companion_id, status)"
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS tn_active_idx ON timed_notes (user_scope, companion_id, starts_at, ends_at) WHERE status != 'deleted'"
      );
      logger?.info?.("[timed-notes] storage initialised");
    },
    async createNote(n) {
      const tags = n.tags_json || n.tags || [];
      const { rows } = await pool.query(
        `INSERT INTO timed_notes
         (user_scope, companion_id, title, note_summary, starts_at, ends_at,
          relevance_window_minutes, status, source, source_channel_id, source_message_id,
          privacy_scope, adult_context, tags_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          n.user_scope,
          n.companion_id,
          n.title || "",
          n.note_summary || "",
          n.starts_at || null,
          n.ends_at || null,
          n.relevance_window_minutes || 60,
          n.status || "active",
          n.source || "manual",
          n.source_channel_id || "",
          n.source_message_id || "",
          n.privacy_scope || "normal",
          !!n.adult_context,
          JSON.stringify(tags),
        ]
      );
      return mapRow(rows[0]);
    },
    async listNotes(q = {}) {
      let whereClause =
        "WHERE user_scope = $1 AND companion_id = $2 AND status != 'deleted'";
      const params = [q.user_scope, q.companion_id];

      if (!q.include_adult) {
        whereClause += " AND adult_context = FALSE";
      }
      if (q.status) {
        params.push(q.status);
        whereClause += ` AND status = $${params.length}`;
      }
      if (q.active_only) {
        const now = "NOW()";
        whereClause += ` AND (starts_at IS NULL OR starts_at <= ${now})
                        AND (ends_at IS NULL OR ends_at >= ${now})`;
      }

      const limit = Math.min(q.limit || 100, 200);
      const { rows } = await pool.query(
        `SELECT * FROM timed_notes ${whereClause}
         ORDER BY starts_at ASC NULLS FIRST, created_at DESC LIMIT $${params.length + 1}`,
        [...params, limit]
      );
      return rows.map(mapRow);
    },
    async getNote({ id }) {
      const { rows } = await pool.query(
        `SELECT * FROM timed_notes WHERE id = $1`,
        [id]
      );
      return mapRow(rows[0]);
    },
    async updateNote({ id, title, note_summary, status, tags_json }) {
      const sets = ["updated_at = NOW()"];
      const vals = [id];

      if (title !== undefined) {
        vals.push(title);
        sets.push(`title = $${vals.length}`);
      }
      if (note_summary !== undefined) {
        vals.push(note_summary);
        sets.push(`note_summary = $${vals.length}`);
      }
      if (status !== undefined) {
        vals.push(status);
        sets.push(`status = $${vals.length}`);
      }
      if (tags_json !== undefined) {
        vals.push(JSON.stringify(tags_json));
        sets.push(`tags_json = $${vals.length}`);
      }

      const { rows } = await pool.query(
        `UPDATE timed_notes SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
        vals
      );
      return mapRow(rows[0]);
    },
    async archiveNote({ id }) {
      const { rows } = await pool.query(
        `UPDATE timed_notes SET status = 'archived', archived_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id]
      );
      return mapRow(rows[0]);
    },
    async deleteNote({ id }) {
      const r = await pool.query(
        `UPDATE timed_notes SET status = 'deleted', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      return r.rowCount > 0;
    },
  };
}

module.exports = { createTimedNotesStore, STATUSES };
