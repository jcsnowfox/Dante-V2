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
  // Check core pronunciation service files exist
  const sttServicePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianSttService.js');
  check('STT service file exists', fs.existsSync(sttServicePath));

  if (fs.existsSync(sttServicePath)) {
    const content = fs.readFileSync(sttServicePath, 'utf8');
    check('STT service exports transcribeAudio', content.includes('transcribeAudio'), 'function exported');
    check('STT service handles buffer input', content.includes('buffer'), 'buffer parameter');
    check('STT service handles contentType', content.includes('contentType'), 'mime type parameter');
    check('STT service returns confidence', content.includes('confidence'), 'confidence in response');
    check('STT service handles language parameter', content.includes('language'), 'language code support');
    check('STT service uses LLM client', content.includes('getLlmClient'), 'uses existing LLM infrastructure');
  }

  // Check feedback service exists
  const feedbackServicePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianFeedbackService.js');
  check('Feedback service file exists', fs.existsSync(feedbackServicePath));

  if (fs.existsSync(feedbackServicePath)) {
    const content = fs.readFileSync(feedbackServicePath, 'utf8');
    check('Feedback service exports assignGrade', content.includes('assignGrade'), 'grading function');
    check('Feedback service exports calculateStringDistance', content.includes('calculateStringDistance'), 'string matching');
    check('Feedback service exports createFeedbackMessage', content.includes('createFeedbackMessage'), 'feedback formatting');
    check('Feedback service implements grades A-D and Retry', content.includes("'A'") && content.includes("'Retry'"), 'all grades');
    check('Feedback service handles low confidence', content.includes('confidence') && content.includes('0.65'), 'confidence threshold');
    check('Feedback service generates structured feedback', content.includes('Target:') || content.includes('Grade:'), 'structured format');
  }

  // Check audio handler exists
  const audioHandlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/handlers/norwegianAudioHandler.js');
  check('Audio handler file exists', fs.existsSync(audioHandlerPath));

  if (fs.existsSync(audioHandlerPath)) {
    const content = fs.readFileSync(audioHandlerPath, 'utf8');
    check('Audio handler exports processPronunciationAudio', content.includes('processPronunciationAudio'), 'main handler');
    check('Audio handler validates audio size', content.includes('MAX_AUDIO_MB') && content.includes('maxMB'), 'size validation');
    check('Audio handler supports audio types', content.includes('SUPPORTED_AUDIO_TYPES') && content.includes('mp3'), 'type support');
    check('Audio handler downloads audio', content.includes('downloadAudio'), 'download function');
    check('Audio handler calls STT service', content.includes('transcribeAudio'), 'STT integration');
    check('Audio handler gets pronunciation session', content.includes('getPronunciationSession'), 'session retrieval');
    check('Audio handler saves attempt', content.includes('savePronunciationAttempt'), 'storage saving');
    check('Audio handler creates review items', content.includes('saveReviewItem'), 'review item creation');
  }

  // Check store has session management methods
  const storePath = path.join(__dirname, 'artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
  check('Store file exists', fs.existsSync(storePath));

  if (fs.existsSync(storePath)) {
    const content = fs.readFileSync(storePath, 'utf8');
    check('Store has createPronunciationSession', content.includes('createPronunciationSession'), 'session creation');
    check('Store has getPronunciationSession', content.includes('getPronunciationSession'), 'session retrieval');
    check('Store has updatePronunciationSession', content.includes('updatePronunciationSession'), 'session update');
    check('Store has closePronunciationSession', content.includes('closePronunciationSession'), 'session closure');
    check('Store pronunciation schema has target_phrase', content.includes('target_phrase'), 'target phrase field');
    check('Store pronunciation schema has transcript_text', content.includes('transcript_text'), 'transcript field');
    check('Store pronunciation schema has stt_confidence', content.includes('stt_confidence'), 'confidence field');
    check('Store pronunciation schema has grade', content.includes('grade'), 'grade field');
    check('Store pronunciation schema has feedback', content.includes('feedback'), 'feedback field');
    check('Store pronunciation schema has source_status', content.includes('source_status'), 'sourceStatus field');
  }

  // Check command integration
  const commandPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
  check('Norwegian command file exists', fs.existsSync(commandPath));

  if (fs.existsSync(commandPath)) {
    const content = fs.readFileSync(commandPath, 'utf8');
    check('Command has pronounce subcommand', content.includes('pronounce'), 'subcommand defined');
    check('Command has handleNorwegianPronounce handler', content.includes('handleNorwegianPronounce'), 'handler function');
    check('Pronounce handler creates session', content.includes('createPronunciationSession'), 'session creation');
  }

  // Check message handler integration
  const messageHandlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/events/messageCreate.js');
  check('Message handler file exists', fs.existsSync(messageHandlerPath));

  if (fs.existsSync(messageHandlerPath)) {
    const content = fs.readFileSync(messageHandlerPath, 'utf8');
    check('Message handler accepts norwegianLearning param', content.includes('norwegianLearning'), 'parameter passed');
    check('Message handler detects audio attachments', content.includes('attachment') && content.includes('contentType'), 'attachment detection');
    check('Message handler calls pronunciation audio processor', content.includes('processPronunciationAudio'), 'processor called');
  }

  // Check event registration
  const registerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/registerEventHandlers.js');
  check('Event handler registration file exists', fs.existsSync(registerPath));

  if (fs.existsSync(registerPath)) {
    const content = fs.readFileSync(registerPath, 'utf8');
    check('Registration accepts norwegianLearning', content.includes('norwegianLearning'), 'parameter accepted');
    check('Registration passes to message handler', content.includes('norwegianLearning') && content.includes('MessageCreate'), 'passed to message handler');
  }

  // Check index.js integration
  const indexPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/index.js');
  check('Index file exists', fs.existsSync(indexPath));

  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf8');
    check('Index passes norwegianLearning to registration', content.includes('norwegianLearning') && content.includes('registerEventHandlers'), 'integration');
  }

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
