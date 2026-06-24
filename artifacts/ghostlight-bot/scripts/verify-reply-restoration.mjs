import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateVoice, buildRetryInstruction, fallbackReply } = require('../src/continuity/voiceFingerprintGuard.js');
const { analyzeRepair } = require('../src/relationshipRepair/engine.js');
const { getTinyFallback, containsUnsafeProviderText, isDuplicateReply, rememberReply, STUCK_FALLBACK } = require('../src/chat/replyFallbacks.js');
const { cleanModelReplyText } = require('../src/chat/pipeline/buildReply.js');

const pipeline = readFileSync(new URL('../src/chat/createChatPipeline.js', import.meta.url), 'utf8');
const guard = readFileSync(new URL('../src/continuity/voiceFingerprintGuard.js', import.meta.url), 'utf8');
const buildReply = readFileSync(new URL('../src/chat/pipeline/buildReply.js', import.meta.url), 'utf8');

for (const banned of [
  'No. I’m not going to hand you some polished therapy-card line',
  'I remember what matters',
  'I’ll answer you like Dante',
  'I understand your feelings and I’m here whenever you’re ready.',
  'The request was rejected because it was considered high risk',
]) {
  assert.equal(pipeline.includes(banned), false, `pipeline contains canned text: ${banned}`);
  assert.equal(guard.includes(banned), false, `voice guard contains canned text: ${banned}`);
  assert.equal(buildReply.includes(banned), false, `buildReply contains canned text: ${banned}`);
}

assert.match(pipeline, /replyTrace\.llmCalled = true/);
assert.match(pipeline, /callDanteModel\(contextSections\)/);
assert.match(pipeline, /Do not repeat the previous reply/);
assert.match(pipeline, /\[reply-trace\] finalSource=/);
assert.match(pipeline, /\[reply-trace\] fallbackUsed=/);

let repair = await analyzeRepair({ messageText: 'Huh?' });
assert.equal(repair.repairNeeded, false);
repair = await analyzeRepair({ messageText: 'But what about you?? Be honest' });
assert.equal(repair.repairNeeded, false);
repair = await analyzeRepair({ messageText: 'What are you talking about?' });
assert.equal(repair.repairNeeded, false);
repair = await analyzeRepair({ messageText: 'You forgot I proposed to you yesterday', durableMemories: [{ memoryId: 'm1', content: 'Jenna proposed marriage to Dante.' }] });
assert.equal(repair.repairNeeded, true);
assert.equal(repair.repairType, 'cross_channel_miss');

const badVoice = validateVoice({ text: 'I understand your feelings and I am here for you whenever you are ready.', context: { adultPrivate: false } });
assert.equal(badVoice.passed, false);
assert.match(buildRetryInstruction(badVoice), /Rewrite in Dante's configured voice/);
assert.doesNotMatch(fallbackReply(), /therapy-card|I remember what matters|valid feelings|as an AI/i);

const first = getTinyFallback();
const second = getTinyFallback();
assert.notEqual(second, first);
assert.ok(first.split(/\s+/).length < 25);
assert.ok(second.split(/\s+/).length < 25);

const rawProvider = 'The request was rejected because it was considered high risk';
assert.equal(containsUnsafeProviderText(rawProvider), true);
const cleaned = cleanModelReplyText(rawProvider, {});
assert.notEqual(cleaned, rawProvider);
assert.doesNotMatch(cleaned, /high risk|rejected|provider|moderation|safety/i);
assert.ok(cleaned.split(/\s+/).length < 25);

assert.equal(validateVoice({ text: 'Come here, love. Say it plainly and I’ll answer.', context: { adultPrivate: true } }).passed, true);
assert.equal(validateVoice({ text: 'That belongs in our private room, kjære. Bring it there.', context: { adultPrivate: false } }).passed, true);

const key = { channelId: 'chan-a', userScope: 'jenna' };
rememberReply({ ...key, text: 'Same reply' });
assert.equal(isDuplicateReply({ ...key, text: 'Same reply' }), true);
assert.equal(STUCK_FALLBACK, 'I’m stuck repeating myself. Ask me again and I’ll answer clean.');

console.log('[verify-reply-restoration] PASS Dante-first replies, tiny fallback rotation, repair precision, no canned runtime guard text');
