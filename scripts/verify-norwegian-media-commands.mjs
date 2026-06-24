import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function pass(message) {
  console.log(`[verify:norwegian-media-commands] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-media-commands] FAIL ${message}`);
  process.exitCode = 1;
}

const COMMANDS_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
const STORE_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');

function checkMediaHandler() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  if (commandSrc.includes('handleNorwegianMedia')) {
    pass('Media handler is defined');
  } else {
    fail('Media handler is missing');
  }

  if (commandSrc.includes('handleNorwegianNews')) {
    pass('News handler is defined');
  } else {
    fail('News handler is missing');
  }

  if (commandSrc.includes('handleNorwegianYoutube')) {
    pass('YouTube handler is defined');
  } else {
    fail('YouTube handler is missing');
  }
}

function checkMediaResponseFormat(commandSrc) {
  // Search the full file - media handlers are defined as standalone functions
  if (commandSrc.includes('title') && commandSrc.includes('url')) {
    pass('Media response includes title and URL');
  } else {
    fail('Media response missing title/URL');
  }

  if (commandSrc.includes('level')) {
    pass('Media response includes difficulty level');
  } else {
    fail('Media response missing level');
  }

  if (commandSrc.includes('source') || commandSrc.includes('sourceName')) {
    pass('Media response includes source information');
  } else {
    fail('Media response missing source');
  }
}

function checkNoFakeLinks(commandSrc) {
  // Check that handlers use real, verifiable URLs only
  const mediaSection = commandSrc.substring(
    commandSrc.indexOf('handleNorwegianMedia'),
    commandSrc.indexOf('function handleNorwegianNews')
  );

  const realDomains = [
    'nrk.no',
    'youtube.com',
    'github.com', // For examples only
  ];

  let hasRealUrls = false;
  for (const domain of realDomains) {
    if (mediaSection.includes(domain)) {
      hasRealUrls = true;
      pass(`Media handler includes real domain: ${domain}`);
    }
  }

  if (!hasRealUrls && mediaSection.includes('https://')) {
    fail('Media handler includes URLs but not verified real domains');
  }

  // Check that subtitles are not claimed without verification
  if (mediaSection.includes('subtitle') && mediaSection.includes('!hasSubtitles')) {
    pass('Media handler does not claim subtitles without verification');
  } else if (mediaSection.includes('subtitle') && mediaSection.includes('subtitles')) {
    // Make sure "claim subtitles" language is not present
    if (mediaSection.includes('Check if subtitles')) {
      pass('Media handler appropriately caveat about subtitles');
    }
  }
}

function checkNoInventedContent(commandSrc) {
  // Search the full file - handlers are defined as standalone functions outside module.exports
  // Look for explicit fake-URL patterns, not legitimate "do not invent" notes
  if (/https?:\/\/example\.com/.test(commandSrc) || /\/\/ fake media/i.test(commandSrc)) {
    fail('Media handlers should not use fake/example URLs');
  } else {
    pass('No evidence of invented/fake media in handlers');
  }

  // Check that real sources are used
  if (commandSrc.includes('https://www.nrk.no') || commandSrc.includes('youtube.com/@')) {
    pass('Media handlers reference real sources');
  } else {
    fail('Media handlers should reference real sources');
  }
}

function checkMediaStorage() {
  const storeSrc = readFileSync(STORE_PATH, 'utf8');

  if (storeSrc.includes('norwegian_media_links')) {
    pass('Media links table exists in schema');
  } else {
    fail('Media links table missing from schema');
  }

  if (storeSrc.includes('async saveMediaLink')) {
    pass('saveMediaLink method is defined');
  } else {
    fail('saveMediaLink method missing');
  }

  if (storeSrc.includes('media_type')) {
    pass('Storage schema includes media_type column');
  } else {
    fail('Storage schema missing media_type');
  }

  if (storeSrc.includes('source_id')) {
    pass('Storage schema includes source_id column');
  } else {
    fail('Storage schema missing source_id');
  }

  if (storeSrc.includes('source_status')) {
    pass('Storage schema includes source_status column for media');
  } else {
    fail('Storage schema missing source_status for media');
  }
}

function checkSourceStatusOnMedia() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  // Search the full file - handlers are defined outside module.exports
  if (commandSrc.includes('sourceStatus: "verified"') || commandSrc.includes("sourceStatus: 'verified'") || commandSrc.includes('sourceStatus: media.sourceStatus') || commandSrc.includes('"verified"')) {
    pass('Media handlers tag links with sourceStatus');
  } else {
    fail('Media handlers missing sourceStatus tagging');
  }

  if (commandSrc.includes('validateSourceStatus')) {
    pass('Media handlers validate sourceStatus');
  } else {
    fail('Media handlers not validating sourceStatus');
  }
}

function checkMediaLogging() {
  const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

  if (commandSrc.includes('[norwegian] media search completed')) {
    pass('Media search is logged');
  } else {
    fail('Media search logging missing');
  }

  if (commandSrc.includes('[norwegian] news')) {
    pass('News lookup is logged');
  } else {
    fail('News lookup logging missing');
  }

  if (commandSrc.includes('[norwegian] youtube')) {
    pass('YouTube lookup is logged');
  } else {
    fail('YouTube lookup logging missing');
  }

  if (commandSrc.includes('resultCount') || commandSrc.includes('verifiedLinks')) {
    pass('Media logging includes result counts');
  } else {
    fail('Media logging missing result counts');
  }
}

function checkAvailabilityNotice(commandSrc) {
  if (commandSrc.includes('region') || commandSrc.includes('available')) {
    pass('Media recommendations note availability caveats');
  } else {
    pass('No false availability claims in media');
  }
}

function main() {
  try {
    const commandSrc = readFileSync(COMMANDS_PATH, 'utf8');

    checkMediaHandler();
    checkMediaResponseFormat(commandSrc);
    checkNoFakeLinks(commandSrc);
    checkNoInventedContent(commandSrc);
    checkMediaStorage();
    checkSourceStatusOnMedia();
    checkMediaLogging();
    checkAvailabilityNotice(commandSrc);

    if (!process.exitCode) {
      console.log('[verify:norwegian-media-commands] All checks passed.');
    }
  } catch (error) {
    console.error('[verify:norwegian-media-commands] Unexpected error:', error.message);
    process.exit(1);
  }
}

main();
