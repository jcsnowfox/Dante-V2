import assert from 'node:assert/strict';
import { detectChannelKind, loadOrCreateChannelAwareness, formatChannelPrelude, KIND_PURPOSE } from '../src/humanSimulation/channelAwarenessMap.js';
import { createChannelAwarenessStore } from '../src/storage/channelAwareness.js';

const store = createChannelAwarenessStore({});
await store.init();

const userScope = 'test_user';
const companionId = 'Dante';

// 1. Channel kind detection from name
assert.equal(detectChannelKind({ channelName: 'project-build', channelId: '111' }), 'project_build', 'project channel detected');
assert.equal(detectChannelKind({ channelName: 'norsk-learning', channelId: '222' }), 'norwegian_learning', 'Norwegian channel detected');
assert.equal(detectChannelKind({ channelName: 'adult-private', channelId: '333' }), 'private_adult', 'adult channel detected from name');
assert.equal(detectChannelKind({ channelName: 'general', channelId: '444' }), 'general', 'general channel detected');
assert.equal(detectChannelKind({ channelName: 'random-stuff', channelId: '555' }), 'unknown', 'unknown channel defaults to unknown');

// 2. Configured adult channel ID takes precedence
assert.equal(detectChannelKind({ channelName: 'general', channelId: '789', adultChannelId: '789' }), 'private_adult', 'configured adult channelId takes precedence');

// 3. loadOrCreateChannelAwareness creates record
const awareness = await loadOrCreateChannelAwareness({
  store, guildId: 'g1', channelId: 'ch-project-1',
  channelName: 'project-build', userScope, companionId,
  config: {}, adultScope: { active: false },
});
assert(awareness, 'should create channel awareness record');
assert.equal(awareness.channel_kind, 'project_build', 'kind should be project_build');
assert.equal(awareness.project_allowed, true, 'project_allowed should be true for project_build');
assert.equal(awareness.adult_allowed, false, 'adult_allowed should be false for project channel');
assert.equal(awareness.privacy_scope, 'normal', 'privacy_scope should be normal');

// 4. Adult channel only enabled when configured, not guessed from content
const adultAwareness = await loadOrCreateChannelAwareness({
  store, guildId: 'g1', channelId: 'ch-adult-1',
  channelName: 'general-chat', userScope, companionId,
  config: { chat: { adultPrivateMode: { channelId: 'ch-adult-1' } } },
  adultScope: { active: true },
});
assert(adultAwareness.adult_allowed === true, 'adult should be allowed when configured channel matches');

// 5. Unknown channel defaults safely
const unknownAwareness = await loadOrCreateChannelAwareness({
  store, guildId: 'g1', channelId: 'ch-unknown-99',
  channelName: 'xyzzy-foo', userScope, companionId,
  config: {}, adultScope: { active: false },
});
assert(unknownAwareness, 'unknown channel should still return awareness');
assert.equal(unknownAwareness.channel_kind, 'unknown', 'unknown channel kind');
assert.equal(unknownAwareness.adult_allowed, false, 'unknown channel should not allow adult');

// 6. Channel awareness formats prelude correctly
const prelude = formatChannelPrelude(awareness);
assert(prelude?.label === 'CHANNEL AWARENESS', 'label should be CHANNEL AWARENESS');
assert(prelude.content.includes('project_build'), 'prelude should mention channel kind');
assert(prelude.content.includes('*'), 'prelude should have bullet points');
assert(!prelude.content.toLowerCase().includes('adult'), 'prelude for project channel should not mention adult');

// 7. listChannels for dashboard
const channels = await store.listChannels({ user_scope: userScope, companion_id: companionId });
assert(channels.length >= 3, 'dashboard should list channels');

// 8. Admin can set channel kind (upsert with explicit kind)
const edited = await store.upsertChannel({
  guild_id: 'g1', channel_id: 'ch-project-1',
  user_scope: userScope, companion_id: companionId,
  channel_name: 'project-build', channel_kind: 'admin_testing',
});
assert(edited?.channel_kind === 'admin_testing', 'admin should be able to set channel kind');

// 9. Thread summary updates
const updated = await store.upsertChannel({
  guild_id: 'g1', channel_id: 'ch-project-1',
  user_scope: userScope, companion_id: companionId,
  channel_name: 'project-build', channel_kind: 'project_build',
  summary_state: 'Active project discussion about Railway deploy.',
});
assert(updated?.summary_state?.includes('Railway'), 'thread summary should update');

// 10. Private/adult channel does not appear in normal summary prelude
const adultChannel = await store.upsertChannel({
  guild_id: 'g1', channel_id: 'ch-private-1',
  user_scope: userScope, companion_id: companionId,
  channel_name: 'private-room', channel_kind: 'private_adult',
  privacy_scope: 'private', adult_allowed: true,
  summary_state: 'Secret adult conversation.',
});
const normalPrelude = formatChannelPrelude(awareness); // project channel
assert(!normalPrelude.content.includes('Secret'), 'private channel summary must not leak into normal channel prelude');

console.log('[verify:channel-awareness-map] PASS');
