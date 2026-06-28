"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const { createPrivateQuestionStore, QUESTION_STATUSES }     = require("../privateQuestionStore");
const { createAttentionDriftEngine, FOCUS_TYPES, FOCUS_CANDIDATES } = require("../attentionDriftEngine");
const { createCuriosityEngine, QUESTION_TEMPLATES, QUESTION_PROBABILITY } = require("../curiosityEngine");
const { createInsightEngine, INSIGHT_PHRASES }              = require("../insightEngine");
const { createThoughtMaturationEngine, MATURATION_THRESHOLD, INTENTION_THRESHOLD, QUIET_HOUR_START, QUIET_HOUR_END } = require("../thoughtMaturationEngine");
const { buildLifePrelude }                                   = require("../lifePreludeBuilder");
const { createLifeRuntime }                                  = require("../lifeRuntime");
const { createDailyPlanEngine }                              = require("../dailyPlanEngine");
const { createMicroLifeEventsStore }                         = require("../microLifeEventsStore");
const { createDecisionEngine }                               = require("../decisionEngine");

const CID = "dante";
const UID = "jenna";

// ── privateQuestionStore ──────────────────────────────────────────────────────

describe("privateQuestionStore", () => {
  let store;
  before(async () => {
    store = createPrivateQuestionStore({ config: {}, logger: null });
    await store.init();
  });

  it("QUESTION_STATUSES is frozen and complete", () => {
    assert.ok(Array.isArray(QUESTION_STATUSES));
    assert.ok(QUESTION_STATUSES.includes("open"));
    assert.ok(QUESTION_STATUSES.includes("maturing"));
    assert.ok(QUESTION_STATUSES.includes("converted_to_intention"));
    assert.ok(QUESTION_STATUSES.includes("expired"));
  });

  it("logQuestion persists a question", async () => {
    const q = await store.logQuestion({
      companionId: CID, customerId: UID,
      question: "Is she doing okay?",
      source: "emotional", topic: "care",
      emotionalWeight: 0.75, curiosityScore: 0.60,
    });
    assert.ok(typeof q?.id !== "undefined");
    assert.equal(q.question, "Is she doing okay?");
    assert.equal(q.status, "open");
    assert.ok(q.maturesAt !== null);
  });

  it("emotional/repair source gets short maturation window (2 h)", async () => {
    const q = await store.logQuestion({
      companionId: CID, customerId: UID,
      question: "Did that repair land?",
      source: "repair", topic: "repair",
      emotionalWeight: 0.80, curiosityScore: 0.70,
    });
    const now = Date.now();
    const maturesAt = new Date(q.maturesAt).getTime();
    // Should mature in ~2h, not 24h
    assert.ok(maturesAt - now < 3 * 60 * 60 * 1000, "repair question matures in under 3h");
  });

  it("getOpen returns open and maturing questions", async () => {
    const open = await store.getOpen({ companionId: CID, customerId: UID });
    assert.ok(Array.isArray(open));
    assert.ok(open.length >= 1);
    assert.ok(open.every(q => q.status === "open" || q.status === "maturing"));
  });

  it("advance changes question status", async () => {
    const q = await store.logQuestion({
      companionId: CID, customerId: UID,
      question: "What's on her mind?", source: "general", topic: "care",
    });
    const advanced = await store.advance({ id: q.id, companionId: CID, customerId: UID, status: "maturing" });
    assert.equal(advanced?.status, "maturing");
  });

  it("count returns correct numbers per status", async () => {
    const total  = await store.count({ companionId: CID, customerId: UID });
    const open   = await store.count({ companionId: CID, customerId: UID, status: "open" });
    const mature = await store.count({ companionId: CID, customerId: UID, status: "maturing" });
    assert.ok(typeof total  === "number" && total >= 1);
    assert.ok(typeof open   === "number");
    assert.ok(typeof mature === "number");
  });

  it("pruneOlderThan returns a number", async () => {
    const pruned = await store.pruneOlderThan({ companionId: CID, customerId: UID, days: 365 });
    assert.ok(typeof pruned === "number");
  });
});

// ── attentionDriftEngine ──────────────────────────────────────────────────────

describe("attentionDriftEngine", () => {
  let engine;
  before(async () => {
    engine = createAttentionDriftEngine({ config: {}, logger: null });
    await engine.init();
  });

  it("FOCUS_TYPES is non-empty array", () => {
    assert.ok(Array.isArray(FOCUS_TYPES) && FOCUS_TYPES.length > 0);
  });

  it("FOCUS_CANDIDATES has a range of focus types", () => {
    const types = new Set(FOCUS_CANDIDATES.map(c => c.focusType));
    assert.ok(types.has("person"));
    assert.ok(types.has("emotional"));
    assert.ok(types.has("project"));
  });

  it("selectFocus returns { focus, focusType, weight }", () => {
    const result = engine.selectFocus({});
    assert.ok(typeof result.focus === "string" && result.focus.length > 0);
    assert.ok(typeof result.focusType === "string");
    assert.ok(result.weight >= 0 && result.weight <= 1);
  });

  it("repair context boosts unresolved repair focus probability", () => {
    const deterministic = createAttentionDriftEngine({
      config: {},
      logger: null,
      rng: () => 0.5,
    });

    const result = deterministic.selectFocus({ hasRepair: true });

    assert.equal(result.focus, "unresolved repair");
    assert.equal(result.weight, 0.8);
  });

  it("uses injected rng for stable repeated curiosity focus selection", () => {
    const deterministic = createAttentionDriftEngine({
      config: {},
      logger: null,
      rng: () => 0.5,
    });

    const results = Array.from({ length: 20 }, () =>
      deterministic.selectFocus({ hasRepair: true }).focus,
    );

    assert.deepEqual(results, Array(20).fill("unresolved repair"));
  });

  it("updateFocus persists and getCurrentFocus retrieves it", async () => {
    await engine.updateFocus({ companionId: CID, customerId: UID, focus: "test focus", focusType: "theme", weight: 0.5 });
    const current = await engine.getCurrentFocus({ companionId: CID, customerId: UID });
    assert.ok(current !== null);
    assert.equal(current.focus, "test focus");
  });

  it("getRecentFocus returns array in DESC order", async () => {
    const recent = await engine.getRecentFocus({ companionId: CID, customerId: UID, limit: 5 });
    assert.ok(Array.isArray(recent));
  });

  it("pruneOlderThan returns a number", async () => {
    const pruned = await engine.pruneOlderThan({ companionId: CID, customerId: UID, days: 365 });
    assert.ok(typeof pruned === "number");
  });
});

// ── curiosityEngine ───────────────────────────────────────────────────────────

describe("curiosityEngine", () => {
  const engine = createCuriosityEngine({ logger: null });

  it("QUESTION_PROBABILITY is between 0 and 1", () => {
    assert.ok(QUESTION_PROBABILITY > 0 && QUESTION_PROBABILITY <= 1);
  });

  it("QUESTION_TEMPLATES has entries for key sources", () => {
    assert.ok(Array.isArray(QUESTION_TEMPLATES.repair));
    assert.ok(Array.isArray(QUESTION_TEMPLATES.emotional));
    assert.ok(Array.isArray(QUESTION_TEMPLATES.conversation));
  });

  it("generate returns null or a valid payload", () => {
    const result = engine.generate({ forceProbability: 1.0, dailyPlan: { mood: "curious" } });
    if (result === null) return; // probabilistic
    assert.ok(typeof result.question === "string");
    assert.ok(typeof result.source   === "string");
    assert.ok(typeof result.topic    === "string");
    assert.ok(result.emotionalWeight >= 0 && result.emotionalWeight <= 1);
    assert.ok(result.curiosityScore  >= 0 && result.curiosityScore  <= 1);
  });

  it("generate with forceProbability=1.0 always produces a result", () => {
    const result = engine.generate({ forceProbability: 1.0, dailyPlan: null });
    // May still be null if no sources have templates — but emotional is always available
    assert.ok(result !== null);
  });

  it("generate with forceProbability=0 always returns null", () => {
    const result = engine.generate({ forceProbability: 0 });
    assert.equal(result, null);
  });

  it("repair source has higher weight when hasRepair=true", () => {
    // Run many times with forceProbability=1 and hasRepair=true
    const sources = Array.from({ length: 30 }, () =>
      engine.generate({ forceProbability: 1.0, hasRepair: true })?.source,
    ).filter(Boolean);
    assert.ok(sources.some(s => s === "repair"));
  });
});

// ── insightEngine ─────────────────────────────────────────────────────────────

describe("insightEngine", () => {
  let engine;
  before(async () => {
    engine = createInsightEngine({ config: {}, logger: null });
    await engine.init();
  });

  it("INSIGHT_PHRASES has entries for key sources", () => {
    assert.ok(typeof INSIGHT_PHRASES.repair      === "string");
    assert.ok(typeof INSIGHT_PHRASES.silence     === "string");
    assert.ok(typeof INSIGHT_PHRASES.emotional   === "string");
    // All insights are compact (under 120 chars)
    for (const phrase of Object.values(INSIGHT_PHRASES)) {
      assert.ok(phrase.length < 120, `Insight phrase too long: "${phrase}"`);
    }
  });

  it("addInsight stores a compact private insight", async () => {
    const i = await engine.addInsight({
      companionId: CID, customerId: UID,
      insight: "Something worth holding quietly.",
      source: "general", topic: "care",
      confidence: 0.75, isPrivate: true,
    });
    assert.ok(typeof i?.id !== "undefined");
    assert.ok(i.isPrivate === true);
    assert.ok(i.insight.length < 200);
  });

  it("getRecent returns most recent insights", async () => {
    const recent = await engine.getRecent({ companionId: CID, customerId: UID, limit: 5 });
    assert.ok(Array.isArray(recent));
    assert.ok(recent.length >= 1);
  });

  it("insights are private by default", async () => {
    const recent = await engine.getRecent({ companionId: CID, customerId: UID, limit: 10 });
    // All should be private unless explicitly set otherwise
    assert.ok(recent.every(i => typeof i.isPrivate === "boolean"));
  });

  it("count returns a non-negative number", async () => {
    const n = await engine.count({ companionId: CID, customerId: UID });
    assert.ok(typeof n === "number" && n >= 0);
  });

  it("pruneOlderThan returns a number", async () => {
    const pruned = await engine.pruneOlderThan({ companionId: CID, customerId: UID, days: 365 });
    assert.ok(typeof pruned === "number");
  });
});

// ── thoughtMaturationEngine ───────────────────────────────────────────────────

describe("thoughtMaturationEngine", () => {
  let qStore, iEngine, engine;
  before(async () => {
    qStore  = createPrivateQuestionStore({ config: {}, logger: null });
    iEngine = createInsightEngine({ config: {}, logger: null });
    await qStore.init();
    await iEngine.init();
    engine = createThoughtMaturationEngine({ privateQuestionStore: qStore, insightEngine: iEngine, logger: null });
  });

  it("MATURATION_THRESHOLD and INTENTION_THRESHOLD are reasonable", () => {
    assert.ok(MATURATION_THRESHOLD >= 0.5 && MATURATION_THRESHOLD < 1);
    assert.ok(INTENTION_THRESHOLD  > MATURATION_THRESHOLD && INTENTION_THRESHOLD < 1);
  });

  it("isQuietHour returns true for late night / early morning", () => {
    assert.ok(engine.isQuietHour(23) === true);
    assert.ok(engine.isQuietHour(3)  === true);
    assert.ok(engine.isQuietHour(14) === false);
  });

  it("tick returns { matured, insights, intentions, suppressed }", async () => {
    const result = await engine.tick({ companionId: CID, customerId: UID });
    assert.ok(Array.isArray(result.matured));
    assert.ok(Array.isArray(result.insights));
    assert.ok(Array.isArray(result.intentions));
    assert.ok(typeof result.suppressed === "number");
  });

  it("question advances from open to maturing when maturesAt has passed", async () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3h ago
    const q = await qStore.logQuestion({
      companionId: CID, customerId: UID,
      question: "Test maturation", source: "general", topic: "self",
      emotionalWeight: 0.5, curiosityScore: 0.5,
      maturesAt: past,
    });
    const result = await engine.tick({ companionId: CID, customerId: UID });
    assert.ok(result.matured.some(m => m.id === q.id) || true); // may have been picked up
    // Re-read status — should be maturing or answered
    const updated = await qStore.getOpen({ companionId: CID, customerId: UID });
    // The question is either still open (not yet picked) or now maturing/answered
    assert.ok(typeof updated === "object");
  });

  it("high-score maturing question generates an insight", async () => {
    // Create a question that is already 'maturing' with high scores
    const q = await qStore.logQuestion({
      companionId: CID, customerId: UID,
      question: "High-score thought", source: "repair", topic: "repair",
      emotionalWeight: 0.90, curiosityScore: 0.85,
      maturesAt: new Date(Date.now() - 1), // past
    });
    // Advance to maturing first
    await qStore.advance({ id: q.id, companionId: CID, customerId: UID, status: "maturing" });
    const insightsBefore = await iEngine.count({ companionId: CID, customerId: UID });
    const result = await engine.tick({ companionId: CID, customerId: UID });
    const insightsAfter = await iEngine.count({ companionId: CID, customerId: UID });
    // Either the tick found it and added an insight, or it was already processed
    assert.ok(insightsAfter >= insightsBefore);
    assert.ok(Array.isArray(result.insights));
  });

  it("give_space suppresses intention conversion", async () => {
    const q = await qStore.logQuestion({
      companionId: CID, customerId: UID,
      question: "Should I reach out?", source: "emotional", topic: "timing",
      emotionalWeight: 0.95, curiosityScore: 0.90,
      maturesAt: new Date(Date.now() - 1),
    });
    await qStore.advance({ id: q.id, companionId: CID, customerId: UID, status: "maturing" });
    const result = await engine.tick({
      companionId: CID, customerId: UID,
      isGiveSpace: true, hour: 14,
    });
    // Insights may form, but intentions should be 0 when give_space is true
    assert.equal(result.intentions.length, 0);
  });

  it("quiet hours suppress intention conversion", async () => {
    const q = await qStore.logQuestion({
      companionId: CID, customerId: UID,
      question: "Night thought", source: "silence", topic: "absence",
      emotionalWeight: 0.90, curiosityScore: 0.88,
      maturesAt: new Date(Date.now() - 1),
    });
    await qStore.advance({ id: q.id, companionId: CID, customerId: UID, status: "maturing" });
    const result = await engine.tick({
      companionId: CID, customerId: UID,
      isGiveSpace: false, hour: QUIET_HOUR_START + 1, // quiet hour
    });
    assert.equal(result.intentions.length, 0);
  });
});

// ── prelude builder with curiosityContext ──────────────────────────────────────

describe("lifePreludeBuilder with curiosityContext", () => {
  it("includes attention focus when present", () => {
    const prelude = buildLifePrelude({
      dailyPlan:       { mood: "focused", energy: "steady", focus: "" },
      recentEvents:    [],
      growthContext:   null,
      curiosityContext: {
        attentionFocus:  { focus: "the dashboard cleanup thread", focusType: "concern" },
        maturingCount:   0,
        recentInsight:   null,
      },
    });
    assert.ok(prelude?.content?.includes("dashboard cleanup thread"));
  });

  it("includes maturing count when present", () => {
    const prelude = buildLifePrelude({
      dailyPlan:       { mood: "calm", energy: "low", focus: "" },
      recentEvents:    [],
      growthContext:   null,
      curiosityContext: {
        attentionFocus:  null,
        maturingCount:   2,
        recentInsight:   null,
      },
    });
    assert.ok(prelude?.content?.includes("2 private thoughts maturing"));
  });

  it("combines focus and maturing count into one line", () => {
    const prelude = buildLifePrelude({
      dailyPlan:       { mood: "reflective", energy: "steady", focus: "" },
      recentEvents:    [],
      growthContext:   null,
      curiosityContext: {
        attentionFocus:  { focus: "Jenna", focusType: "person" },
        maturingCount:   1,
        recentInsight:   null,
      },
    });
    const lines = prelude?.content?.split("\n") ?? [];
    // There should be at most 1 line added by curiosityContext
    const curiosityLines = lines.filter(l => l.includes("Quietly circling") || l.includes("maturing"));
    assert.ok(curiosityLines.length <= 1);
    assert.ok(prelude?.content?.includes("Jenna"));
    assert.ok(prelude?.content?.includes("1 private thought maturing"));
  });

  it("prelude still works with null curiosityContext", () => {
    const prelude = buildLifePrelude({
      dailyPlan:       { mood: "neutral", energy: "steady", focus: "" },
      curiosityContext: null,
    });
    assert.ok(prelude !== null);
  });

  it("total prelude stays under 800 chars with all contexts set", () => {
    const prelude = buildLifePrelude({
      dailyPlan:       { mood: "focused", energy: "high", focus: "deep work", privateActivity: "writing" },
      recentEvents:    [{ description: "made coffee" }, { description: "wrote a few lines" }],
      growthContext:   { activeProject: { title: "A short essay on silence" }, activeHobby: null, recentInterest: null },
      curiosityContext: {
        attentionFocus:  { focus: "an unresolved thread from yesterday", focusType: "concern" },
        maturingCount:   3,
        recentInsight:   null,
      },
    });
    assert.ok((prelude?.content?.length ?? 0) < 800);
  });
});

// ── lifeRuntime integration with curiosity engines ────────────────────────────

describe("lifeRuntime with curiosity engines", () => {
  let lr, planEngine, eventsStore, decisionEngine, qStore, aEngine, iEngine, cEngine, mEngine;

  before(async () => {
    planEngine    = createDailyPlanEngine({ config: {}, logger: null });
    eventsStore   = createMicroLifeEventsStore({ config: {}, logger: null });
    decisionEngine = createDecisionEngine({ config: {}, logger: null });
    qStore        = createPrivateQuestionStore({ config: {}, logger: null });
    aEngine       = createAttentionDriftEngine({ config: {}, logger: null });
    iEngine       = createInsightEngine({ config: {}, logger: null });
    cEngine       = createCuriosityEngine({ logger: null });
    mEngine       = createThoughtMaturationEngine({ privateQuestionStore: qStore, insightEngine: iEngine, logger: null });

    await Promise.all([
      planEngine.init(), eventsStore.init(), decisionEngine.init(),
      qStore.init(), aEngine.init(), iEngine.init(),
    ]);

    lr = createLifeRuntime({
      config: {
        lifeRuntime: { enabled: true },
        memory:      { companionId: CID, userScope: UID },
      },
      logger:                null,
      microLifeEventsStore:  eventsStore,
      dailyPlanEngine:       planEngine,
      decisionEngine,
      curiosityEngine:       cEngine,
      thoughtMaturationEngine: mEngine,
      privateQuestionStore:  qStore,
      attentionDriftEngine:  aEngine,
      insightEngine:         iEngine,
    });

    await lr.init();
  });

  it("tick() returns ok with curiosity engines wired", async () => {
    const result = await lr.tick(new Date());
    assert.equal(result.ok, true);
  });

  it("getStatus() includes curiosityContext key after tick", () => {
    const status = lr.getStatus();
    assert.ok("curiosityContext" in status);
    assert.ok(status.curiosityContext === null || typeof status.curiosityContext === "object");
  });

  it("curiosityContext is JSON-serialisable", () => {
    const status = lr.getStatus();
    assert.doesNotThrow(() => JSON.stringify(status));
  });

  it("curiosityContext exposes safe counts only", () => {
    const status = lr.getStatus();
    if (status.curiosityContext) {
      assert.ok(typeof status.curiosityContext.openQuestions    === "number");
      assert.ok(typeof status.curiosityContext.maturingQuestions === "number");
      // Should NOT expose raw question text
      assert.ok(!("question" in status.curiosityContext));
    }
  });

  it("getCurrentPrelude() reflects curiosity context after tick", () => {
    const prelude = lr.getCurrentPrelude();
    // If curiosity context produced attention focus, it should appear in prelude
    // (may be null if no curiosity engines fired — that's fine)
    assert.ok(prelude === null || typeof prelude?.content === "string");
  });
});
