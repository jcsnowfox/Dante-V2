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
