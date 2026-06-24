import assert from 'node:assert/strict';
import { detectFollowUpTrigger, maybeCreateFollowUp, retrieveDueFollowUps, retrieveOpenFollowUps, formatFollowUpPrelude } from '../src/humanSimulation/followUpScheduler.js';
import { createFollowUpStore } from '../src/storage/followUpItems.js';

const store = createFollowUpStore({});
await store.init();

const userScope = 'test_user';
const companionId = 'Dante';

// 1. User reminder creates follow-up trigger
const trigger = detectFollowUpTrigger("Don't let me forget to test memories after the Railway deploy.");
assert(trigger, 'should detect follow-up trigger');
assert(['reminder', 'deployment_check'].includes(trigger.follow_up_type), `should be reminder or deployment_check, got ${trigger.follow_up_type}`);
assert(trigger.reason_summary.length > 0, 'reason summary should not be empty');

// 2. maybeCreateFollowUp saves it
const fu = await maybeCreateFollowUp({
  text: "Don't let me forget to test memories after the Railway deploy.",
  store, userScope, companionId,
  sourceChannelId: 'ch1', sourceMessageId: 'msg1',
  adultContext: false, privacyScope: 'normal',
});
assert(fu, 'should create follow-up item');
assert(['reminder', 'deployment_check'].includes(fu.follow_up_type), `type should match, got ${fu.follow_up_type}`);
assert(fu.status === 'open', 'status should be open');
assert(fu.user_scope === userScope, 'user_scope must match');
assert(fu.companion_id === companionId, 'companion_id must match');

// 3. Repair event creates repair_check follow-up
const repairFu = await maybeCreateFollowUp({
  text: "You hurt me when you forgot what I said.",
  store, userScope, companionId,
  sourceChannelId: 'ch1', sourceMessageId: 'msg2',
  repairResult: { repairNeeded: true, repairType: 'emotional_hurt' },
});
assert(repairFu, 'repair event should create follow-up');
assert(repairFu.follow_up_type === 'repair_check', `should be repair_check, got ${repairFu.follow_up_type}`);

// 4. Dashboard lists open follow-ups
const allOpen = await store.listFollowUps({ user_scope: userScope, companion_id: companionId, status: 'open' });
assert(allOpen.length >= 2, 'dashboard should list open follow-ups');

// 5. Status update works
const updated = await store.updateStatus({ id: allOpen[0].id, status: 'completed', completed_at: new Date().toISOString() });
assert(updated?.status === 'completed', 'should be able to mark completed');

// 6. getDue: create a follow-up due in the past
const pastDue = new Date(Date.now() - 3600 * 1000).toISOString();
await store.createFollowUp({ user_scope: userScope, companion_id: companionId, follow_up_type: 'emotional_check', reason_summary: 'Check on Jenna after the argument', due_at: pastDue, priority: 'high' });
const due = await store.getDue({ user_scope: userScope, companion_id: companionId });
assert(due.length > 0, 'getDue should return overdue items');

// 7. retrieveDueFollowUps
const dueItems = await retrieveDueFollowUps({ store, userScope, companionId });
assert(dueItems.length > 0, 'retrieveDueFollowUps should return due items');
const prelude = formatFollowUpPrelude(dueItems);
assert(prelude?.label === 'OPEN FOLLOW-UPS', 'should format follow-up prelude');
assert(prelude.content.includes('*'), 'prelude should have bullet points');

// 8. Privacy: adult follow-up does not appear in normal channel
await store.createFollowUp({ user_scope: userScope, companion_id: companionId, follow_up_type: 'private_room_followup', reason_summary: 'Secret adult follow-up', due_at: pastDue, adult_context: true, privacy_scope: 'private' });
const normalDue = await retrieveDueFollowUps({ store, userScope, companionId, adultPrivate: false });
assert(!normalDue.some(f => f.adult_context), 'adult follow-ups must not appear in normal channel');

// 9. No spam: follow-ups have cooldown_key
const fu2 = await maybeCreateFollowUp({ text: "Don't let me forget to deploy.", store, userScope, companionId, sourceChannelId: 'ch1', sourceMessageId: 'msg3' });
assert(fu2?.cooldown_key, 'follow-up should have a cooldown_key');

console.log('[verify:emotional-follow-ups] PASS');
