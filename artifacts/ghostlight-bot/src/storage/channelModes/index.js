const { createPostgresPool } = require("../postgres/createPostgresPool");

const CREATE_CHANNEL_MODE_DEFINITIONS_SQL = `
  CREATE TABLE IF NOT EXISTS channel_mode_definitions (
    mode_key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    chat_model TEXT NOT NULL DEFAULT '',
    memory_types TEXT NOT NULL DEFAULT '',
    memory_sensitivity TEXT NOT NULL DEFAULT 'high',
    include_time_context TEXT NOT NULL DEFAULT 'inherit',
    retrieval_source TEXT NOT NULL DEFAULT 'off',
    retrieval_access TEXT NOT NULL DEFAULT 'off',
    heartbeat_role TEXT NOT NULL DEFAULT '',
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_CHANNEL_MODE_ASSIGNMENTS_SQL = `
  CREATE TABLE IF NOT EXISTS channel_mode_assignments (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    mode_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, channel_id)
  );
`;

const CREATE_CHANNEL_MODE_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS channel_mode_assignments_mode_key_idx ON channel_mode_assignments (mode_key);",
];

const ALTER_CHANNEL_MODE_DEFINITIONS_SQL = [
  "ALTER TABLE channel_mode_definitions ADD COLUMN IF NOT EXISTS instructions TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE channel_mode_definitions ADD COLUMN IF NOT EXISTS memory_types TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE channel_mode_definitions ADD COLUMN IF NOT EXISTS memory_sensitivity TEXT NOT NULL DEFAULT 'high';",
  "ALTER TABLE channel_mode_definitions ADD COLUMN IF NOT EXISTS include_time_context TEXT NOT NULL DEFAULT 'inherit';",
  "ALTER TABLE channel_mode_definitions ADD COLUMN IF NOT EXISTS retrieval_source TEXT NOT NULL DEFAULT 'off';",
  "ALTER TABLE channel_mode_definitions ADD COLUMN IF NOT EXISTS retrieval_access TEXT NOT NULL DEFAULT 'off';",
  "ALTER TABLE channel_mode_definitions ADD COLUMN IF NOT EXISTS heartbeat_role TEXT NOT NULL DEFAULT '';",
];

const SUPPORTED_MODE_MEMORY_TYPES = Object.freeze([
  "anchor",
  "canon",
  "resolved",
  "roleplay",
  "timeline",
]);

const SUPPORTED_MODE_MEMORY_SENSITIVITY = Object.freeze([
  "low",
  "medium",
  "high",
]);

const SUPPORTED_MODE_TIME_CONTEXT = Object.freeze([
  "inherit",
  "on",
  "off",
]);

const SUPPORTED_MODE_RETRIEVAL_SOURCE = Object.freeze([
  "off",
  "shared_safe",
  "personal",
]);

const SUPPORTED_MODE_RETRIEVAL_ACCESS = Object.freeze([
  "off",
  "shared_safe_only",
  "personal_only",
  "global",
]);

function normalizeModeKey(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!key) {
    throw new Error("Mode key is required.");
  }

  return key;
}

function normalizeText(value, label, { allowEmpty = false } = {}) {
  const normalized = String(value || "").trim();

  if (!allowEmpty && !normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function assertAllowedValue({ label, value, allowedValues }) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!allowedValues.includes(normalized)) {
    throw new Error(`Unsupported ${label} "${value}". Expected one of: ${allowedValues.join(", ")}.`);
  }

  return normalized;
}

function normalizeMemoryTypes(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const normalized = [...new Set(rawValues.map((item) => {
    const normalizedItem = String(item || "").trim().toLowerCase();

    if (!normalizedItem) {
      return "";
    }

    if (!SUPPORTED_MODE_MEMORY_TYPES.includes(normalizedItem)) {
      throw new Error(
        `Unsupported memory type "${item}". Expected one of: ${SUPPORTED_MODE_MEMORY_TYPES.join(", ")}.`,
      );
    }

    return normalizedItem;
  }).filter(Boolean))];

  if (!normalized.length) {
    throw new Error("At least one memory type is required.");
  }

  return normalized;
}

function normalizeDefinition(record = {}) {
  const isBuiltin = Boolean(record.isBuiltin || record.is_builtin);

  return {
    modeKey: normalizeModeKey(record.modeKey || record.mode_key || record.key),
    label: normalizeText(record.label, "Mode label"),
    instructions: normalizeText(
      record.instructions || record.promptBlock || record.prompt_block || record.prompt,
      "Mode instructions",
      { allowEmpty: true },
    ),
    chatModel: normalizeText(record.chatModel || record.chat_model || record.model, "Mode model", { allowEmpty: true }),
    memoryTypes: normalizeMemoryTypes(record.memoryTypes || record.memory_types),
    memorySensitivity: assertAllowedValue({
      label: "memory sensitivity",
      value: record.memorySensitivity || record.memory_sensitivity || "high",
      allowedValues: SUPPORTED_MODE_MEMORY_SENSITIVITY,
    }),
    includeTimeContext: assertAllowedValue({
      label: "time context setting",
      value: record.includeTimeContext || record.include_time_context || "inherit",
      allowedValues: SUPPORTED_MODE_TIME_CONTEXT,
    }),
    retrievalSource: assertAllowedValue({
      label: "retrieval source",
      value: record.retrievalSource || record.retrieval_source || "off",
      allowedValues: SUPPORTED_MODE_RETRIEVAL_SOURCE,
    }),
    retrievalAccess: assertAllowedValue({
      label: "retrieval access",
      value: record.retrievalAccess || record.retrieval_access || "off",
      allowedValues: SUPPORTED_MODE_RETRIEVAL_ACCESS,
    }),
    heartbeatRole: normalizeText(record.heartbeatRole || record.heartbeat_role, "Heartbeat role", { allowEmpty: true }),
    isBuiltin,
  };
}

function mapDefinitionRow(row) {
  if (!row) {
    return null;
  }

  return {
    modeKey: row.mode_key,
    label: row.label,
    instructions: row.instructions,
    chatModel: row.chat_model,
    memoryTypes: normalizeMemoryTypes(row.memory_types),
    memorySensitivity: assertAllowedValue({
      label: "memory sensitivity",
      value: row.memory_sensitivity || "high",
      allowedValues: SUPPORTED_MODE_MEMORY_SENSITIVITY,
    }),
    includeTimeContext: assertAllowedValue({
      label: "time context setting",
      value: row.include_time_context || "inherit",
      allowedValues: SUPPORTED_MODE_TIME_CONTEXT,
    }),
    retrievalSource: assertAllowedValue({
      label: "retrieval source",
      value: row.retrieval_source || "off",
      allowedValues: SUPPORTED_MODE_RETRIEVAL_SOURCE,
    }),
    retrievalAccess: assertAllowedValue({
      label: "retrieval access",
      value: row.retrieval_access || "off",
      allowedValues: SUPPORTED_MODE_RETRIEVAL_ACCESS,
    }),
    heartbeatRole: row.heartbeat_role || "",
    isBuiltin: row.is_builtin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssignmentRow(row) {
  if (!row) {
    return null;
  }

  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    modeKey: row.mode_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createNoopChannelModeStore({ logger }) {
  return {
    persistenceEnabled: false,
    async init() {
      logger.warn("[channel-modes] DATABASE_URL is not set; channel mode persistence is disabled.");
    },
    async listModeDefinitions() {
      return [];
    },
    async getModeDefinition() {
      return null;
    },
    async upsertModeDefinition() {
      throw new Error("Channel mode store is disabled because DATABASE_URL is not set.");
    },
    async deleteModeDefinition() {
      return null;
    },
    async listChannelAssignments() {
      return [];
    },
    async getChannelAssignment() {
      return null;
    },
    async assignChannelMode() {
      throw new Error("Channel mode store is disabled because DATABASE_URL is not set.");
    },
    async clearChannelAssignment() {
      return false;
    },
    async close() {},
  };
}

function createChannelModeStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopChannelModeStore({ logger });
  }

  return {
    persistenceEnabled: true,
    async init() {
      await pool.query(CREATE_CHANNEL_MODE_DEFINITIONS_SQL);
      await pool.query(CREATE_CHANNEL_MODE_ASSIGNMENTS_SQL);

      for (const statement of ALTER_CHANNEL_MODE_DEFINITIONS_SQL) {
        await pool.query(statement);
      }

      for (const statement of CREATE_CHANNEL_MODE_INDEXES_SQL) {
        await pool.query(statement);
      }
    },

    async listModeDefinitions() {
      const { rows } = await pool.query(
        `
          SELECT mode_key, label, instructions, chat_model, memory_types, memory_sensitivity, include_time_context, retrieval_source, retrieval_access, heartbeat_role, is_builtin, created_at, updated_at
          FROM channel_mode_definitions
          ORDER BY is_builtin DESC, label ASC, mode_key ASC
        `,
      );

      return rows.map(mapDefinitionRow);
    },

    async getModeDefinition(modeKey) {
      const { rows } = await pool.query(
        `
          SELECT mode_key, label, instructions, chat_model, memory_types, memory_sensitivity, include_time_context, retrieval_source, retrieval_access, heartbeat_role, is_builtin, created_at, updated_at
          FROM channel_mode_definitions
          WHERE mode_key = $1
          LIMIT 1
        `,
        [normalizeModeKey(modeKey)],
      );

      return rows[0] ? mapDefinitionRow(rows[0]) : null;
    },

    async upsertModeDefinition(record) {
      const definition = normalizeDefinition(record);

      const { rows } = await pool.query(
        `
          INSERT INTO channel_mode_definitions (
            mode_key,
            label,
            instructions,
            chat_model,
            memory_types,
            memory_sensitivity,
            include_time_context,
            retrieval_source,
            retrieval_access,
            heartbeat_role,
            is_builtin,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
          ON CONFLICT (mode_key)
          DO UPDATE SET
            label = EXCLUDED.label,
            instructions = EXCLUDED.instructions,
            chat_model = EXCLUDED.chat_model,
            memory_types = EXCLUDED.memory_types,
            memory_sensitivity = EXCLUDED.memory_sensitivity,
            include_time_context = EXCLUDED.include_time_context,
            retrieval_source = EXCLUDED.retrieval_source,
            retrieval_access = EXCLUDED.retrieval_access,
            heartbeat_role = EXCLUDED.heartbeat_role,
            is_builtin = channel_mode_definitions.is_builtin OR EXCLUDED.is_builtin,
            updated_at = NOW()
          RETURNING mode_key, label, instructions, chat_model, memory_types, memory_sensitivity, include_time_context, retrieval_source, retrieval_access, heartbeat_role, is_builtin, created_at, updated_at
        `,
        [
          definition.modeKey,
          definition.label,
          definition.instructions,
          definition.chatModel,
          definition.memoryTypes.join(","),
          definition.memorySensitivity,
          definition.includeTimeContext,
          definition.retrievalSource,
          definition.retrievalAccess,
          definition.heartbeatRole,
          definition.isBuiltin,
        ],
      );

      return mapDefinitionRow(rows[0]);
    },

    async deleteModeDefinition(modeKey, { allowBuiltin = false } = {}) {
      const normalizedModeKey = normalizeModeKey(modeKey);
      const { rows } = await pool.query(
        `
          DELETE FROM channel_mode_definitions
          WHERE mode_key = $1
            AND ($2::boolean = TRUE OR is_builtin = FALSE)
          RETURNING mode_key, label, instructions, chat_model, memory_types, memory_sensitivity, include_time_context, retrieval_source, retrieval_access, heartbeat_role, is_builtin, created_at, updated_at
        `,
        [normalizedModeKey, Boolean(allowBuiltin)],
      );

      if (!rows[0]) {
        return null;
      }

      const assignmentResult = await pool.query(
        `
          DELETE FROM channel_mode_assignments
          WHERE mode_key = $1
        `,
        [normalizedModeKey],
      );

      return {
        ...mapDefinitionRow(rows[0]),
        clearedAssignmentCount: assignmentResult.rowCount || 0,
      };
    },

    async listChannelAssignments({ guildId } = {}) {
      const params = [];
      let whereClause = "";

      if (guildId) {
        params.push(String(guildId));
        whereClause = "WHERE guild_id = $1";
      }

      const { rows } = await pool.query(
        `
          SELECT guild_id, channel_id, mode_key, created_at, updated_at
          FROM channel_mode_assignments
          ${whereClause}
          ORDER BY updated_at DESC, channel_id ASC
        `,
        params,
      );

      return rows.map(mapAssignmentRow);
    },

    async getChannelAssignment({ guildId, channelId }) {
      const normalizedGuildId = normalizeText(guildId, "Guild ID");
      const normalizedChannelId = normalizeText(channelId, "Channel ID");
      const { rows } = await pool.query(
        `
          SELECT guild_id, channel_id, mode_key, created_at, updated_at
          FROM channel_mode_assignments
          WHERE guild_id = $1
            AND channel_id = $2
          LIMIT 1
        `,
        [normalizedGuildId, normalizedChannelId],
      );

      return mapAssignmentRow(rows[0]);
    },

    async assignChannelMode({ guildId, channelId, modeKey }) {
      const normalizedGuildId = normalizeText(guildId, "Guild ID");
      const normalizedChannelId = normalizeText(channelId, "Channel ID");
      const normalizedModeKey = normalizeModeKey(modeKey);
      const { rows } = await pool.query(
        `
          INSERT INTO channel_mode_assignments (
            guild_id,
            channel_id,
            mode_key,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, NOW(), NOW())
          ON CONFLICT (guild_id, channel_id)
          DO UPDATE SET
            mode_key = EXCLUDED.mode_key,
            updated_at = NOW()
          RETURNING guild_id, channel_id, mode_key, created_at, updated_at
        `,
        [normalizedGuildId, normalizedChannelId, normalizedModeKey],
      );

      return mapAssignmentRow(rows[0]);
    },

    async clearChannelAssignment({ guildId, channelId }) {
      const normalizedGuildId = normalizeText(guildId, "Guild ID");
      const normalizedChannelId = normalizeText(channelId, "Channel ID");
      const result = await pool.query(
        `
          DELETE FROM channel_mode_assignments
          WHERE guild_id = $1
            AND channel_id = $2
        `,
        [normalizedGuildId, normalizedChannelId],
      );

      return result.rowCount > 0;
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  createChannelModeStore,
  normalizeModeKey,
  normalizeModeDefinition: normalizeDefinition,
  normalizeMemoryTypes,
  SUPPORTED_MODE_MEMORY_TYPES,
  SUPPORTED_MODE_MEMORY_SENSITIVITY,
  SUPPORTED_MODE_TIME_CONTEXT,
  SUPPORTED_MODE_RETRIEVAL_SOURCE,
  SUPPORTED_MODE_RETRIEVAL_ACCESS,
};
