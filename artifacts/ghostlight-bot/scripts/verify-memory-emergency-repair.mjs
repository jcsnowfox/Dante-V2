import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { classifyRuntimeMemory, curateRuntimeMemory, PROPOSAL_SUMMARY } = require('../src/memory/runtimeCurator.js');
const { syncMemoriesToQdrant } = require('../src/memory/syncMemories.js');

const pipeline = readFileSync(new URL('../src/chat/createChatPipeline.js', import.meta.url), 'utf8');
assert.match(pipeline, /curateRuntimeMemory\(\{ text: input\.content/);
assert.match(pipeline, /curateRuntimeMemory\(\{ text: reply\?\.content/);

const saved = [];
const memoryStore = { async upsertMemory(record, defaults){ const m={ memoryId:`mem-${saved.length+1}`, active:record.active, userScope:defaults.userScope, ...record }; saved.push(m); return m; } };
const config = { memory: { userScope: 'jenna', companionId: 'Dante' }, companion: { id: 'Dante' } };
const logger = { info(){}, warn(){} };

let result = await curateRuntimeMemory({ text: 'Dante, remember this: I asked you to marry me yesterday.', role:'user', memoryStore, config, logger, source:{ channelId:'a', messageId:'1' } });
assert.equal(result.saved, true);
assert.equal(result.memory.active, true);
assert.match(result.memory.content, /must_recall_across_channels=true/);
assert.match(result.memory.content, /category=proposal/);
assert.equal(result.decision.importance, 'critical');
assert.deepEqual(result.decision.tags, ['proposal','marriage','engagement','one_knee','relationship_commitment']);
assert.equal(result.decision.summary, PROPOSAL_SUMMARY);

result = await curateRuntimeMemory({ text: 'I promise I will not forget this.', role:'assistant', memoryStore, config, logger, source:{} });
assert.equal(result.saved, true);
assert.equal(result.decision.type, 'companion_commitment');

result = await curateRuntimeMemory({ text: 'what is for dinner?', role:'user', memoryStore, config, logger, source:{} });
assert.equal(result.saved, false);

const visible = saved.filter((m)=>m.userScope==='jenna' && m.active === true);
assert.ok(visible.length >= 2);
assert.equal(classifyRuntimeMemory({ text:'You forgot I proposed', role:'user' }).shouldSave, true);

const sync = await syncMemoriesToQdrant({ config: {}, memories: visible, deps: { logger, embedTexts: async()=>[], ensureCollection: async()=>{}, upsertPoints: async()=>{} } });
assert.equal(sync.skipped, true);
assert.equal(sync.skippedReason, 'qdrant_or_embeddings_not_configured');

const otherScope = saved.filter((m)=>m.userScope==='someone_else');
assert.equal(otherScope.length, 0);
console.log('[verify-memory-emergency-repair] PASS runtime curator, dashboard visibility model, qdrant skip, scope consistency');
