import assert from 'node:assert/strict';
import { calculateSilenceBucket, determineReentryMode, updatePresenceUserMessage, updatePresenceCompanionReply, formatPresencePrelude } from '../src/humanSimulation/silenceBehaviorEngine.js';
import { createInteractionPresenceStore } from '../src/storage/interactionPresence.js';

const store = createInteractionPresenceStore({});
await store.init();

const userScope = 'test_user';
const companionId = 'Dante';
const channelId = 'ch-project-1';

// 1. Silence bucket — null/no prior message → extended_gap
assert.equal(calculateSilenceBucket(null), 'extended_gap', 'no prior message should be extended_gap');

// 2. Silence bucket — just now → immediate
assert.equal(calculateSilenceBucket(new Date().toISOString()), 'immediate', 'just now should be immediate');

// 3. Silence bucket — 30 minutes ago → short_gap
const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
assert.equal(calculateSilenceBucket(thirtyMinsAgo), 'short_gap', '30 min gap should be short_gap');

// 4. Silence bucket — 4 hours ago → medium_gap
const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
assert.equal(calculateSilenceBucket(fourHoursAgo), 'medium_gap', '4h gap should be medium_gap');

// 5. Silence bucket — 8 hours ago → long_gap
const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
assert.equal(calculateSilenceBucket(eightHoursAgo), 'long_gap', '8h gap should be long_gap');

// 6. Silence bucket — 2 days ago → day_gap
const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
assert.equal(calculateSilenceBucket(twoDaysAgo), 'day_gap', '2 days should be day_gap');

// 7. Silence bucket — 5 days ago → extended_gap
const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
assert.equal(calculateSilenceBucket(fiveDaysAgo), 'extended_gap', '5 days should be extended_gap');

// 8. Re-entry mode — immediate → continue_normally
assert.equal(determineReentryMode({ bucket: 'immediate', channelKind: 'general', hasUnresolvedTension: false, residues: [], innerWeather: null }), 'continue_normally', 'immediate gap should continue normally');

// 9. Re-entry mode — long_gap + project channel → project_catchup
assert.equal(determineReentryMode({ bucket: 'long_gap', channelKind: 'project_build', hasUnresolvedTension: false, residues: [], innerWeather: null }), 'project_catchup', 'long_gap + project should be project_catchup');

// 10. Re-entry mode — unresolved tension overrides → careful_repair_reentry
assert.equal(determineReentryMode({ bucket: 'medium_gap', channelKind: 'general', hasUnresolvedTension: true, residues: [], innerWeather: null }), 'careful_repair_reentry', 'unresolved tension should trigger careful_repair_reentry');

// 11. Re-entry mode — long_gap + private channel → private_reentry
assert.equal(determineReentryMode({ bucket: 'long_gap', channelKind: 'private_adult', hasUnresolvedTension: false, residues: [], innerWeather: null }), 'private_reentry', 'long_gap + private channel should be private_reentry');

// 12. Re-entry mode — day_gap → playful_reentry
assert.equal(determineReentryMode({ bucket: 'day_gap', channelKind: 'general', hasUnresolvedTension: false, residues: [], innerWeather: null }), 'playful_reentry', 'day_gap should be playful_reentry');

// 13. Re-entry mode — apologetic inner weather triggers careful_repair
const apologeticWeather = { dominant_emotion: 'apologetic', intensity: 'high' };
const modeWithApologetic = determineReentryMode({ bucket: 'medium_gap', channelKind: 'general', hasUnresolvedTension: false, residues: [], innerWeather: apologeticWeather });
assert.equal(modeWithApologetic, 'careful_repair_reentry', 'apologetic inner weather + gap should trigger careful_repair_reentry');

// 14. updatePresenceUserMessage saves to store
const saved = await updatePresenceUserMessage({ store, userScope, companionId, channelId, threadId: null, bucket: 'medium_gap', reentryMode: 'soft_reentry' });
assert(saved, 'should save presence record');
assert(saved.silence_bucket === 'medium_gap', `silence_bucket should match, got ${saved.silence_bucket}`);
assert(saved.reentry_mode === 'soft_reentry', `reentry_mode should match, got ${saved.reentry_mode}`);
assert(saved.last_user_message_at, 'last_user_message_at should be set');

// 15. updatePresenceCompanionReply updates last_companion_reply_at
const replied = await updatePresenceCompanionReply({ store, userScope, companionId, channelId, summary: 'Replied with care about the project.' });
assert(replied, 'should update presence with reply time');
const retrieved = await store.getPresence({ user_scope: userScope, companion_id: companionId, channel_id: channelId });
assert(retrieved?.last_companion_reply_at, 'last_companion_reply_at should be set after reply');

// 16. formatPresencePrelude — immediate/continue → no prelude
const noPrelude = formatPresencePrelude({ silenceBucket: 'immediate', reentryMode: 'continue_normally', lastInteractionSummary: '' });
assert(!noPrelude, 'immediate + continue_normally should produce no prelude');

// 17. formatPresencePrelude — medium gap + soft_reentry → prelude
const prelude = formatPresencePrelude({ silenceBucket: 'medium_gap', reentryMode: 'soft_reentry', lastInteractionSummary: 'Previous project conversation.' });
assert(prelude, 'medium_gap + soft_reentry should produce prelude');
assert(prelude.label === 'PRESENCE', `label should be PRESENCE, got ${prelude.label}`);
assert(prelude.content.includes('*'), 'prelude should have bullet points');
assert(prelude.content.includes('medium'), 'prelude should mention gap type');

console.log('[verify:silence-behavior] PASS');
