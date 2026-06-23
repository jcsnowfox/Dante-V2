const crypto = require("node:crypto");
const { createPostgresPool } = require("../postgres/createPostgresPool");

const SUPPORTED_GENERATED_AUDIO_STATUSES = Object.freeze([
  "pending",
  "completed",
  "failed",
  "deleted",
]);

const CREATE_GENERATED_AUDIO_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS generated_audio (
    id BIGSERIAL PRIMARY KEY,
    audio_id UUID NOT NULL UNIQUE,
    user_scope TEXT NOT NULL,
    source_surface TEXT NOT NULL,
    display_name TEXT NOT NULL,
    conversation_id TEXT,
    channel_id TEXT,
    discord_message_id TEXT,
    source_message_id TEXT,
    prompt TEXT NOT NULL,
    spoken_text TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    voice_id TEXT NOT NULL,
    model TEXT NOT NULL,
    output_format TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    storage_key TEXT NOT NULL UNIQUE,
    custom_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL,
    error_message TEXT,
    provider TEXT NOT NULL DEFAULT 'elevenlabs',
    provider_voice_id TEXT,
    provider_model_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );
`;

const CREATE_GENERATED_AUDIO_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS generated_audio_user_scope_created_at_idx ON generated_audio (user_scope, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS generated_audio_conversation_created_at_idx ON generated_audio (conversation_id, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS generated_audio_status_created_at_idx ON generated_audio (status, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS generated_audio_custom_tags_gin_idx ON generated_audio USING GIN (custom_tags);",
];

const ALTER_GENERATED_AUDIO_TABLE_SQL = [
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS audio_id UUID;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS user_scope TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS source_surface TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS display_name TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS conversation_id TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS channel_id TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS discord_message_id TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS source_message_id TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS prompt TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS spoken_text TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS caption TEXT NOT NULL DEFAULT '';",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS voice_id TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS model TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS output_format TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS mime_type TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER NOT NULL DEFAULT 0;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS storage_key TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS custom_tags JSONB NOT NULL DEFAULT '[]'::jsonb;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS status TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS error_message TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'elevenlabs';",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS provider_voice_id TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS provider_model_id TEXT;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;",
  "ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;",
];

const BACKFILL_GENERATED_AUDIO_TABLE_SQL = [
  "UPDATE generated_audio SET audio_id = COALESCE(audio_id, md5(random()::text || clock_timestamp()::text)::uuid);",
  "UPDATE generated_audio SET user_scope = COALESCE(NULLIF(user_scope, ''), 'user');",
  "UPDATE generated_audio SET source_surface = COALESCE(NULLIF(source_surface, ''), 'chat');",
  "UPDATE generated_audio SET display_name = COALESCE(NULLIF(display_name, ''), 'Generated audio');",
  "UPDATE generated_audio SET prompt = COALESCE(prompt, '');",
  "UPDATE generated_audio SET spoken_text = COALESCE(spoken_text, '');",
  "UPDATE generated_audio SET voice_id = COALESCE(voice_id, '');",
  "UPDATE generated_audio SET model = COALESCE(model, '');",
  "UPDATE generated_audio SET output_format = COALESCE(output_format, '');",
  "UPDATE generated_audio SET mime_type = COALESCE(mime_type, 'audio/mpeg');",
  "UPDATE generated_audio SET storage_key = COALESCE(NULLIF(storage_key, ''), audio_id::text);",
  "UPDATE generated_audio SET status = COALESCE(NULLIF(status, ''), 'completed');",
  "UPDATE generated_audio SET provider = COALESCE(NULLIF(provider, ''), 'elevenlabs');",
  "UPDATE generated_audio SET provider_voice_id = COALESCE(provider_voice_id, voice_id);",
  "UPDATE generated_audio SET provider_model_id = COALESCE(provider_model_id, model);",
  "UPDATE generated_audio SET created_at = COALESCE(created_at, NOW());",
  "ALTER TABLE generated_audio ALTER COLUMN audio_id SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN user_scope SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN source_surface SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN display_name SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN prompt SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN spoken_text SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN voice_id SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN model SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN output_format SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN mime_type SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN storage_key SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN status SET NOT NULL;",
  "ALTER TABLE generated_audio ALTER COLUMN created_at SET NOT NULL;",
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

function normalizeTagList(value) {
  const items = Array.isArray(value) ? value : [];

  return Array.from(new Set(items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20)));
}

function normalizeAudioSearchTerms(value) {
  return Array.from(new Set(String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12)));
}

function normalizeStatus(value) {
  const normalized = String(value || "pending").trim().toLowerCase();

  if (!SUPPORTED_GENERATED_AUDIO_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported generated audio status "${value}".`);
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

function normalizeGeneratedAudioRecord(record = {}, defaults = {}) {
  return {
    audioId: normalizeText(record.audioId || record.audio_id || defaults.audioId, "Audio ID", { allowEmpty: true }) || crypto.randomUUID(),
    userScope: normalizeText(record.userScope || record.user_scope || defaults.userScope, "User scope"),
    sourceSurface: normalizeText(record.sourceSurface || record.source_surface || defaults.sourceSurface || "chat", "Source surface"),
    displayName: normalizeText(record.displayName || record.display_name || defaults.displayName, "Display name"),
    conversationId: normalizeText(record.conversationId || record.conversation_id || defaults.conversationId, "Conversation ID", { allowEmpty: true }) || null,
    channelId: normalizeText(record.channelId || record.channel_id || defaults.channelId, "Channel ID", { allowEmpty: true }) || null,
    discordMessageId: normalizeText(record.discordMessageId || record.discord_message_id || defaults.discordMessageId, "Discord message ID", { allowEmpty: true }) || null,
    sourceMessageId: normalizeText(record.sourceMessageId || record.source_message_id || defaults.sourceMessageId, "Source message ID", { allowEmpty: true }) || null,
    prompt: normalizeText(record.prompt || defaults.prompt, "Prompt", { allowEmpty: true }),
    spokenText: normalizeText(record.spokenText || record.spoken_text || defaults.spokenText, "Spoken text"),
    caption: normalizeText(record.caption || defaults.caption, "Caption", { allowEmpty: true }),
    voiceId: normalizeText(record.voiceId || record.voice_id || defaults.voiceId, "Voice ID"),
    model: normalizeText(record.model || defaults.model, "Model"),
    outputFormat: normalizeText(record.outputFormat || record.output_format || defaults.outputFormat, "Output format"),
    mimeType: normalizeText(record.mimeType || record.mime_type || defaults.mimeType, "MIME type"),
    fileSizeBytes: Math.max(0, Number.parseInt(String(record.fileSizeBytes || record.file_size_bytes || defaults.fileSizeBytes || 0), 10) || 0),
    storageKey: normalizeText(record.storageKey || record.storage_key || defaults.storageKey, "Storage key"),
    customTags: normalizeTagList(coalesceDefined(record.custom_tags, record.customTags, defaults.customTags)),
    isFavorite: Boolean(coalesceDefined(record.is_favorite, record.isFavorite, defaults.isFavorite)),
    status: normalizeStatus(record.status || defaults.status || "pending"),
    errorMessage: normalizeText(record.errorMessage || record.error_message || defaults.errorMessage, "Error message", { allowEmpty: true }) || null,
    provider: normalizeText(record.provider || defaults.provider || "elevenlabs", "Provider"),
    providerVoiceId: normalizeText(record.providerVoiceId || record.provider_voice_id || defaults.providerVoiceId || record.voiceId || record.voice_id || defaults.voiceId, "Provider voice ID", { allowEmpty: true }) || null,
    providerModelId: normalizeText(record.providerModelId || record.provider_model_id || defaults.providerModelId || record.model || defaults.model, "Provider model ID", { allowEmpty: true }) || null,
    createdAt: normalizeTimestamp(record.createdAt || record.created_at || defaults.createdAt, "created_at"),
    deletedAt: normalizeTimestamp(record.deletedAt || record.deleted_at || defaults.deletedAt, "deleted_at", { allowEmpty: true }),
  };
}

function mapGeneratedAudioRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    audioId: row.audio_id,
    userScope: row.user_scope,
    sourceSurface: row.source_surface,
    displayName: row.display_name,
    conversationId: row.conversation_id,
    channelId: row.channel_id,
    discordMessageId: row.discord_message_id,
    sourceMessageId: row.source_message_id,
    prompt: row.prompt || "",
    spokenText: row.spoken_text,
    caption: row.caption || "",
    voiceId: row.voice_id,
    model: row.model,
    outputFormat: row.output_format,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes || 0),
    storageKey: row.storage_key,
    customTags: Array.isArray(row.custom_tags) ? row.custom_tags : [],
    isFavorite: Boolean(row.is_favorite),
    status: row.status,
    errorMessage: row.error_message,
    provider: row.provider || "elevenlabs",
    providerVoiceId: row.provider_voice_id || row.voice_id,
    providerModelId: row.provider_model_id || row.model,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function createNoopGeneratedAudioStore({ logger }) {
  return {
    persistenceEnabled: false,
    async init() {
      logger.warn("[generated-audio] DATABASE_URL is not set; generated audio persistence is disabled.");
    },
    async recordAudio() {
      throw new Error("Generated audio store is disabled because DATABASE_URL is not set.");
    },
    async updateAudioRecord() {
      throw new Error("Generated audio store is disabled because DATABASE_URL is not set.");
    },
    async getAudioById() {
      return null;
    },
    async listAudio() {
      return [];
    },
    async countAudio() {
      return 0;
    },
    async listDistinctCustomTags() {
      return [];
    },
    async close() {},
  };
}

function createGeneratedAudioStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopGeneratedAudioStore({ logger });
  }

  return {
    persistenceEnabled: true,
    async init() {
      await pool.query(CREATE_GENERATED_AUDIO_TABLE_SQL);

      for (const statement of ALTER_GENERATED_AUDIO_TABLE_SQL) {
        await pool.query(statement);
      }

      for (const statement of BACKFILL_GENERATED_AUDIO_TABLE_SQL) {
        await pool.query(statement);
      }

      for (const statement of CREATE_GENERATED_AUDIO_INDEXES_SQL) {
        await pool.query(statement);
      }

      logger.info?.("[db:migration] generated audio schema ensured", {
        tables: ["generated_audio"],
      });

      logger.debug?.("[generated-audio] Generated audio store ready", {
        provider: "postgres",
      });
    },

    async recordAudio(record, defaults = {}) {
      const normalized = normalizeGeneratedAudioRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO generated_audio (
            audio_id,
            user_scope,
            source_surface,
            display_name,
            conversation_id,
            channel_id,
            discord_message_id,
            source_message_id,
            prompt,
            spoken_text,
            caption,
            voice_id,
            model,
            output_format,
            mime_type,
            file_size_bytes,
            storage_key,
            custom_tags,
            is_favorite,
            status,
            error_message,
            provider,
            provider_voice_id,
            provider_model_id,
            created_at,
            deleted_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21, $22, $23, $24, $25, $26)
          RETURNING *
        `,
        [
          normalized.audioId,
          normalized.userScope,
          normalized.sourceSurface,
          normalized.displayName,
          normalized.conversationId,
          normalized.channelId,
          normalized.discordMessageId,
          normalized.sourceMessageId,
          normalized.prompt,
          normalized.spokenText,
          normalized.caption,
          normalized.voiceId,
          normalized.model,
          normalized.outputFormat,
          normalized.mimeType,
          normalized.fileSizeBytes,
          normalized.storageKey,
          JSON.stringify(normalized.customTags),
          normalized.isFavorite,
          normalized.status,
          normalized.errorMessage,
          normalized.provider,
          normalized.providerVoiceId,
          normalized.providerModelId,
          normalized.createdAt,
          normalized.deletedAt,
        ],
      );

      return mapGeneratedAudioRow(rows[0] || null);
    },

    async updateAudioRecord(audioId, updates = {}, defaults = {}) {
      const existing = await this.getAudioById(audioId, {
        userScope: defaults.userScope,
      });

      if (!existing) {
        return null;
      }

      const normalized = normalizeGeneratedAudioRecord({
        ...existing,
        ...updates,
        audioId: existing.audioId,
      }, defaults);

      const { rows } = await pool.query(
        `
          UPDATE generated_audio
          SET
            display_name = $3,
            discord_message_id = $4,
            caption = $5,
            custom_tags = $6::jsonb,
            is_favorite = $7,
            status = $8,
            error_message = $9,
            deleted_at = $10
          WHERE audio_id = $1
            AND user_scope = $2
          RETURNING *
        `,
        [
          existing.audioId,
          normalized.userScope,
          normalized.displayName,
          normalized.discordMessageId,
          normalized.caption,
          JSON.stringify(normalized.customTags),
          normalized.isFavorite,
          normalized.status,
          normalized.errorMessage,
          normalized.deletedAt,
        ],
      );

      return mapGeneratedAudioRow(rows[0] || null);
    },

    async getAudioById(audioId, { userScope } = {}) {
      const normalizedAudioId = normalizeText(audioId, "Audio ID");
      const normalizedScope = normalizeText(userScope, "User scope");
      const { rows } = await pool.query(
        `
          SELECT *
          FROM generated_audio
          WHERE audio_id = $1
            AND user_scope = $2
          LIMIT 1
        `,
        [normalizedAudioId, normalizedScope],
      );

      return mapGeneratedAudioRow(rows[0] || null);
    },

    async listAudio({
      userScope,
      limit = 24,
      offset = 0,
      includeDeleted = false,
      favoritesOnly = false,
      status = "",
      sourceSurface = "",
      q = "",
      tags = [],
    } = {}) {
      const normalizedScope = normalizeText(userScope, "User scope");
      const parsedLimit = Math.max(1, Math.min(Number(limit) || 24, 100));
      const parsedOffset = Math.max(0, Number(offset) || 0);
      const normalizedStatus = String(status || "").trim().toLowerCase();
      const normalizedSourceSurface = String(sourceSurface || "").trim().toLowerCase();
      const normalizedQueryTerms = normalizeAudioSearchTerms(q);
      const normalizedTags = normalizeTagList(tags).map((tag) => tag.toLowerCase());
      const { rows } = await pool.query(
        `
          SELECT *
          FROM generated_audio
          WHERE user_scope = $1
            AND ($2::boolean OR deleted_at IS NULL)
            AND ($3::boolean = FALSE OR is_favorite = TRUE)
            AND ($4::text = '' OR status = $4)
            AND (
              $5::jsonb = '[]'::jsonb
              OR NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text($5::jsonb) AS search_term(term)
                WHERE display_name NOT ILIKE '%' || search_term.term || '%'
                  AND prompt NOT ILIKE '%' || search_term.term || '%'
                  AND spoken_text NOT ILIKE '%' || search_term.term || '%'
                  AND caption NOT ILIKE '%' || search_term.term || '%'
              )
            )
            AND ($6::text = '' OR lower(source_surface) = $6)
            AND ($7::jsonb = '[]'::jsonb OR custom_tags @> $7::jsonb)
          ORDER BY created_at DESC, id DESC
          LIMIT $8
          OFFSET $9
        `,
        [
          normalizedScope,
          includeDeleted,
          Boolean(favoritesOnly),
          normalizedStatus,
          JSON.stringify(normalizedQueryTerms),
          normalizedSourceSurface,
          JSON.stringify(normalizedTags),
          parsedLimit,
          parsedOffset,
        ],
      );

      return rows.map(mapGeneratedAudioRow);
    },

    async countAudio({ userScope, includeDeleted = false, favoritesOnly = false, status = "", sourceSurface = "", q = "", tags = [] } = {}) {
      const normalizedScope = normalizeText(userScope, "User scope");
      const normalizedStatus = String(status || "").trim().toLowerCase();
      const normalizedSourceSurface = String(sourceSurface || "").trim().toLowerCase();
      const normalizedQueryTerms = normalizeAudioSearchTerms(q);
      const normalizedTags = normalizeTagList(tags).map((tag) => tag.toLowerCase());
      const { rows } = await pool.query(
        `
          SELECT COUNT(*)::integer AS total
          FROM generated_audio
          WHERE user_scope = $1
            AND ($2::boolean OR deleted_at IS NULL)
            AND ($3::boolean = FALSE OR is_favorite = TRUE)
            AND ($4::text = '' OR status = $4)
            AND (
              $5::jsonb = '[]'::jsonb
              OR NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text($5::jsonb) AS search_term(term)
                WHERE display_name NOT ILIKE '%' || search_term.term || '%'
                  AND prompt NOT ILIKE '%' || search_term.term || '%'
                  AND spoken_text NOT ILIKE '%' || search_term.term || '%'
                  AND caption NOT ILIKE '%' || search_term.term || '%'
              )
            )
            AND ($6::text = '' OR lower(source_surface) = $6)
            AND ($7::jsonb = '[]'::jsonb OR custom_tags @> $7::jsonb)
        `,
        [
          normalizedScope,
          includeDeleted,
          Boolean(favoritesOnly),
          normalizedStatus,
          JSON.stringify(normalizedQueryTerms),
          normalizedSourceSurface,
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
          FROM generated_audio
          CROSS JOIN LATERAL jsonb_array_elements_text(custom_tags) AS tag_value
          WHERE user_scope = $1
            AND ($2::boolean OR deleted_at IS NULL)
            AND trim(tag_value) <> ''
          ORDER BY lower(tag_value) ASC
          LIMIT $3
        `,
        [normalizedScope, includeDeleted, parsedLimit],
      );

      return rows.map((row) => String(row.tag || "").trim()).filter(Boolean);
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  createGeneratedAudioStore,
  normalizeGeneratedAudioRecord,
  normalizeAudioSearchTerms,
  SUPPORTED_GENERATED_AUDIO_STATUSES,
};
