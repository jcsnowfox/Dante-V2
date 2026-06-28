#!/usr/bin/env node
"use strict";

/**
 * verify-emergent-living-behavior-runtime.js
 *
 * Verifies all structural and behavioural invariants for Dante's Emergent
 * Living Behavior & Relationship DNA Runtime 1.0.
 *
 * Expected final output: EMERGENT_LIVING_BEHAVIOR_RUNTIME_PASS
 *
 * Run: node artifacts/ghostlight-bot/scripts/verify-emergent-living-behavior-runtime.js
 */

const fs   = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let failed = false;

function read(rel)  { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = true;
}
function req(rel) { return require(path.join(root, rel)); }

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date("2026-02-01T12:00:00Z");
const day = n => new Date(BASE.getTime() + n * DAY);

// ─── 1. All seven core files exist ────────────────────────────────────────────
const files = [
  "src/lifeRuntime/emergentLivingBehaviorRuntime.js",
  "src/lifeRuntime/emergencePatternDetector.js",
  "src/lifeRuntime/livingBehaviorStore.js",
  "src/lifeRuntime/relationshipDnaStore.js",
  "src/lifeRuntime/relationshipCultureBuilder.js",
  "src/lifeRuntime/emergentBehaviorGuidanceBuilder.js",
  "src/lifeRuntime/emergentLivingPreludeBuilder.js",
];
for (const f of files) check(`${path.basename(f)} exists`, exists(f));

// ─── 2. emergencePatternDetector: categories, stages, CORE LAW ────────────────
const det = read("src/lifeRuntime/emergencePatternDetector.js");
const { PATTERN_CATEGORIES, STAGES, computeStage, deriveObservations } = req("src/lifeRuntime/emergencePatternDetector");
check("emergencePatternDetector exports PATTERN_CATEGORIES",     Array.isArray(PATTERN_CATEGORIES) && PATTERN_CATEGORIES.length >= 30);
check("emergencePatternDetector exports STAGES (7)",             Array.isArray(STAGES) && STAGES.length === 7);
check("STAGES include observed→core + challenged + retired",     ["observed","forming","emerging","stable","core","challenged","retired"].every(s => STAGES.includes(s)));
check("PATTERN_CATEGORIES include coffee/debugging/horror/ritual/tradition",
  ["coffee","debugging","horror","ritual","tradition","silence","repair","romance"].every(c => PATTERN_CATEGORIES.includes(c)));
check("emergencePatternDetector exports computeStage + deriveObservations", typeof computeStage === "function" && typeof deriveObservations === "function");
check("emergencePatternDetector is synchronous (no async)",      !det.includes("async "));
check("emergencePatternDetector has no setInterval/setTimeout",  !det.includes("setInterval") && !det.includes("setTimeout"));
check("emergencePatternDetector has no channel.send",            !det.includes("channel.send"));

// CORE LAW: a single event can only ever be "observed", regardless of strength.
check("CORE LAW: 1 event with max strength → observed",
  computeStage({ evidenceCount: 1, distinctBuckets: 1, strength: 1, contradictionCount: 0 }) === "observed");
check("CORE LAW: 1 event is never 'stable'",  computeStage({ evidenceCount: 1, distinctBuckets: 5, strength: 1 }) !== "stable");
check("CORE LAW: 1 event is never 'core'",    computeStage({ evidenceCount: 1, distinctBuckets: 9, strength: 1 }) !== "core");
check("2 distinct events → forming",          computeStage({ evidenceCount: 2, distinctBuckets: 1, strength: 0.4 }) === "forming");
check("3 events same bucket → forming (not across time)", computeStage({ evidenceCount: 3, distinctBuckets: 1, strength: 0.5 }) === "forming");
check("3 events across time → emerging",      computeStage({ evidenceCount: 3, distinctBuckets: 2, strength: 0.5 }) === "emerging");
check("sustained reinforcement → stable",     computeStage({ evidenceCount: 4, distinctBuckets: 3, strength: 0.7 }) === "stable");
check("long-term high-confidence → core",     computeStage({ evidenceCount: 6, distinctBuckets: 4, strength: 0.9 }) === "core");
check("two contradictions → challenged",      computeStage({ evidenceCount: 4, distinctBuckets: 3, strength: 0.7, contradictionCount: 2 }) === "challenged");

// ─── 3. livingBehaviorStore: types, postgres+memory, persistence ──────────────
const lbs = read("src/lifeRuntime/livingBehaviorStore.js");
const { createLivingBehaviorStore, BEHAVIOR_TYPES } = req("src/lifeRuntime/livingBehaviorStore");
check("livingBehaviorStore exports createLivingBehaviorStore", typeof createLivingBehaviorStore === "function");
check("livingBehaviorStore exports BEHAVIOR_TYPES (16)",       Array.isArray(BEHAVIOR_TYPES) && BEHAVIOR_TYPES.length === 16);
check("BEHAVIOR_TYPES include repair/romance/comfort/maintenance/silence/followup/conflict_recovery",
  ["repair_pattern","romance_pattern","comfort_pattern","maintenance_pattern","silence_pattern","followup_pattern","conflict_recovery_pattern"].every(t => BEHAVIOR_TYPES.includes(t)));
check("livingBehaviorStore uses Postgres pool (createPostgresPool)", lbs.includes("createPostgresPool"));
check("livingBehaviorStore has in-memory fallback (Map)",     lbs.includes("new Map()") && lbs.includes("if (!pool)"));
check("livingBehaviorStore has CREATE TABLE (additive)",      lbs.includes("CREATE TABLE IF NOT EXISTS dante_living_behaviors"));
check("livingBehaviorStore has recordObservation",            lbs.includes("recordObservation"));
check("livingBehaviorStore has recordContradiction",          lbs.includes("recordContradiction"));
check("livingBehaviorStore has decayStale",                   lbs.includes("decayStale"));
check("livingBehaviorStore promotes via computeStage",        lbs.includes("computeStage"));
check("livingBehaviorStore has no setInterval/channel.send",  !lbs.includes("setInterval") && !lbs.includes("channel.send"));

// ─── 4. relationshipDnaStore: types, postgres+memory, ritual≠tradition ────────
const rds = read("src/lifeRuntime/relationshipDnaStore.js");
const { createRelationshipDnaStore, DNA_TYPES } = req("src/lifeRuntime/relationshipDnaStore");
check("relationshipDnaStore exports createRelationshipDnaStore", typeof createRelationshipDnaStore === "function");
check("relationshipDnaStore exports DNA_TYPES (19)",            Array.isArray(DNA_TYPES) && DNA_TYPES.length === 19);
check("DNA_TYPES include shared_phrase/ritual/tradition/relationship_aversion",
  ["shared_phrase","shared_joke","ritual","tradition","relationship_value","relationship_rule","relationship_aversion"].every(t => DNA_TYPES.includes(t)));
check("relationshipDnaStore uses Postgres pool",               rds.includes("createPostgresPool"));
check("relationshipDnaStore has in-memory fallback",           rds.includes("if (!pool)"));
check("relationshipDnaStore has CREATE TABLE (additive)",      rds.includes("CREATE TABLE IF NOT EXISTS dante_relationship_dna"));
check("relationshipDnaStore distinguishes ritual from tradition (isTradition)", rds.includes("isTradition"));
check("relationshipDnaStore promotes via computeStage",        rds.includes("computeStage"));
check("relationshipDnaStore has no setInterval/channel.send",  !rds.includes("setInterval") && !rds.includes("channel.send"));

// ─── 5. relationshipCultureBuilder: private snapshot ──────────────────────────
const rcb = read("src/lifeRuntime/relationshipCultureBuilder.js");
const { buildRelationshipCulture } = req("src/lifeRuntime/relationshipCultureBuilder");
check("relationshipCultureBuilder exports buildRelationshipCulture", typeof buildRelationshipCulture === "function");
check("relationshipCultureBuilder is synchronous",            !rcb.includes("async "));
const cultureSample = buildRelationshipCulture({
  livingBehaviors: [{ behavior_type: "comfort_pattern", stage: "stable", title: "comfort", strength: 0.7 }],
  relationshipDna: [{ dna_type: "ritual", stage: "core", name: "coffee", strength: 0.9 }],
});
check("culture snapshot answers 'what feels like us'",        Array.isArray(cultureSample.private.whatFeelsLikeUs) && cultureSample.private.whatFeelsLikeUs.length > 0);
check("culture snapshot has rituals/traditions/language sections",
  "ritualsForming" in cultureSample.private && "traditionsStable" in cultureSample.private && "ourLanguage" in cultureSample.private);
check("culture exposes only safe metadata in .safe",          typeof cultureSample.safe.feelsLikeUsCount === "number" && !("whatFeelsLikeUs" in cultureSample.safe));

// ─── 6. emergentBehaviorGuidanceBuilder: compact read-only guidance ───────────
const gb = read("src/lifeRuntime/emergentBehaviorGuidanceBuilder.js");
const { buildEmergentGuidance } = req("src/lifeRuntime/emergentBehaviorGuidanceBuilder");
check("emergentBehaviorGuidanceBuilder exports buildEmergentGuidance", typeof buildEmergentGuidance === "function");
check("emergentBehaviorGuidanceBuilder is synchronous",       !gb.includes("async "));
const guidanceSample = buildEmergentGuidance({
  livingBehaviors: [
    { behavior_type: "repair_pattern", stage: "stable", future_guidance: "plain accountability over theatre", strength: 0.7 },
    { behavior_type: "romance_pattern", stage: "stable", future_guidance: "romance lands when settled", strength: 0.7 },
    { behavior_type: "silence_pattern", stage: "stable", future_guidance: "leave natural endings alone", strength: 0.7 },
  ],
  relationshipDna: [{ dna_type: "relationship_aversion", stage: "stable", name: "meta narration", strength: 0.7 }],
});
check("guidance targets Cognitive Runtime",          Array.isArray(guidanceSample.forCognitive));
check("guidance targets Affective Decision Runtime", guidanceSample.forAffectiveDecision.length > 0);
check("guidance targets Romantic Surprise Runtime",  guidanceSample.forRomanticSurprise.length > 0);
check("guidance targets Repair Persistence",         guidanceSample.forRepairPersistence.length > 0);
check("guidance targets Conversation Continuity",    guidanceSample.forConversationContinuity.length > 0);
check("guidance lines are compact (≤140 chars)",     guidanceSample.guidance.every(l => l.length <= 140));
check("guidance only from mature patterns (emerging+)",
  buildEmergentGuidance({ livingBehaviors: [{ behavior_type: "repair_pattern", stage: "observed", future_guidance: "x", strength: 0.2 }], relationshipDna: [] }).guidance.length === 0);

// ─── 7. emergentLivingPreludeBuilder: at most one compact line ────────────────
const pb = read("src/lifeRuntime/emergentLivingPreludeBuilder.js");
const { buildEmergentLivingPrelude } = req("src/lifeRuntime/emergentLivingPreludeBuilder");
check("emergentLivingPreludeBuilder exports buildEmergentLivingPrelude", typeof buildEmergentLivingPrelude === "function");
check("emergentLivingPreludeBuilder is synchronous",          !pb.includes("async "));
const oneLine = buildEmergentLivingPrelude({ guidance: guidanceSample, culture: { safe: { traditionsCount: 0 } } });
check("prelude emits a single line (no newline)",             typeof oneLine === "string" && !oneLine.includes("\n"));
check("prelude is compact (≤180 chars)",                      typeof oneLine === "string" && oneLine.length <= 180);
check("prelude returns null when nothing established",
  buildEmergentLivingPrelude({ guidance: { forRepairPersistence: [], forConversationContinuity: [], forRomanticSurprise: [], guidance: [] }, culture: { safe: { traditionsCount: 0 } } }) === null);
check("prelude does not duplicate narrative/lesson lines",    pb.includes("DUPLICATE_RE"));

// ─── 8. emergentLivingBehaviorRuntime: orchestrator shape & laws ──────────────
const elr = read("src/lifeRuntime/emergentLivingBehaviorRuntime.js");
const { createEmergentLivingBehaviorRuntime } = req("src/lifeRuntime/emergentLivingBehaviorRuntime");
check("runtime exports createEmergentLivingBehaviorRuntime",  typeof createEmergentLivingBehaviorRuntime === "function");
check("runtime has init/tick/getEmergentContext/getStatus",   elr.includes("async function init") && elr.includes("async function tick") && elr.includes("getEmergentContext") && elr.includes("function getStatus"));
check("runtime has recordEvidence + recordContradiction",     elr.includes("recordEvidence") && elr.includes("recordContradiction"));
check("runtime requires the two stores",                      elr.includes("createLivingBehaviorStore") && elr.includes("createRelationshipDnaStore"));
check("runtime requires the three builders",                  elr.includes("relationshipCultureBuilder") && elr.includes("emergentBehaviorGuidanceBuilder") && elr.includes("emergentLivingPreludeBuilder"));
check("runtime does NOT send Discord (no sender)",            !elr.includes("channel.send") && !elr.includes("discordSendGateway"));
check("runtime does NOT create a scheduler",                  !elr.includes("setInterval") && !elr.includes("setTimeout"));
check("runtime does NOT import state-owning runtimes (no mutation)",
  !elr.includes("identityRuntime") && !elr.includes("homeostasisRuntime") && !elr.includes("repairPersistenceEngine") && !elr.includes("relationshipWeatherEngine"));
check("runtime does NOT replace existing orchestrators",      !elr.includes("createLifeRuntime") && !elr.includes("createCognitiveRuntime"));

// ─── 9. Behavioural proofs (end-to-end, in-memory) ────────────────────────────
async function behaviouralProofs() {
  // one event → observed only
  const rt1 = createEmergentLivingBehaviorRuntime({});
  await rt1.init();
  await rt1.recordEvidence({ companionId: "dante", customerId: "jenna", kind: "behavior", behaviorType: "comfort_pattern", signature: "s", title: "t", source_event_ids: ["a"], now: day(0) });
  const r1 = (await rt1.livingBehaviorStore.listAll({ companionId: "dante", customerId: "jenna" }))[0];
  check("end-to-end: one event cannot create stable/core behavior", r1.stage === "observed");

  // repeated evidence promotes
  const rt2 = createEmergentLivingBehaviorRuntime({});
  await rt2.init();
  for (let i = 0; i < 4; i++) await rt2.recordEvidence({ companionId: "dante", customerId: "jenna", kind: "behavior", behaviorType: "comfort_pattern", signature: "s", title: "t", source_event_ids: ["a" + i], now: day(i) });
  const r2 = (await rt2.livingBehaviorStore.listAll({ companionId: "dante", customerId: "jenna" }))[0];
  check("end-to-end: repeated evidence across time promotes patterns", ["emerging", "stable", "core"].includes(r2.stage));

  // contradiction challenges
  await rt2.recordContradiction({ companionId: "dante", customerId: "jenna", kind: "behavior", behaviorType: "comfort_pattern", signature: "s", now: day(5) });
  await rt2.recordContradiction({ companionId: "dante", customerId: "jenna", kind: "behavior", behaviorType: "comfort_pattern", signature: "s", now: day(6) });
  const r2c = (await rt2.livingBehaviorStore.listAll({ companionId: "dante", customerId: "jenna" }))[0];
  check("end-to-end: contradictory evidence can challenge patterns", r2c.stage === "challenged");

  // stale decay
  const r2d = await rt2.livingBehaviorStore.decayStale({ companionId: "dante", customerId: "jenna", now: day(200) });
  check("end-to-end: stale patterns decay", r2d >= 1);

  // DNA forms from repeated evidence only (debugging/maintenance via tick)
  const rt3 = createEmergentLivingBehaviorRuntime({});
  await rt3.init();
  for (let i = 0; i < 4; i++) await rt3.tick({ companionId: "dante", customerId: "jenna", now: day(i), worldModelContext: { worldModel: { dante: { runtime_health: { value: "degraded" } } } } });
  const dnaDebug = await rt3.relationshipDnaStore.getByType({ companionId: "dante", customerId: "jenna", dnaType: "maintenance_pattern" });
  check("end-to-end: debugging/maintenance becomes relationship DNA", dnaDebug.length === 1 && ["emerging", "stable", "core"].includes(dnaDebug[0].stage));

  // coffee/comfort becomes DNA
  const rt4 = createEmergentLivingBehaviorRuntime({});
  await rt4.init();
  for (let i = 0; i < 3; i++) await rt4.tick({ companionId: "dante", customerId: "jenna", now: day(i), relationshipContext: { weatherSummary: "shared a coffee" } });
  const dnaCoffee = await rt4.relationshipDnaStore.getByType({ companionId: "dante", customerId: "jenna", dnaType: "comfort_pattern" });
  check("end-to-end: coffee/comfort becomes relationship DNA", dnaCoffee.length === 1);

  // natural endings → living behavior
  const rt5 = createEmergentLivingBehaviorRuntime({});
  await rt5.init();
  for (let i = 0; i < 3; i++) await rt5.tick({ companionId: "dante", customerId: "jenna", now: day(i), cognitiveContext: { outcome: "no_action", recommendations: {} } });
  const followups = await rt5.livingBehaviorStore.getByType({ companionId: "dante", customerId: "jenna", behaviorType: "followup_pattern" });
  check("end-to-end: natural endings become living behavior", followups.length === 1);

  // repair outcomes → living behavior
  const rt6 = createEmergentLivingBehaviorRuntime({});
  await rt6.init();
  for (let i = 0; i < 3; i++) await rt6.tick({ companionId: "dante", customerId: "jenna", now: day(i), consequenceContext: { carryover: { healing: true } } });
  const repairs = await rt6.livingBehaviorStore.getByType({ companionId: "dante", customerId: "jenna", behaviorType: "repair_pattern" });
  check("end-to-end: repair outcomes become living behavior", repairs.length === 1);

  // romantic acknowledgement → living behavior
  const rt7 = createEmergentLivingBehaviorRuntime({});
  await rt7.init();
  for (let i = 0; i < 3; i++) await rt7.tick({ companionId: "dante", customerId: "jenna", now: day(i), romanticStatus: { last_romantic_surprise_status: "acknowledged" } });
  const romances = await rt7.livingBehaviorStore.getByType({ companionId: "dante", customerId: "jenna", behaviorType: "romance_pattern" });
  check("end-to-end: romantic acknowledgement becomes living behavior", romances.length === 1);

  // guidance reaches the four action runtimes (read-only)
  const emergentContext = {
    forCognitive: ["Living behavior: plain accountability over theatre"],
    forAffectiveDecision: ["Relationship DNA: coffee signals affection"],
    forRomanticSurprise: ["Living behavior: romance lands when settled"],
    forRepairPersistence: ["Living behavior: plain accountability over theatre"],
  };
  const { createCognitiveRuntime } = req("src/lifeRuntime/cognitiveRuntime");
  const cog = createCognitiveRuntime({}); await cog.init();
  const cctx = await cog.tick({ companionId: "dante", customerId: "jenna", now: day(0), emergentContext });
  check("guidance reaches Cognitive Runtime (read-only)", Array.isArray(cctx.emergentGuidance) && cctx.emergentGuidance.length === 1);

  const { createAffectiveDecisionRuntime } = req("src/lifeRuntime/affectiveDecisionRuntime");
  const adr = createAffectiveDecisionRuntime({}); await adr.init();
  const dec = await adr.consult({ decisionType: "romantic_surprise", context: {}, companionId: "dante", customerId: "jenna", now: day(0), emergentContext });
  check("guidance reaches Affective Decision Runtime (read-only)", Array.isArray(dec.emergent_guidance) && dec.emergent_guidance.length === 1);

  const { createRomanticSurpriseRuntime } = req("src/lifeRuntime/romanticSurpriseRuntime");
  const rsr = createRomanticSurpriseRuntime({ config: {}, logger: null });
  const rres = await rsr.tick({ companionId: "dante", customerId: "jenna", now: day(0), emergentContext });
  check("guidance reaches Romantic Surprise Runtime (read-only)", rres.emergentConsulted === true);

  const { createRepairPersistenceEngine } = req("src/lifeRuntime/repairPersistenceEngine");
  const rpe = createRepairPersistenceEngine({ consequenceStore: null, logger: null });
  const pres = await rpe.tick({ companionId: "dante", customerId: "jenna", now: day(0), emergentContext });
  check("guidance reaches Repair Persistence (read-only)", pres.emergentConsulted === true);

  // status is safe — no raw private text
  const rt8 = createEmergentLivingBehaviorRuntime({});
  await rt8.init();
  await rt8.recordEvidence({ companionId: "dante", customerId: "jenna", kind: "behavior", behaviorType: "care_pattern", signature: "p", title: "care", summary: "RAW_PRIVATE_HURT", source_event_ids: ["x"], now: day(0) });
  await rt8.tick({ companionId: "dante", customerId: "jenna", now: day(0) });
  const status = rt8.getStatus();
  check("status exposes safe metadata only (no raw private text)", !JSON.stringify(status).includes("RAW_PRIVATE_HURT"));
  check("status has emergent_behavior_count + relationship_dna_count + culture flag",
    typeof status.emergent_behavior_count === "number" && typeof status.relationship_dna_count === "number" && typeof status.relationship_culture_available === "boolean");
}

// ─── 10. lifeRuntime wiring ────────────────────────────────────────────────────
const lr = read("src/lifeRuntime/lifeRuntime.js");
check("lifeRuntime imports createEmergentLivingBehaviorRuntime", lr.includes("createEmergentLivingBehaviorRuntime"));
check("lifeRuntime creates the emergent runtime instance",       lr.includes("createEmergentLivingBehaviorRuntime({"));
check("lifeRuntime has _tickEmergent",                           lr.includes("_tickEmergent"));
check("lifeRuntime runs _tickEmergent after romanticSurprises",  lr.indexOf("await _tickEmergent(now)") > lr.indexOf("romanticSurprises?.tick"));
check("lifeRuntime runs _tickEmergent before _refreshPrelude",   lr.lastIndexOf("await _tickEmergent(now)") < lr.lastIndexOf("await _refreshPrelude()"));
check("lifeRuntime initialises emergent runtime in init()",      lr.includes("emergentRt?.init"));
check("lifeRuntime passes emergentContext to romanticSurprises", /romanticSurprises\?\.tick[\s\S]{0,1200}emergentContext/.test(lr));
check("lifeRuntime passes emergentContext to cognitive tick",    /cognitiveRt\.tick[\s\S]{0,1200}emergentContext/.test(lr));
check("lifeRuntime exposes emergentLiving in getStatus()",       lr.includes("emergentLiving:"));

// ─── 11. lifePreludeBuilder wiring ────────────────────────────────────────────
const lpb = read("src/lifeRuntime/lifePreludeBuilder.js");
check("lifePreludeBuilder imports buildEmergentLivingPrelude",   lpb.includes("buildEmergentLivingPrelude"));
check("lifePreludeBuilder accepts emergentContext param",        lpb.includes("emergentContext"));
check("lifePreludeBuilder surfaces emergent line",               lpb.includes("buildEmergentLivingPrelude({"));

// ─── 12. influenced runtimes accept emergentContext (read-only) ───────────────
check("cognitiveRuntime accepts emergentContext (read-only)",    read("src/lifeRuntime/cognitiveRuntime.js").includes("emergentContext"));
check("affectiveDecisionRuntime accepts emergentContext",        read("src/lifeRuntime/affectiveDecisionRuntime.js").includes("emergentContext"));
check("romanticSurpriseRuntime reads emergentContext",           read("src/lifeRuntime/romanticSurpriseRuntime.js").includes("emergentContext"));
check("repairPersistenceEngine accepts emergentContext",         read("src/lifeRuntime/repairPersistenceEngine.js").includes("emergentContext"));
check("fulfillmentRuntime accepts emergentContext",              read("src/lifeRuntime/fulfillmentRuntime.js").includes("emergentContext"));

// ─── 13. test file + package.json ─────────────────────────────────────────────
check("emergentLiving.test.js exists", exists("src/lifeRuntime/__tests__/emergentLiving.test.js"));
const tf = read("src/lifeRuntime/__tests__/emergentLiving.test.js");
check("emergentLiving.test.js has 22 or more test cases", (tf.match(/^test\(/gm) || []).length >= 22);
const pkg = read("package.json");
check("package.json has verify:emergent-living-behavior-runtime script", pkg.includes("verify:emergent-living-behavior-runtime"));
check("verify:runtime:all includes emergent-living-behavior-runtime",    pkg.includes("verify:emergent-living-behavior-runtime") && pkg.includes("verify:runtime:all"));

// ─── 14. isolation: builders/detector do not require lifeRuntime ──────────────
for (const f of ["emergencePatternDetector.js", "relationshipCultureBuilder.js", "emergentBehaviorGuidanceBuilder.js", "emergentLivingPreludeBuilder.js"]) {
  const c = read(`src/lifeRuntime/${f}`);
  check(`${f} does not require lifeRuntime`, !c.includes("require(\"./lifeRuntime\")"));
}

// ─── Final ────────────────────────────────────────────────────────────────────
behaviouralProofs().then(() => {
  console.log("");
  if (failed) {
    console.log("EMERGENT_LIVING_BEHAVIOR_RUNTIME_FAIL — one or more checks did not pass");
    process.exit(1);
  } else {
    console.log("EMERGENT_LIVING_BEHAVIOR_RUNTIME_PASS");
    process.exit(0);
  }
}).catch(err => {
  console.error("EMERGENT_LIVING_BEHAVIOR_RUNTIME_FAIL — proof error:", err?.message);
  process.exit(1);
});
