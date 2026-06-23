import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const TABLE_NAME = 'app_settings';
const REQUIRED_COLUMNS = new Map([
  ['setting_key', 'text'],
  ['setting_value', 'jsonb'],
  ['updated_at', 'timestamp with time zone'],
]);

function pass(message) {
  console.log(`[verify:settings-schema] PASS ${message}`);
}

function fail(message, details = {}) {
  console.error(`[verify:settings-schema] FAIL ${message}`, Object.keys(details).length ? details : '');
  process.exitCode = 1;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[verify:settings-schema] DATABASE_URL is not set — skipping schema verification.');
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

    if (!process.exitCode) {
      console.log(`[verify:settings-schema] All checks passed.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[verify:settings-schema] Unexpected error:', error.message);
  process.exit(1);
});
