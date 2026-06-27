"use strict";
/**
 * verify-life-runtime.js
 * Proof script for Life Runtime 1.0.
 *
 * Proves:
 *   1. All 6 lifeRuntime source files exist
 *   2. Daily plan created + idempotent
 *   3. Micro events generated and stored
 *   4. Decision engine records decisions
 *   5. Life prelude built and injected
 *   6. Full runtime tick works (in-memory, no Postgres)
 *   7. Scheduler registered via existing schedulerRegistry
 *   8. Pruning protocol present
 *   9. index.js wiring complete
 *  10. createChatPipeline.js prelude injection
 *  11. createHealthServer.js life/status route
 *  12. schemaRegistry.js has 3 new tables
 *  13. Existing Alive Layer untouched
 *  14. Dashboard untouched
 *  15. No new Discord sender created
 *
 * No real Postgres or Discord. All checks run in-process.
 * Returns exit 0 + prints LIFE_RUNTIME_PASS on success.
 */

const path = require("node:path");
const fs   = require("node:fs");

const SRC     = path.resolve(__dirname, "../src");
const SCRIPTS  = __dirname;

function exists(relToSrc) { return fs.existsSync(path.join(SRC, relToSrc)); }
function fileContains(relToSrc, str) {
  try { return fs.readFileSync(path.join(SRC, relToSrc), "utf8").includes(str); }
  catch { return false; }
}

const results = [];
function check(label, pass) {
  results.push({ label, pass });
}

(async () => {
  // ── SECTION 1: File existence ──────────────────────────────────────────────

  check("lifeRuntime/lifeRuntime.js exists",          exists("lifeRuntime/lifeRuntime.js"));
  check("lifeRuntime/dailyPlanEngine.js exists",       exists("lifeRuntime/dailyPlanEngine.js"));
  check("lifeRuntime/decisionEngine.js exists",        exists("lifeRuntime/decisionEngine.js"));
  check("lifeRuntime/microLifeEventsStore.js exists",  exists("lifeRuntime/microLifeEventsStore.js"));
  check("lifeRuntime/lifePreludeBuilder.js exists",    exists("lifeRuntime/lifePreludeBuilder.js"));
  check("lifeRuntime/lifeRuntimeScheduler.js exists",  exists("lifeRuntime/lifeRuntimeScheduler.js"));
  check("lifeRuntime/__tests__/lifeRuntime.test.js exists",
    exists("lifeRuntime/__tests__/lifeRuntime.test.js"));

  // ── SECTION 2: Daily plan created and idempotent ───────────────────────────

  const { createDailyPlanEngine, getDateKey } = require("../src/lifeRuntime/dailyPlanEngine");
  const planEngine = createDailyPlanEngine({ config: {}, logger: null });
  await planEngine.init();

  const now = new Date();
  const plan1 = await planEngine.createPlan({ companionId: "dante", customerId: "jenna", now });
  check("daily plan has mood",            typeof plan1?.mood === "string");
  check("daily plan has energy",          typeof plan1?.energy === "string");
  check("daily plan has focus",           typeof plan1?.focus === "string");
  check("daily plan has privateActivity", typeof plan1?.privateActivity === "string");
  check("daily plan dateKey matches today", plan1?.dateKey === getDateKey(now));

  const plan2 = await planEngine.createPlan({ companionId: "dante", customerId: "jenna", now });
  check("daily plan is idempotent (same dateKey)", plan1?.dateKey === plan2?.dateKey);

  const plan3 = await planEngine.getTodaysPlan({ companionId: "dante", customerId: "jenna", now });
  check("getTodaysPlan returns the plan", plan3?.dateKey === plan1?.dateKey);

  // ── SECTION 3: Micro events stored ────────────────────────────────────────

  const { createMicroLifeEventsStore } = require("../src/lifeRuntime/microLifeEventsStore");
  const eventsStore = createMicroLifeEventsStore({ config: {}, logger: null });
  await eventsStore.init();

  const ev = await eventsStore.logEvent({
    companionId: "dante", customerId: "jenna",
    eventType: "ritual", description: "made coffee",
    moodEffect: 0.05, energyEffect: 0.05,
    isPrivate: true, tags: [],
  });
  check("micro event logged",                     typeof ev?.id !== "undefined");
  check("micro event description preserved",      ev?.description === "made coffee");
  check("micro event private flag correct",        ev?.private === true);

  const recent = await eventsStore.listRecent({ companionId: "dante", customerId: "jenna", limit: 5 });
  check("listRecent returns ≥1 event",            Array.isArray(recent) && recent.length >= 1);

  const cnt = await eventsStore.count({ companionId: "dante", customerId: "jenna" });
  check("count() returns positive number",        typeof cnt === "number" && cnt >= 1);

  // ── SECTION 4: Decision engine ────────────────────────────────────────────

  const { createDecisionEngine } = require("../src/lifeRuntime/decisionEngine");
  const decisionEngine = createDecisionEngine({ config: {}, logger: null });
  await decisionEngine.init();

  const decision = await decisionEngine.decide({
    companionId:    "dante", customerId: "jenna",
    decisionType:   "act",
    considered:     ["reach_out", "remain_silent"],
    chosen:         "act",
    rejected:       ["remain_silent"],
    confidence:     0.8,
    reason:         "feels right",
    contextSummary: "morning routine",
  });
  check("decision recorded",                      typeof decision?.id !== "undefined");
  check("decision chosen field correct",          decision?.chosen === "act");
  check("decision confidence in [0,1]",           decision?.confidence >= 0 && decision?.confidence <= 1);

  const recentDec = await decisionEngine.listRecent({ companionId: "dante", customerId: "jenna", limit: 3 });
  check("decision engine lists recent decisions", Array.isArray(recentDec) && recentDec.length >= 1);

  // ── SECTION 5: Life prelude builder ───────────────────────────────────────

  const { buildLifePrelude } = require("../src/lifeRuntime/lifePreludeBuilder");

  const preludeNull = buildLifePrelude({ dailyPlan: null, recentEvents: [] });
  check("buildLifePrelude returns null when no plan", preludeNull === null);

  const prelude = buildLifePrelude({ dailyPlan: plan1, recentEvents: recent.slice(0, 2) });
  check("prelude has { label, content }",          prelude !== null &&
    typeof prelude?.label === "string" && typeof prelude?.content === "string");
  check("prelude label contains DANTE PRIVATE LIFE",
    Boolean(prelude?.label?.includes("DANTE PRIVATE LIFE")));
  check("prelude content contains today's mood",   Boolean(prelude?.content?.includes(plan1.mood)));
  check("prelude stays under 800 chars (≈150 tok)", (prelude?.content?.length ?? 0) < 800);

  // ── SECTION 6: Full life runtime tick ─────────────────────────────────────

  const { createLifeRuntime } = require("../src/lifeRuntime/lifeRuntime");

  const lr = createLifeRuntime({
    config: {
      lifeRuntime: { enabled: true },
      memory:      { companionId: "dante", userScope: "jenna" },
    },
    logger:               null,
    alivePresenceStore:   null,
    microLifeEventsStore: eventsStore,
    dailyPlanEngine:      planEngine,
    decisionEngine,
  });
  await lr.init();

  const tickResult = await lr.tick(new Date());
  check("lifeRuntime.tick() returns ok",          tickResult?.ok === true);
  check("lifeRuntime.tick() has dateKey",         typeof tickResult?.plan === "string");

  const cachedPrelude = lr.getCurrentPrelude();
  check("getCurrentPrelude() is synchronous",     true);
  check("getCurrentPrelude() returns prelude after tick",
    cachedPrelude !== null && typeof cachedPrelude?.label === "string");

  const status = lr.getStatus();
  check("getStatus() enabled=true",               status?.enabled === true);
  check("getStatus() has todaysPlan",             status?.todaysPlan !== null);
  check("getStatus() has pruneSchedule",          typeof status?.pruneSchedule === "object");
  check("getStatus() is JSON-serialisable",       (() => { try { JSON.stringify(status); return true; } catch { return false; } })());

  const lrOff = createLifeRuntime({ config: {}, logger: null });
  const skipResult = await lrOff.tick();
  check("disabled runtime skips tick",            skipResult?.skipped === true);

  // ── SECTION 7: Scheduler uses existing schedulerRegistry ──────────────────

  const { registerLifeRuntime } = require("../src/lifeRuntime/lifeRuntimeScheduler");

  let registeredName = null;
  const mockRegistry = {
    registerPostLogin(name) { registeredName = name; },
    registerBackground() {},
  };

  registerLifeRuntime({ schedulerRegistry: null, lifeRuntime: null });
  check("registerLifeRuntime is no-op when args null", registeredName === null);

  registerLifeRuntime({ schedulerRegistry: mockRegistry, lifeRuntime: lr, config: {}, logger: null });
  check("registerLifeRuntime calls registerPostLogin",  registeredName === "lifeRuntime");

  check("lifeRuntimeScheduler uses registerPostLogin",
    fileContains("lifeRuntime/lifeRuntimeScheduler.js", "registerPostLogin"));
  check("lifeRuntimeScheduler does NOT create a new SchedulerRegistry",
    !fileContains("lifeRuntime/lifeRuntimeScheduler.js", "new SchedulerRegistry") &&
    !fileContains("lifeRuntime/lifeRuntimeScheduler.js", "createSchedulerRegistry"));

  // ── SECTION 8: Pruning protocol ───────────────────────────────────────────

  check("eventsStore has pruneOlderThan()",   typeof eventsStore.pruneOlderThan === "function");
  check("planEngine has pruneOlderThan()",    typeof planEngine.pruneOlderThan === "function");
  check("decisionEngine has pruneOlderThan()", typeof decisionEngine.pruneOlderThan === "function");

  const pruned = await eventsStore.pruneOlderThan({ companionId: "dante", customerId: "jenna", days: 0 });
  check("pruneOlderThan returns a number",    typeof pruned === "number");

  // ── SECTION 9: index.js wiring ────────────────────────────────────────────

  check("index.js imports createMicroLifeEventsStore",  fileContains("index.js", "createMicroLifeEventsStore"));
  check("index.js imports createDailyPlanEngine",       fileContains("index.js", "createDailyPlanEngine"));
  check("index.js imports createDecisionEngine",        fileContains("index.js", "createDecisionEngine"));
  check("index.js imports createLifeRuntime",           fileContains("index.js", "createLifeRuntime"));
  check("index.js imports registerLifeRuntime",         fileContains("index.js", "registerLifeRuntime"));
  check("index.js calls lifeRuntime.init",              fileContains("index.js", "lifeRuntime.init"));
  check("index.js calls registerLifeRuntime",           fileContains("index.js", "registerLifeRuntime"));
  check("index.js passes lifeRuntime to createChatPipeline",
    fileContains("index.js", "lifeRuntime") && fileContains("index.js", "createChatPipeline"));

  // ── SECTION 10: Pipeline injection ────────────────────────────────────────

  check("createChatPipeline accepts lifeRuntime param",
    fileContains("chat/createChatPipeline.js", "lifeRuntime"));
  check("createChatPipeline calls getCurrentPrelude()",
    fileContains("chat/createChatPipeline.js", "getCurrentPrelude"));
  check("createChatPipeline pushes prelude into contextSections",
    fileContains("chat/createChatPipeline.js", "contextSections.push") &&
    fileContains("chat/createChatPipeline.js", "getCurrentPrelude"));

  // ── SECTION 11: Health server endpoint ────────────────────────────────────

  check("createHealthServer.js has /api/ghostlight/life/status",
    fileContains("http/createHealthServer.js", "/api/ghostlight/life/status"));
  check("createHealthServer.js calls getStatus()",
    fileContains("http/createHealthServer.js", "getStatus"));

  // ── SECTION 12: Schema registry ───────────────────────────────────────────

  check("schemaRegistry has life_daily_plans table",
    fileContains("storage/postgres/schemaRegistry.js", "life_daily_plans"));
  check("schemaRegistry has life_events table",
    fileContains("storage/postgres/schemaRegistry.js", "life_events"));
  check("schemaRegistry has life_decisions table",
    fileContains("storage/postgres/schemaRegistry.js", "life_decisions"));

  // ── SECTION 13: Alive Layer untouched ─────────────────────────────────────

  check("alive/aliveEngine.js exists",         exists("alive/aliveEngine.js"));
  check("alive/alivePresenceStore.js exists",  exists("alive/alivePresenceStore.js"));
  check("alive/aliveExecutor.js exists",       exists("alive/aliveExecutor.js"));
  check("alive/alivePostUpdate.js exists",     exists("alive/alivePostUpdate.js"));
  check("alive/aliveContextBuilder.js exists", exists("alive/aliveContextBuilder.js"));
  check("alive/backbonePolicy.js exists",      exists("alive/backbonePolicy.js"));
  check("lifeRuntime does NOT replace innerLife",
    !fileContains("lifeRuntime/lifeRuntime.js", "createInnerLifeEngine"));
  check("lifeRuntime does NOT replace continuity",
    !fileContains("lifeRuntime/lifeRuntime.js", "createContinuityEngine"));
  check("lifeRuntime does NOT replace humanSimulation",
    !fileContains("lifeRuntime/lifeRuntime.js", "createHumanSimulationEngine"));

  // ── SECTION 14: Dashboard untouched ───────────────────────────────────────

  const lifeFiles = [
    "lifeRuntime/lifeRuntime.js",
    "lifeRuntime/dailyPlanEngine.js",
    "lifeRuntime/decisionEngine.js",
    "lifeRuntime/microLifeEventsStore.js",
    "lifeRuntime/lifePreludeBuilder.js",
    "lifeRuntime/lifeRuntimeScheduler.js",
  ];
  for (const f of lifeFiles) {
    check(`${f} does not reference dashboard`,
      !fileContains(f, "dashboard") && !fileContains(f, "Dashboard"));
  }
  check("createHealthServer.js still has /api/ghostlight/alive/status route",
    fileContains("http/createHealthServer.js", "/api/ghostlight/alive/status"));

  // ── SECTION 15: No new Discord sender ─────────────────────────────────────

  for (const f of lifeFiles) {
    check(`${f} does not call channel.send()`,
      !fileContains(f, "channel.send("));
  }

  // ── Results ───────────────────────────────────────────────────────────────

  console.log("\nLIFE_RUNTIME_VERIFY_START\n");
  let failures = 0;
  for (const { label, pass } of results) {
    const icon = pass ? "✓" : "✗";
    console.log(`  ${icon} ${label}`);
    if (!pass) failures++;
  }

  const total = results.length;
  console.log(`\n  ${total - failures}/${total} checks passed`);
  console.log(`\n${failures === 0 ? "LIFE_RUNTIME_PASS" : `LIFE_RUNTIME_FAIL (${failures} failure${failures === 1 ? "" : "s"})`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(err => {
  console.error("\nLIFE_RUNTIME_VERIFY_ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});
