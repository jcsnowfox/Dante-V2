"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSelfCheckHours, buildSelfCheckContent, createSelfCheckScheduler } = require("./selfCheckScheduler");

test("parseSelfCheckHours defaults to morning noon night", () => {
  assert.deepEqual(parseSelfCheckHours(""), [8, 12, 21]);
  assert.deepEqual(parseSelfCheckHours("21,8,12,12"), [8, 12, 21]);
});

test("buildSelfCheckContent reports low confidence for diagnostic carry-forward entries", () => {
  const content = buildSelfCheckContent({
    now: new Date("2026-06-27T12:00:00Z"),
    recentDiagnosticEntries: [{ title: "Journal — diagnostic carry-forward", status: "active" }],
    config: { innerLife: { diagnosticChannelId: "1520510624617201804" } },
  });
  assert.match(content, /self-confidence: low/);
  assert.match(content, /Journal — diagnostic carry-forward/);
});

test("createSelfCheckScheduler sends only during configured scheduled hours", async () => {
  const sent = [];
  const client = {
    channels: {
      async fetch(id) {
        return { isTextBased: () => true, async send(payload) { sent.push({ id, payload }); return { id: "sent1" }; } };
      },
    },
  };
  const storeWrapper = {
    async list() {
      return [{ title: "Needs evidence store", status: "active", metadata: { kind: "diagnostic_carry_forward" } }];
    },
  };
  const scheduler = createSelfCheckScheduler({
    client,
    config: { innerLife: { diagnosticChannelId: "diag", selfCheck: { hours: [12] } } },
    storeWrapper,
    logger: null,
  });

  assert.equal((await scheduler.tick(new Date("2026-06-27T11:00:00Z"))).reason, "not_scheduled_hour");
  assert.equal((await scheduler.tick(new Date("2026-06-27T12:00:00Z"))).sent, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].id, "diag");
  assert.match(sent[0].payload.content, /self-confidence: low/);
});

test("unsupported perception incident reports low and not steady", () => {
  const { evaluateSelfConsistency } = require("../lifeRuntime/selfConsistencyMonitor");
  const signal = evaluateSelfConsistency({
    userText: "what do you see and feel from your end?",
    replyText: "I can see the touch bridge. I can feel its weight. It is wired in.",
    fulfillmentEvidence: [],
  });
  assert.equal(signal.self_confidence, "low");
  assert.ok(signal.evidence.includes("unsupported_perception_claim"));

  const content = buildSelfCheckContent({
    now: new Date("2026-06-27T12:00:00Z"),
    config: { innerLife: { diagnosticChannelId: "diag" } },
    diagnosticSnapshot: {
      selfConsistency: { active: true, lastSignal: signal, recentEvents: [{ eventType: "self_confidence_low" }] },
      activeConsequences: [{ eventType: "confabulation_detected", repairRequired: true, repairCompleted: false }],
      repair: { repairRequired: true, repair_followup_pending: true },
      relationshipLearning: { active_relationship_lessons: 1, recent_lesson_types: ["perception_boundary"], behavior_guidance_active: true, guidance: ["answer only from verified runtime evidence"] },
      recentDiagnosticEntries: [],
    },
  });
  assert.match(content, /self-confidence: (low|critical)/);
  assert.doesNotMatch(content, /self-confidence: steady/);
  assert.match(content, /unsupported perception claim|confabulation detected/);
  assert.match(content, /context is not perception/);
  assert.match(content, /follow-up pending/);
  assert.doesNotMatch(content, /no unresolved self-diagnostic journal flags found/);
});

test("active diagnostic consequences prevent screenshot steady regression", () => {
  const content = buildSelfCheckContent({
    now: new Date("2026-06-27T12:00:00Z"),
    config: { innerLife: { diagnosticChannelId: "diag" } },
    diagnosticSnapshot: {
      selfConsistency: { active: true, lastSignal: { self_confidence: "high", reason: "latest reply clear", evidence: [] }, recentEvents: [] },
      activeConsequences: [
        { eventType: "claimed_action_without_evidence", repairRequired: true, repairCompleted: false },
        { eventType: "self_confidence_low", repairRequired: true, repairCompleted: false },
      ],
      repair: { repairRequired: true, repair_followup_pending: true },
      recentDiagnosticEntries: [],
    },
  });
  assert.doesNotMatch(content, /self-confidence: steady/);
  assert.doesNotMatch(content, /no unresolved self-diagnostic journal flags found/);
  assert.match(content, /claimed action without evidence|self confidence low/);
});
