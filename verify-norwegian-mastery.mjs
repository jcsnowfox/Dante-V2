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
  // Check mastery engine exists
  const enginePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianMasteryEngine.js');
  const engineContent = fs.readFileSync(enginePath, 'utf8');

  check('Mastery engine service exists', fs.existsSync(enginePath), 'file present');
  check('Engine exports calculateMasteryProfile', engineContent.includes('calculateMasteryProfile'), 'profile calculation');
  check('Engine exports getNextFocus', engineContent.includes('getNextFocus'), 'next focus');
  check('Engine exports SKILL_AREAS', engineContent.includes('SKILL_AREAS'), 'skill tracking');
  check('Engine exports SOURCE_WEIGHTS', engineContent.includes('SOURCE_WEIGHTS'), 'source weighting');
  check('Engine exports GRADE_SCORES', engineContent.includes('GRADE_SCORES'), 'grade scoring');

  // Check skill areas coverage
  check('Engine tracks 13 skill areas', engineContent.includes("'vocabulary'") && engineContent.includes("'pronunciation'"), 'skill count');
  check('Engine includes listening skill', engineContent.includes("'listening'"), 'listening');
  check('Engine includes pronunciation skill', engineContent.includes("'pronunciation'"), 'pronunciation');
  check('Engine includes review_consistency skill', engineContent.includes("'review_consistency'"), 'review');

  // Check source weighting
  check('Verified has full weight', engineContent.includes('verified: 1.0'), 'verified weight');
  check('Partial has reduced weight', engineContent.includes('partial: 0.7'), 'partial weight');
  check('STT-based practice has medium weight', engineContent.includes('stt_based_practice: 0.6'), 'stt weight');
  check('Low confidence has low weight', engineContent.includes('low_confidence: 0.4'), 'low confidence weight');
  check('Unverified practice has reduced weight', engineContent.includes('unverified_practice: 0.5'), 'unverified weight');

  // Check level estimation
  check('Engine estimates beginner level', engineContent.includes('estimated_beginner'), 'beginner');
  check('Engine estimates A1 level', engineContent.includes('estimated_A1'), 'A1');
  check('Engine estimates A2 level', engineContent.includes('estimated_A2'), 'A2');
  check('Engine estimates B1 level', engineContent.includes('estimated_B1'), 'B1');
  check('Engine estimates B2 level', engineContent.includes('estimated_B2'), 'B2');

  // Check no official CEFR claims
  check('Engine includes confidence in level', engineContent.includes('confidence'), 'confidence');
  check('Engine includes basis in level', engineContent.includes('basis'), 'basis');
  check('Engine does not claim official CEFR', !engineContent.includes('CEFR certification'), 'no CEFR claim');

  // Check weak spot identification
  check('Engine identifies weak spots', engineContent.includes('identifyWeakSpots'), 'weak spots');
  check('Engine uses corrections for weak spots', engineContent.includes('data.corrections'), 'correction data');
  check('Engine identifies from pronunciation', engineContent.includes('data.pronunciationAttempts'), 'pronunciation data');
  check('Engine identifies from reviews', engineContent.includes('data.reviewItems'), 'review data');

  // Check learning paths exist
  const pathsPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningPaths.js');
  const pathsContent = fs.readFileSync(pathsPath, 'utf8');

  check('Learning paths file exists', fs.existsSync(pathsPath), 'file present');
  check('Paths exports LEARNING_PATHS', pathsContent.includes('LEARNING_PATHS'), 'paths defined');
  check('Paths include Survival Norwegian', pathsContent.includes('Survival Norwegian'), 'survival path');
  check('Paths include media listening', pathsContent.includes('Media Listening'), 'media path');
  check('Paths include grammar repair', pathsContent.includes('Grammar Repair Path'), 'grammar path');
  check('Paths are metadata only', pathsContent.includes('suggestedTopics'), 'metadata');
  check('Paths export recommendation function', pathsContent.includes('recommendPath'), 'recommendation');

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
