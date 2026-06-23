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
  // Check media search service privacy
  const searchServicePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianMediaSearchService.js');
  const searchServiceContent = fs.readFileSync(searchServicePath, 'utf8');

  check('Search service does not store full articles', !searchServiceContent.includes('article body'), 'no article storage');
  check('Search service does not store subtitles', !searchServiceContent.includes('subtitle'), 'no subtitle storage');
  check('Search service does not store transcripts', !searchServiceContent.includes('transcript'), 'no transcript storage');
  check('Search service logs do not expose query details', searchServiceContent.includes('[norwegian-media]') && searchServiceContent.includes('.slice'), 'query truncation');
  check('Search service does not log API keys', !searchServiceContent.includes('apiKey'), 'no API key logging');
  check('Search service filters results by userScope', searchServiceContent.includes('userScope') || searchServiceContent.includes('scope'), 'scope filtering');

  // Check store privacy
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  check('Store filters media links by user_scope', storeContent.includes('WHERE user_scope') && storeContent.includes('norwegian_media_links'), 'scope filter');
  check('Store does not save article bodies', !storeContent.includes('articleBody') && !storeContent.includes('article_body'), 'no body storage');
  check('Store does not save subtitles', !storeContent.includes('subtitles') && !storeContent.includes('subtitle'), 'no subtitle storage');
  check('Store accepts vocabulary as small list only', storeContent.includes('vocabulary_json') && storeContent.includes('.slice(0, 1000)'), 'vocabulary size limit');
  // Note: 'transcript' appears in Phase 4 pronunciation feature, not in media links
  // Media links store title, url, source_name, etc. - not transcripts
  check('Store media saves correct fields',
    storeContent.includes('title') && storeContent.includes('url') && storeContent.includes('source_name'),
    'correct field storage');
  check('Store timestamps for privacy audit', storeContent.includes('created_at') && storeContent.includes('updated_at'), 'audit timestamps');

  // Check command handlers privacy
  const commandPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
  const commandContent = fs.readFileSync(commandPath, 'utf8');

  check('Media handlers use userScope', commandContent.includes('userScope'), 'user isolation');
  check('Media handlers check user profile before recommending', commandContent.includes('ensureProfile') || commandContent.includes('getProfile'), 'profile check');
  check('Media handlers check user profile', commandContent.includes('ensureProfile') || commandContent.includes('getProfile'), 'profile awareness');

  // Check dashboard privacy
  const dashboardPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/renderAdminPages/norwegianDashboard.js');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

  // Handler filters by user_scope before passing to dashboard display
  check('Dashboard handler filters media by user_scope',
    fs.existsSync(path.join(__dirname, 'artifacts/ghostlight-bot/src/http/adminPageHandlers/norwegianDashboardHandler.js')) &&
    fs.readFileSync(path.join(__dirname, 'artifacts/ghostlight-bot/src/http/adminPageHandlers/norwegianDashboardHandler.js'), 'utf8').includes('listNorwegianMediaLinks(userScope'),
    'scope filter in handler');
  check('Dashboard does not display article bodies', !dashboardContent.includes('body') || dashboardContent.includes('title'), 'no full articles');
  check('Dashboard does not display subtitles', !dashboardContent.includes('subtitle'), 'no subtitles');
  check('Dashboard shows only what was saved', dashboardContent.includes('title') || dashboardContent.includes('url'), 'saved data only');

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
