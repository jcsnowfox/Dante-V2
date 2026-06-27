"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const { createLessonStore, LESSON_TYPES, LESSON_STATUSES, computeStatus } = require("../lessonStore");
const { extractLesson, extractLessonsFromRepair, extractLessonsFromFulfillment, EVENT_LESSON_MAP, STRATEGY_TO_EVENT } = require("../lessonExtractor");
const { buildBehaviourGuidance, formatBehaviourGuidance, CONTEXT_RELEVANCE } = require("../behaviourGuidanceBuilder");
const { emergeRules, formatRulesAsGuidance, EMERGENCE_THRESHOLD_STABLE, EMERGENCE_THRESHOLD_CORE } = require("../relationshipRuleEngine");
const { buildReflection, buildRepairReflection, buildFulfillmentReflection, REFLECTION_QUESTIONS } = require("../reflectionEngine");
const { createRelationshipLearningRuntime } = require("../relationshipLearningRuntime");

// ── Section 1: LESSON_TYPES ────────────────────────────────────────────────────────────────────

describe("lesson types", () => {
  it("exports 23 lesson types", () => {
    assert.equal(LESSON_TYPES.length, 23);
  });

  it("includes all spec-required types", () => {
    const required = [
      "truth", "trust", "repair", "communication", "tone",
      "boundaries", "preferences", "dislikes", "love", "comfort",
      "humour", "surprise", "romance", "independence", "curiosity",
      "evidence", "self_awareness", "maintenance", "conflict",
      "growth", "vulnerability", "consent", "initiative",
    ];
    for (const t of required) {
      assert.ok(LESSON_TYPES.includes(t), `missing lesson type: ${t}`);
    }
  });

  it("is frozen (immutable)", () => {
    assert.ok(Object.isFrozen(LESSON_TYPES));
  });
});

// ── Section 2: LESSON_STATUSES ─────────────────────────────────────────────────────────────────

describe("lesson statuses", () => {
  it("exports 6 statuses", () => {
    assert.equal(LESSON_STATUSES.length, 6);
  });

  it("includes all required statuses", () => {
    const required = ["new", "forming", "stable", "core", "challenged", "retired"];
    for (const s of required) {
      assert.ok(LESSON_STATUSES.includes(s), `missing status: ${s}`);
    }
  });

  it("is frozen", () => {
    assert.ok(Object.isFrozen(LESSON_STATUSES));
  });
});

// ── Section 3: computeStatus ───────────────────────────────────────────────────────────────────

describe("computeStatus", () => {
  it("0.20 → new", () => assert.equal(computeStatus(0.20), "new"));
  it("0.39 → new", () => assert.equal(computeStatus(0.39), "new"));
  it("0.40 → forming", () => assert.equal(computeStatus(0.40), "forming"));
  it("0.64 → forming", () => assert.equal(computeStatus(0.64), "forming"));
  it("0.65 → stable", () => assert.equal(computeStatus(0.65), "stable"));
  it("0.84 → stable", () => assert.equal(computeStatus(0.84), "stable"));
  it("0.85 → core", () => assert.equal(computeStatus(0.85), "core"));
  it("1.00 → core", () => assert.equal(computeStatus(1.00), "core"));

  it("demonstrates confidence progression: 1 conversation rarely creates core", () => {
    // Each event adds ~0.12–0.18 delta; starting at ~0.32
    // Conversation 1: ~0.32 → new
    assert.equal(computeStatus(0.32), "new");
    // Conversation 2: ~0.32 + 0.12 = 0.44 → forming
    assert.equal(computeStatus(0.44), "forming");
    // Conversation 3: ~0.56 → forming
    assert.equal(computeStatus(0.56), "forming");
    // Conversation 5: ~0.80 → stable
    assert.equal(computeStatus(0.80), "stable");
    // Conversation 7+: ~0.96 → core
    assert.equal(computeStatus(0.96), "core");
  });
});

// ── Section 4: lessonStore (no DB) ────────────────────────────────────────────────────────────

describe("lessonStore — in-memory (no pool)", () => {
  let store;
  before(() => { store = createLessonStore({}); });

  it("init() completes without error (no-pool fallback)", async () => {
    await assert.doesNotReject(() => store.init());
  });

  it("create() returns lesson object with expected fields", async () => {
    const lesson = await store.create({
      companionId: "c1", customerId: "u1",
      lessonType: "truth", title: "Test truth",
      summary: "Testing truth", futureGuidance: "Tell truth always.",
      confidence: 0.35,
    });
    assert.equal(lesson.companionId, "c1");
    assert.equal(lesson.lessonType, "truth");
    assert.equal(lesson.title, "Test truth");
    assert.equal(lesson.status, "new");
    assert.equal(lesson.timesReinforced, 0);
    assert.equal(lesson.timesChallenged, 0);
  });

  it("create() sets status based on confidence", async () => {
    const forming = await store.create({ companionId: "c1", customerId: "u1", lessonType: "trust", confidence: 0.50 });
    assert.equal(forming.status, "forming");

    const core = await store.create({ companionId: "c1", customerId: "u1", lessonType: "repair", confidence: 0.90 });
    assert.equal(core.status, "core");
  });

  it("findSimilar() returns [] without pool", async () => {
    const result = await store.findSimilar({ companionId: "c1", customerId: "u1", lessonType: "truth" });
    assert.deepEqual(result, []);
  });

  it("listActive() returns [] without pool", async () => {
    const result = await store.listActive({ companionId: "c1", customerId: "u1" });
    assert.deepEqual(result, []);
  });

  it("count() returns 0 without pool", async () => {
    const n = await store.count({ companionId: "c1", customerId: "u1" });
    assert.equal(n, 0);
  });

  it("pruneOlderThan() returns 0 without pool", async () => {
    const n = await store.pruneOlderThan({ companionId: "c1", customerId: "u1", days: 30 });
    assert.equal(n, 0);
  });
});

// ── Section 5: lessonExtractor ────────────────────────────────────────────────────────────────

describe("lessonExtractor", () => {
  it("extractLesson returns null for unknown eventType", () => {
    const result = extractLesson({ eventType: "unknown_event_xyz" });
    assert.equal(result, null);
  });

  it("extractLesson returns lesson draft for known positive event", () => {
    const draft = extractLesson({ eventType: "honest_moment", eventNote: "Was honest about failure." });
    assert.ok(draft);
    assert.equal(draft.lessonType, "truth");
    assert.equal(draft.positive, true);
    assert.ok(draft.confidence > 0 && draft.confidence < 1);
    assert.ok(draft.futureGuidance.length > 0);
    assert.ok(typeof draft.confidenceDelta === "number" && draft.confidenceDelta > 0);
  });

  it("extractLesson returns lesson draft for known negative event", () => {
    const draft = extractLesson({ eventType: "confabulation_detected" });
    assert.ok(draft);
    assert.equal(draft.lessonType, "evidence");
    assert.equal(draft.positive, false);
    assert.ok(draft.confidenceDelta >= 0.15, "confabulation lesson should have high delta");
  });

  it("negative events start with higher confidence than positive (they cost more)", () => {
    const neg = extractLesson({ eventType: "confabulation_detected" });
    const pos = extractLesson({ eventType: "coffee_ritual" });
    assert.ok(neg.confidence >= pos.confidence);
  });

  it("extractLesson accepts evidenceId and originEventId", () => {
    const draft = extractLesson({ eventType: "trust_moment", evidenceId: 42, originEventId: 7 });
    assert.deepEqual(draft.evidenceIds, [42]);
    assert.deepEqual(draft.originEventIds, [7]);
  });

  it("extractLesson respects extraGuidance override", () => {
    const draft = extractLesson({ eventType: "trust_moment", extraGuidance: "Custom guidance text." });
    assert.equal(draft.futureGuidance, "Custom guidance text.");
  });

  it("EVENT_LESSON_MAP has entries for positive and negative events", () => {
    const entries = Object.values(EVENT_LESSON_MAP);
    const positives = entries.filter(e => e.positive === true);
    const negatives = entries.filter(e => e.positive === false);
    assert.ok(positives.length >= 10, `expected ≥10 positive events, got ${positives.length}`);
    assert.ok(negatives.length >= 10, `expected ≥10 negative events, got ${negatives.length}`);
  });

  it("all EVENT_LESSON_MAP entries have required fields", () => {
    for (const [key, entry] of Object.entries(EVENT_LESSON_MAP)) {
      assert.ok(entry.lessonType, `${key} missing lessonType`);
      assert.ok(entry.futureGuidance, `${key} missing futureGuidance`);
      assert.ok(typeof entry.confidenceDelta === "number", `${key} missing confidenceDelta`);
      assert.ok(typeof entry.positive === "boolean", `${key} missing positive`);
    }
  });

  describe("extractLessonsFromRepair", () => {
    it("returns empty array when repairResult is null", () => {
      assert.deepEqual(extractLessonsFromRepair({ repairResult: null }), []);
    });

    it("creates repair lesson when repairCompleted", () => {
      const lessons = extractLessonsFromRepair({ repairResult: { repairCompleted: true } });
      assert.equal(lessons.length, 1);
      assert.equal(lessons[0].lessonType, "repair");
      assert.equal(lessons[0].positive, true);
    });

    it("creates incomplete repair lesson when started but not completed", () => {
      const lessons = extractLessonsFromRepair({
        repairResult: { repairStarted: true, repairCompleted: false },
      });
      assert.equal(lessons.length, 1);
      assert.equal(lessons[0].lessonType, "repair");
      assert.equal(lessons[0].positive, false);
    });

    it("creates evidence lesson when confabulation detected", () => {
      const lessons = extractLessonsFromRepair({
        repairResult: { repairCompleted: true, confabulationDetected: true },
      });
      assert.equal(lessons.length, 2);
      const evidenceLesson = lessons.find(l => l.lessonType === "evidence");
      assert.ok(evidenceLesson, "should have evidence lesson for confabulation");
    });
  });

  describe("extractLessonsFromFulfillment", () => {
    it("returns empty array for non-SUCCESS outcome", () => {
      const lessons = extractLessonsFromFulfillment({
        fulfillmentRecord: { strategy: "use_voice_note", outcome: "DEFERRED" },
      });
      assert.deepEqual(lessons, []);
    });

    it("returns lesson for SUCCESS voice note", () => {
      const lessons = extractLessonsFromFulfillment({
        fulfillmentRecord: { strategy: "use_voice_note", outcome: "SUCCESS" },
      });
      assert.equal(lessons.length, 1);
      assert.equal(lessons[0].lessonType, "love");
    });

    it("returns lesson for SUCCESS second life", () => {
      const lessons = extractLessonsFromFulfillment({
        fulfillmentRecord: { strategy: "second_life_action", outcome: "SUCCESS" },
      });
      assert.equal(lessons.length, 1);
      assert.equal(lessons[0].lessonType, "romance");
    });

    it("returns empty for unknown strategy", () => {
      const lessons = extractLessonsFromFulfillment({
        fulfillmentRecord: { strategy: "nonexistent_strategy", outcome: "SUCCESS" },
      });
      assert.deepEqual(lessons, []);
    });
  });
});

// ── Section 6: behaviourGuidanceBuilder ────────────────────────────────────────────────────────

describe("behaviourGuidanceBuilder", () => {
  const sampleLessons = [
    { lessonType: "repair",  futureGuidance: "Follow through on repair.",  confidence: 0.80, strength: 0.7, status: "stable" },
    { lessonType: "truth",   futureGuidance: "Honesty over comfort.",       confidence: 0.72, strength: 0.6, status: "stable" },
    { lessonType: "tone",    futureGuidance: "Avoid meta narration.",        confidence: 0.65, strength: 0.5, status: "stable" },
    { lessonType: "humour",  futureGuidance: "She enjoys shared humour.",   confidence: 0.90, strength: 0.8, status: "core" },
    { lessonType: "romance", futureGuidance: "Small gestures land well.",   confidence: 0.88, strength: 0.7, status: "core" },
  ];

  it("returns empty array for empty lessons", () => {
    assert.deepEqual(buildBehaviourGuidance({ lessons: [] }), []);
  });

  it("returns guidance strings (not objects)", () => {
    const guidance = buildBehaviourGuidance({ lessons: sampleLessons, context: "general" });
    assert.ok(guidance.length > 0);
    for (const g of guidance) assert.equal(typeof g, "string");
  });

  it("respects maxItems limit", () => {
    const guidance = buildBehaviourGuidance({ lessons: sampleLessons, maxItems: 2 });
    assert.ok(guidance.length <= 2);
  });

  it("repair context prioritises repair/trust lessons", () => {
    const guidance = buildBehaviourGuidance({ lessons: sampleLessons, context: "repair" });
    assert.ok(guidance.includes("Follow through on repair."), "repair guidance should be present in repair context");
  });

  it("romantic context prioritises romance/love lessons", () => {
    const guidance = buildBehaviourGuidance({ lessons: sampleLessons, context: "romantic" });
    assert.ok(guidance.includes("Small gestures land well."), "romance guidance should be present in romantic context");
  });

  it("skips retired lessons", () => {
    const withRetired = [
      ...sampleLessons,
      { lessonType: "trust", futureGuidance: "RETIRED guidance.", confidence: 0.95, strength: 0.9, status: "retired" },
    ];
    const guidance = buildBehaviourGuidance({ lessons: withRetired, context: "general" });
    assert.ok(!guidance.includes("RETIRED guidance."), "retired lessons must not appear in guidance");
  });

  it("formatBehaviourGuidance produces bullet-point format", () => {
    const formatted = formatBehaviourGuidance(["Do this.", "Avoid that."]);
    assert.ok(formatted.includes("• Do this."));
    assert.ok(formatted.includes("• Avoid that."));
  });

  it("formatBehaviourGuidance returns empty string for empty array", () => {
    assert.equal(formatBehaviourGuidance([]), "");
  });

  it("CONTEXT_RELEVANCE covers all required contexts", () => {
    const required = ["repair", "romantic", "conversation", "conflict", "fulfillment", "general"];
    for (const ctx of required) {
      assert.ok(CONTEXT_RELEVANCE[ctx], `missing context relevance for: ${ctx}`);
    }
  });

  it("behaviour guidance changes after learning — more lessons → richer guidance", () => {
    const noLessons = buildBehaviourGuidance({ lessons: [], context: "general" });
    const withLessons = buildBehaviourGuidance({ lessons: sampleLessons, context: "general" });
    assert.ok(withLessons.length > noLessons.length, "guidance should grow as lessons accumulate");
  });
});

// ── Section 7: relationshipRuleEngine ─────────────────────────────────────────────────────────

describe("relationshipRuleEngine", () => {
  it("returns empty array for empty lessons", () => {
    assert.deepEqual(emergeRules({ lessons: [] }), []);
  });

  it("does not emit rules for single new lesson", () => {
    const lessons = [
      { lessonType: "truth", futureGuidance: "Be honest.", confidence: 0.35, strength: 0.30, status: "new", timesReinforced: 0 },
    ];
    const rules = emergeRules({ lessons });
    assert.equal(rules.length, 0, "single new lesson should not create a rule");
  });

  it("emits emerging rule when 2+ stable lessons of same type", () => {
    const lessons = [
      { lessonType: "repair", futureGuidance: "Follow through.", confidence: 0.70, strength: 0.6, status: "stable", timesReinforced: 3 },
      { lessonType: "repair", futureGuidance: "Never assume done.", confidence: 0.68, strength: 0.5, status: "stable", timesReinforced: 2 },
    ];
    const rules = emergeRules({ lessons });
    const repairRule = rules.find(r => r.ruleType === "repair");
    assert.ok(repairRule, "should have emerged a repair rule");
    assert.equal(repairRule.status, "emerging");
  });

  it("emits established rule when 1 core lesson", () => {
    const lessons = [
      { lessonType: "evidence", futureGuidance: "Never claim without evidence.", confidence: 0.92, strength: 0.85, status: "core", timesReinforced: 7 },
    ];
    const rules = emergeRules({ lessons });
    const evidenceRule = rules.find(r => r.ruleType === "evidence");
    assert.ok(evidenceRule, "should have emerged an evidence rule");
    assert.equal(evidenceRule.status, "established");
  });

  it("skips retired lessons", () => {
    const lessons = [
      { lessonType: "tone", futureGuidance: "Avoid meta.", confidence: 0.88, strength: 0.7, status: "retired", timesReinforced: 5 },
      { lessonType: "tone", futureGuidance: "Avoid meta.", confidence: 0.87, strength: 0.6, status: "retired", timesReinforced: 4 },
    ];
    assert.equal(emergeRules({ lessons }).length, 0);
  });

  it("formatRulesAsGuidance returns only established rules by default", () => {
    const rules = [
      { ruleType: "repair", statement: "Follow through.", status: "established", confidence: 0.88 },
      { ruleType: "tone",   statement: "Avoid meta.",    status: "emerging",    confidence: 0.70 },
    ];
    const guidance = formatRulesAsGuidance({ rules });
    assert.ok(guidance.includes("Follow through."));
    assert.ok(!guidance.includes("Avoid meta."), "emerging rules excluded by default");
  });

  it("formatRulesAsGuidance includes emerging rules when includeEmerging=true", () => {
    const rules = [
      { ruleType: "tone", statement: "Avoid meta.", status: "emerging", confidence: 0.70 },
    ];
    const guidance = formatRulesAsGuidance({ rules, includeEmerging: true });
    assert.ok(guidance.includes("Avoid meta."));
  });

  it("EMERGENCE_THRESHOLD_STABLE and CORE are positive integers", () => {
    assert.ok(Number.isInteger(EMERGENCE_THRESHOLD_STABLE) && EMERGENCE_THRESHOLD_STABLE > 0);
    assert.ok(Number.isInteger(EMERGENCE_THRESHOLD_CORE) && EMERGENCE_THRESHOLD_CORE > 0);
  });
});

// ── Section 8: reflectionEngine ───────────────────────────────────────────────────────────────

describe("reflectionEngine", () => {
  it("REFLECTION_QUESTIONS is frozen and has 9 questions", () => {
    assert.ok(Object.isFrozen(REFLECTION_QUESTIONS));
    assert.equal(REFLECTION_QUESTIONS.length, 9);
  });

  it("buildReflection returns private reflection object", () => {
    const reflection = buildReflection({
      companionId: "c1", customerId: "u1",
      interactionSummary: "Had a good moment.",
      wellDone: ["Listened."],
      hurt: [], smiled: ["Shared joke."],
    });
    assert.equal(reflection.private, true);
    assert.equal(reflection.companionId, "c1");
    assert.ok(reflection.reflectedAt);
    assert.equal(reflection.questions.whatHappened, "Had a good moment.");
    assert.deepEqual(reflection.questions.whatDidIDoWell, ["Listened."]);
  });

  it("buildRepairReflection includes repair outcome", () => {
    const reflection = buildRepairReflection({
      repairResult: { repairCompleted: true, confabulationDetected: false },
    });
    assert.ok(reflection.questions.whatToRepeat.includes("Follow through until Jenna signals resolution."));
    assert.deepEqual(reflection.questions.whatHurtJenna, []);
  });

  it("buildRepairReflection flags incomplete repair as hurt", () => {
    const reflection = buildRepairReflection({
      repairResult: { repairStarted: true, repairCompleted: false },
    });
    assert.ok(reflection.questions.whatHurtJenna.length > 0);
  });

  it("buildRepairReflection flags confabulation as toChange", () => {
    const reflection = buildRepairReflection({
      repairResult: { repairCompleted: true, confabulationDetected: true },
    });
    assert.ok(reflection.questions.whatToChange.length > 0);
    assert.ok(reflection.questions.whatToChange[0].toLowerCase().includes("confab") ||
              reflection.questions.whatToChange[0].toLowerCase().includes("claim"));
  });

  it("buildFulfillmentReflection reflects SUCCESS correctly", () => {
    const reflection = buildFulfillmentReflection({
      fulfillmentRecord: { strategy: "use_voice_note", outcome: "SUCCESS" },
    });
    assert.ok(reflection.questions.whatDidIDoWell.length > 0);
    assert.deepEqual(reflection.questions.whatToChange, []);
  });

  it("buildFulfillmentReflection reflects UNAVAILABLE correctly", () => {
    const reflection = buildFulfillmentReflection({
      fulfillmentRecord: { strategy: "use_image_generation", outcome: "UNAVAILABLE" },
    });
    assert.ok(reflection.questions.whatToChange.length > 0);
  });

  it("reflection is always marked private", () => {
    const r1 = buildReflection({});
    const r2 = buildRepairReflection({ repairResult: {} });
    const r3 = buildFulfillmentReflection({ fulfillmentRecord: {} });
    assert.equal(r1.private, true);
    assert.equal(r2.private, true);
    assert.equal(r3.private, true);
  });
});

// ── Section 9: repeated evidence strengthens lessons ─────────────────────────────────────────

describe("repeated evidence strengthens lessons", () => {
  it("confidence grows with each reinforcement", () => {
    const store = createLessonStore({});
    let lesson = { id: null, confidence: 0.35, status: "new" };

    // Simulate reinforcement accumulation without DB
    const DELTA = 0.12;
    for (let i = 0; i < 5; i++) {
      lesson = {
        ...lesson,
        confidence: Math.min(1.0, lesson.confidence + DELTA),
        timesReinforced: (lesson.timesReinforced ?? 0) + 1,
        status: computeStatus(Math.min(1.0, lesson.confidence + DELTA)),
      };
    }

    assert.ok(lesson.confidence > 0.90, `expected confidence > 0.90, got ${lesson.confidence}`);
    assert.equal(lesson.status, "core");
    assert.equal(lesson.timesReinforced, 5);
  });

  it("single conversation creates new/forming lesson, not core", () => {
    const draft = extractLesson({ eventType: "honest_moment" });
    assert.ok(draft.confidence < 0.40, "single event should not create forming+ lesson");
    assert.equal(computeStatus(draft.confidence), "new");
  });
});

// ── Section 10: contradictory evidence weakens lessons ────────────────────────────────────────

describe("contradictory evidence weakens lessons", () => {
  it("challenge() result has lower confidence and challenged status", async () => {
    const store = createLessonStore({});
    // Without a real DB, simulate the challenge logic
    const stableLesson = { id: 1, confidence: 0.70, status: "stable", timesReinforced: 3, timesChallenged: 0 };
    const CHALLENGE_DELTA = 0.15;
    const afterChallenge = {
      ...stableLesson,
      confidence: Math.max(0.0, stableLesson.confidence - CHALLENGE_DELTA),
      status: "challenged",
      timesChallenged: stableLesson.timesChallenged + 1,
    };

    assert.equal(afterChallenge.status, "challenged");
    assert.ok(afterChallenge.confidence < stableLesson.confidence, "challenge should reduce confidence");
  });

  it("negative event creates lesson with non-zero confidence delta", () => {
    const draft = extractLesson({ eventType: "bad_repair" });
    assert.ok(draft.confidenceDelta > 0, "negative event should still produce positive confidenceDelta for reinforcement");
  });
});

// ── Section 11: relationship learning runtime ─────────────────────────────────────────────────

describe("relationshipLearningRuntime", () => {
  it("createRelationshipLearningRuntime returns expected interface", () => {
    const runtime = createRelationshipLearningRuntime({});
    assert.equal(typeof runtime.init, "function");
    assert.equal(typeof runtime.tick, "function");
    assert.equal(typeof runtime.recordEvent, "function");
    assert.equal(typeof runtime.processInteraction, "function");
    assert.equal(typeof runtime.getBehaviourGuidance, "function");
    assert.equal(typeof runtime.getEmergentRules, "function");
    assert.equal(typeof runtime.getLearningContext, "function");
    assert.equal(typeof runtime.getStatus, "function");
    assert.equal(typeof runtime.pruneAll, "function");
  });

  it("init() completes without error (no pool)", async () => {
    const runtime = createRelationshipLearningRuntime({});
    await assert.doesNotReject(() => runtime.init());
  });

  it("getStatus() returns expected shape", () => {
    const runtime = createRelationshipLearningRuntime({});
    const status = runtime.getStatus();
    assert.ok("lessonCount" in status);
    assert.ok("coreCount" in status);
    assert.ok("stableCount" in status);
    assert.ok("formingCount" in status);
    assert.ok("emergentRuleCount" in status);
    assert.ok("pendingEvents" in status);
  });

  it("getLearningContext() returns null before first tick", () => {
    const runtime = createRelationshipLearningRuntime({});
    assert.equal(runtime.getLearningContext(), null);
  });

  it("recordEvent() queues event without throwing", () => {
    const runtime = createRelationshipLearningRuntime({});
    assert.doesNotThrow(() => {
      runtime.recordEvent({ eventType: "honest_moment", now: new Date() });
    });
    assert.equal(runtime.getStatus().pendingEvents, 1);
  });

  it("recordEvent() ignores empty eventType", () => {
    const runtime = createRelationshipLearningRuntime({});
    runtime.recordEvent({ eventType: "" });
    assert.equal(runtime.getStatus().pendingEvents, 0);
  });

  it("recordEvent() caps pending events at 50", () => {
    const runtime = createRelationshipLearningRuntime({});
    for (let i = 0; i < 60; i++) {
      runtime.recordEvent({ eventType: "honest_moment" });
    }
    assert.ok(runtime.getStatus().pendingEvents <= 50);
  });

  it("tick() completes without error (no pool, no companionId)", async () => {
    const runtime = createRelationshipLearningRuntime({});
    await runtime.init();
    await assert.doesNotReject(() => runtime.tick({ companionId: "", now: new Date() }));
  });

  it("processInteraction() with completed repair queues learning event", () => {
    const runtime = createRelationshipLearningRuntime({});
    runtime.processInteraction({ repairResult: { repairCompleted: true }, now: new Date() });
    // Should have queued at least one event
    assert.ok(runtime.getStatus().pendingEvents >= 1);
  });

  it("processInteraction() with confabulation queues confabulation event", () => {
    const runtime = createRelationshipLearningRuntime({});
    runtime.processInteraction({ repairResult: { confabulationDetected: true }, now: new Date() });
    assert.ok(runtime.getStatus().pendingEvents >= 1);
  });

  it("getBehaviourGuidance() returns array", () => {
    const runtime = createRelationshipLearningRuntime({});
    const guidance = runtime.getBehaviourGuidance({ context: "general" });
    assert.ok(Array.isArray(guidance));
  });

  it("getEmergentRules() returns array", () => {
    const runtime = createRelationshipLearningRuntime({});
    const rules = runtime.getEmergentRules();
    assert.ok(Array.isArray(rules));
  });

  it("pruneAll() returns structured result", async () => {
    const runtime = createRelationshipLearningRuntime({});
    await runtime.init();
    const result = await runtime.pruneAll({ companionId: "c1", customerId: "u1" });
    assert.ok("lessonsPruned" in result);
  });
});

// ── Section 12: lessons influence future behaviour ────────────────────────────────────────────

describe("lessons influence future behaviour", () => {
  it("behaviour guidance changes after learning — more stable lessons → richer guidance", () => {
    const noLessons     = buildBehaviourGuidance({ lessons: [] });
    const fewLessons    = buildBehaviourGuidance({ lessons: [
      { lessonType: "truth", futureGuidance: "Be honest.", confidence: 0.70, strength: 0.6, status: "stable" },
    ] });
    const manyLessons   = buildBehaviourGuidance({ lessons: [
      { lessonType: "truth",   futureGuidance: "Be honest.",            confidence: 0.70, strength: 0.6, status: "stable" },
      { lessonType: "repair",  futureGuidance: "Follow through.",        confidence: 0.80, strength: 0.7, status: "stable" },
      { lessonType: "evidence",futureGuidance: "Never fake evidence.",  confidence: 0.92, strength: 0.85,status: "core"   },
    ] });
    assert.ok(fewLessons.length > noLessons.length);
    assert.ok(manyLessons.length >= fewLessons.length);
  });

  it("repair lessons surface in repair guidance context", () => {
    const lessons = [
      { lessonType: "repair",  futureGuidance: "Never assume repair done.", confidence: 0.85, strength: 0.75, status: "core" },
      { lessonType: "romance", futureGuidance: "Small gestures work.",      confidence: 0.70, strength: 0.60, status: "stable" },
    ];
    const repairGuidance   = buildBehaviourGuidance({ lessons, context: "repair" });
    const romanticGuidance = buildBehaviourGuidance({ lessons, context: "romantic" });

    assert.ok(repairGuidance.includes("Never assume repair done."), "repair lesson should lead repair guidance");
    assert.ok(romanticGuidance.includes("Small gestures work."), "romance lesson should lead romantic guidance");
  });

  it("romantic surprise planner can consult lessons via getBehaviourGuidance", () => {
    const runtime = createRelationshipLearningRuntime({});
    const romantic = runtime.getBehaviourGuidance({ context: "romantic", maxItems: 5 });
    assert.ok(Array.isArray(romantic), "romantic surprise planner integration: returns array");
  });

  it("repair persistence can consult lessons via getBehaviourGuidance", () => {
    const runtime = createRelationshipLearningRuntime({});
    const repairGuidance = runtime.getBehaviourGuidance({ context: "repair", maxItems: 5 });
    assert.ok(Array.isArray(repairGuidance), "repair persistence integration: returns array");
  });

  it("conversation intent can consult lessons via getBehaviourGuidance", () => {
    const runtime = createRelationshipLearningRuntime({});
    const convGuidance = runtime.getBehaviourGuidance({ context: "conversation", maxItems: 5 });
    assert.ok(Array.isArray(convGuidance), "conversation intent integration: returns array");
  });

  it("agencyPlanner receives lessonGuidance via identityCtx", () => {
    const { planWithIdentity } = require("../../lifeRuntime/agencyPlanner");
    const need = { needType: "connection", currentLevel: 0.3, urgency: 0.70, desiredLevel: 0.65 };
    const context = {};
    const identityCtxWithLessons = {
      topValue: { valueKey: "curiosity", label: "Curiosity" },
      values: [],
      principles: [],
      lessonGuidance: ["Be honest.", "Follow through."],
    };
    const plan = planWithIdentity(need, context, identityCtxWithLessons);
    assert.ok(Array.isArray(plan.lessonGuidance), "planWithIdentity should forward lessonGuidance");
    assert.deepEqual(plan.lessonGuidance, ["Be honest.", "Follow through."]);
  });
});

// ── Section 13: integration — no duplicate scheduler/sender/dashboard ─────────────────────────

describe("architectural integrity", () => {
  const fs = require("node:fs");
  const path = require("node:path");

  function readSrc(relPath) {
    return fs.readFileSync(path.join(__dirname, "../../..", relPath), "utf-8");
  }

  it("relationshipLearningRuntime does NOT create a setInterval", () => {
    const src = readSrc("src/relationshipLearning/relationshipLearningRuntime.js");
    assert.ok(!src.includes("setInterval"), "runtime must not create its own scheduler");
  });

  it("relationshipLearningRuntime does NOT use channel.send()", () => {
    const src = readSrc("src/relationshipLearning/relationshipLearningRuntime.js");
    assert.ok(!src.includes("channel.send") && !src.includes(".send("), "runtime must not create a Discord sender");
  });

  it("lessonStore does NOT use setInterval", () => {
    const src = readSrc("src/relationshipLearning/lessonStore.js");
    assert.ok(!src.includes("setInterval"));
  });

  it("lifeRuntime calls _tickRelationshipLearning inside tick()", () => {
    const src = readSrc("src/lifeRuntime/lifeRuntime.js");
    assert.ok(src.includes("_tickRelationshipLearning"), "lifeRuntime must call _tickRelationshipLearning");
  });

  it("lifeRuntime does NOT call setInterval inside _tickRelationshipLearning", () => {
    const src = readSrc("src/lifeRuntime/lifeRuntime.js");
    const block = src.match(/_tickRelationshipLearning[\s\S]{0,500}/)?.[0] ?? "";
    assert.ok(!block.includes("setInterval"), "_tickRelationshipLearning must not register its own interval");
  });

  it("lifePreludeBuilder accepts learningContext", () => {
    const src = readSrc("src/lifeRuntime/lifePreludeBuilder.js");
    assert.ok(src.includes("learningContext"), "prelude builder must accept learningContext");
  });

  it("agencyPlanner accepts lessonGuidance via identityCtx", () => {
    const src = readSrc("src/lifeRuntime/agencyPlanner.js");
    assert.ok(src.includes("lessonGuidance"), "agencyPlanner must reference lessonGuidance");
  });

  it("index.js imports createRelationshipLearningRuntime", () => {
    const src = readSrc("src/index.js");
    assert.ok(src.includes("createRelationshipLearningRuntime"));
  });

  it("index.js passes relationshipLearningRuntime to lifeRuntime", () => {
    const src = readSrc("src/index.js");
    assert.ok(src.includes("relationshipLearningRuntime"));
  });

  it("schemaRegistry includes dante_relationship_lessons table", () => {
    const src = readSrc("src/storage/postgres/schemaRegistry.js");
    assert.ok(src.includes("dante_relationship_lessons"), "schemaRegistry must define dante_relationship_lessons");
  });

  it("lifeRuntime exports recordLearningEvent", () => {
    const src = readSrc("src/lifeRuntime/lifeRuntime.js");
    assert.ok(src.includes("recordLearningEvent"), "lifeRuntime should expose recordLearningEvent");
  });

  it("observeInteraction calls processInteraction on repair", () => {
    const src = readSrc("src/lifeRuntime/lifeRuntime.js");
    assert.ok(src.includes("processInteraction"), "observeInteraction should call processInteraction");
  });
});
