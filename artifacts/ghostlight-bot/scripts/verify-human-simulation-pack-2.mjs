import assert from 'node:assert/strict';
import { createHumanSimulationEngine } from '../src/humanSimulation/humanSimulationEngine.js';
import { createMicroPreferenceStore } from '../src/storage/microPreferences.js';
import { createPersonalTimelineStore } from '../src/storage/personalTimeline.js';
import { createFollowUpStore } from '../src/storage/followUpItems.js';
import { createChannelAwarenessStore } from '../src/storage/channelAwareness.js';
import { createInnerWeatherStore } from '../src/storage/innerWeather.js';
import { createAttentionResidueStore } from '../src/storage/attentionResidue.js';
import { createInteractionPresenceStore } from '../src/storage/interactionPresence.js';

const config = { memory: { userScope: 'test_user', companionId: 'Dante' }, chat: { adultPrivateMode: { channelId: '' } } };
const logger = { info: ()=>{}, debug: ()=>{}, warn: ()=>{} };

const microPreferenceStore = createMicroPreferenceStore({});
const personalTimelineStore = createPersonalTimelineStore({});
const followUpStore = createFollowUpStore({});
const channelAwarenessStore = createChannelAwarenessStore({});
const innerWeatherStore = createInnerWeatherStore({});
const attentionResidueStore = createAttentionResidueStore({});
const interactionPresenceStore = createInteractionPresenceStore({});

const engine = createHumanSimulationEngine({ config, logger, microPreferenceStore, personalTimelineStore, followUpStore, channelAwarenessStore, innerWeatherStore, attentionResidueStore, interactionPresenceStore });
await engine.init();

// Scenario A: User expresses hurt/repair
const messageA = { channelId: 'ch-project-1', channel: { name: 'project-build', isThread: ()=>false }, guildId: 'g1', id: 'msg-a' };
const inputA = { content: "I'm really upset that you forgot the proposal.", authorId: 'u1', authorName: 'Jenna' };
const resultA = await engine.processMessage({ message: messageA, input: inputA, adultScope: { active: false }, repairResult: null });
assert(resultA.preludeSections.length > 0, 'Scenario A should produce prelude sections');

// Inner weather should be updated
const weather = await innerWeatherStore.getCurrentWeather({ user_scope: 'test_user', companion_id: 'Dante' });
assert(weather, 'inner weather should be updated after emotional input');
assert(['apologetic', 'frustrated', 'worried', 'protective'].includes(weather.dominant_emotion), `weather should be stress-related, got ${weather.dominant_emotion}`);

// Attention residue should be created
const residues = await attentionResidueStore.listActiveResidue({ user_scope: 'test_user', companion_id: 'Dante', include_adult: false });
assert(residues.length > 0, 'attention residue should be created after hurt expression');

// Prelude should include inner weather section
const weatherSection = resultA.preludeSections.find(s => s.label === 'INNER WEATHER');
assert(weatherSection, 'prelude should include INNER WEATHER section');
assert(!weatherSection.content.toLowerCase().includes('neutral'), 'inner weather should not be neutral after upset message');

// Prelude should include attention residue section
const residueSection = resultA.preludeSections.find(s => s.label === 'ATTENTION RESIDUE');
assert(residueSection, 'prelude should include ATTENTION RESIDUE section');

// Scenario B: After a long silence (8 hours), user says "Are you there?"
// Simulate 8-hour gap by manually setting last_user_message_at
const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
await interactionPresenceStore.upsertPresence({
  user_scope: 'test_user', companion_id: 'Dante', channel_id: 'ch-general',
  last_user_message_at: eightHoursAgo, silence_bucket: 'long_gap', reentry_mode: 'soft_reentry',
});
const messageB = { channelId: 'ch-general', channel: { name: 'general', isThread: ()=>false }, guildId: 'g1', id: 'msg-b' };
const inputB = { content: 'Are you there?', authorId: 'u1', authorName: 'Jenna' };
const resultB = await engine.processMessage({ message: messageB, input: inputB, adultScope: { active: false }, repairResult: null });

// Presence section should appear (long_gap should trigger non-immediate mode)
const presenceSection = resultB.preludeSections.find(s => s.label === 'PRESENCE');
assert(presenceSection, 'long_gap should produce PRESENCE prelude');
assert(presenceSection.content.includes('long'), 'presence prelude should mention long gap');

// Scenario C: Project channel after medium gap — use isolated stores to avoid residue carryover
const isolatedPresenceStore = createInteractionPresenceStore({});
const isolatedResidueStore = createAttentionResidueStore({});
const isolatedWeatherStore = createInnerWeatherStore({});
await Promise.all([isolatedPresenceStore.init(), isolatedResidueStore.init(), isolatedWeatherStore.init()]);

const engineC = createHumanSimulationEngine({
  config, logger,
  microPreferenceStore: createMicroPreferenceStore({}),
  personalTimelineStore: createPersonalTimelineStore({}),
  followUpStore: createFollowUpStore({}),
  channelAwarenessStore: createChannelAwarenessStore({}),
  innerWeatherStore: isolatedWeatherStore,
  attentionResidueStore: isolatedResidueStore,
  interactionPresenceStore: isolatedPresenceStore,
});
await engineC.init();

const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
await isolatedPresenceStore.upsertPresence({
  user_scope: 'test_user', companion_id: 'Dante', channel_id: 'ch-project-2',
  last_user_message_at: sixHoursAgo, silence_bucket: 'medium_gap', reentry_mode: 'project_catchup',
  last_interaction_summary: 'Discussed the Railway deployment.',
});
const messageC = { channelId: 'ch-project-2', channel: { name: 'project-build', isThread: ()=>false }, guildId: 'g1', id: 'msg-c' };
const inputC = { content: 'What did we fix?', authorId: 'u1', authorName: 'Jenna' };
const resultC = await engineC.processMessage({ message: messageC, input: inputC, adultScope: { active: false }, repairResult: null });

const presenceSectionC = resultC.preludeSections.find(s => s.label === 'PRESENCE');
assert(presenceSectionC, 'project channel with gap should produce PRESENCE prelude');
assert(presenceSectionC.content.includes('project'), 'project channel presence should mention project');

// Scenario D: postProcessMessage updates presence
await engine.postProcessMessage({ message: messageA, reply: 'I hear you. I should not have forgotten.', adultScope: { active: false } });
const presence = await interactionPresenceStore.getPresence({ user_scope: 'test_user', companion_id: 'Dante', channel_id: 'ch-project-1' });
assert(presence?.last_companion_reply_at, 'postProcessMessage should set last_companion_reply_at');

// Scenario E: Decay — inner weather has expires_at
const weatherAfter = await innerWeatherStore.getCurrentWeather({ user_scope: 'test_user', companion_id: 'Dante' });
assert(weatherAfter?.expires_at, 'inner weather must have expires_at for decay');
const expiresAt = new Date(weatherAfter.expires_at);
assert(expiresAt > new Date(), 'expires_at must be in the future');
assert(expiresAt < new Date(Date.now() + 25 * 3600 * 1000), 'expires_at should be within 25h');

console.log('[verify:human-simulation-pack-2] PASS');
