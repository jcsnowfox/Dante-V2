import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REQUIRED_AUDIO_KEYS = [
  'audio.ttsEnabled',
  'audio.ttsProvider',
  'audio.fishVoiceId',
  'audio.fishModelId',
  'audio.elevenlabsVoiceId',
];

function pass(message) {
  console.log(`[verify:dashboard-audio-settings] PASS ${message}`);
}

function fail(message, details = {}) {
  console.error(`[verify:dashboard-audio-settings] FAIL ${message}`, Object.keys(details).length ? details : '');
  process.exitCode = 1;
}

function checkRuntimeSettingsRegistration() {
  const runtimeSettingsPath = join(__dirname, '..', 'artifacts', 'ghostlight-bot', 'src', 'config', 'runtimeSettings.js');
  let source;
  try {
    source = readFileSync(runtimeSettingsPath, 'utf8');
  } catch (err) {
    fail(`Could not read runtimeSettings.js: ${err.message}`);
    return;
  }

  pass('runtimeSettings.js found');

  for (const key of REQUIRED_AUDIO_KEYS) {
    const pattern = `key: "${key}"`;
    if (source.includes(pattern)) {
      pass(`runtime setting registered: ${key}`);
    } else {
      fail(`runtime setting not registered: ${key} — add it to EDITABLE_RUNTIME_SETTINGS in runtimeSettings.js`);
    }
  }
}

function checkAdminSettingsParsers() {
  const parsersPath = join(__dirname, '..', 'artifacts', 'ghostlight-bot', 'src', 'http', 'adminSettingsParsers.js');
  let source;
  try {
    source = readFileSync(parsersPath, 'utf8');
  } catch (err) {
    fail(`Could not read adminSettingsParsers.js: ${err.message}`);
    return;
  }

  pass('adminSettingsParsers.js found');

  const checks = [
    { label: 'audioTtsProvider radio field handled', pattern: 'audioTtsProvider' },
    { label: 'audioFishVoiceId field handled', pattern: 'audioFishVoiceId' },
    { label: 'audioFishModelId field handled', pattern: 'audioFishModelId' },
    { label: 'fish provider branch present', pattern: "fish_audio" },
  ];

  for (const { label, pattern } of checks) {
    if (source.includes(pattern)) {
      pass(label);
    } else {
      fail(`${label} — pattern not found in adminSettingsParsers.js: ${pattern}`);
    }
  }
}

function checkRenderedDashboardUi() {
  const pagePath = join(__dirname, '..', 'artifacts', 'ghostlight-bot', 'src', 'http', 'renderAdminPages', 'audioPages.js');
  const source = readFileSync(pagePath, 'utf8');
  for (const pattern of ['Voice Provider', 'Disabled / None', 'ElevenLabs', 'Fish Audio', 'audioFishVoiceId', 'audioFishModelId', 'fishAudioKeyConfigured']) {
    if (source.includes(pattern)) pass(`dashboard UI contains: ${pattern}`);
    else fail(`dashboard UI missing: ${pattern}`);
  }
}

async function main() {
  checkRuntimeSettingsRegistration();
  checkAdminSettingsParsers();
  checkRenderedDashboardUi();

  if (!process.exitCode) {
    console.log('[verify:dashboard-audio-settings] All checks passed.');
  }
}

main().catch((error) => {
  console.error('[verify:dashboard-audio-settings] Unexpected error:', error.message);
  process.exit(1);
});