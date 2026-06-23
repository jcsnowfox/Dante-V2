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
  // Check dashboard render file for pronunciation tab
  const dashboardPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/renderAdminPages/norwegianDashboard.js');
  const content = fs.readFileSync(dashboardPath, 'utf8');

  check('Dashboard has pronunciation tab', content.includes('pronunciation') && content.includes('Pronunciation'), 'tab rendering');
  check('Pronunciation tab displays attempts', content.includes('pronunciationAttempts'), 'attempts display');
  check('Pronunciation tab displays target phrase', content.includes('target'), 'target phrase');
  check('Pronunciation tab displays transcript', content.includes('transcript'), 'transcript display');
  check('Pronunciation tab displays confidence', content.includes('confidence') || content.includes('stt_confidence'), 'confidence score');
  check('Pronunciation tab displays grade', content.includes('grade'), 'grade display');
  check('Pronunciation tab displays score', content.includes('score'), 'score display');
  check('Pronunciation tab displays feedback', content.includes('feedback'), 'feedback display');
  check('Pronunciation tab displays sourceStatus', content.includes('source_status'), 'sourceStatus badge');
  check('Pronunciation tab displays attempt number', content.includes('attempt'), 'attempt number');
  check('Pronunciation tab displays created date', content.includes('created_at'), 'creation date');
  check('Pronunciation tab has empty state', content.includes('No pronunciation') || content.includes('pronunciation yet'), 'empty message');

  // Check dashboard handler for loading pronunciation data
  const handlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/http/adminPageHandlers/norwegianDashboardHandler.js');
  const handlerContent = fs.readFileSync(handlerPath, 'utf8');

  check('Handler loads pronunciation attempts', handlerContent.includes('listNorwegianPronunciationAttempts'), 'data loading');
  check('Handler passes to dashboard', handlerContent.includes('pronunciationAttempts'), 'data passing');

  // Check store has list method
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  check('Store has listNorwegianPronunciationAttempts', storeContent.includes('listNorwegianPronunciationAttempts'), 'query method');
  check('List method filters by user_scope', storeContent.includes('user_scope =') && storeContent.includes('listNorwegian'), 'privacy filter');
  check('List method orders by created_at', storeContent.includes('ORDER BY') && storeContent.includes('created_at'), 'chronological order');
  check('List method has limit parameter', storeContent.includes('limit'), 'pagination');

  // Check Phase 3 dashboard integration
  check('Dashboard renders all 8 tabs', content.includes('overview') && content.includes('lessons') && content.includes('corrections') && content.includes('vocabulary') && content.includes('media') && content.includes('review') && content.includes('pronunciation') && content.includes('settings'), 'tab coverage');

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
