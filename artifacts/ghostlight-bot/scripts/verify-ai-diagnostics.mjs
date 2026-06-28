import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  TRACE_STAGES,
  buildAiDiagnosticsReport,
  buildMemoryHealth,
  buildPromptHealth,
  buildCompanionHealth,
  createTrace,
  saveTrace,
  readDiagnostics,
  maskSensitive,
} = require('../src/aiDiagnostics.js');

const tmp = mkdtempSync(join(tmpdir(), 'ghostlight-ai-diagnostics-'));
const config = { diagnostics: { aiPath: join(tmp, 'ai-diagnostics.json') }, memory: { userScope: 'verify' } };
const memories = [
  { id: 'm1', memoryType: 'core', content: 'Loves blue candles and quiet morning rituals.', userScope: 'verify', embeddingId: 'e1' },
  { id: 'm2', memoryType: 'core', content: 'Loves blue candles and quiet morning rituals.', userScope: 'verify' },
  { id: 'm3', memoryType: 'summary', content: '', source: '' },
];
const innerContext = {
  config,
  memoryStore: { listMemories: async () => memories },
  journalStore: { listEntries: async () => [{ entryId: 'j1' }] },
};

const traceBuilder = createTrace({ messageId: 'msg-1', userId: 'user-1', companionId: 'companion-1', channel: 'discord', enabled: true });
for (const stage of TRACE_STAGES) {
  traceBuilder.addStage(stage, { status: 'ok', durationMs: 1, tokenCount: stage === 'prompt_assembly' ? 120 : 0, memoryIds: stage === 'memory_retrieval' ? ['m1'] : [] });
}
const trace = traceBuilder.finish('ok');
saveTrace(trace, config);

const diagnostics = readDiagnostics(config);
diagnostics.promptBuilds.push(
  { id: 'current', timestamp: new Date().toISOString(), channel: 'discord', companionId: 'companion-1', model: 'test', tokenCount: 420, compressionSavingsTokens: 80, sections: [{ name: 'system', tokenCount: 100, summary: 'be brief' }, { name: 'memory', tokenCount: 120, summary: 'memory context' }] },
  { id: 'previous', timestamp: new Date(Date.now() - 1000).toISOString(), channel: 'discord', companionId: 'companion-1', model: 'test', tokenCount: 390, sections: [{ name: 'system', tokenCount: 90, summary: 'be brief' }] },
);
diagnostics.companionEvents.push({ type: 'fallback', timestamp: new Date().toISOString() });
diagnostics.risks.push({ timestamp: new Date().toISOString(), companionId: 'companion-1', userId: 'user-1', channel: 'discord', riskType: 'unsupported_claim_risk', severity: 'medium', explanation: 'needs review' });
const { writeDiagnostics } = require('../src/aiDiagnostics.js');
writeDiagnostics(diagnostics, config);

const memoryHealth = await buildMemoryHealth({ innerContext, diagnostics });
assert.equal(memoryHealth.totalMemoryCount, 3);
assert.ok(memoryHealth.duplicateMemories.length >= 1);
assert.ok(memoryHealth.missingEmbeddings.length >= 1);

const promptHealth = buildPromptHealth({ diagnostics, config });
assert.equal(promptHealth.finalPromptTokenCount, 420);
assert.equal(promptHealth.promptDiff.tokenDelta, 30);

const companionHealth = buildCompanionHealth({ diagnostics });
assert.ok(companionHealth.score <= 100);
assert.ok(companionHealth.fallbackRate > 0);

const report = await buildAiDiagnosticsReport({ innerContext });
assert.ok(report.overall.score >= 0);
assert.equal(report.contextFlow.requiredStages.length, TRACE_STAGES.length);
assert.equal(report.contextFlow.recentTraces[0].stages.length, TRACE_STAGES.length);
assert.equal(report.privacy.separateStorage, true);
assert.equal(maskSensitive('api_key=abc123 sk-testsecret').includes('abc123'), false);

rmSync(tmp, { recursive: true, force: true });
console.log('[verify:ai-diagnostics] all checks passed');
