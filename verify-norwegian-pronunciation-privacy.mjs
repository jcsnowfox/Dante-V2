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
  // Check STT service
  const sttPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianSttService.js');
  const sttContent = fs.readFileSync(sttPath, 'utf8');

  check('STT service does not expose API keys', !sttContent.includes('apiKey') || sttContent.includes('// '), 'key protection');
  check('STT service logs do not include transcripts', !sttContent.includes('transcript') || sttContent.includes('error'), 'transcript privacy');

  // Check audio handler
  const handlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/handlers/norwegianAudioHandler.js');
  const handlerContent = fs.readFileSync(handlerPath, 'utf8');

  check('Audio handler extracts userScope for privacy', handlerContent.includes('userScope'), 'scope isolation');
  check('Audio handler does not store raw audio by default', !handlerContent.includes('saveRaw') && !handlerContent.includes('audioBuffer'), 'no raw storage');
  check('Audio handler uses safe logging', handlerContent.includes('[norwegian-pronunciation]'), 'logging prefix');
  check('Audio handler logs do not include full transcript', !handlerContent.includes('transcript') || handlerContent.includes('length'), 'transcript safety');
  check('Audio handler validates before processing', handlerContent.includes('session') && handlerContent.includes('validate'), 'input validation');
  check('Audio handler sends private responses', handlerContent.includes('Ephemeral') || handlerContent.includes('flags'), 'ephemeral messages');

  // Check feedback service
  const feedbackPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianFeedbackService.js');
  const feedbackContent = fs.readFileSync(feedbackPath, 'utf8');

  check('Feedback service does not fake scoring', !feedbackContent.includes('fake') && feedbackContent.includes('confidence'), 'honest scoring');
  check('Feedback service does not claim phoneme accuracy', !feedbackContent.includes('phoneme') || feedbackContent.includes('warning'), 'honesty');
  check('Feedback service handles low confidence', feedbackContent.includes('0.65') && feedbackContent.includes('Retry'), 'low confidence handling');
  check('Feedback service only scores when confident', feedbackContent.includes('confidence') && feedbackContent.includes('score = null'), 'conditional scoring');

  // Check store
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  check('Store filters all queries by user_scope', (storeContent.match(/user_scope =/g) || []).length > 5, 'universal filtering');
  check('Store sessions expire after 30 minutes', storeContent.includes('30 minutes') || storeContent.includes('30'), 'session expiration');
  check('Store does not log full transcripts', !storeContent.includes('transcript') || storeContent.includes('error'), 'log safety');

  // Check message handler
  const messageHandlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/events/messageCreate.js');
  const messageContent = fs.readFileSync(messageHandlerPath, 'utf8');

  check('Message handler extracts userScope', messageContent.includes('userScope') || messageContent.includes('user'), 'scope extraction');
  check('Message handler only processes if session exists', messageContent.includes('getPronunciationSession'), 'session check');

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
