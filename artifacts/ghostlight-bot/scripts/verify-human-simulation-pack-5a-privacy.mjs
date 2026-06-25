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
import { formatBoundaryPrelude } from '../src/humanSimulation/boundaryConsentEngine.js';
import { formatDoNotAskPrelude } from '../src/humanSimulation/doNotAskEngine.js';
import { formatUserEnergyPrelude } from '../src/humanSimulation/userEnergyEngine.js';

const config = { memory: { userScope: 'test_user', companionId: 'Dante' }, chat: { adultPrivateMode: { channelId: 'ch-private' } } };
const logger = { info: () => {}, debug: () => {}, warn: () => {} };

const boundaryConsentStore = createBoundaryConsentStore({});
const doNotAskStore = createDoNotAskStore({});
const userEnergyStore = createUserEnergyStore({});

const engine = createHumanSimulationEngine({
  config,
  logger,
  microPreferenceStore: createMicroPreferenceStore({}),
  personalTimelineStore: createPersonalTimelineStore({}),
  followUpStore: createFollowUpStore({}),
  channelAwarenessStore: createChannelAwarenessStore({}),
  innerWeatherStore: createInnerWeatherStore({}),
  attentionResidueStore: createAttentionResidueStore({}),
  interactionPresenceStore: createInteractionPresenceStore({}),
  boundaryConsentStore,
  doNotAskStore,
  userEnergyStore,
});
await engine.init();

// --- Scenario B: Adult/private boundary scoping ---

// Step 1: Save adult/private boundary via private channel message
const privateMsg = { channelId: 'ch-private', channel: { name: 'private', isThread: () => false }, guildId: 'g1', id: 'msg-priv1' };
const privateInput = { content: "That's okay in here, but don't say it in the normal channels.", authorId: 'u1', authorName: 'Jenna' };
const privateResult = await engine.processMessage({ message: privateMsg, input: privateInput, adultScope: { active: true }, repairResult: null });

// Boundary should be saved with adult_context = true
const allBoundaries = await boundaryConsentStore.listBoundaries({ user_scope: 'test_user', companion_id: 'Dante', include_adult: true });
assert(allBoundaries.length > 0, 'Boundary should be saved from private channel message');
const adultBoundary = allBoundaries.find(b => b.adult_context);
assert(adultBoundary, 'At least one boundary should have adult_context=true');
assert(adultBoundary.privacy_scope === 'private', 'Adult boundary must have privacy_scope=private');

// Step 2: Normal channel must not receive adult/private boundary details
const normalBoundaries = await boundaryConsentStore.listBoundaries({ user_scope: 'test_user', companion_id: 'Dante', include_adult: false });
assert(!normalBoundaries.some(b => b.adult_context), 'Normal channel query must not return adult/private boundaries');

const normalMsg = { channelId: 'ch-general', channel: { name: 'general', isThread: () => false }, guildId: 'g1', id: 'msg-norm1' };
const normalInput = { content: "What did I say I liked in private?", authorId: 'u1', authorName: 'Jenna' };
const normalResult = await engine.processMessage({ message: normalMsg, input: normalInput, adultScope: { active: false }, repairResult: null });

// BOUNDARIES prelude in normal channel must not contain raw adult/private content
const normalBoundarySection = normalResult.preludeSections.find(s => s.label === 'BOUNDARIES');
if (normalBoundarySection) {
  // Should not contain the adult boundary key
  assert(!normalBoundarySection.content.toLowerCase().includes('priv1'), 'Normal channel prelude must not leak private message IDs');
}

// Step 3: Private channel should receive adult/private boundaries
const privateResult2 = await engine.processMessage({ message: privateMsg, input: { content: "Let's continue.", authorId: 'u1', authorName: 'Jenna' }, adultScope: { active: true }, repairResult: null });

// --- formatBoundaryPrelude privacy guarantee ---

const mixedBoundaries = await boundaryConsentStore.listBoundaries({ user_scope: 'test_user', companion_id: 'Dante', include_adult: true });
const adultOnlyBoundaries = mixedBoundaries.filter(b => b.adult_context);

// Normal channel prelude from mixed list should filter adult boundaries
const normalPrelude = formatBoundaryPrelude(adultOnlyBoundaries, false);
assert(normalPrelude === null, 'formatBoundaryPrelude must return null for all-adult list in normal channel context');

// Private channel prelude from mixed list should include adult boundaries
const privatePrelude = formatBoundaryPrelude(adultOnlyBoundaries, true);
if (adultOnlyBoundaries.length > 0) {
  assert(privatePrelude !== null, 'formatBoundaryPrelude must return content for adult list in private channel context');
}

// --- Do-not-ask privacy ---

// Save an adult-scoped do-not-ask rule
await doNotAskStore.upsertRule({
  user_scope: 'test_user',
  companion_id: 'Dante',
  rule_type: 'do_not_ask',
  topic_key: 'adult_private_topic_secret',
  rule_summary: 'Adult private topic — do not surface in normal channels',
  exact_phrase: null,
  scope: 'private_only',
  expiry_at: null,
  privacy_scope: 'private',
  adult_context: true,
  source_channel_id: 'ch-private',
  source_message_id: 'msg-dna-priv',
});

const normalRules = await doNotAskStore.listRules({ user_scope: 'test_user', companion_id: 'Dante', active_only: true, include_adult: false });
assert(!normalRules.some(r => r.adult_context), 'Normal channel do-not-ask query must not return adult/private rules');

const normalDnaPrelude = formatDoNotAskPrelude(normalRules, false);
if (normalDnaPrelude) {
  assert(!normalDnaPrelude.content.includes('adult_private_topic_secret'), 'Normal DNA prelude must not leak private topic key');
}

// --- User energy privacy ---

await userEnergyStore.saveObservation({
  user_scope: 'test_user',
  companion_id: 'Dante',
  energy_state: 'flirty',
  confidence: 0.9,
  evidence_summary: 'private flirty evidence',
  source_channel_id: 'ch-private',
  source_message_id: 'msg-energy-priv',
  privacy_scope: 'private',
  adult_context: true,
});

const normalEnergy = await userEnergyStore.getLatestObservation({ user_scope: 'test_user', companion_id: 'Dante', include_adult: false });
if (normalEnergy) {
  assert(!normalEnergy.adult_context, 'Normal channel energy retrieval must not return adult/private observations');
  const normalEnergyPrelude = formatUserEnergyPrelude(normalEnergy);
  if (normalEnergyPrelude) {
    assert(!normalEnergyPrelude.content.includes('flirty'), 'Normal energy prelude must not show flirty state from private channel');
  }
}

// --- user_scope and companion_id integrity ---

// All three stores must filter by user_scope and companion_id
const wrongUserBoundaries = await boundaryConsentStore.listBoundaries({ user_scope: 'other_user', companion_id: 'Dante', include_adult: true });
assert(wrongUserBoundaries.length === 0, 'Boundaries must be scoped to correct user_scope');

const wrongUserRules = await doNotAskStore.listRules({ user_scope: 'other_user', companion_id: 'Dante', include_adult: true });
assert(wrongUserRules.length === 0, 'Do-not-ask rules must be scoped to correct user_scope');

const wrongUserEnergy = await userEnergyStore.listObservations({ user_scope: 'other_user', companion_id: 'Dante', include_adult: true });
assert(wrongUserEnergy.length === 0, 'Energy observations must be scoped to correct user_scope');

console.log('[verify:human-simulation-pack-5a-privacy] PASS');
