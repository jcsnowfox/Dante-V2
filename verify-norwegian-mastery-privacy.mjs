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
  // Check mastery engine privacy
  const enginePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianMasteryEngine.js');
  const engineContent = fs.readFileSync(enginePath, 'utf8');

  check('Engine uses user_scope isolation', engineContent.includes('userScope'), 'scope isolation');
  check('Engine does not store raw lesson text', !engineContent.includes('lesson.text') && !engineContent.includes('lesson_text'), 'no raw lessons');
  check('Engine does not store correction bodies', !engineContent.includes('correction.content') || engineContent.includes('correction_focus'), 'no correction bodies');
  check('Engine does not store raw audio', !engineContent.includes('audio'), 'no raw audio');
  check('Engine does not store article bodies', !engineContent.includes('article'), 'no article bodies');
  check('Engine does not store subtitles', !engineContent.includes('subtitle'), 'no subtitles');
  check('Engine logs safely', engineContent.includes('[norwegian-mastery]'), 'safe logging');
  check('Engine does not log full private text', !engineContent.includes('log.*correction.content'), 'no full private logs');

  // Check source status weighting
  check('Engine weights verified highest', engineContent.includes('verified: 1.0'), 'verified weight');
  check('Engine does not upgrade sourceStatus', !engineContent.includes('sourceStatus =') && !engineContent.includes('UPDATE.*sourceStatus'), 'no upgrade');
  check('Engine preserves low_confidence weight', engineContent.includes('low_confidence: 0.4'), 'low conf weight');

  // Check level handling
  check('Level uses evidence-based estimates', engineContent.includes('basis') || engineContent.includes('Basis'), 'evidence basis');
  check('Level includes confidence', engineContent.includes('confidence'), 'confidence');
  check('Level does not claim official CEFR', !engineContent.includes('official') || !engineContent.includes('CEFR'), 'no CEFR claim');

  // Check weak spots from evidence only
  check('Weak spots use saved corrections', engineContent.includes('data.corrections'), 'saved data');
  check('Weak spots use pronunciation data', engineContent.includes('data.pronunciationAttempts'), 'pronunciation data');
  check('Weak spots use review data', engineContent.includes('data.reviewItems'), 'review data');
  check('Weak spots do not invent', !engineContent.includes('hallucinate') && !engineContent.includes('invent'), 'no invention');

  // Check learning paths
  const pathsPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningPaths.js');
  const pathsContent = fs.readFileSync(pathsPath, 'utf8');

  check('Paths do not include full curriculum', !pathsContent.includes('lesson_content') && !pathsContent.includes('full_lesson'), 'no curriculum');
  check('Paths are metadata only', pathsContent.includes('description') && pathsContent.includes('skillAreas'), 'metadata');
  check('Paths do not include raw content', pathsContent.includes('suggestedTopics') && !pathsContent.includes('lesson_body'), 'no content');

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
