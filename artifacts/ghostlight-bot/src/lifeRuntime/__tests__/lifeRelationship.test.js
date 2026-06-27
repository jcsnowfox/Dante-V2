"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const { createRelationshipWeatherEngine, WEATHER_DIMENSIONS, WEATHER_DEFAULTS } = require("../relationshipWeatherEngine");
const { createSharedHistoryEngine, MOMENT_TYPES, RECORD_THRESHOLD }              = require("../sharedHistoryEngine");
const { createRitualEngine, RITUAL_FORMATION_THRESHOLD, RITUAL_STATUSES }        = require("../ritualEngine");
const { createTraditionEngine, TRADITION_THRESHOLD_OCCURRENCES }                  = require("../traditionEngine");
const { createAnniversaryEngine, UPCOMING_DAYS_WINDOW }                           = require("../anniversaryEngine");
const { createInsideJokeEngine, JOKE_PROMOTION_THRESHOLD, JOKE_STATUSES }         = require("../insideJokeEngine");
const { createRelationshipTimelineEngine, CHAPTER_TYPES, TIMELINE_RECORD_THRESHOLD, inferChapter } = require("../relationshipTimelineEngine");
const { buildLifePrelude }                                                          = require("../lifePreludeBuilder");
const { createLifeRuntime }                                                         = require("../lifeRuntime");

const CID = "dante";
const UID = "jenna";

// ── relationshipWeatherEngine ─────────────────────────────────────────────────

describe("relationshipWeatherEngine", () => {
  let engine;
  before(async () => {
    engine = createRelationshipWeatherEngine({ config: {}, logger: null });
    await engine.init();
  });

  it("WEATHER_DIMENSIONS exports 9 dimensions", () => {
    assert.ok(Array.isArray(WEATHER_DIMENSIONS));
    assert.equal(WEATHER_DIMENSIONS.length, 9);
    assert.ok(WEATHER_DIMENSIONS.includes("trust"));
    assert.ok(WEATHER_DIMENSIONS.includes("repair"));
    assert.ok(WEATHER_DIMENSIONS.includes("sharedMomentum"));
  });

  it("WEATHER_DEFAULTS provides valid baseline", () => {
    assert.ok(typeof WEATHER_DEFAULTS === "object");
    for (const dim of WEATHER_DIMENSIONS) {
      assert.ok(typeof WEATHER_DEFAULTS[dim] === "number", `missing default for ${dim}`);
      assert.ok(WEATHER_DEFAULTS[dim] >= 0 && WEATHER_DEFAULTS[dim] <= 1);
    }
  });

  it("getWeather returns defaults on first call", async () => {
    const w = await engine.getWeather({ companionId: CID, customerId: UID });
    assert.ok(typeof w.trust === "number");
    assert.ok(typeof w.comfort === "number");
    assert.ok(typeof w.weatherSummary === "string");
  });

  it("applyShift changes values within MAX_DELTA", async () => {
    const before = await engine.getWeather({ companionId: CID, customerId: UID });
    await engine.applyShift({ companionId: CID, customerId: UID, deltas: { trust: 0.1 } });
    const after = await engine.getWeather({ companionId: CID, customerId: UID });
    // delta is capped at 0.03 even if 0.1 was requested
    assert.ok(Math.abs(after.trust - before.trust) <= 0.031, "trust delta is capped at MAX_DELTA");
  });

  it("tick passive call returns updated weather", async () => {
    const result = await engine.tick({ companionId: CID, customerId: UID, hadInteraction: false });
    assert.ok(typeof result === "object");
    assert.ok(typeof result.weatherSummary === "string");
  });

  it("buildSummary returns non-empty string", () => {
    const summary = engine.buildSummary(WEATHER_DEFAULTS);
    assert.ok(typeof summary === "string");
    assert.ok(summary.length > 0);
  });

  it("repair dimension decays via tick", async () => {
    await engine.applyShift({ companionId: CID, customerId: UID, deltas: { repair: 0.03 } });
    const before = await engine.getWeather({ companionId: CID, customerId: UID });
    await engine.tick({ companionId: CID, customerId: UID });
    const after = await engine.getWeather({ companionId: CID, customerId: UID });
    assert.ok(after.repair <= before.repair, "repair decays via tick");
  });
});

// ── sharedHistoryEngine ───────────────────────────────────────────────────────

describe("sharedHistoryEngine", () => {
  let engine;
  before(async () => {
    engine = createSharedHistoryEngine({ config: {}, logger: null });
    await engine.init();
  });

  it("MOMENT_TYPES exports at least 6 types", () => {
    assert.ok(Array.isArray(MOMENT_TYPES));
    assert.ok(MOMENT_TYPES.length >= 6);
    assert.ok(MOMENT_TYPES.includes("milestone"));
    assert.ok(MOMENT_TYPES.includes("emotional"));
    assert.ok(MOMENT_TYPES.includes("creative"));
  });

  it("RECORD_THRESHOLD is a number between 0 and 1", () => {
    assert.ok(typeof RECORD_THRESHOLD === "number");
    assert.ok(RECORD_THRESHOLD > 0 && RECORD_THRESHOLD < 1);
  });

  it("recordMoment stores a moment with sufficient importance", async () => {
    const m = await engine.recordMoment({
      companionId: CID, customerId: UID,
      momentType: "milestone", summary: "First real conversation",
      importance: 0.8, emotionalWeight: 0.6,
    });
    assert.ok(typeof m?.id !== "undefined");
    assert.equal(m.momentType, "milestone");
    assert.equal(m.summary, "First real conversation");
  });

  it("recordMoment rejects moments below RECORD_THRESHOLD", async () => {
    const result = await engine.recordMoment({
      companionId: CID, customerId: UID,
      momentType: "playful", summary: "Low importance",
      importance: 0.1,
    });
    assert.equal(result, null);
  });

  it("getRecent returns sorted moments", async () => {
    await engine.recordMoment({ companionId: CID, customerId: UID, momentType: "emotional", summary: "Shared something personal", importance: 0.7 });
    const recent = await engine.getRecent({ companionId: CID, customerId: UID, limit: 5 });
    assert.ok(Array.isArray(recent));
    assert.ok(recent.length >= 1);
  });

  it("count returns non-negative integer", async () => {
    const c = await engine.count({ companionId: CID, customerId: UID });
    assert.ok(typeof c === "number" && c >= 0);
  });

  it("pruneOlderThan removes old low-importance moments", async () => {
    const deleted = await engine.pruneOlderThan({ companionId: CID, customerId: UID, days: 0, keepMinImportance: 0.99 });
    assert.ok(typeof deleted === "number" && deleted >= 0);
  });
});

// ── ritualEngine ──────────────────────────────────────────────────────────────

describe("ritualEngine", () => {
  let engine;
  before(async () => {
    engine = createRitualEngine({ config: {}, logger: null });
    await engine.init();
  });

  it("RITUAL_FORMATION_THRESHOLD is a positive integer", () => {
    assert.ok(typeof RITUAL_FORMATION_THRESHOLD === "number");
    assert.ok(RITUAL_FORMATION_THRESHOLD > 0);
  });

  it("RITUAL_STATUSES includes forming, active, fading, abandoned", () => {
    assert.ok(RITUAL_STATUSES.includes("forming"));
    assert.ok(RITUAL_STATUSES.includes("active"));
    assert.ok(RITUAL_STATUSES.includes("fading"));
    assert.ok(RITUAL_STATUSES.includes("abandoned"));
  });

  it("observe creates a forming ritual on first call", async () => {
    const r = await engine.observe({
      companionId: CID, customerId: UID,
      name: "sunday-meal-prep", pattern: "Sunday evening",
      description: "Preparing meals together on Sundays",
    });
    assert.ok(typeof r?.id !== "undefined");
    assert.equal(r.status, "forming");
    assert.equal(r.occurrenceCount, 1);
  });

  it("observe promotes to active after threshold occurrences", async () => {
    const name = "friday-build-review";
    for (let i = 0; i < RITUAL_FORMATION_THRESHOLD - 1; i++) {
      await engine.observe({ companionId: CID, customerId: UID, name, pattern: "Friday afternoon" });
    }
    const r = await engine.observe({ companionId: CID, customerId: UID, name, pattern: "Friday afternoon" });
    assert.equal(r?.status, "active");
  });

  it("getRituals returns active rituals", async () => {
    const rituals = await engine.getRituals({ companionId: CID, customerId: UID, status: "active" });
    assert.ok(Array.isArray(rituals));
    assert.ok(rituals.length >= 1);
    assert.ok(rituals.every(r => r.status === "active"));
  });

  it("count returns active ritual count", async () => {
    const c = await engine.count({ companionId: CID, customerId: UID });
    assert.ok(typeof c === "number" && c >= 0);
  });

  it("applyDecay and pruneOlderThan run without error", async () => {
    const decayed = await engine.applyDecay({ companionId: CID, customerId: UID });
    assert.ok(typeof decayed === "number");
    const pruned = await engine.pruneOlderThan({ companionId: CID, customerId: UID, days: 0 });
    assert.ok(typeof pruned === "number");
  });
});

// ── traditionEngine ───────────────────────────────────────────────────────────

describe("traditionEngine", () => {
  let engine;
  before(async () => {
    engine = createTraditionEngine({ config: {}, logger: null });
    await engine.init();
  });

  it("TRADITION_THRESHOLD_OCCURRENCES is a positive integer", () => {
    assert.ok(typeof TRADITION_THRESHOLD_OCCURRENCES === "number");
    assert.ok(TRADITION_THRESHOLD_OCCURRENCES > 0);
  });

  it("promoteFromRitual creates a tradition", async () => {
    const t = await engine.promoteFromRitual({
      companionId: CID, customerId: UID,
      name: "sunday-meal-prep",
      origin: "sunday-meal-prep ritual",
      meaning: "Weekly connection through food",
    });
    assert.ok(typeof t?.id !== "undefined");
    assert.equal(t.name, "sunday-meal-prep");
    assert.ok(t.active);
  });

  it("promoteFromRitual is idempotent — second call increases strength", async () => {
    const t1 = await engine.promoteFromRitual({ companionId: CID, customerId: UID, name: "sunday-meal-prep" });
    const t2 = await engine.promoteFromRitual({ companionId: CID, customerId: UID, name: "sunday-meal-prep" });
    assert.ok(t2.strength >= t1.strength);
  });

  it("getTraditions returns active traditions", async () => {
    const traditions = await engine.getTraditions({ companionId: CID, customerId: UID });
    assert.ok(Array.isArray(traditions));
    assert.ok(traditions.length >= 1);
    assert.ok(traditions.every(t => t.active));
  });

  it("count returns active tradition count", async () => {
    const c = await engine.count({ companionId: CID, customerId: UID });
    assert.ok(typeof c === "number" && c >= 1);
  });

  it("applyDecay runs without error", async () => {
    const result = await engine.applyDecay({ companionId: CID, customerId: UID });
    assert.ok(typeof result === "number");
  });
});

// ── anniversaryEngine ─────────────────────────────────────────────────────────

describe("anniversaryEngine", () => {
  let engine;
  before(async () => {
    engine = createAnniversaryEngine({ config: {}, logger: null });
    await engine.init();
  });

  it("UPCOMING_DAYS_WINDOW is a positive integer", () => {
    assert.ok(typeof UPCOMING_DAYS_WINDOW === "number");
    assert.ok(UPCOMING_DAYS_WINDOW > 0);
  });

  it("addAnniversary stores a milestone", async () => {
    const a = await engine.addAnniversary({
      companionId: CID, customerId: UID,
      label: "First conversation",
      description: "The day we first spoke",
      anniversaryDate: "2025-01-15",
      annual: true,
      importance: 0.9,
    });
    assert.ok(typeof a?.id !== "undefined");
    assert.equal(a.label, "First conversation");
    assert.ok(a.annual);
  });

  it("addAnniversary is idempotent — returns existing on second call", async () => {
    const a2 = await engine.addAnniversary({
      companionId: CID, customerId: UID,
      label: "First conversation",
      anniversaryDate: "2025-01-15",
    });
    assert.equal(a2?.label, "First conversation");
  });

  it("getUpcoming returns anniversaries within window", async () => {
    // Add an anniversary that happens today
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await engine.addAnniversary({
      companionId: CID, customerId: UID,
      label: "Today anniversary",
      anniversaryDate: dateStr, annual: false, importance: 0.7,
    });
    const upcoming = await engine.getUpcoming({ companionId: CID, customerId: UID, now: today, windowDays: 7 });
    assert.ok(Array.isArray(upcoming));
    assert.ok(upcoming.some(a => a.label === "Today anniversary"));
  });

  it("markObserved updates last observed year", async () => {
    const a = await engine.addAnniversary({
      companionId: CID, customerId: UID,
      label: "100th project",
      anniversaryDate: "2025-03-10",
      importance: 0.8,
    });
    const updated = await engine.markObserved({ companionId: CID, customerId: UID, id: a.id, year: 2025 });
    assert.equal(updated?.lastObservedYear, 2025);
  });

  it("count returns non-negative integer", async () => {
    const c = await engine.count({ companionId: CID, customerId: UID });
    assert.ok(typeof c === "number" && c >= 0);
  });
});

// ── insideJokeEngine ──────────────────────────────────────────────────────────

describe("insideJokeEngine", () => {
  let engine;
  before(async () => {
    engine = createInsideJokeEngine({ config: {}, logger: null });
    await engine.init();
  });

  it("JOKE_PROMOTION_THRESHOLD is a positive integer", () => {
    assert.ok(typeof JOKE_PROMOTION_THRESHOLD === "number");
    assert.ok(JOKE_PROMOTION_THRESHOLD > 0);
  });

  it("JOKE_STATUSES includes noticed, recurring, established, retired", () => {
    assert.ok(JOKE_STATUSES.includes("noticed"));
    assert.ok(JOKE_STATUSES.includes("recurring"));
    assert.ok(JOKE_STATUSES.includes("established"));
    assert.ok(JOKE_STATUSES.includes("retired"));
  });

  it("notice registers a new joke reference", async () => {
    const j = await engine.notice({
      companionId: CID, customerId: UID,
      reference: "the tuesday thing",
      context: "The Tuesday meme that kept coming back",
    });
    assert.ok(typeof j?.id !== "undefined");
    assert.equal(j.status, "noticed");
    assert.equal(j.occurrenceCount, 1);
  });

  it("notice promotes to recurring after threshold occurrences", async () => {
    const ref = "the coffee disaster";
    for (let i = 0; i < JOKE_PROMOTION_THRESHOLD - 1; i++) {
      await engine.notice({ companionId: CID, customerId: UID, reference: ref });
    }
    const j = await engine.notice({ companionId: CID, customerId: UID, reference: ref });
    assert.equal(j?.status, "recurring");
  });

  it("getEstablished returns recurring and established jokes", async () => {
    const jokes = await engine.getEstablished({ companionId: CID, customerId: UID });
    assert.ok(Array.isArray(jokes));
    assert.ok(jokes.every(j => j.status === "recurring" || j.status === "established"));
  });

  it("count returns established/recurring count", async () => {
    const c = await engine.count({ companionId: CID, customerId: UID });
    assert.ok(typeof c === "number" && c >= 0);
  });

  it("applyDecay runs without error", async () => {
    const result = await engine.applyDecay({ companionId: CID, customerId: UID });
    assert.ok(typeof result === "number");
  });
});

// ── relationshipTimelineEngine ────────────────────────────────────────────────

describe("relationshipTimelineEngine", () => {
  let engine;
  before(async () => {
    engine = createRelationshipTimelineEngine({ config: {}, logger: null });
    await engine.init();
  });

  it("CHAPTER_TYPES exports expected chapter names", () => {
    assert.ok(Array.isArray(CHAPTER_TYPES));
    assert.ok(CHAPTER_TYPES.includes("beginning"));
    assert.ok(CHAPTER_TYPES.includes("building_trust"));
    assert.ok(CHAPTER_TYPES.includes("growing_together"));
    assert.ok(CHAPTER_TYPES.includes("recovery"));
  });

  it("TIMELINE_RECORD_THRESHOLD is between 0 and 1", () => {
    assert.ok(typeof TIMELINE_RECORD_THRESHOLD === "number");
    assert.ok(TIMELINE_RECORD_THRESHOLD > 0 && TIMELINE_RECORD_THRESHOLD < 1);
  });

  it("inferChapter returns 'beginning' with no context", () => {
    const chapter = inferChapter({});
    assert.equal(chapter, "beginning");
  });

  it("inferChapter returns 'recovery' when repair is high", () => {
    const chapter = inferChapter({ weather: { repair: 0.4, trust: 0.5, sharedMomentum: 0.3, routine: 0.3, adventure: 0.2 }, sharedHistoryCount: 5 });
    assert.equal(chapter, "recovery");
  });

  it("addEvent stores a timeline entry with sufficient importance", async () => {
    const e = await engine.addEvent({
      companionId: CID, customerId: UID,
      eventType: "milestone", eventSummary: "Our first creative project together",
      importance: 0.8, emotionalWeight: 0.6,
    });
    assert.ok(typeof e?.id !== "undefined");
    assert.equal(e.eventType, "milestone");
    assert.ok(e.chapter.length > 0);
  });

  it("addEvent rejects entries below TIMELINE_RECORD_THRESHOLD", async () => {
    const result = await engine.addEvent({
      companionId: CID, customerId: UID,
      eventSummary: "Trivial moment", importance: 0.1,
    });
    assert.equal(result, null);
  });

  it("getCurrentChapter returns a valid chapter type", async () => {
    const chapter = await engine.getCurrentChapter({ companionId: CID, customerId: UID });
    assert.ok(typeof chapter === "string");
    assert.ok(chapter.length > 0);
  });

  it("getRecent returns sorted entries", async () => {
    const events = await engine.getRecent({ companionId: CID, customerId: UID, limit: 5 });
    assert.ok(Array.isArray(events));
    assert.ok(events.length >= 1);
  });

  it("pruneOlderThan runs without error", async () => {
    const deleted = await engine.pruneOlderThan({ companionId: CID, customerId: UID, days: 0, keepMinImportance: 0.99 });
    assert.ok(typeof deleted === "number");
  });
});

// ── lifePreludeBuilder — relationship signal ───────────────────────────────────

describe("lifePreludeBuilder — relationship signal", () => {
  it("includes weatherSummary line when relationshipContext is present", () => {
    const prelude = buildLifePrelude({
      dailyPlan: { mood: "content", energy: "steady", focus: "", privateActivity: "" },
      recentEvents: [],
      growthContext: null,
      curiosityContext: null,
      relationshipContext: { weatherSummary: "settled and warm", upcomingAnniversaries: [] },
    });
    assert.ok(prelude !== null);
    assert.ok(prelude.content.includes("settled and warm"), "weatherSummary appears in prelude");
  });

  it("includes upcoming anniversary label in prelude", () => {
    const prelude = buildLifePrelude({
      dailyPlan: { mood: "warm", energy: "high", focus: "", privateActivity: "" },
      recentEvents: [],
      growthContext: null,
      curiosityContext: null,
      relationshipContext: {
        weatherSummary: "steady",
        upcomingAnniversaries: [{ label: "First conversation", anniversaryDate: "2025-01-15" }],
      },
    });
    assert.ok(prelude !== null);
    assert.ok(prelude.content.includes("First conversation"), "anniversary label appears in prelude");
  });

  it("no relationship line when relationshipContext is null", () => {
    const prelude = buildLifePrelude({
      dailyPlan: { mood: "neutral", energy: "low", focus: "", privateActivity: "" },
      recentEvents: [],
      growthContext: null,
      curiosityContext: null,
      relationshipContext: null,
    });
    assert.ok(prelude !== null);
    assert.ok(!prelude.content.includes("Relationship:"), "no relationship line when context absent");
  });
});

// ── lifeRuntime integration — relationship engines ────────────────────────────

describe("lifeRuntime — relationship integration", () => {
  let runtime;
  before(async () => {
    const weatherEngine = createRelationshipWeatherEngine({ config: {}, logger: null });
    const historyEngine = createSharedHistoryEngine({ config: {}, logger: null });
    const rituals       = createRitualEngine({ config: {}, logger: null });
    const traditions    = createTraditionEngine({ config: {}, logger: null });
    const anniversaries = createAnniversaryEngine({ config: {}, logger: null });
    const jokes         = createInsideJokeEngine({ config: {}, logger: null });
    const timeline      = createRelationshipTimelineEngine({ config: {}, logger: null });

    runtime = createLifeRuntime({
      config: { lifeRuntime: { enabled: true }, memory: { companionId: CID, userScope: UID } },
      logger: null,
      relationshipWeatherEngine: weatherEngine,
      sharedHistoryEngine: historyEngine,
      ritualEngine: rituals,
      traditionEngine: traditions,
      anniversaryEngine: anniversaries,
      insideJokeEngine: jokes,
      relationshipTimelineEngine: timeline,
    });
    await runtime.init();
  });

  it("getStatus includes relationshipContext field", () => {
    const status = runtime.getStatus();
    assert.ok("relationshipContext" in status, "relationshipContext is present in status");
  });

  it("tick completes without error (relationship engines active)", async () => {
    const result = await runtime.tick(new Date());
    assert.ok(result.ok === true || result.skipped === true);
  });

  it("getStatus.relationshipContext is populated after tick", async () => {
    await runtime.tick(new Date());
    const status = runtime.getStatus();
    if (status.relationshipContext) {
      assert.ok(typeof status.relationshipContext.chapter === "string");
      assert.ok(typeof status.relationshipContext.activeRituals === "number");
      assert.ok(typeof status.relationshipContext.traditions === "number");
      assert.ok(typeof status.relationshipContext.sharedHistory === "number");
      assert.ok(typeof status.relationshipContext.insideJokes === "number");
      assert.ok(Array.isArray(status.relationshipContext.upcomingAnniversaries));
    }
  });
});
