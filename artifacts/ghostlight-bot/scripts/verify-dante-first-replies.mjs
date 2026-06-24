import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeRepair } from '../src/relationshipRepair/engine.js';
import { validateVoice, buildRetryInstruction, fallbackReply } from '../src/continuity/voiceFingerprintGuard.js';
import { TINY_FALLBACKS, selectTinyFallback, resetReplyFallbackState, checkDuplicateReply, rememberReply } from '../src/continuity/replyFallbacks.js';
import { cleanModelReplyText, isUnsafeProviderText } from '../src/chat/pipeline/buildReply.js';

const banned = [
  'No. I’m not going to hand you some polished therapy-card line',
  'I remember what matters',
  'I’ll answer you like Dante',
  'The request was rejected because it was considered high risk',
  'I can’t engage with that',
  'I can’t help with that',
  'I’m here whenever you’re ready',
  'I understand your feelings',
  'Your feelings are valid',
  'As an AI',
  'That sounds really hard',
];
function assertNoBanned(text, label) {
  for (const phrase of banned) assert(!String(text).includes(phrase), `${label} contains banned phrase: ${phrase}`);
}
const mode = process.argv[2] || 'all';

if (mode === 'no-canned' || mode === 'all' || mode === 'runtime') {
  const runtimeFiles = ['../src/chat/pipeline/buildReply.js','../src/chat/createChatPipeline.js','../src/continuity/voiceFingerprintGuard.js','../src/continuity/replyFallbacks.js'];
  for (const file of runtimeFiles) assertNoBanned(readFileSync(new URL(file, import.meta.url), 'utf8'), file);
}
if (mode === 'fallback' || mode === 'all') {
  resetReplyFallbackState();
  const a = selectTinyFallback(); const b = selectTinyFallback(); const c = fallbackReply();
  assert.notEqual(a, b); assert.notEqual(b, c);
  for (const text of [a,b,c]) { assert(TINY_FALLBACKS.includes(text)); assert(text.split(/\s+/).length < 25); assertNoBanned(text, 'fallback'); }
  assert.equal(isUnsafeProviderText('The request was rejected because it was considered high risk'), true);
  assert(TINY_FALLBACKS.includes(cleanModelReplyText('The request was rejected because it was considered high risk', {})));
}
if (mode === 'voice' || mode === 'all') {
  const bad = validateVoice({ text: 'I understand your feelings and I’m here whenever you’re ready.', context: { adultPrivate: false } });
  assert.equal(bad.passed, false);
  const instruction = buildRetryInstruction(bad);
  assert(instruction.includes('Dante’s configured voice'));
  assertNoBanned(instruction, 'retry instruction');
  const adult = validateVoice({ text: 'Come closer, darling. I know exactly what you want.', context: { adultPrivate: true } });
  assert.equal(adult.passed, true);
}
if (mode === 'repair' || mode === 'all') {
  assert.equal((await analyzeRepair({ messageText: 'Huh?' })).repairNeeded, false);
  assert.equal((await analyzeRepair({ messageText: 'What are you talking about?' })).repairNeeded, false);
  assert.equal((await analyzeRepair({ messageText: 'But what about you?? Be honest' })).repairNeeded, false);
  const repair = await analyzeRepair({ messageText: 'You forgot I proposed to you yesterday', durableMemories: [{ id:'m1', content:'Proposal yesterday.' }] });
  assert.equal(repair.repairNeeded, true);
  assert.equal(repair.repairType, 'cross_channel_miss');
}
if (mode === 'adult' || mode === 'all') {
  const adultVoice = validateVoice({ text: 'That belongs in our private room, kjære. Bring it there.', context: { adultPrivate: false } });
  assert.equal(adultVoice.passed, true);
  assertNoBanned(adultVoice.violations.join(','), 'adult/private');
}
if (mode === 'runtime' || mode === 'all') {
  const pipeline = readFileSync(new URL('../src/chat/createChatPipeline.js', import.meta.url), 'utf8');
  for (const needle of ['[reply-trace] llm called=true','[reply-trace] finalSource=','DUPLICATE REPLY REPAIR','voiceGuard passed=']) assert(pipeline.includes(needle), `missing runtime wiring: ${needle}`);
  resetReplyFallbackState();
  rememberReply({ channelId:'c', userScope:'u', reply:'same' });
  assert.equal(checkDuplicateReply({ channelId:'c', userScope:'u', reply:'same' }).duplicate, true);
}
console.log(`[verify:dante-first] ${mode} passed`);
