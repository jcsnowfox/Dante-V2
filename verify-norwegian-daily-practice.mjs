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
  // Check review engine daily practice function
  const enginePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianReviewEngine.js');
  const engineContent = fs.readFileSync(enginePath, 'utf8');

  check('Engine exports generateDailyPractice', engineContent.includes('generateDailyPractice'), 'function present');
  check('Daily practice uses getDueReviewItems', engineContent.includes('getDueReviewItems'), 'due items fetched');
  check('Daily practice prioritizes variety', engineContent.includes('byType'), 'variety logic');
  check('Daily practice limits to 5 items', engineContent.includes('tasks.slice(0, 5)'), 'item limit');
  check('Daily practice gives starter set if empty', engineContent.includes('starter') && engineContent.includes('unverified_practice'), 'fallback');
  check('Daily practice logs activity', engineContent.includes('daily practice generated'), 'logging');

  // Check Norwegian command has /daily
  const commandPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
  const commandContent = fs.readFileSync(commandPath, 'utf8');

  check('Commands include daily subcommand', commandContent.includes('daily'), 'command present');

  // Check store returns variety of types
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  check('Store getDailyPracticeSet limits to 5', storeContent.includes('LIMIT 5') && storeContent.includes('getDailyPracticeSet'), 'limit enforced');
  check('Store queries by user_scope', storeContent.includes('WHERE user_scope') && storeContent.includes('getDailyPracticeSet'), 'scoped');
  check('Store checks archived status', storeContent.includes('archived_at IS NULL'), 'archive check');
  check('Store orders by priority', storeContent.includes('ORDER BY priority'), 'priority ordering');

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
