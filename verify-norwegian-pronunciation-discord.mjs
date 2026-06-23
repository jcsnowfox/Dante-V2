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
  // Check command structure
  const commandPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
  const content = fs.readFileSync(commandPath, 'utf8');

  // Check pronounce subcommand in SlashCommandBuilder
  check('Pronounce subcommand in SlashCommandBuilder', content.includes('setName("pronounce")'), 'subcommand defined');
  check('Pronounce subcommand has description', content.includes('Practice pronunciation'), 'description present');
  check('Pronounce subcommand accepts phrase option', content.includes('addStringOption') && content.includes('phrase'), 'phrase option');

  // Check handler execution
  check('Execute function calls pronounce handler', content.includes('handleNorwegianPronounce'), 'handler dispatch');

  // Check handler implementation
  check('Handler checks store availability', content.includes('store.available'), 'database check');
  check('Handler gets phrase option', content.includes('getString("phrase")'), 'option parsing');
  check('Handler provides help message if no phrase', content.includes('Pronunciation Practice') || content.includes('/norwegian pronounce'), 'help message');
  check('Handler validates phrase length', content.includes('slice') && content.includes('trim'), 'phrase validation');
  check('Handler creates session', content.includes('createPronunciationSession'), 'session creation');
  check('Handler replies with target phrase', content.includes('Target phrase') || content.includes('target phrase'), 'user feedback');
  check('Handler asks for voice note', content.includes('voice note'), 'voice input request');

  // Check message handler
  const messageHandlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/events/messageCreate.js');
  const messageContent = fs.readFileSync(messageHandlerPath, 'utf8');

  check('Message handler detects audio files', messageContent.includes('contentType') && messageContent.includes('startsWith'), 'attachment detection');
  check('Message handler supports mp3/wav/webm', messageContent.includes('audio/') && (messageContent.includes('wav') || messageContent.includes('mpeg')), 'audio format support');
  check('Message handler calls audio processor', messageContent.includes('processPronunciationAudio'), 'processor integration');

  // Check error responses in audio handler
  const audioHandlerPath = path.join(__dirname, 'artifacts/ghostlight-bot/src/bot/handlers/norwegianAudioHandler.js');
  const audioHandlerContent = fs.readFileSync(audioHandlerPath, 'utf8');

  check('Handler responds to unsupported audio', audioHandlerContent.includes('contentType') || audioHandlerContent.includes('audio format') || messageContent.includes('audio format'), 'format validation');
  check('Handler responds to no active session', audioHandlerContent.includes('No active pronunciation session') || audioHandlerContent.includes('pronunciation session'), 'session validation');

  // Check Discord message flags
  check('Handler uses Ephemeral flags', messageContent.includes('Ephemeral') || messageContent.includes('flags'), 'ephemeral messages');

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
