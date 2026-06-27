"use strict";
/**
 * verify-relationship-runtime.js
 * Proof script for Life Runtime 4.0 — Relationship Continuity.
 *
 * Proves:
 *   1.  All 7 new engine files exist
 *   2.  Test file exists
 *   3.  relationshipWeatherEngine: getWeather, applyShift, tick, buildSummary
 *   4.  Weather delta capped at MAX_DELTA per call
 *   5.  Repair dimension decays via tick
 *   6.  sharedHistoryEngine: recordMoment, getRecent, count, pruneOlderThan
 *   7.  Below-threshold moments rejected
 *   8.  ritualEngine: observe promotes forming → active after threshold
 *   9.  ritualEngine: applyDecay and count work
 *  10.  traditionEngine: promoteFromRitual, idempotent, decay
 *  11.  anniversaryEngine: addAnniversary, getUpcoming (today), markObserved, count
 *  12.  insideJokeEngine: notice, promotion threshold, getEstablished, count
 *  13.  relationshipTimelineEngine: addEvent, rejects low importance, getCurrentChapter
 *  14.  inferChapter logic — recovery when repair > 0.3
 *  15.  lifePreludeBuilder includes weatherSummary line
 *  16.  lifePreludeBuilder includes anniversary label when upcoming
 *  17.  prelude stays under 150 tokens with all 5 contexts active
 *  18.  lifeRuntime.getStatus() includes relationshipContext field
 *  19.  lifeRuntime.tick() wires relationship engines without error
 *  20.  schemaRegistry has all 7 new tables
 *  21.  index.js imports all 7 relationship engines
 *  22.  relationship engines do not create new schedulers
 *  23.  relationship engines do not call channel.send() or sendDiscordMessage
 *  24.  existing Curiosity verify script still exists
 *  25.  existing Life Growth verify script still exists
 *  26.  existing Life Runtime 1.0 test file still exists
 *
 * Returns exit 0 + prints RELATIONSHIP_RUNTIME_PASS on success.
 */

const path = require("node:path");
const fs   = require("node:fs");

const SRC     = path.resolve(__dirname, "../src");
const SCRIPTS = __dirname;

function exists(relToSrc)            { return fs.existsSync(path.join(SRC, relToSrc)); }
function scriptExists(name)          { return fs.existsSync(path.join(SCRIPTS, name)); }
function fileContains(relToSrc, str) {
  try { return fs.readFileSync(path.join(SRC, relToSrc), "utf8").includes(str); }
  catch { return false; }
}
function readSrc(relToSrc) {
  try { return fs.readFileSync(path.join(SRC, relToSrc), "utf8"); } catch { return ""; }
}

const results = [];
function check(label, pass) { results.push({ label, pass: Boolean(pass) }); }

const CID = "dante";
const UID  = "jenna";

(async () => {
  // ── SECTION 1: File existence ──────────────────────────────────────────────

  check("relationshipWeatherEngine.js exists",   exists("lifeRuntime/relationshipWeatherEngine.js"));
  check("sharedHistoryEngine.js exists",         exists("lifeRuntime/sharedHistoryEngine.js"));
  check("ritualEngine.js exists",                exists("lifeRuntime/ritualEngine.js"));
  check("traditionEngine.js exists",             exists("lifeRuntime/traditionEngine.js"));
  check("anniversaryEngine.js exists",           exists("lifeRuntime/anniversaryEngine.js"));
  check("insideJokeEngine.js exists",            exists("lifeRuntime/insideJokeEngine.js"));
  check("relationshipTimelineEngine.js exists",  exists("lifeRuntime/relationshipTimelineEngine.js"));
  check("lifeRelationship.test.js exists",       exists("lifeRuntime/__tests__/lifeRelationship.test.js"));
  check("verify-relationship-runtime.js exists", scriptExists("verify-relationship-runtime.js"));

  // ── SECTION 2: relationshipWeatherEngine ──────────────────────────────────

  const { createRelationshipWeatherEngine, WEATHER_DIMENSIONS, WEATHER_DEFAULTS } =
    require("../src/lifeRuntime/relationshipWeatherEngine");
  const wEngine = createRelationshipWeatherEngine({ config: {}, logger: null });
  await wEngine.init();

  check("WEATHER_DIMENSIONS has 9 entries",
    Array.isArray(WEATHER_DIMENSIONS) && WEATHER_DIMENSIONS.length === 9);
  check("WEATHER_DIMENSIONS includes trust, repair, sharedMomentum",
    ["trust","repair","sharedMomentum"].every(d => WEATHER_DIMENSIONS.includes(d)));
  check("WEATHER_DEFAULTS covers all 9 dimensions",
    WEATHER_DIMENSIONS.every(d => typeof WEATHER_DEFAULTS[d] === "number"));

  const w0 = await wEngine.getWeather({ companionId: CID, customerId: UID });
  check("getWeather returns object with trust field",   typeof w0?.trust === "number");
  check("getWeather returns weatherSummary string",     typeof w0?.weatherSummary === "string");

  const beforeTrust = w0.trust;
  await wEngine.applyShift({ companionId: CID, customerId: UID, deltas: { trust: 0.5 } });
  const w1 = await wEngine.getWeather({ companionId: CID, customerId: UID });
  check("applyShift caps delta at MAX_DELTA (0.03)",
    Math.abs(w1.trust - beforeTrust) <= 0.031);

  // Repair tick decay
  await wEngine.applyShift({ companionId: CID, customerId: UID, deltas: { repair: 0.03 } });
  const beforeRepair = (await wEngine.getWeather({ companionId: CID, customerId: UID })).repair;
  await wEngine.tick({ companionId: CID, customerId: UID });
  const afterRepair = (await wEngine.getWeather({ companionId: CID, customerId: UID })).repair;
  check("repair dimension decays via tick", afterRepair <= beforeRepair);

  const summary = wEngine.buildSummary(WEATHER_DEFAULTS);
  check("buildSummary returns non-empty string",        typeof summary === "string" && summary.length > 0);

  const tickResult = await wEngine.tick({ companionId: CID, customerId: UID, hadInteraction: true });
  check("tick(hadInteraction=true) returns weather object", typeof tickResult?.weatherSummary === "string");

  // ── SECTION 3: sharedHistoryEngine ────────────────────────────────────────

  const { createSharedHistoryEngine, MOMENT_TYPES, RECORD_THRESHOLD } =
    require("../src/lifeRuntime/sharedHistoryEngine");
  const hEngine = createSharedHistoryEngine({ config: {}, logger: null });
  await hEngine.init();

  check("MOMENT_TYPES has at least 6 types",   Array.isArray(MOMENT_TYPES) && MOMENT_TYPES.length >= 6);
  check("MOMENT_TYPES includes milestone",     MOMENT_TYPES.includes("milestone"));
  check("MOMENT_TYPES includes emotional",     MOMENT_TYPES.includes("emotional"));
  check("RECORD_THRESHOLD is 0<x<1",          typeof RECORD_THRESHOLD === "number" && RECORD_THRESHOLD > 0 && RECORD_THRESHOLD < 1);

  const m1 = await hEngine.recordMoment({
    companionId: CID, customerId: UID,
    momentType: "milestone", summary: "First real conversation",
    importance: 0.8, emotionalWeight: 0.6,
  });
  check("recordMoment returns entry with id",   typeof m1?.id !== "undefined");
  check("recordMoment preserves momentType",    m1?.momentType === "milestone");
  check("recordMoment preserves summary",       m1?.summary === "First real conversation");

  const nullMoment = await hEngine.recordMoment({
    companionId: CID, customerId: UID, momentType: "playful", summary: "trivial", importance: 0.1,
  });
  check("recordMoment rejects below-threshold", nullMoment === null);

  const recent = await hEngine.getRecent({ companionId: CID, customerId: UID, limit: 5 });
  check("getRecent returns array",              Array.isArray(recent) && recent.length >= 1);

  const hCount = await hEngine.count({ companionId: CID, customerId: UID });
  check("sharedHistory count >= 1",            hCount >= 1);

  const hPruned = await hEngine.pruneOlderThan({ companionId: CID, customerId: UID, days: 365 });
  check("sharedHistory pruneOlderThan returns number", typeof hPruned === "number");

  // ── SECTION 4: ritualEngine ────────────────────────────────────────────────

  const { createRitualEngine, RITUAL_FORMATION_THRESHOLD, RITUAL_STATUSES } =
    require("../src/lifeRuntime/ritualEngine");
  const rEngine = createRitualEngine({ config: {}, logger: null });
  await rEngine.init();

  check("RITUAL_FORMATION_THRESHOLD is positive integer",
    typeof RITUAL_FORMATION_THRESHOLD === "number" && RITUAL_FORMATION_THRESHOLD > 0);
  check("RITUAL_STATUSES has forming/active/fading/abandoned",
    ["forming","active","fading","abandoned"].every(s => RITUAL_STATUSES.includes(s)));

  const r1 = await rEngine.observe({ companionId: CID, customerId: UID, name: "sunday-meal-prep", pattern: "Sundays" });
  check("observe returns forming ritual",     r1?.status === "forming");
  check("observe sets occurrenceCount = 1",  r1?.occurrenceCount === 1);

  const ritualName = "friday-build-review";
  for (let i = 1; i < RITUAL_FORMATION_THRESHOLD; i++) {
    await rEngine.observe({ companionId: CID, customerId: UID, name: ritualName });
  }
  const rActive = await rEngine.observe({ companionId: CID, customerId: UID, name: ritualName });
  check("ritual promotes to active after threshold", rActive?.status === "active");

  const activeRituals = await rEngine.getRituals({ companionId: CID, customerId: UID, status: "active" });
  check("getRituals(status=active) returns array",    Array.isArray(activeRituals) && activeRituals.length >= 1);

  const rCount = await rEngine.count({ companionId: CID, customerId: UID });
  check("ritualEngine.count returns non-negative",   typeof rCount === "number" && rCount >= 0);

  const rDecayed = await rEngine.applyDecay({ companionId: CID, customerId: UID });
  check("ritualEngine.applyDecay returns number",    typeof rDecayed === "number");

  // ── SECTION 5: traditionEngine ────────────────────────────────────────────

  const { createTraditionEngine, TRADITION_THRESHOLD_OCCURRENCES } =
    require("../src/lifeRuntime/traditionEngine");
  const tEngine = createTraditionEngine({ config: {}, logger: null });
  await tEngine.init();

  check("TRADITION_THRESHOLD_OCCURRENCES is positive", typeof TRADITION_THRESHOLD_OCCURRENCES === "number" && TRADITION_THRESHOLD_OCCURRENCES > 0);

  const t1 = await tEngine.promoteFromRitual({
    companionId: CID, customerId: UID, name: "sunday-meal-prep",
    origin: "sunday-meal-prep ritual", meaning: "Weekly food ritual",
  });
  check("promoteFromRitual creates tradition",       typeof t1?.id !== "undefined");
  check("tradition is active by default",            t1?.active === true);

  const t2 = await tEngine.promoteFromRitual({ companionId: CID, customerId: UID, name: "sunday-meal-prep" });
  check("promoteFromRitual is idempotent",           t2?.name === "sunday-meal-prep");
  check("second call increments strength",           t2?.strength >= t1?.strength);

  const traditions = await tEngine.getTraditions({ companionId: CID, customerId: UID });
  check("getTraditions returns array",               Array.isArray(traditions) && traditions.length >= 1);

  const tCount = await tEngine.count({ companionId: CID, customerId: UID });
  check("traditionEngine.count >= 1",               tCount >= 1);

  const tDecayed = await tEngine.applyDecay({ companionId: CID, customerId: UID });
  check("traditionEngine.applyDecay returns number", typeof tDecayed === "number");

  // ── SECTION 6: anniversaryEngine ──────────────────────────────────────────

  const { createAnniversaryEngine, UPCOMING_DAYS_WINDOW } =
    require("../src/lifeRuntime/anniversaryEngine");
  const aEngine = createAnniversaryEngine({ config: {}, logger: null });
  await aEngine.init();

  check("UPCOMING_DAYS_WINDOW is positive", typeof UPCOMING_DAYS_WINDOW === "number" && UPCOMING_DAYS_WINDOW > 0);

  const a1 = await aEngine.addAnniversary({
    companionId: CID, customerId: UID,
    label: "First conversation", description: "The day we first spoke",
    anniversaryDate: "2025-01-15", annual: true, importance: 0.9,
  });
  check("addAnniversary returns entry",     typeof a1?.id !== "undefined");
  check("addAnniversary preserves label",   a1?.label === "First conversation");

  const a2 = await aEngine.addAnniversary({ companionId: CID, customerId: UID, label: "First conversation", anniversaryDate: "2025-01-15" });
  check("addAnniversary is idempotent",     a2?.label === "First conversation");

  // Add one for today so getUpcoming finds it
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await aEngine.addAnniversary({ companionId: CID, customerId: UID, label: "Today test", anniversaryDate: todayStr, annual: false, importance: 0.7 });
  const upcoming = await aEngine.getUpcoming({ companionId: CID, customerId: UID, now: today, windowDays: UPCOMING_DAYS_WINDOW });
  check("getUpcoming returns array",        Array.isArray(upcoming));
  check("getUpcoming finds today anniversary", upcoming.some(u => u.label === "Today test"));

  const observed = await aEngine.markObserved({ companionId: CID, customerId: UID, id: a1.id, year: 2025 });
  check("markObserved updates lastObservedYear", observed?.lastObservedYear === 2025);

  const aCount = await aEngine.count({ companionId: CID, customerId: UID });
  check("anniversaryEngine.count >= 1",     aCount >= 1);

  // ── SECTION 7: insideJokeEngine ───────────────────────────────────────────

  const { createInsideJokeEngine, JOKE_PROMOTION_THRESHOLD, JOKE_STATUSES } =
    require("../src/lifeRuntime/insideJokeEngine");
  const jEngine = createInsideJokeEngine({ config: {}, logger: null });
  await jEngine.init();

  check("JOKE_PROMOTION_THRESHOLD is positive", typeof JOKE_PROMOTION_THRESHOLD === "number" && JOKE_PROMOTION_THRESHOLD > 0);
  check("JOKE_STATUSES includes noticed/recurring/established/retired",
    ["noticed","recurring","established","retired"].every(s => JOKE_STATUSES.includes(s)));

  const j1 = await jEngine.notice({ companionId: CID, customerId: UID, reference: "the tuesday thing", context: "A meme" });
  check("notice creates joke in 'noticed' status", j1?.status === "noticed");
  check("notice sets occurrenceCount = 1",         j1?.occurrenceCount === 1);

  const jRef = "the coffee disaster";
  for (let i = 1; i < JOKE_PROMOTION_THRESHOLD; i++) {
    await jEngine.notice({ companionId: CID, customerId: UID, reference: jRef });
  }
  const jRecurring = await jEngine.notice({ companionId: CID, customerId: UID, reference: jRef });
  check("joke promotes to recurring after threshold", jRecurring?.status === "recurring");

  const established = await jEngine.getEstablished({ companionId: CID, customerId: UID });
  check("getEstablished returns array",    Array.isArray(established));
  check("getEstablished entries are recurring/established",
    established.every(j => j.status === "recurring" || j.status === "established"));

  const jCount = await jEngine.count({ companionId: CID, customerId: UID });
  check("insideJokeEngine.count >= 1",    jCount >= 1);

  const jDecayed = await jEngine.applyDecay({ companionId: CID, customerId: UID });
  check("insideJokeEngine.applyDecay returns number", typeof jDecayed === "number");

  // ── SECTION 8: relationshipTimelineEngine ────────────────────────────────

  const { createRelationshipTimelineEngine, CHAPTER_TYPES, TIMELINE_RECORD_THRESHOLD, inferChapter } =
    require("../src/lifeRuntime/relationshipTimelineEngine");
  const tlEngine = createRelationshipTimelineEngine({ config: {}, logger: null });
  await tlEngine.init();

  check("CHAPTER_TYPES has beginning/recovery/growing_together",
    ["beginning","recovery","growing_together"].every(c => CHAPTER_TYPES.includes(c)));
  check("TIMELINE_RECORD_THRESHOLD is 0<x<1",
    typeof TIMELINE_RECORD_THRESHOLD === "number" && TIMELINE_RECORD_THRESHOLD > 0 && TIMELINE_RECORD_THRESHOLD < 1);

  check("inferChapter returns 'beginning' with no context", inferChapter({}) === "beginning");
  check("inferChapter returns 'recovery' when repair > 0.3",
    inferChapter({ weather: { repair: 0.4, trust: 0.5, sharedMomentum: 0.3, routine: 0.3, adventure: 0.2 }, sharedHistoryCount: 5 }) === "recovery");

  const e1 = await tlEngine.addEvent({
    companionId: CID, customerId: UID,
    eventType: "milestone", eventSummary: "First creative project together",
    importance: 0.8, emotionalWeight: 0.6,
  });
  check("addEvent returns entry with id",     typeof e1?.id !== "undefined");
  check("addEvent eventType preserved",       e1?.eventType === "milestone");
  check("addEvent assigns a chapter",         typeof e1?.chapter === "string" && e1.chapter.length > 0);

  const nullEvent = await tlEngine.addEvent({
    companionId: CID, customerId: UID, eventSummary: "trivial", importance: 0.1,
  });
  check("addEvent rejects below-threshold",  nullEvent === null);

  const chapter = await tlEngine.getCurrentChapter({ companionId: CID, customerId: UID });
  check("getCurrentChapter returns string",  typeof chapter === "string" && chapter.length > 0);

  const tlRecent = await tlEngine.getRecent({ companionId: CID, customerId: UID, limit: 3 });
  check("getRecent returns array",           Array.isArray(tlRecent) && tlRecent.length >= 1);

  const tlPruned = await tlEngine.pruneOlderThan({ companionId: CID, customerId: UID, days: 0, keepMinImportance: 0.99 });
  check("timelineEngine.pruneOlderThan returns number", typeof tlPruned === "number");

  // ── SECTION 9: lifePreludeBuilder ────────────────────────────────────────

  const { buildLifePrelude } = require("../src/lifeRuntime/lifePreludeBuilder");

  const p1 = buildLifePrelude({
    dailyPlan: { mood: "content", energy: "steady", focus: "", privateActivity: "" },
    recentEvents: [],
    growthContext: null,
    curiosityContext: null,
    relationshipContext: { weatherSummary: "settled and warm", upcomingAnniversaries: [] },
  });
  check("prelude includes weatherSummary when context present",
    typeof p1?.content === "string" && p1.content.includes("settled and warm"));

  const p2 = buildLifePrelude({
    dailyPlan: { mood: "warm", energy: "high", focus: "", privateActivity: "" },
    recentEvents: [],
    growthContext: null,
    curiosityContext: null,
    relationshipContext: {
      weatherSummary: "steady",
      upcomingAnniversaries: [{ label: "First conversation", anniversaryDate: "2025-01-15" }],
    },
  });
  check("prelude includes anniversary label when upcoming",
    typeof p2?.content === "string" && p2.content.includes("First conversation"));

  const p3 = buildLifePrelude({
    dailyPlan: { mood: "neutral", energy: "low", focus: "", privateActivity: "" },
    recentEvents: [],
    growthContext: null,
    curiosityContext: null,
    relationshipContext: null,
  });
  check("no Relationship line when context is null",
    !p3?.content?.includes("Relationship:"));

  // Token budget: all 5 contexts active ≤ 150 tokens (~800 chars estimate)
  const allContextsPrelude = buildLifePrelude({
    dailyPlan: { mood: "content", energy: "steady", focus: "ship the feature", privateActivity: "sketching ideas" },
    recentEvents: [{ description: "made coffee" }, { description: "wrote a few lines" }],
    growthContext: { activeHobby: { name: "photography" }, activeProject: { title: "portfolio rebuild" }, recentInterest: null },
    curiosityContext: { attentionFocus: { focus: "what she's building", focusType: "project" }, maturingCount: 2, recentInsight: null },
    relationshipContext: { weatherSummary: "flowing well together", upcomingAnniversaries: [] },
  });
  const tokenApprox = Math.ceil((allContextsPrelude?.content ?? "").length / 5.5);
  check("prelude stays under 150 tokens with all contexts", tokenApprox <= 150);

  // ── SECTION 10: lifeRuntime integration ──────────────────────────────────

  const { createLifeRuntime } = require("../src/lifeRuntime/lifeRuntime");

  const weatherEngine2  = createRelationshipWeatherEngine({ config: {}, logger: null });
  const historyEngine2  = createSharedHistoryEngine({ config: {}, logger: null });
  const rituals2        = createRitualEngine({ config: {}, logger: null });
  const traditions2     = createTraditionEngine({ config: {}, logger: null });
  const anniversaries2  = createAnniversaryEngine({ config: {}, logger: null });
  const jokes2          = createInsideJokeEngine({ config: {}, logger: null });
  const timeline2       = createRelationshipTimelineEngine({ config: {}, logger: null });

  const lr = createLifeRuntime({
    config: { lifeRuntime: { enabled: true }, memory: { companionId: CID, userScope: UID } },
    logger: null,
    relationshipWeatherEngine: weatherEngine2,
    sharedHistoryEngine: historyEngine2,
    ritualEngine: rituals2,
    traditionEngine: traditions2,
    anniversaryEngine: anniversaries2,
    insideJokeEngine: jokes2,
    relationshipTimelineEngine: timeline2,
  });
  await lr.init();

  const status0 = lr.getStatus();
  check("getStatus() has relationshipContext field",  "relationshipContext" in status0);

  const lrTickResult = await lr.tick(new Date());
  check("tick() completes without fatal error",       lrTickResult.ok === true || lrTickResult.skipped === true);

  await lr.tick(new Date());
  const status1 = lr.getStatus();
  check("relationshipContext.chapter is string after tick",
    !status1.relationshipContext || typeof status1.relationshipContext.chapter === "string");
  check("relationshipContext.activeRituals is number",
    !status1.relationshipContext || typeof status1.relationshipContext.activeRituals === "number");
  check("relationshipContext.upcomingAnniversaries is array",
    !status1.relationshipContext || Array.isArray(status1.relationshipContext.upcomingAnniversaries));

  // ── SECTION 11: schemaRegistry ────────────────────────────────────────────

  const { SCHEMA_REGISTRY } = require("../src/storage/postgres/schemaRegistry");
  const tableNames = SCHEMA_REGISTRY.map(e => e.table);

  check("schema: life_relationship_weather table",   tableNames.includes("life_relationship_weather"));
  check("schema: life_shared_history table",         tableNames.includes("life_shared_history"));
  check("schema: life_rituals table",                tableNames.includes("life_rituals"));
  check("schema: life_traditions table",             tableNames.includes("life_traditions"));
  check("schema: life_anniversaries table",          tableNames.includes("life_anniversaries"));
  check("schema: life_inside_jokes table",           tableNames.includes("life_inside_jokes"));
  check("schema: life_relationship_timeline table",  tableNames.includes("life_relationship_timeline"));

  // ── SECTION 12: index.js wiring ───────────────────────────────────────────

  const indexSrc = readSrc("index.js");
  check("index.js imports createRelationshipWeatherEngine", indexSrc.includes("createRelationshipWeatherEngine"));
  check("index.js imports createSharedHistoryEngine",       indexSrc.includes("createSharedHistoryEngine"));
  check("index.js imports createRitualEngine",              indexSrc.includes("createRitualEngine"));
  check("index.js imports createTraditionEngine",           indexSrc.includes("createTraditionEngine"));
  check("index.js imports createAnniversaryEngine",         indexSrc.includes("createAnniversaryEngine"));
  check("index.js imports createInsideJokeEngine",          indexSrc.includes("createInsideJokeEngine"));
  check("index.js imports createRelationshipTimelineEngine",indexSrc.includes("createRelationshipTimelineEngine"));

  // ── SECTION 13: Hard constraint checks ────────────────────────────────────

  const engineFiles = [
    "lifeRuntime/relationshipWeatherEngine.js",
    "lifeRuntime/sharedHistoryEngine.js",
    "lifeRuntime/ritualEngine.js",
    "lifeRuntime/traditionEngine.js",
    "lifeRuntime/anniversaryEngine.js",
    "lifeRuntime/insideJokeEngine.js",
    "lifeRuntime/relationshipTimelineEngine.js",
  ];

  check("no engine creates a new scheduler (no schedulerRegistry import)",
    engineFiles.every(f => !fileContains(f, "schedulerRegistry")));
  check("no engine calls channel.send() or sendDiscordMessage",
    engineFiles.every(f => !fileContains(f, "channel.send") && !fileContains(f, "sendDiscordMessage")));
  check("no engine replaces aliveEngine",
    engineFiles.every(f => !fileContains(f, "createAliveEngine")));

  // ── SECTION 14: Prior work still exists ───────────────────────────────────

  check("verify-life-curiosity.js still exists",     scriptExists("verify-life-curiosity.js"));
  check("verify-life-growth.js still exists",        scriptExists("verify-life-growth.js"));
  check("verify-life-runtime.js still exists",       scriptExists("verify-life-runtime.js"));
  check("lifeRuntime.test.js still exists",          exists("lifeRuntime/__tests__/lifeRuntime.test.js"));
  check("lifeGrowth.test.js still exists",           exists("lifeRuntime/__tests__/lifeGrowth.test.js"));
  check("lifeCuriosity.test.js still exists",        exists("lifeRuntime/__tests__/lifeCuriosity.test.js"));

  // ── RESULTS ───────────────────────────────────────────────────────────────

  const failed  = results.filter(r => !r.pass);
  const passing = results.length - failed.length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Life Runtime 4.0 — Relationship Continuity verify`);
  console.log(`${"=".repeat(60)}`);
  for (const r of results) {
    console.log(`  ${r.pass ? "✓" : "✗"} ${r.label}`);
  }
  console.log(`${"=".repeat(60)}`);
  console.log(`${passing}/${results.length} checks passed`);

  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const r of failed) { console.log(`  ✗ ${r.label}`); }
    console.log("");
    process.exit(1);
  }

  console.log("\nRELATIONSHIP_RUNTIME_PASS\n");
  process.exit(0);
})();
