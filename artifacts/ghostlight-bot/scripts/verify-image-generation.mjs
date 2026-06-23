import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const REQUIRED_COLUMNS = new Map([
  ['id', 'bigint'],
  ['image_id', 'uuid'],
  ['user_scope', 'text'],
  ['source_surface', 'text'],
  ['conversation_id', 'text'],
  ['channel_id', 'text'],
  ['discord_message_id', 'text'],
  ['prompt', 'text'],
  ['composed_prompt', 'text'],
  ['style_preset_ids', 'jsonb'],
  ['appearance_preset_ids', 'jsonb'],
  ['model', 'text'],
  ['aspect_ratio', 'text'],
  ['mime_type', 'text'],
  ['file_size_bytes', 'integer'],
  ['storage_key', 'text'],
  ['thumbnail_storage_key', 'text'],
  ['custom_tags', 'jsonb'],
  ['is_favorite', 'boolean'],
  ['status', 'text'],
  ['error_message', 'text'],
  ['created_at', 'timestamp with time zone'],
  ['deleted_at', 'timestamp with time zone'],
]);

const REQUIRED_INDEXES = [
  'generated_images_user_scope_created_at_idx',
  'generated_images_conversation_created_at_idx',
  'generated_images_status_created_at_idx',
  'generated_images_custom_tags_gin_idx',
];

function pass(message) {
  console.log(`[verify:image-generation] PASS ${message}`);
}

function fail(message, details = {}) {
  console.error(`[verify:image-generation] FAIL ${message}`, Object.keys(details).length ? details : '');
  process.exitCode = 1;
}

async function checkEnv() {
  // IMAGE_GENERATION_ENABLED must be true for image gen to work
  const enabled = process.env.IMAGE_GENERATION_ENABLED;
  if (!enabled || !['1', 'true', 'yes', 'on'].includes(String(enabled).trim().toLowerCase())) {
    console.warn('[verify:image-generation] WARN IMAGE_GENERATION_ENABLED is not set to true — image generation is disabled');
  } else {
    pass('IMAGE_GENERATION_ENABLED is set');
  }

  // Check for at least one image provider API key
  const getimgKey = process.env.GETIMG_API_KEY;
  if (!getimgKey) {
    console.warn('[verify:image-generation] WARN GETIMG_API_KEY is not set — getimg.ai image generation will not work');
  } else {
    pass('GETIMG_API_KEY is set');
  }

  // Check for storage config
  const bucketName = process.env.BUCKET || process.env.BUCKET_NAME || process.env.TIGRIS_BUCKET_NAME || process.env.AWS_BUCKET;
  const localDir = process.env.MEDIA_STORAGE_DIR;
  if (!bucketName && !localDir) {
    fail('No storage configured — set BUCKET/BUCKET_NAME/TIGRIS_BUCKET_NAME/AWS_BUCKET or MEDIA_STORAGE_DIR');
  } else if (bucketName) {
    pass(`Bucket storage configured: ${bucketName}`);
  } else {
    pass(`Local storage configured: ${localDir}`);
  }
}

async function checkSchema(pool) {
  const tableResult = await pool.query(
    `SELECT to_regclass('public.generated_images') AS table_name;`,
  );

  if (!tableResult.rows[0]?.table_name) {
    fail('generated_images table is missing');
    return;
  }

  pass('generated_images table exists');

  const columnsResult = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'generated_images';
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
      AND tablename = 'generated_images';
  `);
  const indexes = new Set(indexesResult.rows.map((row) => row.indexname));

  for (const indexName of REQUIRED_INDEXES) {
    if (!indexes.has(indexName)) {
      fail(`required index is missing: ${indexName}`);
    } else {
      pass(`index ${indexName}`);
    }
  }
}

async function main() {
  await checkEnv();

  if (!process.env.DATABASE_URL) {
    console.error('[verify:image-generation] DATABASE_URL is not set — skipping schema verification.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await checkSchema(pool);
    if (!process.exitCode) {
      console.log('[verify:image-generation] All checks passed.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[verify:image-generation] Unexpected error:', error.message);
  process.exit(1);
});
