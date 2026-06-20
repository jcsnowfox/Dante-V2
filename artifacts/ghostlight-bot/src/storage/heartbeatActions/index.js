const crypto = require("node:crypto");
const { createPostgresPool } = require("../postgres/createPostgresPool");

const SUPPORTED_HEARTBEAT_EXECUTOR_TYPES = Object.freeze([
  "send_check_in",
  "send_journal_prompt",
  "send_gif",
  "start_thread",
]);

const SUPPORTED_HEARTBEAT_FREQUENCIES = Object.freeze([
  "low",
  "normal",
  "high",
]);

const CREATE_HEARTBEAT_ACTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS heartbeat_actions (
    id BIGSERIAL PRIMARY KEY,
    action_id TEXT NOT NULL UNIQUE,
    user_scope TEXT NOT NULL,
    label TEXT NOT NULL,
    executor_type TEXT NOT NULL,
    target_channel_id TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL DEFAULT 'normal',
    quiet_hours_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    mention_user BOOLEAN NOT NULL DEFAULT FALSE,
    tags TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_HEARTBEAT_ACTIONS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS heartbeat_actions_user_scope_idx ON heartbeat_actions (user_scope, updated_at DESC);",
  "CREATE INDEX IF NOT EXISTS heartbeat_actions_enabled_idx ON heartbeat_actions (enabled, executor_type);",
  "CREATE INDEX IF NOT EXISTS heartbeat_actions_builtin_idx ON heartbeat_actions (is_builtin, label);",
];

const ENSURE_HEARTBEAT_ACTIONS_SCHEMA_SQL = [
  "ALTER TABLE heartbeat_actions ALTER COLUMN action_id TYPE TEXT USING action_id::text;",
  "ALTER TABLE heartbeat_actions ADD COLUMN IF NOT EXISTS target_channel_id TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE heartbeat_actions ADD COLUMN IF NOT EXISTS mention_user BOOLEAN NOT NULL DEFAULT FALSE;",
  "ALTER TABLE heartbeat_actions DROP COLUMN IF EXISTS target_mode_key;",
  "ALTER TABLE heartbeat_actions DROP COLUMN IF EXISTS target_heartbeat_role;",
  "ALTER TABLE heartbeat_actions DROP COLUMN IF EXISTS cooldown_hours;",
  "ALTER TABLE heartbeat_actions DROP COLUMN IF EXISTS daily_cap;",
];

function normalizeText(value, label, { allowEmpty = false } = {}) {
  const normalized = String(value || "").trim();

  if (!allowEmpty && !normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeEnum(value, label, allowedValues) {
  const normalized = normalizeText(value, label).toLowerCase();

  if (!allowedValues.includes(normalized)) {
    throw new Error(`Unsupported ${label} "${value}". Expected one of: ${allowedValues.join(", ")}.`);
  }

  return normalized;
}

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  }

  return [...new Set(String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean))];
}

function normalizeHeartbeatActionRecord(record = {}, defaults = {}) {
  const targetChannelId = normalizeText(
    record.targetChannelId || record.target_channel_id || defaults.targetChannelId || "",
    "Target channel ID",
    { allowEmpty: true },
  );

  if (!targetChannelId && !normalizeBoolean(record.isBuiltin ?? record.is_builtin, defaults.isBuiltin ?? false)) {
    throw new Error("A target channel ID is required.");
  }

  return {
    actionId: normalizeText(record.actionId || record.action_id || record.id, "Action ID", { allowEmpty: true }) || crypto.randomUUID(),
    userScope: normalizeText(record.userScope || record.user_scope || defaults.userScope, "User scope"),
    label: normalizeText(record.label, "Action label"),
    executorType: normalizeEnum(
      record.executorType || record.executor_type,
      "executor type",
      SUPPORTED_HEARTBEAT_EXECUTOR_TYPES,
    ),
    targetChannelId,
    prompt: normalizeText(record.prompt, "Prompt", { allowEmpty: true }),
    frequency: normalizeEnum(
      record.frequency || defaults.frequency || "normal",
      "frequency",
      SUPPORTED_HEARTBEAT_FREQUENCIES,
    ),
    quietHoursAllowed: normalizeBoolean(
      record.quietHoursAllowed ?? record.quiet_hours_allowed,
      defaults.quietHoursAllowed ?? false,
    ),
    mentionUser: normalizeBoolean(
      record.mentionUser ?? record.mention_user,
      defaults.mentionUser ?? false,
    ),
    tags: normalizeTags(record.tags || defaults.tags || ""),
    enabled: normalizeBoolean(record.enabled, defaults.enabled ?? true),
    isBuiltin: normalizeBoolean(record.isBuiltin ?? record.is_builtin, defaults.isBuiltin ?? false),
  };
}

function mapHeartbeatActionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    actionId: row.action_id,
    userScope: row.user_scope,
    label: row.label,
    executorType: row.executor_type,
    targetChannelId: row.target_channel_id || "",
    prompt: row.prompt || "",
    frequency: row.frequency || "normal",
    quietHoursAllowed: Boolean(row.quiet_hours_allowed),
    mentionUser: Boolean(row.mention_user),
    tags: normalizeTags(row.tags),
    enabled: Boolean(row.enabled),
    isBuiltin: Boolean(row.is_builtin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createNoopHeartbeatActionStore({ logger }) {
  return {
    persistenceEnabled: false,
    async init() {
      logger.warn("[heartbeat] DATABASE_URL is not set; heartbeat action persistence is disabled.");
    },
    async listActions() {
      return [];
    },
    async getActionById() {
      return null;
    },
    async upsertAction() {
      throw new Error("Heartbeat action store is disabled because DATABASE_URL is not set.");
    },
    async close() {},
  };
}

function createHeartbeatActionStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopHeartbeatActionStore({ logger });
  }

  return {
    persistenceEnabled: true,
    async init() {
      await pool.query(CREATE_HEARTBEAT_ACTIONS_TABLE_SQL);

      for (const statement of ENSURE_HEARTBEAT_ACTIONS_SCHEMA_SQL) {
        await pool.query(statement);
      }

      for (const statement of CREATE_HEARTBEAT_ACTIONS_INDEXES_SQL) {
        await pool.query(statement);
      }

      logger.debug?.("[heartbeat] Heartbeat action store ready", {
        provider: "postgres",
      });
    },

    async listActions({ userScope, enabledOnly = false } = {}) {
      const values = [];
      const clauses = [];

      if (userScope) {
        values.push(normalizeText(userScope, "User scope"));
        clauses.push(`user_scope = $${values.length}`);
      }

      if (enabledOnly) {
        clauses.push("enabled = TRUE");
      }

      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `
          SELECT
            id,
            action_id,
            user_scope,
            label,
            executor_type,
            target_channel_id,
            prompt,
            frequency,
            quiet_hours_allowed,
            mention_user,
            tags,
            enabled,
            is_builtin,
            created_at,
            updated_at
          FROM heartbeat_actions
          ${whereClause}
          ORDER BY is_builtin DESC, label ASC, action_id ASC
        `,
        values,
      );

      return rows.map(mapHeartbeatActionRow);
    },

    async getActionById(actionId, { userScope } = {}) {
      const values = [normalizeText(actionId, "Action ID")];
      const clauses = ["action_id = $1"];

      if (userScope) {
        values.push(normalizeText(userScope, "User scope"));
        clauses.push(`user_scope = $${values.length}`);
      }

      const { rows } = await pool.query(
        `
          SELECT
            id,
            action_id,
            user_scope,
            label,
            executor_type,
            target_channel_id,
            prompt,
            frequency,
            quiet_hours_allowed,
            mention_user,
            tags,
            enabled,
            is_builtin,
            created_at,
            updated_at
          FROM heartbeat_actions
          WHERE ${clauses.join(" AND ")}
          LIMIT 1
        `,
        values,
      );

      return mapHeartbeatActionRow(rows[0]);
    },

    async upsertAction(record, defaults = {}) {
      const normalized = normalizeHeartbeatActionRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO heartbeat_actions (
            action_id,
            user_scope,
            label,
            executor_type,
            target_channel_id,
            prompt,
            frequency,
            quiet_hours_allowed,
            mention_user,
            tags,
            enabled,
            is_builtin,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
          ON CONFLICT (action_id)
          DO UPDATE SET
            label = EXCLUDED.label,
            executor_type = EXCLUDED.executor_type,
            target_channel_id = EXCLUDED.target_channel_id,
            prompt = EXCLUDED.prompt,
            frequency = EXCLUDED.frequency,
            quiet_hours_allowed = EXCLUDED.quiet_hours_allowed,
            mention_user = EXCLUDED.mention_user,
            tags = EXCLUDED.tags,
            enabled = EXCLUDED.enabled,
            is_builtin = heartbeat_actions.is_builtin OR EXCLUDED.is_builtin,
            updated_at = NOW()
          RETURNING
            id,
            action_id,
            user_scope,
            label,
            executor_type,
            target_channel_id,
            prompt,
            frequency,
            quiet_hours_allowed,
            mention_user,
            tags,
            enabled,
            is_builtin,
            created_at,
            updated_at
        `,
        [
          normalized.actionId,
          normalized.userScope,
          normalized.label,
          normalized.executorType,
          normalized.targetChannelId,
          normalized.prompt,
          normalized.frequency,
          normalized.quietHoursAllowed,
          normalized.mentionUser,
          normalized.tags.join(","),
          normalized.enabled,
          normalized.isBuiltin,
        ],
      );

      return mapHeartbeatActionRow(rows[0]);
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  SUPPORTED_HEARTBEAT_EXECUTOR_TYPES,
  SUPPORTED_HEARTBEAT_FREQUENCIES,
  normalizeHeartbeatActionRecord,
  createHeartbeatActionStore,
};
