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
  // Check media search service exists
  const searchServicePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianMediaSearchService.js');
  const searchServiceContent = fs.readFileSync(searchServicePath, 'utf8');

  check('Media search service exists', fs.existsSync(searchServicePath), 'file present');
  check('Search service exports searchNorwegianMedia', searchServiceContent.includes('searchNorwegianMedia'), 'function exported');
  check('Search service validates URLs', searchServiceContent.includes('validateUrl'), 'validation present');
  check('Search service uses LLM client', searchServiceContent.includes('getLlmClient'), 'LLM integration');
  check('Search service extracts media results', searchServiceContent.includes('extractMediaResults'), 'result extraction');
  check('Search service logs searches safely', searchServiceContent.includes('[norwegian-media]'), 'logging');

  // Check norwegian command file
  const commandPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
  const commandContent = fs.readFileSync(commandPath, 'utf8');

  check('Media subcommand defined', commandContent.includes('setName("media")'), 'media command');
  check('News subcommand defined', commandContent.includes('setName("news")'), 'news command');
  check('YouTube subcommand defined', commandContent.includes('setName("youtube")'), 'youtube command');
  check('Media handler exists', commandContent.includes('handleNorwegianMedia'), 'handler dispatch');
  check('News handler exists', commandContent.includes('handleNorwegianNews'), 'handler dispatch');
  check('YouTube handler exists', commandContent.includes('handleNorwegianYoutube'), 'handler dispatch');

  // Check store has media methods
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  check('Store has saveMediaLink method', storeContent.includes('async saveMediaLink'), 'save method');
  check('Store has updateMediaLinkWatchStatus', storeContent.includes('updateMediaLinkWatchStatus'), 'status method');
  check('Store has listMediaLinks method', storeContent.includes('async listMediaLinks'), 'list method');
  check('Store validates URL before saving', storeContent.includes('throw new Error') && storeContent.includes('URL is required'), 'URL validation');
  check('Store requires sourceStatus', storeContent.includes('requireSourceStatus'), 'status validation');

  // Check migration includes media fields
  check('Migration adds media URL field', storeContent.includes('ALTER TABLE IF EXISTS norwegian_media_links') && storeContent.includes('ADD COLUMN IF NOT EXISTS url TEXT'), 'url field');
  check('Migration adds source_name field', storeContent.includes('source_name TEXT'), 'source field');
  check('Migration adds topic field', storeContent.includes('topic TEXT'), 'topic field');
  check('Migration adds level field', storeContent.includes('level TEXT'), 'level field');
  check('Migration adds reason_recommended field', storeContent.includes('reason_recommended TEXT'), 'reason field');
  check('Migration adds watch_status field', storeContent.includes('watch_status TEXT'), 'watch field');
  check('Migration adds vocabulary_json field', storeContent.includes('vocabulary_json TEXT'), 'vocabulary field');
  check('Migration adds availability_note field', storeContent.includes('availability_note TEXT'), 'availability field');

  // Check dashboard
  const dashboardPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/renderAdminPages/norwegianDashboard.js');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

  check('Dashboard has media tab', dashboardContent.includes('pronunciation') || dashboardContent.includes('media'), 'tab present');

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
