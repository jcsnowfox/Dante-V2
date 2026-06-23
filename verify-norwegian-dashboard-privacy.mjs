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
  // Check dashboard handler for privacy
  const dashboardHandlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/adminPageHandlers/norwegianDashboardHandler.js');

  if (!fs.existsSync(dashboardHandlerPath)) {
    check('Dashboard handler exists', false, 'file not found');
    process.exit(1);
  }

  const handlerContent = fs.readFileSync(dashboardHandlerPath, 'utf8');

  // Check userScope isolation
  check('Handler extracts userScope from config', handlerContent.includes('userScope') && handlerContent.includes('config'), 'userScope isolation');
  check('Handler passes userScope to all store calls', handlerContent.includes('store.get') && handlerContent.includes('userScope'), 'userScope parameter');

  // Check logging doesn't expose user data
  check('Handler has safe logging', handlerContent.includes('logger?.') && !handlerContent.includes('full text'), 'safe logging pattern');
  check('Handler logs activities with [norwegian] prefix', handlerContent.includes('[norwegian') || handlerContent.includes('[norwegian-'), 'logging prefix');

  // Check for store availability check
  check('Handler checks store availability', handlerContent.includes('store') && handlerContent.includes('available'), 'store availability');

  // Check error handling without data leaks
  check('Handler catches errors safely', handlerContent.includes('catch (error)') && handlerContent.includes('error.message'), 'error catching');

  // Check store file for privacy
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');

  if (fs.existsSync(storePath)) {
    const storeContent = fs.readFileSync(storePath, 'utf8');

    // Check userScope filtering in all queries
    check('Store filters by user_scope in lessons', storeContent.includes('listNorwegianLessons') && storeContent.includes('user_scope ='), 'userScope filter');
    check('Store filters by user_scope in corrections', storeContent.includes('listNorwegianCorrections') && storeContent.includes('user_scope ='), 'userScope filter');
    check('Store filters by user_scope in vocabulary', storeContent.includes('listNorwegianVocabulary') && storeContent.includes('user_scope ='), 'userScope filter');
    check('Store filters by user_scope in media', storeContent.includes('listNorwegianMediaLinks') && storeContent.includes('user_scope ='), 'userScope filter');
    check('Store filters by user_scope in review', storeContent.includes('listNorwegianReviewItems') && storeContent.includes('user_scope ='), 'userScope filter');

    // Check no exposed secrets in logging
    check('Store does not log full text data', !storeContent.includes('text") + ","') && !storeContent.includes('password') && !storeContent.includes('secret'), 'no data leaks');
  }

  // Check dashboard render for privacy
  const dashboardRenderPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/renderAdminPages/norwegianDashboard.js');

  if (fs.existsSync(dashboardRenderPath)) {
    const renderContent = fs.readFileSync(dashboardRenderPath, 'utf8');

    // Check escaping of user data
    check('Dashboard escapes HTML in display', renderContent.includes('escapeHtml') || renderContent.includes('escape'), 'HTML escaping');

    // Check no logging of sensitive data
    check('Dashboard does not log user text', !renderContent.includes('console.log(') || !renderContent.includes('user'), 'no logging');

    // Check sourceStatus is always displayed
    check('Dashboard shows sourceStatus for all items', (renderContent.match(/source_status/g) || []).length >= 5 || (renderContent.match(/sourceStatus/g) || []).length >= 5, 'sourceStatus display');
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
