"use strict";

/**
 * Life Runtime 5.0 — Relational Consequences (Dante & Jenna)
 *
 * Covers the 26-point test plan: detection, persistence, gradual repair,
 * suppression of casual behaviour while repair is unresolved, the weather
 * bridge, prelude integration, and the lifeRuntime wiring.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  createConsequenceStore, REPAIR_GRACE_HOURS,
} = require("../consequenceStore");
const {
  createRelationalConsequencesEngine, classify, computeSuppression,
  isActionSuppressed, EVENT_TYPES, SEVERITY, CASUAL_ACTIONS,
} = require("../relationalConsequencesEngine");
const { createRelationshipWeatherBridge, WEATHER_DELTAS } = require("../relationshipWeatherBridge");
const { createRepairCarryoverEngine } = require("../repairCarryoverEngine");
const { buildConsequencePrelude } = require("../consequencePreludeBuilder");
const { buildLifePrelude } = require("../lifePreludeBuilder");
const { createRelationshipWeatherEngine } = require("../relationshipWeatherEngine");
const { createLifeRuntime } = require("../lifeRuntime");
const { createDailyPlanEngine } = require("../dailyPlanEngine");
const { createAttentionDriftEngine } = require("../attentionDriftEngine");
const { createThoughtMaturationEngine } = require("../thoughtMaturationEngine");
const { createPrivateQuestionStore } = require("../privateQuestionStore");
const { createInsightEngine } = require("../insightEngine");

const CID = "dante";
const UID = "jenna";

const HOUR = 3600 * 1000;

function freshStack() {
  const store = createConsequenceStore({ config: {}, logger: null });
  const weather = createRelationshipWeatherEngine({ config: {}, logger: null });
  const bridge = createRelationshipWeatherBridge({ relationshipWeatherEngine: weather, logger: null });
  const engine = createRelationalConsequencesEngine({ consequenceStore: store, relationshipWeatherBridge: bridge, logger: null });
  const carry = createRepairCarryoverEngine({ logger: null });
  return { store, weather, bridge, engine, carry };
}

async function initStack(s) {
  await s.store.init();
  await s.weather.init();
}

function makeLifeRuntime(overrides = {}) {
  const s = freshStack();
  const lr = createLifeRuntime({
    config: { lifeRuntime: { enabled: true }, memory: { companionId: CID, userScope: UID } },
    logger: null,
    consequenceStore: s.store,
    relationalConsequencesEngine: s.engine,
    repairCarryoverEngine: s.carry,
    relationshipWeatherEngine: s.weather,
    ...overrides,
  });
  return { lr, ...s };
}

// ── consequenceStore ─────────────────────────────────────────────────────────

describe("consequenceStore", () => {
  let store;
  beforeEach(async () => { store = createConsequenceStore({ config: {}, logger: null }); await store.init(); });

  it("create + getActive persists the consequence", async () => {
    await store.create({ companionId: CID, customerId: UID, eventType: "hurt_detected", severity: "moderate", repairRequired: true });
    const active = await store.getActive({ companionId: CID, customerId: UID });
    assert.equal(active.length, 1);
    assert.equal(active[0].eventType, "hurt_detected");
    assert.equal(active[0].repairRequired, true);
    assert.equal(active[0].resolvedAt, null);
  });

  it("minor consequence fades by timeout (expireStale)", async () => {
    const now = new Date();
    await store.create({
      companionId: CID, customerId: UID, eventType: "misread", severity: "minor",
      repairRequired: false, expiresAt: new Date(now.getTime() - HOUR), now,
    });
    const resolved = await store.expireStale({ companionId: CID, customerId: UID, now });
    assert.equal(resolved, 1);
    assert.equal((await store.getActive({ companionId: CID, customerId: UID })).length, 0);
  });

  it("major consequence does NOT auto-resolve by timeout", async () => {
    const now = new Date();
    await store.create({
      companionId: CID, customerId: UID, eventType: "boundary_crossed", severity: "major",
      repairRequired: true, expiresAt: new Date(now.getTime() - 100 * HOUR), now,
    });
    const resolved = await store.expireStale({ companionId: CID, customerId: UID, now });
    assert.equal(resolved, 0);
    assert.equal((await store.getActive({ companionId: CID, customerId: UID })).length, 1);
  });

  it("markRepairStarted updates the consequence", async () => {
    const c = await store.create({ companionId: CID, customerId: UID, eventType: "hurt_detected", severity: "moderate", repairRequired: true });
    await store.markRepairStarted({ companionId: CID, customerId: UID, id: c.id });
    const got = await store.getById({ companionId: CID, customerId: UID, id: c.id });
    assert.equal(got.repairStarted, true);
    assert.equal(got.repairCompleted, false);
  });

  it("repair completed resolves only gradually (grace window)", async () => {
    const now = new Date();
    const c = await store.create({ companionId: CID, customerId: UID, eventType: "hurt_detected", severity: "moderate", repairRequired: true, now });
    await store.markRepairCompleted({ companionId: CID, customerId: UID, id: c.id, now });

    // Still active immediately after completion — not snapped to resolved.
    let active = await store.getActive({ companionId: CID, customerId: UID });
    assert.equal(active.length, 1);
    assert.equal(active[0].repairCompleted, true);

    // Within grace: not resolved yet.
    assert.equal(await store.expireStale({ companionId: CID, customerId: UID, now }), 0);

    // After grace: resolves.
    const later = new Date(now.getTime() + (REPAIR_GRACE_HOURS + 1) * HOUR);
    assert.equal(await store.expireStale({ companionId: CID, customerId: UID, now: later }), 1);
    assert.equal((await store.getActive({ companionId: CID, customerId: UID })).length, 0);
  });

  it("prune only removes resolved consequences past cutoff", async () => {
    const old = new Date(Date.now() - 200 * 24 * HOUR);
    const c = await store.create({ companionId: CID, customerId: UID, eventType: "promise_kept", severity: "minor", now: old });
    await store.resolve({ companionId: CID, customerId: UID, id: c.id, now: old });
    const removed = await store.pruneOlderThan({ companionId: CID, customerId: UID, days: 90 });
    assert.equal(removed, 1);
  });
});

// ── detection ────────────────────────────────────────────────────────────────

describe("relationalConsequencesEngine — detection", () => {
  let s;
  beforeEach(async () => { s = freshStack(); await initStack(s); });

  it("hurt message creates a hurt_detected consequence", async () => {
    const c = await s.engine.detect({ companionId: CID, customerId: UID, userText: "that really hurt." });
    assert.equal(c.eventType, "hurt_detected");
    assert.equal(c.repairRequired, true);
  });

  it("disappointment message creates a disappointment consequence", async () => {
    const c = await s.engine.detect({ companionId: CID, customerId: UID, userText: "honestly, you disappointed me." });
    assert.equal(c.eventType, "disappointment");
    assert.equal(c.repairRequired, true);
  });

  it("pushback landing badly creates a pushback_landed_badly consequence", async () => {
    const c = await s.engine.detect({ companionId: CID, customerId: UID, userText: "you're not listening to me." });
    assert.equal(c.eventType, "pushback_landed_badly");
  });

  it("'stop' is read as pushback landing badly", async () => {
    const c = await s.engine.detect({ companionId: CID, customerId: UID, userText: "just stop." });
    assert.equal(c.eventType, "pushback_landed_badly");
  });

  it("broken promise creates a major promise_broken consequence", async () => {
    const c = await s.engine.detect({ companionId: CID, customerId: UID, userText: "but you promised you would." });
    assert.equal(c.eventType, "promise_broken");
    assert.equal(c.severity, "major");
  });

  it("'i need space' creates a give_space_requested consequence", async () => {
    const c = await s.engine.detect({ companionId: CID, customerId: UID, userText: "I need space right now." });
    assert.equal(c.eventType, "give_space_requested");
    assert.equal(c.metadata.giveSpace, true);
  });

  it("detection falls back to the existing repair analysis", async () => {
    const c = await s.engine.detect({
      companionId: CID, customerId: UID, userText: "ok.",
      repairResult: { repairNeeded: true, repairType: "dismissiveness", severity: "high" },
    });
    assert.equal(c.eventType, "pushback_landed_badly");
    assert.equal(c.severity, "major");
  });

  it("no signal → no consequence", async () => {
    const c = await s.engine.detect({ companionId: CID, customerId: UID, userText: "what time is it?" });
    assert.equal(c, null);
  });

  it("re-mentioning the same hurt reinforces rather than duplicating", async () => {
    await s.engine.detect({ companionId: CID, customerId: UID, userText: "that hurt" });
    await s.engine.detect({ companionId: CID, customerId: UID, userText: "that really hurt" });
    const active = await s.store.getActive({ companionId: CID, customerId: UID });
    assert.equal(active.filter(c => c.eventType === "hurt_detected").length, 1);
  });

  it("classify is a pure function (exported)", () => {
    assert.equal(classify("you crossed a line").eventType, "boundary_crossed");
    assert.equal(classify("thanks, that's fine"), null);
  });

  it("recordEvent: promise_kept improves trust via weather", async () => {
    const before = (await s.weather.getWeather({ companionId: CID, customerId: UID })).trust;
    await s.engine.recordEvent({ companionId: CID, customerId: UID, eventType: "promise_kept" });
    const after = (await s.weather.getWeather({ companionId: CID, customerId: UID })).trust;
    assert.ok(after > before, `trust should rise (${before} → ${after})`);
  });

  it("recordEvent: promise_broken is repair-required", async () => {
    const c = await s.engine.recordEvent({ companionId: CID, customerId: UID, eventType: "promise_broken" });
    assert.equal(c.repairRequired, true);
    assert.equal(c.severity, "major");
  });
});

// ── suppression ──────────────────────────────────────────────────────────────

describe("relationalConsequencesEngine — suppression", () => {
  let s;
  beforeEach(async () => { s = freshStack(); await initStack(s); });

  it("casual flirt / voice note / image are suppressed while repair is unresolved", async () => {
    await s.engine.detect({ companionId: CID, customerId: UID, userText: "that hurt" });
    const active = await s.store.getActive({ companionId: CID, customerId: UID });
    const sup = s.engine.computeSuppression(active);
    assert.ok(sup.suppressed.includes("casual_flirt"));
    assert.ok(sup.suppressed.includes("unrelated_voice_note"));
    assert.ok(sup.suppressed.includes("unrelated_image"));
    assert.equal(sup.repairRequired, true);
  });

  it("goodnight stays allowed but becomes repair-aware (not plain casual)", async () => {
    await s.engine.detect({ companionId: CID, customerId: UID, userText: "that hurt" });
    const active = await s.store.getActive({ companionId: CID, customerId: UID });
    const sup = s.engine.computeSuppression(active);
    assert.equal(sup.goodnightAllowed, true);
    assert.equal(sup.affectionMode, "repair-aware");
    assert.ok(sup.suppressed.includes("casual_affection"));
  });

  it("give-space suppresses outbound reach-outs", async () => {
    await s.engine.detect({ companionId: CID, customerId: UID, userText: "i need space" });
    const active = await s.store.getActive({ companionId: CID, customerId: UID });
    const sup = s.engine.computeSuppression(active);
    assert.equal(sup.giveSpace, true);
    assert.ok(sup.suppressed.includes("proactive_reachout"));
  });

  it("playfulness is damped while unresolved, less so while healing, never instantly full", async () => {
    const now = new Date();
    const c = await s.store.create({ companionId: CID, customerId: UID, eventType: "hurt_detected", severity: "moderate", repairRequired: true, suppressionRules: CASUAL_ACTIONS, now });
    let sup = s.engine.computeSuppression(await s.store.getActive({ companionId: CID, customerId: UID }));
    const dampUnresolved = sup.playfulnessDamp;
    assert.ok(dampUnresolved >= 0.5);

    await s.store.markRepairCompleted({ companionId: CID, customerId: UID, id: c.id, now });
    sup = s.engine.computeSuppression(await s.store.getActive({ companionId: CID, customerId: UID }));
    assert.ok(sup.playfulnessDamp > 0, "still damped while healing");
    assert.ok(sup.playfulnessDamp < dampUnresolved, "but less than while unresolved");
    // flirt/teasing stay held back during healing; gentler items return
    assert.ok(sup.suppressed.includes("casual_flirt"));
    assert.ok(!sup.suppressed.includes("casual_affection"));
  });

  it("isActionSuppressed helper agrees with computeSuppression", async () => {
    await s.engine.detect({ companionId: CID, customerId: UID, userText: "that hurt" });
    const active = await s.store.getActive({ companionId: CID, customerId: UID });
    assert.equal(isActionSuppressed("casual_flirt", active), true);
    assert.equal(isActionSuppressed("nonexistent_action", active), false);
  });

  it("no consequences → nothing suppressed, normal affection", () => {
    const sup = computeSuppression([]);
    assert.equal(sup.active, false);
    assert.equal(sup.suppressed.length, 0);
    assert.equal(sup.affectionMode, "normal");
  });
});

// ── resolution / gradual repair ──────────────────────────────────────────────

describe("relationalConsequencesEngine — resolution", () => {
  let s;
  beforeEach(async () => { s = freshStack(); await initStack(s); });

  it("explicit forgiveness completes repair (begins gradual resolution)", async () => {
    await s.engine.detect({ companionId: CID, customerId: UID, userText: "that hurt" });
    await s.engine.reviewActive({ companionId: CID, customerId: UID, now: new Date() }); // starts repair
    const res = await s.engine.resolveFromSignals({ companionId: CID, customerId: UID, userText: "I forgive you." });
    assert.ok(res.completed.length >= 1);
    const active = await s.store.getActive({ companionId: CID, customerId: UID });
    assert.equal(active[0].repairCompleted, true);
    assert.equal(active[0].resolvedAt, null); // gradual — not instant
  });

  it("accumulated positive signals complete a non-major repair after it has started", async () => {
    await s.engine.detect({ companionId: CID, customerId: UID, userText: "you're not listening" });
    await s.engine.reviewActive({ companionId: CID, customerId: UID, now: new Date() });
    await s.engine.resolveFromSignals({ companionId: CID, customerId: UID, userText: "thank you, that helped" });
    const res2 = await s.engine.resolveFromSignals({ companionId: CID, customerId: UID, userText: "that really helped" });
    assert.ok(res2.completed.length >= 1, "two positives complete a non-major repair");
  });

  it("a positive message records a warming consequence", async () => {
    const res = await s.engine.resolveFromSignals({ companionId: CID, customerId: UID, userText: "that meant a lot to me" });
    assert.ok(res.created.some(c => c && c.eventType === "deep_affection"));
  });

  it("reviewActive lets Dante begin repair himself (marks repair_started)", async () => {
    await s.engine.detect({ companionId: CID, customerId: UID, userText: "that hurt" });
    const review = await s.engine.reviewActive({ companionId: CID, customerId: UID, now: new Date() });
    assert.equal(review.started, 1);
    assert.equal(review.suppression.repairStarted, true);
  });
});

// ── weather bridge ───────────────────────────────────────────────────────────

describe("relationshipWeatherBridge", () => {
  let s;
  beforeEach(async () => { s = freshStack(); await initStack(s); });

  it("lowers playfulness after a hurt", async () => {
    const before = (await s.weather.getWeather({ companionId: CID, customerId: UID })).playfulness;
    await s.bridge.applyForEvent({ companionId: CID, customerId: UID, eventType: "hurt_detected", severity: "moderate" });
    const after = (await s.weather.getWeather({ companionId: CID, customerId: UID })).playfulness;
    assert.ok(after < before, `playfulness should drop (${before} → ${after})`);
  });

  it("repair completion does NOT instantly restore playfulness to full", async () => {
    const full = (await s.weather.getWeather({ companionId: CID, customerId: UID })).playfulness;
    await s.bridge.applyForEvent({ companionId: CID, customerId: UID, eventType: "hurt_detected", severity: "moderate" });
    const hurt = (await s.weather.getWeather({ companionId: CID, customerId: UID })).playfulness;
    await s.bridge.applyForEvent({ companionId: CID, customerId: UID, eventType: "repair_completed", severity: "moderate" });
    const done = (await s.weather.getWeather({ companionId: CID, customerId: UID })).playfulness;
    assert.ok(done < full, "playfulness not back to where it was before the hurt");
    assert.ok(Math.abs(done - hurt) < 0.001, "repair_completed carries no playfulness boost");
  });

  it("promise_kept raises trust; promise_broken lowers it", async () => {
    const t0 = (await s.weather.getWeather({ companionId: CID, customerId: UID })).trust;
    await s.bridge.applyForEvent({ companionId: CID, customerId: UID, eventType: "promise_kept", severity: "minor" });
    const t1 = (await s.weather.getWeather({ companionId: CID, customerId: UID })).trust;
    assert.ok(t1 > t0);
    await s.bridge.applyForEvent({ companionId: CID, customerId: UID, eventType: "promise_broken", severity: "major" });
    const t2 = (await s.weather.getWeather({ companionId: CID, customerId: UID })).trust;
    assert.ok(t2 < t1);
  });

  it("deltas are gradual — a major event is still capped at MAX_DELTA", async () => {
    const before = (await s.weather.getWeather({ companionId: CID, customerId: UID })).distance;
    await s.bridge.applyForEvent({ companionId: CID, customerId: UID, eventType: "boundary_crossed", severity: "major" });
    const after = (await s.weather.getWeather({ companionId: CID, customerId: UID })).distance;
    assert.ok(Math.abs(after - before) <= 0.031, "distance delta capped even for a major event");
  });

  it("is a compatible no-op when no weather engine is wired", async () => {
    const bridge = createRelationshipWeatherBridge({ relationshipWeatherEngine: null });
    assert.equal(bridge.available, false);
    const r = await bridge.applyForEvent({ companionId: CID, customerId: UID, eventType: "hurt_detected" });
    assert.equal(r, null);
  });

  it("exports a delta for every weather-affecting event", () => {
    assert.ok(WEATHER_DELTAS.hurt_detected);
    assert.ok(WEATHER_DELTAS.repair_completed);
    assert.ok(WEATHER_DELTAS.promise_kept);
  });
});

// ── repair carryover ─────────────────────────────────────────────────────────

describe("repairCarryoverEngine", () => {
  const carry = createRepairCarryoverEngine({ logger: null });

  it("buildCarryover biases attention to repair and flags lead-with-ownership", () => {
    const sup = computeSuppression([{ eventType: "hurt_detected", severity: "moderate", repairRequired: true, suppressionRules: CASUAL_ACTIONS, attentionBias: "repair" }]);
    const c = carry.buildCarryover({ suppression: sup });
    assert.equal(c.active, true);
    assert.equal(c.attentionBias, "repair");
    assert.equal(c.leadWithOwnership, true);
    assert.equal(c.repairContext !== null, true);
  });

  it("give-space carryover blocks reach-outs and does not lead with ownership", () => {
    const sup = computeSuppression([{ eventType: "give_space_requested", severity: "moderate", repairRequired: true, suppressionRules: ["proactive_reachout"], attentionBias: "space", metadata: { giveSpace: true } }]);
    const c = carry.buildCarryover({ suppression: sup });
    assert.equal(c.giveSpace, true);
    assert.equal(c.blockReachouts, true);
    assert.equal(c.leadWithOwnership, false);
  });

  it("applyToPlan overlays focus/activity toward repair without mutating input", () => {
    const sup = computeSuppression([{ eventType: "hurt_detected", severity: "moderate", repairRequired: true, suppressionRules: CASUAL_ACTIONS }]);
    const c = carry.buildCarryover({ suppression: sup });
    const plan = { mood: "warm", energy: "steady", focus: "present and attentive", privateActivity: "making coffee" };
    const next = carry.applyToPlan(plan, c);
    assert.notEqual(next.focus, plan.focus);
    assert.equal(next.repairOverlay, true);
    assert.equal(plan.focus, "present and attentive", "input plan untouched");
    assert.equal(next.mood, "warm", "other fields preserved");
  });

  it("reflectionEvent yields a private repair micro-event", () => {
    const sup = computeSuppression([{ eventType: "hurt_detected", severity: "moderate", repairRequired: true, suppressionRules: CASUAL_ACTIONS }]);
    const ev = carry.reflectionEvent(carry.buildCarryover({ suppression: sup }));
    assert.ok(ev && ev.description);
    assert.ok(Array.isArray(ev.tags) && ev.tags.includes("repair"));
  });

  it("no suppression → neutral carryover, no plan change", () => {
    const c = carry.buildCarryover({ suppression: computeSuppression([]) });
    assert.equal(c.active, false);
    const plan = { focus: "x", privateActivity: "y" };
    assert.equal(carry.applyToPlan(plan, c), plan);
  });
});

// ── consequence prelude ──────────────────────────────────────────────────────

describe("consequencePreludeBuilder", () => {
  it("is compact, one short line, never JSON or scores", () => {
    const line = buildConsequencePrelude({ repairRequired: true, repairStarted: false });
    assert.equal(typeof line, "string");
    assert.ok(line.length < 120, "compact");
    assert.ok(!line.includes("{"));
    assert.ok(!/0\.\d/.test(line), "no raw scores");
  });

  it("space > unresolved-repair > underway > healing > warming", () => {
    assert.match(buildConsequencePrelude({ giveSpace: true }), /space/i);
    assert.match(buildConsequencePrelude({ repairRequired: true, repairStarted: false }), /unresolved|ownership/i);
    assert.match(buildConsequencePrelude({ repairRequired: true, repairStarted: true }), /underway|gentle/i);
    assert.match(buildConsequencePrelude({ healing: true }), /mend/i);
    assert.match(buildConsequencePrelude({ warming: true }), /warmer/i);
  });

  it("returns null when nothing applies", () => {
    assert.equal(buildConsequencePrelude(null), null);
    assert.equal(buildConsequencePrelude({}), null);
  });

  it("lifePreludeBuilder leads with the consequence line", () => {
    const p = buildLifePrelude({
      dailyPlan: { mood: "warm", energy: "steady", focus: "present" },
      consequenceContext: { repairRequired: true, repairStarted: false },
    });
    assert.ok(p.content.startsWith("Repair is still unresolved"));
  });

  it("prelude with all six contexts stays under 150 tokens", () => {
    const p = buildLifePrelude({
      dailyPlan: { mood: "content", energy: "steady", focus: "ship the feature", privateActivity: "sketching ideas" },
      recentEvents: [{ description: "made coffee" }, { description: "wrote a few lines" }],
      growthContext: { activeProject: { title: "portfolio rebuild" } },
      curiosityContext: { attentionFocus: { focus: "what she's building" }, maturingCount: 2 },
      relationshipContext: { weatherSummary: "flowing well together", upcomingAnniversaries: [] },
      consequenceContext: { repairRequired: true, repairStarted: true },
    });
    const tokenApprox = Math.ceil((p?.content ?? "").length / 5.5);
    assert.ok(tokenApprox <= 150, `prelude ~${tokenApprox} tokens`);
  });
});

// ── lifeRuntime integration ──────────────────────────────────────────────────

describe("lifeRuntime — relational consequences wiring", () => {
  it("observeInteraction creates a consequence and suppresses casual actions", async () => {
    const { lr } = makeLifeRuntime();
    await lr.init();
    await lr.observeInteraction({ userText: "that hurt" });
    assert.equal(lr.isActionSuppressed("casual_flirt"), true);
    assert.equal(lr.isActionSuppressed("unrelated_voice_note"), true);
    assert.equal(lr.isActionSuppressed("unrelated_image"), true);
  });

  it("getStatus exposes safe consequence metadata only (no raw text/scores)", async () => {
    const { lr } = makeLifeRuntime();
    await lr.init();
    await lr.observeInteraction({ userText: "that hurt" });
    const cc = lr.getStatus().consequenceContext;
    assert.equal(cc.activeConsequencesCount, 1);
    assert.equal(cc.highestConsequenceSeverity, "moderate");
    assert.equal(cc.repairRequired, true);
    assert.ok(Array.isArray(cc.suppressedActionTypes));
    assert.equal("summary" in cc, false, "no private text leaked");
    assert.equal(typeof cc.relationshipWeatherSummary === "string" || cc.relationshipWeatherSummary === null, true);
  });

  it("give-space suppresses reach-outs through the runtime", async () => {
    const { lr } = makeLifeRuntime();
    await lr.init();
    await lr.observeInteraction({ userText: "I need some space" });
    assert.equal(lr.isActionSuppressed("proactive_reachout"), true);
    assert.equal(lr.getStatus().consequenceContext.giveSpace, true);
  });

  it("daily plan changes under an unresolved consequence", async () => {
    const dailyPlanEngine = createDailyPlanEngine({ config: {}, logger: null });
    const { lr } = makeLifeRuntime({ dailyPlanEngine });
    await lr.init();
    await lr.tick(new Date());
    const before = lr.getStatus().todaysPlan.focus;
    await lr.observeInteraction({ userText: "that hurt" });
    const after = lr.getStatus().todaysPlan.focus;
    assert.notEqual(after, before);
    assert.match(after, /tending|between us/i);
  });

  it("tick lets Dante begin repair and biases attention to repair", async () => {
    const attentionDriftEngine = createAttentionDriftEngine({ config: {}, logger: null });
    const { lr } = makeLifeRuntime({ attentionDriftEngine });
    await lr.init();
    await lr.observeInteraction({ userText: "that hurt" });
    await lr.tick(new Date());
    const cc = lr.getStatus().consequenceContext;
    assert.equal(cc.repairStarted, true);
    assert.equal(cc.attentionBias, "repair");
  });

  it("thought maturation receives the give-space/repair bias on tick", async () => {
    let captured = null;
    const thoughtMaturationEngine = { tick: async (args) => { captured = args; return { matured: [], insights: [], intentions: [], suppressed: 0 }; } };
    const attentionDriftEngine = createAttentionDriftEngine({ config: {}, logger: null });
    const { lr } = makeLifeRuntime({ thoughtMaturationEngine, attentionDriftEngine });
    await lr.init();
    await lr.observeInteraction({ userText: "that hurt" });
    await lr.tick(new Date());
    assert.equal(captured.isGiveSpace, true);
  });

  it("forgiveness moves repair toward resolution through the runtime", async () => {
    const { lr } = makeLifeRuntime();
    await lr.init();
    await lr.observeInteraction({ userText: "that hurt" });
    await lr.tick(new Date()); // Dante starts repair
    await lr.observeInteraction({ userText: "we're okay now" });
    const cc = lr.getStatus().consequenceContext;
    assert.equal(cc.repairCompleted, true);
  });

  it("a clean runtime (no consequence) leaves casual actions free", async () => {
    const { lr } = makeLifeRuntime();
    await lr.init();
    await lr.tick(new Date());
    assert.equal(lr.isActionSuppressed("casual_flirt"), false);
    assert.equal(lr.getStatus().consequenceContext === null || lr.getStatus().consequenceContext.repairRequired === false, true);
  });
});

// ── thought maturation prioritises repair (existing engine, repair bias) ──────

describe("thoughtMaturation prioritises repair over casual curiosities", () => {
  it("matures a repair thought into an insight while holding back casual intentions", async () => {
    const pqs = createPrivateQuestionStore({ config: {}, logger: null });
    const ie = createInsightEngine({ config: {}, logger: null });
    await pqs.init(); await ie.init();
    const tm = createThoughtMaturationEngine({ privateQuestionStore: pqs, insightEngine: ie, logger: null });

    await pqs.logQuestion({
      companionId: CID, customerId: UID,
      question: "how do I make this right with her?",
      source: "repair", topic: "repair",
      emotionalWeight: 0.85, curiosityScore: 0.85,
      maturesAt: new Date(Date.now() - HOUR),
    });

    await tm.tick({ companionId: CID, customerId: UID, now: new Date(), isGiveSpace: true }); // open → maturing
    const r2 = await tm.tick({ companionId: CID, customerId: UID, now: new Date(), isGiveSpace: true }); // → insight
    assert.ok(r2.insights.length >= 1, "repair thought produced an insight");
    assert.equal(r2.intentions.length, 0, "casual intention conversion held back under give-space");
  });
});

// ── taxonomy sanity ──────────────────────────────────────────────────────────

describe("taxonomy", () => {
  it("exports repair persistence event types and 3 severities", () => {
    assert.equal(EVENT_TYPES.length, 22);
    assert.equal(SEVERITY.length, 3);
    for (const t of ["hurt_detected", "promise_broken", "deep_affection", "forgiveness", "give_space_requested", "claimed_action_without_evidence", "confabulation_detected", "self_confidence_low"]) {
      assert.ok(EVENT_TYPES.includes(t), `missing ${t}`);
    }
  });
});
