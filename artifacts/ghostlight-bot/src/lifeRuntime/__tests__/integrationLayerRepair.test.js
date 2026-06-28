"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");
const path   = require("node:path");

const root = path.resolve(__dirname, "..");

// ── 1. Availability conflict: two different values → uncertainty ──────────────
test("reconcilePresencePrelude: conflicting availability values → uncertainty signal", () => {
  const { reconcilePresencePrelude } = require(path.join(root, "preludeReconciler"));
  const { BELIEF_SURFACE_THRESHOLD } = require(path.join(root, "worldBeliefResolver"));
  const now = new Date().toISOString();

  const worldModelContext = {
    worldModel: {
      jenna: {
        availability: { value: "available", confidence: 0.80, source: "discord_event", timestamp: now, evidence_ids: [], conflict: 0, stale: false },
        give_space_state: { value: false, confidence: 0, source: "default", timestamp: null, evidence_ids: [], conflict: 0, stale: false },
      },
      relationship: {},
      dante: {},
    },
  };

  // Perception disagrees — busy vs available
  const perceptionContext = {
    worldState: {
      jenna: { availability: "busy", _confidence: 0.75 },
    },
  };

  const line = reconcilePresencePrelude({ worldModelContext, perceptionContext });
  assert.ok(line !== null, "Should produce a presence line");
  // Conflict resolution: values differ → lower confidence OR "uncertain"
  // The conflicted confidence should reduce. If still surfaceable: includes "uncertain"
  // If too low: "availability uncertain"
  assert.ok(
    line.includes("uncertain") || line.includes("Jenna"),
    "Conflict should produce uncertainty signal"
  );
  assert.ok(!line.includes("available") || line.includes("uncertain"),
    "Should not confidently assert 'available' when perception says 'busy'"
  );
});

// ── 2. Availability agreement: same value → max confidence ───────────────────
test("reconcilePresencePrelude: agreement on availability uses higher confidence", () => {
  const { reconcilePresencePrelude } = require(path.join(root, "preludeReconciler"));
  const now = new Date().toISOString();

  const worldModelContext = {
    worldModel: {
      jenna: {
        availability: { value: "busy", confidence: 0.72, source: "discord_event", timestamp: now, evidence_ids: [], conflict: 0, stale: false },
        give_space_state: { value: false, confidence: 0, source: "default", timestamp: null, evidence_ids: [], conflict: 0, stale: false },
      },
      relationship: {},
      dante: {},
    },
  };

  // Perception agrees — both say busy
  const perceptionContext = {
    worldState: {
      jenna: { availability: "busy", _confidence: 0.68 },
    },
  };

  const line = reconcilePresencePrelude({ worldModelContext, perceptionContext });
  assert.ok(line !== null, "Should produce a presence line");
  assert.ok(line.includes("busy"), "Should report 'busy' when both sources agree");
  assert.ok(!line.includes("uncertain"), "Should not flag uncertainty when sources agree");
  assert.ok(!/\d+%/.test(line), "Should not surface confidence percentages into prompt");
});

// ── 3. Active consequenceContext → repair suppressed from presence line ─────────
test("reconcilePresencePrelude: active consequence suppresses repair from presence line", () => {
  const { reconcilePresencePrelude } = require(path.join(root, "preludeReconciler"));
  const now = new Date().toISOString();

  const worldModelContext = {
    worldModel: {
      jenna: {
        availability: { value: "available", confidence: 0.75, source: "discord_event", timestamp: now, evidence_ids: [], conflict: 0, stale: false },
        give_space_state: { value: false, confidence: 0, source: "default", timestamp: null, evidence_ids: [], conflict: 0, stale: false },
      },
      relationship: {
        repair_progress: { value: "needed", confidence: 0.85, source: "consequence_context", timestamp: now, evidence_ids: [], conflict: 0, stale: false },
      },
      dante: {},
    },
  };

  // Active consequence context: repair already narrated by consequencePreludeBuilder
  const consequenceContext = { repairRequired: true, repairStarted: false, healing: false, giveSpace: false, warming: false };

  const line = reconcilePresencePrelude({ worldModelContext, consequenceContext });
  // Repair should NOT appear in the presence line when consequenceContext is active
  assert.ok(line === null || !line.includes("Repair"), "Active consequence should suppress repair from presence line");
});

// ── 4. selfInspectionContext.preludeWarning → health suppressed from presence ──
test("reconcilePresencePrelude: selfInspection preludeWarning suppresses health from presence line", () => {
  const { reconcilePresencePrelude } = require(path.join(root, "preludeReconciler"));
  const now = new Date().toISOString();

  const worldModelContext = {
    worldModel: {
      jenna: {
        availability: { value: "available", confidence: 0.75, source: "discord_event", timestamp: now, evidence_ids: [], conflict: 0, stale: false },
        give_space_state: { value: false, confidence: 0, source: "default", timestamp: null, evidence_ids: [], conflict: 0, stale: false },
      },
      relationship: {},
      dante: {
        runtime_health: { value: "degraded", confidence: 0.80, source: "self_inspection", timestamp: now, evidence_ids: [], conflict: 0, stale: false },
      },
    },
  };

  // selfInspection already provides a narrative warning
  const selfInspectionContext = { preludeWarning: "Runtime: memory subsystem degraded — operating in limited mode" };

  const line = reconcilePresencePrelude({ worldModelContext, selfInspectionContext });
  // Health signal should NOT appear in presence line when narrative warning exists
  assert.ok(line === null || !line.includes("Runtime degraded"),
    "selfInspection preludeWarning should suppress duplicate health signal from presence line"
  );
});

// ── 5. Lesson adapter cross-visibility ───────────────────────────────────────
test("relationshipLessonStore adapter: lesson written via adapter is listed and exposes legacy field names", async () => {
  const { createRelationshipLessonStore } = require(path.join(root, "relationshipLessonStore"));
  const store = createRelationshipLessonStore({});
  await store.init();

  // Write via legacy adapter using legacy type
  const input = {
    companionId:            "dante-adapter-test",
    customerId:             "jenna-adapter-test",
    lessonType:             "hurt_pattern",   // legacy type → canonical "conflict" in DB
    title:                  "Test hurt lesson",
    summary:                "Jenna felt dismissed when interrupted",
    confidence:             0.60,
    strength:               0.50,
    futureBehaviorGuidance: "Let Jenna finish her thoughts",
    sourceConsequenceIds:   ["c1"],
  };

  const created = await store.upsertLesson(input);
  assert.ok(created, "Should create a lesson");

  // Legacy field names must be exposed alongside canonical ones
  assert.ok(Array.isArray(created.sourceConsequenceIds), "Should expose sourceConsequenceIds");
  assert.ok(typeof created.futureBehaviorGuidance === "string", "Should expose futureBehaviorGuidance");
  assert.equal(created.futureBehaviorGuidance, "Let Jenna finish her thoughts");

  // Lesson must appear in listLessons (cross-visibility: written through adapter, readable through adapter)
  const listed = await store.listLessons({ companionId: "dante-adapter-test", customerId: "jenna-adapter-test" });
  assert.ok(listed.length > 0, "Lesson should be visible in listLessons after upsert");
  const found = listed.find(l => l.title === "Test hurt lesson");
  assert.ok(found, "Specific lesson should be findable by title");
  assert.ok(Array.isArray(found.sourceConsequenceIds), "Listed lesson should expose sourceConsequenceIds");
});

// ── 6. repairStateResolver.fromConsequenceContext normalises correctly ─────────
test("repairStateResolver: fromConsequenceContext produces canonical repair snapshot", () => {
  const { createRepairStateResolver } = require(path.join(root, "repairStateResolver"));
  const resolver = createRepairStateResolver({});

  // Repair required, not yet started
  const carryover = { giveSpace: false, repairRequired: true, repairStarted: false, healing: false, warming: false };
  const snapshot = resolver.fromConsequenceContext(carryover, 2);

  assert.ok(snapshot, "Should return a snapshot");
  assert.equal(snapshot.repair_required, true);
  assert.equal(snapshot.repair_completed, false);
  assert.equal(snapshot.give_space_active, false);
  assert.equal(snapshot.unresolved_consequence_count, 2);
  assert.deepEqual(snapshot.active_repair_types, ["needed"]);
  assert.equal(snapshot.confidence, 0.90);
  assert.equal(snapshot.source, "consequenceStore");

  // Give space active
  const gsCarryover = { giveSpace: true, repairRequired: false, repairStarted: false, healing: false };
  const gsSnapshot = resolver.fromConsequenceContext(gsCarryover, 1);
  assert.equal(gsSnapshot.give_space_active, true);
  assert.deepEqual(gsSnapshot.active_repair_types, ["give_space"]);
});

// ── 7. repairStateResolver.fromConsequenceContext: healing state ──────────────
test("repairStateResolver: healing carryover produces repair_completed snapshot", () => {
  const { createRepairStateResolver } = require(path.join(root, "repairStateResolver"));
  const resolver = createRepairStateResolver({});

  // Healing: repairStarted=true, repairCompleted=true in the store, so healing=true here
  const carryover = { giveSpace: false, repairRequired: false, repairStarted: false, healing: true, warming: true };
  const snapshot = resolver.fromConsequenceContext(carryover, 0);

  assert.ok(snapshot, "Should return a snapshot");
  assert.equal(snapshot.repair_completed, true);
  assert.equal(snapshot.repair_required, false);
  assert.deepEqual(snapshot.active_repair_types, ["healing"]);
  assert.equal(snapshot.confidence, 0.90);
});

// ── 8. repairStateResolver.hydrateFromStore: null store returns null ───────────
test("repairStateResolver: hydrateFromStore with no store returns null", async () => {
  const { createRepairStateResolver } = require(path.join(root, "repairStateResolver"));
  const resolver = createRepairStateResolver({ consequenceStore: null });
  const result = await resolver.hydrateFromStore("dante", "jenna");
  assert.equal(result, null, "Should return null when no store provided");
});

// ── 9. repairStateResolver.hydrateFromStore: restores from store ──────────────
test("repairStateResolver: hydrateFromStore re-derives repair state from active consequences", async () => {
  const { createRepairStateResolver } = require(path.join(root, "repairStateResolver"));

  // Stub consequenceStore with listActive returning a repair-required consequence
  const stubStore = {
    listActive: async () => [
      {
        repairRequired:  true,
        repairStarted:   false,
        repairCompleted: false,
        suppressionRules: [],
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  const resolver = createRepairStateResolver({ consequenceStore: stubStore });
  const snapshot = await resolver.hydrateFromStore("dante", "jenna");

  assert.ok(snapshot, "Should return a snapshot from store");
  assert.equal(snapshot.repair_required, true);
  assert.equal(snapshot.give_space_active, false);
  assert.deepEqual(snapshot.active_repair_types, ["needed"]);
  assert.equal(snapshot.source, "consequenceStore");
  assert.equal(snapshot.unresolved_consequence_count, 1);
});

// ── 10. availabilityConfidenceResolver: conflict lowers confidence ────────────
test("resolveAvailabilityConfidence: conflicting signals lower confidence", () => {
  const { resolveAvailabilityConfidence } = require(path.join(root, "availabilityConfidenceResolver"));

  const sources = [
    { value: "available", confidence: 0.80, source: "discord_event" },
    { value: "busy",      confidence: 0.75, source: "alive_presence" },
  ];

  const result = resolveAvailabilityConfidence(sources);
  assert.ok(result.conflict > 0, "Conflict should be detected");
  assert.ok(result.confidence < 0.80, "Confidence should be lowered by conflict");
  assert.equal(result.value, "available", "Higher-authority source value should dominate");
});

// ── 11. availabilityConfidenceResolver: agreement raises effective confidence ─
test("resolveAvailabilityConfidence: agreeing signals produce expected confidence", () => {
  const { resolveAvailabilityConfidence } = require(path.join(root, "availabilityConfidenceResolver"));

  const sources = [
    { value: "busy", confidence: 0.80, source: "discord_event" },
    { value: "busy", confidence: 0.70, source: "alive_presence" },
  ];

  const result = resolveAvailabilityConfidence(sources);
  assert.equal(result.conflict, 0, "No conflict when values agree");
  assert.ok(result.confidence > 0, "Confidence should be positive");
  assert.equal(result.value, "busy");
});

// ── 12. availabilityConfidenceResolver: decay reaches stale ──────────────────
test("applyAvailabilityDecay: confidence decays to stale after sufficient time", () => {
  const { applyAvailabilityDecay, AVAILABILITY_UNKNOWN_THRESHOLD, AVAILABILITY_THRESHOLD_MS } = require(path.join(root, "availabilityConfidenceResolver"));

  // At 0.15 per period (30 min), 0.90 → stale after 0.90/0.15 = 6 periods = 3 hours
  const ageMs = 3 * 60 * 60 * 1000; // 3 hours
  const { confidence, stale } = applyAvailabilityDecay(0.90, ageMs, AVAILABILITY_THRESHOLD_MS);
  assert.ok(confidence >= 0, "Confidence should not go below zero");
  assert.ok(stale, "Should be stale after 3 hours at 0.15/period");
  assert.ok(confidence < AVAILABILITY_UNKNOWN_THRESHOLD, `Expected stale, got ${confidence}`);
});

// ── 13. event bus: dead events removed ───────────────────────────────────────
test("runtimeEventBus: dead events are not in EVENT_TYPES", () => {
  const { EVENT_TYPES } = require(path.join(root, "runtimeEventBus"));
  const deadEvents = [
    "need_satisfied", "need_depleted", "identity_preference_changed",
    "project_completed", "project_abandoned", "curiosity_matured",
    "resource_discovered", "first_experience_recorded",
    "narrative_chapter_opened", "narrative_self_story_updated",
    "perception_availability_changed", "perception_confidence_decayed",
  ];
  for (const dead of deadEvents) {
    assert.ok(!EVENT_TYPES.includes(dead), `Dead event '${dead}' should not be in EVENT_TYPES`);
  }
});

// ── 14. event bus: consumed events still present ──────────────────────────────
test("runtimeEventBus: consumed events are still in EVENT_TYPES", () => {
  const { EVENT_TYPES, EVENT_OWNERSHIP } = require(path.join(root, "runtimeEventBus"));
  const consumed = ["repair_started", "repair_completed", "diagnostic_warning", "self_confidence_low"];
  for (const ev of consumed) {
    assert.ok(EVENT_TYPES.includes(ev), `Consumed event '${ev}' must remain in EVENT_TYPES`);
    assert.equal(EVENT_OWNERSHIP[ev].category, "consumed", `'${ev}' must be categorised as consumed`);
  }
});

// ── 15. worldDecayEngine: jenna.availability uses canonical rate ──────────────
test("worldDecayEngine: jenna.availability decay rate matches AVAILABILITY_DECAY_RATE", () => {
  const { DECAY_RATE_OVERRIDES } = require(path.join(root, "worldDecayEngine"));
  const { AVAILABILITY_DECAY_RATE } = require(path.join(root, "availabilityConfidenceResolver"));
  assert.equal(
    DECAY_RATE_OVERRIDES["jenna.availability"],
    AVAILABILITY_DECAY_RATE,
    "jenna.availability must use the canonical availability decay rate"
  );
  assert.equal(AVAILABILITY_DECAY_RATE, 0.15, "Canonical rate must be 0.15");
});
