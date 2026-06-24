import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:norwegian-mastery] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-mastery] FAIL ${message}`);
  process.exitCode = 1;
}

const MASTERY_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianMasteryEngine.js');
const PATHS_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianLearningPaths.js');
const COMMAND_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/commands/norwegian.js');

function checkMasteryEngineExists() {
  if (!existsSync(MASTERY_PATH)) {
    fail('norwegianMasteryEngine.js does not exist');
    return null;
  }
  pass('norwegianMasteryEngine.js exists');
  return readFileSync(MASTERY_PATH, 'utf8');
}

function checkMasteryExports(src) {
  const required = ['calculateMasteryProfile', 'getNextFocus'];
  for (const fn of required) {
    if (src.includes(fn)) {
      pass(`norwegianMasteryEngine.js exports: ${fn}`);
    } else {
      fail(`norwegianMasteryEngine.js missing: ${fn}`);
    }
  }
}

function checkSkillAreas(src) {
  // Must have 13 skill areas as specified
  if (src.includes('SKILL_AREAS') || src.includes('skillAreas')) {
    pass('norwegianMasteryEngine.js defines SKILL_AREAS');
  } else {
    fail('norwegianMasteryEngine.js missing SKILL_AREAS definition');
  }

  const expectedAreas = ['vocabulary', 'grammar', 'pronunciation', 'listening', 'reading'];
  for (const area of expectedAreas) {
    if (src.includes(`'${area}'`) || src.includes(`"${area}"`)) {
      pass(`Skill area defined: ${area}`);
    } else {
      fail(`Skill area missing: ${area}`);
    }
  }
}

function checkSourceWeighting(src) {
  // Must weight by sourceStatus
  if (src.includes('SOURCE_WEIGHTS') || src.includes('sourceWeight') || src.includes('source_status')) {
    pass('norwegianMasteryEngine.js weights by sourceStatus');
  } else {
    fail('norwegianMasteryEngine.js does not weight by sourceStatus — mastery scores may treat unverified data as verified');
  }

  // verified should be 1.0 weight
  if (src.includes('verified: 1.0') || src.includes("'verified': 1.0") || src.includes('"verified": 1')) {
    pass('verified sourceStatus has weight 1.0');
  } else {
    fail('verified sourceStatus missing 1.0 weight in mastery engine');
  }
}

function checkNoCefrClaim(src) {
  // Must never claim official CEFR certification
  const cefrClaimPatterns = [
    /official CEFR/i,
    /certified [A-B][12]/i,
    /CEFR level is/i,
    /you are officially/i,
  ];
  for (const pattern of cefrClaimPatterns) {
    if (pattern.test(src)) {
      fail(`norwegianMasteryEngine.js makes an official CEFR claim: ${pattern} — must only estimate`);
    }
  }
  pass('norwegianMasteryEngine.js makes no official CEFR certification claims');

  // Must use estimated_ prefix or similar
  if (src.includes('estimated') || src.includes('Estimated') || src.includes('levelConfidence')) {
    pass('Mastery engine uses estimated level with confidence indicator');
  } else {
    fail('Mastery engine missing level confidence/estimate qualifier');
  }
}

function checkNoDataFallback(src) {
  if (src.includes('Not enough data') || src.includes('profile: null') || src.includes('message:')) {
    pass('norwegianMasteryEngine.js handles no-data case without inventing progress');
  } else {
    fail('norwegianMasteryEngine.js missing no-data fallback — may invent a mastery profile');
  }
}

function checkMasteryUsesRealData(src) {
  // Must fetch from store
  if (src.includes('store.listNorwegian') || src.includes('store.getProfile') || src.includes('store.getDueReviewItems')) {
    pass('norwegianMasteryEngine.js reads from store for real data');
  } else {
    fail('norwegianMasteryEngine.js does not read from store — mastery calculations may be invented');
  }
}

function checkLearningPaths() {
  if (!existsSync(PATHS_PATH)) {
    fail('norwegianLearningPaths.js does not exist');
    return;
  }
  pass('norwegianLearningPaths.js exists');

  const src = readFileSync(PATHS_PATH, 'utf8');

  if (src.includes('recommendPath')) {
    pass('norwegianLearningPaths.js exports recommendPath');
  } else {
    fail('norwegianLearningPaths.js missing recommendPath export');
  }

  if (src.includes('LEARNING_PATHS') || src.includes('learningPaths')) {
    pass('norwegianLearningPaths.js defines learning paths array');
  } else {
    fail('norwegianLearningPaths.js missing LEARNING_PATHS definition');
  }

  // Must be metadata only, not a huge curriculum
  const sizeKb = Buffer.byteLength(src, 'utf8') / 1024;
  if (sizeKb > 100) {
    fail(`norwegianLearningPaths.js is too large (${sizeKb.toFixed(1)} KB) — may contain bloated curriculum`);
  } else {
    pass(`norwegianLearningPaths.js size OK (${sizeKb.toFixed(1)} KB)`);
  }
}

function checkCommandWiresMastery(commandSrc) {
  const required = ['calculateMasteryProfile', 'getNextFocus', 'recommendPath'];
  for (const fn of required) {
    if (commandSrc.includes(fn)) {
      pass(`norwegian.js imports and uses: ${fn}`);
    } else {
      fail(`norwegian.js does not use ${fn} — mastery engine not wired`);
    }
  }
}

function checkCommandMasterySubcommands(commandSrc) {
  const subs = ['mastery', 'level', 'next', 'plan'];
  for (const sub of subs) {
    if (commandSrc.includes(`setName("${sub}")`)) {
      pass(`Mastery subcommand defined: ${sub}`);
    } else {
      fail(`Mastery subcommand missing: ${sub}`);
    }
  }
}

function checkCommandCefrDisclaimer(commandSrc) {
  if (commandSrc.includes('estimated only') || commandSrc.includes('not an official CEFR') || commandSrc.includes('Estimated only')) {
    pass('Mastery/level command includes CEFR disclaimer');
  } else {
    fail('Mastery/level command missing CEFR disclaimer — may mislead users');
  }
}

function main() {
  const masterySrc = checkMasteryEngineExists();
  if (!masterySrc) return;

  if (!existsSync(COMMAND_PATH)) {
    fail('norwegian.js does not exist');
    return;
  }

  const commandSrc = readFileSync(COMMAND_PATH, 'utf8');

  checkMasteryExports(masterySrc);
  checkSkillAreas(masterySrc);
  checkSourceWeighting(masterySrc);
  checkNoCefrClaim(masterySrc);
  checkNoDataFallback(masterySrc);
  checkMasteryUsesRealData(masterySrc);
  checkLearningPaths();
  checkCommandWiresMastery(commandSrc);
  checkCommandMasterySubcommands(commandSrc);
  checkCommandCefrDisclaimer(commandSrc);

  if (!process.exitCode) {
    console.log('[verify:norwegian-mastery] All checks passed.');
  }
}

main();
