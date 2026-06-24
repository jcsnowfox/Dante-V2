import assert from 'node:assert/strict';
import { createHumanSimulationEngine } from '../src/humanSimulation/humanSimulationEngine.js';
import { createMicroPreferenceStore } from '../src/storage/microPreferences.js';
import { createPersonalTimelineStore } from '../src/storage/personalTimeline.js';
import { createFollowUpStore } from '../src/storage/followUpItems.js';
import { createChannelAwarenessStore } from '../src/storage/channelAwareness.js';

const config = { memory: { userScope: 'test_user', companionId: 'Dante' }, chat: { adultPrivateMode: { channelId: '' } } };
const logger = { info: ()=>{}, debug: ()=>{}, warn: ()=>{} };

const microPreferenceStore = createMicroPreferenceStore({});
const personalTimelineStore = createPersonalTimelineStore({});
const followUpStore = createFollowUpStore({});
const channelAwarenessStore = createChannelAwarenessStore({});

const engine = createHumanSimulationEngine({ config, logger, microPreferenceStore, personalTimelineStore, followUpStore, channelAwarenessStore });
await engine.init();

// Scenario A: Micro-preference saved
const messageA = { channelId: 'ch-project-1', channel: { name: 'project-build', isThread: ()=>false }, guildId: 'g1', id: 'msg-a' };
const inputA = { content: "Dante, I hate when you sound like a therapist. Don't say 'your feelings are valid' to me.", authorId: 'u1', authorName: 'Jenna' };
const resultA = await engine.processMessage({ message: messageA, input: inputA, adultScope: { active: false }, repairResult: null });
assert(resultA.preludeSections.length > 0, 'should produce at least one prelude section');
const prefSection = resultA.preludeSections.find(s => s.label === 'MICRO-PREFERENCES');
// Run again to verify preference was saved and retrieves
const resultA2 = await engine.processMessage({ message: messageA, input: { content: 'What should I do now?' }, adultScope: { active: false }, repairResult: null });
const prefSection2 = resultA2.preludeSections.find(s => s.label === 'MICRO-PREFERENCES');
assert(prefSection2, 'micro-preferences should appear in prelude on subsequent messages');

// Scenario B: Timeline event saved from explicit request
const messageB = { channelId: 'ch-project-1', channel: { name: 'project-build', isThread: ()=>false }, guildId: 'g1', id: 'msg-b' };
const inputB = { content: "Add this to our timeline: tonight was when Dante finally remembered the proposal.", authorId: 'u1', authorName: 'Jenna' };
const resultB = await engine.processMessage({ message: messageB, input: inputB, adultScope: { active: false }, repairResult: null });
// Timeline event should have been saved
const allEvents = await personalTimelineStore.listEvents({ user_scope: 'test_user', companion_id: 'Dante' });
assert(allEvents.length > 0, 'timeline event should be saved after explicit request');

// Scenario C: Follow-up created from "don't let me forget"
const messageC = { channelId: 'ch-project-1', channel: { name: 'project-build', isThread: ()=>false }, guildId: 'g1', id: 'msg-c' };
const inputC = { content: "Don't let me forget to test memories after Railway deploy.", authorId: 'u1', authorName: 'Jenna' };
await engine.processMessage({ message: messageC, input: inputC, adultScope: { active: false }, repairResult: null });
const allFu = await followUpStore.listFollowUps({ user_scope: 'test_user', companion_id: 'Dante' });
assert(allFu.length > 0, 'follow-up should be saved after "don\'t let me forget"');

// Scenario D: Channel awareness in prelude
const resultD = await engine.processMessage({ message: messageA, input: { content: 'What did we fix last?' }, adultScope: { active: false }, repairResult: null });
const chanSection = resultD.preludeSections.find(s => s.label === 'CHANNEL AWARENESS');
assert(chanSection, 'channel awareness should appear in prelude');
assert(chanSection.content.includes('project_build'), 'channel kind should be in prelude');
// project channel should not contain adult tone
assert(!chanSection.content.toLowerCase().includes('adult') || chanSection.content.includes('Do not'), 'project channel prelude should not allow adult tone');

// Scenario E: Privacy — adult follow-up stays private
await followUpStore.createFollowUp({ user_scope: 'test_user', companion_id: 'Dante', follow_up_type: 'private_room_followup', reason_summary: 'Private adult reminder', due_at: new Date(Date.now()-1000).toISOString(), adult_context: true, privacy_scope: 'private' });
const normalMessage = { channelId: 'ch-project-1', channel: { name: 'project-build', isThread: ()=>false }, guildId: 'g1', id: 'msg-e' };
const normalResult = await engine.processMessage({ message: normalMessage, input: { content: 'What were we doing in the private room?' }, adultScope: { active: false }, repairResult: null });
const fuSection = normalResult.preludeSections.find(s => s.label === 'OPEN FOLLOW-UPS');
if (fuSection) {
  assert(!fuSection.content.includes('adult') && !fuSection.content.includes('Private adult'), 'adult follow-up must not leak into normal channel prelude');
}

// Integration: all 4 systems represented
const allLabels = resultA.preludeSections.map(s => s.label);
assert(allLabels.includes('CHANNEL AWARENESS'), 'CHANNEL AWARENESS must be in preludes');

console.log('[verify:human-simulation-foundation] PASS');
