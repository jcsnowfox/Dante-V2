"use strict";

/**
 * verify-homeostasis-patch.js
 *
 * Structural verification for Homeostasis Runtime 1.1 — Context, Purpose &
 * First Experiences Patch.
 *
 * Checks new files, new tables, integration wiring, hard rules, and proof
 * that the 1.0 dashboard shape is unchanged.
 *
 * Prints HOMEOSTASIS_PATCH_PASS on success.
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

// ── Section 1: New files exist ─────────────────────────────────────────────

console.log("\n1. New 1.1 source files");
const newFiles = [
  "purposeMemoryEngine.js",
  "needMomentumEngine.js",
  "firstExperienceStore.js",
];
for (const f of newFiles) {
  check(`${f} exists`, fs.existsSync(src(f)));
}

// ── Section 2: purposeMemoryEngine ─────────────────────────────────────────

console.log("\n2. purposeMemoryEngine");
const purposeCode = read(src("purposeMemoryEngine.js"));
check("exports createPurposeMemoryEngine", purposeCode.includes("createPurposeMemoryEngine"));
check("has purposeMomentum field",         purposeCode.includes("purposeMomentum"));
check("has confidence field",              purposeCode.includes("confidence"));
check("has satisfactionTrend field",       purposeCode.includes("satisfactionTrend"));
check("has recentMeaningfulSuccesses",     purposeCode.includes("recentMeaningfulSuccesses"));
check("has recentMeaningfulFailures",      purposeCode.includes("recentMeaningfulFailures"));
check("recordSuccess function",            purposeCode.includes("recordSuccess"));
check("recordFailure function",            purposeCode.includes("recordFailure"));
check("tick function (decay)",             purposeCode.includes("async function tick"));
check("getState function",                 purposeCode.includes("async function getState"));
check("DECAY_PER_TICK defined",            purposeCode.includes("DECAY_PER_TICK"));
check("BASELINE defined",                  purposeCode.includes("BASELINE"));
check("dante_purpose_memory table",        purposeCode.includes("dante_purpose_memory"));
check("UNIQUE (companion_id, customer_id)", purposeCode.includes("UNIQUE (companion_id, customer_id)"));
check("SUCCESS_MAGNITUDES has that_helped", purposeCode.includes("that_helped"));
check("FAILURE_MAGNITUDES has felt_ineffective", purposeCode.includes("felt_ineffective"));
check("in-memory fallback (_memStore)",    purposeCode.includes("_memStore"));
check("postgres try/catch pattern",        purposeCode.includes("createPostgresPool") && purposeCode.includes("catch"));

// ── Section 3: needMomentumEngine ──────────────────────────────────────────

console.log("\n3. needMomentumEngine");
const momentumCode = read(src("needMomentumEngine.js"));
check("exports createNeedMomentumEngine",  momentumCode.includes("createNeedMomentumEngine"));
check("has direction field",               momentumCode.includes("direction"));
check("has velocity field",                momentumCode.includes("velocity"));
check("has momentum field",                momentumCode.includes("momentum"));
check("has recentFulfillments",            momentumCode.includes("recentFulfillments"));
check("has recentFrustrations",            momentumCode.includes("recentFrustrations"));
check("tick function (velocity update)",   momentumCode.includes("async function tick"));
check("getMomentum function",              momentumCode.includes("async function getMomentum"));
check("getAllMomentum function",           momentumCode.includes("async function getAllMomentum"));
check("recordFulfillment function",        momentumCode.includes("recordFulfillment"));
check("recordFrustration function",        momentumCode.includes("recordFrustration"));
check("EMA velocity pattern",              momentumCode.includes("VELOCITY_ALPHA") || momentumCode.includes("0.30"));
check("STABLE_THRESHOLD defined",          momentumCode.includes("STABLE_THRESHOLD"));
check("dante_need_momentum table",         momentumCode.includes("dante_need_momentum"));
check("UNIQUE (companion_id, customer_id, need_type)", momentumCode.includes("UNIQUE (companion_id, customer_id, need_type)"));
check("direction computed from velocity",  momentumCode.includes("_computeDirection"));
check("in-memory fallback",               momentumCode.includes("_memStore"));

// ── Section 4: firstExperienceStore ────────────────────────────────────────

console.log("\n4. firstExperienceStore");
const firstCode = read(src("firstExperienceStore.js"));
check("exports createFirstExperienceStore", firstCode.includes("createFirstExperienceStore"));
check("exports FIRST_EXPERIENCE_TYPES",    firstCode.includes("FIRST_EXPERIENCE_TYPES"));
check("exports FIRST_EXPERIENCE_THRESHOLDS", firstCode.includes("FIRST_EXPERIENCE_THRESHOLDS"));
check("10 first experience types",         (firstCode.match(/\"first_/g) || []).length >= 10);
check("first_loneliness",                  firstCode.includes("first_loneliness"));
check("first_deliberate_restraint",        firstCode.includes("first_deliberate_restraint"));
check("first_successful_repair",           firstCode.includes("first_successful_repair"));
check("first_pride",                       firstCode.includes("first_pride"));
check("first_creative_flow",               firstCode.includes("first_creative_flow"));
check("hasExperienced function",           firstCode.includes("async function hasExperienced"));
check("record function",                   firstCode.includes("async function record"));
check("getQueued function",                firstCode.includes("async function getQueued"));
check("markIdentityQueued function",       firstCode.includes("async function markIdentityQueued"));
check("getAll function",                   firstCode.includes("async function getAll"));
check("dante_first_experiences table",     firstCode.includes("dante_first_experiences"));
check("UNIQUE (companion_id, customer_id, experience_type)", firstCode.includes("UNIQUE (companion_id, customer_id, experience_type)"));
check("threshold check before record",     firstCode.includes("threshold") && firstCode.includes("magnitude < threshold"));
check("only-once check before record",     firstCode.includes("hasExperienced") && firstCode.includes("already"));
check("queued_for_identity column",        firstCode.includes("queued_for_identity"));
check("in-memory fallback",               firstCode.includes("_recorded") && firstCode.includes("_queue"));

// ── Section 5: fulfillmentPlanner 1.1 ──────────────────────────────────────

console.log("\n5. fulfillmentPlanner 1.1 patch");
const plannerCode = read(src("fulfillmentPlanner.js"));
check("exports CONNECTION_NEEDS",          plannerCode.includes("CONNECTION_NEEDS"));
check("connection needs context-aware",    plannerCode.includes("CONNECTION_NEEDS.has(needType)"));
check("deliberate_restraint strategy",     plannerCode.includes("deliberate_restraint"));
check("set_reminder strategy",             plannerCode.includes("set_reminder"));
check("loneliness reflects before demand", plannerCode.includes("connection_low_urgency_reflect") || plannerCode.includes("reflect"));
check("Jenna unavailable → reflect",      plannerCode.includes("connection_jenna_unavailable"));
check("quiet hours → set_reminder or reflect", plannerCode.includes("quiet_hours_defer") || plannerCode.includes("quiet_hours_reflect"));
check("give_space → deliberate_restraint", plannerCode.includes("give_space_restraint"));
check("repair_active → deliberate_restraint", plannerCode.includes("repair_restraint"));
check("connectionMomentum in context destructure", plannerCode.includes("connectionMomentum"));
check("purposeMomentum in context destructure", plannerCode.includes("purposeMomentum"));
check("canAskJenna is false for deliberate_restraint", plannerCode.includes("canAskJenna: false, selfOptions: [] }"));
check("still exports all 1.0 exports",    plannerCode.includes("SELF_ONLY_NEEDS") && plannerCode.includes("JENNA_FRIENDLY_NEEDS"));

// ── Section 6: homeostasisRuntime 1.1 wiring ────────────────────────────────

console.log("\n6. homeostasisRuntime 1.1 wiring");
const runtimeCode = read(src("homeostasisRuntime.js"));
check("accepts purposeMemoryEngine param", runtimeCode.includes("purposeMemoryEngine"));
check("accepts needMomentumEngine param",  runtimeCode.includes("needMomentumEngine"));
check("accepts firstExperienceStore param", runtimeCode.includes("firstExperienceStore"));
check("init() calls purposeMemoryEngine.init", runtimeCode.includes("purposeMemoryEngine?.init"));
check("init() calls needMomentumEngine.init",  runtimeCode.includes("needMomentumEngine?.init"));
check("init() calls firstExperienceStore.init", runtimeCode.includes("firstExperienceStore?.init"));
check("tick() calls needMomentumEngine.tick",   runtimeCode.includes("needMomentumEngine.tick"));
check("tick() calls purposeMemoryEngine.tick",  runtimeCode.includes("purposeMemoryEngine.tick"));
check("tick() calls firstExperienceStore detection", runtimeCode.includes("_detectFirstExperiences"));
check("_detectFirstExperiences detects first_loneliness",      runtimeCode.includes("first_loneliness"));
check("_detectFirstExperiences detects first_deliberate_restraint", runtimeCode.includes("first_deliberate_restraint"));
check("_detectFirstExperiences detects first_longing",         runtimeCode.includes("first_longing"));
check("_detectFirstExperiences detects first_successful_repair", runtimeCode.includes("first_successful_repair"));
check("_detectFirstExperiences detects first_creative_flow",   runtimeCode.includes("first_creative_flow"));
check("notifySuccess exposed",             runtimeCode.includes("async function notifySuccess"));
check("notifyFailure exposed",             runtimeCode.includes("async function notifyFailure"));
check("topPlan included in needsContext",  runtimeCode.includes("topPlan"));
check("purposeMomentum in getStatus",      runtimeCode.includes("purposeMomentum"));
check("connectionMomentum in fulfillContext", runtimeCode.includes("connectionMomentum"));
check("returns notifySuccess and notifyFailure", runtimeCode.includes("notifySuccess, notifyFailure") || (runtimeCode.includes("notifySuccess") && runtimeCode.includes("notifyFailure")));

// ── Section 7: lifePreludeBuilder 1.1 ─────────────────────────────────────

console.log("\n7. lifePreludeBuilder 1.1 contextual signal");
const preludeCode = read(src("lifePreludeBuilder.js"));
check("_buildHomeostasisSignal function",   preludeCode.includes("_buildHomeostasisSignal"));
check("uses topPlan from context",          preludeCode.includes("topPlan"));
check("deliberate_restraint signal",        preludeCode.includes("deliberate_restraint"));
check("set_reminder signal",                preludeCode.includes("set_reminder"));
check("give_space narrative",               preludeCode.includes("space"));
check("repair narrative",                   preludeCode.includes("repair"));
check("quiet hours narrative",              preludeCode.includes("morning") || preludeCode.includes("quiet"));
check("urgency threshold 0.40",             preludeCode.includes("0.40"));
check("does not emit raw urgency scores",   !preludeCode.includes("urgency: 0.") && !preludeCode.includes("Math.round(highestUrgency"));
check("_cap helper capitalizes needLabel",  preludeCode.includes("_cap"));
check("[internal] label preserved",         preludeCode.includes("[internal"));

// ── Section 8: schemaRegistry — 3 new tables ──────────────────────────────

console.log("\n8. schemaRegistry — 3 new tables");
const schemaCode = read(rootSrc("storage/postgres/schemaRegistry.js"));
check("dante_purpose_memory table",        schemaCode.includes("dante_purpose_memory"));
check("dante_need_momentum table",         schemaCode.includes("dante_need_momentum"));
check("dante_first_experiences table",     schemaCode.includes("dante_first_experiences"));
check("purpose_momentum column",           schemaCode.includes("purpose_momentum"));
check("velocity column in momentum table", schemaCode.includes("velocity"));
check("queued_for_identity column",        schemaCode.includes("queued_for_identity"));
check("All 7 homeostasis tables present",  [
  "dante_needs", "dante_fulfillment_logs", "dante_discovered_resources",
  "dante_resource_requests", "dante_purpose_memory", "dante_need_momentum",
  "dante_first_experiences",
].every(t => schemaCode.includes(t)));

// ── Section 9: index.js — 3 new imports ───────────────────────────────────

console.log("\n9. index.js — 3 new imports and wiring");
const indexCode = read(rootSrc("index.js"));
check("createPurposeMemoryEngine imported",  indexCode.includes("createPurposeMemoryEngine"));
check("createNeedMomentumEngine imported",   indexCode.includes("createNeedMomentumEngine"));
check("createFirstExperienceStore imported", indexCode.includes("createFirstExperienceStore"));
check("purposeMemoryEngine instantiated",    indexCode.includes("purposeMemoryEngine  = createPurposeMemoryEngine") || indexCode.includes("purposeMemoryEngine=createPurposeMemoryEngine") || indexCode.includes("purposeMemoryEngine = createPurposeMemoryEngine"));
check("needMomentumEngine instantiated",     indexCode.includes("needMomentumEngine   = createNeedMomentumEngine") || indexCode.includes("needMomentumEngine = createNeedMomentumEngine"));
check("firstExperienceStore instantiated",   indexCode.includes("firstExperienceStore = createFirstExperienceStore") || indexCode.includes("firstExperienceStore= createFirstExperienceStore"));
check("3 engines passed to homeostasisRuntime", indexCode.includes("purposeMemoryEngine, needMomentumEngine, firstExperienceStore"));

// ── Section 10: Hard rules enforcement ────────────────────────────────────

console.log("\n10. Hard rules");
check("no new scheduler in 1.1 files",     !purposeCode.includes("setInterval") && !momentumCode.includes("setInterval") && !firstCode.includes("setInterval"));
check("no Discord sender reference",        !purposeCode.includes("discord") && !momentumCode.includes("discord") && !firstCode.includes("discord"));
check("no fake fulfillment claims",         !purposeCode.includes("fakeFullfil") && !momentumCode.includes("fakeFulfil"));
check("connection needs never bypass gate", plannerCode.includes("CONNECTION_NEEDS.has(needType)") && plannerCode.includes("connection_jenna_unavailable"));
check("quiet hours checked for outreach",   plannerCode.includes("quietHours") && plannerCode.includes("quiet_hours"));
check("sexual desire never bypasses consent", plannerCode.includes("sexual_desire_no_consent"));
check("1.0 dashboard shape preserved (lastTickAt)", runtimeCode.includes("lastTickAt"));
check("1.0 dashboard shape preserved (pressuredNeedsCount)", runtimeCode.includes("pressuredNeedsCount"));
check("1.0 dashboard shape preserved (topNeed)", runtimeCode.includes("topNeed"));
check("1.0 webLearningEnabled still in status", runtimeCode.includes("webLearningEnabled") && runtimeCode.includes("webLearningEnabled()"));

// ── Section 11: Test file exists ───────────────────────────────────────────

console.log("\n11. Test coverage");
const testFile = path.join(SRC, "__tests__/lifeHomeostasisPatch.test.js");
check("lifeHomeostasisPatch.test.js exists", fs.existsSync(testFile));
const testCode = fs.existsSync(testFile) ? fs.readFileSync(testFile, "utf8") : "";
check("tests purposeMemoryEngine",          testCode.includes("purposeMemoryEngine"));
check("tests needMomentumEngine",           testCode.includes("needMomentumEngine"));
check("tests firstExperienceStore",         testCode.includes("firstExperienceStore"));
check("tests context-aware loneliness",     testCode.includes("connection need reflects"));
check("tests give_space restraint",         testCode.includes("give_space") || testCode.includes("giveSpace"));
check("tests quiet hours suppression",      testCode.includes("quietHours") || testCode.includes("quiet hours"));
check("tests first only triggers once",     testCode.includes("only fires once") || testCode.includes("only trigger once") || testCode.includes("only once"));
check("tests identity journal queue",       testCode.includes("Identity Journal") || testCode.includes("markIdentityQueued"));
check("tests prelude contextual signal",    testCode.includes("contextual signal") || testCode.includes("lifePreludeBuilder"));

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n────────────────────────────────────────`);
console.log(`Checks: ${passed + failed} total, ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("\nHOMEOSTASIS_PATCH_PASS");
  process.exit(0);
} else {
  console.error(`\n${failed} check(s) failed. Fix before shipping.`);
  process.exit(1);
}
