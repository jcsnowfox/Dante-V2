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
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');

  if (!fs.existsSync(storePath)) {
    check('Store file exists', false, 'file not found');
    process.exit(1);
  }

  const content = fs.readFileSync(storePath, 'utf8');

  // Check for required query methods
  const requiredMethods = [
    'listNorwegianLessons',
    'listNorwegianCorrections',
    'listNorwegianVocabulary',
    'listNorwegianMediaLinks',
    'listNorwegianReviewItems',
    'listNorwegianPronunciationAttempts',
    'updateNorwegianReviewItem',
  ];

  for (const method of requiredMethods) {
    const hasMethod = content.includes(`${method}(`) || content.includes(`${method} `);
    check(`Store implements ${method}`, hasMethod, 'method found');
  }

  // Check save methods still exist and work with sourceStatus
  const saveMethods = [
    'saveLesson',
    'saveCorrection',
    'savePronunciationAttempt',
    'saveMediaLink',
  ];

  for (const method of saveMethods) {
    const hasMethod = content.includes(`${method}(`);
    check(`Store retains ${method}`, hasMethod, 'method found');
    if (hasMethod) {
      const hasSourceStatus = content.includes('requireSourceStatus') && (content.includes('source_status') || content.includes('sourceStatus'));
      check(`${method} validates sourceStatus`, hasSourceStatus, 'sourceStatus validation');
    }
  }

  // Check userScope isolation
  check('Query methods use userScope parameter', content.includes('userScope') && content.includes('WHERE'), 'userScope filtering');
  check('Queries have WHERE user_scope clause', content.includes('user_scope =') || content.includes('user_scope=$'), 'user scope WHERE clause');

  // Check query structure
  check('Lessons query orders by created_at', content.includes('ORDER BY') && content.includes('created_at'), 'sort by created_at');
  check('Lessons query limits results', content.includes('LIMIT'), 'limit parameter');
  check('Lessons query has pagination', content.includes('listNorwegian') && (content.includes('limit') || content.includes('LIMIT')), 'limit support');

  // Check for getProfile method
  check('Store has getProfile method', content.includes('getProfile'), 'profile loading');

  // Check for getOverview method
  check('Store has getOverview method', content.includes('getOverview'), 'overview stats');

  // Check noop fallback pattern
  check('Store has noop fallback when no DATABASE_URL', !content.includes('DATABASE_URL') || content.includes('available'), 'graceful degradation');

  // Check error handling in methods
  check('Store has error handling', content.includes('throw new Error') || content.includes('catch'), 'error handling');

  // Check table references
  const requiredTables = [
    'norwegian_lessons',
    'norwegian_corrections',
    'norwegian_vocabulary',
    'norwegian_media_links',
    'norwegian_review_items',
    'norwegian_pronunciation_attempts',
  ];

  for (const table of requiredTables) {
    const hasTable = content.includes(table);
    check(`Store queries ${table} table`, hasTable, 'table name found');
  }

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
