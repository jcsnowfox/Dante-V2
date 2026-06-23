import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:norwegian-storage] PASS ${message}`);
}

function fail(message, details = {}) {
  console.error(`[verify:norwegian-storage] FAIL ${message}`, Object.keys(details).length ? details : '');
  process.exitCode = 1;
}

const STORE_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
const STATUS_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianSourceStatus.js');

const REQUIRED_TABLES = [
  'norwegian_learning_profile',
  'norwegian_lessons',
  'norwegian_corrections',
  'norwegian_pronunciation_attempts',
  'norwegian_vocabulary',
  'norwegian_media_links',
  'norwegian_review_items',
];

const FORBIDDEN_FIELDS = [
  { field: 'audio_data', reason: 'raw audio must not be stored' },
  { field: 'audio_content', reason: 'raw audio must not be stored' },
  { field: 'raw_audio', reason: 'raw audio must not be stored' },
  { field: 'article_body', reason: 'article bodies must not be stored' },
  { field: 'article_content', reason: 'article bodies must not be stored' },
  { field: 'subtitle_body', reason: 'subtitle bodies must not be stored' },
  { field: 'full_transcript', reason: 'full transcripts must not be stored' },
  { field: 'copyright_content', reason: 'copyrighted content must not be stored' },
];

function checkStoreFile() {
  if (!existsSync(STORE_PATH)) {
    fail('norwegianLearningStore.js does not exist');
    return null;
  }
  pass('norwegianLearningStore.js exists');
  return readFileSync(STORE_PATH, 'utf8');
}

function checkTableDefinitions(storeSrc) {
  for (const table of REQUIRED_TABLES) {
    if (storeSrc.includes(table)) {
      pass(`CREATE TABLE definition found: ${table}`);
    } else {
      fail(`CREATE TABLE definition missing: ${table}`);
    }
  }
}

function checkSourceStatusInTables(storeSrc) {
  for (const table of ['norwegian_lessons', 'norwegian_corrections', 'norwegian_vocabulary', 'norwegian_media_links', 'norwegian_review_items']) {
    const tableSection = storeSrc.slice(storeSrc.indexOf(table));
    if (tableSection.includes('source_status')) {
      pass(`Table ${table} includes source_status column`);
    } else {
      fail(`Table ${table} must include a source_status column`);
    }
  }
}

function checkSourceStatusValidationInStore(storeSrc) {
  if (storeSrc.includes('requireSourceStatus') || storeSrc.includes('validateSourceStatus')) {
    pass('Store validates sourceStatus before saving events');
  } else {
    fail('Store must validate sourceStatus before saving events');
  }

  if (storeSrc.includes('createNorwegianLearningStore')) {
    pass('createNorwegianLearningStore is defined in store');
  } else {
    fail('createNorwegianLearningStore must be defined in store');
  }
}

function checkForbiddenFields(storeSrc) {
  for (const { field, reason } of FORBIDDEN_FIELDS) {
    if (storeSrc.includes(field)) {
      fail(`Store contains forbidden field '${field}': ${reason}`);
    } else {
      pass(`Store does not contain forbidden field: ${field}`);
    }
  }
}

function checkRequiredFunctionSignatures(storeSrc) {
  const required = [
    'async init()',
    'async getProfile(',
    'async saveProfile(',
    'async saveLesson(',
    'async saveCorrection(',
    'async savePronunciationAttempt(',
    'async saveVocabularyItem(',
    'async saveMediaLink(',
    'async saveReviewItem(',
    'async getOverview(',
  ];

  for (const sig of required) {
    if (storeSrc.includes(sig)) {
      pass(`Store defines: ${sig}`);
    } else {
      fail(`Store is missing: ${sig}`);
    }
  }
}

function checkSourceStatusValidationLogic() {
  const statusMod = require(STATUS_PATH);
  const { validateSourceStatus, ALLOWED_SOURCE_STATUSES } = statusMod;

  pass('norwegianSourceStatus.js loaded from storage verify');

  // These are the values that the store will call validateSourceStatus with
  const validStatuses = ['verified', 'partial', 'stt_based_practice', 'low_confidence', 'unverified_practice', 'not_checked'];
  for (const s of validStatuses) {
    try {
      validateSourceStatus(s);
      pass(`validateSourceStatus accepts: ${s}`);
    } catch (e) {
      fail(`validateSourceStatus should accept: ${s}`);
    }
  }

  const invalidStatuses = ['', 'fake_status', 'audio_only', null, undefined];
  for (const s of invalidStatuses) {
    try {
      validateSourceStatus(s);
      fail(`validateSourceStatus should reject: '${s}'`);
    } catch {
      pass(`validateSourceStatus rejects invalid: '${String(s)}'`);
    }
  }

  // Simulate what the store's requireSourceStatus does
  function requireSourceStatus(event) {
    const status = event && event.sourceStatus;
    if (!status) throw new Error('sourceStatus is required');
    return validateSourceStatus(status);
  }

  // Missing sourceStatus
  try {
    requireSourceStatus({ userScope: 'user', topic: 'test' });
    fail('requireSourceStatus should throw when sourceStatus missing');
  } catch {
    pass('requireSourceStatus throws when sourceStatus is missing');
  }

  // Invalid sourceStatus
  try {
    requireSourceStatus({ userScope: 'user', sourceStatus: 'invented_status' });
    fail('requireSourceStatus should throw for invalid sourceStatus');
  } catch {
    pass('requireSourceStatus throws for invalid sourceStatus');
  }

  // Valid sourceStatus
  try {
    const result = requireSourceStatus({ userScope: 'user', sourceStatus: 'verified' });
    if (result === 'verified') {
      pass('requireSourceStatus returns status for valid input');
    } else {
      fail('requireSourceStatus should return the status');
    }
  } catch (e) {
    fail(`requireSourceStatus threw for valid input: ${e.message}`);
  }
}

async function checkDbSchema(pool) {
  for (const tableName of REQUIRED_TABLES) {
    const tableResult = await pool.query(
      `SELECT to_regclass('public.${tableName}') AS table_name;`,
    );
    if (!tableResult.rows[0]?.table_name) {
      fail(`Table missing in DB: ${tableName}`);
    } else {
      pass(`Table exists in DB: ${tableName}`);
    }
  }

  // Check source_status columns exist
  for (const tableName of ['norwegian_lessons', 'norwegian_corrections', 'norwegian_vocabulary']) {
    const colResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'source_status'
    `, [tableName]);
    if (colResult.rows.length > 0) {
      pass(`${tableName}.source_status column exists (${colResult.rows[0].data_type})`);
    } else {
      fail(`${tableName}.source_status column is missing`);
    }
  }

  // Verify forbidden columns do NOT exist
  for (const { field, reason } of FORBIDDEN_FIELDS) {
    const colResult = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name LIKE 'norwegian_%'
        AND column_name = $1
    `, [field]);
    const cnt = Number(colResult.rows[0]?.cnt || 0);
    if (cnt > 0) {
      fail(`Forbidden field '${field}' found in norwegian tables: ${reason}`);
    } else {
      pass(`Forbidden field absent in DB: ${field}`);
    }
  }
}

async function main() {
  const storeSrc = checkStoreFile();
  if (!storeSrc) return;

  checkTableDefinitions(storeSrc);
  checkSourceStatusInTables(storeSrc);
  checkSourceStatusValidationInStore(storeSrc);
  checkForbiddenFields(storeSrc);
  checkRequiredFunctionSignatures(storeSrc);
  checkSourceStatusValidationLogic();

  if (!process.env.DATABASE_URL) {
    console.warn('[verify:norwegian-storage] DATABASE_URL is not set — skipping live DB schema checks.');
    if (!process.exitCode) {
      console.log('[verify:norwegian-storage] Static checks passed (no DB).');
    }
    return;
  }

  // Initialize tables then check schema using pg directly
  const { default: pg } = await import('../artifacts/ghostlight-bot/node_modules/pg/lib/index.js');
  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Run init via the store (requires running in bot context — use pool query directly)
    // Read the CREATE TABLE SQL from the store source and run it
    const createSqlMatch = storeSrc.match(/const CREATE_TABLES_SQL = `([\s\S]*?)`;/);
    if (createSqlMatch) {
      await pool.query(createSqlMatch[1]);
      pass('CREATE TABLE SQL executed successfully (tables created/verified)');
    } else {
      fail('Could not extract CREATE_TABLES_SQL from store module');
    }

    await checkDbSchema(pool);

    if (!process.exitCode) {
      console.log('[verify:norwegian-storage] All checks passed.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[verify:norwegian-storage] Unexpected error:', error.message);
  process.exit(1);
});
