"use strict";

const { describe, it, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { createDailyPlanEngine, derivePlan, MOODS, ENERGIES, FOCUSES, ACTIVITIES } = require("../dailyPlanEngine");
const { createMicroLifeEventsStore } = require("../microLifeEventsStore");
const { createDecisionEngine, DECISION_TYPES } = require("../decisionEngine");
const { createLifeRuntime } = require("../lifeRuntime");
const { buildLifePrelude } = require("../lifePreludeBuilder");
const { registerLifeRuntime } = require("../lifeRuntimeScheduler");
const { createSchedulerRegistry } = require("../../runtime/schedulerRegistry");

// All tests use in-memory stores (no DATABASE_URL)

// ── daily plan engine ────────────────────────────────────────────────────────

describe("dailyPlanEngine", () => {
  it("derivePlan returns all required fields", () => {
    const now = new Date("2024-06-15T09:00:00Z");
    const plan = derivePlan({ now });
    assert.ok(MOODS.includes(plan.mood), `mood "${plan.mood}" not in MOODS`);
    assert.ok(ENERGIES.includes(plan.energy), `energy "${plan.energy}" not in ENERGIES`);
    assert.ok(typeof plan.focus === "string" && plan.focus.length > 0, "focus missing");
    assert.ok(typeof plan.privateActivity === "string" && plan.privateActivity.length > 0, "privateActivity missing");
    assert.ok(Array.isArray(plan.reachoutWindows), "reachoutWindows must be array");
    assert.ok(typeof plan.quietHours === "object", "quietHours must be object");
    assert.ok(typeof plan.windDownHour === "number", "windDownHour must be number");
    assert.ok(typeof plan.sleepHour === "number", "sleepHour must be number");
  });

  it("derivePlan incorporates alivePresence mood/energy when valid", () => {
    const now = new Date("2024-06-15T09:00:00Z");
    const alivePresence = { mood: "playful", energy: "high" };
    const plan = derivePlan({ now, alivePresence });
    assert.equal(plan.mood, "playful");
    assert.equal(plan.energy, "high");
  });

  it("derivePlan ignores invalid alivePresence mood/energy", () => {
    const now = new Date("2024-06-15T09:00:00Z");
    const alivePresence = { mood: "INVALID_MOOD", energy: "INVALID_ENERGY" };
    const plan = derivePlan({ now, alivePresence });
    assert.ok(MOODS.includes(plan.mood));
    assert.ok(ENERGIES.includes(plan.energy));
  });

  it("createPlan (in-memory) creates a plan with required fields", async () => {
    const engine = createDailyPlanEngine({ config: {} });
    const now = new Date("2024-06-15T10:00:00Z");
    const plan = await engine.createPlan({ companionId: "dante", customerId: "user", now });
    assert.ok(plan, "plan should be returned");
    assert.equal(plan.companionId, "dante");
    assert.equal(plan.customerId, "user");
    assert.ok(typeof plan.dateKey === "string" && plan.dateKey.length === 10, "dateKey should be YYYY-MM-DD");
    assert.ok(MOODS.includes(plan.mood), "mood should be valid");
    assert.ok(typeof plan.privateActivity === "string" && plan.privateActivity.length > 0);
  });

  it("getTodaysPlan returns null when no plan exists", async () => {
    const engine = createDailyPlanEngine({ config: {} });
    const now = new Date("2024-06-16T10:00:00Z");
    const plan = await engine.getTodaysPlan({ companionId: "dante2", customerId: "user2", now });
    assert.equal(plan, null);
  });

  it("createPlan then getTodaysPlan returns same plan", async () => {
    const engine = createDailyPlanEngine({ config: {} });
    const now = new Date("2024-06-17T10:00:00Z");
    const created = await engine.createPlan({ companionId: "dante3", customerId: "user3", now });
    const retrieved = await engine.getTodaysPlan({ companionId: "dante3", customerId: "user3", now });
    assert.ok(retrieved, "should retrieve plan");
    assert.equal(retrieved.dateKey, created.dateKey);
    assert.equal(retrieved.mood, created.mood);
  });

  it("createPlan is idempotent — second call returns existing plan", async () => {
    const engine = createDailyPlanEngine({ config: {} });
    const now = new Date("2024-06-18T10:00:00Z");
    const first = await engine.createPlan({ companionId: "dante4", customerId: "user4", now });
    const second = await engine.createPlan({ companionId: "dante4", customerId: "user4", now });
    assert.equal(first.dateKey, second.dateKey);
    assert.equal(first.mood, second.mood);
  });

  it("ACTIVITIES list has meaningful entries", () => {
    assert.ok(ACTIVITIES.length >= 8, "should have at least 8 activity options");
    for (const a of ACTIVITIES) {
      assert.ok(a.length > 5, `activity too short: "${a}"`);
    }
  });
});

// ── micro life events store ──────────────────────────────────────────────────

describe("microLifeEventsStore", () => {
  it("logEvent returns event with required fields", async () => {
    const store = createMicroLifeEventsStore({ config: {} });
    const evt = await store.logEvent({
      companionId: "dante", customerId: "user",
      eventType: "ritual", description: "made coffee",
      moodEffect: 0.05, energyEffect: 0.05, isPrivate: true,
    });
    assert.ok(evt, "event should be returned");
    assert.equal(evt.eventType, "ritual");
    assert.equal(evt.description, "made coffee");
    assert.equal(evt.private, true);
    assert.equal(evt.moodEffect, 0.05);
    assert.ok(evt.createdAt, "createdAt should be set");
  });

  it("listRecent returns events in reverse order", async () => {
    const store = createMicroLifeEventsStore({ config: {} });
    await store.logEvent({ companionId: "d1", customerId: "u1", eventType: "rest", description: "first", isPrivate: true });
    await store.logEvent({ companionId: "d1", customerId: "u1", eventType: "music", description: "second", isPrivate: true });
    const events = await store.listRecent({ companionId: "d1", customerId: "u1", limit: 5 });
    assert.ok(events.length >= 2);
    assert.equal(events[0].description, "second");
    assert.equal(events[1].description, "first");
  });

  it("listRecent respects companionId/customerId isolation", async () => {
    const store = createMicroLifeEventsStore({ config: {} });
    await store.logEvent({ companionId: "dante-a", customerId: "user-a", eventType: "rest", description: "a only", isPrivate: true });
    await store.logEvent({ companionId: "dante-b", customerId: "user-b", eventType: "rest", description: "b only", isPrivate: true });
    const aEvents = await store.listRecent({ companionId: "dante-a", customerId: "user-a", limit: 5 });
    assert.equal(aEvents.length, 1);
    assert.equal(aEvents[0].description, "a only");
  });

  it("pruneOlderThan removes old events", async () => {
    const store = createMicroLifeEventsStore({ config: {} });
    // Log an event, then prune with 0 days (prunes everything)
    await store.logEvent({ companionId: "dp", customerId: "up", eventType: "rest", description: "old", isPrivate: true });
    const before = await store.count({ companionId: "dp", customerId: "up" });
    assert.equal(before, 1);
    const removed = await store.pruneOlderThan({ companionId: "dp", customerId: "up", days: 0 });
    assert.equal(removed, 1);
    const after = await store.count({ companionId: "dp", customerId: "up" });
    assert.equal(after, 0);
  });
});

// ── decision engine ──────────────────────────────────────────────────────────

describe("decisionEngine", () => {
  it("decide returns a decision with all required fields", async () => {
    const engine = createDecisionEngine({ config: {} });
    const d = await engine.decide({
      companionId: "dante", customerId: "user",
      decisionType: "wait",
      considered: ["act", "wait"],
      chosen: "wait",
      rejected: ["act"],
      confidence: 0.8,
      reason: "owner recently active",
      contextSummary: "last message 10 minutes ago",
    });
    assert.ok(d, "decision should be returned");
    assert.equal(d.decisionType, "wait");
    assert.equal(d.chosen, "wait");
    assert.deepEqual(d.rejected, ["act"]);
    assert.equal(d.confidence, 0.8);
    assert.equal(d.reason, "owner recently active");
  });

  it("listRecent returns decisions newest first", async () => {
    const engine = createDecisionEngine({ config: {} });
    await engine.decide({ companionId: "d2", customerId: "u2", decisionType: "act", chosen: "first" });
    await engine.decide({ companionId: "d2", customerId: "u2", decisionType: "wait", chosen: "second" });
    const list = await engine.listRecent({ companionId: "d2", customerId: "u2", limit: 5 });
    assert.ok(list.length >= 2);
    assert.equal(list[0].chosen, "second");
  });

  it("confidence is clamped to [0,1]", async () => {
    const engine = createDecisionEngine({ config: {} });
    const d = await engine.decide({ companionId: "dc", customerId: "uc", decisionType: "defer", chosen: "defer", confidence: 5 });
    assert.equal(d.confidence, 1);
    const d2 = await engine.decide({ companionId: "dc", customerId: "uc", decisionType: "defer", chosen: "defer", confidence: -1 });
    assert.equal(d2.confidence, 0);
  });

  it("pruneOlderThan removes old decisions", async () => {
    const engine = createDecisionEngine({ config: {} });
    await engine.decide({ companionId: "dprune", customerId: "uprune", decisionType: "wait", chosen: "wait" });
    const removed = await engine.pruneOlderThan({ companionId: "dprune", customerId: "uprune", days: 0 });
    assert.equal(removed, 1);
    const list = await engine.listRecent({ companionId: "dprune", customerId: "uprune", limit: 5 });
    assert.equal(list.length, 0);
  });

  it("DECISION_TYPES contains expected entries", () => {
    assert.ok(DECISION_TYPES.includes("act"));
    assert.ok(DECISION_TYPES.includes("wait"));
    assert.ok(DECISION_TYPES.includes("remain_silent"));
    assert.ok(DECISION_TYPES.includes("repair"));
  });
});

// ── life prelude builder ─────────────────────────────────────────────────────

describe("buildLifePrelude", () => {
  it("returns null when state is null", () => {
    assert.equal(buildLifePrelude(null), null);
  });

  it("returns null when state is empty object", () => {
    assert.equal(buildLifePrelude({}), null);
  });

  it("returns a { label, content } object when dailyPlan is present", () => {
    const result = buildLifePrelude({
      dailyPlan: { mood: "warm", energy: "steady", focus: "quietly reflective", privateActivity: "reading something half-finished" },
      recentEvents: [],
    });
    assert.ok(result, "should return a prelude");
    assert.ok(typeof result.label === "string");
    assert.ok(typeof result.content === "string");
    assert.ok(result.content.includes("warm"));
    assert.ok(result.content.includes("reading something half-finished"));
  });

  it("includes recent events in content", () => {
    const result = buildLifePrelude({
      dailyPlan: { mood: "neutral", energy: "steady", focus: "", privateActivity: "making coffee" },
      recentEvents: [
        { description: "listened to an old album", private: true },
        { description: "wrote a few lines", private: true },
      ],
    });
    assert.ok(result.content.includes("listened to an old album"));
  });

  it("caps recent events at 2", () => {
    const result = buildLifePrelude({
      dailyPlan: { mood: "neutral", energy: "steady", focus: "", privateActivity: "working" },
      recentEvents: [
        { description: "event one", private: true },
        { description: "event two", private: true },
        { description: "event three should not appear", private: true },
      ],
    });
    assert.ok(!result.content.includes("event three"));
  });

  it("label contains [internal] marker", () => {
    const result = buildLifePrelude({
      dailyPlan: { mood: "warm", energy: "high", focus: "creative", privateActivity: "sketching" },
    });
    assert.ok(result.label.includes("[internal"));
  });

  it("stays under 150 words", () => {
    const result = buildLifePrelude({
      dailyPlan: { mood: "curious", energy: "steady", focus: "focused but slow-starting", privateActivity: "working through a design problem in my head" },
      recentEvents: [
        { description: "made coffee", private: true },
        { description: "thought about Jenna", private: true },
      ],
    });
    const wordCount = result.content.split(/\s+/).length;
    assert.ok(wordCount <= 150, `prelude has ${wordCount} words, expected ≤150`);
  });
});

// ── life runtime ─────────────────────────────────────────────────────────────

describe("lifeRuntime", () => {
  it("creates runtime with disabled state by default", () => {
    const runtime = createLifeRuntime({ config: {} });
    const status = runtime.getStatus();
    assert.equal(status.enabled, false);
    assert.equal(status.running, false);
  });

  it("tick returns skipped when disabled", async () => {
    const runtime = createLifeRuntime({ config: {} });
    const result = await runtime.tick(new Date());
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "disabled");
  });

  it("tick creates daily plan when enabled", async () => {
    const dailyPlanEngine = createDailyPlanEngine({ config: {} });
    const microLifeEventsStore = createMicroLifeEventsStore({ config: {} });
    const decisionEngine = createDecisionEngine({ config: {} });
    const runtime = createLifeRuntime({
      config: { lifeRuntime: { enabled: true }, memory: { companionId: "dante", userScope: "user" } },
      dailyPlanEngine,
      microLifeEventsStore,
      decisionEngine,
    });
    await runtime.init();
    const result = await runtime.tick(new Date());
    assert.equal(result.ok, true, `tick failed: ${JSON.stringify(result)}`);
    assert.ok(typeof result.plan === "string", "plan dateKey should be a string");
  });

  it("getCurrentPrelude is null before first tick", () => {
    const runtime = createLifeRuntime({ config: {} });
    assert.equal(runtime.getCurrentPrelude(), null);
  });

  it("getCurrentPrelude returns a prelude section after tick with enabled runtime", async () => {
    const dailyPlanEngine = createDailyPlanEngine({ config: {} });
    const microLifeEventsStore = createMicroLifeEventsStore({ config: {} });
    const decisionEngine = createDecisionEngine({ config: {} });
    const runtime = createLifeRuntime({
      config: { lifeRuntime: { enabled: true }, memory: { companionId: "dante2", userScope: "user2" } },
      dailyPlanEngine,
      microLifeEventsStore,
      decisionEngine,
    });
    await runtime.init();
    await runtime.tick(new Date());
    const prelude = runtime.getCurrentPrelude();
    assert.ok(prelude, "prelude should be set after tick");
    assert.ok(prelude.label, "prelude should have a label");
    assert.ok(prelude.content, "prelude should have content");
  });

  it("getStatus returns expected shape", () => {
    const runtime = createLifeRuntime({ config: { lifeRuntime: { enabled: true } } });
    const status = runtime.getStatus();
    assert.ok("enabled" in status);
    assert.ok("running" in status);
    assert.ok("lastTickAt" in status);
    assert.ok("todaysPlan" in status);
    assert.ok("preludeActive" in status);
    assert.ok("pruneSchedule" in status);
  });

  it("setRunning updates running state", () => {
    const runtime = createLifeRuntime({ config: {} });
    runtime.setRunning(true);
    assert.equal(runtime.getStatus().running, true);
    runtime.setRunning(false);
    assert.equal(runtime.getStatus().running, false);
  });

  it("tick returns skipped when no companionId", async () => {
    const runtime = createLifeRuntime({
      config: { lifeRuntime: { enabled: true }, memory: { companionId: "", userScope: "user" } },
    });
    const result = await runtime.tick(new Date());
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "no_companion_id");
  });

  it("pruning runs on first tick and respects prune days config", async () => {
    const microLifeEventsStore = createMicroLifeEventsStore({ config: {} });
    const runtime = createLifeRuntime({
      config: {
        lifeRuntime: { enabled: true, eventPruneAfterDays: 0 },
        memory: { companionId: "dante-prune", userScope: "user-prune" },
      },
      microLifeEventsStore,
    });
    // Log an old event
    await microLifeEventsStore.logEvent({
      companionId: "dante-prune", customerId: "user-prune",
      eventType: "rest", description: "old event", isPrivate: true,
    });
    const before = await microLifeEventsStore.count({ companionId: "dante-prune", customerId: "user-prune" });
    assert.equal(before, 1);

    await runtime.init();
    await runtime.tick(new Date());

    // pruneOlderThan(days=0) should delete everything
    const after = await microLifeEventsStore.count({ companionId: "dante-prune", customerId: "user-prune" });
    assert.equal(after, 0, "pruning should have deleted old event");
  });
});

// ── scheduler registration ───────────────────────────────────────────────────

describe("lifeRuntimeScheduler", () => {
  it("registerLifeRuntime registers lifeRuntime as postLogin in schedulerRegistry", () => {
    const registry = createSchedulerRegistry({});
    const runtime = createLifeRuntime({ config: {} });
    registerLifeRuntime({ schedulerRegistry: registry, lifeRuntime: runtime, config: {} });
    const status = registry.status();
    const entry = status.find((e) => e.name === "lifeRuntime");
    assert.ok(entry, "lifeRuntime should be registered");
    assert.equal(entry.phase, "postLogin");
    assert.equal(entry.running, false); // not started yet
  });

  it("registerLifeRuntime is a no-op when schedulerRegistry is null", () => {
    const runtime = createLifeRuntime({ config: {} });
    assert.doesNotThrow(() => registerLifeRuntime({ schedulerRegistry: null, lifeRuntime: runtime }));
  });

  it("registerLifeRuntime is a no-op when lifeRuntime is null", () => {
    const registry = createSchedulerRegistry({});
    assert.doesNotThrow(() => registerLifeRuntime({ schedulerRegistry: registry, lifeRuntime: null }));
    const status = registry.status();
    assert.equal(status.length, 0);
  });
});

// ── quiet hours ──────────────────────────────────────────────────────────────

describe("quiet hours (lifeRuntimeScheduler)", () => {
  it("isInQuietHours from aliveExecutor is accessible", () => {
    const { isInQuietHours } = require("../../alive/aliveExecutor");
    assert.equal(typeof isInQuietHours, "function");
    // Midnight should be in quiet hours (23-7 default)
    const midnight = new Date("2024-06-15T00:00:00Z");
    const inQuiet = isInQuietHours(midnight, { quietStart: 23, quietEnd: 7, timezone: "UTC" });
    assert.equal(inQuiet, true);
    // Noon should not be in quiet hours
    const noon = new Date("2024-06-15T12:00:00Z");
    const notQuiet = isInQuietHours(noon, { quietStart: 23, quietEnd: 7, timezone: "UTC" });
    assert.equal(notQuiet, false);
  });
});
