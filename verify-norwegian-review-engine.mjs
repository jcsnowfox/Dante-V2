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
  // Check review engine service exists
  const enginePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianReviewEngine.js');
  const engineContent = fs.readFileSync(enginePath, 'utf8');

  check('Review engine service exists', fs.existsSync(enginePath), 'file present');
  check('Engine exports calculatePriority', engineContent.includes('calculatePriority'), 'priority calc');
  check('Engine exports calculateNextDueDate', engineContent.includes('calculateNextDueDate'), 'scheduling');
  check('Engine exports generateDailyPractice', engineContent.includes('generateDailyPractice'), 'daily practice');
  check('Engine exports analyzeWeakSpots', engineContent.includes('analyzeWeakSpots'), 'weak spot analysis');
  check('Engine exports generateWeeklySummary', engineContent.includes('generateWeeklySummary'), 'weekly summary');
  check('Engine exports recordReviewResult', engineContent.includes('recordReviewResult'), 'result recording');
  check('Engine defines REVIEW_SCHEDULE', engineContent.includes('REVIEW_SCHEDULE'), 'scheduling rules');

  // Check scheduling rules
  check('A grade schedules 7 days', engineContent.includes('A: 7'), 'A schedule');
  check('B grade schedules 3 days', engineContent.includes('B: 3'), 'B schedule');
  check('C/D grade schedules 1 day', engineContent.includes('C: 1') && engineContent.includes('D: 1'), 'C/D schedule');
  check('Retry schedules next session', engineContent.includes('Retry: 0'), 'Retry schedule');

  // Check store has review methods
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  check('Store has getDueReviewItems', storeContent.includes('async getDueReviewItems'), 'due items');
  check('Store has getOverdueReviewItems', storeContent.includes('async getOverdueReviewItems'), 'overdue items');
  check('Store has updateReviewResult', storeContent.includes('async updateReviewResult'), 'result update');
  check('Store has snoozeReviewItem', storeContent.includes('async snoozeReviewItem'), 'snooze');
  check('Store has archiveReviewItem', storeContent.includes('async archiveReviewItem'), 'archive');
  check('Store has markReviewItemMastered', storeContent.includes('async markReviewItemMastered'), 'mastered');
  check('Store has getWeakSpotSummary', storeContent.includes('async getWeakSpotSummary'), 'weak spots');
  check('Store has getWeeklyNorwegianSummary', storeContent.includes('async getWeeklyNorwegianSummary'), 'weekly summary');
  check('Store has getDailyPracticeSet', storeContent.includes('async getDailyPracticeSet'), 'daily set');

  // Check migration includes review fields
  check('Migration adds priority field', storeContent.includes('priority TEXT'), 'priority field');
  check('Migration adds grade field', storeContent.includes('grade TEXT'), 'grade field');
  check('Migration adds review_count field', storeContent.includes('review_count INTEGER'), 'review count');
  check('Migration adds correct_count field', storeContent.includes('correct_count INTEGER'), 'correct count');
  check('Migration adds retry_count field', storeContent.includes('retry_count INTEGER'), 'retry count');
  check('Migration adds last_result field', storeContent.includes('last_result TEXT'), 'result field');
  check('Migration adds next_due_at field', storeContent.includes('next_due_at TIMESTAMPTZ'), 'due date field');
  check('Migration adds mastered_at field', storeContent.includes('mastered_at TIMESTAMPTZ'), 'mastered field');
  check('Migration adds archived_at field', storeContent.includes('archived_at TIMESTAMPTZ'), 'archived field');

  // Check review result recording
  check('Result recording updates correct_count', storeContent.includes('correct_count = CASE WHEN'), 'correct tracking');
  check('Result recording updates retry_count', storeContent.includes('retry_count = CASE WHEN'), 'retry tracking');
  check('Result recording updates review_count', storeContent.includes('review_count + 1'), 'review count increment');
  check('Result recording updates next_due_at', storeContent.includes("next_due_at = $3"), 'reschedule');

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
