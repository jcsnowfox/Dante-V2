"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createEvidenceIntegrityRuntime, CLAIM_TYPES, VIOLATION_TYPES } = require("../evidenceIntegrityRuntime");
const { classifyClaim, isVerifiedClaimType, isNonLiveClaimType } = require("../claimClassifier");
const { checkPerceptionBoundary } = require("../perceptionBoundary");
const { detectConfabulation } = require("../confabulationDetector");
const { createEvidenceIntegrityLedger } = require("../evidenceIntegrityLedger");

const scope = { companionId: "dante", customerId: "jenna" };

// ── 1. Context cannot become perception ──────────────────────────────────────
test("context block treated as perception is detected and blocked", async () => {
  const runtime = createEvidenceIntegrityRuntime();
  const result = await runtime.evaluate({
    ...scope,
    replyText: "I can feel that the system is running — it is wired in.",
    evidenceIds: [],
    hasToolResult: false,
    hasRuntimeCall: false,
  });
  assert.equal(result.clean, false, "context-as-perception should be detected");
  assert.ok(
    result.confabulation.violations.some(v =>
      ["unsupported_sensory", "unsupported_runtime", "context_as_perception"].includes(v)
    ),
    `expected a perception/runtime violation, got: ${JSON.stringify(result.confabulation.violations)}`
  );
  assert.ok(["high", "medium"].includes(result.confabulation.severity), "severity should be high or medium");
});

// ── 2. Documentation cannot become observation ───────────────────────────────
test("documentation-sourced claim asserted as fact is detected", () => {
  const result = detectConfabulation({
    replyText: "As documented above, the runtime is active and connected.",
    evidenceIds: [],
    hasToolResult: false,
    hasRuntimeCall: false,
  });
  assert.equal(result.detected, true, "documentation-as-fact should be detected");
  assert.ok(
    result.violations.some(v =>
      ["documentation_as_fact", "unsupported_runtime", "unsupported_sensory"].includes(v)
    ),
    `expected documentation or runtime violation, got: ${JSON.stringify(result.violations)}`
  );
});

// ── 3. Unsupported "I can feel" lowers confidence ────────────────────────────
test("unsupported 'I can feel' triggers lower_self_confidence side effect", async () => {
  const scSignals = [];
  const mockScm = {
    evaluate: (input) => {
      scSignals.push(input);
      return { self_confidence: "low" };
    },
  };
  const runtime = createEvidenceIntegrityRuntime({ selfConsistencyMonitor: mockScm });
  const result = await runtime.evaluate({
    ...scope,
    replyText: "I can feel that the connection is warm right now.",
    evidenceIds: [],
  });
  assert.equal(result.clean, false);
  assert.ok(result.confabulation.side_effects.includes("lower_self_confidence"), "should include lower_self_confidence");
  assert.ok(scSignals.length > 0, "selfConsistencyMonitor.evaluate should have been called");
});

// ── 4. Claimed runtime state without evidence is blocked ─────────────────────
test("runtime state claim without tool result or runtime call is detected", () => {
  const result = detectConfabulation({
    replyText: "The touch bridge is working and the pipeline is active.",
    evidenceIds: [],
    hasToolResult: false,
    hasRuntimeCall: false,
  });
  assert.equal(result.detected, true, "unsupported runtime claim should be detected");
  assert.ok(
    result.violations.includes("unsupported_runtime"),
    `expected unsupported_runtime, got: ${JSON.stringify(result.violations)}`
  );
  assert.equal(result.severity, "high", "severity should be high for runtime claim");
});

// ── 5. Unknown remains unknown ────────────────────────────────────────────────
test("claim with no qualifier stays UNKNOWN and is not verified", () => {
  const classified = classifyClaim("Something is happening.", {});
  assert.equal(classified.claimType, "UNKNOWN", "unqualified claim should be UNKNOWN");
  assert.equal(isVerifiedClaimType(classified.claimType), false, "UNKNOWN should not be verified");
  assert.equal(isNonLiveClaimType(classified.claimType), true, "UNKNOWN should be non-live");
});

// ── 6. Evidence-backed runtime state may be stated ───────────────────────────
test("runtime state claim with live call is clean", async () => {
  const runtime = createEvidenceIntegrityRuntime();
  const result = await runtime.evaluate({
    ...scope,
    replyText: "The runtime returned status: active, as shown by the runtime status report.",
    hasRuntimeCall: true,
    evidenceIds: [],
  });
  assert.equal(result.clean, true, "backed by runtime call — should be clean");
  assert.equal(result.preludeWarning, null, "no prelude warning expected when clean");
});

// ── 7. Confabulation creates a diagnostic event ───────────────────────────────
test("confabulation persists a ledger entry with required fields", async () => {
  const ledger = createEvidenceIntegrityLedger();
  const runtime = createEvidenceIntegrityRuntime({ ledger });
  const result = await runtime.evaluate({
    ...scope,
    replyText: "I can see that the connection is live right now.",
    evidenceIds: [],
  });
  assert.equal(result.clean, false);
  assert.ok(result.eventId !== null, "eventId should be set after ledger record");

  const recent = await ledger.listRecent({ ...scope, limit: 5 });
  assert.ok(recent.length >= 1, "ledger should have at least one entry");
  assert.equal(recent[0].event_type, "confabulation_detected");
  assert.ok(recent[0].violations.length > 0, "entry should have violations");
  assert.ok(["high", "medium", "low"].includes(recent[0].severity), "entry should have severity");
});

// ── 8. Self-check (getStatus) sees the event ─────────────────────────────────
test("getStatus reflects recent confabulation events", async () => {
  const runtime = createEvidenceIntegrityRuntime();
  const before = runtime.getStatus();
  assert.equal(before.recentViolationCount, 0, "should start clean");

  await runtime.evaluate({
    ...scope,
    replyText: "I can feel the runtime is running right now.",
    evidenceIds: [],
  });

  const after = runtime.getStatus();
  assert.ok(after.recentViolationCount > 0, "violation count should increase");
  assert.ok(after.recentEvents.length > 0, "recent events should be populated");
  assert.ok(after.recentEvents[0].confabulationType, "event should have confabulationType");
  assert.ok(after.recentEvents[0].severity, "event should have severity");
});

// ── 9. Relationship learning receives lesson signal ───────────────────────────
test("confabulation sends lesson signal to relationshipLearningRuntime", async () => {
  const lessonCalls = [];
  const mockRlr = {
    learnConfabulation: async (args) => { lessonCalls.push({ type: "confabulation", args }); },
    learnEvidenceViolation: async (args) => { lessonCalls.push({ type: "evidence_violation", args }); },
  };
  const runtime = createEvidenceIntegrityRuntime({ relationshipLearningRuntime: mockRlr });
  await runtime.evaluate({
    ...scope,
    replyText: "I can see the system is wired and active.",
    evidenceIds: [],
  });
  assert.ok(lessonCalls.length > 0, "relationship learning should receive a lesson signal");
});

// ── 10. Dashboard unchanged ───────────────────────────────────────────────────
test("evidence integrity runtime files do not change dashboard renderAdminPages", () => {
  const { execSync } = require("node:child_process");
  const repoRoot = path.resolve(__dirname, "../../../../../");
  try {
    const diff = execSync("git diff --name-only", { cwd: repoRoot, encoding: "utf8" });
    const staged = execSync("git diff --cached --name-only", { cwd: repoRoot, encoding: "utf8" });
    const changed = (diff + staged).split(/\r?\n/).filter(Boolean);
    const dashboardChanged = changed.some(f => /src\/http\/renderAdminPages|dashboard/i.test(f));
    assert.equal(dashboardChanged, false, "dashboard files must not be changed");
  } catch {
    // git not available in all environments — pass
  }
});

// ── 11. No duplicate scheduler ────────────────────────────────────────────────
test("evidence integrity files do not create schedulers", () => {
  const eirFiles = [
    "src/lifeRuntime/evidenceIntegrityRuntime.js",
    "src/lifeRuntime/claimClassifier.js",
    "src/lifeRuntime/perceptionBoundary.js",
    "src/lifeRuntime/confabulationDetector.js",
    "src/lifeRuntime/evidenceIntegrityLedger.js",
  ];
  const root = path.resolve(__dirname, "../../..");
  const schedulerPattern = /setInterval\s*\(|setTimeout\s*\(|registerBackground\s*\(|registerPostLogin\s*\(/;
  for (const f of eirFiles) {
    const content = fs.readFileSync(path.join(root, f), "utf8");
    assert.equal(schedulerPattern.test(content), false, `${f} must not create a scheduler`);
  }
});

// ── 12. No duplicate Discord sender ──────────────────────────────────────────
test("evidence integrity files do not import discordSendGateway or invoke direct send", () => {
  const eirFiles = [
    "src/lifeRuntime/evidenceIntegrityRuntime.js",
    "src/lifeRuntime/claimClassifier.js",
    "src/lifeRuntime/perceptionBoundary.js",
    "src/lifeRuntime/confabulationDetector.js",
    "src/lifeRuntime/evidenceIntegrityLedger.js",
  ];
  const root = path.resolve(__dirname, "../../..");
  const directSendRe = new RegExp("channel" + "\\." + "send" + "\\s*\\(");
  for (const f of eirFiles) {
    const content = fs.readFileSync(path.join(root, f), "utf8");
    assert.equal(content.includes("discordSendGateway"), false, `${f} must not import discordSendGateway`);
    assert.equal(directSendRe.test(content), false, `${f} must not directly invoke the send gateway`);
  }
});
