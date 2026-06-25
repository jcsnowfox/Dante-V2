import assert from 'node:assert/strict';
import { createUserEnergyStore } from '../src/storage/userEnergyObservations.js';
import { detectUserEnergy, saveEnergyObservation, retrieveRecentEnergy, formatUserEnergyPrelude } from '../src/humanSimulation/userEnergyEngine.js';

const store = createUserEnergyStore({});
await store.init();

const userScope = 'test_user';
const companionId = 'Dante';

// --- Detection tests ---

// Scenario E: explicit frustration
const textE = "I'm so fucking frustrated I could scream.";
const detectedE = detectUserEnergy(textE);
assert(detectedE, 'Should detect energy in Scenario E text');
assert(
  detectedE.energy_state === 'frustrated' || detectedE.energy_state === 'angry',
  `Expected frustrated or angry, got ${detectedE.energy_state}`
);
assert(detectedE.confidence >= 0.7, `Confidence should be >= 0.7, got ${detectedE.confidence}`);

// Scenario F: overloaded
const textF = "I can't deal with a giant explanation, just tell me what to do next.";
const detectedF = detectUserEnergy(textF);
assert(detectedF, 'Should detect energy in Scenario F text');
assert(
  detectedF.energy_state === 'overloaded' || detectedF.energy_state === 'focused',
  `Expected overloaded or focused, got ${detectedF.energy_state}`
);
assert(detectedF.confidence >= 0.7, `Confidence should be >= 0.7, got ${detectedF.confidence}`);

// Tired
const textTired = "I'm so tired, can barely keep my eyes open.";
const detectedTired = detectUserEnergy(textTired);
assert(detectedTired?.energy_state === 'tired', `Expected tired, got ${detectedTired?.energy_state}`);

// Excited
const textExcited = "I'm so excited about this, I'm pumped!";
const detectedExcited = detectUserEnergy(textExcited);
assert(detectedExcited?.energy_state === 'excited', `Expected excited, got ${detectedExcited?.energy_state}`);

// Project mode
const textProject = "I'm in project mode, let's focus.";
const detectedProject = detectUserEnergy(textProject);
assert(detectedProject?.energy_state === 'project_mode', `Expected project_mode, got ${detectedProject?.energy_state}`);

// Neutral short text — should either return null or low-confidence unknown
const textNeutral = "Okay.";
const detectedNeutral = detectUserEnergy(textNeutral);
// Either null or very low confidence — should not produce high-confidence wrong state
if (detectedNeutral) {
  assert(detectedNeutral.confidence < 0.7, `Neutral text should not produce high confidence: ${detectedNeutral.confidence}`);
}

// --- Storage tests ---

const savedE = await saveEnergyObservation({
  detected: detectedE,
  store,
  userScope,
  companionId,
  sourceChannelId: 'ch-general',
  sourceMessageId: 'msg-e01',
  adultPrivate: false,
});
assert(savedE, 'Should save energy observation');
assert(savedE.user_scope === userScope, 'user_scope must match');
assert(savedE.companion_id === companionId, 'companion_id must match');
assert(savedE.energy_state === detectedE.energy_state, 'energy_state must match');
assert(savedE.confidence >= 0.7, 'saved confidence should be high');
assert(savedE.adult_context === false, 'non-private message must have adult_context=false');
assert(savedE.privacy_scope === 'normal', 'non-private message must have privacy_scope=normal');

// Save private observation
const savedPrivate = await saveEnergyObservation({
  detected: { energy_state: 'flirty', confidence: 0.8, evidence_summary: 'flirty context' },
  store,
  userScope,
  companionId,
  sourceChannelId: 'ch-private',
  sourceMessageId: 'msg-priv01',
  adultPrivate: true,
});
assert(savedPrivate.adult_context === true, 'Private energy observation must have adult_context=true');
assert(savedPrivate.privacy_scope === 'private', 'Private energy observation must have privacy_scope=private');

// --- Retrieval tests ---

// Normal channel — should not return private observations
const latestNormal = await retrieveRecentEnergy({ store, userScope, companionId, adultPrivate: false });
assert(latestNormal, 'Should return latest observation for normal channel');
assert(!latestNormal.adult_context, 'Latest normal observation must not be adult/private');

// Private channel — should return most recent including private
const latestPrivate = await retrieveRecentEnergy({ store, userScope, companionId, adultPrivate: true });
assert(latestPrivate, 'Should return latest observation for private channel');

// List observations
const list = await store.listObservations({ user_scope: userScope, companion_id: companionId, include_adult: true, limit: 10 });
assert(Array.isArray(list), 'Should return array');
assert(list.length >= 2, `Should have at least 2 observations, got ${list.length}`);
// Ordered by created_at DESC
for (let i = 1; i < list.length; i++) {
  assert(new Date(list[i - 1].created_at) >= new Date(list[i].created_at), 'List should be ordered newest first');
}

// --- Prelude format tests ---

const preludeE = formatUserEnergyPrelude(detectedE);
assert(preludeE, 'Should produce prelude for frustrated/angry state');
assert(preludeE.label === 'USER ENERGY', 'prelude label should be USER ENERGY');
assert(preludeE.content.includes(detectedE.energy_state), 'prelude should mention energy state');
assert(preludeE.content.toLowerCase().includes('direct') || preludeE.content.toLowerCase().includes('shorter'), 'frustrated/angry prelude should include direct/shorter guidance');

const preludeF = formatUserEnergyPrelude(detectedF);
assert(preludeF, 'Should produce prelude for overloaded/focused state');
assert(
  preludeF.content.toLowerCase().includes('concise') ||
  preludeF.content.toLowerCase().includes('direct') ||
  preludeF.content.toLowerCase().includes('shorter'),
  'overloaded prelude should include concise/direct guidance'
);

// Style guide must not recommend therapy-bot phrasing (saying "No therapy-bot phrasing" is correct)
const guideText = preludeE.content.toLowerCase();
const recommendsTherapy = /\b(use|be|sound|act)\s+(like\s+a?\s+)?(therapeutic|therapist|therapy.bot)/.test(guideText);
assert(!recommendsTherapy, 'Style guide must not recommend therapy-bot phrasing');

// Unknown state should not produce prelude
const noPrelude = formatUserEnergyPrelude({ energy_state: 'unknown', confidence: 0.5 });
assert(noPrelude === null, 'unknown energy state should return null prelude');

// Delete test
const deleted = await store.deleteObservation({ id: savedE.id });
assert(deleted === true, 'Should delete observation');

console.log('[verify:user-energy-detector] PASS');
