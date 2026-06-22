import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const REQUIRED_COLUMNS = new Map([
  ['id', 'bigint'],
  ['conversation_id', 'text'],
  ['thread_id', 'text'],
  ['channel_id', 'text'],
  ['guild_id', 'text'],
  ['discord_message_id', 'text'],
  ['author_id', 'text'],
  ['author_name', 'text'],
  ['role', 'text'],
  ['source', 'text'],
  ['event_type', 'text'],
  ['content_text', 'text'],
  ['metadata', 'jsonb'],
  ['created_at', 'timestamp with time zone'],
]);

const REQUIRED_INDEXES = [
  'conversation_events_conversation_created_at_idx',
  'conversation_events_channel_created_at_idx',
  'conversation_events_thread_created_at_idx',
  'conversation_events_discord_message_id_idx',
  'conversation_events_discord_message_message_unique_idx',
];

function fail(message, details = {}) {
  console.error(`[verify:conversations-schema] FAIL ${message}`, details);
  process.exitCode = 1;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail('DATABASE_URL is required.');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false } });

  try {
    const tableResult = await pool.query(`
      SELECT to_regclass('public.conversation_events') AS table_name;
    `);

    if (!tableResult.rows[0]?.table_name) {
      fail('conversation_events table is missing.');
      return;
    }

    const columnsResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'conversation_events';
    `);
    const columns = new Map(columnsResult.rows.map((row) => [row.column_name, row.data_type]));

    for (const [columnName, expectedType] of REQUIRED_COLUMNS) {
      const actualType = columns.get(columnName);
      if (!actualType) {
        fail(`required column is missing: ${columnName}`);
      } else if (actualType !== expectedType) {
        fail(`column ${columnName} has unexpected type`, { expectedType, actualType });
      }
    }

    const indexesResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'conversation_events';
    `);
    const indexes = new Set(indexesResult.rows.map((row) => row.indexname));

    for (const indexName of REQUIRED_INDEXES) {
      if (!indexes.has(indexName)) {
        fail(`required index is missing: ${indexName}`);
      }
    }

    if (!process.exitCode) {
      console.log('[verify:conversations-schema] PASS conversation_events schema and indexes are present.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  fail(error.message, { code: error.code, stack: error.stack });
});
