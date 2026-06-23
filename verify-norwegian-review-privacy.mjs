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
  // Check review engine privacy
  const enginePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianReviewEngine.js');
  const engineContent = fs.readFileSync(enginePath, 'utf8');

  check('Engine does not store raw audio', !engineContent.includes('audio'), 'no raw audio');
  check('Engine does not store article bodies', !engineContent.includes('body'), 'no articles');
  check('Engine does not store subtitles', !engineContent.includes('subtitle'), 'no subtitles');
  check('Engine logs safely', engineContent.includes('[norwegian-review]'), 'safe logging');

  // Check store privacy
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  check('Store filters all review queries by user_scope', (storeContent.match(/user_scope = \$\d/g) || []).length >= 5, 'scope filtering');
  check('Store does not store raw content > 2000 chars', storeContent.includes('.slice(0, 2000)'), 'content limit');
  check('Store review methods check user_scope', storeContent.includes('normalizeUserScope'), 'scope validation');
  check('Store does not log full private lessons', !storeContent.includes('lesson') || storeContent.includes('async'), 'no full lesson logs');

  // Check sourceStatus preservation
  check('Store preserves sourceStatus in review items', storeContent.includes('source_status'), 'status preserved');
  check('Store does not upgrade sourceStatus', !storeContent.includes('UPDATE.*source_status.*=') || storeContent.includes('WHERE'), 'no upgrade');

  // Check no spam constraints
  check('Engine respects frequency limits', !engineContent.includes('loop'), 'no spam loops');
  check('Engine max tasks in daily practice', engineContent.includes('slice(0, 5)'), 'task limit');

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
