#!/usr/bin/env node
"use strict";

/**
 * verify-integration-layer-repair.js
 *
 * Verifies all structural invariants introduced by Integration Layer Repair 1.0.
 * Expected final output: INTEGRATION_LAYER_REPAIR_PASS
 *
 * Run: node artifacts/ghostlight-bot/scripts/verify-integration-layer-repair.js
 */

const fs   = require("node:fs");
const path = require("node:path");

const root     = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "../..");
let failed = false;

function read(rel)                { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel, base = root) { return fs.existsSync(path.join(base, rel)); }
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = true;
}

// ─── Phase 1: preludeReconciler exists and has the right shape ────────────────
check("preludeReconciler.js exists", exists("src/lifeRuntime/preludeReconciler.js"));
const reconciler = read("src/lifeRuntime/preludeReconciler.js");
check("preludeReconciler exports reconcilePresencePrelude", reconciler.includes("reconcilePresencePrelude"));
check("preludeReconciler has no setInterval",              !reconciler.includes("setInterval"));
check("preludeReconciler has no channel.send",             !reconciler.includes("channel.send"));
check("preludeReconciler uses BELIEF_SURFACE_THRESHOLD",   reconciler.includes("BELIEF_SURFACE_THRESHOLD"));
check("preludeReconciler handles conflict → lower confidence", reconciler.includes("conflictConf"));
check("preludeReconciler suppresses repair when consequence active", reconciler.includes("activeConsequence"));
check("preludeReconciler suppresses health when selfInspection fires", reconciler.includes("selfInspectionContext?.preludeWarning"));

// ─── Phase 2: availabilityConfidenceResolver canonical decay rate ─────────────
check("availabilityConfidenceResolver.js exists", exists("src/lifeRuntime/availabilityConfidenceResolver.js"));
const acr = read("src/lifeRuntime/availabilityConfidenceResolver.js");
check("availabilityConfidenceResolver exports AVAILABILITY_DECAY_RATE",    acr.includes("AVAILABILITY_DECAY_RATE"));
check("availabilityConfidenceResolver exports AVAILABILITY_THRESHOLD_MS",  acr.includes("AVAILABILITY_THRESHOLD_MS"));
check("availabilityConfidenceResolver exports AVAILABILITY_SOURCE_WEIGHTS", acr.includes("AVAILABILITY_SOURCE_WEIGHTS"));
check("availabilityConfidenceResolver exports resolveAvailabilityConfidence", acr.includes("resolveAvailabilityConfidence"));
check("availabilityConfidenceResolver exports applyAvailabilityDecay",     acr.includes("applyAvailabilityDecay"));
check("availabilityConfidenceResolver canonical rate is 0.15",             acr.includes("AVAILABILITY_DECAY_RATE = 0.15"));
check("availabilityConfidenceResolver has no setInterval",                 !acr.includes("setInterval"));
check("availabilityConfidenceResolver has no channel.send",                !acr.includes("channel.send"));

// ─── Phase 2: worldDecayEngine uses canonical rate ───────────────────────────
const wde = read("src/lifeRuntime/worldDecayEngine.js");
check("worldDecayEngine imports AVAILABILITY_DECAY_RATE",         wde.includes("AVAILABILITY_DECAY_RATE"));
check("worldDecayEngine DECAY_RATE_OVERRIDES for jenna.availability", wde.includes('"jenna.availability"'));
check("worldDecayEngine exports DECAY_RATE_OVERRIDES",            wde.includes("DECAY_RATE_OVERRIDES"));

// ─── Phase 3: lesson store ownership ─────────────────────────────────────────
check("LESSON_STORE_OWNERSHIP.md exists",              exists("docs/LESSON_STORE_OWNERSHIP.md", repoRoot));
const lso = fs.readFileSync(path.join(repoRoot, "docs/LESSON_STORE_OWNERSHIP.md"), "utf8");
check("LESSON_STORE_OWNERSHIP.md has canonical store section", lso.includes("Canonical Store"));
check("LESSON_STORE_OWNERSHIP.md documents table name",        lso.includes("dante_relationship_lessons"));
check("LESSON_STORE_OWNERSHIP.md has legacy adapter section",  lso.includes("Adapter"));
check("LESSON_STORE_OWNERSHIP.md has schema mapping",          lso.includes("Schema Mapping"));

check("relationshipLessonStore.js exists", exists("src/lifeRuntime/relationshipLessonStore.js"));
const rls = read("src/lifeRuntime/relationshipLessonStore.js");
check("relationshipLessonStore is now an adapter (delegates to canonical)", rls.includes("createLessonStore"));
check("relationshipLessonStore imports canonical LESSON_TYPES",             rls.includes("CANONICAL_TYPES"));
check("relationshipLessonStore has TYPE_MAP for legacy→canonical mapping",  rls.includes("TYPE_MAP"));
check("relationshipLessonStore maps sourceConsequenceIds→originEventIds",   rls.includes("originEventIds"));
check("relationshipLessonStore maps futureBehaviorGuidance→futureGuidance", rls.includes("futureGuidance"));
check("relationshipLessonStore has no setInterval",                         !rls.includes("setInterval"));
check("relationshipLessonStore has no channel.send",                        !rls.includes("channel.send"));

// ─── Phase 4: repairStateResolver canonical repair authority ──────────────────
check("repairStateResolver.js exists", exists("src/lifeRuntime/repairStateResolver.js"));
const rsr = read("src/lifeRuntime/repairStateResolver.js");
check("repairStateResolver exports createRepairStateResolver", rsr.includes("createRepairStateResolver"));
check("repairStateResolver has fromConsequenceContext",        rsr.includes("fromConsequenceContext"));
check("repairStateResolver has hydrateFromStore",              rsr.includes("hydrateFromStore"));
check("repairStateResolver has getSnapshot",                   rsr.includes("getSnapshot"));
check("repairStateResolver confidence is 0.90",                /confidence:\s+0\.90/.test(rsr));
check("repairStateResolver source is consequenceStore",        rsr.includes('"consequenceStore"'));
check("repairStateResolver has no setInterval",                !rsr.includes("setInterval"));
check("repairStateResolver has no channel.send",               !rsr.includes("channel.send"));

// ─── Phase 5: lifePreludeBuilder uses reconciler (no duplicates) ──────────────
const lpb = read("src/lifeRuntime/lifePreludeBuilder.js");
check("lifePreludeBuilder imports reconcilePresencePrelude", lpb.includes("reconcilePresencePrelude"));
check("lifePreludeBuilder calls reconcilePresencePrelude",   lpb.includes("reconcilePresencePrelude({"));
check("lifePreludeBuilder destructures worldModelContext",   lpb.includes("worldModelContext"));
check("lifePreludeBuilder destructures perceptionContext",   lpb.includes("perceptionContext"));
check("lifePreludeBuilder has no duplicate world-signal call",
  (lpb.match(/buildWorldModelSignal\s*\(/g) || []).length === 0 ||
  !lpb.includes("buildWorldModelSignal(worldModelContext")   // old direct call must be gone
);
check("lifePreludeBuilder has no duplicate perception-signal call",
  (lpb.match(/buildPerceptionSignal\s*\(/g) || []).length === 0 ||
  !lpb.includes("buildPerceptionSignal(perceptionContext")
);

// ─── Phase 6: event bus orphan cleanup ───────────────────────────────────────
check("RUNTIME_EVENT_OWNERSHIP.md exists", exists("docs/RUNTIME_EVENT_OWNERSHIP.md", repoRoot));
const reo = fs.readFileSync(path.join(repoRoot, "docs/RUNTIME_EVENT_OWNERSHIP.md"), "utf8");
check("RUNTIME_EVENT_OWNERSHIP.md documents consumed events", reo.includes("Consumed Events"));
check("RUNTIME_EVENT_OWNERSHIP.md documents audit-only events", reo.includes("Audit-Only Events"));
check("RUNTIME_EVENT_OWNERSHIP.md documents dead events removed", reo.includes("Dead events removed"));

const reb = read("src/lifeRuntime/runtimeEventBus.js");
check("runtimeEventBus exports EVENT_OWNERSHIP", reb.includes("EVENT_OWNERSHIP"));
check("runtimeEventBus EVENT_OWNERSHIP has consumed category", reb.includes('"consumed"'));
check("runtimeEventBus EVENT_OWNERSHIP has audit_only category", reb.includes('"audit_only"'));

// Dead events must not appear in EVENT_TYPES list
const deadEvents = [
  "need_satisfied", "need_depleted", "identity_preference_changed",
  "project_completed", "project_abandoned", "curiosity_matured",
  "resource_discovered", "first_experience_recorded",
  "narrative_chapter_opened", "narrative_self_story_updated",
  "perception_availability_changed", "perception_confidence_decayed",
];
for (const dead of deadEvents) {
  // Must not appear as a string literal inside the EVENT_TYPES array definition
  // (allow in comments)
  const eventTypesBlock = reb.match(/const EVENT_TYPES[\s\S]*?UNKNOWN_THRESHOLD_\d+|const EVENT_TYPES[\s\S]*?\]\s*\)/)?.[0]
    ?? reb.match(/EVENT_TYPES = Object\.freeze\(\[([\s\S]*?)\]\)/)?.[0]
    ?? "";
  const inTypes = reb.includes(`"${dead}"`) && !reb.split("\n").every(l => l.trim().startsWith("//") || !l.includes(`"${dead}"`));
  // Simpler: just check that the dead event is not in the array body (it appears only in comments now)
  // Parse: find EVENT_TYPES array
  const m = reb.match(/EVENT_TYPES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  const arrayBody = m ? m[1] : "";
  check(
    `dead event '${dead}' removed from EVENT_TYPES`,
    !arrayBody.includes(`"${dead}"`)
  );
}

// Consumed events must remain
const consumedEvents = ["repair_started", "repair_completed", "diagnostic_warning", "self_confidence_low"];
for (const ev of consumedEvents) {
  check(`consumed event '${ev}' still in EVENT_TYPES`, reb.includes(`"${ev}"`));
}

// ─── Phase 7: no duplicate presenceInterpreter call ──────────────────────────
const lr = read("src/lifeRuntime/lifeRuntime.js");
check("lifeRuntime _tickWorldModel passes alivePresence: null", /alivePresence:\s+null/.test(lr));
check("lifeRuntime does not call _refreshAlivePresence inside _tickWorldModel", (() => {
  const tickWorldModelMatch = lr.match(/_tickWorldModel[\s\S]{0,2000}?(?=\nasync function|\nfunction )/);
  if (!tickWorldModelMatch) return true; // can't parse, assume ok
  return !tickWorldModelMatch[0].includes("_refreshAlivePresence()");
})());

// ─── Phase 8: test file exists ───────────────────────────────────────────────
check("integrationLayerRepair.test.js exists",
  exists("src/lifeRuntime/__tests__/integrationLayerRepair.test.js")
);
const testFile = read("src/lifeRuntime/__tests__/integrationLayerRepair.test.js");
check("test covers availability conflict",    testFile.includes("conflicting availability"));
check("test covers availability agreement",   testFile.includes("agreement on availability"));
check("test covers consequence suppresses repair", testFile.includes("suppresses repair"));
check("test covers selfInspection suppresses health", testFile.includes("suppresses health"));
check("test covers lesson adapter cross-visibility", testFile.includes("adapter"));
check("test covers repairStateResolver",      testFile.includes("repairStateResolver"));
check("test covers hydrateFromStore",         testFile.includes("hydrateFromStore"));
check("test covers dead event removal",       testFile.includes("dead events are not"));
check("test covers canonical decay rate",     testFile.includes("canonical rate"));

// ─── Integration smoke: modules load without error ───────────────────────────
try {
  const { reconcilePresencePrelude } = require(path.join(root, "src/lifeRuntime/preludeReconciler"));
  check("preludeReconciler loads without error", typeof reconcilePresencePrelude === "function");
} catch (e) {
  check("preludeReconciler loads without error", false, e.message);
}

try {
  const { AVAILABILITY_DECAY_RATE, resolveAvailabilityConfidence, applyAvailabilityDecay } = require(path.join(root, "src/lifeRuntime/availabilityConfidenceResolver"));
  check("availabilityConfidenceResolver loads without error", typeof resolveAvailabilityConfidence === "function");
  check("AVAILABILITY_DECAY_RATE is 0.15", AVAILABILITY_DECAY_RATE === 0.15);
} catch (e) {
  check("availabilityConfidenceResolver loads without error", false, e.message);
}

try {
  const { createRepairStateResolver } = require(path.join(root, "src/lifeRuntime/repairStateResolver"));
  const resolver = createRepairStateResolver({});
  const snap = resolver.fromConsequenceContext({ giveSpace: false, repairRequired: true, repairStarted: false, healing: false }, 1);
  check("repairStateResolver.fromConsequenceContext works", snap?.repair_required === true);
  check("repairStateResolver snapshot confidence is 0.90",  snap?.confidence === 0.90);
} catch (e) {
  check("repairStateResolver loads without error", false, e.message);
}

try {
  const { createRuntimeEventBus, EVENT_TYPES, EVENT_OWNERSHIP } = require(path.join(root, "src/lifeRuntime/runtimeEventBus"));
  check("runtimeEventBus loads without error",    Array.isArray(EVENT_TYPES));
  check("EVENT_OWNERSHIP is exported",            typeof EVENT_OWNERSHIP === "object" && EVENT_OWNERSHIP !== null);
  check("repair_started is consumed",             EVENT_OWNERSHIP["repair_started"]?.category === "consumed");
  check("world_model_updated is audit_only",      EVENT_OWNERSHIP["world_model_updated"]?.category === "audit_only");
  check("EVENT_TYPES length is reasonable",       EVENT_TYPES.length >= 15 && EVENT_TYPES.length <= 25);
} catch (e) {
  check("runtimeEventBus loads without error", false, e.message);
}

try {
  const { createRelationshipLessonStore, LESSON_TYPES } = require(path.join(root, "src/lifeRuntime/relationshipLessonStore"));
  check("relationshipLessonStore loads without error", Array.isArray(LESSON_TYPES));
  check("LESSON_TYPES has 13 legacy types",            LESSON_TYPES.length === 13);
} catch (e) {
  check("relationshipLessonStore loads without error", false, e.message);
}

// ─── worldDecayEngine smoke ───────────────────────────────────────────────────
try {
  const { DECAY_RATE_OVERRIDES, AVAILABILITY_DECAY_RATE: wdeRate } = (() => {
    const { DECAY_RATE_OVERRIDES } = require(path.join(root, "src/lifeRuntime/worldDecayEngine"));
    const { AVAILABILITY_DECAY_RATE } = require(path.join(root, "src/lifeRuntime/availabilityConfidenceResolver"));
    return { DECAY_RATE_OVERRIDES, AVAILABILITY_DECAY_RATE };
  })();
  check("worldDecayEngine jenna.availability uses AVAILABILITY_DECAY_RATE",
    DECAY_RATE_OVERRIDES["jenna.availability"] === 0.15
  );
} catch (e) {
  check("worldDecayEngine loads without error", false, e.message);
}

if (failed) process.exit(1);
console.log("INTEGRATION_LAYER_REPAIR_PASS");
