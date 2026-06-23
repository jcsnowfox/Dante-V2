import { readFileSync } from 'fs';

const REQUIRED_COLUMNS = new Map([
  ['id', 'bigint'],
  ['audio_id', 'uuid'],
  ['user_scope', 'text'],
  ['source_surface', 'text'],
  ['display_name', 'text'],
  ['conversation_id', 'text'],
  ['channel_id', 'text'],
  ['discord_message_id', 'text'],
  ['source_message_id', 'text'],
  ['prompt', 'text'],
  ['spoken_text', 'text'],
  ['caption', 'text'],
  ['voice_id', 'text'],
  ['model', 'text'],
  ['output_format', 'text'],
  ['mime_type', 'text'],
  ['file_size_bytes', 'integer'],
  ['storage_key', 'text'],
  ['custom_tags', 'jsonb'],
  ['is_favorite', 'boolean'],
  ['status', 'text'],
  ['error_message', 'text'],
  ['provider', 'text'],
  ['provider_voice_id', 'text'],
  ['provider_model_id', 'text'],
  ['created_at', 'timestamp with time zone'],
  ['deleted_at', 'timestamp with time zone'],
]);

const REQUIRED_INDEXES = [
  'generated_audio_user_scope_created_at_idx',
  'generated_audio_conversation_created_at_idx',
  'generated_audio_status_created_at_idx',
  'generated_audio_custom_tags_gin_idx',
];

function pass(message) {
  console.log(`[verify:audio-generation] PASS ${message}`);
}

function fail(message, details = {}) {
  console.error(`[verify:audio-generation] FAIL ${message}`, Object.keys(details).length ? details : '');
  process.exitCode = 1;
}

async function checkEnv() {
  const enabled = process.env.AUDIO_TTS_ENABLED;
  if (!enabled || !["1", "true", "yes", "on"].includes(String(enabled).trim().toLowerCase())) {
    console.warn('[verify:audio-generation] WARN AUDIO_TTS_ENABLED is not set to true — audio TTS is disabled');
  } else {
    pass('AUDIO_TTS_ENABLED is set');
  }

  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey) {
    console.warn('[verify:audio-generation] WARN ELEVENLABS_API_KEY is not set — ElevenLabs TTS will not work');
  } else {
    pass('ELEVENLABS_API_KEY is set');
  }

  const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!elevenLabsVoiceId) {
    console.warn('[verify:audio-generation] WARN ELEVENLABS_VOICE_ID is not set — ElevenLabs TTS will not work');
  } else {
    pass('ELEVENLABS_VOICE_ID is set');
  }

  const bucketName = process.env.BUCKET || process.env.BUCKET_NAME || process.env.TIGRIS_BUCKET_NAME || process.env.AWS_BUCKET;
  const localDir = process.env.MEDIA_STORAGE_DIR;
  if (!bucketName && !localDir) {
    console.warn('[verify:audio-generation] WARN No storage configured — set BUCKET/BUCKET_NAME/TIGRIS_BUCKET_NAME/AWS_BUCKET or MEDIA_STORAGE_DIR');
  } else if (bucketName) {
    pass(`Bucket storage configured: ${bucketName}`);
  } else {
    pass(`Local storage configured: ${localDir}`);
  }
}

async function checkSchema(pool) {
  const tableResult = await pool.query(
    `SELECT to_regclass('public.generated_audio') AS table_name;`,
  );

  if (!tableResult.rows[0]?.table_name) {
    fail('generated_audio table is missing');
    return;
  }

  pass('generated_audio table exists');

  const columnsResult = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'generated_audio';
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
      AND tablename = 'generated_audio';
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

function checkStaticRouting() {
  const source = readFileSync(new URL('../artifacts/ghostlight-bot/src/audio/generateAudio.js', import.meta.url), 'utf8')
    + readFileSync(new URL('../artifacts/ghostlight-bot/src/storage/generatedAudio/index.js', import.meta.url), 'utf8');

  for (const pattern of [
    'resolveTtsProvider',
    'fish_audio',
    'generateFishAudioClip',
    'provider_voice_id',
    'provider_model_id',
    '[audio] generate requested',
    '[audio] fish synthesis started',
    '[audio] fish synthesis completed',
    '[audio] generated audio persisted',
    '[audio] fish synthesis failed',
  ]) {
    if (source.includes(pattern)) pass(`audio generation source contains: ${pattern}`);
    else fail(`audio generation source missing: ${pattern}`);
  }
}

async function main() {
  await checkEnv();
  checkStaticRouting();

  if (!process.env.DATABASE_URL) {
    console.warn('[verify:audio-generation] DATABASE_URL is not set — skipping schema verification.');
    if (!process.exitCode) console.log('[verify:audio-generation] Static checks complete (no DB).');
    return;
  }

  const { default: pg } = await import('../artifacts/ghostlight-bot/node_modules/pg/lib/index.js');
  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await checkSchema(pool);
    if (!process.exitCode) {
      console.log('[verify:audio-generation] All checks passed.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[verify:audio-generation] Unexpected error:', error.message);
  process.exit(1);
});
