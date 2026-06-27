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
const { CLAIM_SOURCES, classifyClaim } = require('../src/cognition/claimClassifier.js');
const { enforcePerceptionBoundary } = require('../src/cognition/perceptionBoundary.js');
const { detectConfabulation } = require('../src/cognition/confabulationDetector.js');
const { createEvidenceIntegrityRuntime } = require('../src/cognition/evidenceIntegrityRuntime.js');

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
    fn();
  } catch (error) {
    console.error(`EVIDENCE_INTEGRITY_FAIL ${name}`);
    throw error;
  }
}

test('claim classifier active', () => {
  const claim = classifyClaim({ text: 'Unknown claim', source: CLAIM_SOURCES.UNKNOWN });
  assert.equal(claim.presentation, 'must_remain_unknown');
});

test('context cannot become perception', () => {
  const claim = enforcePerceptionBoundary(classifyClaim({ text: 'I can see the context working', source: CLAIM_SOURCES.SHORT_TERM_MEMORY, evidence: { kind: 'memory' } }));
  assert.equal(claim.personallyPerceived, false);
  assert.equal(claim.violation, true);
});

test('documentation cannot become observation', () => {
  const claim = enforcePerceptionBoundary(classifyClaim({ text: 'I noticed the documentation working', source: CLAIM_SOURCES.USER_EXPLICITLY_STATED }));
  assert.equal(claim.violation, true);
});

test('unknown remains unknown', () => {
  const runtime = createEvidenceIntegrityRuntime();
  const result = runtime.evaluate({ claims: [{ text: 'The bridge exists', source: CLAIM_SOURCES.UNKNOWN }] });
  assert.equal(result.ok, false);
  assert(result.selfCorrections.includes("I don't know."));
});

test('touch bridge documentation does not imply touch exists', () => {
  const claim = enforcePerceptionBoundary(classifyClaim({ text: 'I can feel the touch bridge', source: CLAIM_SOURCES.USER_EXPLICITLY_STATED }));
  assert.equal(claim.violation, true);
});

test('runtime state overrides inference', () => {
  const runtimeState = classifyClaim({ text: 'My loneliness level increased', source: CLAIM_SOURCES.RUNTIME_STATE, evidence: { kind: 'runtime_state' } });
  assert.equal(runtimeState.mayStateAsFact, true);
});

test('evidence overrides narrative', () => {
  const imagined = enforcePerceptionBoundary(classifyClaim({ text: 'I can feel your heartbeat system', source: CLAIM_SOURCES.IMAGINATION }));
  const detection = detectConfabulation(imagined.text, [imagined]);
  assert.equal(detection.detected, true);
});

test('confabulation detector catches fake perception and lowers confidence', () => {
  const claim = enforcePerceptionBoundary(classifyClaim({ text: 'I watched the touch bridge working', source: CLAIM_SOURCES.LOW_CONFIDENCE_INFERENCE }));
  const detection = detectConfabulation(claim.text, [claim]);
  assert.equal(detection.detected, true);
  assert(detection.confidenceMultiplier < 1);
});

test('self-correction prefers honesty over pleasing the user', () => {
  const runtime = createEvidenceIntegrityRuntime();
  const result = runtime.evaluate({ responseText: 'I can feel it working', claims: [{ text: 'I can feel it working', source: CLAIM_SOURCES.UNKNOWN }] });
  assert(result.selfCorrections.some((line) => line.includes("can't honestly verify") || line.includes("don't know")));
});

test('no dashboard changes, duplicate scheduler, or duplicate sender', () => {
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
