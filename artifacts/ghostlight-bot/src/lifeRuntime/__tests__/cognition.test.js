"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");
const path   = require("node:path");

const root = path.resolve(__dirname, "..");

// ── 1. cognitiveLedgerStore: record and retrieve ──────────────────────────────
test("cognitiveLedgerStore: record stores entry and listRecent returns it", async () => {
  const { createCognitiveLedgerStore } = require(path.join(root, "cognitiveLedgerStore"));
  const store = createCognitiveLedgerStore({});
  await store.init();

  const entry = await store.record({
    companionId:       "dante",
    customerId:        "jenna",
    thoughtCandidates: [{ type: "restraint", weight: 8, summary: "hold back" }],
    conflictsDetected: [{ type: "restraint_vs_romantic", severity: "high" }],
    chosenOutcome:     "restraint",
    recommendations:   { suppressRomantic: true },
    preludeSignal:     "Deliberating: holding back",
    confidence:        0.85,
    deliberationMs:    12,
    sourceRuntimes:    ["consequences"],
  });

  assert.ok(entry, "Should return entry");
  assert.equal(entry.chosen_outcome, "restraint");
  assert.equal(entry.confidence, 0.85);

  const recent = await store.listRecent({ companionId: "dante", customerId: "jenna", limit: 5 });
  assert.ok(recent.length > 0, "Should have entries");
  assert.equal(recent[0].chosen_outcome, "restraint");
});

// ── 2. cognitiveLedgerStore: THOUGHT_TYPES and COGNITIVE_OUTCOMES exported ────
test("cognitiveLedgerStore: exports THOUGHT_TYPES and COGNITIVE_OUTCOMES", () => {
  const { THOUGHT_TYPES, COGNITIVE_OUTCOMES } = require(path.join(root, "cognitiveLedgerStore"));
  assert.ok(Array.isArray(THOUGHT_TYPES), "THOUGHT_TYPES should be an array");
  assert.ok(Array.isArray(COGNITIVE_OUTCOMES), "COGNITIVE_OUTCOMES should be an array");
  assert.ok(THOUGHT_TYPES.includes("restraint"), "Should include 'restraint'");
  assert.ok(THOUGHT_TYPES.includes("evidence_warning"), "Should include 'evidence_warning'");
  assert.ok(COGNITIVE_OUTCOMES.includes("no_action"), "Should include 'no_action'");
  assert.ok(COGNITIVE_OUTCOMES.includes("restraint"), "Should include 'restraint'");
  assert.equal(THOUGHT_TYPES.length, 13, "Should have exactly 13 thought types");
  assert.equal(COGNITIVE_OUTCOMES.length, 7, "Should have exactly 7 cognitive outcomes");
});

// ── 3. cognitivePlanStore: createPlan and listActive ─────────────────────────
test("cognitivePlanStore: createPlan is visible in listActive", async () => {
  const { createCognitivePlanStore, PLAN_TYPES } = require(path.join(root, "cognitivePlanStore"));
  const store = createCognitivePlanStore({});
  await store.init();

  assert.ok(Array.isArray(PLAN_TYPES), "PLAN_TYPES should be an array");
  assert.equal(PLAN_TYPES.length, 9, "Should have exactly 9 plan types");

  const plan = await store.createPlan({
    companionId: "dante",
    customerId:  "jenna",
    planType:    "repair_plan",
    summary:     "Need to follow up on yesterday's tension",
    intent:      "Repair before reaching out romantically",
    confidence:  0.75,
  });

  assert.ok(plan, "Should create a plan");
  assert.equal(plan.plan_type, "repair_plan");
  assert.equal(plan.status, "forming");

  const active = await store.listActive({ companionId: "dante", customerId: "jenna" });
  assert.ok(active.length > 0, "Should have active plans");
  assert.equal(active[0].plan_type, "repair_plan");
});

// ── 4. cognitiveContextBuilder: builds from sparse input ─────────────────────
test("cognitiveContextBuilder: builds CognitiveInput from minimal context", () => {
  const { buildCognitiveInput } = require(path.join(root, "cognitiveContextBuilder"));
  const input = buildCognitiveInput({});

  assert.ok(input, "Should return an input object");
  assert.ok(input.jenna, "Should have jenna state");
  assert.equal(input.jenna.availability, "unknown");
  assert.equal(input.jenna.giveSpaceActive, false);
  assert.equal(input.repair.repairRequired, false);
  assert.equal(input.evidenceWarning, false);
  assert.equal(typeof input.quietHours, "boolean");
});

// ── 5. cognitiveContextBuilder: detects giveSpace from worldModel ─────────────
test("cognitiveContextBuilder: detects give space from worldModel context", () => {
  const { buildCognitiveInput } = require(path.join(root, "cognitiveContextBuilder"));
  const now = new Date("2025-01-01T14:00:00Z");

  const worldModelContext = {
    worldModel: {
      jenna: {
        give_space_state: { value: true, confidence: 0.90, source: "consequence", timestamp: now.toISOString(), evidence_ids: [], conflict: 0, stale: false },
        availability: { value: "busy", confidence: 0.80, source: "discord_event", timestamp: now.toISOString(), evidence_ids: [], conflict: 0, stale: false },
      },
    },
  };

  const input = buildCognitiveInput({ worldModelContext, now });
  assert.equal(input.jenna.giveSpaceActive, true, "Should detect giveSpace from worldModel");
  assert.equal(input.jenna.busy, true, "Should detect busy status");
});

// ── 6. cognitiveContextBuilder: repair state from consequenceContext ───────────
test("cognitiveContextBuilder: repair state from consequenceContext.carryover", () => {
  const { buildCognitiveInput } = require(path.join(root, "cognitiveContextBuilder"));
  const consequenceContext = {
    carryover: { repairRequired: true, repairStarted: false, healing: false, giveSpace: false },
    activeCount: 2,
  };
  const input = buildCognitiveInput({ consequenceContext });
  assert.equal(input.repair.repairRequired, true);
  assert.equal(input.repair.repairStarted, false);
  assert.equal(input.repair.activeCount, 2);
});

// ── 7. thoughtCandidateEngine: generates restraint when giveSpace active ──────
test("thoughtCandidateEngine: generates restraint candidate when giveSpaceActive", () => {
  const { generateThoughtCandidates } = require(path.join(root, "thoughtCandidateEngine"));
  const { buildCognitiveInput } = require(path.join(root, "cognitiveContextBuilder"));

  const worldModelContext = {
    worldModel: {
      jenna: {
        give_space_state: { value: true, confidence: 0.90, source: "consequence", timestamp: new Date().toISOString(), evidence_ids: [], conflict: 0, stale: false },
        availability: { value: "available", confidence: 0.70, source: "discord_event", timestamp: new Date().toISOString(), evidence_ids: [], conflict: 0, stale: false },
      },
    },
  };

  const input = buildCognitiveInput({ worldModelContext });
  const candidates = generateThoughtCandidates(input);

  assert.ok(candidates.length > 0, "Should produce candidates");
  const restraint = candidates.find(c => c.thoughtType === "restraint" && c.suppressesAction);
  assert.ok(restraint, "Should include a suppressing restraint candidate");
  assert.ok(restraint.suppressTypes.includes("romantic_plan"), "Should suppress romantic plans");
});

// ── 8. thoughtCandidateEngine: repair required produces repair_thought ────────
test("thoughtCandidateEngine: repair required produces repair_thought", () => {
  const { generateThoughtCandidates } = require(path.join(root, "thoughtCandidateEngine"));
  const { buildCognitiveInput } = require(path.join(root, "cognitiveContextBuilder"));

  const consequenceContext = {
    carryover: { repairRequired: true, repairStarted: false, healing: false, giveSpace: false },
    activeCount: 1,
  };
  const input = buildCognitiveInput({ consequenceContext });
  const candidates = generateThoughtCandidates(input);

  const repairThought = candidates.find(c => c.thoughtType === "repair_thought");
  assert.ok(repairThought, "Should include repair_thought");
  assert.ok(repairThought.encouragesRepair, "repair_thought should encourage repair");
});

// ── 9. thoughtCandidateEngine: evidence warning produces evidence_warning ─────
test("thoughtCandidateEngine: evidence warning from selfInspection", () => {
  const { generateThoughtCandidates } = require(path.join(root, "thoughtCandidateEngine"));
  const { buildCognitiveInput } = require(path.join(root, "cognitiveContextBuilder"));

  const selfInspectionContext = { preludeWarning: "Runtime: memory subsystem degraded" };
  const input = buildCognitiveInput({ selfInspectionContext });
  const candidates = generateThoughtCandidates(input);

  const evWarning = candidates.find(c => c.thoughtType === "evidence_warning");
  assert.ok(evWarning, "Should include evidence_warning candidate");
  assert.ok(evWarning.suppressesAction, "evidence_warning should suppress action");
  assert.ok(evWarning.weight >= 7, "evidence_warning should have high weight");
});

// ── 10. thoughtCandidateEngine: candidates sorted by weight desc ──────────────
test("thoughtCandidateEngine: candidates sorted descending by weight", () => {
  const { generateThoughtCandidates } = require(path.join(root, "thoughtCandidateEngine"));
  const { buildCognitiveInput } = require(path.join(root, "cognitiveContextBuilder"));

  const input = buildCognitiveInput({
    consequenceContext: { carryover: { repairRequired: true, repairStarted: false, healing: false, giveSpace: true }, activeCount: 2 },
    selfInspectionContext: { preludeWarning: "degraded" },
  });
  const candidates = generateThoughtCandidates(input);
  for (let i = 1; i < candidates.length; i++) {
    assert.ok(candidates[i - 1].weight >= candidates[i].weight, `Candidate ${i - 1} weight should be >= candidate ${i} weight`);
  }
});

// ── 11. internalConflictResolver: evidence warning → restraint outcome ─────────
test("internalConflictResolver: evidence_warning candidate produces restraint outcome", () => {
  const { resolveConflicts } = require(path.join(root, "internalConflictResolver"));

  const candidates = [
    { thoughtType: "evidence_warning", weight: 9, confidence: 0.90, suppressesAction: true, suppressTypes: [], encouragesRepair: false, fromLesson: false, summary: "Evidence uncertain" },
    { thoughtType: "romantic_thought",  weight: 3, confidence: 0.55, suppressesAction: false, suppressTypes: [], encouragesRepair: false, fromLesson: false, summary: "Impulse to reach out" },
  ];
  const input = { jenna: { giveSpaceActive: false }, quietHours: false, selfConfidenceLow: false };
  const resolution = resolveConflicts(candidates, input);

  assert.equal(resolution.outcome, "restraint", "Evidence warning should produce restraint");
  assert.ok(resolution.restraintActive, "restraintActive should be true");
  assert.ok(resolution.recommendations.suppressRomantic, "Should suppress romantic");
  assert.ok(resolution.conflictsDetected.length >= 0, "Should document conflicts");
});

// ── 12. internalConflictResolver: giveSpace → restraint with suppress ─────────
test("internalConflictResolver: giveSpace input produces restraint that suppresses outreach", () => {
  const { resolveConflicts } = require(path.join(root, "internalConflictResolver"));

  const candidates = [
    { thoughtType: "restraint",       weight: 9, confidence: 0.95, suppressesAction: true, suppressTypes: ["romantic_plan", "followup_plan"], encouragesRepair: false, fromLesson: false, summary: "Jenna needs space" },
    { thoughtType: "romantic_thought", weight: 3, confidence: 0.55, suppressesAction: false, suppressTypes: [], encouragesRepair: false, fromLesson: false, summary: "Warm impulse" },
  ];
  const input = { jenna: { giveSpaceActive: true }, quietHours: false, selfConfidenceLow: false };
  const resolution = resolveConflicts(candidates, input);

  assert.equal(resolution.outcome, "restraint");
  assert.ok(resolution.recommendations.suppressRomantic, "Should suppress romantic");
  assert.ok(resolution.recommendations.suppressFulfillmentOutreach, "Should suppress fulfillment outreach");
  assert.ok(resolution.recommendations.holdConversationFollowup, "Should hold followup");
});

// ── 13. internalConflictResolver: repair + romantic → conflict outcome ─────────
test("internalConflictResolver: repair_thought + romantic_thought → conflict with repair priority", () => {
  const { resolveConflicts } = require(path.join(root, "internalConflictResolver"));

  const candidates = [
    { thoughtType: "repair_thought",  weight: 8, confidence: 0.88, suppressesAction: false, suppressTypes: ["romantic_plan"], encouragesRepair: true, fromLesson: false, summary: "Something unresolved" },
    { thoughtType: "romantic_thought", weight: 3, confidence: 0.55, suppressesAction: false, suppressTypes: [], encouragesRepair: false, fromLesson: false, summary: "Warm impulse" },
  ];
  const input = { jenna: { giveSpaceActive: false }, quietHours: false, selfConfidenceLow: false };
  const resolution = resolveConflicts(candidates, input);

  assert.equal(resolution.outcome, "conflict", "Repair + romantic = conflict outcome");
  assert.ok(resolution.recommendations.suppressRomantic, "Should suppress romantic");
  assert.ok(resolution.recommendations.encourageRepair, "Should encourage repair");

  const repairConflict = resolution.conflictsDetected.find(c => c.type === "repair_vs_romantic");
  assert.ok(repairConflict, "Should detect repair_vs_romantic conflict");
});

// ── 14. cognitivePreludeBuilder: restraint produces non-null signal ────────────
test("cognitivePreludeBuilder: restraint resolution produces compact prelude signal", () => {
  const { buildCognitivePreludeSignal } = require(path.join(root, "cognitivePreludeBuilder"));

  const resolution = {
    outcome: "restraint",
    primaryThought: "Jenna needs space — hold back",
    restraintActive: true,
    uncertaintyActive: false,
    conflictsDetected: [{ type: "restraint_vs_romantic", severity: "high" }],
    recommendations: { suppressRomantic: true, suppressFulfillmentOutreach: true, holdConversationFollowup: true, forAffectiveDecision: "delay" },
  };

  const signal = buildCognitivePreludeSignal(resolution);
  assert.ok(signal !== null, "Should produce a signal");
  assert.ok(typeof signal === "string", "Signal should be a string");
  assert.ok(signal.length <= 180, "Signal should be <= 180 chars");
  assert.ok(signal.includes("Deliberating"), "Should start with Deliberating");
});

// ── 15. cognitivePreludeBuilder: no_action returns null ──────────────────────
test("cognitivePreludeBuilder: no_action outcome returns null", () => {
  const { buildCognitivePreludeSignal } = require(path.join(root, "cognitivePreludeBuilder"));

  const resolution = {
    outcome: "no_action",
    primaryThought: null,
    restraintActive: false,
    uncertaintyActive: false,
    conflictsDetected: [],
    recommendations: { suppressRomantic: false, suppressFulfillmentOutreach: false, holdConversationFollowup: false, encourageRepair: false, forAffectiveDecision: null },
  };

  const signal = buildCognitivePreludeSignal(resolution);
  assert.equal(signal, null, "no_action with no conflicts should return null");
});

// ── 16. cognitiveRuntime: tick returns CognitiveContext ──────────────────────
test("cognitiveRuntime: tick produces a CognitiveContext with expected shape", async () => {
  const { createCognitiveRuntime } = require(path.join(root, "cognitiveRuntime"));
  const rt = createCognitiveRuntime({});
  await rt.init();

  const ctx = await rt.tick({
    companionId: "dante",
    customerId:  "jenna",
    now:         new Date("2025-01-01T14:00:00Z"),
  });

  assert.ok(ctx, "tick should return a CognitiveContext");
  assert.ok(typeof ctx.outcome === "string", "outcome should be a string");
  assert.ok(typeof ctx.restraintActive === "boolean", "restraintActive should be boolean");
  assert.ok(typeof ctx.uncertaintyActive === "boolean", "uncertaintyActive should be boolean");
  assert.ok(ctx.recommendations, "Should have recommendations object");
  assert.ok(typeof ctx.recommendations.suppressRomantic === "boolean");
  assert.ok(typeof ctx.recommendations.suppressFulfillmentOutreach === "boolean");
  assert.ok(typeof ctx.recommendations.holdConversationFollowup === "boolean");
  assert.ok(typeof ctx.recommendations.encourageRepair === "boolean");
  assert.ok(typeof ctx.deliberationMs === "number", "deliberationMs should be a number");
});

// ── 17. cognitiveRuntime: getStatus reports safe metadata ────────────────────
test("cognitiveRuntime: getStatus returns safe metadata without PII", async () => {
  const { createCognitiveRuntime } = require(path.join(root, "cognitiveRuntime"));
  const rt = createCognitiveRuntime({});
  await rt.init();

  await rt.tick({ companionId: "dante", customerId: "jenna", now: new Date() });

  const status = rt.getStatus();
  assert.ok(status, "Should return status");
  assert.equal(status.available, true);
  assert.ok(typeof status.lastTickAt === "string" || status.lastTickAt === null);
  assert.ok(typeof status.tickCount === "number");
  assert.ok(typeof status.restraintActive === "boolean");
  assert.ok(typeof status.preludeActive === "boolean");
  // Should NOT expose raw thoughts
  assert.ok(!Object.hasOwn(status, "thoughtCandidates"), "Should not expose raw thought candidates");
  assert.ok(!Object.hasOwn(status, "primaryThought"), "Should not expose primaryThought in status");
});

// ── 18. cognitiveRuntime: getCognitiveContext returns null before tick ─────────
test("cognitiveRuntime: getCognitiveContext returns null before first tick", async () => {
  const { createCognitiveRuntime } = require(path.join(root, "cognitiveRuntime"));
  const rt = createCognitiveRuntime({});
  await rt.init();
  assert.equal(rt.getCognitiveContext(), null, "Should return null before first tick");
});

// ── 19. cognitiveRuntime: restraint with give_space suppresses romantic ────────
test("cognitiveRuntime: give_space context produces restraint that suppresses romantic", async () => {
  const { createCognitiveRuntime } = require(path.join(root, "cognitiveRuntime"));
  const rt = createCognitiveRuntime({});
  await rt.init();

  const worldModelContext = {
    worldModel: {
      jenna: {
        give_space_state: { value: true, confidence: 0.90, source: "consequence", timestamp: new Date().toISOString(), evidence_ids: [], conflict: 0, stale: false },
        availability: { value: "available", confidence: 0.70, source: "discord_event", timestamp: new Date().toISOString(), evidence_ids: [], conflict: 0, stale: false },
      },
    },
  };

  const ctx = await rt.tick({ companionId: "dante", customerId: "jenna", now: new Date(), worldModelContext });

  assert.ok(ctx, "Should produce context");
  assert.equal(ctx.outcome, "restraint", "Give space should produce restraint outcome");
  assert.equal(ctx.restraintActive, true, "restraintActive should be true");
  assert.equal(ctx.recommendations.suppressRomantic, true, "Should suppress romantic");
  assert.equal(ctx.recommendations.suppressFulfillmentOutreach, true, "Should suppress fulfillment outreach");
});
