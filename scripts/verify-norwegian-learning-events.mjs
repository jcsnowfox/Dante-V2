import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:norwegian-learning-events] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-learning-events] FAIL ${message}`);
  process.exitCode = 1;
}

const COMMANDS_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
const STORE_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');

function checkAllEventTypes() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  const eventTypes = [
    { name: 'lesson', save: 'saveLesson' },
    { name: 'correction', save: 'saveCorrection' },
    { name: 'word', save: 'saveVocabularyItem' },
    { name: 'media', save: 'saveMediaLink' },
    { name: 'review', save: 'saveReviewItem' },
  ];

  for (const event of eventTypes) {
    if (commandSrc.includes(`store.${event.save}`)) {
      pass(`${event.name} events are saved to store`);
    } else {
      fail(`${event.name} events not saved to store`);
    }
  }
}

function checkSourceStatusOnAllEvents() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  // Check that all save calls include sourceStatus
  const saveCalls = [
    'saveLesson',
    'saveCorrection',
    'saveVocabularyItem',
    'saveMediaLink',
    'saveReviewItem',
  ];

  for (const save of saveCalls) {
    // Find the specific save call and check if sourceStatus is included
    const pattern = new RegExp(`${save}\\([\\s\\S]*?sourceStatus`, 'g');
    if (pattern.test(commandSrc)) {
      pass(`${save} includes sourceStatus`);
    } else {
      fail(`${save} missing sourceStatus`);
    }
  }
}

function checkUserScopeHandling() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  if (commandSrc.includes('getUserScope')) {
    pass('Helper function to get userScope is defined');
  } else {
    fail('getUserScope helper missing');
  }

  if (commandSrc.includes('userScope') && commandSrc.includes('normalizeUserScope')) {
    pass('userScope is properly normalized');
  } else if (commandSrc.includes('userScope')) {
    pass('userScope is handled in event saves');
  } else {
    fail('userScope handling missing');
  }
}

function checkProfileLoading() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  if (commandSrc.includes('ensureProfile')) {
    pass('ensureProfile is called before operations');
  } else {
    fail('ensureProfile not called');
  }

  if (commandSrc.includes('store.getProfile') || commandSrc.includes('getProfile')) {
    pass('Profile is loaded from store');
  } else {
    fail('Profile loading missing');
  }

  if (commandSrc.includes('store.saveProfile') || commandSrc.includes('saveProfile')) {
    pass('Profile is saved to store');
  } else {
    fail('Profile saving missing');
  }
}

function checkEventStructure() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');
  const storeSrc = readFileSync(STORE_PATH, 'utf8');

  // Check that events include required fields
  if (commandSrc.includes('userScope') && storeSrc.includes('user_scope')) {
    pass('Events include user_scope');
  } else {
    fail('Events missing user_scope');
  }

  if (commandSrc.includes('sourceStatus') && storeSrc.includes('source_status')) {
    pass('Events include sourceStatus/source_status');
  } else {
    fail('Events missing sourceStatus');
  }

  if (commandSrc.includes('topic') || commandSrc.includes('word') || commandSrc.includes('title')) {
    pass('Events include content identifiers');
  } else {
    fail('Events missing content identifiers');
  }
}

function checkLoggingCoverage() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  const expectedLogs = [
    '[norwegian] command received',
    '[norwegian] lesson created',
    '[norwegian] word lookup completed',
    '[norwegian] correction created',
    '[norwegian] media search completed',
    '[norwegian] review created',
    '[norwegian] phrase lookup completed',
    '[norwegian] news article suggested',
    '[norwegian] youtube video suggested',
  ];

  let logCount = 0;
  for (const log of expectedLogs) {
    if (commandSrc.includes(log)) {
      logCount++;
      pass(`Log entry: ${log}`);
    }
  }

  if (logCount >= 7) {
    pass(`Good logging coverage: ${logCount}/${expectedLogs.length}`);
  } else {
    fail(`Low logging coverage: ${logCount}/${expectedLogs.length}`);
  }
}

function checkErrorHandling() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  if (commandSrc.includes('try') && commandSrc.includes('catch')) {
    pass('Error handling is present');
  } else {
    fail('Error handling missing');
  }

  if (commandSrc.includes('logger.warn') || commandSrc.includes('logger.error')) {
    pass('Errors are logged');
  } else {
    fail('Error logging missing');
  }

  if (commandSrc.includes('interaction.editReply') || commandSrc.includes('interaction.reply')) {
    pass('User is notified on errors');
  } else {
    fail('Error notification missing');
  }
}

function checkStoreAvailability() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  if (commandSrc.includes('store.available')) {
    pass('Store availability is checked');
  } else {
    fail('Store availability check missing');
  }

  if (commandSrc.includes('Database not configured')) {
    pass('Graceful degradation when store unavailable');
  } else {
    fail('No graceful degradation');
  }
}

function checkDatabaseSchema() {
  const storeSrc = readFileSync(STORE_PATH, 'utf8');

  const requiredTables = [
    'norwegian_lessons',
    'norwegian_corrections',
    'norwegian_vocabulary',
    'norwegian_media_links',
    'norwegian_review_items',
  ];

  for (const table of requiredTables) {
    if (storeSrc.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      pass(`Table schema exists: ${table}`);
    } else {
      fail(`Table schema missing: ${table}`);
    }
  }
}

function main() {
  try {
    checkAllEventTypes();
    checkSourceStatusOnAllEvents();
    checkUserScopeHandling();
    checkProfileLoading();
    checkEventStructure();
    checkLoggingCoverage();
    checkErrorHandling();
    checkStoreAvailability();
    checkDatabaseSchema();

    if (!process.exitCode) {
      console.log('[verify:norwegian-learning-events] All checks passed.');
    }
  } catch (error) {
    console.error('[verify:norwegian-learning-events] Unexpected error:', error.message);
    process.exit(1);
  }
}

main();
