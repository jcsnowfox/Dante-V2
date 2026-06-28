#!/usr/bin/env node
"use strict";

/**
 * verify-cognitive-runtime.js
 *
 * Verifies all structural invariants for Dante Cognitive Runtime 1.0.
 * Expected final output: COGNITIVE_RUNTIME_PASS
 *
 * Run: node artifacts/ghostlight-bot/scripts/verify-cognitive-runtime.js
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

// ─── 1. All seven core cognitive files exist ──────────────────────────────────
const files = [
  "src/lifeRuntime/cognitiveLedgerStore.js",
  "src/lifeRuntime/cognitivePlanStore.js",
  "src/lifeRuntime/cognitiveContextBuilder.js",
  "src/lifeRuntime/thoughtCandidateEngine.js",
  "src/lifeRuntime/internalConflictResolver.js",
  "src/lifeRuntime/cognitivePreludeBuilder.js",
  "src/lifeRuntime/cognitiveRuntime.js",
];
for (const f of files) {
  check(`${path.basename(f)} exists`, exists(f));
}

// ─── 2. cognitiveLedgerStore: shape and constants ────────────────────────────
const cls = read("src/lifeRuntime/cognitiveLedgerStore.js");
check("cognitiveLedgerStore exports createCognitiveLedgerStore",  cls.includes("createCognitiveLedgerStore"));
check("cognitiveLedgerStore exports THOUGHT_TYPES",               cls.includes("THOUGHT_TYPES"));
check("cognitiveLedgerStore exports COGNITIVE_OUTCOMES",          cls.includes("COGNITIVE_OUTCOMES"));
check("cognitiveLedgerStore has 13 thought types",                (cls.match(/"[a-z_]+"/g) || []).join(",").includes("silence_choice"));
check("cognitiveLedgerStore has no setInterval",                  !cls.includes("setInterval"));
check("cognitiveLedgerStore has no channel.send",                 !cls.includes("channel.send"));
check("cognitiveLedgerStore has no require discord",              !cls.includes("require(\"discord"));
check("cognitiveLedgerStore MAX_MEM_SIZE caps growth",            cls.includes("MAX_MEM_SIZE"));

// ─── 3. cognitivePlanStore: shape and constants ───────────────────────────────
const cps = read("src/lifeRuntime/cognitivePlanStore.js");
check("cognitivePlanStore exports createCognitivePlanStore",  cps.includes("createCognitivePlanStore"));
check("cognitivePlanStore exports PLAN_TYPES",                cps.includes("PLAN_TYPES"));
check("cognitivePlanStore exports PLAN_STATUSES",             cps.includes("PLAN_STATUSES"));
check("cognitivePlanStore has repair_plan",                   cps.includes("repair_plan"));
check("cognitivePlanStore has private_reflection_plan",       cps.includes("private_reflection_plan"));
check("cognitivePlanStore has no setInterval",                !cps.includes("setInterval"));
check("cognitivePlanStore has no channel.send",               !cps.includes("channel.send"));
check("cognitivePlanStore caps active plans",                 cps.includes("MAX_ACTIVE_PLANS"));

// ─── 4. cognitiveContextBuilder: pure function shape ─────────────────────────
const ccb = read("src/lifeRuntime/cognitiveContextBuilder.js");
check("cognitiveContextBuilder exports buildCognitiveInput",  ccb.includes("buildCognitiveInput"));
check("cognitiveContextBuilder is synchronous (no async)",    !ccb.includes("async function buildCognitiveInput"));
check("cognitiveContextBuilder uses Object.freeze",           ccb.includes("Object.freeze"));
check("cognitiveContextBuilder has no side effects",          !ccb.includes("setInterval") && !ccb.includes("channel.send"));
check("cognitiveContextBuilder reads consequenceContext",      ccb.includes("consequenceContext"));
check("cognitiveContextBuilder reads worldModelContext",       ccb.includes("worldModelContext"));
check("cognitiveContextBuilder reads perceptionContext",       ccb.includes("perceptionContext"));
check("cognitiveContextBuilder reads selfInspectionContext",   ccb.includes("selfInspectionContext"));
check("cognitiveContextBuilder computes quietHours",          ccb.includes("quietHours"));
check("cognitiveContextBuilder exports jenna state",          ccb.includes("giveSpaceActive"));

// ─── 5. thoughtCandidateEngine: pure function, all thought types ──────────────
const tce = read("src/lifeRuntime/thoughtCandidateEngine.js");
check("thoughtCandidateEngine exports generateThoughtCandidates", tce.includes("generateThoughtCandidates"));
check("thoughtCandidateEngine is synchronous (no async)",         !tce.includes("async function generateThoughtCandidates"));
check("thoughtCandidateEngine has no side effects",               !tce.includes("setInterval") && !tce.includes("channel.send"));
check("thoughtCandidateEngine handles evidence_warning",          tce.includes("evidence_warning"));
check("thoughtCandidateEngine handles restraint (giveSpace)",     tce.includes("giveSpaceActive"));
check("thoughtCandidateEngine handles repair_thought",            tce.includes("repair_thought"));
check("thoughtCandidateEngine handles romantic_thought",          tce.includes("romantic_thought"));
check("thoughtCandidateEngine handles doubt",                     tce.includes("doubt"));
check("thoughtCandidateEngine handles silence_choice",            tce.includes("silence_choice"));
check("thoughtCandidateEngine handles curiosity_thought",         tce.includes("curiosity_thought"));
check("thoughtCandidateEngine handles planning_thought",          tce.includes("planning_thought"));
check("thoughtCandidateEngine handles identity_thought",          tce.includes("identity_thought"));
check("thoughtCandidateEngine sorts by weight descending",        tce.includes(".sort("));
check("thoughtCandidateEngine requires THOUGHT_TYPES from ledger", tce.includes("cognitiveLedgerStore"));

// ─── 6. internalConflictResolver: pure function, priority order ───────────────
const icr = read("src/lifeRuntime/internalConflictResolver.js");
check("internalConflictResolver exports resolveConflicts",           icr.includes("resolveConflicts"));
check("internalConflictResolver is synchronous (no async)",          !icr.includes("async function resolveConflicts"));
check("internalConflictResolver has no side effects",                !icr.includes("setInterval") && !icr.includes("channel.send"));
check("internalConflictResolver priority 1: evidence integrity",     icr.includes("evidence_warning"));
check("internalConflictResolver priority 2: give space",             icr.includes("giveSpaceActive"));
check("internalConflictResolver priority 3: repair over romantic",   icr.includes("repair_vs_romantic") || icr.includes("repair_thought") && icr.includes("romantic_thought"));
check("internalConflictResolver priority 4: evidence vs action",     icr.includes("evidence_warning_vs_action") || icr.includes("evidence"));
check("internalConflictResolver priority 5: quiet hours",            icr.includes("quietHours"));
check("internalConflictResolver detects restraint_vs_romantic",      icr.includes("restraint_vs_romantic"));
check("internalConflictResolver detects urge_vs_restraint",          icr.includes("urge_vs_restraint"));
check("internalConflictResolver builds recommendations",             icr.includes("_buildRecommendations"));
check("internalConflictResolver uses COGNITIVE_OUTCOMES",            icr.includes("COGNITIVE_OUTCOMES"));

// ─── 7. cognitivePreludeBuilder: pure function, compact signal ───────────────
const cpb = read("src/lifeRuntime/cognitivePreludeBuilder.js");
check("cognitivePreludeBuilder exports buildCognitivePreludeSignal", cpb.includes("buildCognitivePreludeSignal"));
check("cognitivePreludeBuilder is synchronous (no async)",           !cpb.includes("async function buildCognitivePreludeSignal"));
check("cognitivePreludeBuilder caps at 180 chars",                   cpb.includes("180"));
check("cognitivePreludeBuilder handles restraint outcome",           cpb.includes("restraint"));
check("cognitivePreludeBuilder handles conflict outcome",            cpb.includes("conflict"));
check("cognitivePreludeBuilder handles uncertainty outcome",         cpb.includes("uncertainty"));
check("cognitivePreludeBuilder returns null for no_action",          cpb.includes("no_action") && cpb.includes("null"));
check("cognitivePreludeBuilder strips sensitive content",            cpb.includes("SUPPRESSED_RE"));
check("cognitivePreludeBuilder never mentions 'cognitive runtime'",  !cpb.toLowerCase().includes("cognitive runtime"));

// ─── 8. cognitiveRuntime: orchestrator shape ──────────────────────────────────
const cr = read("src/lifeRuntime/cognitiveRuntime.js");
check("cognitiveRuntime exports createCognitiveRuntime",     cr.includes("createCognitiveRuntime"));
check("cognitiveRuntime has init()",                         cr.includes("async function init"));
check("cognitiveRuntime has tick()",                         cr.includes("async function tick"));
check("cognitiveRuntime has getCognitiveContext()",          cr.includes("getCognitiveContext"));
check("cognitiveRuntime has getStatus()",                    cr.includes("function getStatus"));
check("cognitiveRuntime requires cognitiveContextBuilder",   cr.includes("cognitiveContextBuilder"));
check("cognitiveRuntime requires thoughtCandidateEngine",    cr.includes("thoughtCandidateEngine"));
check("cognitiveRuntime requires internalConflictResolver",  cr.includes("internalConflictResolver"));
check("cognitiveRuntime requires cognitivePreludeBuilder",   cr.includes("cognitivePreludeBuilder"));
check("cognitiveRuntime requires cognitiveLedgerStore",      cr.includes("cognitiveLedgerStore"));
check("cognitiveRuntime requires cognitivePlanStore",        cr.includes("cognitivePlanStore"));
check("cognitiveRuntime does NOT send Discord messages",     !cr.includes("channel.send") && !cr.includes("discordSendGateway"));
check("cognitiveRuntime does NOT create schedulers",         !cr.includes("setInterval") && !cr.includes("setTimeout"));
check("cognitiveRuntime does NOT replace existing runtimes", !cr.includes("createLifeRuntime") && !cr.includes("createHomeostasisRuntime"));
check("cognitiveRuntime getStatus has no PII fields",        !cr.includes("primaryThought:") || cr.includes("getCognitiveContext"));

// ─── 9. lifeRuntime wiring ────────────────────────────────────────────────────
const lr = read("src/lifeRuntime/lifeRuntime.js");
check("lifeRuntime imports createCognitiveRuntime",          lr.includes("createCognitiveRuntime"));
check("lifeRuntime creates cognitiveRuntime instance",       lr.includes("createCognitiveRuntime({"));
check("lifeRuntime has _tickCognitive function",             lr.includes("_tickCognitive"));
check("lifeRuntime calls _tickCognitive in tick()",          lr.includes("await _tickCognitive(now)"));
check("lifeRuntime _tickCognitive after _tickWorldModel",    lr.indexOf("_tickCognitive") > lr.indexOf("_tickWorldModel"));
check("lifeRuntime _tickCognitive before romanticSurprises", lr.indexOf("_tickCognitive") < lr.indexOf("romanticSurprises?.tick"));
check("lifeRuntime passes cognitiveContext to romanticSurprises", lr.includes("cognitiveContext: _cognitiveContext"));
check("lifeRuntime passes cognitiveContext to fulfillmentRuntime", /fulfillmentRuntime\.tick[\s\S]{0,300}cognitiveContext/.test(lr));
check("lifeRuntime includes cognitive in getStatus()",       lr.includes("cognitive:"));
check("lifeRuntime initialises cognitiveRuntime in init()",  lr.includes("cognitiveRt?.init"));

// ─── 10. lifePreludeBuilder wiring ────────────────────────────────────────────
const lpb = read("src/lifeRuntime/lifePreludeBuilder.js");
check("lifePreludeBuilder imports buildCognitivePreludeSignal", lpb.includes("buildCognitivePreludeSignal"));
check("lifePreludeBuilder accepts cognitiveContext param",       lpb.includes("cognitiveContext"));
check("lifePreludeBuilder calls buildCognitivePreludeSignal",    lpb.includes("buildCognitivePreludeSignal(cognitiveContext)"));

// ─── 11. influenced runtimes: affectiveDecisionRuntime ────────────────────────
const adr = read("src/lifeRuntime/affectiveDecisionRuntime.js");
check("affectiveDecisionRuntime accepts cognitiveContext in consult()", adr.includes("cognitiveContext = null"));
check("affectiveDecisionRuntime checks restraintActive",               adr.includes("cognitiveContext?.restraintActive"));
check("affectiveDecisionRuntime returns blocking outcome from cognitive", adr.includes("cognitive_restraint"));
check("affectiveDecisionRuntime does NOT fabricate the decision",       adr.includes("source: \"cognitive_runtime\""));

// ─── 12. influenced runtimes: romanticSurpriseRuntime ────────────────────────
const rsr = read("src/lifeRuntime/romanticSurpriseRuntime.js");
check("romanticSurpriseRuntime checks cognitiveContext?.recommendations?.suppressRomantic",
  rsr.includes("cognitiveContext?.recommendations?.suppressRomantic"));
check("romanticSurpriseRuntime blocks with cognitive_restraint reason",
  rsr.includes("cognitive_restraint"));

// ─── 13. influenced runtimes: repairPersistenceEngine ────────────────────────
const rpe = read("src/lifeRuntime/repairPersistenceEngine.js");
check("repairPersistenceEngine tick accepts cognitiveContext", rpe.includes("cognitiveContext = null"));
check("repairPersistenceEngine uses cognitiveContext encourageRepair",
  rpe.includes("cognitiveContext?.recommendations?.encourageRepair"));

// ─── 14. influenced runtimes: fulfillmentRuntime ──────────────────────────────
const fr = read("src/lifeRuntime/fulfillmentRuntime.js");
check("fulfillmentRuntime tick accepts cognitiveContext",          fr.includes("cognitiveContext   = null"));
check("fulfillmentRuntime checks suppressFulfillmentOutreach",     fr.includes("suppressFulfillmentOutreach"));
check("fulfillmentRuntime returns BLOCKED when suppressed",        fr.includes("cognitive_restraint"));

// ─── 15. test file exists ─────────────────────────────────────────────────────
check("cognition.test.js exists", exists("src/lifeRuntime/__tests__/cognition.test.js"));
const ct = read("src/lifeRuntime/__tests__/cognition.test.js");
check("cognition.test.js has 19 or more test cases", (ct.match(/^test\(/gm) || []).length >= 18);

// ─── 16. package.json verify script ──────────────────────────────────────────
const pkg = read("package.json");
check("package.json has verify:cognitive-runtime script", pkg.includes("verify:cognitive-runtime"));
check("verify:runtime:all includes cognitive-runtime",    pkg.includes("verify:cognitive-runtime") && pkg.includes("verify:runtime:all"));

// ─── 17. Runtime isolation: no circular dependencies ─────────────────────────
// Ensure cognitive files do not import life-runtime components that would create cycles
const cogFiles = [
  "src/lifeRuntime/cognitiveContextBuilder.js",
  "src/lifeRuntime/thoughtCandidateEngine.js",
  "src/lifeRuntime/internalConflictResolver.js",
  "src/lifeRuntime/cognitivePreludeBuilder.js",
];
for (const f of cogFiles) {
  const content = read(f);
  check(`${path.basename(f)} does not require lifeRuntime`,   !content.includes("lifeRuntime"));
  check(`${path.basename(f)} does not require homeostasis`,   !content.includes("homeostasisRuntime"));
  check(`${path.basename(f)} does not require fulfillment`,   !content.includes("fulfillmentRuntime"));
}

// ─── Final ────────────────────────────────────────────────────────────────────
console.log("");
if (failed) {
  console.log("COGNITIVE_RUNTIME_FAIL — one or more checks did not pass");
  process.exit(1);
} else {
  console.log("COGNITIVE_RUNTIME_PASS");
  process.exit(0);
}
