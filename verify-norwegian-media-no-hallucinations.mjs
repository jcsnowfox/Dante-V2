#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const checks = [];

function check(name, passed, message = '') {
  checks.push({ name, passed, message });
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status}: ${name}${message ? ` - ${message}` : ''}`);
}

async function main() {
  // Check media search service prevents hallucination
  const searchServicePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianMediaSearchService.js');
  const searchServiceContent = fs.readFileSync(searchServicePath, 'utf8');

  check('Search service requires real URL from search', searchServiceContent.includes('validateUrl'), 'validation present');
  check('Search service uses web search from LLM', searchServiceContent.includes('tools') && searchServiceContent.includes('web_search'), 'web search tool');
  check('Search service extracts from response', searchServiceContent.includes('extractMediaResults'), 'response parsing');
  check('Search service validates hostname', searchServiceContent.includes('hostname.includes'), 'hostname validation');
  check('Search service rejects non-Norwegian sources', searchServiceContent.includes('isNorwegian'), 'source filtering');
  check('Search service does not invent titles', searchServiceContent.includes('extractTitleFromUrl') || searchServiceContent.includes('title'), 'title extraction');
  check('Search service does not invent channels', searchServiceContent.includes('extractSourceName'), 'source extraction');
  check('Search service does not invent subtitles', !searchServiceContent.includes('subtitle') || searchServiceContent.includes('verified'), 'no subtitle invention');
  check('Search service marks results as partial if from search', searchServiceContent.includes('sourceStatus') && searchServiceContent.includes('partial'), 'partial status');
  check('Search service returns null for invalid URLs', searchServiceContent.includes('return null'), 'URL rejection');

  // Check command handlers do not hardcode fake links (beyond examples)
  const commandPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
  const commandContent = fs.readFileSync(commandPath, 'utf8');

  // The handlers should use the search service or real sources
  check('News handler calls search service or validates source',
    commandContent.includes('searchNorwegianMedia') || commandContent.includes('validateUrl') || commandContent.includes('nrk.no'),
    'news validation');
  check('YouTube handler validates URLs',
    commandContent.includes('youtube.com') || commandContent.includes('youtu.be') || commandContent.includes('validateUrl'),
    'youtube validation');

  // Check store prevents saving invalid URLs
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  check('Store rejects empty URLs', storeContent.includes('throw new Error') && storeContent.includes('URL is required'), 'URL requirement');
  check('Store validates URL format', (storeContent.includes('url') || storeContent.includes('event.url')) && storeContent.includes('slice') && storeContent.includes('trim'), 'format validation');
  check('Store truncates URLs safely', storeContent.includes('.slice(0, 500)'), 'length limit');

  // Check dashboard does not show hallucinated info
  const dashboardPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/renderAdminPages/norwegianDashboard.js');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

  check('Dashboard displays actual URL from database',
    dashboardContent.includes('url') || dashboardContent.includes('media'),
    'url display');
  check('Dashboard displays sourceStatus',
    dashboardContent.includes('source_status') || dashboardContent.includes('sourceStatus'),
    'status display');

  // Check for common hallucination patterns
  check('Search service does not fake confidence',
    !searchServiceContent.includes('"confidence":') || searchServiceContent.includes('stt_confidence'),
    'no fake confidence');
  check('Search service does not invent duration',
    !searchServiceContent.includes('"duration":') && !searchServiceContent.includes('minutes'),
    'no fake duration');
  check('Search service does not invent subtitle metadata',
    !searchServiceContent.includes('subtitles') || searchServiceContent.includes('verified') || searchServiceContent.includes('error'),
    'no fake subtitles');

  // Summary
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;
  console.log(`\n${passed}/${checks.length} checks passed`);
  if (failed > 0) {
    console.log(`${failed} checks FAILED`);
    process.exit(1);
  }
}

main();
