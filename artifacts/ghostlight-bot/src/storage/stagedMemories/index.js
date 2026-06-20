const crypto = require("node:crypto");
const { createPostgresPool } = require("../postgres/createPostgresPool");
const {
  SUPPORTED_MEMORY_TYPES,
  SUPPORTED_SENSITIVITY_LEVELS,
  normalizeDomain,
} = require("../memories");

const SUPPORTED_GENERATED_SOURCE_KINDS = Object.freeze([
  "ghostlight_conversation",
  "ghostlight_summary_queue",
  "manual_import",
  "closed_thread",
  "memory_curator",
  "memory_save_request",
  "emotional_arc",
]);

const SUPPORTED_GENERATED_STATUSES = Object.freeze([
  "proposed",
  "approved",
  "rejected",
  "archived",
]);

const CREATE_STAGED_MEMORIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS staged_memories (
    id BIGSERIAL PRIMARY KEY,
    staged_memory_id UUID NOT NULL UNIQUE,
    source_kind TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    grouping_key TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    domain TEXT NOT NULL,
    sensitivity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    review_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    promoted_memory_id UUID,
    user_scope TEXT NOT NULL,
    reference_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
  );
`;

const CREATE_STAGED_MEMORIES_INDEXES_SQL = [
  "CREATE UNIQUE INDEX IF NOT EXISTS staged_memories_source_dedupe_idx ON staged_memories (source_kind, grouping_key, dedupe_key);",
  "CREATE INDEX IF NOT EXISTS staged_memories_status_idx ON staged_memories (status, updated_at DESC);",
  "CREATE INDEX IF NOT EXISTS staged_memories_user_scope_idx ON staged_memories (user_scope, updated_at DESC);",
  "CREATE INDEX IF NOT EXISTS staged_memories_reference_date_idx ON staged_memories (reference_date DESC);",
];

const ALTER_STAGED_MEMORIES_TABLE_SQL = [
  "ALTER TABLE staged_memories ADD COLUMN IF NOT EXISTS reference_date DATE;",
];

function normalizeTextValue(value) {
  return String(value || "").trim();
}

function normalizeEnumValue(value) {
  return normalizeTextValue(value).toLowerCase();
}

function assertAllowedValue({ label, value, allowedValues }) {
  const normalizedValue = normalizeEnumValue(value);

  if (!allowedValues.includes(normalizedValue)) {
    throw new Error(`Unsupported ${label} "${value}". Expected one of: ${allowedValues.join(", ")}.`);
  }

  return normalizedValue;
}

function normalizeTimestamp(value, fallbackValue = null) {
  if (!value) {
    return fallbackValue;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp value "${value}".`);
  }

  return date.toISOString();
}

function normalizeDateValue(value, fallbackValue = null) {
  if (!value) {
    return fallbackValue;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value "${value}".`);
  }

  return date.toISOString().slice(0, 10);
}

function stableUuid(seed) {
  const hex = crypto.createHash("sha1").update(String(seed)).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function normalizeJsonValue(value, fallbackValue) {
  if (value === undefined) {
    return fallbackValue;
  }

  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

function buildDedupeKey(record) {
  if (record.dedupeKey) {
    return normalizeTextValue(record.dedupeKey);
  }

  const memoryType = normalizeEnumValue(record.memory_type || record.memoryType);
  const title = normalizeTextValue(record.title).toLowerCase();
  return `${memoryType}:${title}`;
}

function normalizeGeneratedMemoryRecord(record, defaults = {}) {
  const sourceKind = assertAllowedValue({
    label: "source_kind",
    value: record.source_kind || record.sourceKind || defaults.sourceKind,
    allowedValues: SUPPORTED_GENERATED_SOURCE_KINDS,
  });

  const memoryType = assertAllowedValue({
    label: "memory_type",
    value: record.memory_type || record.memoryType,
    allowedValues: SUPPORTED_MEMORY_TYPES,
  });

  const sensitivity = assertAllowedValue({
    label: "sensitivity",
    value: record.sensitivity || defaults.sensitivity || "low",
    allowedValues: SUPPORTED_SENSITIVITY_LEVELS,
  });

  const status = assertAllowedValue({
    label: "status",
    value: record.status || defaults.status || "proposed",
    allowedValues: SUPPORTED_GENERATED_STATUSES,
  });

  const domain = normalizeDomain(record.domain || defaults.domain || "general");
  const groupingKey = normalizeTextValue(record.grouping_key || record.groupingKey || defaults.groupingKey);
  const sourceRef = normalizeTextValue(record.source_ref || record.sourceRef || defaults.sourceRef);
  const title = normalizeTextValue(record.title);
  const content = normalizeTextValue(record.content || record.text);
  const userScope = normalizeTextValue(record.user_scope || record.userScope || defaults.userScope || "default");

  if (!groupingKey) {
    throw new Error("Staged memory grouping_key is required.");
  }

  if (!sourceRef) {
    throw new Error("Staged memory source_ref is required.");
  }

  if (!title) {
    throw new Error("Staged memory title is required.");
  }

  if (!content) {
    throw new Error("Staged memory content is required.");
  }

  const dedupeKey = buildDedupeKey(record);
  const generatedMemoryId = normalizeTextValue(
    record.generated_memory_id || record.generatedMemoryId || record.staged_memory_id || record.stagedMemoryId,
  )
    || stableUuid(`${sourceKind}:${groupingKey}:${dedupeKey}`);
  const now = new Date().toISOString();

  return {
    generatedMemoryId,
    stagedMemoryId: generatedMemoryId,
    sourceKind,
    sourceRef,
    groupingKey,
    dedupeKey,
    title,
    content,
    memoryType,
    domain,
    sensitivity,
    status,
    reviewFlags: normalizeJsonValue(record.review_flags || record.reviewFlags, []),
    sourcePayload: normalizeJsonValue(record.source_payload || record.sourcePayload, {}),
    promotedMemoryId: normalizeTextValue(record.promoted_memory_id || record.promotedMemoryId) || null,
    userScope,
    referenceDate: normalizeDateValue(record.reference_date || record.referenceDate || defaults.referenceDate, null),
    createdAt: normalizeTimestamp(record.created_at || record.createdAt, now),
    updatedAt: normalizeTimestamp(record.updated_at || record.updatedAt, now),
    reviewedAt: normalizeTimestamp(record.reviewed_at || record.reviewedAt, null),
  };
}

function mapGeneratedMemoryRow(row) {
  return {
    id: Number(row.id),
    generatedMemoryId: row.staged_memory_id,
    stagedMemoryId: row.staged_memory_id,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    groupingKey: row.grouping_key,
    dedupeKey: row.dedupe_key,
    title: row.title,
    content: row.content,
    memoryType: row.memory_type,
    domain: row.domain,
    sensitivity: row.sensitivity,
    status: row.status,
    reviewFlags: row.review_flags || [],
    sourcePayload: row.source_payload || {},
    promotedMemoryId: row.promoted_memory_id,
    userScope: row.user_scope,
    referenceDate: row.reference_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}

function createNoopGeneratedMemoryStore({ logger }) {
  return {
    async init() {
      logger.warn("[memory] DATABASE_URL is not set; generated memory persistence is disabled.");
    },
    async upsertGeneratedMemory() {
      throw new Error("Generated memory store is disabled because DATABASE_URL is not set.");
    },
    async listGeneratedMemories() {
      return [];
    },
    async getGeneratedMemoryById() {
      return null;
    },
    async updateGeneratedMemory() {
      throw new Error("Generated memory store is disabled because DATABASE_URL is not set.");
    },
    async archivePromotedMemoryId() {
      return 0;
    },
    async deleteRejectedGeneratedMemoriesOlderThan() {
      return 0;
    },
    async close() {},
    async upsertStagedMemory(...args) {
      return this.upsertGeneratedMemory(...args);
    },
    async listStagedMemories(...args) {
      return this.listGeneratedMemories(...args);
    },
    async getStagedMemoryById(...args) {
      return this.getGeneratedMemoryById(...args);
    },
    async updateStagedMemory(...args) {
      return this.updateGeneratedMemory(...args);
    },
    async deleteRejectedStagedMemoriesOlderThan(...args) {
      return this.deleteRejectedGeneratedMemoriesOlderThan(...args);
    },
  };
}

function createGeneratedMemoryStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopGeneratedMemoryStore({ logger });
  }

  return {
    async init() {
      await pool.query(CREATE_STAGED_MEMORIES_TABLE_SQL);
      for (const statement of ALTER_STAGED_MEMORIES_TABLE_SQL) {
        await pool.query(statement);
      }

      for (const statement of CREATE_STAGED_MEMORIES_INDEXES_SQL) {
        await pool.query(statement);
      }

      logger.debug?.("[memory] Generated memory store ready", {
        provider: "postgres",
      });
    },

    async upsertGeneratedMemory(record, defaults = {}) {
      const normalized = normalizeGeneratedMemoryRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO staged_memories (
            staged_memory_id,
            source_kind,
            source_ref,
            grouping_key,
            dedupe_key,
            title,
            content,
            memory_type,
            domain,
            sensitivity,
            status,
            review_flags,
            source_payload,
            promoted_memory_id,
            user_scope,
            reference_date,
            created_at,
            updated_at,
            reviewed_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18, $19
          )
          ON CONFLICT (source_kind, grouping_key, dedupe_key)
          DO UPDATE SET
            staged_memory_id = EXCLUDED.staged_memory_id,
            source_ref = EXCLUDED.source_ref,
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            memory_type = EXCLUDED.memory_type,
            domain = EXCLUDED.domain,
            sensitivity = EXCLUDED.sensitivity,
            status = CASE
              WHEN staged_memories.promoted_memory_id IS NOT NULL AND EXCLUDED.status = 'proposed' THEN staged_memories.status
              ELSE EXCLUDED.status
            END,
            review_flags = EXCLUDED.review_flags,
            source_payload = EXCLUDED.source_payload,
            promoted_memory_id = COALESCE(EXCLUDED.promoted_memory_id, staged_memories.promoted_memory_id),
            user_scope = EXCLUDED.user_scope,
            reference_date = EXCLUDED.reference_date,
            reviewed_at = COALESCE(EXCLUDED.reviewed_at, staged_memories.reviewed_at),
            updated_at = EXCLUDED.updated_at
          RETURNING
            id,
            staged_memory_id,
            source_kind,
            source_ref,
            grouping_key,
            dedupe_key,
            title,
            content,
            memory_type,
            domain,
            sensitivity,
            status,
            review_flags,
            source_payload,
            promoted_memory_id,
            user_scope,
            reference_date,
            created_at,
            updated_at,
            reviewed_at
        `,
        [
          normalized.generatedMemoryId,
          normalized.sourceKind,
          normalized.sourceRef,
          normalized.groupingKey,
          normalized.dedupeKey,
          normalized.title,
          normalized.content,
          normalized.memoryType,
          normalized.domain,
          normalized.sensitivity,
          normalized.status,
          JSON.stringify(normalized.reviewFlags),
          JSON.stringify(normalized.sourcePayload),
          normalized.promotedMemoryId,
          normalized.userScope,
          normalized.referenceDate,
          normalized.createdAt,
          normalized.updatedAt,
          normalized.reviewedAt,
        ],
      );

      return mapGeneratedMemoryRow(rows[0]);
    },

    async listGeneratedMemories({ status, userScope, groupingKey, limit = 100 } = {}) {
      const clauses = [];
      const values = [];

      if (status) {
        values.push(normalizeEnumValue(status));
        clauses.push(`status = $${values.length}`);
      }

      if (userScope) {
        values.push(normalizeTextValue(userScope));
        clauses.push(`user_scope = $${values.length}`);
      }

      if (groupingKey) {
        values.push(normalizeTextValue(groupingKey));
        clauses.push(`grouping_key = $${values.length}`);
      }

      values.push(limit);
      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const { rows } = await pool.query(
        `
          SELECT
            id,
            staged_memory_id,
            source_kind,
            source_ref,
            grouping_key,
            dedupe_key,
            title,
            content,
            memory_type,
            domain,
            sensitivity,
            status,
            review_flags,
            source_payload,
            promoted_memory_id,
            user_scope,
            reference_date,
            created_at,
            updated_at,
            reviewed_at
          FROM staged_memories
          ${whereClause}
          ORDER BY updated_at DESC
          LIMIT $${values.length}
        `,
        values,
      );

      return rows.map(mapGeneratedMemoryRow);
    },

    async getGeneratedMemoryById(generatedMemoryId) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            staged_memory_id,
            source_kind,
            source_ref,
            grouping_key,
            dedupe_key,
            title,
            content,
            memory_type,
            domain,
            sensitivity,
            status,
            review_flags,
            source_payload,
            promoted_memory_id,
            user_scope,
            reference_date,
            created_at,
            updated_at,
            reviewed_at
          FROM staged_memories
          WHERE staged_memory_id = $1
          LIMIT 1
        `,
        [generatedMemoryId],
      );

      return rows[0] ? mapGeneratedMemoryRow(rows[0]) : null;
    },

    async updateGeneratedMemory(generatedMemoryId, updates = {}) {
      const existing = await this.getGeneratedMemoryById(generatedMemoryId);

      if (!existing) {
        throw new Error(`No generated memory found for ID ${generatedMemoryId}.`);
      }

      return this.upsertGeneratedMemory(
        {
          ...existing,
          ...updates,
          staged_memory_id: existing.stagedMemoryId,
          source_kind: existing.sourceKind,
          source_ref: existing.sourceRef,
          grouping_key: existing.groupingKey,
          dedupeKey: existing.dedupeKey,
          review_flags: updates.reviewFlags ?? existing.reviewFlags,
          source_payload: updates.sourcePayload ?? existing.sourcePayload,
          promoted_memory_id: updates.promotedMemoryId ?? existing.promotedMemoryId,
          updated_at: new Date().toISOString(),
          reviewed_at: updates.status ? new Date().toISOString() : existing.reviewedAt,
        },
        {
          userScope: existing.userScope,
        },
      );
    },

    async archivePromotedMemoryId(promotedMemoryId, { userScope } = {}) {
      const normalizedMemoryId = normalizeTextValue(promotedMemoryId);

      if (!normalizedMemoryId) {
        throw new Error("Promoted memory ID is required.");
      }

      const values = [normalizedMemoryId];
      const clauses = ["promoted_memory_id = $1"];

      if (userScope) {
        values.push(normalizeTextValue(userScope));
        clauses.push(`user_scope = $${values.length}`);
      }

      values.push(new Date().toISOString());

      const { rowCount } = await pool.query(
        `
          UPDATE staged_memories
          SET
            status = 'archived',
            promoted_memory_id = NULL,
            updated_at = $${values.length},
            reviewed_at = $${values.length}
          WHERE ${clauses.join(" AND ")}
        `,
        values,
      );

      return rowCount;
    },

    async deleteRejectedGeneratedMemoriesOlderThan({ userScope, retentionDays = 30, now = new Date() } = {}) {
      const days = Number.parseInt(String(retentionDays || "").trim(), 10);

      if (!Number.isFinite(days) || days < 1) {
        return 0;
      }

      const referenceDate = now instanceof Date ? now : new Date(now);

      if (Number.isNaN(referenceDate.getTime())) {
        throw new Error(`Invalid retention reference date "${now}".`);
      }

      const cutoff = new Date(referenceDate.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
      const values = [cutoff];
      const clauses = [
        "status = 'rejected'",
        "COALESCE(reviewed_at, updated_at, created_at) < $1",
      ];

      if (userScope) {
        values.push(normalizeTextValue(userScope));
        clauses.push(`user_scope = $${values.length}`);
      }

      const { rowCount } = await pool.query(
        `
          DELETE FROM staged_memories
          WHERE ${clauses.join(" AND ")}
        `,
        values,
      );

      return rowCount;
    },

    async close() {
      await pool.end();
    },
    async upsertStagedMemory(...args) {
      return this.upsertGeneratedMemory(...args);
    },
    async listStagedMemories(...args) {
      return this.listGeneratedMemories(...args);
    },
    async getStagedMemoryById(...args) {
      return this.getGeneratedMemoryById(...args);
    },
    async updateStagedMemory(...args) {
      return this.updateGeneratedMemory(...args);
    },
    async deleteRejectedStagedMemoriesOlderThan(...args) {
      return this.deleteRejectedGeneratedMemoriesOlderThan(...args);
    },
  };
}

module.exports = {
  SUPPORTED_GENERATED_SOURCE_KINDS,
  SUPPORTED_GENERATED_STATUSES,
  stableUuid,
  normalizeGeneratedMemoryRecord,
  createGeneratedMemoryStore,
  SUPPORTED_STAGED_SOURCE_KINDS: SUPPORTED_GENERATED_SOURCE_KINDS,
  SUPPORTED_STAGED_STATUSES: SUPPORTED_GENERATED_STATUSES,
  normalizeStagedMemoryRecord: normalizeGeneratedMemoryRecord,
  createStagedMemoryStore: createGeneratedMemoryStore,
};
