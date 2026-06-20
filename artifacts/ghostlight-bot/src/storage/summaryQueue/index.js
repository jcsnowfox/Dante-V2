const crypto = require("node:crypto");
const { createPostgresPool } = require("../postgres/createPostgresPool");

const SUPPORTED_SUMMARY_QUEUE_TYPES = Object.freeze([
  "weekly_continuity_daily",
]);

const SUPPORTED_SUMMARY_QUEUE_STATUSES = Object.freeze([
  "pending",
  "consumed",
]);

const CREATE_SUMMARY_QUEUE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS summary_queue (
    id BIGSERIAL PRIMARY KEY,
    queue_id UUID NOT NULL UNIQUE,
    user_scope TEXT NOT NULL,
    queue_type TEXT NOT NULL,
    summary_date DATE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    weekly_memory_id TEXT,
    consumed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_scope, queue_type, summary_date)
  );
`;

const CREATE_SUMMARY_QUEUE_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS summary_queue_lookup_idx ON summary_queue (user_scope, queue_type, summary_date DESC);",
  "CREATE INDEX IF NOT EXISTS summary_queue_status_idx ON summary_queue (status, summary_date ASC);",
  "CREATE INDEX IF NOT EXISTS summary_queue_expires_at_idx ON summary_queue (expires_at);",
];

function normalizeText(value, label, { allowEmpty = false } = {}) {
  const normalized = String(value || "").trim();

  if (!allowEmpty && !normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeEnum(value, label, allowedValues, defaultValue = "") {
  const normalized = String(value || defaultValue || "").trim().toLowerCase();

  if (!allowedValues.includes(normalized)) {
    throw new Error(`Unsupported ${label} "${value}". Expected one of: ${allowedValues.join(", ")}.`);
  }

  return normalized;
}

function normalizeDate(value, label) {
  const normalized = normalizeText(value, label);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`Invalid ${label} "${value}". Expected YYYY-MM-DD.`);
  }

  return normalized;
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

function normalizeSummaryQueueRecord(record = {}, defaults = {}) {
  return {
    queueId: normalizeText(record.queueId || record.queue_id || record.id, "Queue ID", { allowEmpty: true }) || crypto.randomUUID(),
    userScope: normalizeText(record.userScope || record.user_scope || defaults.userScope, "User scope"),
    queueType: normalizeEnum(record.queueType || record.queue_type, "queue type", SUPPORTED_SUMMARY_QUEUE_TYPES),
    summaryDate: normalizeDate(record.summaryDate || record.summary_date, "summary date"),
    title: normalizeText(record.title, "Queue title"),
    content: normalizeText(record.content, "Queue content"),
    status: normalizeEnum(record.status, "queue status", SUPPORTED_SUMMARY_QUEUE_STATUSES, defaults.status || "pending"),
    sourcePayload: record.sourcePayload ?? record.source_payload ?? {},
    weeklyMemoryId: normalizeText(record.weeklyMemoryId || record.weekly_memory_id, "Weekly memory ID", { allowEmpty: true }) || null,
    consumedAt: normalizeTimestamp(record.consumedAt || record.consumed_at, "consumed_at"),
    expiresAt: normalizeTimestamp(record.expiresAt || record.expires_at, "expires_at"),
  };
}

function mapSummaryQueueRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    queueId: row.queue_id,
    userScope: row.user_scope,
    queueType: row.queue_type,
    summaryDate: row.summary_date,
    title: row.title,
    content: row.content,
    status: row.status,
    sourcePayload: row.source_payload || {},
    weeklyMemoryId: row.weekly_memory_id,
    consumedAt: row.consumed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createNoopSummaryQueueStore({ logger }) {
  return {
    persistenceEnabled: false,
    async init() {
      logger.warn("[summary-queue] DATABASE_URL is not set; summary queue persistence is disabled.");
    },
    async listQueueItems() {
      return [];
    },
    async upsertQueueItem() {
      throw new Error("Summary queue store is disabled because DATABASE_URL is not set.");
    },
    async markQueueItemsConsumed() {
      return [];
    },
    async deleteExpired() {
      return 0;
    },
    async close() {},
  };
}

function createSummaryQueueStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopSummaryQueueStore({ logger });
  }

  return {
    persistenceEnabled: true,
    async init() {
      await pool.query(CREATE_SUMMARY_QUEUE_TABLE_SQL);

      for (const statement of CREATE_SUMMARY_QUEUE_INDEXES_SQL) {
        await pool.query(statement);
      }

      logger.debug?.("[summary-queue] Summary queue store ready", {
        provider: "postgres",
      });
    },

    async listQueueItems({
      userScope,
      queueType = "",
      status = "",
      startDate = "",
      endDate = "",
      limit = 1000,
      offset = 0,
    } = {}) {
      const values = [];
      const clauses = [];

      if (userScope) {
        values.push(normalizeText(userScope, "User scope"));
        clauses.push(`user_scope = $${values.length}`);
      }

      if (queueType) {
        values.push(normalizeEnum(queueType, "queue type", SUPPORTED_SUMMARY_QUEUE_TYPES));
        clauses.push(`queue_type = $${values.length}`);
      }

      if (status) {
        values.push(normalizeEnum(status, "queue status", SUPPORTED_SUMMARY_QUEUE_STATUSES));
        clauses.push(`status = $${values.length}`);
      }

      if (startDate) {
        values.push(normalizeDate(startDate, "start date"));
        clauses.push(`summary_date >= $${values.length}`);
      }

      if (endDate) {
        values.push(normalizeDate(endDate, "end date"));
        clauses.push(`summary_date <= $${values.length}`);
      }

      values.push(Math.max(1, Math.min(Number(limit) || 1000, 5000)));
      values.push(Math.max(0, Number(offset) || 0));
      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const { rows } = await pool.query(
        `
          SELECT
            id,
            queue_id,
            user_scope,
            queue_type,
            summary_date,
            title,
            content,
            status,
            source_payload,
            weekly_memory_id,
            consumed_at,
            expires_at,
            created_at,
            updated_at
          FROM summary_queue
          ${whereClause}
          ORDER BY summary_date ASC, created_at ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values,
      );

      return rows.map(mapSummaryQueueRow);
    },

    async upsertQueueItem(record, defaults = {}) {
      const normalized = normalizeSummaryQueueRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO summary_queue (
            queue_id,
            user_scope,
            queue_type,
            summary_date,
            title,
            content,
            status,
            source_payload,
            weekly_memory_id,
            consumed_at,
            expires_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, NOW(), NOW())
          ON CONFLICT (user_scope, queue_type, summary_date)
          DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            status = EXCLUDED.status,
            source_payload = EXCLUDED.source_payload,
            weekly_memory_id = EXCLUDED.weekly_memory_id,
            consumed_at = EXCLUDED.consumed_at,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
          RETURNING
            id,
            queue_id,
            user_scope,
            queue_type,
            summary_date,
            title,
            content,
            status,
            source_payload,
            weekly_memory_id,
            consumed_at,
            expires_at,
            created_at,
            updated_at
        `,
        [
          normalized.queueId,
          normalized.userScope,
          normalized.queueType,
          normalized.summaryDate,
          normalized.title,
          normalized.content,
          normalized.status,
          JSON.stringify(normalized.sourcePayload),
          normalized.weeklyMemoryId,
          normalized.consumedAt,
          normalized.expiresAt,
        ],
      );

      return mapSummaryQueueRow(rows[0]);
    },

    async markQueueItemsConsumed({
      userScope,
      queueType,
      startDate = "",
      endDate = "",
      weeklyMemoryId = "",
      consumedAt = new Date().toISOString(),
    } = {}) {
      const values = [
        normalizeText(userScope, "User scope"),
        normalizeEnum(queueType, "queue type", SUPPORTED_SUMMARY_QUEUE_TYPES),
        normalizeText(weeklyMemoryId, "Weekly memory ID", { allowEmpty: true }) || null,
        normalizeTimestamp(consumedAt, "consumed_at", { allowEmpty: false }),
      ];
      const clauses = [
        "user_scope = $1",
        "queue_type = $2",
        "status = 'pending'",
      ];

      if (startDate) {
        values.push(normalizeDate(startDate, "start date"));
        clauses.push(`summary_date >= $${values.length}`);
      }

      if (endDate) {
        values.push(normalizeDate(endDate, "end date"));
        clauses.push(`summary_date <= $${values.length}`);
      }

      const { rows } = await pool.query(
        `
          UPDATE summary_queue
          SET
            status = 'consumed',
            weekly_memory_id = $3,
            consumed_at = $4,
            updated_at = NOW()
          WHERE ${clauses.join(" AND ")}
          RETURNING
            id,
            queue_id,
            user_scope,
            queue_type,
            summary_date,
            title,
            content,
            status,
            source_payload,
            weekly_memory_id,
            consumed_at,
            expires_at,
            created_at,
            updated_at
        `,
        values,
      );

      return rows.map(mapSummaryQueueRow);
    },

    async deleteExpired({ now = new Date() } = {}) {
      const normalizedNow = normalizeTimestamp(now, "now", { allowEmpty: false });
      const { rowCount } = await pool.query(
        `
          DELETE FROM summary_queue
          WHERE expires_at IS NOT NULL
            AND expires_at <= $1
        `,
        [normalizedNow],
      );

      return rowCount;
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  createSummaryQueueStore,
  normalizeSummaryQueueRecord,
  SUPPORTED_SUMMARY_QUEUE_TYPES,
  SUPPORTED_SUMMARY_QUEUE_STATUSES,
};
