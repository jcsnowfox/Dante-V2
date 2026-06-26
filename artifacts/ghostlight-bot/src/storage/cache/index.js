const { createPostgresPool } = require("../postgres/createPostgresPool");

const CREATE_CACHE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS cache (
    id BIGSERIAL PRIMARY KEY,
    user_scope TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    cache_value JSONB NOT NULL DEFAULT 'null'::jsonb,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_scope, cache_key)
  );
`;

const CREATE_CACHE_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS cache_user_scope_updated_at_idx ON cache (user_scope, updated_at DESC);",
  "CREATE INDEX IF NOT EXISTS cache_expires_at_idx ON cache (expires_at);",
];

const ALTER_CACHE_TABLE_SQL = [
  "ALTER TABLE cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;",
];

const HEARTBEAT_DAILY_COUNT_KEY_PATTERN = "^heartbeat:(action:[^:]+:)?today_count:[0-9]{4}-[0-9]{2}-[0-9]{2}$";

function normalizeText(value, label, { allowEmpty = false } = {}) {
  const normalized = String(value || "").trim();

  if (!allowEmpty && !normalized) {
    throw new Error(`${label} is required.`);
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

function normalizeDateKey(value, label) {
  const normalized = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} must be a YYYY-MM-DD date key.`);
  }

  return normalized;
}

function normalizeCacheRecord(record = {}, defaults = {}) {
  return {
    userScope: normalizeText(record.userScope || record.user_scope || defaults.userScope, "User scope"),
    cacheKey: normalizeText(record.cacheKey || record.cache_key || record.key, "Cache key"),
    cacheValue: record.cacheValue ?? record.cache_value ?? record.value ?? null,
    expiresAt: normalizeTimestamp(record.expiresAt || record.expires_at, "expires_at"),
  };
}

function mapCacheRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    userScope: row.user_scope,
    cacheKey: row.cache_key,
    cacheValue: row.cache_value,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isExpiredRow(row, now = new Date()) {
  if (!row?.expires_at) {
    return false;
  }

  return new Date(row.expires_at).getTime() <= now.getTime();
}

function createNoopCacheStore({ logger }) {
  return {
    persistenceEnabled: false,
    async init() {
      logger.warn("[cache] DATABASE_URL is not set; cache persistence is disabled.");
    },
    async get() {
      return null;
    },
    async set() {
      throw new Error("Cache store is disabled because DATABASE_URL is not set.");
    },
    async delete() {
      return false;
    },
    async deleteExpired() {
      return 0;
    },
    async deleteHeartbeatDailyCountsBefore() {
      return 0;
    },
    async close() {},
  };
}

function createCacheStore({ config, logger }) {
  const pool = createPostgresPool({ config });

  if (!pool) {
    return createNoopCacheStore({ logger });
  }

  return {
    persistenceEnabled: true,
    async init() {
      await pool.query(CREATE_CACHE_TABLE_SQL);

      for (const statement of ALTER_CACHE_TABLE_SQL) {
        await pool.query(statement);
      }

      for (const statement of CREATE_CACHE_INDEXES_SQL) {
        await pool.query(statement);
      }

      logger.debug?.("[cache] Cache store ready", {
        provider: "postgres",
      });
    },

    async get(cacheKey, { userScope, now = new Date() } = {}) {
      const normalizedKey = normalizeText(cacheKey, "Cache key");
      const normalizedUserScope = normalizeText(userScope, "User scope");

      const { rows } = await pool.query(
        `
          SELECT
            id,
            user_scope,
            cache_key,
            cache_value,
            expires_at,
            created_at,
            updated_at
          FROM cache
          WHERE user_scope = $1
            AND cache_key = $2
          LIMIT 1
        `,
        [normalizedUserScope, normalizedKey],
      );

      const row = rows[0];

      if (!row) {
        return null;
      }

      if (isExpiredRow(row, now)) {
        await this.delete(normalizedKey, { userScope: normalizedUserScope });
        return null;
      }

      return mapCacheRow(row);
    },

    async setIfAbsent(record, defaults = {}) {
      const normalized = normalizeCacheRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO cache (
            user_scope,
            cache_key,
            cache_value,
            expires_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3::jsonb, $4, NOW(), NOW())
          ON CONFLICT (user_scope, cache_key)
          DO NOTHING
          RETURNING
            id,
            user_scope,
            cache_key,
            cache_value,
            expires_at,
            created_at,
            updated_at
        `,
        [
          normalized.userScope,
          normalized.cacheKey,
          JSON.stringify(normalized.cacheValue),
          normalized.expiresAt,
        ],
      );

      return rows.length > 0 ? mapCacheRow(rows[0]) : null;
    },

    async set(record, defaults = {}) {
      const normalized = normalizeCacheRecord(record, defaults);
      const { rows } = await pool.query(
        `
          INSERT INTO cache (
            user_scope,
            cache_key,
            cache_value,
            expires_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3::jsonb, $4, NOW(), NOW())
          ON CONFLICT (user_scope, cache_key)
          DO UPDATE SET
            cache_value = EXCLUDED.cache_value,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
          RETURNING
            id,
            user_scope,
            cache_key,
            cache_value,
            expires_at,
            created_at,
            updated_at
        `,
        [
          normalized.userScope,
          normalized.cacheKey,
          JSON.stringify(normalized.cacheValue),
          normalized.expiresAt,
        ],
      );

      return mapCacheRow(rows[0]);
    },

    async delete(cacheKey, { userScope } = {}) {
      const normalizedKey = normalizeText(cacheKey, "Cache key");
      const normalizedUserScope = normalizeText(userScope, "User scope");
      const { rowCount } = await pool.query(
        `
          DELETE FROM cache
          WHERE user_scope = $1
            AND cache_key = $2
        `,
        [normalizedUserScope, normalizedKey],
      );

      return rowCount > 0;
    },

    async deleteExpired({ now = new Date() } = {}) {
      const normalizedNow = normalizeTimestamp(now, "now", { allowEmpty: false });
      const { rowCount } = await pool.query(
        `
          DELETE FROM cache
          WHERE expires_at IS NOT NULL
            AND expires_at <= $1
        `,
        [normalizedNow],
      );

      return rowCount;
    },

    async deleteHeartbeatDailyCountsBefore({ dateKey } = {}) {
      const normalizedDateKey = normalizeDateKey(dateKey, "dateKey");
      const { rowCount } = await pool.query(
        `
          DELETE FROM cache
          WHERE cache_key ~ $1
            AND substring(cache_key from '([0-9]{4}-[0-9]{2}-[0-9]{2})$') < $2
        `,
        [HEARTBEAT_DAILY_COUNT_KEY_PATTERN, normalizedDateKey],
      );

      return rowCount;
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  HEARTBEAT_DAILY_COUNT_KEY_PATTERN,
  normalizeCacheRecord,
  normalizeDateKey,
  mapCacheRow,
  isExpiredRow,
  createCacheStore,
};
