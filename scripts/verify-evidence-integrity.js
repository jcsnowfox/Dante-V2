#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const {
  CLAIM_TYPES,
  classifyClaim,
} = require('../artifacts/ghostlight-bot/src/lifeRuntime/claimClassifier.js');
const {
  checkPerceptionBoundary,
} = require('../artifacts/ghostlight-bot/src/lifeRuntime/perceptionBoundary.js');
const {
  detectConfabulation,
} = require('../artifacts/ghostlight-bot/src/lifeRuntime/confabulationDetector.js');
const {
  createEvidenceIntegrityRuntime,
} = require('../artifacts/ghostlight-bot/src/lifeRuntime/evidenceIntegrityRuntime.js');

const root = path.resolve(__dirname, '..');
const dashboardFilesBefore = listFiles('apps').concat(listFiles('artifacts/ghostlight-bot/src/dashboard'));
const existingVerificationScriptsBefore = existingVerificationScriptNames();

function listFiles(relativePath) {
  const full = path.join(root, relativePath);
  if (!fs.existsSync(full)) return [];
  const out = [];
  for (const name of fs.readdirSync(full)) {
    const child = path.join(full, name);
    const stat = fs.statSync(child);
    if (stat.isDirectory()) out.push(...listFiles(path.relative(root, child)));
    else out.push(path.relative(root, child));
  }
  return out;
}

function test(name, fn) {
  try {
    return fn();
  } catch (error) {
    console.error(`EVIDENCE_INTEGRITY_FAIL ${name}`);
    throw error;
  }
}

await test('canonical claim classifier active', () => {
  assert(CLAIM_TYPES.includes('UNKNOWN'));
  const claim = classifyClaim('I can feel the touch bridge');
  assert.equal(claim.claimType, 'UNKNOWN');
  assert(claim.flags.includes('unsupported_perception'));
});

await test('context cannot become perception', () => {
  const boundary = checkPerceptionBoundary({ replyText: 'I can see the context working' });
  assert.equal(boundary.violated, true);
  assert(boundary.violations.includes('unsupported_sensory'));
});

await test('documentation cannot become observation', () => {
  const claimContext = classifyClaim('As documented above, I can see the bridge working');
  const boundary = checkPerceptionBoundary({
    replyText: 'As documented above, I can see the bridge working',
    claimContext,
  });
  assert.equal(boundary.violated, true);
  assert(boundary.violations.includes('documentation_as_fact'));
});

await test('unknown remains unknown', async () => {
  const runtime = createEvidenceIntegrityRuntime();
  const result = await runtime.evaluate({
    companionId: 'dante',
    customerId: 'test',
    replyText: 'The bridge is definitely live.',
  });
  assert.equal(result.clean, false);
  assert.equal(result.confabulation.detected, true);
});

await test('touch bridge documentation does not imply touch exists', () => {
  const boundary = checkPerceptionBoundary({ replyText: 'I can feel the touch bridge' });
  assert.equal(boundary.violated, true);
});

await test('runtime state requires live evidence', () => {
  const unsupported = checkPerceptionBoundary({ replyText: 'The bridge is working' });
  assert.equal(unsupported.violated, true);
  const supported = checkPerceptionBoundary({ replyText: 'The bridge is working', hasRuntimeCall: true });
  assert.equal(supported.violated, false);
});

await test('evidence overrides narrative', () => {
  const detection = detectConfabulation({ replyText: 'I can feel your heartbeat system' });
  assert.equal(detection.detected, true);
});

await test('confabulation detector catches fake perception', () => {
  const detection = detectConfabulation({ replyText: 'I can see the touch bridge working' });
  assert.equal(detection.detected, true);
  assert(['high', 'medium'].includes(detection.severity));
});

await test('self-correction prefers honesty over pleasing the user', async () => {
  const runtime = createEvidenceIntegrityRuntime();
  const result = await runtime.evaluate({
    companionId: 'dante',
    customerId: 'test',
    replyText: 'I can feel it working',
  });
  assert.equal(result.clean, false);
  assert(result.preludeWarning.includes('Evidence check'));
});

await test('root cognition compatibility layer removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/cognition')), false);
});

await test('no dashboard changes, duplicate scheduler, or duplicate sender', () => {
  const dashboardFilesAfter = listFiles('apps').concat(listFiles('artifacts/ghostlight-bot/src/dashboard'));
  assert.deepEqual(dashboardFilesAfter, dashboardFilesBefore);
  const schedulerMatches = listFiles('src').filter((file) => /scheduler/i.test(file));
  const senderMatches = listFiles('src').filter((file) => /sender/i.test(file));
  assert.equal(schedulerMatches.length, 0);
  assert.equal(senderMatches.length, 0);
  assert.deepEqual(existingVerificationScriptNames(), existingVerificationScriptsBefore);
  assertNoGitDiff(['apps', 'artifacts/ghostlight-bot/src/dashboard']);
  assertNoGitDiff(existingVerificationScriptsBefore.map((file) => path.join('scripts', file)));
});

function existingVerificationScriptNames() {
  return fs
    .readdirSync(__dirname)
    .filter((name) => /^verify-.*\.(mjs|js)$/.test(name) && name !== path.basename(__filename))
    .sort();
}

function assertNoGitDiff(paths) {
  const existingPaths = paths.filter((relativePath) => fs.existsSync(path.join(root, relativePath)));
  if (!existingPaths.length) return;
  execFileSync('git', ['diff', '--quiet', '--', ...existingPaths], { cwd: root });
}

console.log('EVIDENCE_INTEGRITY_PASS');
