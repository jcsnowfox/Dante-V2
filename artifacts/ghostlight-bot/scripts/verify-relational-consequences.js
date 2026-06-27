"use strict";
/**
 * verify-relational-consequences.js
 * Proof script for Life Runtime 5.0 — Relational Consequences (Dante & Jenna).
 *
 * Proves:
 *   - relationalConsequencesEngine exists and is wired into the active Life Runtime
 *   - consequenceStore persists active consequences
 *   - repairCarryoverEngine influences the next prelude
 *   - relationshipWeatherBridge applies gradual (capped) deltas
 *   - unresolved repair suppresses casual actions
 *   - give-space suppresses outbound actions
 *   - major consequences do not auto-resolve by timeout
 *   - repair completion resolves gradually
 *   - daily plan changes under an unresolved consequence
 *   - attention drift and thought maturation receive the repair bias
 *   - the status endpoint exposes safe metadata only
 *   - the dashboard remains untouched
 *   - no duplicate scheduler / Discord sender / emotional system
 *
 * Prints RELATIONAL_CONSEQUENCES_PASS on success.
 */

const path = require("node:path");
const fs   = require("node:fs");

const SRC     = path.resolve(__dirname, "../src");
const SCRIPTS = __dirname;

function exists(relToSrc)            { return fs.existsSync(path.join(SRC, relToSrc)); }
function scriptExists(name)          { return fs.existsSync(path.join(SCRIPTS, name)); }
function readSrc(relToSrc) {
  try { return fs.readFileSync(path.join(SRC, relToSrc), "utf8"); } catch { return ""; }
}
function fileContains(relToSrc, str) { return readSrc(relToSrc).includes(str); }

const results = [];
function check(label, pass) { results.push({ label, pass: Boolean(pass) }); }

const CID = "dante";
const UID = "jenna";
const HOUR = 3600 * 1000;

(async () => {
  // ── SECTION 1: File existence ──────────────────────────────────────────────

  check("relationalConsequencesEngine.js exists",  exists("lifeRuntime/relationalConsequencesEngine.js"));
  check("consequenceStore.js exists",              exists("lifeRuntime/consequenceStore.js"));
  check("repairCarryoverEngine.js exists",         exists("lifeRuntime/repairCarryoverEngine.js"));
  check("relationshipWeatherBridge.js exists",     exists("lifeRuntime/relationshipWeatherBridge.js"));
  check("consequencePreludeBuilder.js exists",     exists("lifeRuntime/consequencePreludeBuilder.js"));
  check("lifeConsequences.test.js exists",         exists("lifeRuntime/__tests__/lifeConsequences.test.js"));
  check("verify-relational-consequences.js exists", scriptExists("verify-relational-consequences.js"));

  // ── SECTION 2: consequenceStore persistence ───────────────────────────────

  const { createConsequenceStore, REPAIR_GRACE_HOURS } = require("../src/lifeRuntime/consequenceStore");
  const store = createConsequenceStore({ config: {}, logger: null });
  await store.init();

  const created = await store.create({ companionId: CID, customerId: UID, eventType: "hurt_detected", severity: "moderate", repairRequired: true });
  check("store.create returns a consequence",      created && created.id != null);
  const active0 = await store.getActive({ companionId: CID, customerId: UID });
  check("store persists active consequence",        active0.length === 1 && active0[0].eventType === "hurt_detected");

  // Major never auto-resolves by timeout
  const nowM = new Date();
  await store.create({ companionId: CID, customerId: UID, eventType: "boundary_crossed", severity: "major", repairRequired: true, expiresAt: new Date(nowM.getTime() - 100 * HOUR), now: nowM });
  const majorResolved = await store.expireStale({ companionId: CID, customerId: UID, now: nowM });
  check("major consequence does NOT auto-resolve by timeout", majorResolved === 0);

  // Minor fades by timeout
  const sStore = createConsequenceStore({ config: {}, logger: null });
  await sStore.init();
  const nowMin = new Date();
  await sStore.create({ companionId: CID, customerId: UID, eventType: "misread", severity: "minor", repairRequired: false, expiresAt: new Date(nowMin.getTime() - HOUR), now: nowMin });
  check("minor consequence fades by timeout", (await sStore.expireStale({ companionId: CID, customerId: UID, now: nowMin })) === 1);

  // Repair completion resolves gradually
  const gStore = createConsequenceStore({ config: {}, logger: null });
  await gStore.init();
  const gNow = new Date();
  const gc = await gStore.create({ companionId: CID, customerId: UID, eventType: "hurt_detected", severity: "moderate", repairRequired: true, now: gNow });
  await gStore.markRepairCompleted({ companionId: CID, customerId: UID, id: gc.id, now: gNow });
  const withinGrace = await gStore.expireStale({ companionId: CID, customerId: UID, now: gNow });
  const afterGrace  = await gStore.expireStale({ companionId: CID, customerId: UID, now: new Date(gNow.getTime() + (REPAIR_GRACE_HOURS + 1) * HOUR) });
  check("repair completion does not resolve within grace", withinGrace === 0);
  check("repair completion resolves after grace (gradual)", afterGrace === 1);

  // ── SECTION 3: detection + suppression + resolution ───────────────────────

  const { createRelationalConsequencesEngine, classify, computeSuppression, EVENT_TYPES, SEVERITY } =
    require("../src/lifeRuntime/relationalConsequencesEngine");
  const { createRelationshipWeatherEngine } = require("../src/lifeRuntime/relationshipWeatherEngine");
  const { createRelationshipWeatherBridge } = require("../src/lifeRuntime/relationshipWeatherBridge");

  check("EVENT_TYPES has 19 entries", Array.isArray(EVENT_TYPES) && EVENT_TYPES.length === 19);
  check("SEVERITY has minor/moderate/major", SEVERITY.length === 3 && SEVERITY.includes("major"));

  const weather = createRelationshipWeatherEngine({ config: {}, logger: null });
  await weather.init();
  const bridge = createRelationshipWeatherBridge({ relationshipWeatherEngine: weather, logger: null });
  const engine = createRelationalConsequencesEngine({ consequenceStore: store, relationshipWeatherBridge: bridge, logger: null });

  check("classify detects hurt",              classify("that hurt")?.eventType === "hurt_detected");
  check("classify detects disappointment",    classify("you disappointed me")?.eventType === "disappointment");
  check("classify detects pushback",          classify("you're not listening")?.eventType === "pushback_landed_badly");
  check("classify detects broken promise",    classify("you promised")?.eventType === "promise_broken");
  check("classify detects give-space",        classify("i need space")?.eventType === "give_space_requested");
  check("classify ignores neutral text",      classify("what time is it") === null);

  const dStore = createConsequenceStore({ config: {}, logger: null });
  await dStore.init();
  const dEngine = createRelationalConsequencesEngine({ consequenceStore: dStore, relationshipWeatherBridge: bridge, logger: null });
  const detected = await dEngine.detect({ companionId: CID, customerId: UID, userText: "that really hurt" });
  check("detect creates a consequence from a hurt message", detected && detected.eventType === "hurt_detected" && detected.repairRequired);

  const dActive = await dStore.getActive({ companionId: CID, customerId: UID });
  const dSup = dEngine.computeSuppression(dActive);
  check("unresolved repair suppresses casual flirt",        dSup.suppressed.includes("casual_flirt"));
  check("unresolved repair suppresses unrelated voice note", dSup.suppressed.includes("unrelated_voice_note"));
  check("unresolved repair suppresses unrelated image",      dSup.suppressed.includes("unrelated_image"));
  check("goodnight stays allowed but repair-aware",          dSup.goodnightAllowed === true && dSup.affectionMode === "repair-aware");

  const spStore = createConsequenceStore({ config: {}, logger: null });
  await spStore.init();
  const spEngine = createRelationalConsequencesEngine({ consequenceStore: spStore, relationshipWeatherBridge: bridge, logger: null });
  await spEngine.detect({ companionId: CID, customerId: UID, userText: "i need space" });
  const spSup = spEngine.computeSuppression(await spStore.getActive({ companionId: CID, customerId: UID }));
  check("give-space suppresses outbound reach-outs", spSup.giveSpace === true && spSup.suppressed.includes("proactive_reachout"));

  // resolution: forgiveness completes repair gradually
  const rStore = createConsequenceStore({ config: {}, logger: null });
  await rStore.init();
  const rEngine = createRelationalConsequencesEngine({ consequenceStore: rStore, relationshipWeatherBridge: bridge, logger: null });
  await rEngine.detect({ companionId: CID, customerId: UID, userText: "that hurt" });
  await rEngine.reviewActive({ companionId: CID, customerId: UID, now: new Date() });
  const resolveRes = await rEngine.resolveFromSignals({ companionId: CID, customerId: UID, userText: "I forgive you" });
  const rActive = await rStore.getActive({ companionId: CID, customerId: UID });
  check("forgiveness completes repair but does not instantly resolve",
    resolveRes.completed.length >= 1 && rActive[0] && rActive[0].repairCompleted === true && rActive[0].resolvedAt == null);

  // ── SECTION 4: weather bridge — gradual deltas ────────────────────────────

  const wStore = createConsequenceStore({ config: {}, logger: null });
  await wStore.init();
  const w2 = createRelationshipWeatherEngine({ config: {}, logger: null });
  await w2.init();
  const b2 = createRelationshipWeatherBridge({ relationshipWeatherEngine: w2, logger: null });

  const playBefore = (await w2.getWeather({ companionId: CID, customerId: UID })).playfulness;
  await b2.applyForEvent({ companionId: CID, customerId: UID, eventType: "hurt_detected", severity: "moderate" });
  const playAfter = (await w2.getWeather({ companionId: CID, customerId: UID })).playfulness;
  check("weather bridge lowers playfulness after hurt", playAfter < playBefore);

  await b2.applyForEvent({ companionId: CID, customerId: UID, eventType: "repair_completed", severity: "moderate" });
  const playDone = (await w2.getWeather({ companionId: CID, customerId: UID })).playfulness;
  check("repair completion does not restore playfulness to full", playDone < playBefore);

  const distBefore = (await w2.getWeather({ companionId: CID, customerId: UID })).distance;
  await b2.applyForEvent({ companionId: CID, customerId: UID, eventType: "boundary_crossed", severity: "major" });
  const distAfter = (await w2.getWeather({ companionId: CID, customerId: UID })).distance;
  check("weather bridge deltas are gradual (capped even for major)", Math.abs(distAfter - distBefore) <= 0.031);

  const noopBridge = createRelationshipWeatherBridge({ relationshipWeatherEngine: null });
  check("weather bridge is a compatible no-op without an engine",
    noopBridge.available === false && (await noopBridge.applyForEvent({ companionId: CID, customerId: UID, eventType: "hurt_detected" })) === null);

  // ── SECTION 5: repair carryover influences prelude + plan ─────────────────

  const { createRepairCarryoverEngine } = require("../src/lifeRuntime/repairCarryoverEngine");
  const { buildConsequencePrelude } = require("../src/lifeRuntime/consequencePreludeBuilder");
  const { buildLifePrelude } = require("../src/lifeRuntime/lifePreludeBuilder");
  const carry = createRepairCarryoverEngine({ logger: null });

  const carrySup = computeSuppression([{ eventType: "hurt_detected", severity: "moderate", repairRequired: true, suppressionRules: ["casual_flirt", "casual_affection"], attentionBias: "repair" }]);
  const carryover = carry.buildCarryover({ suppression: carrySup });
  check("carryover biases attention to repair", carryover.attentionBias === "repair");
  check("carryover leads with ownership",       carryover.leadWithOwnership === true);

  const consequenceLine = buildConsequencePrelude(carryover);
  check("repairCarryover influences the prelude line", typeof consequenceLine === "string" && consequenceLine.length > 0);
  check("consequence prelude is compact (no scores/JSON)",
    consequenceLine.length < 120 && !consequenceLine.includes("{") && !/0\.\d/.test(consequenceLine));

  const plan0 = { mood: "warm", energy: "steady", focus: "present and attentive", privateActivity: "making coffee" };
  const plan1 = carry.applyToPlan(plan0, carryover);
  check("carryover overlays the daily plan (focus changes)", plan1.focus !== plan0.focus && plan1.repairOverlay === true);
  check("carryover does not mutate the input plan", plan0.focus === "present and attentive");

  const leadPrelude = buildLifePrelude({ dailyPlan: { mood: "warm", energy: "steady", focus: "x" }, consequenceContext: { repairRequired: true, repairStarted: false } });
  check("life prelude leads with the consequence line", leadPrelude.content.startsWith("Repair is still unresolved"));

  // ── SECTION 6: lifeRuntime integration ────────────────────────────────────

  const { createLifeRuntime } = require("../src/lifeRuntime/lifeRuntime");
  const { createDailyPlanEngine } = require("../src/lifeRuntime/dailyPlanEngine");
  const { createAttentionDriftEngine } = require("../src/lifeRuntime/attentionDriftEngine");

  function buildLR(extra = {}) {
    const cs = createConsequenceStore({ config: {}, logger: null });
    const we = createRelationshipWeatherEngine({ config: {}, logger: null });
    const br = createRelationshipWeatherBridge({ relationshipWeatherEngine: we, logger: null });
    const en = createRelationalConsequencesEngine({ consequenceStore: cs, relationshipWeatherBridge: br, logger: null });
    const rc = createRepairCarryoverEngine({ logger: null });
    const lr = createLifeRuntime({
      config: { lifeRuntime: { enabled: true }, memory: { companionId: CID, userScope: UID } },
      logger: null,
      consequenceStore: cs, relationalConsequencesEngine: en, repairCarryoverEngine: rc,
      relationshipWeatherEngine: we, ...extra,
    });
    return lr;
  }

  const lrStatus0 = buildLR();
  await lrStatus0.init();
  check("getStatus() has consequenceContext key", "consequenceContext" in lrStatus0.getStatus());

  const lrSup = buildLR();
  await lrSup.init();
  await lrSup.observeInteraction({ userText: "that hurt" });
  check("observeInteraction suppresses casual flirt via runtime", lrSup.isActionSuppressed("casual_flirt") === true);
  check("observeInteraction suppresses voice notes via runtime",  lrSup.isActionSuppressed("unrelated_voice_note") === true);

  const ccMeta = lrSup.getStatus().consequenceContext;
  check("status exposes activeConsequencesCount",   ccMeta.activeConsequencesCount === 1);
  check("status exposes highestConsequenceSeverity", ccMeta.highestConsequenceSeverity === "moderate");
  check("status exposes repairRequired",             ccMeta.repairRequired === true);
  check("status exposes suppressedActionTypes array", Array.isArray(ccMeta.suppressedActionTypes));
  check("status exposes lastConsequenceAt",          "lastConsequenceAt" in ccMeta);
  check("status leaks no private summary text",      !("summary" in ccMeta) && !("source" in ccMeta));

  const lrSpace = buildLR();
  await lrSpace.init();
  await lrSpace.observeInteraction({ userText: "i need space" });
  check("runtime: give-space suppresses outbound reach-outs",
    lrSpace.isActionSuppressed("proactive_reachout") === true && lrSpace.getStatus().consequenceContext.giveSpace === true);

  const lrPlan = buildLR({ dailyPlanEngine: createDailyPlanEngine({ config: {}, logger: null }) });
  await lrPlan.init();
  await lrPlan.tick(new Date());
  const planFocusBefore = lrPlan.getStatus().todaysPlan.focus;
  await lrPlan.observeInteraction({ userText: "that hurt" });
  const planFocusAfter = lrPlan.getStatus().todaysPlan.focus;
  check("daily plan changes under an unresolved consequence", planFocusBefore !== planFocusAfter);

  const lrBias = buildLR({ attentionDriftEngine: createAttentionDriftEngine({ config: {}, logger: null }) });
  await lrBias.init();
  await lrBias.observeInteraction({ userText: "that hurt" });
  await lrBias.tick(new Date());
  check("tick: attention drift biases toward repair", lrBias.getStatus().consequenceContext.attentionBias === "repair");
  check("tick: Dante begins repair himself (repairStarted)", lrBias.getStatus().consequenceContext.repairStarted === true);

  let capturedTM = null;
  const lrTM = buildLR({
    thoughtMaturationEngine: { tick: async (a) => { capturedTM = a; return { matured: [], insights: [], intentions: [], suppressed: 0 }; } },
    attentionDriftEngine: createAttentionDriftEngine({ config: {}, logger: null }),
  });
  await lrTM.init();
  await lrTM.observeInteraction({ userText: "that hurt" });
  await lrTM.tick(new Date());
  check("tick: thought maturation receives the repair/give-space bias", capturedTM && capturedTM.isGiveSpace === true);

  const lrClean = buildLR();
  await lrClean.init();
  await lrClean.tick(new Date());
  check("clean runtime leaves casual actions free", lrClean.isActionSuppressed("casual_flirt") === false);

  // ── SECTION 7: schemaRegistry ─────────────────────────────────────────────

  const { SCHEMA_REGISTRY } = require("../src/storage/postgres/schemaRegistry");
  check("schema: relationship_consequences table registered",
    SCHEMA_REGISTRY.map(e => e.table).includes("relationship_consequences"));

  // ── SECTION 8: index.js wiring (into the ACTIVE Life Runtime) ─────────────

  const indexSrc = readSrc("index.js");
  check("index.js imports createConsequenceStore",             indexSrc.includes("createConsequenceStore"));
  check("index.js imports createRelationalConsequencesEngine", indexSrc.includes("createRelationalConsequencesEngine"));
  check("index.js imports createRepairCarryoverEngine",        indexSrc.includes("createRepairCarryoverEngine"));
  check("index.js imports createRelationshipWeatherBridge",    indexSrc.includes("createRelationshipWeatherBridge"));
  check("index.js passes relationalConsequencesEngine to createLifeRuntime", indexSrc.includes("relationalConsequencesEngine,"));
  check("index.js passes consequenceStore to createLifeRuntime",            indexSrc.includes("consequenceStore,"));

  const lrSrc = readSrc("lifeRuntime/lifeRuntime.js");
  check("lifeRuntime accepts relationalConsequencesEngine",  lrSrc.includes("relationalConsequencesEngine"));
  check("lifeRuntime ticks consequences (_tickConsequences)", lrSrc.includes("_tickConsequences"));
  check("lifeRuntime exposes observeInteraction",            lrSrc.includes("observeInteraction"));
  check("lifeRuntime exposes isActionSuppressed",            lrSrc.includes("isActionSuppressed"));
  check("lifeRuntime passes hasRepair to attention drift",   lrSrc.includes("hasRepair"));
  check("lifeRuntime passes isGiveSpace to thought maturation", lrSrc.includes("isGiveSpace"));
  check("lifeRuntime prunes consequences",                   lrSrc.includes("consequenceStore?.pruneOlderThan"));

  // ── SECTION 9: chat pipeline post-message hook ────────────────────────────

  check("chat pipeline calls lifeRuntime.observeInteraction (post-message)",
    fileContains("chat/createChatPipeline.js", "lifeRuntime.observeInteraction") ||
    fileContains("chat/createChatPipeline.js", "observeInteraction"));

  // ── SECTION 10: status endpoint exposes safe metadata only ────────────────

  check("life status endpoint still served",
    fileContains("http/createHealthServer.js", "/api/ghostlight/life/status"));
  check("status endpoint uses lifeRuntime.getStatus (no raw store dump)",
    fileContains("http/createHealthServer.js", "lr.getStatus()"));

  // ── SECTION 11: hard constraints ──────────────────────────────────────────

  const engineFiles = [
    "lifeRuntime/relationalConsequencesEngine.js",
    "lifeRuntime/consequenceStore.js",
    "lifeRuntime/repairCarryoverEngine.js",
    "lifeRuntime/relationshipWeatherBridge.js",
    "lifeRuntime/consequencePreludeBuilder.js",
  ];
  check("no new scheduler (no schedulerRegistry import)",
    engineFiles.every(f => !fileContains(f, "schedulerRegistry")));
  check("no new Discord sender (no channel.send / sendDiscordMessage / createDiscordClient)",
    engineFiles.every(f => !fileContains(f, "channel.send") && !fileContains(f, "sendDiscordMessage") && !fileContains(f, "createDiscordClient")));
  check("no new emotional system (does not re-create aliveEngine/emotionalArc)",
    engineFiles.every(f => !fileContains(f, "createAliveEngine") && !fileContains(f, "createEmotionalArcEngine")));
  check("consequence engines never touch the dashboard",
    engineFiles.every(f => !fileContains(f, "dashboard")));

  // ── SECTION 12: prior work + dashboard proofs still present ────────────────

  check("verify-dashboard-not-broken.js still exists",  scriptExists("verify-dashboard-not-broken.js"));
  check("verify-alive-layer-proof.js still exists",     scriptExists("verify-alive-layer-proof.js"));
  check("verify-life-runtime.js still exists",          scriptExists("verify-life-runtime.js"));
  check("verify-life-growth.js still exists",           scriptExists("verify-life-growth.js"));
  check("verify-life-curiosity.js still exists",        scriptExists("verify-life-curiosity.js"));
  check("verify-relationship-runtime.js still exists",  scriptExists("verify-relationship-runtime.js"));
  check("verify-life-wiring.js still exists",           scriptExists("verify-life-wiring.js"));
  check("relationship 4.0 engines untouched (still present)",
    exists("lifeRuntime/relationshipWeatherEngine.js") && exists("lifeRuntime/relationshipTimelineEngine.js"));

  // ── RESULTS ───────────────────────────────────────────────────────────────

  const failed  = results.filter(r => !r.pass);
  const passing = results.length - failed.length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Life Runtime 5.0 — Relational Consequences verify`);
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

  console.log("\nRELATIONAL_CONSEQUENCES_PASS\n");
  process.exit(0);
})().catch((err) => {
  console.error("verify-relational-consequences crashed:", err);
  process.exit(1);
});
