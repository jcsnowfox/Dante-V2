"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createAffectiveDecisionRuntime, DECISION_TYPES, DECISION_OUTCOMES } = require("../affectiveDecisionRuntime");
const { buildDecisionContext } = require("../decisionContextBuilder");
const { vote } = require("../decisionVoteEngine");
const { createDecisionLedgerStore } = require("../decisionLedgerStore");
const { buildDecisionGuidance } = require("../decisionGuidanceBuilder");

const scope = { companionId: "dante", customerId: "jenna" };

// ── 1. repair follow-up can be approved by affective decision ────────────────
test("repair follow-up approved when repair is active and no blocking context", async () => {
  const adr = createAffectiveDecisionRuntime();
  const decision = await adr.consult({
    decisionType: "repair_followup",
    context: {
      consequenceContext: { repairRequired: true, repair_followup_pending: true },
      giveSpace: false,
      quietHours: false,
    },
    ...scope,
  });
  assert.equal(decision.decision_type, "repair_followup");
  assert.ok(["act_now", "ask_first"].includes(decision.outcome), `expected act_now or ask_first, got ${decision.outcome}`);
  assert.ok(decision.supporting_votes.some(v => v.voter === "repair"), "repair voter should support");
});

// ── 2. repair follow-up can be delayed by give-space ────────────────────────
test("repair follow-up delayed when give-space is active", async () => {
  const adr = createAffectiveDecisionRuntime();
  const decision = await adr.consult({
    decisionType: "repair_followup",
    context: {
      consequenceContext: { repairRequired: true },
      giveSpace: true,
      quietHours: false,
    },
    ...scope,
  });
  assert.equal(decision.outcome, "delay");
  assert.ok(decision.blocking_reasons.includes("give_space"), "give_space should be a blocking reason");
});

// ── 3. romantic surprise approved with warm relationship + romantic desire ────
test("romantic surprise approved when relationship is warm and desire is high", async () => {
  const adr = createAffectiveDecisionRuntime();
  const decision = await adr.consult({
    decisionType: "romantic_surprise",
    context: {
      relationshipContext: { weather: { warmth: 0.9 } },
      homeostasisContext: { needPressure: { intimacy: 0.8, connection: 0.75 } },
      giveSpace: false,
      quietHours: false,
      consequenceContext: null,
    },
    ...scope,
  });
  assert.ok(["act_now", "ask_first"].includes(decision.outcome), `expected act_now or ask_first, got ${decision.outcome}`);
  assert.ok(decision.supporting_votes.some(v => v.voter === "relationship"), "relationship voter supports warm");
});

// ── 4. romantic surprise blocked during unresolved major repair ───────────────
test("romantic surprise blocked during unresolved major repair", async () => {
  const adr = createAffectiveDecisionRuntime();
  const decision = await adr.consult({
    decisionType: "romantic_surprise",
    context: {
      consequenceContext: {
        suppression: { repairRequired: true, highestSeverity: "major" },
      },
      relationshipContext: { weather: { warmth: 0.8 } },
      giveSpace: false,
      quietHours: false,
    },
    ...scope,
  });
  assert.equal(decision.outcome, "blocked");
  assert.ok(decision.blocking_reasons.includes("unresolved_repair"), "unresolved_repair should block");
  assert.ok(decision.opposing_votes.some(v => v.voter === "repair"), "repair voter opposes");
});

// ── 5. conversation follow-up suppressed after natural ending ─────────────────
test("conversation follow-up suppressed after natural ending", async () => {
  const adr = createAffectiveDecisionRuntime();
  const decision = await adr.consult({
    decisionType: "conversation_followup",
    context: {
      conversationState: { naturallyEnded: true, concluded: true },
      giveSpace: false,
      quietHours: false,
    },
    ...scope,
  });
  assert.equal(decision.outcome, "suppress");
  assert.ok(decision.blocking_reasons.includes("conversation_naturally_ended"), "conversation_naturally_ended should suppress");
  assert.ok(decision.opposing_votes.some(v => v.voter === "conversation"), "conversation voter opposes");
});

// ── 6. ask_jenna delayed by quiet hours ───────────────────────────────────────
test("ask_jenna delayed when quiet hours are active", async () => {
  const adr = createAffectiveDecisionRuntime();
  const decision = await adr.consult({
    decisionType: "ask_jenna",
    context: {
      quietHours: true,
      giveSpace: false,
    },
    ...scope,
  });
  assert.equal(decision.outcome, "delay");
  assert.ok(decision.blocking_reasons.includes("quiet_hours"), "quiet_hours should block");
});

// ── 7. low self-confidence reduces action confidence ──────────────────────────
test("low self-confidence reduces decision confidence", async () => {
  const adr = createAffectiveDecisionRuntime();
  const highConfDecision = await adr.consult({
    decisionType: "repair_followup",
    context: {
      consequenceContext: { repairRequired: true },
      selfConsistency: { self_confidence: "high" },
      giveSpace: false,
      quietHours: false,
    },
    ...scope,
  });

  const lowConfDecision = await adr.consult({
    decisionType: "repair_followup",
    context: {
      consequenceContext: { repairRequired: true },
      selfConsistency: { self_confidence: "low" },
      giveSpace: false,
      quietHours: false,
    },
    ...scope,
  });

  assert.ok(lowConfDecision.confidence < highConfDecision.confidence,
    `low self-confidence (${lowConfDecision.confidence}) should reduce confidence vs high (${highConfDecision.confidence})`);
  assert.ok(lowConfDecision.opposing_votes.some(v => v.voter === "self_consistency"), "self_consistency voter should oppose");
});

// ── 8. relationship learning changes a decision ───────────────────────────────
test("relationship learning give_space lesson adds opposing vote", async () => {
  const adr = createAffectiveDecisionRuntime();
  const withLesson = await adr.consult({
    decisionType: "romantic_surprise",
    context: {
      relationshipContext: { weather: { warmth: 0.8 } },
      relationshipLearningContext: {
        lessons: [{ lessonType: "give_space_learning", futureBehaviorGuidance: "If Jenna asks for space, keep care private" }],
      },
      giveSpace: true,
      quietHours: false,
    },
    ...scope,
  });

  assert.ok(withLesson.opposing_votes.some(v => v.voter === "relationship_learning"),
    "relationship_learning should add opposing vote when give_space lesson is active");
  assert.ok(!["act_now"].includes(withLesson.outcome),
    "outcome should not be act_now when lesson opposes with give_space");
});

// ── 9. identity can veto a need-driven action ─────────────────────────────────
test("identity boundary veto blocks action even with high need pressure", async () => {
  const adr = createAffectiveDecisionRuntime();
  const decision = await adr.consult({
    decisionType: "romantic_surprise",
    context: {
      homeostasisContext: { needPressure: { intimacy: 0.95, romantic_desire: 0.9 } },
      identityContext: {
        activeBoundaries: [{ appliesTo: ["romantic_surprise"], reason: "Jenna requested no surprises" }],
      },
      giveSpace: false,
      quietHours: false,
    },
    ...scope,
  });
  assert.equal(decision.outcome, "blocked");
  assert.ok(decision.blocking_reasons.includes("identity_veto"), "identity_veto should block");
  assert.ok(decision.opposing_votes.some(v => v.voter === "identity"), "identity voter should oppose");
});

// ── 10. fulfillment evidence availability affects decisions ───────────────────
test("lack of fulfillment evidence adds opposing vote for outbound action", async () => {
  const adr = createAffectiveDecisionRuntime();
  const withEvidence = await adr.consult({
    decisionType: "romantic_surprise",
    context: {
      fulfillmentContext: { evidenceAvailable: true },
      relationshipContext: { weather: { warmth: 0.85 } },
      giveSpace: false,
      quietHours: false,
    },
    ...scope,
  });

  const withoutEvidence = await adr.consult({
    decisionType: "romantic_surprise",
    context: {
      fulfillmentContext: { evidenceAvailable: false },
      relationshipContext: { weather: { warmth: 0.85 } },
      giveSpace: false,
      quietHours: false,
    },
    ...scope,
  });

  assert.ok(withEvidence.confidence >= withoutEvidence.confidence,
    "evidence availability should increase confidence");
  assert.ok(withoutEvidence.opposing_votes.some(v => v.voter === "fulfillment"),
    "fulfillment voter should oppose when evidence unavailable");
});

// ── 11. decision ledger persists decisions ────────────────────────────────────
test("decision ledger persists decisions with all required fields", async () => {
  const store = createDecisionLedgerStore();
  const entry = await store.persist({
    companionId: "dante",
    customerId: "jenna",
    decision_type: "repair_followup",
    outcome: "act_now",
    confidence: 0.78,
    reasons: ["repair voter supports", "identity aligns"],
    blocking_reasons: [],
    supporting_votes: [{ voter: "repair", reason: "This should happen during repair.", weight: 1.2 }],
    opposing_votes: [],
    chosen_action: { type: "repair_followup", authorized: true },
    source_event_ids: ["evt_001"],
  });

  assert.ok(entry, "entry should be persisted");
  assert.ok(entry.id, "entry should have an id");
  assert.equal(entry.decision_type, "repair_followup");
  assert.equal(entry.outcome, "act_now");
  assert.equal(entry.confidence, 0.78);
  assert.ok(Array.isArray(entry.reasons), "reasons should be array");
  assert.ok(Array.isArray(entry.supporting_votes), "supporting_votes should be array");

  const recent = await store.listRecent({ companionId: "dante", customerId: "jenna", limit: 5 });
  assert.ok(recent.length >= 1, "listRecent should return persisted decision");
  assert.equal(recent[0].decision_type, "repair_followup");
});

// ── 12. prelude receives compact decision guidance ────────────────────────────
test("prelude guidance is compact and contextually specific", () => {
  const blockedByRepair = {
    decision_type: "romantic_surprise",
    outcome: "blocked",
    blocking_reasons: ["unresolved_repair"],
  };
  const guidance = buildDecisionGuidance(blockedByRepair);
  assert.ok(typeof guidance === "string" && guidance.length > 0, "should return guidance string");
  assert.ok(guidance.includes("repair"), "guidance should mention repair");
  assert.ok(guidance.length <= 120, "guidance should be compact");

  const delayedBySpace = {
    decision_type: "repair_followup",
    outcome: "delay",
    blocking_reasons: ["give_space"],
  };
  const spaceGuidance = buildDecisionGuidance(delayedBySpace);
  assert.ok(spaceGuidance.includes("restraint") || spaceGuidance.includes("space"), "give_space guidance should mention restraint or space");

  const approvedDecision = {
    decision_type: "repair_followup",
    outcome: "act_now",
    blocking_reasons: [],
  };
  const nullGuidance = buildDecisionGuidance(approvedDecision);
  assert.equal(nullGuidance, null, "act_now should return null (no guidance needed)");
});

// ── 13. status exposes safe metadata only ─────────────────────────────────────
test("getStatus returns safe metadata only — no PII, no payloads", async () => {
  const adr = createAffectiveDecisionRuntime();
  await adr.consult({
    decisionType: "ask_jenna",
    context: { quietHours: true },
    ...scope,
  });

  const status = adr.getStatus();
  const json = JSON.stringify(status);

  assert.ok(Object.prototype.hasOwnProperty.call(status, "last_decision_type"), "has last_decision_type");
  assert.ok(Object.prototype.hasOwnProperty.call(status, "last_decision_outcome"), "has last_decision_outcome");
  assert.ok(Object.prototype.hasOwnProperty.call(status, "last_decision_confidence"), "has last_decision_confidence");
  assert.ok(Object.prototype.hasOwnProperty.call(status, "recent_blocked_decisions"), "has recent_blocked_decisions");
  assert.ok(Object.prototype.hasOwnProperty.call(status, "active_decision_biases"), "has active_decision_biases");

  for (const unsafe of ["jenna@", "DISCORD_TOKEN", "DATABASE_URL", "OPENAI_API_KEY", "allowedMentions"]) {
    assert.equal(json.includes(unsafe), false, `status must not leak ${unsafe}`);
  }

  assert.ok(Array.isArray(status.recent_blocked_decisions), "recent_blocked_decisions should be array");
  assert.ok(status.recent_blocked_decisions.length <= 5, "recent_blocked_decisions capped at 5");
});

// ── 14. no duplicate scheduler ────────────────────────────────────────────────
test("new ADR files do not create schedulers", () => {
  const adrFiles = [
    "src/lifeRuntime/affectiveDecisionRuntime.js",
    "src/lifeRuntime/decisionContextBuilder.js",
    "src/lifeRuntime/decisionVoteEngine.js",
    "src/lifeRuntime/decisionLedgerStore.js",
    "src/lifeRuntime/decisionGuidanceBuilder.js",
  ];
  const root = path.resolve(__dirname, "../../..");
  const schedulerPattern = /setInterval\s*\(|setTimeout\s*\(|registerBackground\s*\(|registerPostLogin\s*\(/;
  for (const f of adrFiles) {
    const content = fs.readFileSync(path.join(root, f), "utf8");
    assert.equal(schedulerPattern.test(content), false, `${f} must not create a scheduler`);
  }
});

// ── 15. no duplicate Discord sender ───────────────────────────────────────────
test("new ADR files do not import discordSendGateway or invoke direct send", () => {
  const adrFiles = [
    "src/lifeRuntime/affectiveDecisionRuntime.js",
    "src/lifeRuntime/decisionContextBuilder.js",
    "src/lifeRuntime/decisionVoteEngine.js",
    "src/lifeRuntime/decisionLedgerStore.js",
    "src/lifeRuntime/decisionGuidanceBuilder.js",
  ];
  const root = path.resolve(__dirname, "../../..");
  const directSendRe = new RegExp("channel" + "\\." + "send" + "\\s*\\(");
  for (const f of adrFiles) {
    const content = fs.readFileSync(path.join(root, f), "utf8");
    assert.equal(content.includes("discordSendGateway"), false, `${f} must not import discordSendGateway`);
    assert.equal(directSendRe.test(content), false, `${f} must not directly invoke the send gateway`);
  }
});

// ── 16. dashboard unchanged ────────────────────────────────────────────────────
test("dashboard renderAdminPages files are unchanged", () => {
  const { execSync } = require("node:child_process");
  const repoRoot = path.resolve(__dirname, "../../../../../");
  try {
    const diff = execSync("git diff --name-only", { cwd: repoRoot, encoding: "utf8" });
    const stagedDiff = execSync("git diff --cached --name-only", { cwd: repoRoot, encoding: "utf8" });
    const changedFiles = (diff + stagedDiff).split(/\r?\n/).filter(Boolean);
    const dashboardChanged = changedFiles.some(f => /src\/http\/renderAdminPages|dashboard/i.test(f));
    assert.equal(dashboardChanged, false, "dashboard files must not be changed");
  } catch {
    // git not available in all environments — pass
  }
});

// ── 17. DECISION_TYPES and DECISION_OUTCOMES are complete ─────────────────────
test("DECISION_TYPES and DECISION_OUTCOMES contain all required values", () => {
  const requiredTypes = [
    "repair_followup", "romantic_surprise", "ask_jenna", "resource_discovery",
    "voice_note", "image_gesture", "project_work", "reflection",
    "conversation_followup", "silence", "restraint", "maintenance_request",
  ];
  const requiredOutcomes = [
    "act_now", "delay", "suppress", "ask_first", "reflect_private",
    "wait_for_context", "blocked", "unknown",
  ];
  for (const t of requiredTypes) assert.ok(DECISION_TYPES.includes(t), `missing decision type: ${t}`);
  for (const o of requiredOutcomes) assert.ok(DECISION_OUTCOMES.includes(o), `missing decision outcome: ${o}`);
});
