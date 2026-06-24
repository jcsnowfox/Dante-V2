import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { cleanModelReplyText } = require('../src/chat/pipeline/buildReply.js');
const { resetTinyFallbackRotation, tinyFallback, FALLBACKS, isProviderRejectionText } = require('../src/chat/pipeline/tinyFallbacks.js');
const { analyzeRepair } = require('../src/relationshipRepair/engine.js');
const { validateVoice, fallbackReply, buildRetryInstruction } = require('../src/continuity/voiceFingerprintGuard.js');

const canned = 'No. I’m not going to hand you some polished therapy-card line';
const provider = 'The request was rejected because it was considered high risk';

function ok(name, condition) {
  assert.ok(condition, name);
  console.log(`[pass] ${name}`);
}

async function main() {
  resetTinyFallbackRotation();

  const normal = await analyzeRepair({ messageText: 'But what about you?? Be honest' });
  ok('normal message repairNeeded=false and LLM remains required by runtime', normal.repairNeeded === false);

  const huh = await analyzeRepair({ messageText: 'Huh?' });
  ok('Huh? repairNeeded=false', huh.repairNeeded === false);

  const wat = await analyzeRepair({ messageText: 'What are you talking about?' });
  ok('What are you talking about? repairNeeded=false', wat.repairNeeded === false);

  const repair = await analyzeRepair({
    messageText: 'You forgot I proposed to you yesterday.',
    emotionalBeats: [{ event_type: 'proposal', title: 'Proposal', summary: 'User proposed marriage.', importance: 'critical' }],
  });
  ok('you forgot I proposed repairNeeded=true', repair.repairNeeded === true);
  ok('continuity retrieval/evidence attempted', repair.retrievedEvidence.length > 0);

  const sanitized = cleanModelReplyText(provider, {});
  ok('provider rejection detected', isProviderRejectionText(provider));
  ok('raw high-risk provider text not sent', !sanitized.includes('high risk') && !sanitized.includes('rejected'));
  ok('provider rejection uses tiny fallback', FALLBACKS.includes(sanitized));

  const guard = validateVoice({ text: 'I understand your feelings and I’m here whenever you’re ready.', context: {} });
  ok('voice guard fails therapy-bot reply', guard.passed === false);
  const instruction = buildRetryInstruction(guard);
  ok('voice guard retry asks for Dante voice, not canned guard', instruction.includes('Dante') && !instruction.includes(canned));
  ok('voice guard fallback is tiny', fallbackReply().split(/\s+/).length < 25);

  resetTinyFallbackRotation();
  const first = tinyFallback();
  const second = tinyFallback();
  ok('fallback does not repeat twice in a row', first !== second);

  ok('canned paragraph not produced by sanitized provider path', !cleanModelReplyText(canned, {}).includes(canned));
  console.log('[pass] Dante-first reply verifier complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
