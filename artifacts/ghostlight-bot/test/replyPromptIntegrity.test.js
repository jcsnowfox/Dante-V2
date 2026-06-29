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
