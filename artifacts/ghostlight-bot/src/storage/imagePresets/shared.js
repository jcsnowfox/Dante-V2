const crypto = require("node:crypto");
const { createPostgresPool } = require("../postgres/createPostgresPool");

function normalizeText(value, label, { allowEmpty = false } = {}) {
  const normalized = String(value || "").trim();

  if (!allowEmpty && !normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeTimestamp(value, label, { allowEmpty = false } = {}) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    if (allowEmpty) {
      return null;
    }

    return new Date().toISOString();
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label} "${value}".`);
  }

  return date.toISOString();
}

function createPresetStore({
  config,
  logger,
  tableName,
  logLabel,
}) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return {
      persistenceEnabled: false,
      async init() {
        logger.warn(`[${logLabel}] DATABASE_URL is not set; preset persistence is disabled.`);
      },
      async upsertPreset() {
        throw new Error(`${logLabel} store is disabled because DATABASE_URL is not set.`);
      },
      async listPresets() {
        return [];
      },
      async getPresetById() {
        return null;
      },
      async archivePreset() {
        return null;
      },
      async deletePreset() {
        return null;
      },
      async close() {},
    };
  }

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id BIGSERIAL PRIMARY KEY,
      preset_id UUID NOT NULL UNIQUE,
      user_scope TEXT NOT NULL,
      name TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      reference_image_storage_key TEXT,
      reference_image_mime_type TEXT,
      reference_image_file_size_bytes INTEGER,
      reference_image_original_filename TEXT,
      reference_image_updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    );
  `;

  const alterTableStatements = [
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS reference_image_storage_key TEXT;`,
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS reference_image_mime_type TEXT;`,
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS reference_image_file_size_bytes INTEGER;`,
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS reference_image_original_filename TEXT;`,
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS reference_image_updated_at TIMESTAMPTZ;`,
  ];

  const createIndexes = [
    `CREATE INDEX IF NOT EXISTS ${tableName}_user_scope_updated_at_idx ON ${tableName} (user_scope, updated_at DESC);`,
    `CREATE INDEX IF NOT EXISTS ${tableName}_user_scope_archived_at_idx ON ${tableName} (user_scope, archived_at, updated_at DESC);`,
  ];

  function normalizePresetRecord(record = {}, defaults = {}) {
    return {
      presetId: normalizeText(record.presetId || record.preset_id || defaults.presetId, "Preset ID", { allowEmpty: true }) || crypto.randomUUID(),
      userScope: normalizeText(record.userScope || record.user_scope || defaults.userScope, "User scope"),
      name: normalizeText(record.name || defaults.name, "Preset name"),
      promptText: normalizeText(record.promptText || record.prompt_text || defaults.promptText, "Preset prompt"),
      referenceImageStorageKey: normalizeText(
        record.referenceImageStorageKey || record.reference_image_storage_key || defaults.referenceImageStorageKey,
        "Reference image storage key",
        { allowEmpty: true },
      ) || null,
      referenceImageMimeType: normalizeText(
        record.referenceImageMimeType || record.reference_image_mime_type || defaults.referenceImageMimeType,
        "Reference image mime type",
        { allowEmpty: true },
      ) || null,
      referenceImageFileSizeBytes: Number.isFinite(Number(record.referenceImageFileSizeBytes ?? record.reference_image_file_size_bytes ?? defaults.referenceImageFileSizeBytes))
        ? Number(record.referenceImageFileSizeBytes ?? record.reference_image_file_size_bytes ?? defaults.referenceImageFileSizeBytes)
        : null,
      referenceImageOriginalFilename: normalizeText(
        record.referenceImageOriginalFilename || record.reference_image_original_filename || defaults.referenceImageOriginalFilename,
        "Reference image original filename",
        { allowEmpty: true },
      ) || null,
      referenceImageUpdatedAt: normalizeTimestamp(
        record.referenceImageUpdatedAt || record.reference_image_updated_at || defaults.referenceImageUpdatedAt,
        "reference_image_updated_at",
        { allowEmpty: true },
      ),
      createdAt: normalizeTimestamp(record.createdAt || record.created_at || defaults.createdAt, "created_at"),
      updatedAt: normalizeTimestamp(record.updatedAt || record.updated_at || defaults.updatedAt, "updated_at"),
      archivedAt: normalizeTimestamp(record.archivedAt || record.archived_at || defaults.archivedAt, "archived_at", { allowEmpty: true }),
    };
  }

  function mapPresetRow(row) {
    if (!row) {
      return null;
    }

    return {
      id: Number(row.id),
      presetId: row.preset_id,
      userScope: row.user_scope,
      name: row.name,
      promptText: row.prompt_text,
      referenceImageStorageKey: row.reference_image_storage_key,
      referenceImageMimeType: row.reference_image_mime_type,
      referenceImageFileSizeBytes: row.reference_image_file_size_bytes === null ? null : Number(row.reference_image_file_size_bytes),
      referenceImageOriginalFilename: row.reference_image_original_filename,
      referenceImageUpdatedAt: row.reference_image_updated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at,
    };
  }

  return {
    persistenceEnabled: true,
    normalizePresetRecord,
    async init() {
      await pool.query(createTableSql);

      for (const statement of alterTableStatements) {
        await pool.query(statement);
      }

      for (const statement of createIndexes) {
        await pool.query(statement);
      }

      logger.debug?.(`[${logLabel}] Preset store ready`, {
        provider: "postgres",
      });
    },

    async upsertPreset(record, defaults = {}) {
      const normalized = normalizePresetRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO ${tableName} (
            preset_id,
            user_scope,
            name,
            prompt_text,
            reference_image_storage_key,
            reference_image_mime_type,
            reference_image_file_size_bytes,
            reference_image_original_filename,
            reference_image_updated_at,
            created_at,
            updated_at,
            archived_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (preset_id)
          DO UPDATE SET
            name = EXCLUDED.name,
            prompt_text = EXCLUDED.prompt_text,
            reference_image_storage_key = EXCLUDED.reference_image_storage_key,
            reference_image_mime_type = EXCLUDED.reference_image_mime_type,
            reference_image_file_size_bytes = EXCLUDED.reference_image_file_size_bytes,
            reference_image_original_filename = EXCLUDED.reference_image_original_filename,
            reference_image_updated_at = EXCLUDED.reference_image_updated_at,
            updated_at = EXCLUDED.updated_at,
            archived_at = EXCLUDED.archived_at
          RETURNING *
        `,
        [
          normalized.presetId,
          normalized.userScope,
          normalized.name,
          normalized.promptText,
          normalized.referenceImageStorageKey,
          normalized.referenceImageMimeType,
          normalized.referenceImageFileSizeBytes,
          normalized.referenceImageOriginalFilename,
          normalized.referenceImageUpdatedAt,
          normalized.createdAt,
          normalized.updatedAt,
          normalized.archivedAt,
        ],
      );

      return mapPresetRow(rows[0] || null);
    },

    async listPresets({ userScope, includeArchived = false } = {}) {
      const normalizedScope = normalizeText(userScope, "User scope");
      const { rows } = await pool.query(
        `
          SELECT *
          FROM ${tableName}
          WHERE user_scope = $1
            AND ($2::boolean OR archived_at IS NULL)
          ORDER BY updated_at DESC, id DESC
        `,
        [normalizedScope, includeArchived],
      );

      return rows.map(mapPresetRow);
    },

    async getPresetById(presetId, { userScope } = {}) {
      const normalizedPresetId = normalizeText(presetId, "Preset ID");
      const normalizedScope = normalizeText(userScope, "User scope");
      const { rows } = await pool.query(
        `
          SELECT *
          FROM ${tableName}
          WHERE preset_id = $1
            AND user_scope = $2
          LIMIT 1
        `,
        [normalizedPresetId, normalizedScope],
      );

      return mapPresetRow(rows[0] || null);
    },

    async archivePreset(presetId, { userScope, archived = true } = {}) {
      const normalizedPresetId = normalizeText(presetId, "Preset ID");
      const normalizedScope = normalizeText(userScope, "User scope");
      const archivedAt = archived ? new Date().toISOString() : null;
      const { rows } = await pool.query(
        `
          UPDATE ${tableName}
          SET archived_at = $3,
              updated_at = NOW()
          WHERE preset_id = $1
            AND user_scope = $2
          RETURNING *
        `,
        [normalizedPresetId, normalizedScope, archivedAt],
      );

      return mapPresetRow(rows[0] || null);
    },

    async deletePreset(presetId, { userScope } = {}) {
      const normalizedPresetId = normalizeText(presetId, "Preset ID");
      const normalizedScope = normalizeText(userScope, "User scope");
      const { rows } = await pool.query(
        `
          DELETE FROM ${tableName}
          WHERE preset_id = $1
            AND user_scope = $2
          RETURNING *
        `,
        [normalizedPresetId, normalizedScope],
      );

      return mapPresetRow(rows[0] || null);
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  createPresetStore,
};
