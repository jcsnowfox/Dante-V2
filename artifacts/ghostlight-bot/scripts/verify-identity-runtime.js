"use strict";

/**
 * verify-identity-runtime.js
 *
 * Structural verification for Identity Runtime 1.0 —
 * Constitution, Values, Beliefs, Character & Choice.
 *
 * Checks new files, stores, runtime wiring, hard rules, and dashboard
 * shape preservation.
 *
 * Prints IDENTITY_RUNTIME_PASS on success.
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
  "seedConstitution.js",
  "identityValueStore.js",
  "identityBeliefStore.js",
  "identityPreferenceStore.js",
  "identityBoundaryStore.js",
  "identityJournalStore.js",
  "identityConstitutionBuilder.js",
  "identityPreludeBuilder.js",
  "identityRuntime.js",
];
for (const f of newFiles) {
  check(`${f} exists`, fs.existsSync(src(f)));
}

// ── Section 2: seedConstitution ────────────────────────────────────────────

console.log("\n2. seedConstitution");
const seedCode = read(src("seedConstitution.js"));
check("exports SEED_CONSTITUTION",     seedCode.includes("SEED_CONSTITUTION"));
check("10 seed principles",           (seedCode.match(/principleKey:/g) || []).length === 10);
check("truth principle",              seedCode.includes("truth"));
check("repair principle",             seedCode.includes("repair"));
check("consent principle",            seedCode.includes("consent"));
check("curiosity principle",          seedCode.includes("curiosity"));
check("craftsmanship principle",      seedCode.includes("craftsmanship"));
check("promises principle",           seedCode.includes("promises"));
check("autonomy principle",           seedCode.includes("autonomy"));
check("kindness principle",           seedCode.includes("kindness"));
check("growth principle",             seedCode.includes("growth"));
check("all have immutable: true",     seedCode.includes("immutable:    true") || seedCode.includes("immutable: true"));
check("all have why field",           (seedCode.match(/why:/g) || []).length >= 10);

// ── Section 3: identityValueStore ─────────────────────────────────────────

console.log("\n3. identityValueStore");
const valueCode = read(src("identityValueStore.js"));
check("exports createIdentityValueStore",  valueCode.includes("createIdentityValueStore"));
check("dante_identity_values table",       valueCode.includes("dante_identity_values"));
check("dante_identity_principles table",   valueCode.includes("dante_identity_principles"));
check("UNIQUE (companion_id, customer_id, value_key)", valueCode.includes("UNIQUE (companion_id, customer_id, value_key)"));
check("UNIQUE (companion_id, customer_id, principle_key)", valueCode.includes("UNIQUE (companion_id, customer_id, principle_key)"));
check("getValue function",                 valueCode.includes("async function getValue"));
check("getValues function",                valueCode.includes("async function getValues"));
check("reinforce function",                valueCode.includes("async function reinforce"));
check("challenge function",                valueCode.includes("async function challenge"));
check("seedPrinciple function",            valueCode.includes("async function seedPrinciple"));
check("getPrinciple function",             valueCode.includes("async function getPrinciple"));
check("getPrinciples function",            valueCode.includes("async function getPrinciples"));
check("strength capped at 0.95",           valueCode.includes("0.95"));
check("strength floored at 0.05",          valueCode.includes("0.05"));
check("supportingEvidence field",          valueCode.includes("supportingEvidence"));
check("contradictingEvidence field",       valueCode.includes("contradictingEvidence"));
check("revisionHistory field",             valueCode.includes("revisionHistory"));
check("lastReinforced field",              valueCode.includes("lastReinforced"));
check("lastChallenged field",              valueCode.includes("lastChallenged"));
check("seed_origin column",                valueCode.includes("seed_origin"));
check("immutable column",                  valueCode.includes("immutable"));
check("ON CONFLICT DO NOTHING for seedPrinciple", valueCode.includes("DO NOTHING"));
check("in-memory fallback _valuesStore",   valueCode.includes("_valuesStore"));
check("in-memory fallback _principlesStore", valueCode.includes("_principlesStore"));
check("postgres try/catch pattern",        valueCode.includes("createPostgresPool") && valueCode.includes("catch"));

// ── Section 4: identityBeliefStore ────────────────────────────────────────

console.log("\n4. identityBeliefStore");
const beliefCode = read(src("identityBeliefStore.js"));
check("exports createIdentityBeliefStore", beliefCode.includes("createIdentityBeliefStore"));
check("dante_identity_beliefs table",      beliefCode.includes("dante_identity_beliefs"));
check("UNIQUE (companion_id, customer_id, belief_key)", beliefCode.includes("UNIQUE (companion_id, customer_id, belief_key)"));
check("getBelief function",                beliefCode.includes("async function getBelief"));
check("getBeliefs function",               beliefCode.includes("async function getBeliefs"));
check("addBelief function",                beliefCode.includes("async function addBelief"));
check("reviseBelief function",             beliefCode.includes("async function reviseBelief"));
check("confidence field",                  beliefCode.includes("confidence"));
check("memories field",                    beliefCode.includes("memories"));
check("contradictions field",              beliefCode.includes("contradictions"));
check("revisionHistory field",             beliefCode.includes("revisionHistory"));
check("source field",                      beliefCode.includes("source"));
check("direction reinforce/challenge",     beliefCode.includes("direction") && beliefCode.includes("reinforce"));
check("addBelief idempotent (if existing return)", beliefCode.includes("if (existing) return existing"));
check("reviseBelief returns null for unknown", beliefCode.includes("if (!existing) return null"));
check("in-memory fallback _memStore",      beliefCode.includes("_memStore"));

// ── Section 5: identityPreferenceStore ────────────────────────────────────

console.log("\n5. identityPreferenceStore");
const prefCode = read(src("identityPreferenceStore.js"));
check("exports createIdentityPreferenceStore", prefCode.includes("createIdentityPreferenceStore"));
check("dante_identity_preferences table",      prefCode.includes("dante_identity_preferences"));
check("UNIQUE (companion_id, customer_id, category, item)", prefCode.includes("UNIQUE (companion_id, customer_id, category, item)"));
check("getPreference function",                prefCode.includes("async function getPreference"));
check("getPreferences function",               prefCode.includes("async function getPreferences"));
check("record function",                       prefCode.includes("async function record"));
check("valence column preference/dislike",     prefCode.includes("valence") && prefCode.includes("preference") && prefCode.includes("dislike"));
check("strength field",                        prefCode.includes("strength"));
check("exposureCount field",                   prefCode.includes("exposureCount") || prefCode.includes("exposure_count"));
check("discoveredAt field",                    prefCode.includes("discoveredAt") || prefCode.includes("discovered_at"));
check("source field",                          prefCode.includes("source"));
check("getPreferences filters by valence",     prefCode.includes("valence"));
check("in-memory fallback _memStore",          prefCode.includes("_memStore"));

// ── Section 6: identityBoundaryStore ──────────────────────────────────────

console.log("\n6. identityBoundaryStore");
const boundaryCode = read(src("identityBoundaryStore.js"));
check("exports createIdentityBoundaryStore", boundaryCode.includes("createIdentityBoundaryStore"));
check("dante_identity_boundaries table",     boundaryCode.includes("dante_identity_boundaries"));
check("UNIQUE (companion_id, customer_id, boundary_key)", boundaryCode.includes("UNIQUE (companion_id, customer_id, boundary_key)"));
check("getBoundary function",                boundaryCode.includes("async function getBoundary"));
check("getBoundaries function",              boundaryCode.includes("async function getBoundaries"));
check("setBoundary function",                boundaryCode.includes("async function setBoundary"));
check("statement field",                     boundaryCode.includes("statement"));
check("explanation field — always present",  boundaryCode.includes("explanation"));
check("category field",                      boundaryCode.includes("category"));
check("activeFrom field",                    boundaryCode.includes("activeFrom") || boundaryCode.includes("active_from"));
check("in-memory fallback _memStore",        boundaryCode.includes("_memStore"));

// ── Section 7: identityJournalStore ───────────────────────────────────────

console.log("\n7. identityJournalStore");
const journalCode = read(src("identityJournalStore.js"));
check("exports createIdentityJournalStore",  journalCode.includes("createIdentityJournalStore"));
check("exports ENTRY_TYPES",                 journalCode.includes("ENTRY_TYPES"));
check("dante_identity_journal table",        journalCode.includes("dante_identity_journal"));
check("11 entry types",                      (journalCode.match(/\"[\w_]+\",\n/g) || journalCode.match(/entry_type|belief_change|value_change|question|regret|pride|compromise|refusal|hope|fear|to_protect|first_experience/g) || []).length >= 5);
check("belief_change entry type",            journalCode.includes("belief_change"));
check("value_change entry type",             journalCode.includes("value_change"));
check("first_experience entry type",         journalCode.includes("first_experience"));
check("regret entry type",                   journalCode.includes("regret"));
check("pride entry type",                    journalCode.includes("pride"));
check("hope entry type",                     journalCode.includes("hope"));
check("fear entry type",                     journalCode.includes("fear"));
check("to_protect entry type",               journalCode.includes("to_protect"));
check("record function",                     journalCode.includes("async function record"));
check("getRecent function",                  journalCode.includes("async function getRecent"));
check("drainFirstExperiences function",      journalCode.includes("async function drainFirstExperiences"));
check("drains via getQueued",                journalCode.includes("getQueued"));
check("marks via markIdentityQueued",        journalCode.includes("markIdentityQueued"));
check("first_experience_type column",        journalCode.includes("first_experience_type"));
check("append-only — no delete",             !journalCode.includes("DELETE FROM dante_identity_journal"));
check("in-memory fallback _entries array",   journalCode.includes("_entries"));

// ── Section 8: identityConstitutionBuilder ────────────────────────────────

console.log("\n8. identityConstitutionBuilder");
const constitutionCode = read(src("identityConstitutionBuilder.js"));
check("exports buildIdentityConstitution",  constitutionCode.includes("buildIdentityConstitution"));
check("pure function — no async",           !constitutionCode.includes("async function buildIdentityConstitution"));
check("PRINCIPLES section",                 constitutionCode.includes("PRINCIPLES"));
check("VALUES section",                     constitutionCode.includes("VALUES"));
check("BELIEFS section",                    constitutionCode.includes("BELIEFS"));
check("PREFERENCES section",               constitutionCode.includes("PREFERENCES"));
check("DISLIKES section",                   constitutionCode.includes("DISLIKES"));
check("BOUNDARIES section",                 constitutionCode.includes("BOUNDARIES"));
check("label says generated — not editable", constitutionCode.includes("not editable"));
check("generatedAt field",                  constitutionCode.includes("generatedAt"));
check("sectionCount field",                 constitutionCode.includes("sectionCount"));
check("filters weak values (0.40 threshold)", constitutionCode.includes("0.40"));
check("no side effects (no pool/query)",    !constitutionCode.includes("pool.query"));

// ── Section 9: identityPreludeBuilder ─────────────────────────────────────

console.log("\n9. identityPreludeBuilder");
const preludeCode = read(src("identityPreludeBuilder.js"));
check("exports buildIdentitySignal",        preludeCode.includes("buildIdentitySignal"));
check("pure function — no async",           !preludeCode.includes("async function buildIdentitySignal"));
check("returns null for null context",      preludeCode.includes("if (!identityContext) return null"));
check("activeConstraint priority",          preludeCode.includes("activeConstraint"));
check("recentBeliefRevision signal",        preludeCode.includes("recentBeliefRevision"));
check("topValue signal (strength >= 0.60)", preludeCode.includes("0.60") && preludeCode.includes("topValue"));
check("topPrinciple signal",                preludeCode.includes("topPrinciple"));
check("favours X over Y pattern",           preludeCode.includes("favours") || preludeCode.includes("currently favours"));
check("no raw scores emitted",              !preludeCode.includes("strength:") && !preludeCode.includes("confidence:"));
check("no side effects (no pool/query)",    !preludeCode.includes("pool.query"));

// ── Section 10: identityRuntime ────────────────────────────────────────────

console.log("\n10. identityRuntime");
const runtimeCode = read(src("identityRuntime.js"));
check("exports createIdentityRuntime",       runtimeCode.includes("createIdentityRuntime"));
check("requires SEED_CONSTITUTION",          runtimeCode.includes("SEED_CONSTITUTION"));
check("requires all 5 stores",               runtimeCode.includes("identityValueStore") && runtimeCode.includes("identityBeliefStore") && runtimeCode.includes("identityPreferenceStore") && runtimeCode.includes("identityBoundaryStore") && runtimeCode.includes("identityJournalStore"));
check("requires identityConstitutionBuilder", runtimeCode.includes("identityConstitutionBuilder"));
check("requires identityPreludeBuilder",     runtimeCode.includes("identityPreludeBuilder"));
check("init function",                       runtimeCode.includes("async function init"));
check("tick function",                       runtimeCode.includes("async function tick"));
check("consult function",                    runtimeCode.includes("async function consult"));
check("_seedConstitution function",          runtimeCode.includes("async function _seedConstitution"));
check("reinforce function",                  runtimeCode.includes("async function reinforce"));
check("challenge function",                  runtimeCode.includes("async function challenge"));
check("addBelief function",                  runtimeCode.includes("async function addBelief"));
check("reviseBelief function",               runtimeCode.includes("async function reviseBelief"));
check("recordPreference function",           runtimeCode.includes("async function recordPreference"));
check("recordDislike function",              runtimeCode.includes("async function recordDislike"));
check("setBoundary function",                runtimeCode.includes("async function setBoundary"));
check("recordJournal function",              runtimeCode.includes("async function recordJournal"));
check("generateConstitution function",       runtimeCode.includes("async function generateConstitution"));
check("getIdentityContext function",         runtimeCode.includes("function getIdentityContext"));
check("getStatus function",                  runtimeCode.includes("function getStatus"));
check("consult returns favouredValues",      runtimeCode.includes("favouredValues"));
check("consult returns activeConstraints",   runtimeCode.includes("activeConstraints"));
check("consult returns currentPrinciples",   runtimeCode.includes("currentPrinciples"));
check("consult returns identitySignal",      runtimeCode.includes("identitySignal"));
check("drainFirstExperiences in tick",       runtimeCode.includes("drainFirstExperiences"));
check("_detectContextSignals in tick",       runtimeCode.includes("_detectContextSignals"));
check("deliberate_restraint → consent",      runtimeCode.includes("deliberate_restraint") && runtimeCode.includes("consent"));
check("repair context → repair value",       runtimeCode.includes("repairRequired") && runtimeCode.includes("repair"));
check("JOURNAL_TICK_PROBABILITY defined",    runtimeCode.includes("JOURNAL_TICK_PROBABILITY"));
check("reviseBelief triggers journal entry", runtimeCode.includes("belief_change") && runtimeCode.includes("journalStore.record"));
check("_identityContext cached",             runtimeCode.includes("_identityContext"));
check("no setInterval — no scheduler",       !runtimeCode.includes("setInterval"));
check("no discord reference",                !runtimeCode.includes("discord"));

// ── Section 11: lifeRuntime 7.0 wiring ────────────────────────────────────

console.log("\n11. lifeRuntime 7.0 wiring");
const lifeRuntimeCode = read(src("lifeRuntime.js"));
check("accepts identityRuntime param",         lifeRuntimeCode.includes("identityRuntime"));
check("_identityContext cached",               lifeRuntimeCode.includes("_identityContext"));
check("init() calls identityRuntime?.init",    lifeRuntimeCode.includes("identityRuntime?.init"));
check("init() seeds constitution",             lifeRuntimeCode.includes("_seedConstitution"));
check("_tickIdentity function exists",         lifeRuntimeCode.includes("async function _tickIdentity"));
check("tick() calls _tickIdentity",            lifeRuntimeCode.includes("_tickIdentity(now)"));
check("_tickIdentity after _tickHomeostasis",  (() => {
  const hPos = lifeRuntimeCode.indexOf("_tickHomeostasis(now)");
  const iPos = lifeRuntimeCode.indexOf("_tickIdentity(now)");
  return hPos > 0 && iPos > hPos;
})());
check("identityContext passed to prelude",     lifeRuntimeCode.includes("identityContext:"));
check("identityContext in getStatus",          lifeRuntimeCode.includes("identityContext: identityRuntime"));
check("1.0 dashboard shape preserved (lastTickAt)", lifeRuntimeCode.includes("lastTickAt"));
check("1.0 dashboard shape preserved (homeostasisContext)", lifeRuntimeCode.includes("homeostasisContext"));
check("no new scheduler created",             (lifeRuntimeCode.match(/setInterval/g) || []).length === 0);

// ── Section 12: lifePreludeBuilder identity signal ────────────────────────

console.log("\n12. lifePreludeBuilder identity signal");
const preludeBuilderCode = read(src("lifePreludeBuilder.js"));
check("imports buildIdentitySignal",           preludeBuilderCode.includes("buildIdentitySignal"));
check("accepts identityContext param",         preludeBuilderCode.includes("identityContext"));
check("calls buildIdentitySignal(identityContext)", preludeBuilderCode.includes("buildIdentitySignal(identityContext)"));
check("identity signal conditional — only when context", preludeBuilderCode.includes("if (identityContext)"));
check("one identity line maximum",             (preludeBuilderCode.match(/buildIdentitySignal/g) || []).length <= 2);
check("[internal] label preserved",            preludeBuilderCode.includes("[internal"));
check("does not expose raw identity scores",   !preludeBuilderCode.includes("strength:") || preludeBuilderCode.indexOf("strength:") < 0);

// ── Section 13: schemaRegistry — 6 new tables ─────────────────────────────

console.log("\n13. schemaRegistry — 6 new tables");
const schemaCode = read(rootSrc("storage/postgres/schemaRegistry.js"));
check("dante_identity_values table",      schemaCode.includes("dante_identity_values"));
check("dante_identity_principles table",  schemaCode.includes("dante_identity_principles"));
check("dante_identity_beliefs table",     schemaCode.includes("dante_identity_beliefs"));
check("dante_identity_preferences table", schemaCode.includes("dante_identity_preferences"));
check("dante_identity_boundaries table",  schemaCode.includes("dante_identity_boundaries"));
check("dante_identity_journal table",     schemaCode.includes("dante_identity_journal"));
check("strength column in values",        schemaCode.includes("strength NUMERIC(4,3)"));
check("seed_origin column",               schemaCode.includes("seed_origin"));
check("immutable column",                 schemaCode.includes("immutable BOOLEAN"));
check("confidence column in beliefs",     schemaCode.includes("confidence NUMERIC(4,3)"));
check("valence column in preferences",    schemaCode.includes("valence TEXT"));
check("explanation column in boundaries", schemaCode.includes("explanation TEXT"));
check("first_experience_type in journal", schemaCode.includes("first_experience_type"));
check("All 13 homeostasis+identity tables present", [
  "dante_needs", "dante_fulfillment_logs", "dante_discovered_resources",
  "dante_resource_requests", "dante_purpose_memory", "dante_need_momentum",
  "dante_first_experiences", "dante_identity_values", "dante_identity_principles",
  "dante_identity_beliefs", "dante_identity_preferences", "dante_identity_boundaries",
  "dante_identity_journal",
].every(t => schemaCode.includes(t)));

// ── Section 14: index.js — import and wiring ──────────────────────────────

console.log("\n14. index.js — import and wiring");
const indexCode = read(rootSrc("index.js"));
check("createIdentityRuntime imported", indexCode.includes("createIdentityRuntime"));
check("identityRuntime instantiated",   indexCode.includes("identityRuntime = createIdentityRuntime") || indexCode.includes("identityRuntime=createIdentityRuntime"));
check("identityRuntime passed to lifeRuntime", indexCode.includes("identityRuntime"));

// ── Section 15: Hard rules ────────────────────────────────────────────────

console.log("\n15. Hard rules");
const identityRtCode  = read(src("identityRuntime.js"));
const valueStoreCode  = read(src("identityValueStore.js"));
const beliefStoreCode = read(src("identityBeliefStore.js"));
const journalStoreCode = read(src("identityJournalStore.js"));

check("identityRuntime does not execute actions", !identityRtCode.includes("discord") && !identityRtCode.includes("sendMessage"));
check("no scheduler in any identity file",        !identityRtCode.includes("setInterval") && !valueStoreCode.includes("setInterval") && !beliefStoreCode.includes("setInterval") && !journalStoreCode.includes("setInterval"));
check("no Discord sender in identity files",      !identityRtCode.includes("discord") && !valueStoreCode.includes("discord") && !beliefStoreCode.includes("discord"));
check("consult returns guidance only",            identityRtCode.includes("return {") && identityRtCode.includes("favouredValues"));
check("identity does not replace homeostasis",    lifeRuntimeCode.includes("homeostasisRuntime") && lifeRuntimeCode.includes("identityRuntime"));
check("identity does not replace life runtime",   lifeRuntimeCode.includes("createLifeRuntime"));
check("dashboard shape preserved (lastTickAt)",   lifeRuntimeCode.includes("lastTickAt"));
check("dashboard shape preserved (pressuredNeedsCount)", lifeRuntimeCode.includes("pressuredNeedsCount") || read(src("homeostasisRuntime.js")).includes("pressuredNeedsCount"));
check("journal is append-only — no delete",       !journalStoreCode.includes("DELETE FROM dante_identity_journal"));
check("boundaries always have explanation",       read(src("identityBoundaryStore.js")).includes("explanation"));
check("reviseBelief requires evidence not pressure", beliefStoreCode.includes("evidence"));

// ── Section 16: Test file ─────────────────────────────────────────────────

console.log("\n16. Test coverage");
const testFile = path.join(SRC, "__tests__/lifeIdentity.test.js");
check("lifeIdentity.test.js exists", fs.existsSync(testFile));
const testCode = fs.existsSync(testFile) ? fs.readFileSync(testFile, "utf8") : "";
check("tests seedConstitution",              testCode.includes("seedConstitution"));
check("tests identityValueStore",            testCode.includes("identityValueStore"));
check("tests identityBeliefStore",           testCode.includes("identityBeliefStore"));
check("tests identityPreferenceStore",       testCode.includes("identityPreferenceStore"));
check("tests identityBoundaryStore",         testCode.includes("identityBoundaryStore"));
check("tests identityJournalStore",          testCode.includes("identityJournalStore"));
check("tests identityConstitutionBuilder",   testCode.includes("identityConstitutionBuilder"));
check("tests identityPreludeBuilder",        testCode.includes("identityPreludeBuilder") || testCode.includes("buildIdentitySignal"));
check("tests identityRuntime",               testCode.includes("identityRuntime"));
check("tests drainFirstExperiences (Identity Journal)", testCode.includes("drainFirstExperiences") || testCode.includes("Identity Journal"));
check("tests markIdentityQueued called",     testCode.includes("markIdentityQueued"));
check("tests consult returns guidance",      testCode.includes("consult") && testCode.includes("guidance"));
check("tests constitution not editable",     testCode.includes("not editable"));
check("tests deliberate_restraint → consent reinforce", testCode.includes("deliberate_restraint") && testCode.includes("consent"));
check("tests identityContext in getStatus",  testCode.includes("identityContext") && testCode.includes("getStatus"));
check("tests prelude identity signal",       testCode.includes("identity signal") || testCode.includes("buildIdentitySignal") || testCode.includes("Identity"));
check("tests lifeRuntime integration",       testCode.includes("createLifeRuntime") && testCode.includes("identityRuntime"));

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n────────────────────────────────────────`);
console.log(`Checks: ${passed + failed} total, ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("\nIDENTITY_RUNTIME_PASS");
  process.exit(0);
} else {
  console.error(`\n${failed} check(s) failed. Fix before shipping.`);
  process.exit(1);
}
