import { readFileSync } from 'fs';

const PROVIDER_COLUMNS = new Map([
  ['provider', 'text'],
  ['provider_voice_id', 'text'],
  ['provider_model_id', 'text'],
]);

function pass(message) {
  console.log(`[verify:fish-audio] PASS ${message}`);
}

function warn(message) {
  console.warn(`[verify:fish-audio] WARN ${message}`);
}

function fail(message, details = {}) {
  console.error(`[verify:fish-audio] FAIL ${message}`, Object.keys(details).length ? details : '');
  process.exitCode = 1;
}

function checkEnv() {
  const fishApiKey = process.env.FISH_AUDIO_API_KEY;
  if (!fishApiKey || !String(fishApiKey).trim()) {
    warn('FISH_AUDIO_API_KEY is not set — Fish Audio TTS will not work');
  } else {
    pass('FISH_AUDIO_API_KEY is set');
  }

  const fishVoiceId = process.env.FISH_AUDIO_VOICE_ID;
  if (!fishVoiceId || !String(fishVoiceId).trim()) {
    warn('FISH_AUDIO_VOICE_ID is not set — Fish Audio TTS will not work without a voice ID');
  } else {
    pass('FISH_AUDIO_VOICE_ID is set');
  }

  const fishEnabled = process.env.FISH_AUDIO_ENABLED;
  if (fishEnabled && ["1", "true", "yes", "on"].includes(String(fishEnabled).trim().toLowerCase())) {
    pass('FISH_AUDIO_ENABLED is set — Fish Audio will be the default TTS provider');
  } else {
    warn('FISH_AUDIO_ENABLED is not set to true — set it to make Fish Audio the default provider');
  }
}

async function checkSchema(pool) {
  const tableResult = await pool.query(
    `SELECT to_regclass('public.generated_audio') AS table_name;`,
  );

  if (!tableResult.rows[0]?.table_name) {
    fail('generated_audio table is missing — run the bot once to initialize the schema');
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

  for (const [columnName, expectedType] of PROVIDER_COLUMNS) {
    const actualType = columns.get(columnName);
    if (!actualType) {
      fail(`Fish Audio column is missing: ${columnName} — run the bot once to apply migrations`);
    } else if (actualType !== expectedType) {
      fail(`column ${columnName} has unexpected type`, { expectedType, actualType });
    } else {
      pass(`column ${columnName} (${actualType})`);
    }
  }

  const providerDefault = await pool.query(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'generated_audio'
      AND column_name = 'provider';
  `);
  const defaultValue = providerDefault.rows[0]?.column_default;
  if (defaultValue && defaultValue.includes('elevenlabs')) {
    pass("provider column default is 'elevenlabs'");
  } else {
    warn(`provider column default is unexpected: ${defaultValue}`);
  }
}

function checkStaticFishIntegration() {
  const provider = readFileSync(new URL('../artifacts/ghostlight-bot/src/audio/providers/fishAudioProvider.js', import.meta.url), 'utf8');
  const generateAudio = readFileSync(new URL('../artifacts/ghostlight-bot/src/audio/generateAudio.js', import.meta.url), 'utf8');
  const registry = readFileSync(new URL('../artifacts/ghostlight-bot/src/tools/registry.js', import.meta.url), 'utf8');
  const messageCreate = readFileSync(new URL('../artifacts/ghostlight-bot/src/bot/events/messageCreate.js', import.meta.url), 'utf8');
  const audioActions = readFileSync(new URL('../artifacts/ghostlight-bot/src/http/actions/audioActions.js', import.meta.url), 'utf8');
  const env = readFileSync(new URL('../artifacts/ghostlight-bot/src/config/env.js', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../artifacts/ghostlight-bot/src/config/runtimeSettings.js', import.meta.url), 'utf8');

  for (const [label, source, pattern] of [
    ['Fish provider module', provider, 'generateFishAudioClip'],
    ['Fish provider auth header', provider, 'Authorization'],
    ['Fish provider msgpack content-type', provider, 'application/msgpack'],
    ['Fish provider response status log', provider, '[audio] fish response status='],
    ['Fish provider failure stage log', provider, '[audio] fish synthesis failed'],
    ['Fish provider logger param', provider, 'logger = null'],
    ['Fish env API key', env, 'FISH_AUDIO_API_KEY'],
    ['Fish runtime provider value', runtime, 'fish_audio'],
    ['Fish generate requested log', generateAudio, '[audio] generate requested'],
    ['Fish synthesis started log', generateAudio, '[audio] fish synthesis started'],
    ['Fish synthesis completed log', generateAudio, '[audio] fish synthesis completed'],
    ['Fish generated audio persisted log', generateAudio, '[audio] generated audio persisted'],
    ['Fish storage failure stage log', generateAudio, 'storage_write'],
    ['Fish DB insert failure stage log', generateAudio, 'generated_audio_insert'],
    ['Registration log includes provider field', registry, "provider: selectedAudioProvider"],
    ['Registration log is provider-aware', registry, "fish_audio"],
    ['Discord attachment send started log', messageCreate, '[audio] discord attachment send started'],
    ['Discord attachment sent log', messageCreate, '[audio] discord attachment sent'],
    ['Discord attachment send failure stage', messageCreate, 'discord_attachment_send'],
    ['audio-test-fish endpoint', audioActions, 'audio-test-fish'],
    ['audio-test-fish calls generateFishAudioClip', audioActions, 'generateFishAudioClip'],
  ]) {
    if (source.includes(pattern)) pass(`${label} contains: ${pattern}`);
    else fail(`${label} missing: ${pattern}`);
  }

  console.warn('[verify:fish-audio] WARN LIVE FISH API NOT TESTED — static checks and mocked/provider-code checks only.');
}

async function main() {
  checkEnv();
  checkStaticFishIntegration();

  if (!process.env.DATABASE_URL) {
    console.warn('[verify:fish-audio] DATABASE_URL is not set — skipping schema verification.');
    if (!process.exitCode) {
      console.log('[verify:fish-audio] Env checks complete (no DB).');
    }
    return;
  }

  const { default: pg } = await import('../artifacts/ghostlight-bot/node_modules/pg/lib/index.js');
  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await checkSchema(pool);
    if (!process.exitCode) {
      console.log('[verify:fish-audio] All checks passed.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[verify:fish-audio] Unexpected error:', error.message);
  process.exit(1);
});
