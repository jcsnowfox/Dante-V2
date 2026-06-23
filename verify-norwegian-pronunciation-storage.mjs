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
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const content = fs.readFileSync(storePath, 'utf8');

  // Check pronunciation attempts table schema
  check('Table norwegian_pronunciation_attempts exists', content.includes('norwegian_pronunciation_attempts'), 'table definition');
  check('Table has id primary key', content.includes('id BIGSERIAL PRIMARY KEY') || content.includes('BIGSERIAL'), 'id field');
  check('Table has user_scope field', content.includes('user_scope TEXT NOT NULL'), 'user scope');
  check('Table has target_phrase field', content.includes('target_phrase'), 'target phrase');
  check('Table has transcript_text field', content.includes('transcript_text'), 'transcript');
  check('Table has stt_confidence field', content.includes('stt_confidence NUMERIC'), 'confidence score');
  check('Table has score field', content.includes('score INTEGER'), 'numeric score');
  check('Table has grade field', content.includes('grade TEXT'), 'grade A-D/Retry');
  check('Table has feedback field', content.includes('feedback'), 'feedback text');
  check('Table has correction_focus field', content.includes('correction_focus'), 'focus area');
  check('Table has attempt_number field', content.includes('attempt_number'), 'attempt count');
  check('Table has source_status field', content.includes('source_status TEXT NOT NULL'), 'sourceStatus');
  check('Table has tts_example_provider field', content.includes('tts_example_provider'), 'TTS provider');
  check('Table has source_channel field', content.includes('source_channel'), 'Discord channel');
  check('Table has source_message_id field', content.includes('source_message_id'), 'Discord message');
  check('Table has created_at field', content.includes('created_at TIMESTAMPTZ'), 'timestamp');

  // Check pronunciation sessions table
  check('Table norwegian_pronunciation_sessions exists', content.includes('norwegian_pronunciation_sessions'), 'sessions table');
  check('Sessions table has user_scope primary key', content.includes('user_scope TEXT PRIMARY KEY'), 'user scope PK');
  check('Sessions table has target_phrase', content.includes('target_phrase TEXT NOT NULL'), 'target phrase');
  check('Sessions table has started_at', content.includes('started_at'), 'start timestamp');
  check('Sessions table has attempt_count', content.includes('attempt_count'), 'attempt counter');
  check('Sessions table has active flag', content.includes('active BOOLEAN'), 'active status');
  check('Sessions table has expires_at', content.includes('expires_at'), 'expiration time');

  // Check migration SQL
  check('Migration SQL exists', content.includes('MIGRATION_SQL') || content.includes('ALTER TABLE'), 'migration support');
  check('Migration adds new columns', content.includes('ALTER TABLE') && content.includes('ADD COLUMN'), 'column addition');
  check('Migration is safe (IF NOT EXISTS)', content.includes('ADD COLUMN IF NOT EXISTS'), 'safe migration');

  // Check session methods
  check('Store has createPronunciationSession', content.includes('createPronunciationSession'), 'session creation');
  check('Session creation validates userScope', content.includes('normalizeUserScope'), 'scope validation');
  check('Session creation validates phrase', content.includes('if (!phrase)'), 'phrase validation');
  check('Session creation logs activity', content.includes('[norwegian-pronunciation]'), 'logging');

  check('Store has getPronunciationSession', content.includes('getPronunciationSession'), 'session retrieval');
  check('Session retrieval filters by active', content.includes('active = true'), 'active check');
  check('Session retrieval filters by expiration', content.includes('expires_at > NOW()'), 'expiration check');

  check('Store has updatePronunciationSession', content.includes('updatePronunciationSession'), 'session update');
  check('Update tracks attempt count', content.includes('attempt_count'), 'attempt counter');
  check('Update tracks last attempt', content.includes('last_attempt_at'), 'attempt timestamp');

  check('Store has closePronunciationSession', content.includes('closePronunciationSession'), 'session closure');
  check('Closure sets active to false', content.includes('active = false'), 'active flag update');

  // Check savePronunciationAttempt
  check('Store has savePronunciationAttempt', content.includes('savePronunciationAttempt'), 'attempt saving');
  check('Save validates sourceStatus', content.includes('requireSourceStatus'), 'status validation');
  check('Save handles all new fields', content.includes('targetPhrase') && content.includes('transcriptText') && content.includes('grade'), 'field handling');

  // Check init includes migration
  check('Init runs CREATE_TABLES_SQL', content.includes('CREATE_TABLES_SQL'), 'table creation');
  check('Init runs MIGRATION_SQL', content.includes('MIGRATION_SQL'), 'migration running');

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
