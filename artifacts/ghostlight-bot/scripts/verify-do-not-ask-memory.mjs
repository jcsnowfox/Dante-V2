import assert from 'node:assert/strict';
import { createDoNotAskStore } from '../src/storage/doNotAskRules.js';
import { detectDoNotAskLanguage, saveDoNotAskRule, retrieveActiveRules, formatDoNotAskPrelude, isPhraseBanned } from '../src/humanSimulation/doNotAskEngine.js';

const store = createDoNotAskStore({});
await store.init();

const userScope = 'test_user';
const companionId = 'Dante';

// --- Detection tests ---

// Scenario C: check-in rule
const textC = "Stop asking me if I'm okay every time I sound annoyed.";
const detectedC = detectDoNotAskLanguage(textC);
assert(detectedC, 'Should detect do-not-ask rule in Scenario C text');
assert(
  detectedC.rule_type === 'do_not_check_in' || detectedC.rule_type === 'do_not_ask',
  `Expected check-in type, got ${detectedC.rule_type}`
);
assert(detectedC.confidence >= 0.85, `Confidence should be >= 0.85, got ${detectedC.confidence}`);

// Scenario D: disliked phrase
const textD = "Never say 'your feelings are valid' to me again.";
const detectedD = detectDoNotAskLanguage(textD);
assert(detectedD, 'Should detect do-not-use-phrase rule in Scenario D text');
assert(detectedD.rule_type === 'do_not_use_phrase', `Expected do_not_use_phrase, got ${detectedD.rule_type}`);
assert(detectedD.exact_phrase, 'Should extract the exact phrase');
assert(detectedD.exact_phrase.includes('valid') || detectedD.exact_phrase.includes('feelings'), `Phrase should contain 'valid' or 'feelings', got: ${detectedD.exact_phrase}`);

// Emergency list opt-out
const textE = "Don't give me emergency warnings unless I ask.";
const detectedE = detectDoNotAskLanguage(textE);
assert(detectedE, 'Should detect emergency list opt-out');
assert(
  detectedE.rule_type === 'do_not_send_emergency_list' || detectedE.rule_type === 'do_not_escalate',
  `Expected emergency list type, got ${detectedE.rule_type}`
);

// Neutral text should not trigger
const noMatch = detectDoNotAskLanguage("Can we go back to the project?");
assert(noMatch === null, 'Neutral text should not trigger rule detection');

// --- Storage tests ---

const savedC = await saveDoNotAskRule({
  detected: detectedC,
  store,
  userScope,
  companionId,
  sourceChannelId: 'ch-general',
  sourceMessageId: 'msg-c01',
  adultPrivate: false,
});
assert(savedC, 'Should save do-not-ask rule');
assert(savedC.user_scope === userScope, 'user_scope must match');
assert(savedC.companion_id === companionId, 'companion_id must match');
assert(savedC.rule_type === detectedC.rule_type, 'rule_type must match');
assert(savedC.active === true, 'Rule should be active');

const savedD = await saveDoNotAskRule({
  detected: detectedD,
  store,
  userScope,
  companionId,
  sourceChannelId: 'ch-general',
  sourceMessageId: 'msg-d01',
  adultPrivate: false,
});
assert(savedD, 'Should save do-not-use-phrase rule');
assert(savedD.exact_phrase, 'exact_phrase must be saved');

const savedE = await saveDoNotAskRule({
  detected: detectedE,
  store,
  userScope,
  companionId,
  sourceChannelId: 'ch-general',
  sourceMessageId: 'msg-e01',
  adultPrivate: false,
});
assert(savedE, 'Should save emergency list rule');

// --- Retrieval tests ---

const activeRules = await retrieveActiveRules({ store, userScope, companionId, adultPrivate: false });
assert(Array.isArray(activeRules), 'Should return array');
assert(activeRules.length >= 3, `Should have at least 3 rules, got ${activeRules.length}`);

// --- Prelude format tests ---

const prelude = formatDoNotAskPrelude(activeRules, false);
assert(prelude, 'Should produce prelude when rules exist');
assert(prelude.label === 'DO-NOT-ASK', 'prelude label should be DO-NOT-ASK');
assert(typeof prelude.content === 'string', 'prelude content should be string');
// The phrase rule should appear in prelude
assert(prelude.content.includes('do_not_use_phrase'), 'Prelude should include phrase rule type');

// --- isPhraseBanned test ---

const bannedCheck = isPhraseBanned('your feelings are valid and important', activeRules);
// If the exact phrase was captured correctly
if (savedD.exact_phrase && savedD.exact_phrase.length > 3) {
  const bannedCheck2 = isPhraseBanned(`I think ${savedD.exact_phrase}`, activeRules);
  assert(bannedCheck2, `isPhraseBanned should return true when phrase "${savedD.exact_phrase}" is present`);
}

// --- Deactivation test ---

const deactivated = await store.deactivate({ id: savedC.id });
assert(deactivated.active === false, 'Deactivated rule should be inactive');

const afterDeactivate = await store.listRules({ user_scope: userScope, companion_id: companionId, active_only: true });
assert(!afterDeactivate.some(r => r.id === savedC.id), 'Deactivated rule must not appear in active_only list');

// --- Expiry test ---

const expiredDate = new Date(Date.now() - 1000).toISOString(); // 1 second ago
const withExpiry = await store.setExpiry({ id: savedD.id, expiry_at: expiredDate });
assert(withExpiry.expiry_at, 'expiry_at should be set');

// Expired rule should not appear in active list
const afterExpiry = await store.listRules({ user_scope: userScope, companion_id: companionId, active_only: true });
assert(!afterExpiry.some(r => r.id === savedD.id), 'Expired rule must not appear in active list');

console.log('[verify:do-not-ask-memory] PASS');
