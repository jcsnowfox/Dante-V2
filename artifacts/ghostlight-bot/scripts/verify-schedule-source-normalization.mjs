import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildProactiveActionPackImportRecords,
} = require('../src/http/adminDataExchange.js');
const {
  validateEventInput,
  normalizeConversationSource,
} = require('../src/storage/conversations/index.js');

function makePackFile(payload) {
  return { file: { content: JSON.stringify(payload) } };
}

const config = {
  chat: { timezone: 'UTC' },
  memory: { userScope: 'verify-user' },
};

const imported = buildProactiveActionPackImportRecords({
  files: makePackFile({
    product: 'ghostlight',
    packType: 'proactive_action_pack',
    version: 1,
    actions: [
      {
        triggerType: 'scheduled',
        source: 'ghostlight',
        name: 'Ghostlight imported schedule',
        actionType: 'message',
        target: '1234567890',
        prompt: 'Send a scheduled Discord message.',
        scheduleMode: 'daily',
        scheduleTime: '09:30',
        scheduleDay: 'monday',
        timezone: 'UTC',
      },
    ],
  }),
  config,
  triggerType: 'scheduled',
});

assert.equal(imported.records.length, 1, 'Ghostlight product packs should import scheduled actions');
assert.equal(imported.skippedInvalid, 0, 'Ghostlight product metadata must not invalidate packs');
assert.equal(imported.records[0].triggerType, 'scheduled');
assert.equal(imported.records[0].source, undefined, 'Importer must not copy pack/action source into proactive action records');

assert.equal(normalizeConversationSource('ghostlight'), 'discord', 'existing ghostlight conversation sources normalize to Discord');
assert.equal(normalizeConversationSource(''), '');

const ghostlightEvent = validateEventInput({
  role: 'assistant',
  source: 'ghostlight',
  eventType: 'message',
  metadata: {},
});
assert.equal(ghostlightEvent.source, 'discord', 'ghostlight source should normalize before validation');

for (const source of ['discord', 'openai', 'cadence']) {
  const validated = validateEventInput({
    role: 'assistant',
    source,
    eventType: 'message',
    metadata: {},
  });
  assert.equal(validated.source, source, `valid source ${source} should remain unchanged`);
}

assert.throws(
  () => validateEventInput({ role: 'assistant', source: 'not-valid', eventType: 'message', metadata: {} }),
  /Unsupported source "not-valid"/,
  'unknown sources should still be rejected',
);

console.log('schedule source normalization verified');
