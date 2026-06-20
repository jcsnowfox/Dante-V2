const crypto = require("node:crypto");
const { createPostgresPool } = require("../postgres/createPostgresPool");

const SUPPORTED_GENERATED_IMAGE_STATUSES = Object.freeze([
  "pending",
  "completed",
  "failed",
  "deleted",
]);

const CREATE_GENERATED_IMAGES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS generated_images (
    id BIGSERIAL PRIMARY KEY,
    image_id UUID NOT NULL UNIQUE,
    user_scope TEXT NOT NULL,
    source_surface TEXT NOT NULL,
    conversation_id TEXT,
    channel_id TEXT,
    discord_message_id TEXT,
    prompt TEXT NOT NULL,
    composed_prompt TEXT NOT NULL,
    style_preset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    appearance_preset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    model TEXT NOT NULL,
    aspect_ratio TEXT,
    mime_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    storage_key TEXT NOT NULL UNIQUE,
    thumbnail_storage_key TEXT,
    custom_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );
`;

const CREATE_GENERATED_IMAGES_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS generated_images_user_scope_created_at_idx ON generated_images (user_scope, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS generated_images_conversation_created_at_idx ON generated_images (conversation_id, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS generated_images_status_created_at_idx ON generated_images (status, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS generated_images_custom_tags_gin_idx ON generated_images USING GIN (custom_tags);",
];

const ALTER_GENERATED_IMAGES_TABLE_SQL = [
  "ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS custom_tags JSONB NOT NULL DEFAULT '[]'::jsonb;",
  "ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;",
  "ALTER TABLE generated_images ADD COLUMN IF NOT EXISTS thumbnail_storage_key TEXT;",
];

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

function normalizeIdList(value) {
  const items = Array.isArray(value) ? value : [];

  return Array.from(new Set(items
    .map((item) => String(item || "").trim())
    .filter(Boolean)));
}

function normalizeTagList(value) {
  const items = Array.isArray(value) ? value : [];

  return Array.from(new Set(items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20)));
}

function normalizeImageSearchTerms(value) {
  return Array.from(new Set(String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12)));
}

function normalizeStatus(value) {
  const normalized = String(value || "pending").trim().toLowerCase();

  if (!SUPPORTED_GENERATED_IMAGE_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported generated image status "${value}".`);
  }

  return normalized;
}

function coalesceDefined(...values) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function normalizeGeneratedImageRecord(record = {}, defaults = {}) {
  return {
    imageId: normalizeText(record.imageId || record.image_id || defaults.imageId, "Image ID", { allowEmpty: true }) || crypto.randomUUID(),
    userScope: normalizeText(record.userScope || record.user_scope || defaults.userScope, "User scope"),
    sourceSurface: normalizeText(record.sourceSurface || record.source_surface || defaults.sourceSurface || "chat", "Source surface"),
    conversationId: normalizeText(record.conversationId || record.conversation_id || defaults.conversationId, "Conversation ID", { allowEmpty: true }) || null,
    channelId: normalizeText(record.channelId || record.channel_id || defaults.channelId, "Channel ID", { allowEmpty: true }) || null,
    discordMessageId: normalizeText(record.discordMessageId || record.discord_message_id || defaults.discordMessageId, "Discord message ID", { allowEmpty: true }) || null,
    prompt: normalizeText(record.prompt || defaults.prompt, "Prompt"),
    composedPrompt: normalizeText(record.composedPrompt || record.composed_prompt || defaults.composedPrompt, "Composed prompt"),
    stylePresetIds: normalizeIdList(coalesceDefined(record.style_preset_ids, record.stylePresetIds, defaults.stylePresetIds)),
    appearancePresetIds: normalizeIdList(coalesceDefined(record.appearance_preset_ids, record.appearancePresetIds, defaults.appearancePresetIds)),
    model: normalizeText(record.model || defaults.model, "Model"),
    aspectRatio: normalizeText(record.aspectRatio || record.aspect_ratio || defaults.aspectRatio, "Aspect ratio", { allowEmpty: true }) || null,
    mimeType: normalizeText(record.mimeType || record.mime_type || defaults.mimeType, "MIME type"),
    fileSizeBytes: Math.max(0, Number.parseInt(String(record.fileSizeBytes || record.file_size_bytes || defaults.fileSizeBytes || 0), 10) || 0),
    storageKey: normalizeText(record.storageKey || record.storage_key || defaults.storageKey, "Storage key"),
    thumbnailStorageKey: normalizeText(record.thumbnailStorageKey || record.thumbnail_storage_key || defaults.thumbnailStorageKey, "Thumbnail storage key", { allowEmpty: true }) || null,
    customTags: normalizeTagList(coalesceDefined(record.custom_tags, record.customTags, defaults.customTags)),
    isFavorite: Boolean(coalesceDefined(record.is_favorite, record.isFavorite, defaults.isFavorite)),
    status: normalizeStatus(record.status || defaults.status || "pending"),
    errorMessage: normalizeText(record.errorMessage || record.error_message || defaults.errorMessage, "Error message", { allowEmpty: true }) || null,
    createdAt: normalizeTimestamp(record.createdAt || record.created_at || defaults.createdAt, "created_at"),
    deletedAt: normalizeTimestamp(record.deletedAt || record.deleted_at || defaults.deletedAt, "deleted_at", { allowEmpty: true }),
  };
}

function mapGeneratedImageRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    imageId: row.image_id,
    userScope: row.user_scope,
    sourceSurface: row.source_surface,
    conversationId: row.conversation_id,
    channelId: row.channel_id,
    discordMessageId: row.discord_message_id,
    prompt: row.prompt,
    composedPrompt: row.composed_prompt,
    stylePresetIds: Array.isArray(row.style_preset_ids) ? row.style_preset_ids : [],
    appearancePresetIds: Array.isArray(row.appearance_preset_ids) ? row.appearance_preset_ids : [],
    model: row.model,
    aspectRatio: row.aspect_ratio,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes || 0),
    storageKey: row.storage_key,
    thumbnailStorageKey: row.thumbnail_storage_key,
    customTags: Array.isArray(row.custom_tags) ? row.custom_tags : [],
    isFavorite: Boolean(row.is_favorite),
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function createNoopGeneratedImageStore({ logger }) {
  return {
    persistenceEnabled: false,
    async init() {
      logger.warn("[generated-images] DATABASE_URL is not set; generated image persistence is disabled.");
    },
    async recordImage() {
      throw new Error("Generated image store is disabled because DATABASE_URL is not set.");
    },
    async updateImageRecord() {
      throw new Error("Generated image store is disabled because DATABASE_URL is not set.");
    },
    async getImageById() {
      return null;
    },
    async close() {},
  };
}

function createGeneratedImageStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopGeneratedImageStore({ logger });
  }

  return {
    persistenceEnabled: true,
    async init() {
      await pool.query(CREATE_GENERATED_IMAGES_TABLE_SQL);

      for (const statement of ALTER_GENERATED_IMAGES_TABLE_SQL) {
        await pool.query(statement);
      }

      for (const statement of CREATE_GENERATED_IMAGES_INDEXES_SQL) {
        await pool.query(statement);
      }

      logger.debug?.("[generated-images] Generated image store ready", {
        provider: "postgres",
      });
    },

    async recordImage(record, defaults = {}) {
      const normalized = normalizeGeneratedImageRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO generated_images (
            image_id,
            user_scope,
            source_surface,
            conversation_id,
            channel_id,
            discord_message_id,
            prompt,
            composed_prompt,
            style_preset_ids,
            appearance_preset_ids,
            model,
            aspect_ratio,
            mime_type,
            file_size_bytes,
            storage_key,
            thumbnail_storage_key,
            custom_tags,
            is_favorite,
            status,
            error_message,
            created_at,
            deleted_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20, $21, $22)
          RETURNING *
        `,
        [
          normalized.imageId,
          normalized.userScope,
          normalized.sourceSurface,
          normalized.conversationId,
          normalized.channelId,
          normalized.discordMessageId,
          normalized.prompt,
          normalized.composedPrompt,
          JSON.stringify(normalized.stylePresetIds),
          JSON.stringify(normalized.appearancePresetIds),
          normalized.model,
          normalized.aspectRatio,
          normalized.mimeType,
          normalized.fileSizeBytes,
          normalized.storageKey,
          normalized.thumbnailStorageKey,
          JSON.stringify(normalized.customTags),
          normalized.isFavorite,
          normalized.status,
          normalized.errorMessage,
          normalized.createdAt,
          normalized.deletedAt,
        ],
      );

      return mapGeneratedImageRow(rows[0] || null);
    },

    async updateImageRecord(imageId, updates = {}, defaults = {}) {
      const existing = await this.getImageById(imageId, {
        userScope: defaults.userScope,
      });

      if (!existing) {
        return null;
      }

      const normalized = normalizeGeneratedImageRecord({
        ...existing,
        ...updates,
        imageId: existing.imageId,
      }, defaults);

      const { rows } = await pool.query(
        `
          UPDATE generated_images
          SET
            discord_message_id = $3,
            custom_tags = $4::jsonb,
            is_favorite = $5,
            status = $6,
            error_message = $7,
            deleted_at = $8,
            thumbnail_storage_key = $9
          WHERE image_id = $1
            AND user_scope = $2
          RETURNING *
        `,
        [
          existing.imageId,
          normalized.userScope,
          normalized.discordMessageId,
          JSON.stringify(normalized.customTags),
          normalized.isFavorite,
          normalized.status,
          normalized.errorMessage,
          normalized.deletedAt,
          normalized.thumbnailStorageKey,
        ],
      );

      return mapGeneratedImageRow(rows[0] || null);
    },

    async getImageById(imageId, { userScope } = {}) {
      const normalizedImageId = normalizeText(imageId, "Image ID");
      const normalizedScope = normalizeText(userScope, "User scope");
      const { rows } = await pool.query(
        `
          SELECT *
          FROM generated_images
          WHERE image_id = $1
            AND user_scope = $2
          LIMIT 1
        `,
        [normalizedImageId, normalizedScope],
      );

      return mapGeneratedImageRow(rows[0] || null);
    },

    async listImages({
      userScope,
      limit = 24,
      offset = 0,
      includeDeleted = false,
      favoritesOnly = false,
      status = "",
      q = "",
      aspectRatios = [],
      stylePresetIds = [],
      appearancePresetIds = [],
      tags = [],
    } = {}) {
      const normalizedScope = normalizeText(userScope, "User scope");
      const parsedLimit = Math.max(1, Math.min(Number(limit) || 24, 100));
      const parsedOffset = Math.max(0, Number(offset) || 0);
      const normalizedFavoritesOnly = Boolean(favoritesOnly);
      const normalizedStatus = String(status || "").trim().toLowerCase();
      const normalizedQueryTerms = normalizeImageSearchTerms(q);
      const normalizedAspectRatios = normalizeIdList(aspectRatios);
      const normalizedStylePresetIds = normalizeIdList(stylePresetIds);
      const normalizedAppearancePresetIds = normalizeIdList(appearancePresetIds);
      const normalizedTags = normalizeTagList(tags).map((tag) => tag.toLowerCase());
      const { rows } = await pool.query(
        `
          SELECT *
          FROM generated_images
          WHERE user_scope = $1
            AND ($2::boolean OR deleted_at IS NULL)
            AND ($3::boolean = FALSE OR is_favorite = TRUE)
            AND ($4::text = '' OR status = $4)
            AND (
              $5::jsonb = '[]'::jsonb
              OR NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text($5::jsonb) AS search_term(term)
                WHERE prompt NOT ILIKE '%' || search_term.term || '%'
                  AND composed_prompt NOT ILIKE '%' || search_term.term || '%'
              )
            )
            AND ($6::jsonb = '[]'::jsonb OR to_jsonb(ARRAY[aspect_ratio]::text[]) <@ $6::jsonb)
            AND ($7::jsonb = '[]'::jsonb OR style_preset_ids @> $7::jsonb)
            AND ($8::jsonb = '[]'::jsonb OR appearance_preset_ids @> $8::jsonb)
            AND ($9::jsonb = '[]'::jsonb OR custom_tags @> $9::jsonb)
          ORDER BY created_at DESC, id DESC
          LIMIT $10
          OFFSET $11
        `,
        [
          normalizedScope,
          includeDeleted,
          normalizedFavoritesOnly,
          normalizedStatus,
          JSON.stringify(normalizedQueryTerms),
          JSON.stringify(normalizedAspectRatios),
          JSON.stringify(normalizedStylePresetIds),
          JSON.stringify(normalizedAppearancePresetIds),
          JSON.stringify(normalizedTags),
          parsedLimit,
          parsedOffset,
        ],
      );

      return rows.map(mapGeneratedImageRow);
    },

    async countImages({
      userScope,
      includeDeleted = false,
      favoritesOnly = false,
      status = "",
      q = "",
      aspectRatios = [],
      stylePresetIds = [],
      appearancePresetIds = [],
      tags = [],
    } = {}) {
      const normalizedScope = normalizeText(userScope, "User scope");
      const normalizedFavoritesOnly = Boolean(favoritesOnly);
      const normalizedStatus = String(status || "").trim().toLowerCase();
      const normalizedQueryTerms = normalizeImageSearchTerms(q);
      const normalizedAspectRatios = normalizeIdList(aspectRatios);
      const normalizedStylePresetIds = normalizeIdList(stylePresetIds);
      const normalizedAppearancePresetIds = normalizeIdList(appearancePresetIds);
      const normalizedTags = normalizeTagList(tags).map((tag) => tag.toLowerCase());
      const { rows } = await pool.query(
        `
          SELECT COUNT(*)::integer AS total
          FROM generated_images
          WHERE user_scope = $1
            AND ($2::boolean OR deleted_at IS NULL)
            AND ($3::boolean = FALSE OR is_favorite = TRUE)
            AND ($4::text = '' OR status = $4)
            AND (
              $5::jsonb = '[]'::jsonb
              OR NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text($5::jsonb) AS search_term(term)
                WHERE prompt NOT ILIKE '%' || search_term.term || '%'
                  AND composed_prompt NOT ILIKE '%' || search_term.term || '%'
              )
            )
            AND ($6::jsonb = '[]'::jsonb OR to_jsonb(ARRAY[aspect_ratio]::text[]) <@ $6::jsonb)
            AND ($7::jsonb = '[]'::jsonb OR style_preset_ids @> $7::jsonb)
            AND ($8::jsonb = '[]'::jsonb OR appearance_preset_ids @> $8::jsonb)
            AND ($9::jsonb = '[]'::jsonb OR custom_tags @> $9::jsonb)
        `,
        [
          normalizedScope,
          includeDeleted,
          normalizedFavoritesOnly,
          normalizedStatus,
          JSON.stringify(normalizedQueryTerms),
          JSON.stringify(normalizedAspectRatios),
          JSON.stringify(normalizedStylePresetIds),
          JSON.stringify(normalizedAppearancePresetIds),
          JSON.stringify(normalizedTags),
        ],
      );

      return Number(rows[0]?.total || 0);
    },

    async listDistinctCustomTags({ userScope, includeDeleted = false, limit = 200 } = {}) {
      const normalizedScope = normalizeText(userScope, "User scope");
      const parsedLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
      const { rows } = await pool.query(
        `
          SELECT DISTINCT lower(tag_value) AS tag
          FROM generated_images
          CROSS JOIN LATERAL jsonb_array_elements_text(custom_tags) AS tag_value
          WHERE user_scope = $1
            AND ($2::boolean OR deleted_at IS NULL)
            AND trim(tag_value) <> ''
          ORDER BY lower(tag_value) ASC
          LIMIT $3
        `,
        [
          normalizedScope,
          includeDeleted,
          parsedLimit,
        ],
      );

      return rows
        .map((row) => String(row.tag || "").trim())
        .filter(Boolean);
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  createGeneratedImageStore,
  normalizeGeneratedImageRecord,
  normalizeImageSearchTerms,
  SUPPORTED_GENERATED_IMAGE_STATUSES,
};
