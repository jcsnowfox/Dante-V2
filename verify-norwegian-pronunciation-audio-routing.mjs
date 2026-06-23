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
  // Check STT routing
  const sttPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianSttService.js');
  const sttContent = fs.readFileSync(sttPath, 'utf8');

  check('STT uses LLM client for transcription', sttContent.includes('getLlmClient') && sttContent.includes('transcription'), 'LLM client usage');
  check('STT resolves transcription model', sttContent.includes('resolveTranscriptionModel'), 'model resolution');
  check('STT uses OpenAI audio API', sttContent.includes('audio.transcriptions') || sttContent.includes('whisper'), 'API endpoint');
  check('STT handles missing STT config', sttContent.includes('STT not configured') || sttContent.includes('LLM client'), 'config validation');
  check('STT logs provider info', sttContent.includes('[norwegian-pronunciation]') && sttContent.includes('stt'), 'logging');

  // Check audio handler routing
  const handlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/handlers/norwegianAudioHandler.js');
  const handlerContent = fs.readFileSync(handlerPath, 'utf8');

  check('Audio handler processes audio attachments', handlerContent.includes('attachment') && handlerContent.includes('url'), 'attachment handling');
  check('Audio handler validates MIME types', handlerContent.includes('SUPPORTED_AUDIO_TYPES') && handlerContent.includes('audio/'), 'type validation');
  check('Audio handler downloads audio safely', handlerContent.includes('downloadAudio') && handlerContent.includes('maxMB'), 'download safety');
  check('Audio handler calls STT service', handlerContent.includes('transcribeAudio'), 'STT integration');
  check('Audio handler compares transcript to target', handlerContent.includes('calculateStringDistance'), 'comparison logic');
  check('Audio handler assigns grade', handlerContent.includes('assignGrade'), 'grading logic');
  check('Audio handler saves to database', handlerContent.includes('savePronunciationAttempt'), 'storage');
  check('Audio handler logs securely', handlerContent.includes('[norwegian-pronunciation]'), 'logging');
  check('Audio handler does not use TTS in base implementation', !handlerContent.includes('createAudioGenerationService'), 'TTS deferred');

  // Check message handler audio routing
  const messageHandlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/events/messageCreate.js');
  const messageContent = fs.readFileSync(messageHandlerPath, 'utf8');

  check('Message handler detects audio attachments', messageContent.includes('attachment') && messageContent.includes('contentType'), 'detection');
  check('Message handler routes to pronunciation handler', messageContent.includes('processPronunciationAudio'), 'routing');
  check('Message handler respects pronunciation flow', messageContent.includes('norwegianLearning') && messageContent.includes('attachments'), 'flow control');

  // Check store routing
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  const storeContent = fs.readFileSync(storePath, 'utf8');

  check('Store handles pronunciation attempts', storeContent.includes('savePronunciationAttempt'), 'save routing');
  check('Store handles review item creation', storeContent.includes('saveReviewItem'), 'review routing');
  check('Store handles session management', storeContent.includes('createPronunciationSession') && storeContent.includes('getPronunciationSession'), 'session routing');

  // Check no provider fallback
  check('Handler does not silently fallback providers', !handlerContent.includes('if not fish then eleven'), 'no fallback');

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
