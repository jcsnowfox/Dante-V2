import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const TABLE_NAME = 'heartbeat_actions';
const REQUIRED_COLUMNS = new Map([
  ['id', 'bigint'],
  ['action_id', 'text'],
  ['user_scope', 'text'],
  ['label', 'text'],
  ['executor_type', 'text'],
  ['target_channel_id', 'text'],
  ['prompt', 'text'],
  ['frequency', 'text'],
  ['quiet_hours_allowed', 'boolean'],
  ['mention_user', 'boolean'],
  ['tags', 'text'],
  ['enabled', 'boolean'],
  ['is_builtin', 'boolean'],
  ['created_at', 'timestamp with time zone'],
  ['updated_at', 'timestamp with time zone'],
]);
const REQUIRED_INDEXES = [
  'heartbeat_actions_user_scope_idx',
  'heartbeat_actions_enabled_idx',
  'heartbeat_actions_builtin_idx',
];

function pass(message) {
  console.log(`[verify:heartbeat-actions-schema] PASS ${message}`);
}

function fail(message, details = {}) {
  console.error(`[verify:heartbeat-actions-schema] FAIL ${message}`, Object.keys(details).length ? details : '');
  process.exitCode = 1;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[verify:heartbeat-actions-schema] DATABASE_URL is not set — skipping schema verification.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
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

    if (!process.exitCode) {
      console.log(`[verify:heartbeat-actions-schema] All checks passed.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[verify:heartbeat-actions-schema] Unexpected error:', error.message);
  process.exit(1);
});
