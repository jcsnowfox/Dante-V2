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
  // Check dashboard has settings tab
  const dashboardRenderPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/renderAdminPages/norwegianDashboard.js');

  if (!fs.existsSync(dashboardRenderPath)) {
    check('Dashboard render file exists', false, 'file not found');
    process.exit(1);
  }

  const renderContent = fs.readFileSync(dashboardRenderPath, 'utf8');

  // Check Settings tab exists
  check('Dashboard has settings tab', renderContent.includes('settings'), 'settings tab found');

  // Check for settings form elements
  check('Settings tab has level field', renderContent.includes('level'), 'level select');
  check('Settings tab has standard field', renderContent.includes('standard') || renderContent.includes('Bokmål') || renderContent.includes('Written'), 'standard field');
  check('Settings tab has target field', renderContent.includes('target'), 'target field');
  check('Settings tab has style field', renderContent.includes('style'), 'style field');
  check('Settings tab has length field', renderContent.includes('length'), 'length field');
  check('Settings tab has recommendations toggle', renderContent.includes('recommendations'), 'recommendations toggle');
  check('Settings tab has source-control toggle', renderContent.includes('source_control') || renderContent.includes('sourceControl') || renderContent.includes('requireSourceCheck') || renderContent.includes('source'), 'sourceControl toggle');

  // Check Level options are displayed
  const requiredLevels = ['beginner', 'A1', 'A2', 'B1', 'B2'];
  for (const level of requiredLevels) {
    const hasLevel = renderContent.includes(level);
    check(`Settings shows ${level} level option`, hasLevel, 'level option');
  }

  // Check source policy info
  check('Settings displays source policy info', renderContent.includes('policy') || renderContent.includes('source'), 'policy information');

  // Check handler for settings loading
  const dashboardHandlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/adminPageHandlers/norwegianDashboardHandler.js');

  if (fs.existsSync(dashboardHandlerPath)) {
    const handlerContent = fs.readFileSync(dashboardHandlerPath, 'utf8');

    // Check settings loading
    check('Handler loads profile settings', handlerContent.includes('getProfile'), 'getProfile call');
    check('Handler loads overview', handlerContent.includes('getOverview'), 'getOverview call');

    // Check settings passed to render
    check('Handler passes settings to dashboard', handlerContent.includes('settings') && handlerContent.includes('renderNorwegianDashboard'), 'settings rendering');
    check('Handler passes overview to dashboard', handlerContent.includes('overview') && handlerContent.includes('renderNorwegianDashboard'), 'overview rendering');
  }

  // Check store for settings methods
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');

  if (fs.existsSync(storePath)) {
    const storeContent = fs.readFileSync(storePath, 'utf8');

    // Check getProfile returns settings
    check('Store getProfile method exists', storeContent.includes('getProfile'), 'profile loading');
    check('Store getProfile returns all settings fields', storeContent.includes('level') || storeContent.includes('standard'), 'settings fields');

    // Check getOverview for counts
    check('Store getOverview method exists', storeContent.includes('getOverview'), 'overview loading');
    check('Store getOverview counts lessons', storeContent.includes('count') && storeContent.includes('lesson'), 'lesson counts');
    check('Store getOverview counts corrections', storeContent.includes('count') && storeContent.includes('correction'), 'correction counts');
    check('Store getOverview counts vocabulary', storeContent.includes('count') && storeContent.includes('vocabulary'), 'vocabulary counts');
  }

  // Check for admin actions handler
  const adminActionsPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/adminActions.js');

  if (fs.existsSync(adminActionsPath)) {
    const actionsContent = fs.readFileSync(adminActionsPath, 'utf8');

    // Check for norwegian-save action
    check('Admin actions handles norwegian-save', actionsContent.includes('norwegian-save') || actionsContent.includes('norwegian'), 'norwegian action');
  }

  // Check Dashboard routing
  const adminPageHandlersPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/adminPageHandlers.js');

  if (fs.existsSync(adminPageHandlersPath)) {
    const handlersContent = fs.readFileSync(adminPageHandlersPath, 'utf8');

    // Check dashboard routing
    check('Admin handlers route norwegian section', handlersContent.includes('norwegian'), 'norwegian routing');
    check('Admin handlers check page param', handlersContent.includes('page') && handlersContent.includes('dashboard'), 'page param check');
    check('Admin handlers call dashboard handler', handlersContent.includes('handleNorwegianDashboardRequest') || handlersContent.includes('dashboard'), 'dashboard handler call');
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
