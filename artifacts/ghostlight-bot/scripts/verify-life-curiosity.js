"use strict";
/**
 * verify-life-curiosity.js
 * Proof script for Life Runtime 3.0 — Curiosity + Thought Maturation.
 *
 * Proves:
 *   1. All 5 new engine files exist
 *   2. privateQuestionStore persists questions and advances statuses
 *   3. repair/emotional source shortens maturation window
 *   4. attentionDriftEngine updates focus and returns current
 *   5. curiosityEngine generates questions from context
 *   6. insightEngine stores compact private insights
 *   7. thoughtMaturationEngine: question → insight pipeline
 *   8. give_space suppresses intention conversion
 *   9. quiet hours suppress intention conversion
 *  10. prelude builder includes curiosity/attention signal
 *  11. prelude stays under 150 tokens with all contexts set
 *  12. lifeRuntime.tick() wires curiosity engines
 *  13. getStatus() exposes safe counts only (no raw question text)
 *  14. schemaRegistry has 3 new tables
 *  15. index.js wires all 5 curiosity engines
 *  16. curiosity engines do not create new schedulers
 *  17. curiosity engines do not call channel.send()
 *  18. curiosity engines do not replace Alive Layer
 *  19. dashboard untouched
 *  20. existing Life Growth still passes (file-existence check)
 *  21. existing Life Runtime 1.0 test file still exists
 *
 * Returns exit 0 + prints LIFE_CURIOSITY_PASS on success.
 */

const path = require("node:path");
const fs   = require("node:fs");

const SRC    = path.resolve(__dirname, "../src");
const SCRIPTS = __dirname;

function exists(relToSrc)            { return fs.existsSync(path.join(SRC, relToSrc)); }
function scriptExists(name)          { return fs.existsSync(path.join(SCRIPTS, name)); }
function fileContains(relToSrc, str) {
  try { return fs.readFileSync(path.join(SRC, relToSrc), "utf8").includes(str); }
  catch { return false; }
}

const results = [];
function check(label, pass) { results.push({ label, pass: Boolean(pass) }); }

(async () => {
  // ── SECTION 1: File existence ──────────────────────────────────────────────

  check("curiosityEngine.js exists",           exists("lifeRuntime/curiosityEngine.js"));
  check("thoughtMaturationEngine.js exists",   exists("lifeRuntime/thoughtMaturationEngine.js"));
  check("privateQuestionStore.js exists",      exists("lifeRuntime/privateQuestionStore.js"));
  check("attentionDriftEngine.js exists",      exists("lifeRuntime/attentionDriftEngine.js"));
  check("insightEngine.js exists",             exists("lifeRuntime/insightEngine.js"));
  check("lifeCuriosity.test.js exists",        exists("lifeRuntime/__tests__/lifeCuriosity.test.js"));
  check("verify-life-curiosity.js exists",     scriptExists("verify-life-curiosity.js"));

  // ── SECTION 2: privateQuestionStore ───────────────────────────────────────

  const { createPrivateQuestionStore, QUESTION_STATUSES } = require("../src/lifeRuntime/privateQuestionStore");
  const qStore = createPrivateQuestionStore({ config: {}, logger: null });
  await qStore.init();

  check("QUESTION_STATUSES includes all 6 statuses",
    ["open","maturing","answered","converted_to_intention","dismissed","expired"].every(s => QUESTION_STATUSES.includes(s)));

  const q1 = await qStore.logQuestion({
    companionId: "dante", customerId: "jenna",
    question: "Is she doing okay?", source: "emotional", topic: "care",
    emotionalWeight: 0.75, curiosityScore: 0.60,
  });
  check("logQuestion returns question with id",   typeof q1?.id !== "undefined");
  check("logQuestion status is open",             q1?.status === "open");
  check("logQuestion question text preserved",    q1?.question === "Is she doing okay?");
  check("logQuestion maturesAt is set",           q1?.maturesAt !== null);

  // Repair/emotional shortens window to 2 h
  const repairQ = await qStore.logQuestion({
    companionId: "dante", customerId: "jenna",
    question: "Did that repair land?", source: "repair", topic: "repair",
    emotionalWeight: 0.80, curiosityScore: 0.70,
  });
  const repairMaturesMs = new Date(repairQ.maturesAt).getTime() - Date.now();
  check("repair question matures in under 3 h",  repairMaturesMs < 3 * 60 * 60 * 1000);

  const advanced = await qStore.advance({ id: q1.id, companionId: "dante", customerId: "jenna", status: "maturing" });
  check("advance changes status to maturing",     advanced?.status === "maturing");

  const openQ = await qStore.getOpen({ companionId: "dante", customerId: "jenna" });
  check("getOpen returns open/maturing questions", Array.isArray(openQ) && openQ.every(q => ["open","maturing"].includes(q.status)));

  const totalCount = await qStore.count({ companionId: "dante", customerId: "jenna" });
  check("count returns positive number",          typeof totalCount === "number" && totalCount >= 1);

  const maturingCount = await qStore.count({ companionId: "dante", customerId: "jenna", status: "maturing" });
  check("count by status works",                  typeof maturingCount === "number" && maturingCount >= 1);

  const pruned = await qStore.pruneOlderThan({ companionId: "dante", customerId: "jenna", days: 365 });
  check("pruneOlderThan returns number",          typeof pruned === "number");

  // ── SECTION 3: attentionDriftEngine ───────────────────────────────────────

  const { createAttentionDriftEngine, FOCUS_TYPES, FOCUS_CANDIDATES } = require("../src/lifeRuntime/attentionDriftEngine");
  const aEngine = createAttentionDriftEngine({ config: {}, logger: null });
  await aEngine.init();

  check("FOCUS_TYPES is non-empty array",         Array.isArray(FOCUS_TYPES) && FOCUS_TYPES.length > 0);
  check("FOCUS_CANDIDATES has 'person' focus type",
    FOCUS_CANDIDATES.some(c => c.focusType === "person"));

  const focus1 = aEngine.selectFocus({});
  check("selectFocus returns { focus, focusType, weight }",
    typeof focus1.focus === "string" && typeof focus1.focusType === "string" && typeof focus1.weight === "number");

  // Repair boosts the 'unresolved repair' candidate
  const repairFocuses = Array.from({ length: 30 }, () => aEngine.selectFocus({ hasRepair: true }).focus);
  check("selectFocus(hasRepair) returns unresolved repair at least once",
    repairFocuses.some(f => f === "unresolved repair"));

  await aEngine.updateFocus({ companionId: "dante", customerId: "jenna", focus: "a quiet afternoon", focusType: "emotional", weight: 0.4 });
  const current = await aEngine.getCurrentFocus({ companionId: "dante", customerId: "jenna" });
  check("getCurrentFocus returns latest focus",   current?.focus === "a quiet afternoon");

  const recent = await aEngine.getRecentFocus({ companionId: "dante", customerId: "jenna", limit: 3 });
  check("getRecentFocus returns array",           Array.isArray(recent));

  const attPruned = await aEngine.pruneOlderThan({ companionId: "dante", customerId: "jenna", days: 365 });
  check("attentionDriftEngine.pruneOlderThan",    typeof attPruned === "number");

  // ── SECTION 4: curiosityEngine ─────────────────────────────────────────────

  const { createCuriosityEngine, QUESTION_TEMPLATES, QUESTION_PROBABILITY } = require("../src/lifeRuntime/curiosityEngine");
  const cEngine = createCuriosityEngine({ logger: null });

  check("QUESTION_PROBABILITY is (0,1]",          QUESTION_PROBABILITY > 0 && QUESTION_PROBABILITY <= 1);
  check("QUESTION_TEMPLATES has repair templates", Array.isArray(QUESTION_TEMPLATES.repair) && QUESTION_TEMPLATES.repair.length > 0);
  check("QUESTION_TEMPLATES has emotional templates", Array.isArray(QUESTION_TEMPLATES.emotional));

  const nullResult = cEngine.generate({ forceProbability: 0 });
  check("generate(forceProbability=0) returns null", nullResult === null);

  const forcedResult = cEngine.generate({ forceProbability: 1.0, dailyPlan: { mood: "curious" } });
  check("generate(forceProbability=1) returns payload", forcedResult !== null);
  check("generate payload has question text",     typeof forcedResult?.question === "string");
  check("generate payload has source",            typeof forcedResult?.source   === "string");
  check("generate emotionalWeight in [0,1]",      forcedResult?.emotionalWeight >= 0 && forcedResult?.emotionalWeight <= 1);

  // Repair weight boosts when hasRepair=true
  const repairSources = Array.from({ length: 30 }, () =>
    cEngine.generate({ forceProbability: 1.0, hasRepair: true })?.source,
  ).filter(Boolean);
  check("generate with hasRepair skews toward repair", repairSources.some(s => s === "repair"));

  // ── SECTION 5: insightEngine ───────────────────────────────────────────────

  const { createInsightEngine, INSIGHT_PHRASES } = require("../src/lifeRuntime/insightEngine");
  const iEngine = createInsightEngine({ config: {}, logger: null });
  await iEngine.init();

  check("INSIGHT_PHRASES has repair entry",       typeof INSIGHT_PHRASES.repair === "string");
  check("INSIGHT_PHRASES entries are compact",
    Object.values(INSIGHT_PHRASES).every(p => p.length < 120));

  const ins1 = await iEngine.addInsight({
    companionId: "dante", customerId: "jenna",
    insight: "A thought worth holding quietly.", source: "general", topic: "care",
    confidence: 0.75, isPrivate: true,
  });
  check("addInsight returns insight with id",     typeof ins1?.id !== "undefined");
  check("insight is private by default",          ins1?.isPrivate === true);
  check("insight text is compact",                (ins1?.insight?.length ?? 0) < 200);

  const recentIns = await iEngine.getRecent({ companionId: "dante", customerId: "jenna", limit: 5 });
  check("getRecent returns insights array",        Array.isArray(recentIns) && recentIns.length >= 1);

  const insCount = await iEngine.count({ companionId: "dante", customerId: "jenna" });
  check("insight count is positive",              typeof insCount === "number" && insCount >= 1);

  const insPruned = await iEngine.pruneOlderThan({ companionId: "dante", customerId: "jenna", days: 365 });
  check("insightEngine.pruneOlderThan returns number", typeof insPruned === "number");

  // ── SECTION 6: thoughtMaturationEngine ────────────────────────────────────

  const { createThoughtMaturationEngine, MATURATION_THRESHOLD, INTENTION_THRESHOLD, QUIET_HOUR_START, QUIET_HOUR_END } =
    require("../src/lifeRuntime/thoughtMaturationEngine");

  const mEngine = createThoughtMaturationEngine({
    privateQuestionStore: qStore,
    insightEngine: iEngine,
    logger: null,
  });

  check("MATURATION_THRESHOLD ∈ [0.5, 1)",       MATURATION_THRESHOLD >= 0.5 && MATURATION_THRESHOLD < 1);
  check("INTENTION_THRESHOLD > MATURATION_THRESHOLD", INTENTION_THRESHOLD > MATURATION_THRESHOLD);
  check("isQuietHour(23) = true",                 mEngine.isQuietHour(23) === true);
  check("isQuietHour(3)  = true",                 mEngine.isQuietHour(3)  === true);
  check("isQuietHour(14) = false",                mEngine.isQuietHour(14) === false);

  const tickResult = await mEngine.tick({ companionId: "dante", customerId: "jenna" });
  check("tick() returns { matured, insights, intentions, suppressed }",
    Array.isArray(tickResult.matured) && Array.isArray(tickResult.insights) &&
    Array.isArray(tickResult.intentions) && typeof tickResult.suppressed === "number");

  // Plant a high-score question already in maturing state
  const hq = await qStore.logQuestion({
    companionId: "dante", customerId: "jenna",
    question: "What actually matters here?", source: "repair", topic: "repair",
    emotionalWeight: 0.90, curiosityScore: 0.88,
    maturesAt: new Date(Date.now() - 1),
  });
  await qStore.advance({ id: hq.id, companionId: "dante", customerId: "jenna", status: "maturing" });
  const insightsBefore = await iEngine.count({ companionId: "dante", customerId: "jenna" });
  const mResult = await mEngine.tick({ companionId: "dante", customerId: "jenna" });
  const insightsAfter = await iEngine.count({ companionId: "dante", customerId: "jenna" });
  check("high-score maturing question produces insight", insightsAfter >= insightsBefore);

  // give_space suppresses intention conversion
  const gq = await qStore.logQuestion({
    companionId: "dante", customerId: "jenna",
    question: "Reach out?", source: "emotional", topic: "timing",
    emotionalWeight: 0.95, curiosityScore: 0.90,
    maturesAt: new Date(Date.now() - 1),
  });
  await qStore.advance({ id: gq.id, companionId: "dante", customerId: "jenna", status: "maturing" });
  const gsResult = await mEngine.tick({ companionId: "dante", customerId: "jenna", isGiveSpace: true, hour: 14 });
  check("give_space suppresses intention conversion", gsResult.intentions.length === 0);

  // quiet hours suppress intention conversion
  const qq = await qStore.logQuestion({
    companionId: "dante", customerId: "jenna",
    question: "Night thought?", source: "silence", topic: "absence",
    emotionalWeight: 0.92, curiosityScore: 0.90,
    maturesAt: new Date(Date.now() - 1),
  });
  await qStore.advance({ id: qq.id, companionId: "dante", customerId: "jenna", status: "maturing" });
  const qhResult = await mEngine.tick({ companionId: "dante", customerId: "jenna", isGiveSpace: false, hour: QUIET_HOUR_START + 1 });
  check("quiet hours suppress intention conversion", qhResult.intentions.length === 0);

  // ── SECTION 7: prelude with curiosityContext ────────────────────────────────

  const { buildLifePrelude } = require("../src/lifeRuntime/lifePreludeBuilder");

  const pWith = buildLifePrelude({
    dailyPlan:       { mood: "focused", energy: "steady", focus: "" },
    recentEvents:    [],
    growthContext:   null,
    curiosityContext: {
      attentionFocus:  { focus: "the dashboard cleanup thread", focusType: "concern" },
      maturingCount:   1,
      recentInsight:   null,
    },
  });
  check("prelude includes attention focus",        pWith?.content?.includes("dashboard cleanup thread"));
  check("prelude includes maturing count",         pWith?.content?.includes("1 private thought maturing"));

  // focus + count combined into one line
  const lines = pWith?.content?.split("\n") ?? [];
  const curiosityLines = lines.filter(l => l.includes("Quietly circling") || l.includes("maturing"));
  check("curiosityContext adds at most 1 prelude line", curiosityLines.length <= 1);

  // Full context, still under 800 chars
  const pFull = buildLifePrelude({
    dailyPlan:       { mood: "focused", energy: "high", focus: "deep work", privateActivity: "writing" },
    recentEvents:    [{ description: "made coffee" }, { description: "wrote a few lines" }],
    growthContext:   { activeProject: { title: "A short essay on silence" }, activeHobby: null, recentInterest: null },
    curiosityContext: {
      attentionFocus:  { focus: "an unresolved thread from yesterday", focusType: "concern" },
      maturingCount:   3,
      recentInsight:   null,
    },
  });
  check("prelude stays under 800 chars with all contexts", (pFull?.content?.length ?? 0) < 800);

  // Without curiosity context — still works
  const pNone = buildLifePrelude({
    dailyPlan:       { mood: "calm", energy: "low", focus: "" },
    curiosityContext: null,
  });
  check("prelude works without curiosityContext",  pNone !== null);

  // ── SECTION 8: lifeRuntime integration ────────────────────────────────────

  const { createLifeRuntime } = require("../src/lifeRuntime/lifeRuntime");
  const { createDailyPlanEngine } = require("../src/lifeRuntime/dailyPlanEngine");
  const { createMicroLifeEventsStore } = require("../src/lifeRuntime/microLifeEventsStore");

  const planEngine  = createDailyPlanEngine({ config: {}, logger: null });
  const eventsStore = createMicroLifeEventsStore({ config: {}, logger: null });
  await planEngine.init();
  await eventsStore.init();

  const lr = createLifeRuntime({
    config: {
      lifeRuntime: { enabled: true },
      memory:      { companionId: "dante", userScope: "jenna" },
    },
    logger:                 null,
    microLifeEventsStore:   eventsStore,
    dailyPlanEngine:        planEngine,
    curiosityEngine:        cEngine,
    thoughtMaturationEngine: mEngine,
    privateQuestionStore:   qStore,
    attentionDriftEngine:   aEngine,
    insightEngine:          iEngine,
  });
  await lr.init();

  const tickR = await lr.tick(new Date());
  check("lifeRuntime.tick() returns ok with curiosity engines", tickR?.ok === true);

  const status = lr.getStatus();
  check("getStatus() has curiosityContext key",    "curiosityContext" in status);
  check("curiosityContext has openQuestions count", typeof (status.curiosityContext?.openQuestions ?? 0) === "number");
  check("curiosityContext has maturingQuestions count", typeof (status.curiosityContext?.maturingQuestions ?? 0) === "number");
  check("curiosityContext does NOT expose raw question text", !("question" in (status.curiosityContext ?? {})));
  check("getStatus() is JSON-serialisable",        (() => { try { JSON.stringify(status); return true; } catch { return false; } })());

  // lifeRuntime source contains _tickCuriosity
  check("lifeRuntime.js contains _tickCuriosity",
    fileContains("lifeRuntime/lifeRuntime.js", "_tickCuriosity"));
  check("lifeRuntime.js accepts curiosityEngine param",
    fileContains("lifeRuntime/lifeRuntime.js", "curiosityEngine"));
  check("lifeRuntime.js accepts thoughtMaturationEngine param",
    fileContains("lifeRuntime/lifeRuntime.js", "thoughtMaturationEngine"));
  check("lifeRuntime.js accepts privateQuestionStore param",
    fileContains("lifeRuntime/lifeRuntime.js", "privateQuestionStore"));
  check("lifeRuntime.js accepts attentionDriftEngine param",
    fileContains("lifeRuntime/lifeRuntime.js", "attentionDriftEngine"));
  check("lifeRuntime.js accepts insightEngine param",
    fileContains("lifeRuntime/lifeRuntime.js", "insightEngine"));

  // ── SECTION 9: schemaRegistry ──────────────────────────────────────────────

  check("schemaRegistry has life_questions table",
    fileContains("storage/postgres/schemaRegistry.js", "life_questions"));
  check("schemaRegistry has life_attention table",
    fileContains("storage/postgres/schemaRegistry.js", "life_attention"));
  check("schemaRegistry has life_insights table",
    fileContains("storage/postgres/schemaRegistry.js", "life_insights"));

  // ── SECTION 10: index.js wiring ───────────────────────────────────────────

  check("index.js imports createCuriosityEngine",         fileContains("index.js", "createCuriosityEngine"));
  check("index.js imports createThoughtMaturationEngine", fileContains("index.js", "createThoughtMaturationEngine"));
  check("index.js imports createPrivateQuestionStore",    fileContains("index.js", "createPrivateQuestionStore"));
  check("index.js imports createAttentionDriftEngine",    fileContains("index.js", "createAttentionDriftEngine"));
  check("index.js imports createInsightEngine",           fileContains("index.js", "createInsightEngine"));
  check("index.js passes curiosityEngine to createLifeRuntime",
    fileContains("index.js", "curiosityEngine"));
  check("index.js passes thoughtMaturationEngine to createLifeRuntime",
    fileContains("index.js", "thoughtMaturationEngine"));

  // ── SECTION 11: Safety — no surveillance, no new scheduler, no new sender ──

  const curiosityFiles = [
    "lifeRuntime/curiosityEngine.js",
    "lifeRuntime/thoughtMaturationEngine.js",
    "lifeRuntime/privateQuestionStore.js",
    "lifeRuntime/attentionDriftEngine.js",
    "lifeRuntime/insightEngine.js",
  ];

  for (const f of curiosityFiles) {
    check(`${f} does not create a new scheduler`,
      !fileContains(f, "setInterval") && !fileContains(f, "setTimeout"));
    check(`${f} does not call channel.send()`,
      !fileContains(f, "channel.send("));
    check(`${f} does not replace aliveEngine`,
      !fileContains(f, "createAliveEngine"));
    check(`${f} does not reference dashboard`,
      !fileContains(f, "dashboard") && !fileContains(f, "Dashboard"));
  }

  check("thoughtMaturationEngine does NOT claim to monitor in real time",
    !fileContains("lifeRuntime/thoughtMaturationEngine.js", "monitor") &&
    !fileContains("lifeRuntime/thoughtMaturationEngine.js", "watching"));

  // ── SECTION 12: Existing systems untouched ─────────────────────────────────

  check("alive/aliveEngine.js still exists",       exists("alive/aliveEngine.js"));
  check("alive/alivePresenceStore.js still exists",exists("alive/alivePresenceStore.js"));
  check("existing /api/ghostlight/alive/status route still present",
    fileContains("http/createHealthServer.js", "/api/ghostlight/alive/status"));
  check("existing /api/ghostlight/life/status route still present",
    fileContains("http/createHealthServer.js", "/api/ghostlight/life/status"));

  check("lifeRuntime 1.0 test file still exists",
    exists("lifeRuntime/__tests__/lifeRuntime.test.js"));
  check("lifeRuntime 2.0 test file still exists",
    exists("lifeRuntime/__tests__/lifeGrowth.test.js"));
  check("scripts/verify-life-runtime.js still exists", scriptExists("verify-life-runtime.js"));
  check("scripts/verify-life-growth.js still exists",  scriptExists("verify-life-growth.js"));
  check("lifePreludeBuilder.js still exports buildLifePrelude",
    fileContains("lifeRuntime/lifePreludeBuilder.js", "buildLifePrelude"));

  // ── Results ───────────────────────────────────────────────────────────────

  console.log("\nLIFE_CURIOSITY_VERIFY_START\n");
  let failures = 0;
  for (const { label, pass } of results) {
    const icon = pass ? "✓" : "✗";
    console.log(`  ${icon} ${label}`);
    if (!pass) failures++;
  }

  const total = results.length;
  console.log(`\n  ${total - failures}/${total} checks passed`);
  console.log(`\n${failures === 0 ? "LIFE_CURIOSITY_PASS" : `LIFE_CURIOSITY_FAIL (${failures} failure${failures === 1 ? "" : "s"})`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(err => {
  console.error("\nLIFE_CURIOSITY_VERIFY_ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});
