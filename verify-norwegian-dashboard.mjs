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
  // Check dashboard handler file exists
  const dashboardHandlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/adminPageHandlers/norwegianDashboardHandler.js');
  check('Dashboard handler file exists', fs.existsSync(dashboardHandlerPath));

  // Check handler file has required function
  if (fs.existsSync(dashboardHandlerPath)) {
    const content = fs.readFileSync(dashboardHandlerPath, 'utf8');
    check('Handler exports handleNorwegianDashboardRequest', content.includes('handleNorwegianDashboardRequest'), 'function definition found');
    check('Handler calls renderAdminShell', content.includes('renderAdminShell('), 'wraps page in admin shell');
    check('Handler calls renderNorwegianDashboard', content.includes('renderNorwegianDashboard('), 'renders dashboard');
    check('Handler loads store data', content.includes('store.getProfile') && content.includes('store.listNorwegian'), 'loads lessons/corrections/etc');
    check('Handler has error handling', content.includes('catch (error)'), 'catches errors gracefully');
    check('Handler logs activities', content.includes('logger?.info') || content.includes('logger?.warn'), 'logs with logger');
  }

  // Check dashboard render file exists
  const dashboardRenderPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/renderAdminPages/norwegianDashboard.js');
  check('Dashboard render file exists', fs.existsSync(dashboardRenderPath));

  // Check render file has required function
  if (fs.existsSync(dashboardRenderPath)) {
    const content = fs.readFileSync(dashboardRenderPath, 'utf8');
    check('Render file exports renderNorwegianDashboard', content.includes('renderNorwegianDashboard') && content.includes('module.exports'), 'function exported');
    check('Render file generates HTML', content.includes('<div') || content.includes('<section'), 'renders HTML structure');
  }

  // Check renderAdminPages.js includes dashboard
  const renderAdminPagesPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/renderAdminPages.js');
  check('renderAdminPages.js imports dashboard', fs.existsSync(renderAdminPagesPath));

  if (fs.existsSync(renderAdminPagesPath)) {
    const content = fs.readFileSync(renderAdminPagesPath, 'utf8');
    check('renderAdminPages imports renderNorwegianDashboard', content.includes('renderNorwegianDashboard'), 'import found');
    check('renderAdminPages exports renderNorwegianDashboard', content.includes('renderNorwegianDashboard,'), 'export found');
  }

  // Check adminPageHandlers.js routes to dashboard
  const adminPageHandlersPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/adminPageHandlers.js');
  check('adminPageHandlers.js exists', fs.existsSync(adminPageHandlersPath));

  if (fs.existsSync(adminPageHandlersPath)) {
    const content = fs.readFileSync(adminPageHandlersPath, 'utf8');
    check('adminPageHandlers imports dashboard handler', content.includes('handleNorwegianDashboardRequest'), 'import found');
    check('adminPageHandlers routes norwegian section', content.includes('route.section === "norwegian"'), 'route condition found');
    check('adminPageHandlers checks page param for dashboard', content.includes('page === "dashboard"'), 'dashboard routing found');
  }

  // Check adminRenderHelpers.js includes dashboard
  const adminRenderHelpersPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/adminRenderHelpers.js');
  check('adminRenderHelpers.js exists', fs.existsSync(adminRenderHelpersPath));

  if (fs.existsSync(adminRenderHelpersPath)) {
    const content = fs.readFileSync(adminRenderHelpersPath, 'utf8');
    check('adminRenderHelpers imports renderNorwegianDashboard', content.includes('renderNorwegianDashboard'), 'import found');
    check('adminRenderHelpers exports renderNorwegianDashboard', content.includes('renderNorwegianDashboard,') && content.includes('module.exports'), 'export found');
    check('adminRenderHelpers includes in buildAdminPageHelpers', content.includes('renderNorwegianDashboard,') && content.includes('MANUAL_MEMORY_TYPES'), 'included in helpers return');
  }

  // Check store has required list methods
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  check('Store file exists', fs.existsSync(storePath));

  if (fs.existsSync(storePath)) {
    const content = fs.readFileSync(storePath, 'utf8');
    check('Store has listNorwegianLessons', content.includes('listNorwegianLessons'), 'method defined');
    check('Store has listNorwegianCorrections', content.includes('listNorwegianCorrections'), 'method defined');
    check('Store has listNorwegianVocabulary', content.includes('listNorwegianVocabulary'), 'method defined');
    check('Store has listNorwegianMediaLinks', content.includes('listNorwegianMediaLinks'), 'method defined');
    check('Store has listNorwegianReviewItems', content.includes('listNorwegianReviewItems'), 'method defined');
    check('Store has listNorwegianPronunciationAttempts', content.includes('listNorwegianPronunciationAttempts'), 'method defined');
    check('Store has updateNorwegianReviewItem', content.includes('updateNorwegianReviewItem'), 'method defined');
    check('Store methods have userScope parameter', content.includes('(userScope,') || content.includes('userScope'), 'user scope isolation');
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
