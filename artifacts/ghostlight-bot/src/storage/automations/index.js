const crypto = require("node:crypto");
const { normalizeIanaTimezone } = require("../../config/timezones");
const { createPostgresPool } = require("../postgres/createPostgresPool");

const SUPPORTED_AUTOMATION_TYPES = Object.freeze([
  "journal",
  "check_in",
  "daily_thread",
]);
const SUPPORTED_AUTOMATION_TOOLS = Object.freeze(["gif_search", "web_search", "generate_image"]);
const MAX_ENABLED_TOOLS = 2;

function normalizeAutomationType(value) {
  const normalized = normalizeText(value, "automation type").toLowerCase();
  return normalized === "nudge" ? "check_in" : normalized;
}

const CREATE_AUTOMATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS automations (
    id BIGSERIAL PRIMARY KEY,
    automation_id UUID NOT NULL UNIQUE,
    user_scope TEXT NOT NULL,
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    schedule_time TEXT NOT NULL,
    timezone TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    enabled_tools TEXT NOT NULL DEFAULT '',
    thread_title_template TEXT NOT NULL DEFAULT '',
    thread_starter_prompt TEXT NOT NULL DEFAULT '',
    thread_mode_key TEXT NOT NULL DEFAULT 'daily',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    mention_user BOOLEAN NOT NULL DEFAULT FALSE,
    user_id TEXT,
    last_run_at TIMESTAMPTZ,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_AUTOMATIONS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS automations_user_scope_idx ON automations (user_scope, updated_at DESC);",
  "CREATE INDEX IF NOT EXISTS automations_enabled_idx ON automations (enabled, schedule_time);",
  "CREATE INDEX IF NOT EXISTS automations_type_idx ON automations (type);",
];

const ALTER_AUTOMATIONS_TABLE_SQL = [
  "ALTER TABLE automations ADD COLUMN IF NOT EXISTS enabled_tools TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE automations ADD COLUMN IF NOT EXISTS thread_title_template TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE automations ADD COLUMN IF NOT EXISTS thread_starter_prompt TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE automations ADD COLUMN IF NOT EXISTS thread_mode_key TEXT NOT NULL DEFAULT 'daily';",
];
const FIXED_OFFSET_TIMEZONE_SQL_PATTERN = "^(Etc/GMT[+-][0-9]{1,2}|(UTC|GMT)\\s*[+-]\\s*[0-9]{1,2}(:?[0-5][0-9])?)$";

function normalizeText(value, label, { allowEmpty = false } = {}) {
  const normalized = String(value || "").trim();

  if (!allowEmpty && !normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeEnum(value, label, allowedValues) {
  const normalized = label === "automation type"
    ? normalizeAutomationType(value)
    : normalizeText(value, label).toLowerCase();

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

function normalizeTimestamp(value, label, { allowEmpty = true } = {}) {
  if (!value) {
    if (allowEmpty) {
      return null;
    }

    throw new Error(`${label} is required.`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label} "${value}".`);
  }

  return date.toISOString();
}

function normalizeScheduleTime(value) {
  const normalized = normalizeText(value, "Schedule time");

  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error(`Invalid schedule time "${value}". Expected HH:MM.`);
  }

  const [hours, minutes] = normalized.split(":").map(Number);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid schedule time "${value}". Expected HH:MM.`);
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeEnabledTools(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const normalized = Array.from(new Set(raw
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => SUPPORTED_AUTOMATION_TOOLS.includes(item))));

  if (normalized.length > MAX_ENABLED_TOOLS) {
    throw new Error(`No more than ${MAX_ENABLED_TOOLS} enabled tools are supported.`);
  }

  return normalized;
}

function normalizeAutomationRecord(record = {}, defaults = {}) {
  const type = normalizeEnum(
    record.type || defaults.type,
    "automation type",
    SUPPORTED_AUTOMATION_TYPES,
  );
  const mentionUser = normalizeBoolean(record.mentionUser ?? record.mention_user, defaults.mentionUser ?? false);
  const userId = normalizeText(record.userId || record.user_id, "User ID", { allowEmpty: true });
  const prompt = normalizeText(record.prompt, "Prompt", { allowEmpty: type === "journal" || type === "daily_thread" });
  const enabledTools = normalizeEnabledTools(record.enabledTools || record.enabled_tools || defaults.enabledTools || []);
  const threadTitleTemplate = normalizeText(
    record.threadTitleTemplate || record.thread_title_template,
    "Thread title template",
    { allowEmpty: type !== "daily_thread" },
  );
  const threadStarterPrompt = normalizeText(
    record.threadStarterPrompt || record.thread_starter_prompt || record.prompt,
    "Thread starter prompt",
    { allowEmpty: true },
  );
  const threadModeKey = normalizeText(
    record.threadModeKey || record.thread_mode_key || defaults.threadModeKey || "daily",
    "Thread mode key",
  );

  if (mentionUser && !userId) {
    throw new Error("User ID is required when mention_user is enabled.");
  }

  return {
    automationId: normalizeText(record.automationId || record.automation_id || record.id, "Automation ID", { allowEmpty: true }) || crypto.randomUUID(),
    userScope: normalizeText(record.userScope || record.user_scope || defaults.userScope, "User scope"),
    type,
    label: normalizeText(record.label, "Automation label"),
    channelId: normalizeText(record.channelId || record.channel_id, "Channel ID"),
    scheduleTime: normalizeScheduleTime(record.scheduleTime || record.schedule_time),
    timezone: normalizeIanaTimezone(record.timezone || defaults.timezone || "UTC"),
    prompt,
    enabledTools,
    threadTitleTemplate,
    threadStarterPrompt,
    threadModeKey,
    enabled: normalizeBoolean(record.enabled, defaults.enabled ?? true),
    mentionUser,
    userId: userId || null,
    lastRunAt: normalizeTimestamp(record.lastRunAt || record.last_run_at, "last_run_at"),
    lastError: normalizeText(record.lastError || record.last_error, "Last error", { allowEmpty: true }),
  };
}

function mapAutomationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    automationId: row.automation_id,
    userScope: row.user_scope,
    type: row.type === "nudge" ? "check_in" : row.type,
    label: row.label,
    channelId: row.channel_id,
    scheduleTime: row.schedule_time,
    timezone: row.timezone,
    prompt: row.prompt,
    enabledTools: normalizeEnabledTools(row.enabled_tools || ""),
    threadTitleTemplate: row.thread_title_template || "",
    threadStarterPrompt: row.thread_starter_prompt || "",
    threadModeKey: row.thread_mode_key || "daily",
    enabled: row.enabled,
    mentionUser: row.mention_user,
    userId: row.user_id,
    lastRunAt: row.last_run_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createNoopAutomationStore({ logger }) {
  return {
    persistenceEnabled: false,
    async init() {
      logger.warn("[automations] DATABASE_URL is not set; automation persistence is disabled.");
    },
    async listAutomations() {
      return [];
    },
    async getAutomationById() {
      return null;
    },
    async upsertAutomation() {
      throw new Error("Automation store is disabled because DATABASE_URL is not set.");
    },
    async deleteAutomationById() {
      return null;
    },
    async close() {},
  };
}

function createAutomationStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopAutomationStore({ logger });
  }

  return {
    persistenceEnabled: true,
    async init() {
      await pool.query(CREATE_AUTOMATIONS_TABLE_SQL);
      for (const statement of ALTER_AUTOMATIONS_TABLE_SQL) {
        await pool.query(statement);
      }

      for (const statement of CREATE_AUTOMATIONS_INDEXES_SQL) {
        await pool.query(statement);
      }

      await pool.query("UPDATE automations SET type = 'check_in' WHERE type = 'nudge';");
      const runtimeTimezone = normalizeIanaTimezone(config.chat?.timezone || "UTC");
      const repairedTimezones = await pool.query(
        "UPDATE automations SET timezone = $1, updated_at = NOW() WHERE timezone ~* $2;",
        [runtimeTimezone, FIXED_OFFSET_TIMEZONE_SQL_PATTERN],
      );

      logger.debug?.("[automations] Automation store ready", {
        provider: "postgres",
        repairedFixedOffsetTimezones: repairedTimezones.rowCount || 0,
      });
    },

    async listAutomations({ userScope, enabledOnly = false, type = "" } = {}) {
      const values = [];
      const clauses = [];

      if (userScope) {
        values.push(normalizeText(userScope, "User scope"));
        clauses.push(`user_scope = $${values.length}`);
      }

      if (enabledOnly) {
        clauses.push("enabled = TRUE");
      }

      if (type) {
        values.push(normalizeEnum(type, "automation type", SUPPORTED_AUTOMATION_TYPES));
        clauses.push(`type = $${values.length}`);
      }

      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `
          SELECT
            id,
            automation_id,
            user_scope,
            type,
            label,
            channel_id,
            schedule_time,
            timezone,
            prompt,
            enabled_tools,
            thread_title_template,
            thread_starter_prompt,
            thread_mode_key,
            enabled,
            mention_user,
            user_id,
            last_run_at,
            last_error,
            created_at,
            updated_at
          FROM automations
          ${whereClause}
          ORDER BY schedule_time ASC, label ASC, automation_id ASC
        `,
        values,
      );

      return rows.map(mapAutomationRow);
    },

    async getAutomationById(automationId, { userScope } = {}) {
      const normalizedId = normalizeText(automationId, "Automation ID");
      const values = [normalizedId];
      const clauses = ["automation_id = $1"];

      if (userScope) {
        values.push(normalizeText(userScope, "User scope"));
        clauses.push(`user_scope = $${values.length}`);
      }

      const { rows } = await pool.query(
        `
          SELECT
            id,
            automation_id,
            user_scope,
            type,
            label,
            channel_id,
            schedule_time,
            timezone,
            prompt,
            enabled_tools,
            thread_title_template,
            thread_starter_prompt,
            thread_mode_key,
            enabled,
            mention_user,
            user_id,
            last_run_at,
            last_error,
            created_at,
            updated_at
          FROM automations
          WHERE ${clauses.join(" AND ")}
          LIMIT 1
        `,
        values,
      );

      return mapAutomationRow(rows[0]);
    },

    async upsertAutomation(record, defaults = {}) {
      const normalized = normalizeAutomationRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO automations (
            automation_id,
            user_scope,
            type,
            label,
            channel_id,
            schedule_time,
            timezone,
            prompt,
            enabled_tools,
            thread_title_template,
            thread_starter_prompt,
            thread_mode_key,
            enabled,
            mention_user,
            user_id,
            last_run_at,
            last_error,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
          ON CONFLICT (automation_id)
          DO UPDATE SET
            user_scope = EXCLUDED.user_scope,
            type = EXCLUDED.type,
            label = EXCLUDED.label,
            channel_id = EXCLUDED.channel_id,
            schedule_time = EXCLUDED.schedule_time,
            timezone = EXCLUDED.timezone,
            prompt = EXCLUDED.prompt,
            enabled_tools = EXCLUDED.enabled_tools,
            thread_title_template = EXCLUDED.thread_title_template,
            thread_starter_prompt = EXCLUDED.thread_starter_prompt,
            thread_mode_key = EXCLUDED.thread_mode_key,
            enabled = EXCLUDED.enabled,
            mention_user = EXCLUDED.mention_user,
            user_id = EXCLUDED.user_id,
            last_run_at = EXCLUDED.last_run_at,
            last_error = EXCLUDED.last_error,
            updated_at = NOW()
          RETURNING
            id,
            automation_id,
            user_scope,
            type,
            label,
            channel_id,
            schedule_time,
            timezone,
            prompt,
            enabled_tools,
            thread_title_template,
            thread_starter_prompt,
            thread_mode_key,
            enabled,
            mention_user,
            user_id,
            last_run_at,
            last_error,
            created_at,
            updated_at
        `,
        [
          normalized.automationId,
          normalized.userScope,
          normalized.type,
          normalized.label,
          normalized.channelId,
          normalized.scheduleTime,
          normalized.timezone,
          normalized.prompt,
          normalized.enabledTools.join(","),
          normalized.threadTitleTemplate,
          normalized.threadStarterPrompt,
          normalized.threadModeKey,
          normalized.enabled,
          normalized.mentionUser,
          normalized.userId,
          normalized.lastRunAt,
          normalized.lastError,
        ],
      );

      return mapAutomationRow(rows[0]);
    },

    async deleteAutomationById(automationId, { userScope } = {}) {
      const normalizedId = normalizeText(automationId, "Automation ID");
      const values = [normalizedId];
      const clauses = ["automation_id = $1"];

      if (userScope) {
        values.push(normalizeText(userScope, "User scope"));
        clauses.push(`user_scope = $${values.length}`);
      }

      const { rows } = await pool.query(
        `
          DELETE FROM automations
          WHERE ${clauses.join(" AND ")}
          RETURNING
            id,
            automation_id,
            user_scope,
            type,
            label,
            channel_id,
            schedule_time,
            timezone,
            prompt,
            thread_title_template,
            thread_starter_prompt,
            thread_mode_key,
            enabled,
            mention_user,
            user_id,
            last_run_at,
            last_error,
            created_at,
            updated_at
        `,
        values,
      );

      return mapAutomationRow(rows[0]);
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  createAutomationStore,
  SUPPORTED_AUTOMATION_TYPES,
  normalizeAutomationRecord,
  mapAutomationRow,
};
