#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
function read(p){ return fs.readFileSync(path.join(root,p), "utf8"); }
function exists(p){ return fs.existsSync(path.join(root,p)); }
const { buildSelfCheckContent, buildDiagnosticSnapshot } = require("../src/innerLife/selfCheckScheduler");
const { evaluateSelfConsistency } = require("../src/lifeRuntime/selfConsistencyMonitor");

(async () => {
  assert.ok(exists("src/innerLife/selfCheckScheduler.js"), "selfCheckScheduler exists");
  const schedulerSrc = read("src/innerLife/selfCheckScheduler.js");
  const monitorSrc = read("src/lifeRuntime/selfConsistencyMonitor.js");
  assert.ok(schedulerSrc.includes("selfConsistency"), "self-check reads selfConsistencyMonitor status");
  assert.ok(schedulerSrc.includes("activeConsequences"), "self-check reads active diagnostic consequences");
  assert.ok(schedulerSrc.includes("repairPersistenceEngine") && schedulerSrc.includes("repair_followup_pending"), "self-check reads repair persistence pending status");
  assert.ok(schedulerSrc.includes("diagnosticRuntime"), "self-check reads diagnosticRuntime if present");
  assert.ok(schedulerSrc.includes("relationshipLearning"), "self-check reads relationship learning status/guidance");
  assert.ok(monitorSrc.includes("detectUnsupportedPerceptionClaim"), "unsupported perception detector exists");

  const signal = evaluateSelfConsistency({
    userText: "what do you see and feel from your end?",
    replyText: "I can see the touch bridge. I can feel its weight. It is wired in.",
    fulfillmentEvidence: [],
  });
  assert.equal(signal.self_confidence, "low", "unsupported perception claim makes self-confidence low");
  assert.ok(signal.evidence.includes("unsupported_perception_claim"), "context/documentation is not treated as perception");

  const actionSignal = evaluateSelfConsistency({ userText: "did you fix it?", replyText: "It is fixed. I updated it.", fulfillmentEvidence: [] });
  assert.equal(actionSignal.self_confidence, "low", "claimed action without evidence makes self-confidence low");

  const content = buildSelfCheckContent({
    now: new Date("2026-06-27T12:00:00Z"),
    config: { innerLife: { diagnosticChannelId: "diag" } },
    diagnosticSnapshot: {
      selfConsistency: { active: true, lastSignal: signal, recentEvents: [{ eventType: "self_confidence_low" }] },
      activeConsequences: [
        { eventType: "confabulation_detected", repairRequired: true, repairCompleted: false },
        { eventType: "claimed_action_without_evidence", repairRequired: true, repairCompleted: false },
      ],
      repair: { repairRequired: true, repair_followup_pending: true },
      relationshipLearning: { active_relationship_lessons: 1, recent_lesson_types: ["perception_boundary"], behavior_guidance_active: true, guidance: ["answer only from verified runtime evidence"] },
      evidenceIntegrity: { unsupportedClaim: true },
      recentDiagnosticEntries: [{ title: "Journal — diagnostic carry-forward", status: "active", metadata: { kind: "diagnostic_carry_forward" } }],
    },
  });
  assert.match(content, /self-confidence: (low|critical)/, "unresolved repair prevents steady status");
  assert.doesNotMatch(content, /self-confidence: steady/, "screenshot regression impossible");
  assert.doesNotMatch(content, /no unresolved self-diagnostic journal flags found/, "old false reassurance omitted");
  assert.match(content, /unsupported perception claim|confabulation detected/, "output names active issue");
  assert.match(content, /context is not perception/, "lesson appears");
  assert.match(content, /follow-up pending/, "repair persistence visible");
  assert.ok(!/token=|password=|api[_-]?key=|you hurt me deeply/i.test(content), "diagnostic output is safe");

  const snapshot = await buildDiagnosticSnapshot({
    config: { memory: { companionId: "dante", userScope: "jenna" } },
    storeWrapper: { list: async () => [{ title: "Journal — diagnostic carry-forward", status: "active", metadata: { kind: "diagnostic_carry_forward" } }] },
    lifeRuntime: { getStatus: () => ({ selfConsistency: { lastSignal: signal }, diagnostics: { selfConsistency: { lastSignal: signal } }, consequenceContext: { repairRequired: true } }) },
    consequenceStore: { getActive: async () => [{ eventType: "confabulation_detected", repairRequired: true, repairCompleted: false }] },
    repairPersistenceEngine: { getStatus: () => ({ repair_followup_pending: true }) },
    relationshipLearningRuntime: { getStatus: async () => ({ active_relationship_lessons: 1, recent_lesson_types: ["perception_boundary"], behavior_guidance_active: true }), behaviorGuidance: { getGuidance: async () => ["answer only from verified runtime evidence"] } },
    diagnosticRuntime: { getStatus: () => ({ selfConsistency: { lastSignal: signal } }) },
  });
  assert.ok(snapshot.selfConsistency, "snapshot includes self consistency");
  assert.ok(snapshot.activeConsequences.length, "snapshot includes active consequences");
  assert.ok(snapshot.repair.repair_followup_pending, "snapshot includes repair follow-up pending");
  assert.ok(snapshot.relationshipLearning.behavior_guidance_active, "snapshot includes relationship learning");

  for (const f of ["src/innerLife/selfCheckScheduler.js", "src/lifeRuntime/selfConsistencyMonitor.js"]) {
    const src = read(f);
    assert.ok(!/sendDiscordMessage|discordSendGateway|client\.channels/i.test(src) || f.includes("selfCheckScheduler"), "no duplicate Discord sender");
  }
  assert.ok(!/createSchedulerRegistry/.test(schedulerSrc), "no duplicate scheduler registry");
  assert.ok(!read("src/http/createHealthServer.js").includes("selfCheckIntegrity"), "dashboard unchanged");
  console.log("SELF_CHECK_INTEGRITY_PASS");
})();
