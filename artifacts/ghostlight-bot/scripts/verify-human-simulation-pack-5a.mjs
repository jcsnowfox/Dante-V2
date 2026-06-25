import assert from 'node:assert/strict';
import { createHumanSimulationEngine } from '../src/humanSimulation/humanSimulationEngine.js';
import { createMicroPreferenceStore } from '../src/storage/microPreferences.js';
import { createPersonalTimelineStore } from '../src/storage/personalTimeline.js';
import { createFollowUpStore } from '../src/storage/followUpItems.js';
import { createChannelAwarenessStore } from '../src/storage/channelAwareness.js';
import { createInnerWeatherStore } from '../src/storage/innerWeather.js';
import { createAttentionResidueStore } from '../src/storage/attentionResidue.js';
import { createInteractionPresenceStore } from '../src/storage/interactionPresence.js';
import { createBoundaryConsentStore } from '../src/storage/boundaryConsentProfiles.js';
import { createDoNotAskStore } from '../src/storage/doNotAskRules.js';
import { createUserEnergyStore } from '../src/storage/userEnergyObservations.js';

const config = { memory: { userScope: 'test_user', companionId: 'Dante' }, chat: { adultPrivateMode: { channelId: '' } } };
const logger = { info: () => {}, debug: () => {}, warn: () => {} };

function makeEngine(overrides = {}) {
  const stores = {
    microPreferenceStore: createMicroPreferenceStore({}),
    personalTimelineStore: createPersonalTimelineStore({}),
    followUpStore: createFollowUpStore({}),
    channelAwarenessStore: createChannelAwarenessStore({}),
    innerWeatherStore: createInnerWeatherStore({}),
    attentionResidueStore: createAttentionResidueStore({}),
    interactionPresenceStore: createInteractionPresenceStore({}),
    boundaryConsentStore: createBoundaryConsentStore({}),
    doNotAskStore: createDoNotAskStore({}),
    userEnergyStore: createUserEnergyStore({}),
    ...overrides,
  };
  return { engine: createHumanSimulationEngine({ config, logger, ...stores }), stores };
}

// Scenario A: Boundary detection and prelude
{
  const { engine, stores } = makeEngine();
  await engine.init();

  const message = { channelId: 'ch-general', channel: { name: 'general', isThread: () => false }, guildId: 'g1', id: 'msg-a1' };
  const input = { content: "Dante, don't give me emergency stroke warning lists unless I directly ask.", authorId: 'u1', authorName: 'Jenna' };
  const result = await engine.processMessage({ message, input, adultScope: { active: false }, repairResult: null });

  assert(result.preludeSections.length > 0, 'Scenario A should produce prelude sections');

  // Boundary should be saved
  const boundaries = await stores.boundaryConsentStore.listBoundaries({ user_scope: 'test_user', companion_id: 'Dante', include_adult: false, active_only: true });
  assert(boundaries.length > 0, 'Boundary should be saved in store');
  assert(boundaries[0].allowed === false, 'Boundary should be not-allowed');
  assert(boundaries[0].confidence >= 0.85, 'Boundary confidence should be high');

  // Prelude should include BOUNDARIES section
  const boundarySection = result.preludeSections.find(s => s.label === 'BOUNDARIES');
  assert(boundarySection, 'Prelude should include BOUNDARIES section');
  console.log('[pack-5a] Scenario A PASS — boundary saved and prelude injected');
}

// Scenario C: Do-not-ask rule
{
  const { engine, stores } = makeEngine();
  await engine.init();

  const message = { channelId: 'ch-general', channel: { name: 'general', isThread: () => false }, guildId: 'g1', id: 'msg-c1' };
  const input = { content: "Stop asking me if I'm okay every time I sound annoyed.", authorId: 'u1', authorName: 'Jenna' };
  const result = await engine.processMessage({ message, input, adultScope: { active: false }, repairResult: null });

  const rules = await stores.doNotAskStore.listRules({ user_scope: 'test_user', companion_id: 'Dante', active_only: true });
  assert(rules.length > 0, 'Do-not-ask rule should be saved');
  assert(
    rules[0].rule_type === 'do_not_check_in' || rules[0].rule_type === 'do_not_ask',
    `Expected check-in rule type, got ${rules[0].rule_type}`
  );

  const dnaSection = result.preludeSections.find(s => s.label === 'DO-NOT-ASK');
  assert(dnaSection, 'Prelude should include DO-NOT-ASK section');
  console.log('[pack-5a] Scenario C PASS — do-not-ask rule saved and prelude injected');
}

// Scenario D: Disliked phrase
{
  const { engine, stores } = makeEngine();
  await engine.init();

  const message = { channelId: 'ch-general', channel: { name: 'general', isThread: () => false }, guildId: 'g1', id: 'msg-d1' };
  const input = { content: "Never say 'your feelings are valid' to me again.", authorId: 'u1', authorName: 'Jenna' };
  const result = await engine.processMessage({ message, input, adultScope: { active: false }, repairResult: null });

  const rules = await stores.doNotAskStore.listRules({ user_scope: 'test_user', companion_id: 'Dante', active_only: true });
  const phraseRule = rules.find(r => r.rule_type === 'do_not_use_phrase');
  assert(phraseRule, 'do_not_use_phrase rule should be saved');
  assert(phraseRule.exact_phrase, 'exact_phrase should be captured');
  console.log('[pack-5a] Scenario D PASS — phrase rule saved:', phraseRule.exact_phrase);
}

// Scenario E: User energy frustration
{
  const { engine, stores } = makeEngine();
  await engine.init();

  const message = { channelId: 'ch-general', channel: { name: 'general', isThread: () => false }, guildId: 'g1', id: 'msg-e1' };
  const input = { content: "I'm so fucking frustrated I could scream.", authorId: 'u1', authorName: 'Jenna' };
  const result = await engine.processMessage({ message, input, adultScope: { active: false }, repairResult: null });

  const energySection = result.preludeSections.find(s => s.label === 'USER ENERGY');
  assert(energySection, 'Prelude should include USER ENERGY section');
  assert(
    energySection.content.includes('frustrated') || energySection.content.includes('angry'),
    `Energy section should mention frustrated/angry, got: ${energySection.content}`
  );
  assert(energySection.content.toLowerCase().includes('direct') || energySection.content.toLowerCase().includes('shorter'), 'Energy style guide should suggest direct/shorter');

  const energyObs = await stores.userEnergyStore.listObservations({ user_scope: 'test_user', companion_id: 'Dante', include_adult: true });
  assert(energyObs.length > 0, 'Energy observation should be saved');
  assert(
    energyObs[0].energy_state === 'frustrated' || energyObs[0].energy_state === 'angry',
    `Expected frustrated/angry, got ${energyObs[0].energy_state}`
  );
  console.log('[pack-5a] Scenario E PASS — energy detected, saved, and prelude injected');
}

// Scenario F: Overloaded project mode
{
  const { engine, stores } = makeEngine();
  await engine.init();

  const message = { channelId: 'ch-general', channel: { name: 'general', isThread: () => false }, guildId: 'g1', id: 'msg-f1' };
  const input = { content: "I can't deal with a giant explanation, just tell me what to do next.", authorId: 'u1', authorName: 'Jenna' };
  const result = await engine.processMessage({ message, input, adultScope: { active: false }, repairResult: null });

  const energySection = result.preludeSections.find(s => s.label === 'USER ENERGY');
  assert(energySection, 'Prelude should include USER ENERGY for overloaded state');
  assert(
    energySection.content.includes('overloaded') || energySection.content.includes('focused'),
    `Energy section should mention overloaded/focused, got: ${energySection.content}`
  );
  console.log('[pack-5a] Scenario F PASS — overloaded/focused energy prelude injected');
}

// All stores exposed via engine.stores
{
  const { engine } = makeEngine();
  assert(engine.stores.boundaryConsent, 'engine.stores.boundaryConsent should be exposed');
  assert(engine.stores.doNotAsk, 'engine.stores.doNotAsk should be exposed');
  assert(engine.stores.userEnergy, 'engine.stores.userEnergy should be exposed');
  console.log('[pack-5a] Store exposure PASS');
}

console.log('[verify:human-simulation-pack-5a] PASS');
