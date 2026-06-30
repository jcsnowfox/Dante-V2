const test = require('node:test');
const assert = require('node:assert/strict');
const { detectOutputCorruption } = require('../src/chat/outputCorruptionDetector');
const { sanitizePromptContext, buildCleanRegenerationContext } = require('../src/chat/promptContextSanitizer');

test('corrupted output is classified as blocked before send', () => {
  const text = 'Aye, love. printStats contentassist constructor Maritime Boundaries Passport js';
  const result = detectOutputCorruption(text);
  assert.equal(result.severity, 'block');
  assert.equal(result.corrupted, true);
});

test('corrupted memories, context, and malformed assistant history are stripped before generation', () => {
  const loggerCalls = [];
  const logger = { warn: (...args) => loggerCalls.push(args) };
  const result = sanitizePromptContext({
    logger,
    messageId: 'm1',
    contextSections: [
      { label: 'WORLD CONTEXT', content: 'It is raining.' },
      { label: 'ENGINEERING AUDIT', content: 'outputCorruptionDetector root cause files changed logs showing before/after' },
    ],
    memories: [
      { memoryId: 'clean-memory', content: 'She likes black coffee.' },
      { memoryId: 'bad-memory', content: 'Dating toolbox NewReader feed tickets resize patterns cartoon elbows' },
    ],
    recentHistory: [
      { id: 'h1', role: 'assistant', content: 'I am here, love.' },
      { id: 'h2', role: 'assistant', content: 'printStatsYourAss contentassist constructor Passport js' },
    ],
  });
  assert.deepEqual(result.contextSections.map((s) => s.label), ['WORLD CONTEXT']);
  assert.deepEqual(result.memories.map((m) => m.memoryId), ['clean-memory']);
  assert.deepEqual(result.recentHistory.map((h) => h.id), ['h1']);
  assert.deepEqual(result.dropped.contextSections, ['ENGINEERING AUDIT']);
  assert.deepEqual(result.dropped.memories, ['bad-memory']);
  assert.deepEqual(result.dropped.recentHistory, ['h2']);
  assert.equal(loggerCalls.length, 1);
});

test('fallback regeneration keeps only clean core context and strips retrieved memory/history', () => {
  const clean = buildCleanRegenerationContext({
    contextSections: [
      { label: 'VOICE RULES', content: 'Stay in voice.' },
      { label: 'WEB SEARCH RESULTS', content: 'Search result that should not be reused.' },
      { label: 'TIME-SENSITIVE NOTES', content: 'Private note that should not be reused.' },
      { label: 'TONE MODE', content: 'neutral' },
    ],
  });
  assert.deepEqual(clean.map((s) => s.label), ['VOICE RULES', 'TONE MODE']);
});

const { detectContinuationIntent } = require('../src/chat/continuationIntent');
const { detectVoiceNoteRequest, isFakeVoiceNoteAction, stripFakeVoiceNoteAction, buildVoiceNoteScript } = require('../src/chat/voiceNoteIntent');

test('continuation detector catches short confirmation replies', () => {
  for (const text of ['yes', 'yesssss', 'yeah', 'yep', 'no', 'please', 'more', 'continue', 'go on', 'again', 'do it', 'okay', 'mmhmm', 'exactly', 'that', 'this', 'tell me', 'keep going']) {
    assert.equal(detectContinuationIntent(text), true, text);
  }
  assert.equal(detectContinuationIntent('what are you talking about today'), false);
});

test('yes after Just say yes preserves previous assistant and adds continuity block', () => {
  const result = sanitizePromptContext({
    currentUserText: 'yes',
    recentHistory: [
      { id: 'u1', role: 'user', content: 'prompt me' },
      { id: 'a1', role: 'assistant', content: 'Just say yes.' },
    ],
  });
  assert.equal(result.continuity.continuationIntentDetected, true);
  assert.equal(result.continuity.previousAssistantPreserved, true);
  assert.equal(result.recentHistory.at(-1).content, 'Just say yes.');
  assert.equal(result.contextSections.at(-1).label, 'Immediate Conversation Continuity');
});

test('yesssss after Just say yes preserves previous assistant message', () => {
  const result = sanitizePromptContext({ currentUserText: 'yesssss', recentHistory: [{ role: 'assistant', content: 'Just say yes.' }] });
  assert.equal(result.recentHistory[0].content, 'Just say yes.');
});

test('please after keep-going question preserves previous assistant message', () => {
  const result = sanitizePromptContext({ currentUserText: 'please', recentHistory: [{ role: 'assistant', content: 'Do you want me to keep going?' }] });
  assert.equal(result.recentHistory[0].content, 'Do you want me to keep going?');
});

test('safe mode continuity preserves immediate pair when explicitly requested', () => {
  const result = sanitizePromptContext({
    currentUserText: 'keep going',
    preserveImmediateContinuity: true,
    recentHistory: [{ role: 'assistant', content: 'Do you want me to keep going?' }],
  });
  assert.equal(result.continuity.previousAssistantPreserved, true);
  assert.equal(result.continuity.continuityBlockAdded, true);
});

test('corrupted previous assistant message is not injected verbatim', () => {
  const result = sanitizePromptContext({
    currentUserText: 'yes',
    recentHistory: [{ id: 'bad', role: 'assistant', content: 'printStatsYourAss contentassist constructor Passport js' }],
  });
  assert.equal(result.recentHistory[0].content, 'Previous assistant message was corrupted and should be ignored.');
  assert.match(result.contextSections[0].content, /Previous assistant message was corrupted/);
  assert.doesNotMatch(result.contextSections[0].content, /printStatsYourAss/);
});

test('normal standalone messages do not force continuity', () => {
  const result = sanitizePromptContext({ currentUserText: 'tell me about the moon', recentHistory: [{ role: 'assistant', content: 'Just say yes.' }] });
  assert.equal(result.continuity.continuationIntentDetected, false);
  assert.equal(result.continuity.continuityBlockAdded, false);
});

test('voice note intent and fake action helpers route to audio instead of final fake text', () => {
  assert.equal(detectVoiceNoteRequest('send me a voice note lemme hear it'), true);
  assert.equal(isFakeVoiceNoteAction('(sends a voice note)'), true);
  assert.equal(stripFakeVoiceNoteAction('(sends a voice note)'), '');
  assert.notEqual(buildVoiceNoteScript({ userText: 'send me a voice note lemme hear it', replyText: '(sends a voice note)' }), '(sends a voice note)');
});

const { buildVoiceNoteScriptDetails } = require('../src/chat/voiceNoteIntent');
const { fulfillVoiceNoteRequest } = require('../src/bot/events/messageCreate');

test('voice-note detection catches requested trigger phrases', () => {
  for (const phrase of [
    'send me a voice note',
    'say that in your voice',
    'lemme hear it',
    'I want to hear your voice',
    'tell me by voice',
    'voice message',
    'voice memo',
    'send audio',
  ]) {
    assert.equal(detectVoiceNoteRequest(phrase), true, phrase);
  }
  assert.equal(detectVoiceNoteRequest('send me a voice note lemme hear it'), true);
});

test('raw reply stage directions become a clean spokenScript', () => {
  const result = buildVoiceNoteScriptDetails({
    userText: 'send me a voice note lemme hear it',
    replyText: '*leans back, runs a hand through messy morning hair* I miss you, sweetheart.',
  });
  assert.equal(result.strippedStageDirections, true);
  assert.doesNotMatch(result.spokenScript, /asterisk|leans back|runs a hand|messy morning hair/i);
  assert.match(result.spokenScript, /I miss you, sweetheart\./);
});

test('spokenScript contains first-person speech only', () => {
  const result = buildVoiceNoteScriptDetails({
    replyText: 'Dante says, "I am right here." He leans against the counter. His voice is low.',
  });
  assert.doesNotMatch(result.spokenScript, /\bDante\b|\bHe\b|leans against/i);
  assert.match(result.spokenScript, /I am right here/i);
});

test('image prompt markers are not spoken', () => {
  const result = buildVoiceNoteScriptDetails({
    replyText: 'Here.\n\nImage prompt: cinematic portrait, black coat, rain.\n\nI am staying with you.',
  });
  assert.doesNotMatch(result.spokenScript, /image prompt|cinematic portrait|black coat/i);
  assert.match(result.spokenScript, /I am staying with you/);
});

test('audio attachment is sent when provider succeeds', async () => {
  let generatedText = '';
  const reply = await fulfillVoiceNoteRequest({
    replyPayload: { content: '*leans back* I am here.', files: [], generatedAudioIds: [] },
    message: { content: 'send me a voice note', channelId: 'c1', id: 'm1' },
    config: { audio: {}, memory: {} },
    logger: {},
    generatedAudio: null,
    conversationId: 'conv1',
    audioGenerationServiceFactory: () => ({
      generate: async ({ text }) => {
        generatedText = text;
        return { file: { attachment: Buffer.from('audio'), name: 'voice-note.mp3' }, record: { audioId: 'a1' } };
      },
    }),
  });
  assert.equal(reply.files.length, 1);
  assert.deepEqual(reply.generatedAudioIds, ['a1']);
  assert.doesNotMatch(generatedText, /asterisk|leans back/i);
});

test('audio generation failure sends a clear text fallback', async () => {
  const reply = await fulfillVoiceNoteRequest({
    replyPayload: { content: 'I am here.', files: [], generatedAudioIds: [] },
    message: { content: 'send audio', channelId: 'c1', id: 'm1' },
    config: { audio: {}, memory: {} },
    logger: {},
    generatedAudio: null,
    conversationId: 'conv1',
    audioGenerationServiceFactory: () => ({ generate: async () => { throw new Error('provider down'); } }),
  });
  assert.equal(reply.files.length, 0);
  assert.match(reply.content, /audio failed to generate/i);
});

const { detectImageIntent, extractImagePrompt, stripImageIntentFromText, buildImageIntentRequest } = require('../src/chat/imageIntent');
const { fulfillImageIntentRequest } = require('../src/bot/events/messageCreate');

test('LLM output containing generated image marker triggers image generation and consumes placeholder', async () => {
  let generatedPrompt = '';
  const reply = await fulfillImageIntentRequest({
    replyPayload: { content: 'Here it is.\n\n![generated image]\nStorm-grey morning light through rain-streaked glass.', files: [], generatedImageIds: [] },
    message: { content: 'make me an image', channelId: 'c1', id: 'm1' },
    config: { imageGeneration: { model: 'test-image-model' }, memory: {} },
    logger: {},
    generatedImages: {},
    conversationId: 'conv1',
    imageGenerationServiceFactory: () => ({
      generate: async ({ prompt }) => {
        generatedPrompt = prompt;
        return { file: { attachment: Buffer.from('img'), name: 'image.png' }, record: { imageId: 'img1', model: 'test-image-model' } };
      },
    }),
  });
  assert.equal(generatedPrompt, 'Storm-grey morning light through rain-streaked glass.');
  assert.equal(reply.files.length, 1);
  assert.deepEqual(reply.generatedImageIds, ['img1']);
  assert.doesNotMatch(reply.content, /!\[generated image\]|Storm-grey morning light/i);
});

test('raw image placeholder is not sent to Discord text', () => {
  const cleaned = stripImageIntentFromText('Fine.\n\n[generated image]\nRaw prompt text nobody should see.\n\nDone.');
  assert.doesNotMatch(cleaned, /generated image|Raw prompt text/i);
  assert.match(cleaned, /Fine\.|Done\./);
});

test('sanitizer does not remove media intent before execution', () => {
  const result = sanitizePromptContext({
    currentUserText: 'make the image',
    recentHistory: [{ role: 'assistant', content: '![generated image]\nStorm-grey morning light' }],
  });
  assert.equal(detectImageIntent(result.recentHistory[0].content), true);
  assert.equal(extractImagePrompt(result.recentHistory[0].content), 'Storm-grey morning light');
});

test('corruption fallback still preserves structured media request for execution', async () => {
  const mediaRequest = buildImageIntentRequest({ text: 'Image prompt: black wolf under a red moon' });
  const reply = await fulfillImageIntentRequest({
    replyPayload: { content: 'I had to clean that up.', files: [], generatedImageIds: [], mediaRequest },
    message: { content: 'send the image', channelId: 'c1', id: 'm1' },
    config: { imageGeneration: { model: 'test-image-model' }, memory: {} },
    logger: {},
    generatedImages: {},
    conversationId: 'conv1',
    imageGenerationServiceFactory: () => ({
      generate: async () => ({ file: { attachment: Buffer.from('img'), name: 'image.png' }, record: { imageId: 'img2', model: 'test-image-model' } }),
    }),
  });
  assert.equal(reply.files.length, 1);
  assert.deepEqual(reply.generatedImageIds, ['img2']);
});

test('scheduled and journal image actions send attachments through structured media request', async () => {
  for (const sourceSurface of ['scheduled_action', 'journal_action']) {
    const reply = await fulfillImageIntentRequest({
      replyPayload: { content: 'Short note only.', files: [], generatedImageIds: [], mediaRequest: { detected: true, prompt: `${sourceSurface} candlelit room`, cleanedText: 'Short note only.', triggerSource: sourceSurface } },
      message: { content: '', channelId: 'c1', id: 'm1' },
      config: { imageGeneration: { model: 'test-image-model' }, memory: {} },
      logger: {},
      generatedImages: {},
      conversationId: 'conv1',
      imageGenerationServiceFactory: () => ({
        generate: async () => ({ file: { attachment: Buffer.from('img'), name: `${sourceSurface}.png` }, record: { imageId: sourceSurface, model: 'test-image-model' } }),
      }),
    });
    assert.equal(reply.files.length, 1, sourceSurface);
    assert.deepEqual(reply.generatedImageIds, [sourceSurface]);
  }
});

test('image provider failure sends clear fallback without pretending attachment', async () => {
  const reply = await fulfillImageIntentRequest({
    replyPayload: { content: 'Image prompt: storm over a tower', files: [], generatedImageIds: [] },
    message: { content: 'make an image', channelId: 'c1', id: 'm1' },
    config: { imageGeneration: { model: 'test-image-model' }, memory: {} },
    logger: {},
    generatedImages: {},
    conversationId: 'conv1',
    imageGenerationServiceFactory: () => ({ generate: async () => { throw new Error('provider exploded'); } }),
  });
  assert.equal(reply.files.length, 0);
  assert.match(reply.content, /image generator failed/i);
});
