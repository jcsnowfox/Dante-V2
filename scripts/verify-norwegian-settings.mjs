import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:norwegian-settings] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-settings] FAIL ${message}`);
  process.exitCode = 1;
}

async function main() {
  const settingsPath = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianSettings.js');

  let mod;
  try {
    mod = require(settingsPath);
  } catch (error) {
    fail(`norwegianSettings.js failed to load: ${error.message}`);
    return;
  }

  pass('norwegianSettings.js loaded');

  const {
    NORWEGIAN_LEVELS,
    NORWEGIAN_WRITTEN_STANDARDS,
    NORWEGIAN_SPOKEN_TARGETS,
    NORWEGIAN_CORRECTION_STYLES,
    NORWEGIAN_DAILY_LESSON_LENGTHS,
    DEFAULT_NORWEGIAN_SETTINGS,
    validateNorwegianSettings,
    normalizeNorwegianSettings,
  } = mod;

  // Check enums
  for (const level of ['beginner', 'A1', 'A2', 'B1', 'B2']) {
    if (NORWEGIAN_LEVELS.includes(level)) {
      pass(`NORWEGIAN_LEVELS includes ${level}`);
    } else {
      fail(`NORWEGIAN_LEVELS missing: ${level}`);
    }
  }

  if (NORWEGIAN_WRITTEN_STANDARDS.includes('bokmal')) {
    pass('NORWEGIAN_WRITTEN_STANDARDS includes bokmal');
  } else {
    fail('NORWEGIAN_WRITTEN_STANDARDS missing bokmal');
  }

  if (NORWEGIAN_SPOKEN_TARGETS.includes('oslo_standard_eastern')) {
    pass('NORWEGIAN_SPOKEN_TARGETS includes oslo_standard_eastern');
  } else {
    fail('NORWEGIAN_SPOKEN_TARGETS missing oslo_standard_eastern');
  }

  for (const style of ['gentle', 'direct', 'strict']) {
    if (NORWEGIAN_CORRECTION_STYLES.includes(style)) {
      pass(`NORWEGIAN_CORRECTION_STYLES includes ${style}`);
    } else {
      fail(`NORWEGIAN_CORRECTION_STYLES missing: ${style}`);
    }
  }

  for (const length of [3, 5, 10]) {
    if (NORWEGIAN_DAILY_LESSON_LENGTHS.includes(length)) {
      pass(`NORWEGIAN_DAILY_LESSON_LENGTHS includes ${length}`);
    } else {
      fail(`NORWEGIAN_DAILY_LESSON_LENGTHS missing: ${length}`);
    }
  }

  // Check default settings fields
  const requiredDefaults = [
    'enabled', 'level', 'writtenStandard', 'spokenTarget',
    'correctionStyle', 'dailyLessonLengthMinutes',
    'mediaRecommendationsEnabled', 'newsRecommendationsEnabled',
    'youtubeRecommendationsEnabled', 'tvRecommendationsEnabled',
    'voicePracticeEnabled', 'requireSourceCheck', 'allowUnverifiedPracticeHelp',
  ];
  for (const field of requiredDefaults) {
    if (field in DEFAULT_NORWEGIAN_SETTINGS) {
      pass(`DEFAULT_NORWEGIAN_SETTINGS has field: ${field}`);
    } else {
      fail(`DEFAULT_NORWEGIAN_SETTINGS missing field: ${field}`);
    }
  }

  // requireSourceCheck must default to true
  if (DEFAULT_NORWEGIAN_SETTINGS.requireSourceCheck === true) {
    pass('requireSourceCheck defaults to true');
  } else {
    fail('requireSourceCheck must default to true');
  }

  // allowUnverifiedPracticeHelp must default to false
  if (DEFAULT_NORWEGIAN_SETTINGS.allowUnverifiedPracticeHelp === false) {
    pass('allowUnverifiedPracticeHelp defaults to false');
  } else {
    fail('allowUnverifiedPracticeHelp must default to false');
  }

  // enabled must default to false
  if (DEFAULT_NORWEGIAN_SETTINGS.enabled === false) {
    pass('enabled defaults to false');
  } else {
    fail('enabled must default to false');
  }

  // Validate valid settings
  const validSettings = { ...DEFAULT_NORWEGIAN_SETTINGS };
  try {
    validateNorwegianSettings(validSettings);
    pass('validateNorwegianSettings accepts valid settings');
  } catch (error) {
    fail(`validateNorwegianSettings rejected valid settings: ${error.message}`);
  }

  // Validate invalid settings are rejected
  const invalidSettings = { ...DEFAULT_NORWEGIAN_SETTINGS, level: 'C99' };
  try {
    validateNorwegianSettings(invalidSettings);
    fail('validateNorwegianSettings should reject invalid level');
  } catch {
    pass('validateNorwegianSettings rejects invalid level');
  }

  const invalidEnabled = { ...DEFAULT_NORWEGIAN_SETTINGS, enabled: 'yes' };
  try {
    validateNorwegianSettings(invalidEnabled);
    fail('validateNorwegianSettings should reject non-boolean enabled');
  } catch {
    pass('validateNorwegianSettings rejects non-boolean enabled');
  }

  // normalizeNorwegianSettings returns defaults for empty input
  const normalized = normalizeNorwegianSettings(null);
  if (normalized.requireSourceCheck === true) {
    pass('normalizeNorwegianSettings defaults requireSourceCheck to true');
  } else {
    fail('normalizeNorwegianSettings should default requireSourceCheck to true');
  }

  // normalizeNorwegianSettings picks up valid overrides
  const overrideInput = { enabled: true, level: 'B1', correctionStyle: 'strict' };
  const overrideResult = normalizeNorwegianSettings(overrideInput);
  if (overrideResult.enabled === true && overrideResult.level === 'B1' && overrideResult.correctionStyle === 'strict') {
    pass('normalizeNorwegianSettings applies valid overrides');
  } else {
    fail('normalizeNorwegianSettings did not apply valid overrides correctly');
  }

  // normalizeNorwegianSettings ignores invalid overrides
  const badOverride = { level: 'Z9' };
  const badResult = normalizeNorwegianSettings(badOverride);
  if (badResult.level === DEFAULT_NORWEGIAN_SETTINGS.level) {
    pass('normalizeNorwegianSettings ignores invalid level override');
  } else {
    fail('normalizeNorwegianSettings should ignore invalid level override');
  }

  if (!process.exitCode) {
    console.log('[verify:norwegian-settings] All checks passed.');
  }
}

main().catch((error) => {
  console.error('[verify:norwegian-settings] Unexpected error:', error.message);
  process.exit(1);
});
