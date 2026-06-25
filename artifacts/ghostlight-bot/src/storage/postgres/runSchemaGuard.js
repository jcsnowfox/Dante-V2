"use strict";

const { createPostgresPool } = require("./createPostgresPool");
const { SCHEMA_REGISTRY } = require("./schemaRegistry");

async function runSchemaGuard({ config, logger }) {
  const pool = createPostgresPool({ config });
  if (!pool) {
    logger.warn("[schema-guard] No DATABASE_URL — skipping schema check");
    return;
  }

  let existing;
  try {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    existing = new Set(rows.map((r) => r.table_name));
  } catch (err) {
    logger.error("[schema-guard] Could not query information_schema", {
      error: err.message,
    });
    await pool.end().catch(() => {});
    return;
  }

  const missing = SCHEMA_REGISTRY.filter((e) => !existing.has(e.table));

  if (missing.length === 0) {
    logger.info("[schema-guard] All tables present", {
      total: SCHEMA_REGISTRY.length,
    });
    await pool.end().catch(() => {});
    return;
  }

  logger.warn("[schema-guard] Missing tables detected — creating now", {
    count: missing.length,
    tables: missing.map((e) => e.table),
  });

  const created = [];
  const failed = [];

  for (const entry of missing) {
    try {
      await pool.query(entry.sql);
      created.push(entry.table);
      logger.info(`[schema-guard] Created table: ${entry.table}`);
    } catch (err) {
      failed.push(entry.table);
      logger.error(`[schema-guard] Failed to create table: ${entry.table}`, {
        error: err.message,
      });
    }
  }

  if (failed.length > 0) {
    logger.error("[schema-guard] Some tables could not be created", {
      failed,
      created,
    });
  } else {
    logger.info("[schema-guard] Schema guard complete", {
      created,
      total: SCHEMA_REGISTRY.length,
    });
  }

  await pool.end().catch(() => {});
}

module.exports = { runSchemaGuard };
