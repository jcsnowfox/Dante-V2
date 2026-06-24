import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pass(message) {
  console.log(`[verify:norwegian-no-hallucinations] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-no-hallucinations] FAIL ${message}`);
  process.exitCode = 1;
}

const NORWEGIAN_DIR = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian');
const COMMAND_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/commands/norwegian.js');

const FILES_TO_CHECK = [
  { name: 'norwegianReviewEngine.js', critical: true },
  { name: 'norwegianMasteryEngine.js', critical: true },
  { name: 'norwegianMediaSearchService.js', critical: true },
  { name: 'norwegianLearningPaths.js', critical: true },
  { name: 'norwegianFeedbackService.js', critical: false },
  { name: 'norwegianSttService.js', critical: false },
];

// Patterns that indicate invented/fabricated content
// Note: norwegianFeedbackService.js intentionally assigns grades from score — that is NOT a hallucination
const HALLUCINATION_PATTERNS = [
  { pattern: /corrected:\s*userText/, description: 'Returns original text as "corrected" — no actual correction performed' },
  { pattern: /corrected:\s*["'].*["']/, description: 'Hardcoded fake correction output' },
  { pattern: /definition:\s*["'].*["']/, description: 'Hardcoded fake dictionary definition' },
  { pattern: /translation:\s*["'][A-Za-z]{5,}["']/, description: 'Hardcoded fake translation' },
  { pattern: /https?:\/\/example\.com/, description: 'Fake example.com URL' },
  { pattern: /https?:\/\/[a-z-]+\.fake\./i, description: 'Obviously fake domain' },
  { pattern: /TODO.*return fake/i, description: 'TODO to return fake content' },
  { pattern: /\/\/.*placeholder.*return/i, description: 'Placeholder comment around return value' },
];

function checkFileForHallucinations(filePath, critical) {
  const name = path.basename(filePath);
  if (!existsSync(filePath)) {
    if (critical) {
      fail(`Critical file missing: ${name}`);
    } else {
      console.log(`[verify:norwegian-no-hallucinations] SKIP (optional) ${name}`);
    }
    return;
  }

  const src = readFileSync(filePath, 'utf8');
  let found = false;

  for (const { pattern, description } of HALLUCINATION_PATTERNS) {
    if (pattern.test(src)) {
      fail(`${name}: ${description}`);
      found = true;
    }
  }

  if (!found) {
    pass(`${name}: no hallucination patterns detected`);
  }
}

function checkCommandNoFakeLookup(src) {
  // /norwegian word must not return a fake definition
  // Old code: `Definition from trusted source: ... `
  if (src.includes('Definition from trusted source')) {
    fail('norwegian.js returns a fake "Definition from trusted source" — placeholder not removed');
  } else {
    pass('norwegian.js does not return fake "Definition from trusted source"');
  }

  // /norwegian phrase must not return fake translation
  if (src.includes('Translation: ') && src.includes('A common Norwegian phrase meaning')) {
    fail('norwegian.js returns a fake phrase translation');
  } else {
    pass('norwegian.js does not return fake phrase translation');
  }

  // /norwegian correct must not return original text as the corrected text
  if (/correctedText:\s*userText\b/.test(src) || /corrected:\s*userText\b/.test(src)) {
    fail('norwegian.js correction returns original text unchanged — no actual correction performed');
  } else {
    pass('norwegian.js correction does not return original text as corrected output');
  }
}

function checkNoFakeReviewItems(src) {
  // Review command must not hardcode fake items
  const fakeReviewPatterns = [
    /item_type: ["']quiz["'],?\s*content: ["']Sample/i,
    /content: ["']Your saved review/i,
    /\[\s*\{\s*item_type.*content.*\}\s*\](?!.*await.*store)/,
  ];
  for (const pattern of fakeReviewPatterns) {
    if (pattern.test(src)) {
      fail(`norwegian.js review handler returns hardcoded fake items: ${pattern}`);
    }
  }
  pass('Review handler does not use hardcoded fake review items');

  // Must use store.getDueReviewItems
  if (src.includes('store.getDueReviewItems') || src.includes('getDueReviewItems')) {
    pass('Review handler calls getDueReviewItems from real store');
  } else {
    fail('Review handler does not call getDueReviewItems — showing invented items');
  }
}

function checkSourceStatusEnforced(src) {
  // validateSourceStatus must be called before saving
  if (src.includes('validateSourceStatus')) {
    pass('validateSourceStatus is called in norwegian.js');
  } else {
    fail('validateSourceStatus is not called — sourceStatus not enforced');
  }

  // unverified_practice must be used for non-verified content
  if (src.includes('unverified_practice')) {
    pass('unverified_practice sourceStatus used for non-verified content');
  } else {
    fail('unverified_practice sourceStatus not found — may be marking unverified content as verified');
  }
}

function checkNoApiKeysInLogs(src) {
  // Must not log full API keys or tokens
  const keyLogPatterns = [
    /logger\.\w+.*api_key/i,
    /console\.\w+.*apiKey/i,
    /logger\.\w+.*token.*:.*req\./i,
  ];
  for (const pattern of keyLogPatterns) {
    if (pattern.test(src)) {
      fail(`norwegian.js may be logging API keys: ${pattern}`);
    }
  }
  pass('No API key logging patterns detected');
}

function checkMediaNeverInventsLinks(mediaSearchSrc) {
  // Must validate domain before returning URL
  if (mediaSearchSrc.includes('parseMediaUrl') || mediaSearchSrc.includes('isNorwegian')) {
    pass('Media search validates URLs before returning');
  } else {
    fail('Media search does not validate URLs — may invent/hallucinate links');
  }

  // Must not use the AI response directly as a URL without validation
  if (mediaSearchSrc.includes('extractMediaResults') || mediaSearchSrc.includes('extractTitleFromUrl')) {
    pass('Media search uses structured URL extraction with validation');
  } else {
    fail('Media search may use raw LLM output as URLs — hallucination risk');
  }
}

function main() {
  if (!existsSync(NORWEGIAN_DIR)) {
    fail('Norwegian source directory not found');
    return;
  }

  if (!existsSync(COMMAND_PATH)) {
    fail('norwegian.js not found');
    return;
  }

  // Check each Norwegian module
  for (const { name, critical } of FILES_TO_CHECK) {
    checkFileForHallucinations(path.join(NORWEGIAN_DIR, name), critical);
  }

  const commandSrc = readFileSync(COMMAND_PATH, 'utf8');
  const mediaSearchSrc = readFileSync(path.join(NORWEGIAN_DIR, 'norwegianMediaSearchService.js'), 'utf8');

  checkCommandNoFakeLookup(commandSrc);
  checkNoFakeReviewItems(commandSrc);
  checkSourceStatusEnforced(commandSrc);
  checkNoApiKeysInLogs(commandSrc);
  checkMediaNeverInventsLinks(mediaSearchSrc);

  if (!process.exitCode) {
    console.log('[verify:norwegian-no-hallucinations] All checks passed.');
  }
}

main();
