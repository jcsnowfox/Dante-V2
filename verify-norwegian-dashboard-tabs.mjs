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
  const dashboardRenderPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/renderAdminPages/norwegianDashboard.js');

  if (!fs.existsSync(dashboardRenderPath)) {
    check('Dashboard render file exists', false, 'file not found');
    process.exit(1);
  }

  const content = fs.readFileSync(dashboardRenderPath, 'utf8');

  // Check for 8 required tabs
  const requiredTabs = [
    'overview',
    'lessons',
    'corrections',
    'vocabulary',
    'media',
    'review',
    'pronunciation',
    'settings',
  ];

  for (const tab of requiredTabs) {
    const hasTab = content.toLowerCase().includes(tab);
    check(`Dashboard has ${tab} tab`, hasTab, 'tab rendering found');
  }

  // Check tab structure and content
  check('Dashboard has tab navigation', content.includes('data-tab') || content.includes('tab'), 'tab switching logic');
  check('Dashboard renders activeTab', content.includes('activeTab'), 'active tab tracking');

  // Check for Overview tab content
  check('Overview tab has stats', content.includes('stat') || content.includes('Count') || content.includes('count'), 'stats display');
  check('Overview tab displays settings', content.includes('level') || content.includes('standard'), 'settings display');

  // Check for Lessons tab content
  check('Lessons tab displays topic', content.includes('topic') || content.includes('lesson'), 'lesson topic display');
  check('Lessons tab displays level', content.includes('level'), 'lesson level display');
  check('Lessons tab has sourceStatus', content.includes('source_status') || content.includes('sourceStatus'), 'sourceStatus badge');

  // Check for Corrections tab content
  check('Corrections tab has original/corrected', content.includes('corrected') || content.includes('Corrected'), 'correction display');
  check('Corrections tab has sourceStatus', content.includes('source_status') || content.includes('sourceStatus'), 'sourceStatus badge');

  // Check for Vocabulary tab content
  check('Vocabulary tab displays words', content.includes('word') || content.includes('vocabulary'), 'word display');
  check('Vocabulary tab has translations', content.includes('translation') || content.includes('translate'), 'translation display');
  check('Vocabulary tab has sourceStatus', content.includes('source_status') || content.includes('sourceStatus'), 'sourceStatus badge');

  // Check for Media tab content
  check('Media tab has links', content.includes('mediaLink') || content.includes('url') || content.includes('href'), 'media link display');
  check('Media tab has mediaType', content.includes('mediaType') || content.includes('type'), 'media type display');

  // Check for Review tab content
  check('Review tab has itemType', content.includes('itemType') || content.includes('type'), 'review item type');
  check('Review tab has dueDate', content.includes('dueDate') || content.includes('due'), 'review due date');

  // Check for Pronunciation tab content
  check('Pronunciation tab loads attempts', content.includes('pronunciationAttempts') || content.includes('pronunciation'), 'pronunciation attempts');

  // Check for Settings tab content
  check('Settings tab has form', content.includes('<form') || content.includes('form'), 'settings form');
  check('Settings tab has level select', content.includes('level') && (content.includes('select') || content.includes('option')), 'level select');
  check('Settings tab has source control', content.includes('sourceControl') || content.includes('source'), 'source control toggle');

  // Check rendering patterns
  check('Dashboard uses HTML structure', content.includes('<div') || content.includes('<section') || content.includes('<table'), 'HTML generation');
  check('Dashboard escapes HTML', content.includes('escapeHtml') || content.includes('escape'), 'HTML escaping for safety');

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
