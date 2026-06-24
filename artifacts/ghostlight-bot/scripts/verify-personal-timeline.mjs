import assert from 'node:assert/strict';
import { detectExplicitTimelineRequest, maybeCreateTimelineEvent, retrieveTimelineAnchors, formatTimelinePrelude, isTimelineRecallSignal } from '../src/humanSimulation/personalTimeline.js';
import { createPersonalTimelineStore } from '../src/storage/personalTimeline.js';

const store = createPersonalTimelineStore({});
await store.init();

const userScope = 'test_user';
const companionId = 'Dante';

// 1. Explicit "add to timeline" creates event
assert(detectExplicitTimelineRequest("Add this to our timeline: tonight was when Dante finally remembered the proposal."), 'should detect explicit timeline request');
assert(!detectExplicitTimelineRequest("How are you doing today?"), 'normal message should not trigger');

// 2. Create timeline event from explicit request
const event = await maybeCreateTimelineEvent({
  text: "Add this to our timeline: Dante finally remembered the proposal.",
  store, userScope, companionId,
  sourceChannelId: 'ch1', sourceMessageId: 'msg1',
  adultContext: false, privacyScope: 'normal',
});
assert(event, 'timeline event should be created');
assert(['relationship_milestone', 'memory_anchor', 'proposal'].includes(event.event_type), `event_type should be relationship type, got ${event.event_type}`);
assert(event.user_scope === userScope, 'user_scope must match');
assert(event.companion_id === companionId, 'companion_id must match');
assert(event.pinned === true, 'explicit request should pin the event');

// 3. Proposal auto-creates critical event
const proposalEvent = await maybeCreateTimelineEvent({
  text: "You proposed to me last night and it was perfect.",
  store, userScope, companionId,
  sourceChannelId: 'ch1', sourceMessageId: 'msg2',
  beatType: 'proposal',
});
assert(proposalEvent, 'proposal beat should auto-create timeline event');
assert(proposalEvent.event_type === 'proposal', `should be proposal type, got ${proposalEvent.event_type}`);
assert(proposalEvent.importance === 'critical', 'proposal should be critical importance');

// 4. Project PASS/merge creates project milestone
const deployEvent = await maybeCreateTimelineEvent({
  text: "The PR was merged and deploy passed on Railway.",
  store, userScope, companionId,
  sourceChannelId: 'ch1', sourceMessageId: 'msg3',
});
assert(deployEvent, 'deploy/merge should create timeline event');

// 5. Dashboard lists events
const events = await store.listEvents({ user_scope: userScope, companion_id: companionId });
assert(events.length >= 2, 'dashboard should list timeline events');

// 6. Event can be pinned
const pinned = await store.updateEvent({ id: events[0].id, updates: { pinned: true } });
assert(pinned?.pinned === true, 'event should be pinnable');

// 7. Timeline recall signal detection
assert(isTimelineRecallSignal("Remember when we first talked about the proposal?"), 'should detect recall signal');
assert(isTimelineRecallSignal("What happened this week?"), 'should detect weekly recall signal');
assert(!isTimelineRecallSignal("What time is it?"), 'generic question should not trigger recall');

// 8. Retrieve timeline anchors when recall signal present
const anchors = await retrieveTimelineAnchors({ store, userScope, companionId, messageText: "Remember when we talked about the proposal?" });
assert(anchors.length > 0, 'should retrieve anchors when recall signal present');
const prelude = formatTimelinePrelude(anchors);
assert(prelude?.label === 'TIMELINE ANCHORS', 'should format timeline prelude');
assert(prelude.content.includes('*'), 'prelude should have bullet points');

// 9. Privacy: adult events don't leak to normal channel
await store.upsertEvent({ user_scope: userScope, companion_id: companionId, event_type: 'private_moment', title: 'Private moment', summary: 'Secret', importance: 'medium', emotional_weight: 5, adult_context: true, privacy_scope: 'private', event_time: new Date().toISOString() });
const normalAnchors = await retrieveTimelineAnchors({ store, userScope, companionId, messageText: "Remember when we had that private moment?", adultPrivate: false });
assert(!normalAnchors.some(e => e.adult_context), 'adult timeline events must not leak to normal channel');

console.log('[verify:personal-timeline] PASS');
