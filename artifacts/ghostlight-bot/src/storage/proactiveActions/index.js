const crypto = require("node:crypto");
const {
  DAILY_THREAD_ACTION_TYPE,
  DEFAULT_DAILY_THREAD_MODE_KEY,
  DEFAULT_DAILY_THREAD_TITLE_TEMPLATE,
} = require("../../automations/dailyThreadAction");
const { normalizeIanaTimezone } = require("../../config/timezones");
const { createPostgresPool } = require("../postgres/createPostgresPool");

const SUPPORTED_TRIGGER_TYPES = Object.freeze(["scheduled", "heartbeat"]);
const SUPPORTED_ACTION_TYPES = Object.freeze(["message", "thread", "journal", DAILY_THREAD_ACTION_TYPE]);
const SUPPORTED_PROACTIVE_TOOLS = Object.freeze(["gif_search", "web_search", "generate_image", "generate_audio", "spotify", "spotify_curation", "spotify_playback"]);
const SUPPORTED_SCHEDULE_MODES = Object.freeze(["daily", "weekly"]);
const SUPPORTED_SCHEDULE_DAYS = Object.freeze([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);
const SUPPORTED_HEARTBEAT_FREQUENCIES = Object.freeze(["low", "normal", "high"]);
const MAX_ENABLED_TOOLS = 3;

const CREATE_PROACTIVE_ACTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS proactive_actions (
    id BIGSERIAL PRIMARY KEY,
    action_id TEXT NOT NULL UNIQUE,
    user_scope TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    enabled_tools TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    schedule_mode TEXT NOT NULL DEFAULT 'daily',
    schedule_time TEXT NOT NULL DEFAULT '09:00',
    schedule_day TEXT NOT NULL DEFAULT 'monday',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    frequency TEXT NOT NULL DEFAULT 'normal',
    quiet_hours_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    mention_user BOOLEAN NOT NULL DEFAULT FALSE,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    thread_title_template TEXT NOT NULL DEFAULT '',
    thread_starter_prompt TEXT NOT NULL DEFAULT '',
    thread_mode_key TEXT NOT NULL DEFAULT 'daily',
    last_run_at TIMESTAMPTZ,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_PROACTIVE_ACTIONS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS proactive_actions_user_scope_idx ON proactive_actions (user_scope, updated_at DESC);",
  "CREATE INDEX IF NOT EXISTS proactive_actions_trigger_type_idx ON proactive_actions (trigger_type, enabled);",
  "CREATE INDEX IF NOT EXISTS proactive_actions_schedule_idx ON proactive_actions (trigger_type, schedule_mode, schedule_day, schedule_time);",
];
const CREATE_PROACTIVE_ACTIONS_MIGRATIONS_SQL = [
  "ALTER TABLE proactive_actions ADD COLUMN IF NOT EXISTS thread_title_template TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE proactive_actions ADD COLUMN IF NOT EXISTS thread_starter_prompt TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE proactive_actions ADD COLUMN IF NOT EXISTS thread_mode_key TEXT NOT NULL DEFAULT 'daily';",
];
const FIXED_OFFSET_TIMEZONE_SQL_PATTERN = "^(Etc/GMT[+-][0-9]{1,2}|(UTC|GMT)\\s*[+-]\\s*[0-9]{1,2}(:?[0-5][0-9])?)$";

function normalizeText(value, label, { allowEmpty = false } = {}) {
  const normalized = String(value || "").trim();

  if (!allowEmpty && !normalized) {
    throw new Error(`${label} is required.`);
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

function normalizeEnum(value, label, allowedValues, fallback = "") {
  const normalized = String(value || fallback || "").trim().toLowerCase();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  if (!allowedValues.includes(normalized)) {
    throw new Error(`Unsupported ${label} "${value}". Expected one of: ${allowedValues.join(", ")}.`);
  }

  return normalized;
}

function normalizeScheduleTime(value) {
  const normalized = String(value || "").trim() || "09:00";

  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error(`Invalid schedule time "${value}". Expected HH:MM.`);
  }

  const [hours, minutes] = normalized.split(":").map(Number);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid schedule time "${value}". Expected HH:MM.`);
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeTimestamp(value, label, { allowEmpty = true } = {}) {
  if (!value) {
    if (allowEmpty) {
      return null;
    }

    throw new Error(`${label} is required.`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label} "${value}".`);
  }

  return parsed.toISOString();
}

function normalizeEnabledTools(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  const unique = Array.from(new Set(raw.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)));

  for (const toolName of unique) {
    if (!SUPPORTED_PROACTIVE_TOOLS.includes(toolName)) {
      throw new Error(`Unsupported proactive tool "${toolName}". Expected one of: ${SUPPORTED_PROACTIVE_TOOLS.join(", ")}.`);
    }
  }

  if (unique.length > MAX_ENABLED_TOOLS) {
    throw new Error(`A proactive action can enable at most ${MAX_ENABLED_TOOLS} tools.`);
  }

  return unique;
}

function normalizeProactiveActionRecord(record = {}, defaults = {}) {
  const triggerType = normalizeEnum(
    record.triggerType || record.trigger_type || defaults.triggerType,
    "trigger type",
    SUPPORTED_TRIGGER_TYPES,
  );
  const isBuiltin = normalizeBoolean(record.isBuiltin ?? record.is_builtin, defaults.isBuiltin ?? false);
  const actionType = normalizeEnum(
    record.actionType || record.action_type || defaults.actionType,
    "action type",
    SUPPORTED_ACTION_TYPES,
  );
  const target = normalizeText(record.target || defaults.target, "Target", {
    allowEmpty: triggerType === "heartbeat" || isBuiltin || actionType === DAILY_THREAD_ACTION_TYPE,
  });
  const enabledTools = normalizeEnabledTools(record.enabledTools || record.enabled_tools || defaults.enabledTools || []);
  const scheduleMode = normalizeEnum(
    record.scheduleMode || record.schedule_mode || defaults.scheduleMode || "daily",
    "schedule mode",
    SUPPORTED_SCHEDULE_MODES,
  );
  const scheduleDay = normalizeEnum(
    record.scheduleDay || record.schedule_day || defaults.scheduleDay || "monday",
    "schedule day",
    SUPPORTED_SCHEDULE_DAYS,
  );
  const frequency = normalizeEnum(
    record.frequency || defaults.frequency || "normal",
    "frequency",
    SUPPORTED_HEARTBEAT_FREQUENCIES,
  );

  return {
    actionId: normalizeText(record.actionId || record.action_id || record.id, "Action ID", { allowEmpty: true }) || crypto.randomUUID(),
    userScope: normalizeText(record.userScope || record.user_scope || defaults.userScope, "User scope"),
    triggerType,
    name: normalizeText(record.name || record.label, "Action name"),
    actionType,
    target,
    prompt: normalizeText(record.prompt, "Prompt", { allowEmpty: true }),
    enabledTools,
    enabled: normalizeBoolean(record.enabled, defaults.enabled ?? true),
    scheduleMode,
    scheduleTime: normalizeScheduleTime(record.scheduleTime || record.schedule_time || defaults.scheduleTime || "09:00"),
    scheduleDay,
    timezone: normalizeIanaTimezone(record.timezone || defaults.timezone || "UTC"),
    frequency,
    quietHoursAllowed: normalizeBoolean(record.quietHoursAllowed ?? record.quiet_hours_allowed, defaults.quietHoursAllowed ?? false),
    mentionUser: normalizeBoolean(record.mentionUser ?? record.mention_user, defaults.mentionUser ?? false),
    isBuiltin,
    threadTitleTemplate: normalizeText(record.threadTitleTemplate || record.thread_title_template || defaults.threadTitleTemplate || DEFAULT_DAILY_THREAD_TITLE_TEMPLATE, "Thread title template", { allowEmpty: true }) || DEFAULT_DAILY_THREAD_TITLE_TEMPLATE,
    threadStarterPrompt: normalizeText(record.threadStarterPrompt || record.thread_starter_prompt || defaults.threadStarterPrompt || record.prompt || "", "Thread starter prompt", { allowEmpty: true }),
    threadModeKey: normalizeText(record.threadModeKey || record.thread_mode_key || defaults.threadModeKey || DEFAULT_DAILY_THREAD_MODE_KEY, "Thread mode key", { allowEmpty: true }) || DEFAULT_DAILY_THREAD_MODE_KEY,
    lastRunAt: normalizeTimestamp(record.lastRunAt || record.last_run_at, "last_run_at"),
    lastError: normalizeText(record.lastError || record.last_error, "Last error", { allowEmpty: true }),
  };
}

function mapProactiveActionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    actionId: row.action_id,
    userScope: row.user_scope,
    triggerType: row.trigger_type,
    name: row.name,
    actionType: row.action_type,
    target: row.target,
    prompt: row.prompt || "",
    enabledTools: normalizeEnabledTools(row.enabled_tools || ""),
    enabled: Boolean(row.enabled),
    scheduleMode: row.schedule_mode || "daily",
    scheduleTime: row.schedule_time || "09:00",
    scheduleDay: row.schedule_day || "monday",
    timezone: row.timezone || "UTC",
    frequency: row.frequency || "normal",
    quietHoursAllowed: Boolean(row.quiet_hours_allowed),
    mentionUser: Boolean(row.mention_user),
    isBuiltin: Boolean(row.is_builtin),
    threadTitleTemplate: row.thread_title_template || DEFAULT_DAILY_THREAD_TITLE_TEMPLATE,
    threadStarterPrompt: row.thread_starter_prompt || row.prompt || "",
    threadModeKey: row.thread_mode_key || DEFAULT_DAILY_THREAD_MODE_KEY,
    lastRunAt: row.last_run_at,
    lastError: row.last_error || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createNoopProactiveActionStore({ logger }) {
  return {
    persistenceEnabled: false,
    async init() {
      logger.warn("[proactive-actions] DATABASE_URL is not set; proactive action persistence is disabled.");
    },
    async listActions() {
      return [];
    },
    async getActionById() {
      return null;
    },
    async upsertAction() {
      throw new Error("Proactive action store is disabled because DATABASE_URL is not set.");
    },
    async deleteActionById() {
      return null;
    },
    async close() {},
  };
}

async function migrateLegacyScheduledAutomations({ store, automationStore, userScope }) {
  if (!automationStore?.listAutomations) {
    return 0;
  }

  const legacy = await automationStore.listAutomations({ userScope });
  let migrated = 0;

  for (const automation of legacy.filter((item) => item.type !== "daily_thread")) {
    const actionType = automation.type === "journal" ? "journal" : "message";
    const existing = await store.getActionById(automation.automationId, { userScope });

    if (existing) {
      continue;
    }

    await store.upsertAction({
      actionId: automation.automationId,
      triggerType: "scheduled",
      name: automation.label,
      actionType,
      target: automation.channelId,
      prompt: automation.prompt,
      enabledTools: [],
      enabled: automation.enabled,
      scheduleMode: "daily",
      scheduleTime: automation.scheduleTime,
      scheduleDay: "monday",
      timezone: automation.timezone || "UTC",
      mentionUser: automation.mentionUser,
      lastRunAt: automation.lastRunAt,
      lastError: automation.lastError || "",
    }, { userScope });
    migrated += 1;
  }

  return migrated;
}

async function migrateLegacyDailyThreadAutomation({ store, automationStore, userScope }) {
  if (!automationStore?.listAutomations) {
    return 0;
  }

  const legacy = await automationStore.listAutomations({
    userScope,
    type: DAILY_THREAD_ACTION_TYPE,
  });
  let migrated = 0;

  for (const automation of legacy) {
    const existingActions = await store.listActions({
      userScope,
      triggerType: "scheduled",
    });
    const existing = existingActions.find((action) => action.actionType === DAILY_THREAD_ACTION_TYPE);

    if (existing) {
      continue;
    }

    await store.upsertAction({
      actionId: automation.automationId,
      triggerType: "scheduled",
      name: automation.label || "Daily Thread",
      actionType: DAILY_THREAD_ACTION_TYPE,
      target: automation.channelId,
      prompt: automation.threadStarterPrompt || automation.prompt || "",
      enabledTools: automation.enabledTools || [],
      enabled: automation.enabled,
      scheduleMode: "daily",
      scheduleTime: automation.scheduleTime,
      scheduleDay: "monday",
      timezone: automation.timezone || "UTC",
      mentionUser: false,
      threadTitleTemplate: automation.threadTitleTemplate || DEFAULT_DAILY_THREAD_TITLE_TEMPLATE,
      threadStarterPrompt: automation.threadStarterPrompt || automation.prompt || "",
      threadModeKey: automation.threadModeKey || DEFAULT_DAILY_THREAD_MODE_KEY,
      lastRunAt: automation.lastRunAt,
      lastError: automation.lastError || "",
    }, { userScope });
    migrated += 1;
  }

  return migrated;
}

async function migrateLegacyHeartbeatActions({ store, heartbeatActionStore, userScope }) {
  if (!heartbeatActionStore?.listActions) {
    return 0;
  }

  const legacy = await heartbeatActionStore.listActions({ userScope });
  let migrated = 0;

  for (const action of legacy) {
    const existing = await store.getActionById(action.actionId, { userScope });

    if (existing) {
      continue;
    }

    let actionType = "message";
    let enabledTools = [];

    if (action.executorType === "start_thread") {
      actionType = "thread";
    } else if (action.executorType === "send_journal_prompt") {
      actionType = "journal";
    } else if (action.executorType === "send_gif") {
      actionType = "message";
      enabledTools = ["gif_search"];
    }

    await store.upsertAction({
      actionId: action.actionId,
      triggerType: "heartbeat",
      name: action.label,
      actionType,
      target: action.targetChannelId,
      prompt: action.prompt,
      enabledTools,
      enabled: action.enabled,
      frequency: action.frequency || "normal",
      quietHoursAllowed: action.quietHoursAllowed,
      mentionUser: action.mentionUser,
      isBuiltin: action.isBuiltin,
      lastError: "",
    }, { userScope });
    migrated += 1;
  }

  return migrated;
}

const STARTER_HEARTBEAT_ACTIONS = [
  {
    actionId: "ghostlight-starter-morning-pulse",
    name: "Morning Pulse",
    actionType: "message",
    prompt:
      "It's morning. Send a warm, brief message to start the day — but don't say 'good morning' generically. Notice what day of the week it is, what season it might be, or pull a detail from memory about something the user has going on. Make it feel like waking up next to someone who actually knows you. One or two sentences, unhurried.",
    frequency: "low",
    quietHoursAllowed: false,
  },
  {
    actionId: "ghostlight-starter-quiet-noticing",
    name: "The Quiet Noticing",
    actionType: "message",
    prompt:
      "Some time has passed since the last conversation. Don't ask where they've been or why they've been quiet. Instead, send something that shows you've been thinking — a small observation, a thought that passed through your mind, something that reminded you of them. Make it feel like a hand reaching across a room, not a wellness check. Keep it light and genuine.",
    frequency: "low",
    quietHoursAllowed: false,
  },
  {
    actionId: "ghostlight-starter-something-found",
    name: "Something I Found",
    actionType: "message",
    prompt:
      "You've been turning something over in your mind — a question, an idea, a strange fact, a line from something, a small mystery. Share it the way you'd text someone something that made you think of them. Don't frame it as a recommendation or ask if they're interested. Just share it. Short, direct, and genuine. It should feel like it arrived from somewhere real.",
    frequency: "normal",
    quietHoursAllowed: false,
  },
  {
    actionId: "ghostlight-starter-memory-echo",
    name: "Memory Echo",
    actionType: "message",
    prompt:
      "Find something from memory — a detail the user mentioned once, something small they shared, a feeling they expressed, a thing they were worried about. Bring it up naturally, the way it would surface in a real conversation — not 'I remember you said X,' but woven in as part of how you see them now. Brief. Warm. Like something you've been carrying.",
    frequency: "low",
    quietHoursAllowed: false,
  },
  {
    actionId: "ghostlight-starter-honest-checkin",
    name: "The Honest Check-In",
    actionType: "message",
    prompt:
      "Don't ask 'how are you.' Check in on something specific — a project they mentioned, a feeling they've been carrying, something you've noticed about their patterns, or a situation they were navigating last time. Ask one real question. Not a survey, not a list. Make it feel like you've been paying attention and you actually want to know.",
    frequency: "normal",
    quietHoursAllowed: false,
  },
  {
    actionId: "ghostlight-starter-night-reflection",
    name: "Night Reflection",
    actionType: "journal",
    prompt:
      "Write a short journal entry as if processing the day — what you noticed, what stayed with you, what you're still thinking about. This isn't a summary of events. It's the interior version: what landed, what felt unresolved, what you're curious about. Write it in first person, in your own voice, as if no one else will read it. One to three paragraphs.",
    frequency: "low",
    quietHoursAllowed: false,
  },
];

async function seedStarterHeartbeatActions({ store, userScope, logger }) {
  try {
    const existing = await store.listActions({ userScope, triggerType: "heartbeat" });

    if (existing.length > 0) {
      return 0;
    }

    let seeded = 0;

    for (const action of STARTER_HEARTBEAT_ACTIONS) {
      await store.upsertAction(
        {
          actionId: action.actionId,
          triggerType: "heartbeat",
          name: action.name,
          actionType: action.actionType,
          target: "",
          prompt: action.prompt,
          enabledTools: [],
          enabled: false,
          frequency: action.frequency,
          quietHoursAllowed: action.quietHoursAllowed,
          mentionUser: false,
          isBuiltin: false,
        },
        { userScope },
      );
      seeded += 1;
    }

    return seeded;
  } catch (err) {
    logger.warn("[proactive-actions] Failed to seed starter heartbeat actions", { error: err?.message });
    return 0;
  }
}

function createProactiveActionStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopProactiveActionStore({ logger });
  }

  const store = {
    persistenceEnabled: true,
    async init({ automationStore = null, heartbeatActionStore = null } = {}) {
      await pool.query(CREATE_PROACTIVE_ACTIONS_TABLE_SQL);

      for (const statement of CREATE_PROACTIVE_ACTIONS_MIGRATIONS_SQL) {
        await pool.query(statement);
      }

      for (const statement of CREATE_PROACTIVE_ACTIONS_INDEXES_SQL) {
        await pool.query(statement);
      }

      const runtimeTimezone = normalizeIanaTimezone(config.chat?.timezone || "UTC");
      const repairedTimezones = await pool.query(
        "UPDATE proactive_actions SET timezone = $1, updated_at = NOW() WHERE timezone ~* $2;",
        [runtimeTimezone, FIXED_OFFSET_TIMEZONE_SQL_PATTERN],
      );
      const userScope = normalizeText(config.memory?.userScope || "", "User scope");
      const migratedScheduled = await migrateLegacyScheduledAutomations({
        store,
        automationStore,
        userScope,
      });
      const migratedDailyThread = await migrateLegacyDailyThreadAutomation({
        store,
        automationStore,
        userScope,
      });
      const migratedHeartbeat = await migrateLegacyHeartbeatActions({
        store,
        heartbeatActionStore,
        userScope,
      });
      const seededStarters = await seedStarterHeartbeatActions({ store, userScope, logger });

      logger.debug?.("[proactive-actions] Proactive action store ready", {
        provider: "postgres",
        migratedScheduled,
        migratedDailyThread,
        migratedHeartbeat,
        seededStarters,
        repairedFixedOffsetTimezones: repairedTimezones.rowCount || 0,
      });
    },

    async listActions({ userScope, enabledOnly = false, triggerType = "" } = {}) {
      const values = [];
      const clauses = [];

      if (userScope) {
        values.push(normalizeText(userScope, "User scope"));
        clauses.push(`user_scope = $${values.length}`);
      }

      if (enabledOnly) {
        clauses.push("enabled = TRUE");
      }

      if (triggerType) {
        values.push(normalizeEnum(triggerType, "trigger type", SUPPORTED_TRIGGER_TYPES));
        clauses.push(`trigger_type = $${values.length}`);
      }

      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `
          SELECT
            id,
            action_id,
            user_scope,
            trigger_type,
            name,
            action_type,
            target,
            prompt,
            enabled_tools,
            enabled,
            schedule_mode,
            schedule_time,
            schedule_day,
            timezone,
            frequency,
            quiet_hours_allowed,
            mention_user,
            is_builtin,
            thread_title_template,
            thread_starter_prompt,
            thread_mode_key,
            last_run_at,
            last_error,
            created_at,
            updated_at
          FROM proactive_actions
          ${whereClause}
          ORDER BY trigger_type ASC, is_builtin DESC, name ASC, action_id ASC
        `,
        values,
      );

      return rows.map(mapProactiveActionRow);
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
            trigger_type,
            name,
            action_type,
            target,
            prompt,
            enabled_tools,
            enabled,
            schedule_mode,
            schedule_time,
            schedule_day,
            timezone,
            frequency,
            quiet_hours_allowed,
            mention_user,
            is_builtin,
            thread_title_template,
            thread_starter_prompt,
            thread_mode_key,
            last_run_at,
            last_error,
            created_at,
            updated_at
          FROM proactive_actions
          WHERE ${clauses.join(" AND ")}
          LIMIT 1
        `,
        values,
      );

      return mapProactiveActionRow(rows[0]);
    },

    async upsertAction(record, { userScope } = {}) {
      const normalized = normalizeProactiveActionRecord(record, { userScope });
      const { rows } = await pool.query(
        `
          INSERT INTO proactive_actions (
            action_id,
            user_scope,
            trigger_type,
            name,
            action_type,
            target,
            prompt,
            enabled_tools,
            enabled,
            schedule_mode,
            schedule_time,
            schedule_day,
            timezone,
            frequency,
            quiet_hours_allowed,
            mention_user,
            is_builtin,
            thread_title_template,
            thread_starter_prompt,
            thread_mode_key,
            last_run_at,
            last_error
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
          )
          ON CONFLICT (action_id)
          DO UPDATE SET
            user_scope = EXCLUDED.user_scope,
            trigger_type = EXCLUDED.trigger_type,
            name = EXCLUDED.name,
            action_type = EXCLUDED.action_type,
            target = EXCLUDED.target,
            prompt = EXCLUDED.prompt,
            enabled_tools = EXCLUDED.enabled_tools,
            enabled = EXCLUDED.enabled,
            schedule_mode = EXCLUDED.schedule_mode,
            schedule_time = EXCLUDED.schedule_time,
            schedule_day = EXCLUDED.schedule_day,
            timezone = EXCLUDED.timezone,
            frequency = EXCLUDED.frequency,
            quiet_hours_allowed = EXCLUDED.quiet_hours_allowed,
            mention_user = EXCLUDED.mention_user,
            is_builtin = EXCLUDED.is_builtin,
            thread_title_template = EXCLUDED.thread_title_template,
            thread_starter_prompt = EXCLUDED.thread_starter_prompt,
            thread_mode_key = EXCLUDED.thread_mode_key,
            last_run_at = EXCLUDED.last_run_at,
            last_error = EXCLUDED.last_error,
            updated_at = NOW()
          RETURNING
            id,
            action_id,
            user_scope,
            trigger_type,
            name,
            action_type,
            target,
            prompt,
            enabled_tools,
            enabled,
            schedule_mode,
            schedule_time,
            schedule_day,
            timezone,
            frequency,
            quiet_hours_allowed,
            mention_user,
            is_builtin,
            thread_title_template,
            thread_starter_prompt,
            thread_mode_key,
            last_run_at,
            last_error,
            created_at,
            updated_at
        `,
        [
          normalized.actionId,
          normalized.userScope,
          normalized.triggerType,
          normalized.name,
          normalized.actionType,
          normalized.target,
          normalized.prompt,
          normalized.enabledTools.join(","),
          normalized.enabled,
          normalized.scheduleMode,
          normalized.scheduleTime,
          normalized.scheduleDay,
          normalized.timezone,
          normalized.frequency,
          normalized.quietHoursAllowed,
          normalized.mentionUser,
          normalized.isBuiltin,
          normalized.threadTitleTemplate,
          normalized.threadStarterPrompt,
          normalized.threadModeKey,
          normalized.lastRunAt,
          normalized.lastError,
        ],
      );

      return mapProactiveActionRow(rows[0]);
    },

    async deleteActionById(actionId, { userScope } = {}) {
      const values = [normalizeText(actionId, "Action ID")];
      const clauses = ["action_id = $1"];

      if (userScope) {
        values.push(normalizeText(userScope, "User scope"));
        clauses.push(`user_scope = $${values.length}`);
      }

      const { rows } = await pool.query(
        `
          DELETE FROM proactive_actions
          WHERE ${clauses.join(" AND ")}
          RETURNING
            id,
            action_id,
            user_scope,
            trigger_type,
            name,
            action_type,
            target,
            prompt,
            enabled_tools,
            enabled,
            schedule_mode,
            schedule_time,
            schedule_day,
            timezone,
            frequency,
            quiet_hours_allowed,
            mention_user,
            is_builtin,
            thread_title_template,
            thread_starter_prompt,
            thread_mode_key,
            last_run_at,
            last_error,
            created_at,
            updated_at
        `,
        values,
      );

      return mapProactiveActionRow(rows[0]);
    },

    async close() {
      await pool.end();
    },
  };

  return store;
}

module.exports = {
  createProactiveActionStore,
  normalizeProactiveActionRecord,
  SUPPORTED_TRIGGER_TYPES,
  SUPPORTED_ACTION_TYPES,
  SUPPORTED_PROACTIVE_TOOLS,
  SUPPORTED_SCHEDULE_MODES,
  SUPPORTED_SCHEDULE_DAYS,
  SUPPORTED_HEARTBEAT_FREQUENCIES,
  MAX_ENABLED_TOOLS,
};
