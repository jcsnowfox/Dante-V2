import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const TABLE_NAME = 'memories';
const REQUIRED_COLUMNS = new Map([
  ['id', 'bigint'],
  ['memory_id', 'uuid'],
  ['title', 'text'],
  ['content', 'text'],
  ['memory_type', 'text'],
  ['domain', 'text'],
  ['sensitivity', 'text'],
  ['source', 'text'],
  ['active', 'boolean'],
  ['importance', 'integer'],
  ['user_scope', 'text'],
  ['reference_date', 'date'],
  ['created_at', 'timestamp with time zone'],
  ['updated_at', 'timestamp with time zone'],
  ['last_used_at', 'timestamp with time zone'],
  ['use_count', 'integer'],
]);
const REQUIRED_INDEXES = [
  'memories_user_scope_active_idx',
  'memories_memory_type_idx',
  'memories_domain_idx',
  'memories_reference_date_idx',
  'memories_updated_at_idx',
];

function pass(message) {
  console.log(`[verify:memory-schema] PASS ${message}`);
}

function fail(message, details = {}) {
  console.error(`[verify:memory-schema] FAIL ${message}`, Object.keys(details).length ? details : '');
  process.exitCode = 1;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[verify:memory-schema] DATABASE_URL is not set — skipping schema verification.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Check memories table
    const tableResult = await pool.query(
      `SELECT to_regclass('public.${TABLE_NAME}') AS table_name;`,
    );

    if (!tableResult.rows[0]?.table_name) {
      fail(`${TABLE_NAME} table is missing`);
      return;
    }

    pass(`${TABLE_NAME} table exists`);

    const columnsResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = '${TABLE_NAME}';
    `);
    const columns = new Map(columnsResult.rows.map((row) => [row.column_name, row.data_type]));

    for (const [columnName, expectedType] of REQUIRED_COLUMNS) {
      const actualType = columns.get(columnName);
      if (!actualType) {
        fail(`required column is missing: ${columnName}`);
      } else if (actualType !== expectedType) {
        fail(`column ${columnName} has unexpected type`, { expectedType, actualType });
      } else {
        pass(`column ${columnName} (${actualType})`);
      }
    }

    const indexesResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = '${TABLE_NAME}';
    `);
    const indexes = new Set(indexesResult.rows.map((row) => row.indexname));

    for (const indexName of REQUIRED_INDEXES) {
      if (!indexes.has(indexName)) {
        fail(`required index is missing: ${indexName}`);
      } else {
        pass(`index ${indexName}`);
      }
    }

    // Check memory_usage_events table existence
    const usageTableResult = await pool.query(
      `SELECT to_regclass('public.memory_usage_events') AS table_name;`,
    );

    if (!usageTableResult.rows[0]?.table_name) {
      fail(`memory_usage_events table is missing`);
    } else {
      pass(`memory_usage_events table exists`);
    }

    if (!process.exitCode) {
      console.log(`[verify:memory-schema] All checks passed.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[verify:memory-schema] Unexpected error:', error.message);
  process.exit(1);
});
