import assert from 'node:assert/strict';
import { createMicroPreferenceStore } from '../src/storage/microPreferences.js';
import { createPersonalTimelineStore } from '../src/storage/personalTimeline.js';
import { createFollowUpStore } from '../src/storage/followUpItems.js';
import { createChannelAwarenessStore } from '../src/storage/channelAwareness.js';
import { retrieveRelevantPreferences, formatPreferencePrelude } from '../src/humanSimulation/microPreferenceLearner.js';
import { retrieveTimelineAnchors } from '../src/humanSimulation/personalTimeline.js';
import { retrieveDueFollowUps } from '../src/humanSimulation/followUpScheduler.js';

const userScope = 'privacy_test_user';
const companionId = 'Dante';

// Setup stores
const prefStore = createMicroPreferenceStore({});
const timelineStore = createPersonalTimelineStore({});
const fuStore = createFollowUpStore({});
const chanStore = createChannelAwarenessStore({});
await Promise.all([prefStore.init(), timelineStore.init(), fuStore.init(), chanStore.init()]);

// --- Micro-Preferences Privacy ---

// Save a normal and a private preference
await prefStore.upsertPreference({ user_scope: userScope, companion_id: companionId, preference_type: 'tone_preference', preference_key: 'normal_pref', preference_value_summary: 'Jenna prefers direct tone', source: 'explicit', confidence: 0.9, adult_context: false, privacy_scope: 'normal' });
await prefStore.upsertPreference({ user_scope: userScope, companion_id: companionId, preference_type: 'adult_private_preference', preference_key: 'private_pref', preference_value_summary: 'SECRET ADULT PREFERENCE', source: 'explicit', confidence: 0.9, adult_context: true, privacy_scope: 'private' });

// Normal channel: adult prefs must not leak
const normalPrefs = await retrieveRelevantPreferences({ store: prefStore, userScope, companionId, adultPrivate: false });
assert(!normalPrefs.some(p => p.adult_context), 'adult preferences must not appear in normal channel');
assert(!normalPrefs.some(p => p.preference_value_summary.includes('SECRET')), 'adult preference content must not leak');

// Private channel: adult prefs appear
const privatePrefs = await retrieveRelevantPreferences({ store: prefStore, userScope, companionId, adultPrivate: true });
assert(privatePrefs.some(p => p.adult_context), 'adult preferences should appear in private channel');

// Prelude in normal channel has no adult content
const normalPrelude = formatPreferencePrelude(normalPrefs);
if (normalPrelude) {
  assert(!normalPrelude.content.includes('SECRET'), 'prelude must not contain adult preference text');
}

// Dashboard admin can see all (include_adult=true)
const dashboardPrefs = await prefStore.listPreferences({ user_scope: userScope, companion_id: companionId, include_adult: true });
assert(dashboardPrefs.some(p => p.adult_context), 'dashboard admin view should see adult prefs (for management)');

// --- Personal Timeline Privacy ---
await timelineStore.upsertEvent({ user_scope: userScope, companion_id: companionId, event_type: 'private_moment', title: 'Private moment', summary: 'SECRET PRIVATE EVENT', importance: 'high', emotional_weight: 7, adult_context: true, privacy_scope: 'private', event_time: new Date().toISOString() });
await timelineStore.upsertEvent({ user_scope: userScope, companion_id: companionId, event_type: 'repair', title: 'Normal repair', summary: 'Normal repair moment', importance: 'medium', emotional_weight: 4, adult_context: false, privacy_scope: 'normal', event_time: new Date().toISOString() });

const normalAnchors = await retrieveTimelineAnchors({ store: timelineStore, userScope, companionId, messageText: "Remember when we had that private moment?", adultPrivate: false });
assert(!normalAnchors.some(e => e.adult_context), 'adult timeline events must not appear in normal channel anchors');
assert(!normalAnchors.some(e => e.summary?.includes('SECRET')), 'adult content must not leak');

const privateAnchors = await retrieveTimelineAnchors({ store: timelineStore, userScope, companionId, messageText: "Remember when we had that private moment?", adultPrivate: true });
assert(privateAnchors.some(e => e.adult_context), 'adult timeline events should appear in private channel');

// --- Follow-Up Privacy ---
const pastDue = new Date(Date.now() - 3600000).toISOString();
await fuStore.createFollowUp({ user_scope: userScope, companion_id: companionId, follow_up_type: 'private_room_followup', reason_summary: 'SECRET ADULT FOLLOWUP', due_at: pastDue, adult_context: true, privacy_scope: 'private' });
await fuStore.createFollowUp({ user_scope: userScope, companion_id: companionId, follow_up_type: 'emotional_check', reason_summary: 'Normal emotional check', due_at: pastDue, adult_context: false, privacy_scope: 'normal' });

const normalDue = await retrieveDueFollowUps({ store: fuStore, userScope, companionId, adultPrivate: false });
assert(!normalDue.some(f => f.adult_context), 'adult follow-ups must not appear in normal channel');
assert(!normalDue.some(f => f.reason_summary?.includes('SECRET')), 'adult follow-up content must not leak');

const privateDue = await retrieveDueFollowUps({ store: fuStore, userScope, companionId, adultPrivate: true });
assert(privateDue.some(f => f.adult_context), 'adult follow-ups should appear in private channel');

// --- Channel Awareness Privacy ---
await chanStore.upsertChannel({ guild_id: 'g1', channel_id: 'priv-ch', user_scope: userScope, companion_id: companionId, channel_name: 'private-room', channel_kind: 'private_adult', privacy_scope: 'private', adult_allowed: true, summary_state: 'SECRET ADULT CHANNEL SUMMARY' });
await chanStore.upsertChannel({ guild_id: 'g1', channel_id: 'norm-ch', user_scope: userScope, companion_id: companionId, channel_name: 'general', channel_kind: 'general', privacy_scope: 'normal', adult_allowed: false });

const normalChannel = await chanStore.getChannel({ channel_id: 'norm-ch', user_scope: userScope, companion_id: companionId });
assert(normalChannel, 'should load normal channel');
assert(!normalChannel.adult_allowed, 'normal channel should not allow adult');

const privateChannel = await chanStore.getChannel({ channel_id: 'priv-ch', user_scope: userScope, companion_id: companionId });
assert(privateChannel.adult_allowed, 'private channel should allow adult');

// --- user_scope and companion_id isolation ---
await prefStore.upsertPreference({ user_scope: 'other_user', companion_id: companionId, preference_type: 'tone_preference', preference_key: 'other_pref', preference_value_summary: 'OTHER USER PREFERENCE', source: 'explicit', confidence: 0.9 });
const myPrefs = await prefStore.listPreferences({ user_scope: userScope, companion_id: companionId });
assert(!myPrefs.some(p => p.user_scope === 'other_user'), 'user_scope must be enforced in preference retrieval');

console.log('[verify:human-simulation-privacy] PASS');
