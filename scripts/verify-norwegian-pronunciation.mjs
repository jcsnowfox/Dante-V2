import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pass(message) {
  console.log(`[verify:norwegian-pronunciation] PASS ${message}`);
}

function fail(message) {
  console.error(`[verify:norwegian-pronunciation] FAIL ${message}`);
  process.exitCode = 1;
}

const STORE_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianLearningStore.js');
const COMMAND_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/commands/norwegian.js');
const STT_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianSttService.js');
const AUDIO_HANDLER_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/bot/handlers/norwegianAudioHandler.js');
const SOURCE_STATUS_PATH = path.resolve(__dirname, '../artifacts/ghostlight-bot/src/norwegian/norwegianSourceStatus.js');

function checkStoreSchema(src) {
  // savePronunciationAttempt must NOT include word_or_phrase (column doesn't exist)
  if (src.includes('word_or_phrase')) {
    fail('norwegianLearningStore.js references word_or_phrase — this column does not exist in pronunciation tables');
  } else {
    pass('norwegianLearningStore.js does not reference non-existent word_or_phrase column');
  }

  // Must have target_phrase (the real column)
  if (src.includes('target_phrase')) {
    pass('norwegianLearningStore.js uses target_phrase column correctly');
  } else {
    fail('norwegianLearningStore.js missing target_phrase column reference');
  }

  // savePronunciationAttempt must exist
  if (src.includes('savePronunciationAttempt')) {
    pass('savePronunciationAttempt function defined in store');
  } else {
    fail('savePronunciationAttempt missing from store');
  }

  // createPronunciationSession must exist
  if (src.includes('createPronunciationSession')) {
    pass('createPronunciationSession function defined in store');
  } else {
    fail('createPronunciationSession missing from store');
  }

  // listNorwegianPronunciationAttempts must not select word_or_phrase or notes
  const listFn = src.match(/listNorwegianPronunciationAttempts[\s\S]*?(?=async function|\nmodule\.exports)/);
  if (listFn) {
    const fnSrc = listFn[0];
    if (fnSrc.includes('word_or_phrase') || /SELECT.*notes/.test(fnSrc)) {
      fail('listNorwegianPronunciationAttempts selects non-existent columns (word_or_phrase or notes)');
    } else {
      pass('listNorwegianPronunciationAttempts selects correct columns');
    }
  }
}

function checkStoreSourceStatus(src) {
  // pronunciation attempts must store source_status
  if (src.includes('source_status') && src.includes('tts_example_provider')) {
    pass('pronunciation tables store source_status and tts_example_provider');
  } else {
    fail('pronunciation schema missing source_status or tts_example_provider');
  }
}

function checkCommandTtsWiring(src) {
  // pronounce handler must try TTS generation
  if (src.includes('createAudioGenerationService')) {
    pass('norwegian.js imports createAudioGenerationService for TTS');
  } else {
    fail('norwegian.js does not import createAudioGenerationService — TTS not wired');
  }

  // Must check ttsEnabled before generating
  if (src.includes('ttsEnabled')) {
    pass('pronounce handler checks ttsEnabled config flag');
  } else {
    fail('pronounce handler does not check ttsEnabled — may attempt TTS when disabled');
  }

  // Must have graceful fallback for when TTS is not configured
  if (src.includes('ttsError') || src.includes('TTS example skipped') || src.includes('TTS audio not configured')) {
    pass('pronounce handler has graceful TTS fallback');
  } else {
    fail('pronounce handler missing graceful TTS fallback');
  }
}

function checkCommandSessionCreation(src) {
  if (src.includes('createPronunciationSession')) {
    pass('pronounce handler calls createPronunciationSession');
  } else {
    fail('pronounce handler does not call createPronunciationSession');
  }
}

function checkNoWordOrPhraseInCommand(src) {
  // The command must not reference word_or_phrase (the non-existent column)
  if (src.includes('word_or_phrase')) {
    fail('norwegian.js references word_or_phrase — this column does not exist');
  } else {
    pass('norwegian.js does not reference non-existent word_or_phrase');
  }
}

function checkSttServiceExists() {
  if (existsSync(STT_PATH)) {
    pass('norwegianSttService.js exists');
    const src = readFileSync(STT_PATH, 'utf8');
    if (src.includes('transcribe') || src.includes('processAudio') || src.includes('stt')) {
      pass('norwegianSttService.js contains STT function');
    } else {
      fail('norwegianSttService.js does not define transcription function');
    }
  } else {
    fail('norwegianSttService.js does not exist');
  }
}

function checkSourceStatusInAttempts() {
  // stt_based_practice is defined in norwegianSourceStatus.js and applied in the audio handler
  if (existsSync(SOURCE_STATUS_PATH) && readFileSync(SOURCE_STATUS_PATH, 'utf8').includes('stt_based_practice')) {
    pass('stt_based_practice source status is defined in norwegianSourceStatus.js');
  } else {
    fail('stt_based_practice source status is not defined — pronunciation attempts lack correct status');
  }

  if (existsSync(AUDIO_HANDLER_PATH) && readFileSync(AUDIO_HANDLER_PATH, 'utf8').includes('stt_based_practice')) {
    pass('Audio handler assigns stt_based_practice to pronunciation attempts');
  } else {
    fail('Audio handler does not assign stt_based_practice to pronunciation attempts');
  }
}

function main() {
  if (!existsSync(STORE_PATH)) {
    fail('norwegianLearningStore.js does not exist');
    return;
  }
  if (!existsSync(COMMAND_PATH)) {
    fail('norwegian.js does not exist');
    return;
  }

  const storeSrc = readFileSync(STORE_PATH, 'utf8');
  const commandSrc = readFileSync(COMMAND_PATH, 'utf8');

  pass('Store and command files found');

  checkStoreSchema(storeSrc);
  checkStoreSourceStatus(storeSrc);
  checkSourceStatusInAttempts();
  checkCommandTtsWiring(commandSrc);
  checkCommandSessionCreation(commandSrc);
  checkNoWordOrPhraseInCommand(commandSrc);
  checkSttServiceExists();

  if (!process.exitCode) {
    console.log('[verify:norwegian-pronunciation] All checks passed.');
  }
}

main();
