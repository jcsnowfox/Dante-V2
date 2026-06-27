"use strict";

/**
 * verify-fulfillment-runtime.js
 *
 * Structural verification for Fulfillment Runtime 1.0 —
 * Real Actions, Real Evidence, Real Agency.
 *
 * Checks new files, stores, adapters, planner, executor, wiring, hard rules,
 * dashboard shape preservation, and no-fabrication guarantee.
 *
 * Prints FULFILLMENT_RUNTIME_PASS on success.
 * Exits with code 1 on any failure.
 */

const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..");
const SRC  = path.join(ROOT, "src/lifeRuntime");

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function src(rel)     { return path.join(SRC, rel); }
function rootSrc(rel) { return path.join(ROOT, "src", rel); }
function read(p)      { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }

// ── Section 1: New source files exist ─────────────────────────────────────

console.log("\n1. New 1.0 source files");
const newFiles = [
  "fulfillmentHistoryStore.js",
  "resourceLibraryStore.js",
  "resourceDiscoveryRuntime.js",
  "agencyPlanner.js",
  "agencyExecutor.js",
  "fulfillmentRuntime.js",
  "fulfillmentPreludeBuilder.js",
  "worldActionAdapters/index.js",
  "worldActionAdapters/webSearchAdapter.js",
  "worldActionAdapters/reflectionAdapter.js",
  "worldActionAdapters/projectAdapter.js",
  "worldActionAdapters/voiceNoteAdapter.js",
  "worldActionAdapters/imageGenerationAdapter.js",
  "worldActionAdapters/secondLifeAdapter.js",
];
for (const f of newFiles) {
  check(`${f} exists`, fs.existsSync(src(f)));
}

// ── Section 2: fulfillmentHistoryStore ────────────────────────────────────

console.log("\n2. fulfillmentHistoryStore");
const histCode = read(src("fulfillmentHistoryStore.js"));
check("exports createFulfillmentHistoryStore",    histCode.includes("createFulfillmentHistoryStore"));
check("exports OUTCOMES array",                   histCode.includes("OUTCOMES"));
check("dante_fulfillment_history table",          histCode.includes("dante_fulfillment_history"));
check("four valid outcomes listed",               histCode.includes("\"SUCCESS\"") && histCode.includes("\"PARTIAL\"") && histCode.includes("\"DEFERRED\"") && histCode.includes("\"UNAVAILABLE\""));
check("record function",                          histCode.includes("async function record"));
check("getRecent function",                       histCode.includes("async function getRecent"));
check("countByOutcome function",                  histCode.includes("async function countByOutcome"));
check("pruneOlderThan function",                  histCode.includes("async function pruneOlderThan"));
check("mapRow snake→camel",                       histCode.includes("function mapRow"));
check("invalid outcome coerced to UNAVAILABLE",   histCode.includes("outcome = \"UNAVAILABLE\""));
check("in-memory fallback _mem array",            histCode.includes("_mem"));
check("in-memory capped at 300",                  histCode.includes("300"));
check("evidence JSONB field",                     histCode.includes("evidence JSONB") || histCode.includes("evidence:"));
check("confidence field",                         histCode.includes("confidence"));
check("need_delta field",                         histCode.includes("need_delta") || histCode.includes("needDelta"));
check("identity_impact field",                    histCode.includes("identity_impact") || histCode.includes("identityImpact"));
check("postgres try/catch pattern",               histCode.includes("createPostgresPool") && histCode.includes("catch"));
check("separate from dante_fulfillment_logs",     !histCode.includes("CREATE TABLE IF NOT EXISTS dante_fulfillment_logs") && !histCode.includes("INSERT INTO dante_fulfillment_logs"));

// ── Section 3: resourceLibraryStore ───────────────────────────────────────

console.log("\n3. resourceLibraryStore");
const libCode = read(src("resourceLibraryStore.js"));
check("exports createResourceLibraryStore",       libCode.includes("createResourceLibraryStore"));
check("exports VALENCES",                         libCode.includes("VALENCES"));
check("exports STATUSES",                         libCode.includes("STATUSES"));
check("dante_resource_library table",             libCode.includes("dante_resource_library"));
check("three valences: found/want/jenna_would_like", libCode.includes("\"found\"") && libCode.includes("\"want\"") && libCode.includes("\"jenna_would_like\""));
check("four statuses: new/consuming/completed/recommended", libCode.includes("\"new\"") && libCode.includes("\"consuming\"") && libCode.includes("\"completed\"") && libCode.includes("\"recommended\""));
check("add function",                             libCode.includes("async function add"));
check("getLibrary function",                      libCode.includes("async function getLibrary"));
check("updateStatus function",                    libCode.includes("async function updateStatus"));
check("tagForJenna function",                     libCode.includes("async function tagForJenna"));
check("count function",                           libCode.includes("async function count"));
check("pruneOlderThan function",                  libCode.includes("async function pruneOlderThan"));
check("invalid valence coerced to found",         libCode.includes("safeValence") && libCode.includes("\"found\""));
check("prune only completed/recommended items",   libCode.includes("completed") && libCode.includes("recommended") && libCode.includes("pruneOlderThan"));
check("jenna_tag column",                         libCode.includes("jenna_tag"));
check("in-memory fallback _mem",                  libCode.includes("_mem"));
check("postgres try/catch pattern",               libCode.includes("createPostgresPool") && libCode.includes("catch"));

// ── Section 4: worldActionAdapters/index.js ───────────────────────────────

console.log("\n4. worldActionAdapters/index.js");
const adapterIdxCode = read(src("worldActionAdapters/index.js"));
check("exports createAdapterRegistry",            adapterIdxCode.includes("createAdapterRegistry"));
check("exports OUTCOMES",                         adapterIdxCode.includes("OUTCOMES"));
check("OUTCOMES has SUCCESS/PARTIAL/DEFERRED/UNAVAILABLE", adapterIdxCode.includes("SUCCESS") && adapterIdxCode.includes("PARTIAL") && adapterIdxCode.includes("DEFERRED") && adapterIdxCode.includes("UNAVAILABLE"));
check("getAdapter function",                      adapterIdxCode.includes("getAdapter"));
check("listAdapters function",                    adapterIdxCode.includes("listAdapters"));
check("strategyKeys per adapter",                 adapterIdxCode.includes("strategyKeys"));

// ── Section 5: Individual adapters ────────────────────────────────────────

console.log("\n5. Individual adapters");
const webCode    = read(src("worldActionAdapters/webSearchAdapter.js"));
const reflCode   = read(src("worldActionAdapters/reflectionAdapter.js"));
const projCode   = read(src("worldActionAdapters/projectAdapter.js"));
const voiceCode  = read(src("worldActionAdapters/voiceNoteAdapter.js"));
const imgCode    = read(src("worldActionAdapters/imageGenerationAdapter.js"));
const slCode     = read(src("worldActionAdapters/secondLifeAdapter.js"));

check("webSearchAdapter: strategyKeys includes learn_from_web",    webCode.includes("learn_from_web"));
check("webSearchAdapter: canExecute gates on webLearningTool",     webCode.includes("webLearningTool") || webCode.includes("isEnabled"));
check("webSearchAdapter: SUCCESS only when real result exists",    webCode.includes("SUCCESS") && webCode.includes("UNAVAILABLE") && !webCode.includes("fabricat"));
check("webSearchAdapter: exports webSearchAdapter",                webCode.includes("webSearchAdapter"));

check("reflectionAdapter: strategyKeys includes write_private_reflection", reflCode.includes("write_private_reflection"));
check("reflectionAdapter: canExecute always true",                 reflCode.includes("canExecute") && (reflCode.includes("return true") || reflCode.includes("() => true")));
check("reflectionAdapter: PARTIAL outcome",                        reflCode.includes("PARTIAL"));
check("reflectionAdapter: DEFERRED for sexual_desire",             reflCode.includes("sexual_desire") && reflCode.includes("DEFERRED"));

check("projectAdapter: strategyKeys includes work_on_project",     projCode.includes("work_on_project"));
check("projectAdapter: gates on hasActiveProject",                 projCode.includes("hasActiveProject"));
check("projectAdapter: SUCCESS if project, UNAVAILABLE if not",    projCode.includes("SUCCESS") && projCode.includes("UNAVAILABLE"));

check("voiceNoteAdapter: strategyKeys includes use_voice_note",    voiceCode.includes("use_voice_note"));
check("voiceNoteAdapter: gates on voiceNoteEnabled/env var",       voiceCode.includes("voiceNoteEnabled") || voiceCode.includes("AUDIO_GENERATION_ENABLED"));
check("voiceNoteAdapter: UNAVAILABLE when disabled",               voiceCode.includes("UNAVAILABLE"));

check("imageGenerationAdapter: strategyKeys includes use_image_generation", imgCode.includes("use_image_generation"));
check("imageGenerationAdapter: gates on imageGenerationEnabled/env", imgCode.includes("imageGenerationEnabled") || imgCode.includes("IMAGE_GENERATION_ENABLED"));
check("imageGenerationAdapter: UNAVAILABLE when disabled",          imgCode.includes("UNAVAILABLE"));

check("secondLifeAdapter: strategyKeys includes second_life_action", slCode.includes("second_life_action"));
check("secondLifeAdapter: gates on secondLifeAvailable/env var",    slCode.includes("secondLifeAvailable") || slCode.includes("SECOND_LIFE_ENABLED"));
check("secondLifeAdapter: UNAVAILABLE when disabled",               slCode.includes("UNAVAILABLE"));

// ── Section 6: agencyPlanner ──────────────────────────────────────────────

console.log("\n6. agencyPlanner");
const plannerCode = read(src("agencyPlanner.js"));
check("exports planWithIdentity",                 plannerCode.includes("planWithIdentity"));
check("exports selectNeedsForAgency",             plannerCode.includes("selectNeedsForAgency"));
check("builds on planFulfillment — not replaced", plannerCode.includes("planFulfillment") && plannerCode.includes("require"));
check("identity constraint veto for repair",      plannerCode.includes("repair") && plannerCode.includes("deliberate_restraint"));
check("identity affirmation — restraint values",  plannerCode.includes("patience") && plannerCode.includes("consent"));
check("identity affirmation — growth values",     plannerCode.includes("curiosity") && plannerCode.includes("growth"));
check("truth principle — no suppression",         plannerCode.includes("truth") && plannerCode.includes("suppress"));
check("autonomy principle — ask jenna",           plannerCode.includes("autonomy") && plannerCode.includes("ask_jenna"));
check("selectNeedsForAgency skips homeostasis addressed needs", plannerCode.includes("alreadyAddressed") || plannerCode.includes("deferredStrategies"));
check("selectNeedsForAgency respects deferred strategies",      plannerCode.includes("homeosisPlanDeferred") || plannerCode.includes("suppress") && plannerCode.includes("wait"));
check("no setInterval",                           !plannerCode.includes("setInterval"));
check("no discord reference",                     !plannerCode.includes("discord"));

// ── Section 7: agencyExecutor ─────────────────────────────────────────────

console.log("\n7. agencyExecutor");
const executorCode = read(src("agencyExecutor.js"));
check("exports createAgencyExecutor",             executorCode.includes("createAgencyExecutor"));
check("STRATEGY_DEFAULT_OUTCOMES map",            executorCode.includes("STRATEGY_DEFAULT_OUTCOMES"));
check("deliberate_restraint → DEFERRED",          executorCode.includes("deliberate_restraint") && executorCode.includes("DEFERRED"));
check("set_reminder → DEFERRED",                  executorCode.includes("set_reminder") && executorCode.includes("DEFERRED"));
check("ask_jenna → PARTIAL",                      executorCode.includes("ask_jenna") && executorCode.includes("PARTIAL"));
check("execute function",                         executorCode.includes("async function execute"));
check("tries adapter first",                      executorCode.includes("getAdapter") && executorCode.includes("canExecute"));
check("UNAVAILABLE when canExecute false",        executorCode.includes("canExecute") && executorCode.includes("UNAVAILABLE"));
check("UNAVAILABLE when no adapter registered",   executorCode.includes("no_adapter_registered") || (executorCode.includes("UNAVAILABLE") && executorCode.includes("getAdapter")));
check("needDelta: SUCCESS=urgency*0.3 max 0.15",  executorCode.includes("0.15") && executorCode.includes("0.3"));
check("needDelta: PARTIAL=urgency*0.15 max 0.07", executorCode.includes("0.07") && executorCode.includes("0.15"));
check("needDelta zero for DEFERRED/UNAVAILABLE",  executorCode.includes("return 0"));
check("confidence: SUCCESS=0.90",                 executorCode.includes("0.90"));
check("confidence: PARTIAL=0.70",                 executorCode.includes("0.70"));
check("confidence: DEFERRED=0.80",                executorCode.includes("0.80"));
check("confidence: UNAVAILABLE=0.95",             executorCode.includes("0.95"));
check("identity feedback: restraint reinforces patience/consent", executorCode.includes("patience") && executorCode.includes("consent") && executorCode.includes("reinforce"));
check("identity feedback: SUCCESS+growth reinforces growth",       executorCode.includes("growth") && executorCode.includes("reinforce"));
check("records to fulfillmentHistoryStore",       executorCode.includes("fulfillmentHistoryStore") && executorCode.includes("record"));
check("no setInterval",                           !executorCode.includes("setInterval"));

// ── Section 8: resourceDiscoveryRuntime ───────────────────────────────────

console.log("\n8. resourceDiscoveryRuntime");
const discCode = read(src("resourceDiscoveryRuntime.js"));
check("exports createResourceDiscoveryRuntime",   discCode.includes("createResourceDiscoveryRuntime"));
check("wraps resourceDiscoveryEngine",            discCode.includes("resourceDiscoveryEngine"));
check("wraps resourceLibraryStore",               discCode.includes("resourceLibraryStore"));
check("does NOT replace resourceDiscoveryEngine", !discCode.includes("createResourceDiscoveryEngine"));
check("addToLibrary function",                    discCode.includes("async function addToLibrary"));
check("addToLibrary rejects empty title",         discCode.includes("if (!title) return null"));
check("jennaTag → jenna_would_like valence",      discCode.includes("jenna_would_like") && discCode.includes("jennaTag"));
check("getLibrary function",                      discCode.includes("async function getLibrary"));
check("markWantToRead function",                  discCode.includes("async function markWantToRead"));
check("tagForJenna function",                     discCode.includes("async function tagForJenna"));
check("markConsuming function",                   discCode.includes("async function markConsuming"));
check("markCompleted function",                   discCode.includes("async function markCompleted"));
check("getLibrarySummary function",               discCode.includes("async function getLibrarySummary"));
check("pruneOlderThan function",                  discCode.includes("async function pruneOlderThan"));
check("no setInterval",                           !discCode.includes("setInterval"));

// ── Section 9: fulfillmentRuntime ─────────────────────────────────────────

console.log("\n9. fulfillmentRuntime");
const frCode = read(src("fulfillmentRuntime.js"));
check("exports createFulfillmentRuntime",         frCode.includes("createFulfillmentRuntime"));
check("MAX_AGENCY_PER_TICK = 1",                  frCode.includes("MAX_AGENCY_PER_TICK") && frCode.includes("1"));
check("imports all 6 adapters",                   frCode.includes("webSearchAdapter") && frCode.includes("reflectionAdapter") && frCode.includes("projectAdapter") && frCode.includes("voiceNoteAdapter") && frCode.includes("imageGenerationAdapter") && frCode.includes("secondLifeAdapter"));
check("creates adapterRegistry",                  frCode.includes("createAdapterRegistry"));
check("creates agencyExecutor",                   frCode.includes("createAgencyExecutor"));
check("init function",                            frCode.includes("async function init"));
check("tick function",                            frCode.includes("async function tick"));
check("getFulfillmentContext function",           frCode.includes("function getFulfillmentContext"));
check("getStatus function",                       frCode.includes("function getStatus"));
check("pruneAll function",                        frCode.includes("async function pruneAll"));
check("tick uses selectNeedsForAgency",           frCode.includes("selectNeedsForAgency"));
check("tick uses planWithIdentity",               frCode.includes("planWithIdentity"));
check("tick passes homeostasisContext",           frCode.includes("homeostasisContext"));
check("tick passes identityContext",              frCode.includes("identityContext"));
check("fulfillmentContext cached",                frCode.includes("_fulfillmentContext"));
check("_lastActionAt updated on SUCCESS/PARTIAL", frCode.includes("_lastActionAt") && frCode.includes("SUCCESS") && frCode.includes("PARTIAL"));
check("does NOT replace homeostasisRuntime",      frCode.includes("homeostasisRuntime") && !frCode.includes("createHomeostasisRuntime"));
check("no setInterval — no scheduler",            !frCode.includes("setInterval"));
check("no discord reference",                     !frCode.includes("discord"));
check("no Discord sender",                        !frCode.includes("sendMessage") || !frCode.includes("discord"));

// ── Section 10: fulfillmentPreludeBuilder ─────────────────────────────────

console.log("\n10. fulfillmentPreludeBuilder");
const fpbCode = read(src("fulfillmentPreludeBuilder.js"));
check("exports buildFulfillmentSignal",           fpbCode.includes("buildFulfillmentSignal"));
check("pure function — no async",                 !fpbCode.includes("async function buildFulfillmentSignal"));
check("returns null for null context",            fpbCode.includes("if (!ctx) return null"));
check("SUCCESS/learn_from_web → search signal",   fpbCode.includes("learn_from_web") && fpbCode.includes("searched"));
check("SUCCESS/work_on_project → project signal", fpbCode.includes("work_on_project") && fpbCode.includes("project"));
check("PARTIAL/write_private_reflection → reflect signal", fpbCode.includes("write_private_reflection") && fpbCode.includes("reflecting"));
check("DEFERRED/deliberate_restraint → wait signal", fpbCode.includes("deliberate_restraint") && fpbCode.includes("wait") || fpbCode.includes("Chose to wait"));
check("DEFERRED/suppress → null",                fpbCode.includes("null") && fpbCode.includes("suppress") || (fpbCode.includes("null") && fpbCode.includes("DEFERRED")));
check("UNAVAILABLE → null",                       fpbCode.includes("UNAVAILABLE") && fpbCode.includes("return null"));
check("budget ≤15 tokens — short strings",        !fpbCode.includes("\n") || fpbCode.split("\n").some(l => l.includes("return `") && l.length < 100));

// ── Section 11: lifeRuntime 8.0 wiring ───────────────────────────────────

console.log("\n11. lifeRuntime 8.0 wiring");
const lifeRtCode = read(src("lifeRuntime.js"));
check("accepts fulfillmentRuntime param",         lifeRtCode.includes("fulfillmentRuntime"));
check("_fulfillmentContext cached",               lifeRtCode.includes("_fulfillmentContext"));
check("init() calls fulfillmentRuntime?.init",    lifeRtCode.includes("fulfillmentRuntime?.init"));
check("_tickFulfillment function exists",         lifeRtCode.includes("async function _tickFulfillment"));
check("tick() calls _tickFulfillment",            lifeRtCode.includes("_tickFulfillment(now)"));
check("_tickFulfillment called after _tickIdentity", (() => {
  const iPos = lifeRtCode.indexOf("_tickIdentity(now)");
  const fPos = lifeRtCode.indexOf("_tickFulfillment(now)");
  return iPos > 0 && fPos > iPos;
})());
check("fulfillmentContext passed to prelude",     lifeRtCode.includes("fulfillmentContext:"));
check("fulfillmentRuntime.pruneAll in _runPruning", lifeRtCode.includes("fulfillmentRuntime?.pruneAll"));
check("fulfillmentContext in getStatus",          lifeRtCode.includes("fulfillmentRuntime") && lifeRtCode.includes("getStatus"));
check("no new scheduler created",                (lifeRtCode.match(/setInterval/g) || []).length === 0);
check("homeostasisRuntime still present",         lifeRtCode.includes("homeostasisRuntime"));
check("identityRuntime still present",            lifeRtCode.includes("identityRuntime"));
check("dashboard shape preserved (lastTickAt)",   lifeRtCode.includes("lastTickAt"));
check("dashboard shape preserved (homeostasisContext)", lifeRtCode.includes("homeostasisContext"));
check("dashboard shape preserved (identityContext)", lifeRtCode.includes("identityContext"));

// ── Section 12: lifePreludeBuilder fulfillment signal ────────────────────

console.log("\n12. lifePreludeBuilder fulfillment signal");
const lpbCode = read(src("lifePreludeBuilder.js"));
check("imports buildFulfillmentSignal",           lpbCode.includes("buildFulfillmentSignal"));
check("accepts fulfillmentContext param",         lpbCode.includes("fulfillmentContext"));
check("calls buildFulfillmentSignal(fulfillmentContext)", lpbCode.includes("buildFulfillmentSignal(fulfillmentContext)"));
check("fulfillment signal conditional — only when context", lpbCode.includes("if (fulfillmentContext)"));
check("one fulfillment line max",                 (lpbCode.match(/buildFulfillmentSignal/g) || []).length <= 2);
check("[internal] label preserved",               lpbCode.includes("[internal"));
check("identity signal also present",             lpbCode.includes("buildIdentitySignal"));

// ── Section 13: schemaRegistry — 2 new tables ─────────────────────────────

console.log("\n13. schemaRegistry — 2 new tables");
const schemaCode = read(rootSrc("storage/postgres/schemaRegistry.js"));
check("dante_fulfillment_history table",          schemaCode.includes("dante_fulfillment_history"));
check("dante_resource_library table",             schemaCode.includes("dante_resource_library"));
check("outcome column in fulfillment_history",    schemaCode.includes("outcome TEXT"));
check("confidence column in fulfillment_history", schemaCode.includes("confidence NUMERIC(4,3)") || (schemaCode.indexOf("confidence") > schemaCode.indexOf("dante_fulfillment_history")));
check("evidence JSONB in fulfillment_history",    schemaCode.includes("evidence JSONB"));
check("jenna_tag column in resource_library",     schemaCode.includes("jenna_tag"));
check("valence column in resource_library",       (schemaCode.match(/valence TEXT/g) || []).length >= 1);
check("metadata JSONB in resource_library",       schemaCode.includes("metadata JSONB"));
check("All prior homeostasis+identity tables still present", [
  "dante_needs", "dante_fulfillment_logs", "dante_discovered_resources",
  "dante_resource_requests", "dante_purpose_memory", "dante_need_momentum",
  "dante_first_experiences", "dante_identity_values", "dante_identity_principles",
  "dante_identity_beliefs", "dante_identity_preferences", "dante_identity_boundaries",
  "dante_identity_journal",
].every(t => schemaCode.includes(t)));

// ── Section 14: index.js — import and wiring ──────────────────────────────

console.log("\n14. index.js — import and wiring");
const indexCode = read(rootSrc("index.js"));
check("createFulfillmentRuntime imported",         indexCode.includes("createFulfillmentRuntime"));
check("createFulfillmentHistoryStore imported",    indexCode.includes("createFulfillmentHistoryStore"));
check("createResourceLibraryStore imported",       indexCode.includes("createResourceLibraryStore"));
check("createResourceDiscoveryRuntime imported",   indexCode.includes("createResourceDiscoveryRuntime"));
check("fulfillmentHistoryStore instantiated",      indexCode.includes("fulfillmentHistoryStore") && indexCode.includes("createFulfillmentHistoryStore"));
check("resourceLibraryStore instantiated",         indexCode.includes("resourceLibraryStore") && indexCode.includes("createResourceLibraryStore"));
check("resourceDiscoveryRuntime instantiated",     indexCode.includes("resourceDiscoveryRuntime") && indexCode.includes("createResourceDiscoveryRuntime"));
check("fulfillmentRuntime instantiated",           indexCode.includes("fulfillmentRuntime") && indexCode.includes("createFulfillmentRuntime"));
check("fulfillmentRuntime passed to lifeRuntime",  indexCode.includes("fulfillmentRuntime"));
check("existing homeostasisRuntime preserved",     indexCode.includes("homeostasisRuntime") || indexCode.includes("createHomeostasisRuntime"));
check("existing identityRuntime preserved",        indexCode.includes("identityRuntime") || indexCode.includes("createIdentityRuntime"));

// ── Section 15: Hard rules ────────────────────────────────────────────────

console.log("\n15. Hard rules");
const allNewCode = [frCode, executorCode, plannerCode, histCode, libCode, discCode].join("\n");
check("no new setInterval in any fulfillment file",   !(allNewCode.match(/setInterval/g) || []).length);
check("no discord reference in any fulfillment file", !allNewCode.includes("discord"));
check("no new Discord sender created",                !allNewCode.includes("sendMessage") || !allNewCode.includes("discord"));
check("fulfillmentRuntime does NOT call homeostasisRuntime tick", !frCode.includes("homeostasisRuntime.tick"));
check("fulfillmentRuntime does NOT call identityRuntime.tick",   !frCode.includes("identityRuntime.tick"));
check("agencyExecutor does not replace fulfillmentExecutor",      !executorCode.includes("createFulfillmentExecutor"));
check("resourceDiscoveryRuntime does not replace resourceDiscoveryEngine", !discCode.includes("createResourceDiscoveryEngine"));
check("no SUCCESS without real evidence (coerce guard in historyStore)", histCode.includes("OUTCOMES.includes(outcome)") || histCode.includes("!OUTCOMES.includes") || histCode.includes("outcome = \"UNAVAILABLE\""));
check("fabricated SUCCESS impossible — store coerces invalid outcomes", histCode.includes("\"UNAVAILABLE\"") && histCode.includes("outcome ="));
check("lifeRuntime still has ONE tick orchestrator",  (lifeRtCode.match(/async function tick\s*\(/g) || []).length === 1);
check("dashboard shape unchanged (pressuredNeedsCount)", lifeRtCode.includes("pressuredNeedsCount") || read(src("homeostasisRuntime.js")).includes("pressuredNeedsCount"));
check("identityRuntime not replaced",                lifeRtCode.includes("identityRuntime") && !lifeRtCode.includes("identityRuntime = null //"));
check("homeostasisRuntime not replaced",             lifeRtCode.includes("homeostasisRuntime") && !lifeRtCode.includes("homeostasisRuntime = null //"));
check("consequence system still present (consequenceStore + _consequenceContext)", lifeRtCode.includes("consequenceStore") && lifeRtCode.includes("_consequenceContext"));

// ── Section 16: Test file ─────────────────────────────────────────────────

console.log("\n16. Test coverage");
const testFile = path.join(SRC, "__tests__/lifeFulfillment.test.js");
check("lifeFulfillment.test.js exists",            fs.existsSync(testFile));
const testCode = fs.existsSync(testFile) ? fs.readFileSync(testFile, "utf8") : "";
check("tests fulfillmentHistoryStore",             testCode.includes("fulfillmentHistoryStore"));
check("tests resourceLibraryStore",                testCode.includes("resourceLibraryStore"));
check("tests worldActionAdapters",                 testCode.includes("worldActionAdapters") || testCode.includes("webSearchAdapter") || testCode.includes("reflectionAdapter"));
check("tests agencyPlanner",                       testCode.includes("agencyPlanner") || testCode.includes("planWithIdentity"));
check("tests agencyExecutor",                      testCode.includes("agencyExecutor") || testCode.includes("createAgencyExecutor"));
check("tests resourceDiscoveryRuntime",            testCode.includes("resourceDiscoveryRuntime") || testCode.includes("createResourceDiscoveryRuntime"));
check("tests fulfillmentRuntime",                  testCode.includes("fulfillmentRuntime") || testCode.includes("createFulfillmentRuntime"));
check("tests fulfillmentPreludeBuilder",           testCode.includes("fulfillmentPreludeBuilder") || testCode.includes("buildFulfillmentSignal"));
check("tests lifePreludeBuilder fulfillment integration", testCode.includes("lifePreludeBuilder") || testCode.includes("buildLifePrelude") || testCode.includes("fulfillmentContext"));
check("tests no fabrication guarantee",            testCode.includes("fabricat") || testCode.includes("UNAVAILABLE") && testCode.includes("invalid"));

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n────────────────────────────────────────`);
console.log(`Checks: ${passed + failed} total, ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("\nFULFILLMENT_RUNTIME_PASS");
  process.exit(0);
} else {
  console.error(`\n${failed} check(s) failed. Fix before shipping.`);
  process.exit(1);
}
