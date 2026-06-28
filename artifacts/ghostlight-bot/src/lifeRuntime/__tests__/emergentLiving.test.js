"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");
const path   = require("node:path");

const root = path.resolve(__dirname, "..");

const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date("2026-01-01T12:00:00Z");
const day = n => new Date(BASE.getTime() + n * DAY);

function freshRuntime() {
  const { createEmergentLivingBehaviorRuntime } = require(path.join(root, "emergentLivingBehaviorRuntime"));
  return createEmergentLivingBehaviorRuntime({});
}

// ── 1. One event creates only "observed", never stable/core ───────────────────
test("CORE LAW: a single event can only create an 'observed' pattern", async () => {
  const { computeStage } = require(path.join(root, "emergencePatternDetector"));
  // Even with maximum strength, one event is "observed".
  assert.equal(computeStage({ evidenceCount: 1, distinctBuckets: 1, strength: 1, contradictionCount: 0 }), "observed");

  const rt = freshRuntime();
  await rt.init();
  await rt.recordEvidence({
    companionId: "dante", customerId: "jenna", kind: "behavior",
    behaviorType: "comfort_pattern", signature: "one_off",
    title: "one off", source_event_ids: ["e1"], now: day(0),
  });
  const all = await rt.livingBehaviorStore.listAll({ companionId: "dante", customerId: "jenna" });
  assert.equal(all.length, 1);
  assert.equal(all[0].stage, "observed", "one event must remain observed");
  assert.notEqual(all[0].stage, "stable");
  assert.notEqual(all[0].stage, "core");
});

// ── 2. Repeated evidence promotes observed → forming ──────────────────────────
test("Repeated evidence promotes observed → forming", async () => {
  const rt = freshRuntime();
  await rt.init();
  for (let i = 0; i < 2; i++) {
    await rt.recordEvidence({
      companionId: "dante", customerId: "jenna", kind: "behavior",
      behaviorType: "comfort_pattern", signature: "warmth",
      title: "warmth", source_event_ids: ["e" + i], now: day(i),
    });
  }
  const [b] = await rt.livingBehaviorStore.listAll({ companionId: "dante", customerId: "jenna" });
  assert.equal(b.stage, "forming");
});

// ── 3. More repeated evidence across time promotes forming → emerging ─────────
test("More repeated evidence across time promotes forming → emerging", async () => {
  const rt = freshRuntime();
  await rt.init();
  for (let i = 0; i < 3; i++) {
    await rt.recordEvidence({
      companionId: "dante", customerId: "jenna", kind: "behavior",
      behaviorType: "comfort_pattern", signature: "warmth",
      title: "warmth", source_event_ids: ["e" + i], now: day(i),
    });
  }
  const [b] = await rt.livingBehaviorStore.listAll({ companionId: "dante", customerId: "jenna" });
  assert.equal(b.stage, "emerging", "3 events across 3 days should be emerging");

  // Three events all in ONE time bucket must NOT reach emerging.
  const rt2 = freshRuntime();
  await rt2.init();
  for (let i = 0; i < 3; i++) {
    await rt2.recordEvidence({
      companionId: "dante", customerId: "jenna", kind: "behavior",
      behaviorType: "comfort_pattern", signature: "sameday",
      title: "sameday", source_event_ids: ["s" + i], now: day(0),
    });
  }
  const [b2] = await rt2.livingBehaviorStore.listAll({ companionId: "dante", customerId: "jenna" });
  assert.equal(b2.stage, "forming", "3 events in one day are not 'across time'");
});

// ── 4. Contradictory evidence can challenge / weaken a behavior ───────────────
test("Contradictory evidence challenges and weakens a behavior", async () => {
  const rt = freshRuntime();
  await rt.init();
  for (let i = 0; i < 3; i++) {
    await rt.recordEvidence({
      companionId: "dante", customerId: "jenna", kind: "behavior",
      behaviorType: "romance_pattern", signature: "gestures_land",
      title: "gestures land", source_event_ids: ["e" + i], now: day(i),
    });
  }
  const before = (await rt.livingBehaviorStore.listAll({ companionId: "dante", customerId: "jenna" }))[0];
  assert.equal(before.stage, "emerging");
  const beforeStrength = before.strength;

  await rt.recordContradiction({ companionId: "dante", customerId: "jenna", kind: "behavior", behaviorType: "romance_pattern", signature: "gestures_land", now: day(4) });
  await rt.recordContradiction({ companionId: "dante", customerId: "jenna", kind: "behavior", behaviorType: "romance_pattern", signature: "gestures_land", now: day(5) });

  const after = (await rt.livingBehaviorStore.listAll({ companionId: "dante", customerId: "jenna" }))[0];
  assert.ok(after.strength < beforeStrength, "contradiction should weaken strength");
  assert.equal(after.stage, "challenged", "two contradictions should challenge the pattern");
});

// ── 5. Stale patterns decay ───────────────────────────────────────────────────
test("Stale patterns decay in strength and stage", async () => {
  const { createLivingBehaviorStore } = require(path.join(root, "livingBehaviorStore"));
  const store = createLivingBehaviorStore({});
  await store.init();
  for (let i = 0; i < 4; i++) {
    await store.recordObservation({
      companionId: "dante", customerId: "jenna",
      behaviorType: "ritual_pattern", signature: "goodnight",
      title: "goodnight", source_event_ids: ["e" + i], now: day(i),
    });
  }
  const before = (await store.listAll({ companionId: "dante", customerId: "jenna" }))[0];
  const beforeStrength = before.strength;   // capture primitive before in-place decay
  assert.equal(before.stage, "stable");

  const decayed = await store.decayStale({ companionId: "dante", customerId: "jenna", now: day(120) });
  assert.ok(decayed >= 1, "should decay at least one stale pattern");
  const after = (await store.listAll({ companionId: "dante", customerId: "jenna" }))[0];
  assert.ok(after.strength < beforeStrength, "strength should drop");
  assert.notEqual(after.stage, "stable", "stage should step down from stable");
});

// ── 6. Living behavior forms from repeated repair outcomes (via tick) ─────────
test("Living behavior forms from repeated repair outcomes", async () => {
  const rt = freshRuntime();
  await rt.init();
  for (let i = 0; i < 3; i++) {
    await rt.tick({
      companionId: "dante", customerId: "jenna", now: day(i),
      consequenceContext: { carryover: { healing: true } },
    });
  }
  const repair = await rt.livingBehaviorStore.getByType({ companionId: "dante", customerId: "jenna", behaviorType: "repair_pattern" });
  assert.ok(repair.length === 1, "a repair_pattern behavior should exist");
  assert.ok(["forming", "emerging", "stable"].includes(repair[0].stage), "repeated repair outcomes should mature past observed");
});

// ── 7. Living behavior forms from repeated romantic acknowledgements ──────────
test("Living behavior forms from repeated romantic surprise acknowledgements", async () => {
  const rt = freshRuntime();
  await rt.init();
  for (let i = 0; i < 3; i++) {
    await rt.tick({
      companionId: "dante", customerId: "jenna", now: day(i),
      romanticStatus: { last_romantic_surprise_status: "acknowledged" },
    });
  }
  const romance = await rt.livingBehaviorStore.getByType({ companionId: "dante", customerId: "jenna", behaviorType: "romance_pattern" });
  assert.ok(romance.length === 1, "a romance_pattern behavior should exist");
  assert.ok(["emerging", "stable", "forming"].includes(romance[0].stage));
});

// ── 8. Living behavior forms from repeated conversation natural endings ───────
test("Living behavior forms from repeated conversation natural endings", async () => {
  const rt = freshRuntime();
  await rt.init();
  for (let i = 0; i < 3; i++) {
    await rt.tick({
      companionId: "dante", customerId: "jenna", now: day(i),
      cognitiveContext: { outcome: "no_action", recommendations: {} },
    });
  }
  const followup = await rt.livingBehaviorStore.getByType({ companionId: "dante", customerId: "jenna", behaviorType: "followup_pattern" });
  assert.ok(followup.length === 1, "a followup_pattern behavior should exist");
  assert.ok(followup[0].future_guidance.length > 0);
});

// ── 9. Relationship DNA forms from repeated debugging/maintenance evidence ────
test("Relationship DNA forms from repeated debugging/maintenance patterns", async () => {
  const rt = freshRuntime();
  await rt.init();
  for (let i = 0; i < 4; i++) {
    await rt.tick({
      companionId: "dante", customerId: "jenna", now: day(i),
      worldModelContext: { worldModel: { dante: { runtime_health: { value: "degraded" } } } },
    });
  }
  const dnaItems = await rt.relationshipDnaStore.getByType({ companionId: "dante", customerId: "jenna", dnaType: "maintenance_pattern" });
  assert.ok(dnaItems.length === 1, "debugging should become relationship DNA");
  assert.ok(["emerging", "stable", "core"].includes(dnaItems[0].stage), "4 days of evidence should mature the DNA");
  assert.match(`${dnaItems[0].name} ${dnaItems[0].meaning}`.toLowerCase(), /debug|intimacy/);
});

// ── 10. Relationship DNA distinguishes ritual from tradition ──────────────────
test("Relationship DNA distinguishes ritual from tradition", async () => {
  const { createRelationshipDnaStore } = require(path.join(root, "relationshipDnaStore"));
  const store = createRelationshipDnaStore({});
  await store.init();

  await store.recordObservation({ companionId: "dante", customerId: "jenna", dnaType: "ritual", signature: "morning_coffee", name: "morning coffee", now: day(0) });
  await store.recordObservation({ companionId: "dante", customerId: "jenna", dnaType: "tradition", signature: "horror_friday", name: "horror friday", now: day(0) });
  for (let i = 0; i < 4; i++) {
    await store.recordObservation({ companionId: "dante", customerId: "jenna", dnaType: "tradition", signature: "horror_friday", name: "horror friday", source_event_ids: ["t" + i], now: day(i) });
  }

  const rituals = await store.getByType({ companionId: "dante", customerId: "jenna", dnaType: "ritual" });
  const traditions = await store.getByType({ companionId: "dante", customerId: "jenna", dnaType: "tradition" });
  assert.equal(rituals.length, 1);
  assert.equal(traditions.length, 1);
  assert.equal(rituals[0].dna_type, "ritual");
  assert.equal(traditions[0].dna_type, "tradition");
  assert.equal(store.isTradition(traditions[0]), true, "tradition should be classified as tradition");
  assert.equal(store.isTradition(rituals[0]), false, "a forming ritual is not yet a tradition");
});

// ── 11. Relationship culture snapshot includes "what feels like us" ───────────
test("Relationship culture snapshot includes 'what feels like us'", async () => {
  const { buildRelationshipCulture } = require(path.join(root, "relationshipCultureBuilder"));
  const livingBehaviors = [
    { behavior_type: "comfort_pattern", stage: "stable", title: "Offer comfort when low", strength: 0.7 },
  ];
  const relationshipDna = [
    { dna_type: "ritual", stage: "core", name: "morning coffee", strength: 0.9 },
    { dna_type: "shared_phrase", stage: "emerging", name: "come here", strength: 0.5 },
  ];
  const culture = buildRelationshipCulture({ livingBehaviors, relationshipDna });
  assert.ok(culture.private.whatFeelsLikeUs.length > 0, "should surface what feels like us");
  assert.ok(culture.private.traditionsStable.length > 0, "a core ritual reads as tradition-stable");
  assert.ok(culture.private.ourLanguage.length > 0, "shared phrase belongs to our language");
  assert.equal(culture.safe.available, true);
  assert.equal(typeof culture.safe.feelsLikeUsCount, "number");
});

// ── 12. Guidance reaches Cognitive Runtime as read-only context ───────────────
test("Guidance reaches Cognitive Runtime as read-only context", async () => {
  const { createCognitiveRuntime } = require(path.join(root, "cognitiveRuntime"));
  const cog = createCognitiveRuntime({});
  await cog.init();
  const emergentContext = { forCognitive: ["Living behavior: plain accountability over theatre"] };
  const ctx = await cog.tick({ companionId: "dante", customerId: "jenna", now: new Date(), emergentContext });
  assert.deepEqual(ctx.emergentGuidance, ["Living behavior: plain accountability over theatre"]);
  assert.equal(cog.getStatus().emergentGuidanceActive, true);
  // read-only: original guidance untouched
  assert.deepEqual(emergentContext.forCognitive, ["Living behavior: plain accountability over theatre"]);
});

// ── 13. Guidance reaches Affective Decision Runtime as read-only context ──────
test("Guidance reaches Affective Decision Runtime as read-only context", async () => {
  const { createAffectiveDecisionRuntime } = require(path.join(root, "affectiveDecisionRuntime"));
  const adr = createAffectiveDecisionRuntime({});
  await adr.init();
  const emergentContext = { forAffectiveDecision: ["Relationship DNA: coffee signals affection"] };
  const decision = await adr.consult({ decisionType: "romantic_surprise", context: {}, companionId: "dante", customerId: "jenna", now: new Date(), emergentContext });
  assert.deepEqual(decision.emergent_guidance, ["Relationship DNA: coffee signals affection"]);
  // Without emergentContext, the field is absent (no behavioural change to existing decisions).
  const plain = await adr.consult({ decisionType: "romantic_surprise", context: {}, companionId: "dante", customerId: "jenna", now: new Date() });
  assert.equal(plain.emergent_guidance, undefined);
});

// ── 14. Guidance reaches Romantic Surprise Runtime as read-only context ───────
test("Guidance reaches Romantic Surprise Runtime as read-only context", async () => {
  const { buildEmergentGuidance } = require(path.join(root, "emergentBehaviorGuidanceBuilder"));
  const guidance = buildEmergentGuidance({
    livingBehaviors: [{ behavior_type: "romance_pattern", stage: "stable", future_guidance: "romance lands when settled", strength: 0.7 }],
    relationshipDna: [],
  });
  assert.ok(guidance.forRomanticSurprise.length > 0, "guidance should target romantic surprise");

  const { createRomanticSurpriseRuntime } = require(path.join(root, "romanticSurpriseRuntime"));
  const rsr = createRomanticSurpriseRuntime({ config: {}, logger: null });
  const res = await rsr.tick({ companionId: "dante", customerId: "jenna", now: new Date(), emergentContext: { forRomanticSurprise: guidance.forRomanticSurprise } });
  assert.equal(res.emergentConsulted, true, "romantic surprise tick should consult emergent guidance");
});

// ── 15. Guidance reaches Repair Persistence as read-only context ──────────────
test("Guidance reaches Repair Persistence as read-only context", async () => {
  const { buildEmergentGuidance } = require(path.join(root, "emergentBehaviorGuidanceBuilder"));
  const guidance = buildEmergentGuidance({
    livingBehaviors: [{ behavior_type: "repair_pattern", stage: "stable", future_guidance: "plain accountability over theatre", strength: 0.7 }],
    relationshipDna: [],
  });
  assert.ok(guidance.forRepairPersistence.length > 0, "guidance should target repair persistence");

  const { createRepairPersistenceEngine } = require(path.join(root, "repairPersistenceEngine"));
  const rpe = createRepairPersistenceEngine({ consequenceStore: null, logger: null });
  const res = await rpe.tick({ companionId: "dante", customerId: "jenna", now: new Date(), emergentContext: { forRepairPersistence: guidance.forRepairPersistence } });
  assert.equal(res.emergentConsulted, true, "repair persistence tick should consult emergent guidance");
});

// ── 16. Prelude emits at most one compact line ────────────────────────────────
test("Prelude emits at most one compact line", async () => {
  const { buildEmergentLivingPrelude } = require(path.join(root, "emergentLivingPreludeBuilder"));
  const guidance = {
    forRepairPersistence: ["Living behavior: plain accountability over theatre"],
    forConversationContinuity: ["Living behavior: leave natural endings alone"],
    forRomanticSurprise: ["Living behavior: romance lands when settled"],
    guidance: ["Relationship DNA: debugging is intimacy"],
  };
  const line = buildEmergentLivingPrelude({ guidance, culture: { safe: { traditionsCount: 0 } } });
  assert.equal(typeof line, "string");
  assert.ok(!line.includes("\n"), "must be a single line, never a list");
  assert.ok(line.length <= 180);

  // Nothing established → null.
  assert.equal(buildEmergentLivingPrelude({ guidance: { forRepairPersistence: [], forConversationContinuity: [], forRomanticSurprise: [], guidance: [] }, culture: { safe: { traditionsCount: 0 } } }), null);
});

// ── 17. Status exposes safe metadata only ─────────────────────────────────────
test("Status exposes safe metadata only — no raw private text", async () => {
  const rt = freshRuntime();
  await rt.init();
  await rt.recordEvidence({
    companionId: "dante", customerId: "jenna", kind: "behavior",
    behaviorType: "care_pattern", signature: "private_one",
    title: "care", summary: "SECRET_PRIVATE_HURT_TEXT", source_event_ids: ["e1"], now: day(0),
  });
  await rt.tick({ companionId: "dante", customerId: "jenna", now: day(0) });
  const status = rt.getStatus();
  const json = JSON.stringify(status);
  assert.ok(!json.includes("SECRET_PRIVATE_HURT_TEXT"), "status must not leak raw private text");
  assert.equal(status.available, true);
  assert.equal(typeof status.emergent_behavior_count, "number");
  assert.equal(typeof status.relationship_dna_count, "number");
  assert.ok(Array.isArray(status.active_living_behaviors));
  assert.ok(Array.isArray(status.recent_pattern_types));
  assert.equal(typeof status.relationship_culture_available, "boolean");
  assert.ok(!("evidence_ids" in status));
});

// ── 18. Runtime does not send Discord messages ────────────────────────────────
test("Runtime does not send Discord messages (no sender)", () => {
  const fs = require("node:fs");
  const files = [
    "emergentLivingBehaviorRuntime.js", "emergencePatternDetector.js",
    "livingBehaviorStore.js", "relationshipDnaStore.js",
    "relationshipCultureBuilder.js", "emergentBehaviorGuidanceBuilder.js",
    "emergentLivingPreludeBuilder.js",
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    assert.ok(!src.includes("channel.send"), `${f} must not call channel.send`);
    assert.ok(!src.includes("discordSendGateway"), `${f} must not import the Discord send gateway`);
    assert.ok(!/require\(["']discord/.test(src), `${f} must not require discord`);
  }
});

// ── 19. Runtime does not create a scheduler ───────────────────────────────────
test("Runtime does not create a scheduler (no setInterval/setTimeout)", () => {
  const fs = require("node:fs");
  const files = [
    "emergentLivingBehaviorRuntime.js", "emergencePatternDetector.js",
    "livingBehaviorStore.js", "relationshipDnaStore.js",
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    assert.ok(!src.includes("setInterval"), `${f} must not use setInterval`);
    assert.ok(!src.includes("setTimeout"), `${f} must not use setTimeout`);
  }
});

// ── 20. Runtime does not mutate identity/homeostasis/repair/weather directly ──
test("Runtime does not mutate identity/homeostasis/repair/weather state", async () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(path.join(root, "emergentLivingBehaviorRuntime.js"), "utf8");
  // Does not import any state-owning runtime it could mutate.
  for (const forbidden of ["identityRuntime", "homeostasisRuntime", "repairPersistenceEngine", "relationshipWeatherEngine", "consequenceStore"]) {
    assert.ok(!src.includes(forbidden), `must not import ${forbidden}`);
  }
  // Passing frozen foreign contexts must not throw (it only reads them).
  const rt = freshRuntime();
  await rt.init();
  const frozenIdentity = Object.freeze({ topValue: Object.freeze({ valueKey: "honesty" }) });
  const frozenHomeo = Object.freeze({ mood: "neutral" });
  const ctx = await rt.tick({
    companionId: "dante", customerId: "jenna", now: day(0),
    identityContext: frozenIdentity, homeostasisContext: frozenHomeo,
  });
  assert.ok(ctx, "tick should complete reading frozen foreign contexts");
  assert.equal(frozenIdentity.topValue.valueKey, "honesty", "foreign context unchanged");
});

// ── 21. Dashboard untouched by these modules ──────────────────────────────────
test("Emergent modules do not reference the dashboard", () => {
  const fs = require("node:fs");
  const files = [
    "emergentLivingBehaviorRuntime.js", "emergencePatternDetector.js",
    "livingBehaviorStore.js", "relationshipDnaStore.js",
    "relationshipCultureBuilder.js", "emergentBehaviorGuidanceBuilder.js",
    "emergentLivingPreludeBuilder.js",
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    assert.ok(!/dashboard/i.test(src), `${f} must not reference the dashboard`);
  }
});

// ── 22. Previous integration intact — life runtime still constructs & wires ───
test("Previous wiring intact — lifeRuntime still constructs and exposes emergentLiving status", () => {
  const { createLifeRuntime } = require(path.join(root, "lifeRuntime"));
  const rt = createLifeRuntime({ config: { lifeRuntime: { enabled: false } } });
  assert.equal(typeof rt.tick, "function");
  assert.equal(typeof rt.getStatus, "function");
  const status = rt.getStatus();
  assert.ok("emergentLiving" in status, "life status should include emergentLiving");
  assert.ok("cognitive" in status, "previous cognitive status must remain");
});
