/**
 * Norwegian Learning E2E Smoke Test
 *
 * Mock-based test that exercises the full Norwegian learning flow without
 * a real database or Discord connection. Validates:
 *
 * 1. Store module loads and exports createNorwegianLearningStore
 * 2. Review engine generateDailyPractice/analyzeWeakSpots/generateWeeklySummary
 * 3. Mastery engine calculateMasteryProfile/getNextFocus
 * 4. Learning paths recommendPath
 * 5. Source status validation is enforced end-to-end
 * 6. No hallucination in no-data fallbacks
 * 7. Dashboard render functions produce valid HTML structure
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`[e2e-smoke] PASS ${label}`);
  passed++;
}

function fail(label, reason = '') {
  console.error(`[e2e-smoke] FAIL ${label}${reason ? ` — ${reason}` : ''}`);
  failed++;
  process.exitCode = 1;
}

function section(title) {
  console.log(`\n[e2e-smoke] ── ${title} ──`);
}

// ─── Mock Store ──────────────────────────────────────────────────────────────

function createMockStore(overrides = {}) {
  const data = {
    profile: { enabled: true, level: 'A1', writtenStandard: 'bokmal', requireSourceCheck: true },
    lessons: [],
    corrections: [],
    vocabulary: [],
    pronunciationAttempts: [],
    mediaLinks: [],
    reviewItems: [],
  };

  return {
    available: true,
    getProfile: async (userScope) => overrides.profile !== undefined ? overrides.profile : data.profile,
    saveProfile: async (userScope, profile) => { data.profile = profile; return profile; },
    saveLesson: async (opts) => { const item = { id: 1, ...opts }; data.lessons.push(item); return item; },
    listNorwegianLessons: async (userScope, limit = 20) => (overrides.lessons || data.lessons).slice(0, limit),
    saveCorrection: async (opts) => { const item = { id: 2, ...opts }; data.corrections.push(item); return item; },
    listNorwegianCorrections: async (userScope, limit = 20) => (overrides.corrections || data.corrections).slice(0, limit),
    saveVocabularyItem: async (opts) => { const item = { id: 3, ...opts }; data.vocabulary.push(item); return item; },
    listNorwegianVocabulary: async (userScope, limit = 50) => (overrides.vocabulary || data.vocabulary).slice(0, limit),
    saveMediaLink: async (opts) => { const item = { id: 4, ...opts }; data.mediaLinks.push(item); return item; },
    listNorwegianMediaLinks: async (userScope, limit = 20) => (overrides.mediaLinks || data.mediaLinks).slice(0, limit),
    saveReviewItem: async (opts) => { const item = { id: 5, ...opts }; data.reviewItems.push(item); return item; },
    getDueReviewItems: async (userScope, limit = 10) => (overrides.reviewItems || data.reviewItems).slice(0, limit),
    listNorwegianReviewItems: async (userScope, limit = 20) => (overrides.reviewItems || data.reviewItems).slice(0, limit),
    createPronunciationSession: async (userScope, phrase) => ({ id: 6, userScope, target_phrase: phrase }),
    savePronunciationAttempt: async (opts) => ({ id: 7, ...opts }),
    listNorwegianPronunciationAttempts: async (userScope, limit = 20) => (overrides.pronunciationAttempts || data.pronunciationAttempts).slice(0, limit),
    getWeakSpotSummary: async (userScope) => overrides.weakSpots || [],
  };
}

// ─── 1. Module Loading ────────────────────────────────────────────────────────

function testModuleLoading() {
  section('Module Loading');

  const BASE = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian');

  const modules = [
    { file: 'norwegianSourceStatus.js', exports: ['SOURCE_STATUS', 'validateSourceStatus'] },
    { file: 'norwegianSettings.js', exports: ['NORWEGIAN_LEVELS', 'normalizeNorwegianSettings'] },
    { file: 'norwegianLearningPaths.js', exports: ['recommendPath'] },
    { file: 'norwegianReviewEngine.js', exports: ['generateDailyPractice', 'analyzeWeakSpots', 'generateWeeklySummary'] },
    { file: 'norwegianMasteryEngine.js', exports: ['calculateMasteryProfile', 'getNextFocus'] },
  ];

  for (const { file, exports: expectedExports } of modules) {
    const filePath = path.join(BASE, file);
    if (!existsSync(filePath)) {
      fail(`${file} exists`, 'file missing');
      continue;
    }
    try {
      const mod = require(filePath);
      pass(`${file} loads without error`);
      for (const key of expectedExports) {
        if (typeof mod[key] === 'function' || (mod[key] !== undefined)) {
          pass(`${file} exports ${key}`);
        } else {
          fail(`${file} exports ${key}`, `got ${typeof mod[key]}`);
        }
      }
    } catch (err) {
      fail(`${file} loads without error`, err.message);
    }
  }
}

// ─── 2. Source Status Validation ─────────────────────────────────────────────

async function testSourceStatusValidation() {
  section('Source Status Validation');

  const BASE = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian');
  const { validateSourceStatus, SOURCE_STATUS, ALLOWED_SOURCE_STATUSES } = require(path.join(BASE, 'norwegianSourceStatus.js'));

  // Valid statuses must not throw
  const validStatuses = ['verified', 'partial', 'stt_based_practice', 'low_confidence', 'unverified_practice', 'not_checked'];
  for (const status of validStatuses) {
    try {
      validateSourceStatus(status);
      pass(`validateSourceStatus accepts: ${status}`);
    } catch (err) {
      fail(`validateSourceStatus accepts: ${status}`, err.message);
    }
  }

  // Invalid status must throw
  try {
    validateSourceStatus('made_up_status');
    fail('validateSourceStatus rejects invalid status', 'did not throw');
  } catch {
    pass('validateSourceStatus rejects invalid status');
  }

  // verified > partial > not_checked in weight
  if (SOURCE_STATUS) {
    pass('SOURCE_STATUS constant defined');
  } else {
    fail('SOURCE_STATUS constant defined', 'missing');
  }
}

// ─── 3. Review Engine — No Data Fallback ─────────────────────────────────────

async function testReviewEngineNoData() {
  section('Review Engine — No Data Fallback');

  const BASE = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian');
  const { generateDailyPractice, analyzeWeakSpots, generateWeeklySummary } = require(path.join(BASE, 'norwegianReviewEngine.js'));

  const emptyStore = createMockStore({ reviewItems: [], lessons: [], corrections: [], vocabulary: [] });

  // generateDailyPractice with empty store
  try {
    const result = await generateDailyPractice(emptyStore, 'test-user', null);
    if (result && (Array.isArray(result.tasks) || result.tasks === undefined)) {
      pass('generateDailyPractice returns without crash on empty store');
    } else {
      fail('generateDailyPractice returns expected shape', `got: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    fail('generateDailyPractice handles empty store', err.message);
  }

  // analyzeWeakSpots with empty store
  try {
    const result = await analyzeWeakSpots(emptyStore, 'test-user', null);
    pass('analyzeWeakSpots returns without crash on empty store');
    // Must not invent weak spots
    if (!result || !result.weakSpots?.length || result.weakSpots.length === 0) {
      pass('analyzeWeakSpots returns empty or null on empty store (no invention)');
    } else {
      fail('analyzeWeakSpots invents weak spots from empty data', JSON.stringify(result.weakSpots));
    }
  } catch (err) {
    fail('analyzeWeakSpots handles empty store', err.message);
  }

  // generateWeeklySummary with empty store
  try {
    const result = await generateWeeklySummary(emptyStore, 'test-user', null);
    pass('generateWeeklySummary returns without crash on empty store');
  } catch (err) {
    fail('generateWeeklySummary handles empty store', err.message);
  }
}

// ─── 4. Review Engine — With Data ────────────────────────────────────────────

async function testReviewEngineWithData() {
  section('Review Engine — With Data');

  const BASE = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian');
  const { generateDailyPractice } = require(path.join(BASE, 'norwegianReviewEngine.js'));

  const reviewItems = [
    { id: 1, item_type: 'vocabulary', content: 'hund = dog', grade: 'B', source_status: 'verified', next_due_at: new Date(Date.now() - 1000).toISOString() },
    { id: 2, item_type: 'correction', content: 'jeg er glad', grade: 'A', source_status: 'partial', next_due_at: new Date(Date.now() - 1000).toISOString() },
  ];

  const store = createMockStore({ reviewItems });

  try {
    const result = await generateDailyPractice(store, 'test-user', null);
    if (result && result.tasks && result.tasks.length > 0) {
      pass(`generateDailyPractice returns ${result.tasks.length} tasks from real store data`);
    } else {
      fail('generateDailyPractice returns tasks from store data', `tasks: ${JSON.stringify(result?.tasks)}`);
    }
  } catch (err) {
    fail('generateDailyPractice with real store data', err.message);
  }
}

// ─── 5. Mastery Engine — No Data Fallback ────────────────────────────────────

async function testMasteryEngineNoData() {
  section('Mastery Engine — No Data Fallback');

  const BASE = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian');
  const { calculateMasteryProfile, getNextFocus } = require(path.join(BASE, 'norwegianMasteryEngine.js'));

  const emptyStore = createMockStore({ lessons: [], corrections: [], vocabulary: [], profile: null });

  try {
    const result = await calculateMasteryProfile(emptyStore, 'test-user', null);
    pass('calculateMasteryProfile does not crash on empty store');

    if (!result?.profile) {
      pass('calculateMasteryProfile returns null profile on empty store (no invention)');
    } else {
      fail('calculateMasteryProfile invents profile from empty data', JSON.stringify(result.profile));
    }

    if (result?.message) {
      pass('calculateMasteryProfile provides a helpful message when no data');
    } else {
      fail('calculateMasteryProfile missing helpful message for no-data case');
    }
  } catch (err) {
    fail('calculateMasteryProfile handles empty store', err.message);
  }

  try {
    const result = await getNextFocus(emptyStore, 'test-user', null);
    pass('getNextFocus does not crash on empty store');
  } catch (err) {
    fail('getNextFocus handles empty store', err.message);
  }
}

// ─── 6. Mastery Engine — No CEFR Claim ──────────────────────────────────────

async function testMasteryNoCefrClaim() {
  section('Mastery Engine — No CEFR Claim in Output');

  const BASE = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian');
  const { calculateMasteryProfile } = require(path.join(BASE, 'norwegianMasteryEngine.js'));

  const store = createMockStore({
    lessons: [{ id: 1, topic: 'greetings', level: 'A1', source_status: 'verified', created_at: new Date().toISOString() }],
    corrections: [{ id: 2, original_text: 'test', corrected_text: 'test', source_status: 'partial', created_at: new Date().toISOString() }],
    vocabulary: [{ id: 3, word: 'hund', source_status: 'verified', created_at: new Date().toISOString() }],
  });

  try {
    const result = await calculateMasteryProfile(store, 'test-user', null);
    pass('calculateMasteryProfile with some data does not crash');

    if (result?.profile) {
      const profileStr = JSON.stringify(result.profile).toLowerCase();
      const certificationClaims = ['official cefr', 'you are certified', 'certified level'];
      for (const claim of certificationClaims) {
        if (profileStr.includes(claim)) {
          fail(`calculateMasteryProfile makes official CEFR claim: "${claim}"`);
        }
      }
      pass('calculateMasteryProfile does not claim official CEFR certification');

      // Must have a confidence indicator
      if (result.profile.levelConfidence !== undefined || result.profile.levelBasis !== undefined) {
        pass('calculateMasteryProfile includes confidence/basis for level estimate');
      } else {
        fail('calculateMasteryProfile missing confidence/basis — level presented as fact');
      }
    }
  } catch (err) {
    fail('calculateMasteryProfile with data', err.message);
  }
}

// ─── 7. Learning Paths ────────────────────────────────────────────────────────

async function testLearningPaths() {
  section('Learning Paths');

  const BASE = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian');
  const { recommendPath } = require(path.join(BASE, 'norwegianLearningPaths.js'));

  // Test with no profile
  try {
    const result = recommendPath(null);
    if (result && result.title && result.levelRange) {
      pass('recommendPath returns default path for null profile');
    } else {
      fail('recommendPath missing title/levelRange for null profile');
    }
  } catch (err) {
    fail('recommendPath handles null profile', err.message);
  }

  // Test with weak-vocabulary profile
  try {
    const result = recommendPath({
      estimatedLevel: 'estimated_A1',
      weakSpots: [{ skillArea: 'vocabulary', evidenceCount: 5, priority: 'high' }],
    });
    if (result && result.title) {
      pass(`recommendPath returns: ${result.title}`);
    } else {
      fail('recommendPath missing title for vocabulary-weak profile');
    }
  } catch (err) {
    fail('recommendPath handles vocabulary-weak profile', err.message);
  }
}

// ─── 8. Dashboard HTML Structure ─────────────────────────────────────────────

async function testDashboardStructure() {
  section('Dashboard HTML Structure');

  const DASHBOARD_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/http/renderAdminPages/norwegianDashboard.js');
  if (!existsSync(DASHBOARD_PATH)) {
    fail('norwegianDashboard.js exists', 'file missing');
    return;
  }

  const src = readFileSync(DASHBOARD_PATH, 'utf8');

  // Must reference url column (not source_id)
  if (!src.includes('media.source_id')) {
    pass('Dashboard does not use broken media.source_id field');
  } else {
    fail('Dashboard still uses media.source_id — media links broken');
  }

  if (src.includes('media.url')) {
    pass('Dashboard uses media.url for media links');
  } else {
    fail('Dashboard does not use media.url — media links will be empty');
  }

  // Must have Phase 6 review fields
  const phase6Fields = ['grade', 'next_due_at', 'review_count'];
  for (const field of phase6Fields) {
    if (src.includes(field)) {
      pass(`Dashboard renders Phase 6 field: ${field}`);
    } else {
      fail(`Dashboard missing Phase 6 field: ${field}`);
    }
  }
}

// ─── 9. Store Schema Sanity ──────────────────────────────────────────────────

async function testStoreSchemaSanity() {
  section('Store Schema Sanity');

  const STORE_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const src = readFileSync(STORE_PATH, 'utf8');

  // savePronunciationAttempt must not include word_or_phrase
  const saveAttemptFn = src.match(/savePronunciationAttempt[\s\S]*?(?=async function|\nmodule\.exports)/);
  if (saveAttemptFn) {
    if (saveAttemptFn[0].includes('word_or_phrase')) {
      fail('savePronunciationAttempt references non-existent word_or_phrase column');
    } else {
      pass('savePronunciationAttempt does not reference non-existent word_or_phrase column');
    }
  }

  // getWeakSpotSummary must query from pronunciation_attempts, not review_items
  const weakSpotFn = src.match(/getWeakSpotSummary[\s\S]*?(?=async function|\nmodule\.exports)/);
  if (weakSpotFn) {
    if (weakSpotFn[0].includes('norwegian_pronunciation_attempts')) {
      pass('getWeakSpotSummary queries from norwegian_pronunciation_attempts (correct table)');
    } else if (weakSpotFn[0].includes('norwegian_review_items')) {
      fail('getWeakSpotSummary queries norwegian_review_items for correction_focus — column does not exist in that table');
    } else {
      fail('getWeakSpotSummary does not query expected table');
    }
  } else {
    fail('getWeakSpotSummary function found in store');
  }

  // Migration SQL must be inside a template literal (no orphaned SQL)
  // Check that MIGRATION_SQL ends with backtick and no SQL follows outside it
  const migrationMatch = src.match(/const MIGRATION_SQL\s*=\s*`([\s\S]*?)`\s*;/);
  if (migrationMatch) {
    pass('MIGRATION_SQL is properly enclosed in template literal');
    // The content must not be immediately followed by ALTER TABLE outside the literal
    const afterMigration = src.slice(src.indexOf(migrationMatch[0]) + migrationMatch[0].length);
    if (/^\s*ALTER TABLE/m.test(afterMigration.slice(0, 200))) {
      fail('SQL appears outside MIGRATION_SQL template literal — SyntaxError risk');
    } else {
      pass('No orphaned SQL outside MIGRATION_SQL template literal');
    }
  } else {
    fail('MIGRATION_SQL not found or not properly enclosed in template literal');
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('[e2e-smoke] Norwegian Learning E2E Smoke Test\n');

  try {
    testModuleLoading();
    await testSourceStatusValidation();
    await testReviewEngineNoData();
    await testReviewEngineWithData();
    await testMasteryEngineNoData();
    await testMasteryNoCefrClaim();
    await testLearningPaths();
    await testDashboardStructure();
    await testStoreSchemaSanity();
  } catch (err) {
    console.error('[e2e-smoke] Unexpected error:', err.message);
    process.exitCode = 1;
    failed++;
  }

  console.log(`\n[e2e-smoke] Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('[e2e-smoke] All smoke tests passed.');
  } else {
    console.log('[e2e-smoke] SOME TESTS FAILED — see above for details.');
  }
}

main();
