import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:norwegian-review-engine] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-review-engine] FAIL ${message}`);
  process.exitCode = 1;
}

const ENGINE_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianReviewEngine.js');
const COMMAND_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
const STORE_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');

function checkEngineExists(src) {
  if (!src) {
    fail('norwegianReviewEngine.js does not exist');
    return false;
  }
  pass('norwegianReviewEngine.js exists');
  return true;
}

function checkEngineExports(src) {
  const requiredExports = ['generateDailyPractice', 'analyzeWeakSpots', 'generateWeeklySummary'];
  for (const fn of requiredExports) {
    if (src.includes(fn)) {
      pass(`norwegianReviewEngine.js exports: ${fn}`);
    } else {
      fail(`norwegianReviewEngine.js missing export: ${fn}`);
    }
  }
}

function checkEngineUsesStore(src) {
  // Engine must pull from real store, not hardcode items
  if (src.includes('store.getDueReviewItems') || src.includes('store.listNorwegian')) {
    pass('norwegianReviewEngine.js queries store for real data');
  } else {
    fail('norwegianReviewEngine.js does not query store — review data may be invented');
  }
}

function checkEngineSchedule(src) {
  // Must use spaced repetition schedule
  if (src.includes('REVIEW_SCHEDULE') || src.includes('calculateNextDueDate')) {
    pass('norwegianReviewEngine.js implements spaced repetition schedule');
  } else {
    fail('norwegianReviewEngine.js missing spaced repetition schedule');
  }

  // Grade-based scheduling (A=7d, B=3d, C/D=1d, Retry=0d)
  if (src.includes('A: 7') || src.includes("'A': 7")) {
    pass('Review schedule includes A:7 days interval');
  } else {
    fail('Review schedule missing A:7 — spaced repetition incorrect');
  }
}

function checkEngineFallback(src) {
  // Must handle no-data case gracefully
  if (src.includes('Not enough data') || src.includes('starter') || src.includes('Keep practicing')) {
    pass('norwegianReviewEngine.js has graceful no-data fallback');
  } else {
    fail('norwegianReviewEngine.js missing no-data fallback — may error or invent tasks');
  }
}

function checkEngineNoInvention(src) {
  // Engine must not fabricate vocabulary or corrections
  const inventionPatterns = [
    /return \[\s*\{\s*word:/,
    /fabricated/i,
    /invented/i,
  ];
  for (const pattern of inventionPatterns) {
    if (pattern.test(src)) {
      fail(`norwegianReviewEngine.js may invent data: ${pattern}`);
    }
  }
  pass('No fabrication patterns in review engine');
}

function checkCommandWiresEngine(commandSrc) {
  const requiredImports = ['generateDailyPractice', 'analyzeWeakSpots', 'generateWeeklySummary'];
  for (const fn of requiredImports) {
    if (commandSrc.includes(fn)) {
      pass(`norwegian.js imports and uses: ${fn}`);
    } else {
      fail(`norwegian.js does not use ${fn} — review engine not wired`);
    }
  }
}

function checkCommandNewSubcommands(commandSrc) {
  const newSubcommands = ['daily', 'weakspots', 'weekly'];
  for (const sub of newSubcommands) {
    if (commandSrc.includes(`setName("${sub}")`)) {
      pass(`Subcommand defined: ${sub}`);
    } else {
      fail(`Subcommand missing: ${sub} — review engine not accessible from Discord`);
    }
  }
}

function checkStoreDueItemsQuery(storeSrc) {
  // getDueReviewItems must query next_due_at to filter overdue items
  if (storeSrc.includes('getDueReviewItems')) {
    pass('store.getDueReviewItems defined');
    if (storeSrc.includes('next_due_at') || storeSrc.includes('nextDueAt')) {
      pass('getDueReviewItems queries next_due_at for overdue filtering');
    } else {
      fail('getDueReviewItems does not filter by next_due_at — review timing broken');
    }
  } else {
    fail('getDueReviewItems not found in store');
  }
}

function checkStoreWeakSpotQuery(storeSrc) {
  if (storeSrc.includes('getWeakSpotSummary')) {
    pass('store.getWeakSpotSummary defined');
    // Must query from pronunciation_attempts (not review_items which doesn't have correction_focus)
    const fnMatch = storeSrc.match(/getWeakSpotSummary[\s\S]*?(?=async function|\nmodule\.exports)/);
    if (fnMatch) {
      const fnSrc = fnMatch[0];
      if (fnSrc.includes('norwegian_pronunciation_attempts')) {
        pass('getWeakSpotSummary queries correct table (norwegian_pronunciation_attempts)');
      } else if (fnSrc.includes('norwegian_review_items')) {
        fail('getWeakSpotSummary queries norwegian_review_items for correction_focus — column does not exist there');
      } else {
        fail('getWeakSpotSummary does not query expected table');
      }
    }
  } else {
    fail('getWeakSpotSummary not found in store');
  }
}

function main() {
  if (!existsSync(ENGINE_PATH)) {
    fail('norwegianReviewEngine.js does not exist');
    return;
  }
  if (!existsSync(COMMAND_PATH)) {
    fail('norwegian.js does not exist');
    return;
  }
  if (!existsSync(STORE_PATH)) {
    fail('norwegianLearningStore.js does not exist');
    return;
  }

  const engineSrc = readFileSync(ENGINE_PATH, 'utf8');
  const commandSrc = readFileSync(COMMAND_PATH, 'utf8');
  const storeSrc = readFileSync(STORE_PATH, 'utf8');

  pass('All required files found');

  checkEngineExists(engineSrc);
  checkEngineExports(engineSrc);
  checkEngineUsesStore(engineSrc);
  checkEngineSchedule(engineSrc);
  checkEngineFallback(engineSrc);
  checkEngineNoInvention(engineSrc);
  checkCommandWiresEngine(commandSrc);
  checkCommandNewSubcommands(commandSrc);
  checkStoreDueItemsQuery(storeSrc);
  checkStoreWeakSpotQuery(storeSrc);

  if (!process.exitCode) {
    console.log('[verify:norwegian-review-engine] All checks passed.');
  }
}

main();
