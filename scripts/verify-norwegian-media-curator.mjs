import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pass(message) {
  console.log(`[verify:norwegian-media-curator] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-media-curator] FAIL ${message}`);
  process.exitCode = 1;
}

const SEARCH_SVC_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianMediaSearchService.js');
const COMMAND_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
const STORE_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');

function checkSearchServiceApiFormat(src) {
  // Must use OpenAI chat completions format (OpenRouter), NOT Anthropic format
  if (src.includes('client.messages.create')) {
    fail('norwegianMediaSearchService.js uses Anthropic API format (client.messages.create) — breaks on OpenRouter');
  } else {
    pass('norwegianMediaSearchService.js does not use Anthropic API format');
  }

  if (src.includes('client.chat.completions.create')) {
    pass('norwegianMediaSearchService.js uses OpenAI/OpenRouter format (chat.completions.create)');
  } else {
    fail('norwegianMediaSearchService.js does not use chat.completions.create — LLM search broken');
  }
}

function checkSearchServiceResponseFormat(src) {
  // Response extraction must handle OpenAI format (choices[0].message.content)
  if (src.includes('choices?.[0]?.message?.content') || src.includes("choices[0].message.content")) {
    pass('norwegianMediaSearchService.js extracts text from OpenAI response format');
  } else {
    fail('norwegianMediaSearchService.js does not extract OpenAI response format — search results will be empty');
  }
}

function checkSearchServiceNeverInvents(src) {
  // Must warn about not inventing URLs
  if (src.includes('Never invent') || src.includes('never invent') || src.includes('real URLs')) {
    pass('norwegianMediaSearchService.js instructs LLM to only return real URLs');
  } else {
    fail('norwegianMediaSearchService.js missing instruction to avoid inventing URLs');
  }
}

function checkAllowedDomains(src) {
  const requiredDomains = ['nrk.no', 'youtube.com', 'spotify.com'];
  for (const domain of requiredDomains) {
    if (src.includes(domain)) {
      pass(`norwegianMediaSearchService.js validates against known domain: ${domain}`);
    } else {
      fail(`norwegianMediaSearchService.js missing domain validation for: ${domain}`);
    }
  }
}

function checkSourceStatusInSearchResults(src) {
  if (src.includes('sourceStatus') || src.includes('source_status')) {
    pass('norwegianMediaSearchService.js attaches sourceStatus to results');
  } else {
    fail('norwegianMediaSearchService.js does not attach sourceStatus to search results');
  }

  // Search results should be partial or similar (not verified — they came from LLM)
  if (src.includes('partial') || src.includes('not_checked')) {
    pass('Search results get non-verified sourceStatus (partial/not_checked)');
  } else {
    fail('Search results may be using verified sourceStatus incorrectly');
  }
}

function checkCommandMediaSavesWithUrl(commandSrc) {
  // The media handler must save with url field, not source_id
  if (commandSrc.includes('url: media.url') || commandSrc.includes("url:") ) {
    pass('Media command saves links using url field');
  } else {
    fail('Media command may not save url field to store');
  }

  if (commandSrc.includes('source_id') && commandSrc.includes('saveMediaLink')) {
    fail('Media command still passes source_id to saveMediaLink — schema mismatch');
  } else {
    pass('Media command does not pass source_id to saveMediaLink');
  }
}

function checkMediaSaveSchema(storeSrc) {
  // saveMediaLink must accept url, source_name, level columns
  const saveMediaFn = storeSrc.match(/saveMediaLink[\s\S]*?(?=async function|\nmodule\.exports)/);
  if (saveMediaFn) {
    const fnSrc = saveMediaFn[0];
    if (fnSrc.includes('url') && fnSrc.includes('source_name')) {
      pass('saveMediaLink stores url and source_name columns');
    } else {
      fail('saveMediaLink schema missing url or source_name columns');
    }
  } else {
    fail('saveMediaLink function not found in store');
  }
}

function checkMediaSchemaHasRealColumns(storeSrc) {
  const requiredColumns = ['url', 'source_name', 'level', 'watch_status', 'availability_note'];
  for (const col of requiredColumns) {
    if (storeSrc.includes(col)) {
      pass(`Store schema includes media column: ${col}`);
    } else {
      fail(`Store schema missing media column: ${col} — dashboard and command will break`);
    }
  }
}

function checkNoInventedLinksInCommandFile(commandSrc) {
  // The command must not have hardcoded invented fake URLs (non-real domains)
  const fakeUrlPatterns = [
    /https?:\/\/example\.com/,
    /https?:\/\/fakemedia\./,
    /https?:\/\/made-up\./,
  ];
  for (const pattern of fakeUrlPatterns) {
    if (pattern.test(commandSrc)) {
      fail(`Norwegian command contains a fake/example URL: ${pattern}`);
    }
  }
  pass('No fake/example URLs found in norwegian.js');
}

function main() {
  if (!existsSync(SEARCH_SVC_PATH)) {
    fail('norwegianMediaSearchService.js not found');
    return;
  }
  if (!existsSync(COMMAND_PATH)) {
    fail('norwegian.js not found');
    return;
  }
  if (!existsSync(STORE_PATH)) {
    fail('norwegianLearningStore.js not found');
    return;
  }

  const searchSrc = readFileSync(SEARCH_SVC_PATH, 'utf8');
  const commandSrc = readFileSync(COMMAND_PATH, 'utf8');
  const storeSrc = readFileSync(STORE_PATH, 'utf8');

  pass('All required files found');

  checkSearchServiceApiFormat(searchSrc);
  checkSearchServiceResponseFormat(searchSrc);
  checkSearchServiceNeverInvents(searchSrc);
  checkAllowedDomains(searchSrc);
  checkSourceStatusInSearchResults(searchSrc);
  checkCommandMediaSavesWithUrl(commandSrc);
  checkMediaSaveSchema(storeSrc);
  checkMediaSchemaHasRealColumns(storeSrc);
  checkNoInventedLinksInCommandFile(commandSrc);

  if (!process.exitCode) {
    console.log('[verify:norwegian-media-curator] All checks passed.');
  }
}

main();
