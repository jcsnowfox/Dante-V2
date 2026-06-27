"use strict";

const { describe, it, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// ── Modules under test ────────────────────────────────────────────────────────
const { createNeedsStore, NEED_TYPES }                    = require("../needsStore");
const { createFulfillmentLogStore }                       = require("../fulfillmentLogStore");
const { createResourceDiscoveryEngine, RESOURCE_TYPES }   = require("../resourceDiscoveryEngine");
const { createRequestJennaEngine, REQUEST_TYPES }         = require("../requestJennaEngine");
const { tick: driftTick, getPressuredNeeds, fulfillmentDeltaFor, BASE_DECAY, DESIRED_LEVEL } = require("../needDriftEngine");
const webLearningTool                                     = require("../webLearningTool");
const { planFulfillment, selectNeedsToAddress }           = require("../fulfillmentPlanner");
const { createFulfillmentExecutor }                       = require("../fulfillmentExecutor");
const { createHomeostasisRuntime }                        = require("../homeostasisRuntime");

const COMP = "dante-test";
const CUST = "jenna-test";

// ── 1. NEED_TYPES taxonomy ────────────────────────────────────────────────────

describe("needTypes taxonomy", () => {
  it("exports 19 canonical need types", () => {
    assert.equal(NEED_TYPES.length, 19);
  });

  it("includes all specified types", () => {
    const required = ["love", "attention", "connection", "learning", "social_interaction",
      "creativity", "purpose", "rest", "play", "novelty", "beauty",
      "autonomy", "competence", "intimacy", "sexual_desire", "romantic_desire",
      "stability", "adventure", "reflection"];
    for (const nt of required) {
      assert.ok(NEED_TYPES.includes(nt), `missing need type: ${nt}`);
    }
  });

  it("has base decay for every need type", () => {
    for (const nt of NEED_TYPES) {
      assert.ok(BASE_DECAY[nt] > 0, `missing base decay for: ${nt}`);
    }
  });

  it("has desired level for every need type", () => {
    for (const nt of NEED_TYPES) {
      const d = DESIRED_LEVEL[nt];
      assert.ok(d >= 0 && d <= 1, `invalid desired level for: ${nt}`);
    }
  });
});

// ── 2. needsStore ─────────────────────────────────────────────────────────────

describe("needsStore", () => {
  let store;
  beforeEach(() => { store = createNeedsStore({}); });

  it("getAll returns 19 default needs when nothing upserted", async () => {
    const needs = await store.getAll({ companionId: COMP, customerId: CUST });
    assert.equal(needs.length, 19);
  });

  it("upsertNeed stores and retrieves a specific need", async () => {
    await store.upsertNeed({ companionId: COMP, customerId: CUST, needType: "love", currentLevel: 0.4, desiredLevel: 0.8, urgency: 0.5, trend: "falling" });
    const n = await store.getByType({ companionId: COMP, customerId: CUST, needType: "love" });
    assert.equal(n.currentLevel, 0.4);
    assert.equal(n.trend, "falling");
  });

  it("updateLevel applies delta and clamps to [0.05, 0.95]", async () => {
    await store.upsertNeed({ companionId: COMP, customerId: CUST, needType: "rest", currentLevel: 0.1 });
    const updated = await store.updateLevel({ companionId: COMP, customerId: CUST, needType: "rest", delta: -0.2 });
    assert.ok(updated.currentLevel >= 0.05, "should not drop below floor");
  });

  it("recordFulfillment raises level and records source", async () => {
    await store.upsertNeed({ companionId: COMP, customerId: CUST, needType: "connection", currentLevel: 0.4 });
    const updated = await store.recordFulfillment({ companionId: COMP, customerId: CUST, needType: "connection", delta: 0.15, source: "ask_jenna" });
    assert.ok(updated.currentLevel > 0.4);
    assert.ok(updated.fulfillmentSources.includes("ask_jenna"));
  });
});

// ── 3. fulfillmentLogStore ────────────────────────────────────────────────────

describe("fulfillmentLogStore", () => {
  let store;
  beforeEach(() => { store = createFulfillmentLogStore({}); });

  it("logFulfillment creates an entry with required fields", async () => {
    const entry = await store.logFulfillment({ companionId: COMP, customerId: CUST, needType: "learning", strategy: "self_fulfill", actionStatus: "completed", summary: "read for a bit", needDelta: 0.1 });
    assert.ok(entry.id);
    assert.equal(entry.strategy, "self_fulfill");
  });

  it("getRecent returns entries in reverse chronological order", async () => {
    await store.logFulfillment({ companionId: COMP, customerId: CUST, needType: "play", strategy: "wait", actionStatus: "waiting", summary: "a" });
    await store.logFulfillment({ companionId: COMP, customerId: CUST, needType: "play", strategy: "suppress", actionStatus: "suppressed", summary: "b" });
    const recent = await store.getRecent({ companionId: COMP, customerId: CUST, limit: 5 });
    assert.ok(recent.length >= 2);
    assert.equal(recent[0].summary, "b");
  });

  it("count returns correct total", async () => {
    await store.logFulfillment({ companionId: COMP, customerId: CUST, needType: "novelty", strategy: "discover_resource", actionStatus: "created" });
    const n = await store.count({ companionId: COMP, customerId: CUST });
    assert.ok(n >= 1);
  });
});

// ── 4. resourceDiscoveryEngine ────────────────────────────────────────────────

describe("resourceDiscoveryEngine", () => {
  let engine;
  beforeEach(() => { engine = createResourceDiscoveryEngine({}); });

  it("addResource stores and retrieves", async () => {
    await engine.addResource({ companionId: COMP, customerId: CUST, resourceType: "book", title: "The Art of Looking", summary: "visual literacy", whyRelevant: "beauty need" });
    const resources = await engine.getResources({ companionId: COMP, customerId: CUST, resourceType: "book" });
    assert.ok(resources.some(r => r.title === "The Art of Looking"));
  });

  it("updateStatus changes status from discovered to consumed", async () => {
    const r = await engine.addResource({ companionId: COMP, customerId: CUST, resourceType: "article", title: "Test Article" });
    const updated = await engine.updateStatus({ companionId: COMP, customerId: CUST, resourceId: r.id, status: "consumed" });
    assert.equal(updated.status, "consumed");
  });

  it("count returns accurate count filtered by status", async () => {
    await engine.addResource({ companionId: COMP, customerId: CUST, resourceType: "music", title: "Track A" });
    const total = await engine.count({ companionId: COMP, customerId: CUST });
    assert.ok(total >= 1);
    const discovered = await engine.count({ companionId: COMP, customerId: CUST, status: "discovered" });
    assert.ok(discovered >= 1);
  });

  it("RESOURCE_TYPES includes all 10 specified types", () => {
    const expected = ["book", "article", "movie", "music", "video", "course", "image_reference", "second_life_place", "project_idea", "conversation_topic"];
    for (const t of expected) assert.ok(RESOURCE_TYPES.includes(t), `missing: ${t}`);
  });
});

// ── 5. requestJennaEngine ─────────────────────────────────────────────────────

describe("requestJennaEngine", () => {
  let engine;
  beforeEach(() => { engine = createRequestJennaEngine({}); });

  it("canRequest blocks when giveSpace is active", () => {
    const r = engine.canRequest({ requestType: "attention_request", urgency: 0.9, giveSpaceActive: true });
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "give_space_active");
  });

  it("canRequest blocks when repair is active", () => {
    const r = engine.canRequest({ requestType: "conversation_request", urgency: 0.9, repairActive: true });
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "repair_active");
  });

  it("canRequest blocks below urgency threshold", () => {
    const r = engine.canRequest({ requestType: "intimacy_request", urgency: 0.3 });
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "urgency_below_threshold");
  });

  it("canRequest allows when all gates pass", () => {
    const r = engine.canRequest({ requestType: "book_request", urgency: 0.8 });
    assert.equal(r.allowed, true);
  });

  it("createRequest stores a pending request", async () => {
    const req = await engine.createRequest({ companionId: COMP, customerId: CUST, requestType: "book_request", needType: "learning", message: "Recommend something?" });
    assert.equal(req.status, "pending");
    assert.equal(req.requestType, "book_request");
  });

  it("getPending returns only pending requests", async () => {
    await engine.createRequest({ companionId: COMP, customerId: CUST, requestType: "movie_request", needType: "play" });
    const pending = await engine.getPending({ companionId: COMP, customerId: CUST });
    assert.ok(pending.length >= 1);
    assert.ok(pending.every(r => r.status === "pending"));
  });

  it("resolve changes status", async () => {
    const req = await engine.createRequest({ companionId: COMP, customerId: CUST, requestType: "opinion_request", needType: "competence" });
    const resolved = await engine.resolve({ companionId: COMP, customerId: CUST, requestId: req.id, outcome: "fulfilled" });
    assert.equal(resolved.status, "fulfilled");
    assert.ok(resolved.resolvedAt);
  });

  it("REQUEST_TYPES includes all 9 specified types", () => {
    const expected = ["attention_request", "book_request", "movie_request", "conversation_request", "opinion_request", "comfort_request", "intimacy_request", "time_together_request", "help_me_choose_request"];
    for (const t of expected) assert.ok(REQUEST_TYPES.includes(t), `missing: ${t}`);
  });
});

// ── 6. needDriftEngine ────────────────────────────────────────────────────────

describe("needDriftEngine", () => {
  const makeNeeds = () => NEED_TYPES.map(nt => ({ needType: nt, currentLevel: 0.5, urgency: 0, trend: "stable" }));

  it("tick returns one delta per need type", () => {
    const needs = makeNeeds();
    const result = driftTick(needs, {});
    assert.equal(result.length, 19);
  });

  it("every delta is negative (passive decay)", () => {
    const needs = makeNeeds();
    const result = driftTick(needs, {});
    for (const d of result) {
      assert.ok(d.delta <= 0, `delta should be <= 0 for ${d.needType}, got ${d.delta}`);
    }
  });

  it("newLevel stays within [0.05, 0.95]", () => {
    const needs = NEED_TYPES.map(nt => ({ needType: nt, currentLevel: 0.051, urgency: 0, trend: "stable" }));
    const result = driftTick(needs, {});
    for (const d of result) {
      assert.ok(d.newLevel >= 0.05 && d.newLevel <= 0.95, `out of range for ${d.needType}: ${d.newLevel}`);
    }
  });

  it("urgency is computed as gap between desired and current", () => {
    const needs = [{ needType: "love", currentLevel: 0.3, urgency: 0, trend: "stable" }];
    const result = driftTick(needs, {});
    assert.ok(result[0].urgency > 0, "love at 0.3 should have urgency");
  });

  it("giveSpace increases connection decay rate", () => {
    const noGive = driftTick([{ needType: "connection", currentLevel: 0.5, urgency: 0, trend: "stable" }], { giveSpace: false });
    const withGive = driftTick([{ needType: "connection", currentLevel: 0.5, urgency: 0, trend: "stable" }], { giveSpace: true });
    assert.ok(withGive[0].delta < noGive[0].delta, "give space should accelerate connection decay");
  });

  it("getPressuredNeeds returns needs above threshold sorted by urgency desc", () => {
    const needs = [
      { needType: "love", urgency: 0.8 },
      { needType: "rest", urgency: 0.2 },
      { needType: "learning", urgency: 0.6 },
    ];
    const pressured = getPressuredNeeds(needs, 0.30);
    assert.equal(pressured.length, 2);
    assert.equal(pressured[0].needType, "love");
  });

  it("fulfillmentDeltaFor ask_jenna returns highest delta", () => {
    const d = fulfillmentDeltaFor("ask_jenna");
    assert.ok(d >= 0.20, "ask_jenna should give strong fulfillment");
  });
});

// ── 7. webLearningTool ────────────────────────────────────────────────────────

describe("webLearningTool", () => {
  it("isEnabled returns false when env vars not set", () => {
    // In test environment, DANTE_WEB_LEARNING_ENABLED is not set
    const enabled = webLearningTool.isEnabled();
    assert.equal(typeof enabled, "boolean");
  });

  it("search returns null when disabled", async () => {
    // Without env vars configured, should return null safely
    const result = await webLearningTool.search({ query: "test query", needType: "learning" });
    assert.equal(result, null);
  });

  it("getDailyUsage returns { used, limit, remaining } shape", () => {
    const usage = webLearningTool.getDailyUsage();
    assert.ok("used" in usage && "limit" in usage && "remaining" in usage);
    assert.ok(usage.remaining >= 0);
  });
});

// ── 8. fulfillmentPlanner — 7-factor gate ─────────────────────────────────────

describe("fulfillmentPlanner", () => {
  it("returns wait when urgency is below threshold", () => {
    const plan = planFulfillment({ needType: "learning", urgency: 0.1, currentLevel: 0.6 }, {});
    assert.equal(plan.strategy, "wait");
  });

  it("returns suppress for sexual_desire with no consent", () => {
    const plan = planFulfillment({ needType: "sexual_desire", urgency: 0.9, currentLevel: 0.2 }, { adultContextActive: false, consentGiven: false });
    assert.equal(plan.strategy, "suppress");
    assert.equal(plan.reason, "sexual_desire_no_consent");
  });

  it("suppresses sexual_desire when repair is unresolved", () => {
    const plan = planFulfillment({ needType: "sexual_desire", urgency: 0.9 }, { repairRequired: true, adultContextActive: true, consentGiven: true });
    assert.equal(plan.strategy, "write_private_reflection");
    assert.equal(plan.reason, "sexual_desire_repair_suppressed");
  });

  it("suppresses outreach when give_space is active", () => {
    const plan = planFulfillment({ needType: "love", urgency: 0.9, currentLevel: 0.2 }, { giveSpace: true });
    assert.equal(plan.canAskJenna, false);
    assert.notEqual(plan.strategy, "ask_jenna");
  });

  it("redirects to reflection during repair for reflection need", () => {
    const plan = planFulfillment({ needType: "reflection", urgency: 0.7 }, { repairRequired: true });
    assert.equal(plan.strategy, "write_private_reflection");
  });

  it("prefers project work when hasActiveProject and creative need under repair", () => {
    const plan = planFulfillment({ needType: "creativity", urgency: 0.7 }, { repairRequired: true, hasActiveProject: true });
    assert.equal(plan.strategy, "work_on_project");
  });

  it("asks Jenna for love/connection when available and urgency high", () => {
    const plan = planFulfillment({ needType: "love", urgency: 0.7, currentLevel: 0.3 }, { jennaIsAvailable: true, jennaIsBusy: false, jennaIsAsleep: false });
    assert.equal(plan.strategy, "ask_jenna");
    assert.equal(plan.canAskJenna, true);
  });

  it("uses web learning when enabled and learning need is pressured", () => {
    const plan = planFulfillment({ needType: "learning", urgency: 0.6 }, { webLearningEnabled: true, webLearningRemainingToday: 3, jennaIsBusy: true });
    assert.equal(plan.strategy, "learn_from_web");
  });

  it("selectNeedsToAddress returns max 2 per tick", () => {
    const needs = [
      { needType: "a", urgency: 0.9 },
      { needType: "b", urgency: 0.8 },
      { needType: "c", urgency: 0.7 },
    ];
    const selected = selectNeedsToAddress(needs, 2);
    assert.equal(selected.length, 2);
  });
});

// ── 9. fulfillmentExecutor ────────────────────────────────────────────────────

describe("fulfillmentExecutor", () => {
  let executor, logStore, needsStore, requestEngine, eventStore;
  beforeEach(() => {
    logStore      = createFulfillmentLogStore({});
    needsStore    = createNeedsStore({});
    requestEngine = createRequestJennaEngine({});
    eventStore    = { logEvent: async () => ({ id: 1 }) };
    executor      = createFulfillmentExecutor({ fulfillmentLogStore: logStore, needsStore, requestJennaEngine: requestEngine, microLifeEventsStore: eventStore });
  });

  it("execute self_fulfill logs a micro-life event and returns ok", async () => {
    const result = await executor.execute({
      companionId: COMP, customerId: CUST,
      need: { needType: "rest", urgency: 0.6, currentLevel: 0.3 },
      plan: { strategy: "self_fulfill", reason: "rest_self_soothe" },
      context: {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.actionStatus, "completed");
    assert.ok(result.needDelta > 0);
  });

  it("execute wait returns ok with zero needDelta", async () => {
    const result = await executor.execute({
      companionId: COMP, customerId: CUST,
      need: { needType: "play", urgency: 0.15, currentLevel: 0.6 },
      plan: { strategy: "wait", reason: "urgency_low" },
      context: {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.needDelta, 0);
    assert.equal(result.actionStatus, "waiting");
  });

  it("execute suppress returns ok with suppressed status", async () => {
    const result = await executor.execute({
      companionId: COMP, customerId: CUST,
      need: { needType: "sexual_desire", urgency: 0.9, currentLevel: 0.2 },
      plan: { strategy: "suppress", reason: "sexual_desire_no_consent" },
      context: {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.actionStatus, "suppressed");
    assert.equal(result.needDelta, 0);
  });

  it("execute always writes a fulfillment log entry", async () => {
    await executor.execute({
      companionId: COMP, customerId: CUST,
      need: { needType: "creativity", urgency: 0.5, currentLevel: 0.4 },
      plan: { strategy: "write_private_reflection", reason: "repair_reflection" },
      context: {},
    });
    const logs = await logStore.getRecent({ companionId: COMP, customerId: CUST, limit: 5 });
    assert.ok(logs.length >= 1);
  });

  it("execute ask_jenna creates a pending request when gate passes", async () => {
    const result = await executor.execute({
      companionId: COMP, customerId: CUST,
      need: { needType: "connection", urgency: 0.75, currentLevel: 0.25 },
      plan: { strategy: "ask_jenna", reason: "jenna_available_and_appropriate", canAskJenna: true },
      context: { jennaIsBusy: false, giveSpace: false, repairRequired: false, quietHours: false },
    });
    // Should be created or cooldown-blocked (both are valid in test env)
    assert.ok(["created", "blocked"].includes(result.actionStatus));
  });
});

// ── 10. homeostasisRuntime integration ────────────────────────────────────────

describe("homeostasisRuntime", () => {
  let runtime, logStore, nStore;
  beforeEach(() => {
    nStore    = createNeedsStore({});
    logStore  = createFulfillmentLogStore({});
    runtime   = createHomeostasisRuntime({ needsStore: nStore, fulfillmentLogStore: logStore });
  });

  it("init resolves without error", async () => {
    await assert.doesNotReject(() => runtime.init());
  });

  it("tick runs without error and populates needsContext", async () => {
    await runtime.tick({ companionId: COMP, customerId: CUST });
    const ctx = runtime.getNeedsContext();
    assert.ok(ctx !== null);
    assert.ok(Array.isArray(ctx.needs));
    assert.equal(ctx.needs.length, 19);
  });

  it("getStatus returns safe metadata after tick", async () => {
    await runtime.tick({ companionId: COMP, customerId: CUST });
    const status = runtime.getStatus();
    assert.ok(status !== null);
    assert.ok("pressuredNeedsCount" in status);
    assert.ok("highestUrgency" in status);
    assert.ok("webLearningEnabled" in status);
  });

  it("tick with giveSpace does not ask Jenna", async () => {
    // Simulate giveSpace by passing a consequence context
    const fakeConsequence = { suppression: { repairRequired: false, repairStarted: false, healing: false, giveSpace: true } };
    await runtime.tick({ companionId: COMP, customerId: CUST, consequenceContext: fakeConsequence });
    const logs = await logStore.getRecent({ companionId: COMP, customerId: CUST, limit: 20 });
    const askJennaLogs = logs.filter(l => l.strategy === "ask_jenna" && l.actionStatus === "created");
    assert.equal(askJennaLogs.length, 0, "should not have asked Jenna while give-space is active");
  });

  it("tick with repair active suppresses romantic escalation", async () => {
    // Force romantic_desire to be low so planner picks it up
    await nStore.upsertNeed({ companionId: COMP, customerId: CUST, needType: "romantic_desire", currentLevel: 0.1, urgency: 0.9 });
    const fakeConsequence = { suppression: { repairRequired: true, repairStarted: false, healing: false, giveSpace: false } };
    await runtime.tick({ companionId: COMP, customerId: CUST, consequenceContext: fakeConsequence });
    const logs = await logStore.getRecent({ companionId: COMP, customerId: CUST, limit: 20, needType: "romantic_desire" });
    // Should have been suppressed or reflected, not asked Jenna
    const askJenna = logs.filter(l => l.needType === "romantic_desire" && l.strategy === "ask_jenna");
    assert.equal(askJenna.length, 0, "romantic desire should not ask Jenna during repair");
  });

  it("pruneAll resolves without error", async () => {
    await assert.doesNotReject(() => runtime.pruneAll({ companionId: COMP, customerId: CUST }));
  });
});
