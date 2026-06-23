import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:norwegian-discord-commands] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-discord-commands] FAIL ${message}`);
  process.exitCode = 1;
}

const COMMANDS_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
const COMMANDS_INDEX_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/commands/index.js');

function checkCommandFileExists() {
  if (!existsSync(COMMANDS_PATH)) {
    fail(`Norwegian commands file does not exist: ${COMMANDS_PATH}`);
    return null;
  }
  pass(`Norwegian commands file exists`);
  return readFileSync(COMMANDS_PATH, 'utf8');
}

function checkCommandsRegistered(indexSrc) {
  if (indexSrc.includes('require("./norwegian")') || indexSrc.includes("require('./norwegian')")) {
    pass('Norwegian command is imported in commands/index.js');
  } else {
    fail('Norwegian command is not imported in commands/index.js');
  }

  if (indexSrc.includes('norwegianCommand')) {
    pass('norwegianCommand variable is declared');
  } else {
    fail('norwegianCommand variable is not declared');
  }

  if (indexSrc.includes('norwegianCommand') && indexSrc.includes('return [')) {
    pass('norwegianCommand is included in loadCommands return array');
  } else {
    fail('norwegianCommand is not in loadCommands return array');
  }
}

function checkCommandStructure(commandSrc) {
  const requiredFields = [
    'data: new SlashCommandBuilder',
    'async execute(interaction)',
    'setName("norwegian")',
    'addSubcommand',
  ];

  for (const field of requiredFields) {
    if (commandSrc.includes(field)) {
      pass(`Command structure includes: ${field}`);
    } else {
      fail(`Command structure missing: ${field}`);
    }
  }
}

function checkAllSubcommands(commandSrc) {
  const subcommands = [
    'setName("on")',
    'setName("off")',
    'setName("lesson")',
    'setName("word")',
    'setName("phrase")',
    'setName("correct")',
    'setName("media")',
    'setName("news")',
    'setName("youtube")',
    'setName("quiz")',
    'setName("review")',
  ];

  for (const subcommand of subcommands) {
    if (commandSrc.includes(subcommand)) {
      pass(`Subcommand defined: ${subcommand.match(/"([^"]+)"/)[1]}`);
    } else {
      fail(`Subcommand missing: ${subcommand}`);
    }
  }
}

function checkHandlerFunctions(commandSrc) {
  const handlers = [
    'handleNorwegianOn',
    'handleNorwegianOff',
    'handleNorwegianLesson',
    'handleNorwegianWord',
    'handleNorwegianPhrase',
    'handleNorwegianCorrect',
    'handleNorwegianMedia',
    'handleNorwegianNews',
    'handleNorwegianYoutube',
    'handleNorwegianQuiz',
    'handleNorwegianReview',
  ];

  for (const handler of handlers) {
    if (commandSrc.includes(`function ${handler}`) || commandSrc.includes(`${handler}(`)) {
      pass(`Handler function defined: ${handler}`);
    } else {
      fail(`Handler function missing: ${handler}`);
    }
  }
}

function checkSourceStatusValidation(commandSrc) {
  if (commandSrc.includes('validateSourceStatus')) {
    pass('validateSourceStatus is used in command');
  } else {
    fail('validateSourceStatus is not used');
  }

  if (commandSrc.includes('sourceStatus')) {
    pass('sourceStatus is validated in handlers');
  } else {
    fail('sourceStatus validation is missing');
  }
}

function checkStoreIntegration(commandSrc) {
  const storeCalls = [
    'store.saveLesson',
    'store.saveCorrection',
    'store.saveVocabularyItem',
    'store.saveMediaLink',
    'store.saveReviewItem',
  ];

  for (const call of storeCalls) {
    if (commandSrc.includes(call)) {
      pass(`Store call found: ${call}`);
    } else {
      fail(`Store call missing: ${call}`);
    }
  }
}

function checkSafeLogging(commandSrc) {
  const logPatterns = [
    '[norwegian] command received',
    '[norwegian] lesson created',
    '[norwegian] word lookup completed',
    '[norwegian] correction created',
    '[norwegian] media search completed',
  ];

  for (const pattern of logPatterns) {
    if (commandSrc.includes(pattern)) {
      pass(`Safe log found: ${pattern}`);
    } else {
      fail(`Safe log missing: ${pattern}`);
    }
  }
}

function checkNoInvention(commandSrc) {
  const forbiddenPatterns = [
    // Don't allow comments that suggest inventing content
    /\/\/\s*[Ii]nvent/,
    /\/\/\s*[Ff]ake/,
    /\/\/\s*[Mm]ake.*[Uu]p/,
  ];

  let foundForbiddenComment = false;
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(commandSrc)) {
      fail(`Found forbidden pattern: ${pattern}`);
      foundForbiddenComment = true;
    }
  }

  if (!foundForbiddenComment) {
    pass('No comments indicating invented content');
  }
}

function checkEnsureProfile(commandSrc) {
  if (commandSrc.includes('function ensureProfile') || commandSrc.includes('async ensureProfile')) {
    pass('ensureProfile function is defined');
  } else {
    fail('ensureProfile function is missing');
  }

  if (commandSrc.includes('normalizeNorwegianSettings')) {
    pass('normalizeNorwegianSettings is used');
  } else {
    fail('normalizeNorwegianSettings is not used');
  }
}

function main() {
  try {
    const commandSrc = checkCommandFileExists();
    if (!commandSrc) return;

    const indexSrc = readFileSync(COMMANDS_INDEX_PATH, 'utf8');

    checkCommandsRegistered(indexSrc);
    checkCommandStructure(commandSrc);
    checkAllSubcommands(commandSrc);
    checkHandlerFunctions(commandSrc);
    checkSourceStatusValidation(commandSrc);
    checkStoreIntegration(commandSrc);
    checkSafeLogging(commandSrc);
    checkNoInvention(commandSrc);
    checkEnsureProfile(commandSrc);

    if (!process.exitCode) {
      console.log('[verify:norwegian-discord-commands] All checks passed.');
    }
  } catch (error) {
    console.error('[verify:norwegian-discord-commands] Unexpected error:', error.message);
    process.exit(1);
  }
}

main();
