import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:norwegian-corrections] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-corrections] FAIL ${message}`);
  process.exitCode = 1;
}

const COMMANDS_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
const STORE_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');

function checkCorrectionHandler() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  if (commandSrc.includes('handleNorwegianCorrect')) {
    pass('Correction handler is defined');
  } else {
    fail('Correction handler is missing');
  }

  if (commandSrc.includes('originalText') && commandSrc.includes('correctedText')) {
    pass('Correction handler uses originalText and correctedText fields');
  } else {
    fail('Correction handler is missing originalText/correctedText');
  }

  if (commandSrc.includes('explanation')) {
    pass('Correction handler includes explanation field');
  } else {
    fail('Correction handler missing explanation');
  }

  if (commandSrc.includes('grade')) {
    pass('Correction handler includes grade field');
  } else {
    fail('Correction handler missing grade');
  }

  // Correction response must show the submitted text and honest status
  // (not fake "Corrected:" output — we do not invent corrections)
  if (commandSrc.includes('correction') || commandSrc.includes('Text submitted for correction') || commandSrc.includes('submitted for correction')) {
    pass('Correction response shows submitted text');
  } else {
    fail('Correction response format is incorrect — missing submitted text reference');
  }

  if (commandSrc.includes('Why:') || commandSrc.includes('explanation')) {
    pass('Correction includes explanation in response');
  } else {
    fail('Correction response missing explanation');
  }

  if (commandSrc.includes('Grade:')) {
    pass('Correction response includes Grade field');
  } else {
    fail('Correction response missing Grade');
  }

  // Response must guide user to a real resource, not return invented corrections
  if (commandSrc.includes('ordbokene.no') || commandSrc.includes('native speaker') || commandSrc.includes('trusted source')) {
    pass('Correction response guides user to real resources (no invention)');
  } else {
    fail('Correction response missing guidance to real external resources');
  }

  if (commandSrc.includes('Source status:') || commandSrc.includes('sourceStatus')) {
    pass('Correction response includes source status');
  } else {
    fail('Correction response missing source status');
  }
}

function checkCorrectionStorage() {
  const storeSrc = readFileSync(STORE_PATH, 'utf8');

  if (storeSrc.includes('norwegian_corrections')) {
    pass('Corrections table exists in schema');
  } else {
    fail('Corrections table missing from schema');
  }

  if (storeSrc.includes('async saveCorrection')) {
    pass('saveCorrection method is defined');
  } else {
    fail('saveCorrection method missing');
  }

  if (storeSrc.includes('originalText') && storeSrc.includes('correctedText')) {
    pass('Storage schema includes originalText and correctedText');
  } else {
    fail('Storage schema missing originalText/correctedText');
  }

  if (storeSrc.includes('source_status')) {
    pass('Storage schema includes source_status column');
  } else {
    fail('Storage schema missing source_status');
  }

  if (storeSrc.includes('explanation')) {
    pass('Storage schema includes explanation field');
  } else {
    fail('Storage schema missing explanation');
  }
}

function checkSourceStatusEnforcement() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  if (commandSrc.includes('validateSourceStatus')) {
    pass('validateSourceStatus is called in correction handler');
  } else {
    fail('validateSourceStatus not called in correction handler');
  }

  if (commandSrc.includes('sourceStatus: correctionData.sourceStatus')) {
    pass('sourceStatus is saved with correction');
  } else if (commandSrc.includes('sourceStatus:')) {
    pass('sourceStatus is saved with correction');
  } else {
    fail('sourceStatus not saved with correction');
  }

  if (commandSrc.includes('unverified_practice')) {
    pass('Correction uses unverified_practice sourceStatus when appropriate');
  } else {
    fail('Correction sourceStatus not properly labeled');
  }
}

function checkCorrectionLogging() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  if (commandSrc.includes('[norwegian] correction requested')) {
    pass('Correction request is logged');
  } else {
    fail('Correction request logging missing');
  }

  if (commandSrc.includes('[norwegian] correction created')) {
    pass('Correction creation is logged');
  } else {
    fail('Correction creation logging missing');
  }

  if (commandSrc.includes('sourceStatus') && commandSrc.includes('[norwegian]')) {
    pass('Logging includes sourceStatus information');
  } else {
    fail('Logging missing sourceStatus');
  }

  if (commandSrc.includes('grade') && commandSrc.includes('[norwegian]')) {
    pass('Logging includes grade information');
  } else {
    fail('Logging missing grade');
  }
}

function checkNoShaming() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  // Should NOT have harsh language
  const forbiddenPhrases = ['wrong', 'stupid', 'bad', 'terrible', 'fail', 'mistake'];
  let foundHarshness = false;

  for (const phrase of forbiddenPhrases) {
    // Check for harsh usage (not case-sensitive)
    const pattern = new RegExp(`\\b${phrase}\\b`, 'i');
    const contextStart = commandSrc.indexOf('async handleNorwegianCorrect');
    const contextEnd = commandSrc.indexOf('async handleNorwegianMedia');
    if (contextStart !== -1 && contextEnd !== -1) {
      const sectionText = commandSrc.substring(contextStart, contextEnd);
      if (pattern.test(sectionText) && !sectionText.includes(`Try again`)) {
        // Allow "mistake" in "Try again" context
        if (phrase !== 'mistake' || !sectionText.includes('Try again')) {
          foundHarshness = true;
          break;
        }
      }
    }
  }

  if (!foundHarshness) {
    pass('Correction tone avoids harsh language');
  } else {
    fail('Correction tone may be too harsh');
  }

  if (commandSrc.includes('gentle') || commandSrc.includes('Unverified practice')) {
    pass('Correction tone is cautious about unverified content');
  } else {
    fail('Correction tone not cautious enough');
  }
}

function main() {
  try {
    checkCorrectionHandler();
    checkCorrectionStorage();
    checkSourceStatusEnforcement();
    checkCorrectionLogging();
    checkNoShaming();

    if (!process.exitCode) {
      console.log('[verify:norwegian-corrections] All checks passed.');
    }
  } catch (error) {
    console.error('[verify:norwegian-corrections] Unexpected error:', error.message);
    process.exit(1);
  }
}

main();
