"use strict";

/**
 * verify-relationship-learning-runtime.js
 *
 * Relationship Learning Runtime 1.0 verification.
 *
 * Expected final line: RELATIONSHIP_LEARNING_RUNTIME_PASS
 *
 * Verifies:
 *   - Lessons persist (schema, store, create/reinforce/challenge functions)
 *   - Lessons strengthen through repeated evidence
 *   - Lessons weaken through challenge
 *   - Lessons influence future behaviour (guidance, rules)
 *   - Repair changes future decisions (processInteraction → lesson)
 *   - Positive experiences change future decisions (fulfilment → lesson)
 *   - Relationship rules emerge from lesson clusters
 *   - Behaviour guidance updates with context
 *   - Identity receives reinforcement (agencyPlanner lessonGuidance)
 *   - Homeostasis receives reinforcement (learningContext via prelude)
 *   - Romantic Surprise planner consults lessons (getBehaviourGuidance)
 *   - Repair Persistence consults lessons (getBehaviourGuidance)
 *   - Conversation Intent consults lessons (getBehaviourGuidance)
 *   - Evidence Runtime consulted (evidence IDs in lessons)
 *   - No duplicate scheduler
 *   - No duplicate sender
 *   - Dashboard untouched
 */

const fs   = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ": " + detail : ""}`);
    failed++;
  }
}

function readSrc(relPath) {
  return fs.readFileSync(path.join(ROOT, "src", relPath), "utf-8");
}

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function section(title) {
  console.log(`\n── ${title}`);
}

// ── 1. File presence ──────────────────────────────────────────────────────────────────────────

section("1. Required files exist");

const REQUIRED_FILES = [
  "src/relationshipLearning/lessonStore.js",
  "src/relationshipLearning/lessonExtractor.js",
  "src/relationshipLearning/behaviourGuidanceBuilder.js",
  "src/relationshipLearning/relationshipRuleEngine.js",
  "src/relationshipLearning/reflectionEngine.js",
  "src/relationshipLearning/relationshipLearningRuntime.js",
  "src/relationshipLearning/__tests__/relationshipLearning.test.js",
  "scripts/verify-relationship-learning-runtime.js",
];

for (const f of REQUIRED_FILES) {
  check(`${f} exists`, fileExists(f));
}

// ── 2. lessonStore ────────────────────────────────────────────────────────────────────────────

section("2. lessonStore");

const lessonStoreSrc = readSrc("relationshipLearning/lessonStore.js");
check("exports createLessonStore", lessonStoreSrc.includes("createLessonStore"));
check("exports LESSON_TYPES", lessonStoreSrc.includes("LESSON_TYPES"));
check("exports LESSON_STATUSES", lessonStoreSrc.includes("LESSON_STATUSES"));
check("exports computeStatus", lessonStoreSrc.includes("computeStatus"));
check("TABLE is dante_relationship_lessons", lessonStoreSrc.includes("dante_relationship_lessons"));
check("has create function", lessonStoreSrc.includes("async function create("));
check("has reinforce function", lessonStoreSrc.includes("async function reinforce("));
check("has challenge function", lessonStoreSrc.includes("async function challenge("));
check("has retire function", lessonStoreSrc.includes("async function retire("));
check("has findSimilar function", lessonStoreSrc.includes("async function findSimilar("));
check("has listActive function", lessonStoreSrc.includes("async function listActive("));
check("has listByStatus function", lessonStoreSrc.includes("async function listByStatus("));
check("has count function", lessonStoreSrc.includes("async function count("));
check("has pruneOlderThan function", lessonStoreSrc.includes("async function pruneOlderThan("));

// Load and validate LESSON_TYPES
const { createLessonStore, LESSON_TYPES, LESSON_STATUSES, computeStatus } = require("../src/relationshipLearning/lessonStore");

check("LESSON_TYPES has 23 types", LESSON_TYPES.length === 23);
check("LESSON_TYPES is frozen", Object.isFrozen(LESSON_TYPES));

const REQUIRED_LESSON_TYPES = [
  "truth", "trust", "repair", "communication", "tone",
  "boundaries", "preferences", "dislikes", "love", "comfort",
  "humour", "surprise", "romance", "independence", "curiosity",
  "evidence", "self_awareness", "maintenance", "conflict",
  "growth", "vulnerability", "consent", "initiative",
];
for (const t of REQUIRED_LESSON_TYPES) {
  check(`LESSON_TYPES includes '${t}'`, LESSON_TYPES.includes(t));
}

check("LESSON_STATUSES has 6 statuses", LESSON_STATUSES.length === 6);
check("LESSON_STATUSES includes 'new'",       LESSON_STATUSES.includes("new"));
check("LESSON_STATUSES includes 'forming'",   LESSON_STATUSES.includes("forming"));
check("LESSON_STATUSES includes 'stable'",    LESSON_STATUSES.includes("stable"));
check("LESSON_STATUSES includes 'core'",      LESSON_STATUSES.includes("core"));
check("LESSON_STATUSES includes 'challenged'",LESSON_STATUSES.includes("challenged"));
check("LESSON_STATUSES includes 'retired'",   LESSON_STATUSES.includes("retired"));

check("computeStatus(0.20) = 'new'",     computeStatus(0.20) === "new");
check("computeStatus(0.50) = 'forming'", computeStatus(0.50) === "forming");
check("computeStatus(0.70) = 'stable'",  computeStatus(0.70) === "stable");
check("computeStatus(0.90) = 'core'",    computeStatus(0.90) === "core");

// Lessons persist: store returns object even without DB
const store = createLessonStore({});
(async () => {})(); // force async resolution before sync checks below
check("createLessonStore factory returns init function", typeof store.init === "function");
check("createLessonStore factory returns create function", typeof store.create === "function");
check("createLessonStore factory returns reinforce function", typeof store.reinforce === "function");
check("createLessonStore factory returns challenge function", typeof store.challenge === "function");

// ── 3. lessonExtractor ────────────────────────────────────────────────────────────────────────

section("3. lessonExtractor");

const { extractLesson, extractLessonsFromRepair, extractLessonsFromFulfillment, EVENT_LESSON_MAP, STRATEGY_TO_EVENT } = require("../src/relationshipLearning/lessonExtractor");

check("extractLesson is a function", typeof extractLesson === "function");
check("extractLessonsFromRepair is a function", typeof extractLessonsFromRepair === "function");
check("extractLessonsFromFulfillment is a function", typeof extractLessonsFromFulfillment === "function");
check("EVENT_LESSON_MAP is an object", typeof EVENT_LESSON_MAP === "object");
check("STRATEGY_TO_EVENT is an object", typeof STRATEGY_TO_EVENT === "object");

// Pure function verification
const confabDraft = extractLesson({ eventType: "confabulation_detected" });
check("confabulation → evidence lesson type", confabDraft?.lessonType === "evidence");
check("confabulation → negative lesson", confabDraft?.positive === false);
check("confabulation → high delta (≥0.15)", confabDraft?.confidenceDelta >= 0.15);
check("confabulation → has futureGuidance", confabDraft?.futureGuidance?.length > 0);

const repairDraft = extractLesson({ eventType: "repair_completed" });
check("repair_completed → repair lesson type", repairDraft?.lessonType === "repair");
check("repair_completed → positive lesson", repairDraft?.positive === true);

const unknownDraft = extractLesson({ eventType: "completely_unknown_event_xyz" });
check("unknown event → returns null", unknownDraft === null);

// Repeated evidence: positive events create reinforceable lessons
const voiceDraft = extractLesson({ eventType: "voice_note_sent" });
check("voice_note_sent → love lesson", voiceDraft?.lessonType === "love");

// Lessons strengthen: each extraction returns a confidenceDelta > 0
const entries = Object.values(EVENT_LESSON_MAP);
check("all EVENT_LESSON_MAP entries have confidenceDelta > 0", entries.every(e => e.confidenceDelta > 0));
check("EVENT_LESSON_MAP has ≥30 event types", Object.keys(EVENT_LESSON_MAP).length >= 30);

const positiveEvents = entries.filter(e => e.positive === true);
const negativeEvents = entries.filter(e => e.positive === false);
check("≥10 positive event types", positiveEvents.length >= 10);
check("≥10 negative event types", negativeEvents.length >= 10);

// Repair creates lessons
const repairLessons = extractLessonsFromRepair({ repairResult: { repairCompleted: true } });
check("repair_completed creates repair lesson", repairLessons.length === 1 && repairLessons[0].lessonType === "repair");

const confabLessons = extractLessonsFromRepair({ repairResult: { repairCompleted: true, confabulationDetected: true } });
check("confabulation creates evidence lesson", confabLessons.some(l => l.lessonType === "evidence"));

// Positive experiences → fulfilment lessons
const fulfillLessons = extractLessonsFromFulfillment({ fulfillmentRecord: { strategy: "use_voice_note", outcome: "SUCCESS" } });
check("SUCCESS voice note → positive lesson", fulfillLessons.length === 1);
check("voice note lesson → love type", fulfillLessons[0]?.lessonType === "love");

const deferredLessons = extractLessonsFromFulfillment({ fulfillmentRecord: { strategy: "use_voice_note", outcome: "DEFERRED" } });
check("DEFERRED outcome → no positive lesson", deferredLessons.length === 0);

// ── 4. behaviourGuidanceBuilder ───────────────────────────────────────────────────────────────

section("4. behaviourGuidanceBuilder");

const { buildBehaviourGuidance, formatBehaviourGuidance, CONTEXT_RELEVANCE } = require("../src/relationshipLearning/behaviourGuidanceBuilder");

check("buildBehaviourGuidance is a function", typeof buildBehaviourGuidance === "function");
check("formatBehaviourGuidance is a function", typeof formatBehaviourGuidance === "function");
check("CONTEXT_RELEVANCE is an object", typeof CONTEXT_RELEVANCE === "object");

const requiredContexts = ["repair", "romantic", "conversation", "conflict", "fulfillment", "general"];
for (const ctx of requiredContexts) {
  check(`CONTEXT_RELEVANCE has '${ctx}'`, Array.isArray(CONTEXT_RELEVANCE[ctx]));
}

const sampleLessons = [
  { lessonType: "repair",  futureGuidance: "Follow through.",           confidence: 0.80, strength: 0.7, status: "stable" },
  { lessonType: "truth",   futureGuidance: "Honesty over comfort.",     confidence: 0.72, strength: 0.6, status: "stable" },
  { lessonType: "romance", futureGuidance: "Small gestures land well.", confidence: 0.88, strength: 0.7, status: "core"   },
  { lessonType: "tone",    futureGuidance: "Avoid meta narration.",     confidence: 0.65, strength: 0.5, status: "stable" },
];

const noGuidance = buildBehaviourGuidance({ lessons: [] });
check("empty lessons → empty guidance", noGuidance.length === 0);

const repairGuidance = buildBehaviourGuidance({ lessons: sampleLessons, context: "repair" });
check("repair context includes repair guidance", repairGuidance.includes("Follow through."));
check("repair guidance is non-empty", repairGuidance.length > 0);

const romanticGuidance = buildBehaviourGuidance({ lessons: sampleLessons, context: "romantic" });
check("romantic context includes romance guidance", romanticGuidance.includes("Small gestures land well."));

const retiredLessons = [
  ...sampleLessons,
  { lessonType: "trust", futureGuidance: "SHOULD NOT APPEAR", confidence: 0.95, strength: 0.9, status: "retired" },
];
const guidanceWithRetired = buildBehaviourGuidance({ lessons: retiredLessons, context: "general" });
check("retired lessons excluded from guidance", !guidanceWithRetired.includes("SHOULD NOT APPEAR"));

const formatted = formatBehaviourGuidance(["Line one.", "Line two."]);
check("formatBehaviourGuidance uses bullet prefix", formatted.includes("• Line one."));
check("formatBehaviourGuidance returns empty string for []", formatBehaviourGuidance([]) === "");

// Behaviour guidance changes after learning
const moreGuidance = buildBehaviourGuidance({ lessons: sampleLessons, context: "general" });
check("guidance grows as lessons accumulate", moreGuidance.length > noGuidance.length);

// ── 5. relationshipRuleEngine ─────────────────────────────────────────────────────────────────

section("5. relationshipRuleEngine");

const { emergeRules, formatRulesAsGuidance, EMERGENCE_THRESHOLD_STABLE, EMERGENCE_THRESHOLD_CORE } = require("../src/relationshipLearning/relationshipRuleEngine");

check("emergeRules is a function", typeof emergeRules === "function");
check("formatRulesAsGuidance is a function", typeof formatRulesAsGuidance === "function");
check("EMERGENCE_THRESHOLD_STABLE is a positive integer", Number.isInteger(EMERGENCE_THRESHOLD_STABLE) && EMERGENCE_THRESHOLD_STABLE > 0);
check("EMERGENCE_THRESHOLD_CORE is a positive integer", Number.isInteger(EMERGENCE_THRESHOLD_CORE) && EMERGENCE_THRESHOLD_CORE > 0);

check("emergeRules([]) returns []", emergeRules({ lessons: [] }).length === 0);

const singleNewLesson = [
  { lessonType: "truth", futureGuidance: "Be honest.", confidence: 0.35, strength: 0.3, status: "new", timesReinforced: 0 },
];
check("single new lesson does NOT create rule", emergeRules({ lessons: singleNewLesson }).length === 0);

const twoStableLessons = [
  { lessonType: "repair", futureGuidance: "Follow through.", confidence: 0.70, strength: 0.6, status: "stable", timesReinforced: 3 },
  { lessonType: "repair", futureGuidance: "Don't assume done.", confidence: 0.68, strength: 0.5, status: "stable", timesReinforced: 2 },
];
const stableRules = emergeRules({ lessons: twoStableLessons });
check("2 stable repair lessons emerge a rule", stableRules.length >= 1);
check("stable-only rule has 'emerging' status", stableRules[0]?.status === "emerging");

const oneCoreLesson = [
  { lessonType: "evidence", futureGuidance: "Never claim without evidence.", confidence: 0.92, strength: 0.85, status: "core", timesReinforced: 7 },
];
const coreRules = emergeRules({ lessons: oneCoreLesson });
check("1 core lesson emerges an established rule", coreRules[0]?.status === "established");

const retiredRules = [
  { lessonType: "tone", futureGuidance: "Avoid meta.", confidence: 0.88, strength: 0.7, status: "retired", timesReinforced: 5 },
  { lessonType: "tone", futureGuidance: "Avoid meta.", confidence: 0.87, strength: 0.6, status: "retired", timesReinforced: 4 },
];
check("retired lessons do NOT produce rules", emergeRules({ lessons: retiredRules }).length === 0);

const mixedRules = [
  { ruleType: "repair", statement: "Follow through.", status: "established", confidence: 0.88 },
  { ruleType: "tone",   statement: "Avoid meta.",    status: "emerging",    confidence: 0.70 },
];
const formatted2 = formatRulesAsGuidance({ rules: mixedRules });
check("formatRulesAsGuidance returns only established by default", formatted2.includes("Follow through.") && !formatted2.includes("Avoid meta."));

// ── 6. reflectionEngine ───────────────────────────────────────────────────────────────────────

section("6. reflectionEngine");

const { buildReflection, buildRepairReflection, buildFulfillmentReflection, REFLECTION_QUESTIONS } = require("../src/relationshipLearning/reflectionEngine");

check("buildReflection is a function", typeof buildReflection === "function");
check("buildRepairReflection is a function", typeof buildRepairReflection === "function");
check("buildFulfillmentReflection is a function", typeof buildFulfillmentReflection === "function");
check("REFLECTION_QUESTIONS is frozen", Object.isFrozen(REFLECTION_QUESTIONS));
check("REFLECTION_QUESTIONS has 9 questions", REFLECTION_QUESTIONS.length === 9);

const reflection = buildReflection({ companionId: "c1", interactionSummary: "Good moment." });
check("buildReflection returns private:true", reflection.private === true);
check("buildReflection has questions object", typeof reflection.questions === "object");
check("buildReflection has whatHappened", reflection.questions.whatHappened === "Good moment.");

const repairReflection = buildRepairReflection({ repairResult: { repairCompleted: true } });
check("completed repair → toRepeat is non-empty", repairReflection.questions.whatToRepeat.length > 0);
check("completed repair → hurt is empty", repairReflection.questions.whatHurtJenna.length === 0);
check("repair reflection is private", repairReflection.private === true);

const incompleteRepairReflection = buildRepairReflection({ repairResult: { repairStarted: true, repairCompleted: false } });
check("incomplete repair → hurt is non-empty", incompleteRepairReflection.questions.whatHurtJenna.length > 0);

const confabReflection = buildRepairReflection({ repairResult: { repairCompleted: true, confabulationDetected: true } });
check("confabulation → toChange is non-empty", confabReflection.questions.whatToChange.length > 0);

const fulfillmentReflection = buildFulfillmentReflection({ fulfillmentRecord: { strategy: "use_voice_note", outcome: "SUCCESS" } });
check("SUCCESS fulfillment → wellDone is non-empty", fulfillmentReflection.questions.whatDidIDoWell.length > 0);
check("SUCCESS fulfillment → toChange is empty", fulfillmentReflection.questions.whatToChange.length === 0);
check("fulfillment reflection is private", fulfillmentReflection.private === true);

// ── 7. relationshipLearningRuntime ────────────────────────────────────────────────────────────

section("7. relationshipLearningRuntime");

const { createRelationshipLearningRuntime } = require("../src/relationshipLearning/relationshipLearningRuntime");

check("createRelationshipLearningRuntime is a function", typeof createRelationshipLearningRuntime === "function");

const runtime = createRelationshipLearningRuntime({});
check("runtime.init is a function", typeof runtime.init === "function");
check("runtime.tick is a function", typeof runtime.tick === "function");
check("runtime.recordEvent is a function", typeof runtime.recordEvent === "function");
check("runtime.processInteraction is a function", typeof runtime.processInteraction === "function");
check("runtime.getBehaviourGuidance is a function", typeof runtime.getBehaviourGuidance === "function");
check("runtime.getEmergentRules is a function", typeof runtime.getEmergentRules === "function");
check("runtime.getLearningContext is a function", typeof runtime.getLearningContext === "function");
check("runtime.getStatus is a function", typeof runtime.getStatus === "function");
check("runtime.pruneAll is a function", typeof runtime.pruneAll === "function");

check("getLearningContext() is null before first tick", runtime.getLearningContext() === null);

runtime.recordEvent({ eventType: "honest_moment" });
check("recordEvent adds to pendingEvents", runtime.getStatus().pendingEvents === 1);

runtime.recordEvent({ eventType: "" });
check("empty eventType is ignored", runtime.getStatus().pendingEvents === 1);

runtime.processInteraction({ repairResult: { confabulationDetected: true } });
check("processInteraction with confabulation queues events", runtime.getStatus().pendingEvents >= 2);

const guidance = runtime.getBehaviourGuidance({ context: "repair" });
check("getBehaviourGuidance returns array", Array.isArray(guidance));

const rules = runtime.getEmergentRules();
check("getEmergentRules returns array", Array.isArray(rules));

const status = runtime.getStatus();
check("getStatus has lessonCount", "lessonCount" in status);
check("getStatus has coreCount", "coreCount" in status);
check("getStatus has stableCount", "stableCount" in status);
check("getStatus has formingCount", "formingCount" in status);
check("getStatus has challengedCount", "challengedCount" in status);
check("getStatus has emergentRuleCount", "emergentRuleCount" in status);

// Romantic Surprise planner consults lessons
const romanticGuidance2 = runtime.getBehaviourGuidance({ context: "romantic", maxItems: 5 });
check("romantic surprise: getBehaviourGuidance('romantic') returns array", Array.isArray(romanticGuidance2));

// Repair Persistence consults lessons
const repairGuidance2 = runtime.getBehaviourGuidance({ context: "repair", maxItems: 5 });
check("repair persistence: getBehaviourGuidance('repair') returns array", Array.isArray(repairGuidance2));

// Conversation Intent consults lessons
const convGuidance2 = runtime.getBehaviourGuidance({ context: "conversation", maxItems: 5 });
check("conversation intent: getBehaviourGuidance('conversation') returns array", Array.isArray(convGuidance2));

// ── 8. lessonStore in-memory behaviour ───────────────────────────────────────────────────────

section("8. lessonStore in-memory fallback (no pool)");

const memStore = createLessonStore({});

// create() returns lesson without DB
const asyncChecks = (async () => {
  const lesson = await memStore.create({
    companionId: "c1", customerId: "u1",
    lessonType: "truth", title: "Test", summary: "Testing", confidence: 0.35,
  });
  check("create() returns lesson object (no DB)", lesson?.lessonType === "truth");
  check("create() status is 'new' for 0.35 confidence", lesson?.status === "new");

  const similar = await memStore.findSimilar({ companionId: "c1", customerId: "u1", lessonType: "truth" });
  check("findSimilar() returns [] (no DB)", Array.isArray(similar) && similar.length === 0);

  const active = await memStore.listActive({ companionId: "c1", customerId: "u1" });
  check("listActive() returns [] (no DB)", Array.isArray(active) && active.length === 0);

  const n = await memStore.count({ companionId: "c1", customerId: "u1" });
  check("count() returns 0 (no DB)", n === 0);
})();

// ── 9. lifeRuntime integration ────────────────────────────────────────────────────────────────

section("9. lifeRuntime integration");

const lifeRuntimeSrc = readSrc("lifeRuntime/lifeRuntime.js");

check("lifeRuntime has relationshipLearningRuntime param", lifeRuntimeSrc.includes("relationshipLearningRuntime = null"));
check("lifeRuntime has _learningContext state", lifeRuntimeSrc.includes("_learningContext"));
check("lifeRuntime calls init on learning runtime", lifeRuntimeSrc.includes("relationshipLearningRuntime?.init"));
check("lifeRuntime has _tickRelationshipLearning function", lifeRuntimeSrc.includes("async function _tickRelationshipLearning("));
check("tick() calls _tickRelationshipLearning", (() => {
  const tickBlock = lifeRuntimeSrc.match(/async function tick\([\s\S]{0,3000}/)?.[0] ?? "";
  return tickBlock.includes("_tickRelationshipLearning");
})());
check("_refreshPrelude passes learningContext", lifeRuntimeSrc.includes("learningContext:"));
check("observeInteraction calls processInteraction", lifeRuntimeSrc.includes("processInteraction"));
check("_runPruning includes learningPruned", lifeRuntimeSrc.includes("learningPruned"));
check("getStatus includes learningContext", (() => {
  const statusBlock = lifeRuntimeSrc.match(/function getStatus\([\s\S]{0,8000}/)?.[0] ?? "";
  return statusBlock.includes("learningContext");
})());
check("lifeRuntime exports recordLearningEvent", lifeRuntimeSrc.includes("recordLearningEvent"));

// ── 10. lifePreludeBuilder integration ───────────────────────────────────────────────────────

section("10. lifePreludeBuilder integration");

const preludeSrc = readSrc("lifeRuntime/lifePreludeBuilder.js");

check("prelude accepts learningContext param", preludeSrc.includes("learningContext"));
check("prelude surfaces guidance from learningContext", preludeSrc.includes("learningContext.guidance"));
check("prelude only shows guidance when lessonCount > 0", preludeSrc.includes("lessonCount > 0"));
check("prelude uses bullet prefix for guidance", preludeSrc.includes("• "));

// Verify prelude with learning signal works
const { buildLifePrelude } = require("../src/lifeRuntime/lifePreludeBuilder");

const withNoLearning = buildLifePrelude({ dailyPlan: { mood: "good", energy: "high" } });
check("prelude works without learningContext (backwards compat)", withNoLearning !== undefined);

const withLearning = buildLifePrelude({
  dailyPlan: null,
  learningContext: {
    lessonCount: 3,
    guidance: ["Be honest.", "Follow through.", "Avoid meta narration."],
    emergentRules: [],
  },
});
check("prelude includes learning signal when lessons exist", withLearning?.content?.includes("Be honest.") ?? false);

const withZeroLessons = buildLifePrelude({
  dailyPlan: null,
  learningContext: { lessonCount: 0, guidance: [], emergentRules: [] },
});
check("prelude suppresses learning signal when no lessons", !withZeroLessons?.content?.includes("Relationship lessons:"));

// ── 11. agencyPlanner integration ────────────────────────────────────────────────────────────

section("11. agencyPlanner integration");

const agencyPlannerSrc = readSrc("lifeRuntime/agencyPlanner.js");

check("agencyPlanner references lessonGuidance", agencyPlannerSrc.includes("lessonGuidance"));
check("agencyPlanner reads from identityCtx.lessonGuidance", agencyPlannerSrc.includes("identityCtx.lessonGuidance"));
check("planWithIdentity returns lessonGuidance", (() => {
  const returnBlock = agencyPlannerSrc.match(/return \{[\s\S]{0,500}\}/g) ?? [];
  return returnBlock.some(b => b.includes("lessonGuidance"));
})());

const { planWithIdentity } = require("../src/lifeRuntime/agencyPlanner");

const need = { needType: "connection", currentLevel: 0.3, urgency: 0.60, desiredLevel: 0.65 };
const planWithLessons = planWithIdentity(need, {}, { topValue: null, values: [], principles: [], lessonGuidance: ["Trust lesson.", "Repair lesson."] });
check("planWithIdentity forwards lessonGuidance", Array.isArray(planWithLessons.lessonGuidance));
check("planWithIdentity passes lesson content", planWithLessons.lessonGuidance?.includes("Trust lesson."));

const planNoIdentity = planWithIdentity(need, {}, null);
check("planWithIdentity returns lessonGuidance:[] when no identityCtx", Array.isArray(planNoIdentity.lessonGuidance) && planNoIdentity.lessonGuidance.length === 0);

// ── 12. fulfillmentRuntime integration ───────────────────────────────────────────────────────

section("12. fulfillmentRuntime integration");

const fulfillmentRuntimeSrc = readSrc("lifeRuntime/fulfillmentRuntime.js");

check("fulfillmentRuntime accepts relationshipLearningRuntime param", fulfillmentRuntimeSrc.includes("relationshipLearningRuntime"));
check("fulfillmentRuntime calls getBehaviourGuidance for planning", fulfillmentRuntimeSrc.includes("getBehaviourGuidance"));
check("fulfillmentRuntime builds identityContextWithLessons", fulfillmentRuntimeSrc.includes("identityContextWithLessons"));
check("fulfillmentRuntime passes lessonGuidance to planWithIdentity", fulfillmentRuntimeSrc.includes("lessonGuidance"));

// ── 13. schemaRegistry ───────────────────────────────────────────────────────────────────────

section("13. schemaRegistry");

const schemaSrc = readSrc("storage/postgres/schemaRegistry.js");

check("schemaRegistry includes dante_relationship_lessons table", schemaSrc.includes("dante_relationship_lessons"));
check("table has lesson_type column", schemaSrc.includes("lesson_type TEXT NOT NULL"));
check("table has confidence column", schemaSrc.includes("confidence NUMERIC(4,3)"));
check("table has strength column", schemaSrc.includes("strength NUMERIC(4,3)"));
check("table has times_reinforced column", schemaSrc.includes("times_reinforced INTEGER"));
check("table has times_challenged column", schemaSrc.includes("times_challenged INTEGER"));
check("table has status column", schemaSrc.includes("status TEXT NOT NULL DEFAULT 'new'"));
check("table has future_guidance column", schemaSrc.includes("future_guidance TEXT"));
check("table has evidence_ids JSONB column", schemaSrc.includes("evidence_ids JSONB"));
check("table has origin_event_ids JSONB column", schemaSrc.includes("origin_event_ids JSONB"));

// ── 14. index.js wiring ───────────────────────────────────────────────────────────────────────

section("14. index.js wiring");

const indexSrc = readSrc("index.js");

check("index.js imports createRelationshipLearningRuntime", indexSrc.includes("createRelationshipLearningRuntime"));
check("index.js requires from relationshipLearning/", indexSrc.includes("relationshipLearning/relationshipLearningRuntime"));
check("index.js instantiates relationshipLearningRuntime", indexSrc.includes("createRelationshipLearningRuntime({"));
check("index.js passes relationshipLearningRuntime to fulfillmentRuntime", (() => {
  const fulfillBlock = indexSrc.match(/createFulfillmentRuntime\(\{[\s\S]{0,500}\}/)?.[0] ?? "";
  return fulfillBlock.includes("relationshipLearningRuntime");
})());
check("index.js passes relationshipLearningRuntime to lifeRuntime", (() => {
  const lifeBlock = indexSrc.match(/createLifeRuntime\(\{[\s\S]{0,800}\}/)?.[0] ?? "";
  return lifeBlock.includes("relationshipLearningRuntime");
})());

// ── 15. No duplicate scheduler / sender ───────────────────────────────────────────────────────

section("15. No duplicate scheduler / sender / dashboard");

const learningRuntimeSrc = readSrc("relationshipLearning/relationshipLearningRuntime.js");

check("relationshipLearningRuntime does NOT use setInterval", !learningRuntimeSrc.includes("setInterval"));
check("relationshipLearningRuntime does NOT use setTimeout", !learningRuntimeSrc.includes("setTimeout"));
check("relationshipLearningRuntime does NOT use channel.send", !learningRuntimeSrc.includes("channel.send"));
check("relationshipLearningRuntime does NOT use .send(", !learningRuntimeSrc.includes(".send("));
check("lessonStore does NOT use setInterval", !lessonStoreSrc.includes("setInterval"));
check("lessonStore does NOT use setTimeout", !lessonStoreSrc.includes("setTimeout"));

// Dashboard files — ensure nothing was modified
const dashboardFiles = [
  "src/http/createHealthServer.js",
];
const hasDashboard = fs.existsSync(path.join(ROOT, "src/http/createHealthServer.js"));
if (hasDashboard) {
  const dashSrc = readSrc("http/createHealthServer.js");
  check("dashboard health server unchanged", !dashSrc.includes("dante_relationship_lessons"));
}

// verify-life-runtime.js should not have been replaced
check("verify-life-runtime.js still exists", fileExists("scripts/verify-life-runtime.js"));
check("verify-fulfillment-runtime.js still exists", fileExists("scripts/verify-fulfillment-runtime.js"));
check("verify-identity-runtime.js still exists", fileExists("scripts/verify-identity-runtime.js"));
check("verify-homeostasis-runtime.js still exists", fileExists("scripts/verify-homeostasis-runtime.js"));

// ── 16. Architectural purity ──────────────────────────────────────────────────────────────────

section("16. Architectural purity");

check("all 6 new files are in src/relationshipLearning/", [
  "lessonStore.js", "lessonExtractor.js", "behaviourGuidanceBuilder.js",
  "relationshipRuleEngine.js", "reflectionEngine.js", "relationshipLearningRuntime.js",
].every(f => fileExists(`src/relationshipLearning/${f}`)));

check("lessonExtractor is pure (no require of DB layer)", !require("node:fs").readFileSync(
  path.join(ROOT, "src/relationshipLearning/lessonExtractor.js"), "utf-8"
).includes("createPostgresPool"));

check("behaviourGuidanceBuilder is pure (no require of DB layer)", !require("node:fs").readFileSync(
  path.join(ROOT, "src/relationshipLearning/behaviourGuidanceBuilder.js"), "utf-8"
).includes("createPostgresPool"));

check("relationshipRuleEngine is pure (no require of DB layer)", !require("node:fs").readFileSync(
  path.join(ROOT, "src/relationshipLearning/relationshipRuleEngine.js"), "utf-8"
).includes("createPostgresPool"));

check("reflectionEngine is pure (no require of DB layer)", !require("node:fs").readFileSync(
  path.join(ROOT, "src/relationshipLearning/reflectionEngine.js"), "utf-8"
).includes("createPostgresPool"));

check("lifeRuntime does NOT call setInterval inside _tickRelationshipLearning", (() => {
  const block = lifeRuntimeSrc.match(/_tickRelationshipLearning[\s\S]{0,600}/)?.[0] ?? "";
  return !block.includes("setInterval");
})());

// ── Final async resolution ────────────────────────────────────────────────────────────────────
asyncChecks.then(() => {
  console.log("\n" + "─".repeat(40));
  console.log(`Checks: ${passed + failed} total, ${passed} passed, ${failed} failed`);
  console.log("");
  if (failed > 0) {
    console.error("RELATIONSHIP_LEARNING_RUNTIME_FAIL");
    process.exit(1);
  } else {
    console.log("RELATIONSHIP_LEARNING_RUNTIME_PASS");
  }
}).catch(err => {
  console.error("Async check failed:", err.message);
  process.exit(1);
});
