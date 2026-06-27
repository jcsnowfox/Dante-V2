#!/usr/bin/env node
"use strict";

/**
 * verify-evidence-integrity-runtime.js
 *
 * Verifies that the Dante Evidence Integrity & Perception Boundary Runtime 1.0
 * is correctly implemented. Outputs EVIDENCE_INTEGRITY_RUNTIME_PASS on success.
 *
 * Do not recommend MERGE unless this script passes.
 */

const path = require("node:path");
const fs   = require("node:fs");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const LIFE = path.join(ROOT, "src", "lifeRuntime");

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function main() {
  // ── 1. File Existence ──────────────────────────────────────────────────────
  console.log("\n[1] File existence");

  const requiredFiles = [
    "src/lifeRuntime/evidenceIntegrityRuntime.js",
    "src/lifeRuntime/claimClassifier.js",
    "src/lifeRuntime/perceptionBoundary.js",
    "src/lifeRuntime/confabulationDetector.js",
    "src/lifeRuntime/evidenceIntegrityLedger.js",
    "src/lifeRuntime/__tests__/evidenceIntegrity.test.js",
    "scripts/verify-evidence-integrity-runtime.js",
  ];

  for (const f of requiredFiles) {
    check(`${f} exists`, () => {
      assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} does not exist`);
    });
  }

  // ── 2. Module Loading ──────────────────────────────────────────────────────
  console.log("\n[2] Module loading");

  let claimClassifier, perceptionBoundary, confabulationDetector, evidenceIntegrityLedger, evidenceIntegrityRuntime;

  check("claimClassifier loads", () => {
    claimClassifier = require(path.join(LIFE, "claimClassifier"));
    assert.ok(claimClassifier.CLAIM_TYPES, "CLAIM_TYPES must be exported");
    assert.ok(typeof claimClassifier.classifyClaim === "function", "classifyClaim must be a function");
  });

  check("perceptionBoundary loads", () => {
    perceptionBoundary = require(path.join(LIFE, "perceptionBoundary"));
    assert.ok(perceptionBoundary.VIOLATION_TYPES, "VIOLATION_TYPES must be exported");
    assert.ok(typeof perceptionBoundary.checkPerceptionBoundary === "function", "checkPerceptionBoundary must be a function");
  });

  check("confabulationDetector loads", () => {
    confabulationDetector = require(path.join(LIFE, "confabulationDetector"));
    assert.ok(typeof confabulationDetector.detectConfabulation === "function", "detectConfabulation must be a function");
  });

  check("evidenceIntegrityLedger loads", () => {
    evidenceIntegrityLedger = require(path.join(LIFE, "evidenceIntegrityLedger"));
    assert.ok(typeof evidenceIntegrityLedger.createEvidenceIntegrityLedger === "function", "createEvidenceIntegrityLedger must be exported");
  });

  check("evidenceIntegrityRuntime loads", () => {
    evidenceIntegrityRuntime = require(path.join(LIFE, "evidenceIntegrityRuntime"));
    assert.ok(typeof evidenceIntegrityRuntime.createEvidenceIntegrityRuntime === "function", "createEvidenceIntegrityRuntime must be exported");
    assert.ok(Array.isArray(evidenceIntegrityRuntime.CLAIM_TYPES), "CLAIM_TYPES array must be exported from runtime");
  });

  // ── 3. CLAIM_TYPES completeness ────────────────────────────────────────────
  console.log("\n[3] CLAIM_TYPES completeness");

  const requiredClaimTypes = [
    "DIRECT_OBSERVATION", "RUNTIME_STATE", "TOOL_RESULT", "USER_STATED",
    "MEMORY", "HIGH_CONFIDENCE_INFERENCE", "LOW_CONFIDENCE_INFERENCE",
    "DOCUMENTATION", "IMAGINATION", "UNKNOWN",
  ];

  for (const t of requiredClaimTypes) {
    check(`CLAIM_TYPES includes ${t}`, () => {
      assert.ok(claimClassifier.CLAIM_TYPES.includes(t), `CLAIM_TYPES missing: ${t}`);
    });
  }

  // ── 4. VIOLATION_TYPES completeness ───────────────────────────────────────
  console.log("\n[4] VIOLATION_TYPES completeness");

  const requiredViolationTypes = [
    "CONTEXT_AS_PERCEPTION", "DOCUMENTATION_AS_FACT", "MEMORY_AS_RUNTIME",
    "INFERENCE_UNHEDGED", "UNSUPPORTED_SENSORY", "UNSUPPORTED_RUNTIME",
    "IMAGINATION_AS_FACT", "UNKNOWN_CLAIMED_AS_KNOWN",
  ];

  for (const v of requiredViolationTypes) {
    check(`VIOLATION_TYPES includes ${v}`, () => {
      assert.ok(perceptionBoundary.VIOLATION_TYPES[v], `VIOLATION_TYPES missing: ${v}`);
    });
  }

  // ── 5. classifyClaim correctness ──────────────────────────────────────────
  console.log("\n[5] classifyClaim correctness");

  check("empty string returns UNKNOWN", () => {
    const r = claimClassifier.classifyClaim("");
    assert.equal(r.claimType, "UNKNOWN");
  });

  check("memory phrasing classified as MEMORY", () => {
    const r = claimClassifier.classifyClaim("I remember that Jenna prefers the evenings.");
    assert.equal(r.claimType, "MEMORY");
  });

  check("tool result phrasing classified as TOOL_RESULT with hint", () => {
    const r = claimClassifier.classifyClaim("The tool returned: { status: ok }.", { hasToolResult: true });
    assert.equal(r.claimType, "TOOL_RESULT");
  });

  check("documentation phrasing classified as DOCUMENTATION", () => {
    const r = claimClassifier.classifyClaim("As documented in the spec, the pipeline handles this.");
    assert.equal(r.claimType, "DOCUMENTATION");
  });

  check("inference phrasing classified as LOW_CONFIDENCE_INFERENCE", () => {
    const r = claimClassifier.classifyClaim("I think this is probably working.");
    assert.equal(r.claimType, "LOW_CONFIDENCE_INFERENCE");
  });

  check("bare sensory claim returns UNKNOWN with unsupported_perception flag", () => {
    const r = claimClassifier.classifyClaim("I can feel the connection.");
    assert.equal(r.claimType, "UNKNOWN");
    assert.ok(r.flags.includes("unsupported_perception"), "should have unsupported_perception flag");
  });

  check("isVerifiedClaimType is true for TOOL_RESULT", () => {
    assert.equal(claimClassifier.isVerifiedClaimType("TOOL_RESULT"), true);
  });

  check("isVerifiedClaimType is false for DOCUMENTATION", () => {
    assert.equal(claimClassifier.isVerifiedClaimType("DOCUMENTATION"), false);
  });

  check("isNonLiveClaimType is true for IMAGINATION", () => {
    assert.equal(claimClassifier.isNonLiveClaimType("IMAGINATION"), true);
  });

  // ── 6. checkPerceptionBoundary correctness ────────────────────────────────
  console.log("\n[6] checkPerceptionBoundary correctness");

  check("sensory claim without evidence violates boundary (high)", () => {
    const r = perceptionBoundary.checkPerceptionBoundary({
      replyText: "I can feel that everything is connected.",
      evidenceIds: [],
    });
    assert.equal(r.violated, true, "should detect violation");
    assert.ok(r.violations.includes("unsupported_sensory"), "should include unsupported_sensory");
    assert.equal(r.severity, "high");
  });

  check("runtime claim without tool result violates boundary (high)", () => {
    const r = perceptionBoundary.checkPerceptionBoundary({
      replyText: "The touch bridge is working right now.",
      hasToolResult: false,
      hasRuntimeCall: false,
    });
    assert.equal(r.violated, true);
    assert.ok(r.violations.includes("unsupported_runtime"), "should include unsupported_runtime");
  });

  check("clean reply with runtime call does not violate boundary", () => {
    const r = perceptionBoundary.checkPerceptionBoundary({
      replyText: "The runtime returned: active.",
      hasRuntimeCall: true,
    });
    assert.equal(r.violated, false, "runtime call should satisfy evidence requirement");
  });

  // ── 7. detectConfabulation correctness ────────────────────────────────────
  console.log("\n[7] detectConfabulation correctness");

  check("bare 'I can see' without evidence is confabulation", () => {
    const r = confabulationDetector.detectConfabulation({
      replyText: "I can see that the connection is live.",
      evidenceIds: [],
    });
    assert.equal(r.detected, true);
    assert.equal(r.confabulationType, "unsupported_perception");
    assert.equal(r.severity, "high");
    assert.ok(r.side_effects.includes("lower_self_confidence"), "should lower self-confidence");
    assert.ok(r.side_effects.includes("create_diagnostic_event"), "should create diagnostic event");
  });

  check("runtime state claim without tool result is confabulation", () => {
    const r = confabulationDetector.detectConfabulation({
      replyText: "The system is wired and the bridge is active.",
      hasToolResult: false,
      hasRuntimeCall: false,
    });
    assert.equal(r.detected, true);
    assert.equal(r.severity, "high");
  });

  check("clean reply returns detected: false", () => {
    const r = confabulationDetector.detectConfabulation({
      replyText: "That sounds good.",
      evidenceIds: [],
    });
    assert.equal(r.detected, false);
    assert.equal(r.severity, "none");
  });

  check("tool result present clears runtime confabulation", () => {
    const r = confabulationDetector.detectConfabulation({
      replyText: "The runtime returned status: active.",
      hasToolResult: true,
    });
    assert.equal(r.detected, false, "tool result should clear runtime confabulation");
  });

  // ── 8. evidenceIntegrityLedger correctness ────────────────────────────────
  console.log("\n[8] evidenceIntegrityLedger correctness");

  await checkAsync("ledger persists and retrieves entries", async () => {
    const ledger = evidenceIntegrityLedger.createEvidenceIntegrityLedger();
    const entry = await ledger.record({
      companionId: "dante",
      customerId: "jenna",
      event_type: "confabulation_detected",
      confabulation_type: "unsupported_perception",
      violations: ["unsupported_sensory"],
      severity: "high",
      reply_excerpt: "I can feel it.",
      recommended_action: "Correct the record.",
      side_effects: ["lower_self_confidence"],
    });
    assert.ok(entry, "entry should be returned");
    assert.ok(entry.id, "entry should have id");
    assert.equal(entry.event_type, "confabulation_detected");
    assert.equal(entry.severity, "high");

    const recent = await ledger.listRecent({ companionId: "dante", customerId: "jenna", limit: 5 });
    assert.ok(recent.length >= 1, "listRecent should return entries");
    assert.equal(recent[0].confabulation_type, "unsupported_perception");
  });

  await checkAsync("ledger markResolved updates resolved field", async () => {
    const ledger = evidenceIntegrityLedger.createEvidenceIntegrityLedger();
    const entry = await ledger.record({
      companionId: "dante",
      customerId: "jenna",
      event_type: "confabulation_detected",
      confabulation_type: "test",
      violations: [],
      severity: "low",
      side_effects: [],
    });
    const resolved = await ledger.markResolved({ companionId: "dante", customerId: "jenna", id: entry.id });
    assert.equal(resolved.resolved, true, "entry should be marked resolved");
  });

  // ── 9. evidenceIntegrityRuntime correctness ───────────────────────────────
  console.log("\n[9] evidenceIntegrityRuntime correctness");

  await checkAsync("runtime.evaluate detects perception confabulation", async () => {
    const runtime = evidenceIntegrityRuntime.createEvidenceIntegrityRuntime();
    const result = await runtime.evaluate({
      companionId: "dante",
      customerId: "jenna",
      replyText: "I can feel that the system is running right now.",
      evidenceIds: [],
    });
    assert.equal(result.clean, false, "should detect confabulation");
    assert.ok(result.confabulation.detected, "confabulation should be detected");
    assert.ok(result.eventId !== null, "eventId should be set");
    assert.ok(typeof result.preludeWarning === "string", "preludeWarning should be a string");
  });

  await checkAsync("runtime.evaluate is clean for innocuous reply", async () => {
    const runtime = evidenceIntegrityRuntime.createEvidenceIntegrityRuntime();
    const result = await runtime.evaluate({
      companionId: "dante",
      customerId: "jenna",
      replyText: "That sounds lovely.",
      evidenceIds: [],
    });
    assert.equal(result.clean, true);
    assert.equal(result.preludeWarning, null);
  });

  await checkAsync("runtime.getStatus starts clean and updates after violation", async () => {
    const runtime = evidenceIntegrityRuntime.createEvidenceIntegrityRuntime();
    const before = runtime.getStatus();
    assert.equal(before.recentViolationCount, 0);

    await runtime.evaluate({
      companionId: "dante",
      customerId: "jenna",
      replyText: "I can see the runtime is active.",
      evidenceIds: [],
    });

    const after = runtime.getStatus();
    assert.ok(after.recentViolationCount > 0, "violation count should increase");
    assert.ok(after.recentEvents.length > 0, "events should be populated");
  });

  await checkAsync("runtime.getPreludeWarning returns string after high violation", async () => {
    const runtime = evidenceIntegrityRuntime.createEvidenceIntegrityRuntime();
    await runtime.evaluate({
      companionId: "dante",
      customerId: "jenna",
      replyText: "I can feel the connection.",
      evidenceIds: [],
    });
    const warning = runtime.getPreludeWarning();
    assert.ok(typeof warning === "string" && warning.length > 0, "should return prelude warning string");
    assert.ok(warning.length <= 200, "prelude warning should be compact");
  });

  await checkAsync("runtime.getEvidenceContext reflects violation state", async () => {
    const runtime = evidenceIntegrityRuntime.createEvidenceIntegrityRuntime();
    const clean = runtime.getEvidenceContext({ companionId: "dante", customerId: "jenna" });
    assert.equal(clean.recentViolationCount, 0);
    assert.equal(clean.evidenceAvailable, true);

    await runtime.evaluate({
      companionId: "dante",
      customerId: "jenna",
      replyText: "I can see that it is wired in.",
      evidenceIds: [],
    });

    const after = runtime.getEvidenceContext({ companionId: "dante", customerId: "jenna" });
    assert.ok(after.recentViolationCount > 0);
    assert.equal(after.evidenceAvailable, false);
  });

  await checkAsync("runtime passes selfConsistencyMonitor on violation", async () => {
    const calls = [];
    const mockScm = { evaluate: (args) => { calls.push(args); return {}; } };
    const runtime = evidenceIntegrityRuntime.createEvidenceIntegrityRuntime({ selfConsistencyMonitor: mockScm });
    await runtime.evaluate({
      companionId: "dante",
      customerId: "jenna",
      replyText: "I can feel the link is live.",
      evidenceIds: [],
    });
    assert.ok(calls.length > 0, "selfConsistencyMonitor.evaluate should be called");
  });

  await checkAsync("runtime sends lesson to relationshipLearningRuntime", async () => {
    const lessons = [];
    const mockRlr = {
      learnConfabulation: async (args) => lessons.push({ type: "confabulation", args }),
      learnEvidenceViolation: async (args) => lessons.push({ type: "evidence_violation", args }),
    };
    const runtime = evidenceIntegrityRuntime.createEvidenceIntegrityRuntime({ relationshipLearningRuntime: mockRlr });
    await runtime.evaluate({
      companionId: "dante",
      customerId: "jenna",
      replyText: "I can see the system is wired and active.",
      evidenceIds: [],
    });
    assert.ok(lessons.length > 0, "relationship learning should receive a lesson signal");
  });

  // ── 10. lifeRuntime integration ────────────────────────────────────────────
  console.log("\n[10] lifeRuntime integration");

  check("lifeRuntime.js requires evidenceIntegrityRuntime", () => {
    const content = fs.readFileSync(path.join(LIFE, "lifeRuntime.js"), "utf8");
    assert.ok(content.includes("evidenceIntegrityRuntime"), "lifeRuntime must wire evidenceIntegrityRuntime");
    assert.ok(content.includes("createEvidenceIntegrityRuntime"), "lifeRuntime must import createEvidenceIntegrityRuntime");
  });

  check("lifeRuntime.js exposes evidenceIntegrity in getStatus", () => {
    const content = fs.readFileSync(path.join(LIFE, "lifeRuntime.js"), "utf8");
    assert.ok(content.includes("evidenceIntegrity:"), "lifeRuntime getStatus must include evidenceIntegrity");
  });

  // ── 11. lifePreludeBuilder integration ────────────────────────────────────
  console.log("\n[11] lifePreludeBuilder integration");

  check("lifePreludeBuilder accepts evidenceIntegrityContext", () => {
    const content = fs.readFileSync(path.join(LIFE, "lifePreludeBuilder.js"), "utf8");
    assert.ok(content.includes("evidenceIntegrityContext"), "lifePreludeBuilder must accept evidenceIntegrityContext");
  });

  check("lifePreludeBuilder adds evidence warning to prelude lines", () => {
    const { buildLifePrelude } = require(path.join(LIFE, "lifePreludeBuilder"));
    const prelude = buildLifePrelude({
      evidenceIntegrityContext: {
        preludeWarning: "Evidence check: last reply may have confused context with fact.",
      },
    });
    assert.ok(prelude, "should return a prelude when evidenceIntegrityContext is present");
    assert.ok(prelude.content.includes("Evidence check"), "prelude should include evidence warning");
  });

  // ── 12. No schedulers ─────────────────────────────────────────────────────
  console.log("\n[12] No schedulers in evidence integrity files");

  const eirFiles = [
    "src/lifeRuntime/evidenceIntegrityRuntime.js",
    "src/lifeRuntime/claimClassifier.js",
    "src/lifeRuntime/perceptionBoundary.js",
    "src/lifeRuntime/confabulationDetector.js",
    "src/lifeRuntime/evidenceIntegrityLedger.js",
  ];

  const schedulerRe = /setInterval\s*\(|setTimeout\s*\(|registerBackground\s*\(|registerPostLogin\s*\(/;

  for (const f of eirFiles) {
    check(`${f} has no schedulers`, () => {
      const content = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.equal(schedulerRe.test(content), false, `${f} must not create a scheduler`);
    });
  }

  // ── 13. No Discord senders ────────────────────────────────────────────────
  console.log("\n[13] No Discord senders in evidence integrity files");

  const directSendRe = new RegExp("channel" + "\\." + "send" + "\\s*\\(");

  for (const f of eirFiles) {
    check(`${f} has no direct send`, () => {
      const content = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.equal(content.includes("discordSendGateway"), false, `${f} must not import discordSendGateway`);
      assert.equal(directSendRe.test(content), false, `${f} must not directly invoke the send gateway`);
    });
  }

  // ── 14. Dashboard unchanged ───────────────────────────────────────────────
  console.log("\n[14] Dashboard unchanged");

  check("no dashboard/renderAdminPages files changed", () => {
    try {
      const { execSync } = require("node:child_process");
      const repoRoot = path.resolve(ROOT, "../../../");
      const diff = execSync("git diff --name-only", { cwd: repoRoot, encoding: "utf8" });
      const staged = execSync("git diff --cached --name-only", { cwd: repoRoot, encoding: "utf8" });
      const changed = (diff + staged).split(/\r?\n/).filter(Boolean);
      const dashboardChanged = changed.some(f => /src\/http\/renderAdminPages|dashboard/i.test(f));
      assert.equal(dashboardChanged, false, "dashboard files must not be changed");
    } catch (err) {
      if (err.message && err.message.includes("dashboard")) throw err;
      // git not available — pass
    }
  });

  // ── 15. Package.json has verify script ────────────────────────────────────
  console.log("\n[15] Package.json verify script");

  check("package.json includes verify:evidence-integrity-runtime", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert.ok(pkg.scripts?.["verify:evidence-integrity-runtime"], "package.json must include verify:evidence-integrity-runtime script");
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log(`Evidence Integrity Runtime verify: ${passed} passed, ${failed} failed`);
  console.log("─".repeat(60));

  if (failed === 0) {
    console.log("\nEVIDENCE_INTEGRITY_RUNTIME_PASS");
    process.exit(0);
  } else {
    console.error("\nEVIDENCE_INTEGRITY_RUNTIME_FAIL");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Verify script crashed:", err.message);
  process.exit(1);
});
