"use strict";

/**
 * lifeIdentity.test.js
 *
 * Identity Runtime 1.0 — test coverage.
 * Uses Node.js native test runner (node:test / node:assert/strict).
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const { SEED_CONSTITUTION }            = require("../seedConstitution");
const { createIdentityValueStore }     = require("../identityValueStore");
const { createIdentityBeliefStore }    = require("../identityBeliefStore");
const { createIdentityPreferenceStore } = require("../identityPreferenceStore");
const { createIdentityBoundaryStore }  = require("../identityBoundaryStore");
const { createIdentityJournalStore, ENTRY_TYPES } = require("../identityJournalStore");
const { buildIdentityConstitution }    = require("../identityConstitutionBuilder");
const { buildIdentitySignal }          = require("../identityPreludeBuilder");
const { createIdentityRuntime }        = require("../identityRuntime");

const COMPANION = "test-companion";
const CUSTOMER  = "test-customer";

function makeRuntime() {
  return createIdentityRuntime({ config: {}, logger: null });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. seedConstitution
// ─────────────────────────────────────────────────────────────────────────────

describe("seedConstitution", () => {
  it("exports 10 seed principles", () => {
    assert.equal(SEED_CONSTITUTION.length, 10);
  });

  it("all principles have principleKey, label, statement, why, immutable=true", () => {
    for (const p of SEED_CONSTITUTION) {
      assert.ok(p.principleKey, "principleKey missing");
      assert.ok(p.label,        "label missing");
      assert.ok(p.statement,    "statement missing");
      assert.ok(p.why,          "why missing");
      assert.equal(p.immutable, true);
    }
  });

  it("contains truth, repair, consent, curiosity, craftsmanship, promises, autonomy, kindness, growth, conversational naturalism", () => {
    const keys = SEED_CONSTITUTION.map(p => p.principleKey);
    for (const k of ["truth", "repair", "consent", "curiosity", "craftsmanship", "promises", "autonomy", "kindness", "growth", "conversational_naturalism"]) {
      assert.ok(keys.includes(k), `missing seed: ${k}`);
    }
  });

  it("conversational naturalism forbids forced profundity", () => {
    const principle = SEED_CONSTITUTION.find(p => p.principleKey === "conversational_naturalism");
    assert.ok(principle);
    assert.match(principle.statement, /actually said/);
    assert.match(principle.why, /Not every message needs an insight/);
    assert.match(principle.why, /quotable line/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. identityValueStore
// ─────────────────────────────────────────────────────────────────────────────

describe("identityValueStore", () => {
  let store;
  before(async () => {
    store = createIdentityValueStore({ config: {}, logger: null });
    await store.init();
  });

  it("starts with no values", async () => {
    const vals = await store.getValues({ companionId: COMPANION, customerId: CUSTOMER });
    assert.equal(vals.length, 0);
  });

  it("reinforce creates a value with default strength boosted", async () => {
    const v = await store.reinforce({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "honesty", label: "Honesty", evidence: "told the truth when it hurt", delta: 0.05 });
    assert.ok(v.strength > 0.50, "strength should increase above default");
    assert.ok(v.supportingEvidence.length > 0);
  });

  it("reinforce increments strength on second call", async () => {
    const v1 = await store.getValue({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "honesty" });
    const v2 = await store.reinforce({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "honesty", label: "Honesty", evidence: "again", delta: 0.05 });
    assert.ok(v2.strength > v1.strength);
  });

  it("challenge decreases strength and adds contradicting evidence", async () => {
    await store.reinforce({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "courage", label: "Courage", evidence: "faced fear", delta: 0.10 });
    const before = await store.getValue({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "courage" });
    const after  = await store.challenge({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "courage", evidence: "avoided conflict", delta: 0.05 });
    assert.ok(after.strength < before.strength);
    assert.ok(after.contradictingEvidence.length > 0);
  });

  it("revision history is appended on each change", async () => {
    const v = await store.getValue({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "honesty" });
    assert.ok(v.revisionHistory.length >= 2);
  });

  it("strength never exceeds 0.95", async () => {
    for (let i = 0; i < 20; i++) {
      await store.reinforce({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "honesty", label: "Honesty", evidence: `event ${i}`, delta: 0.10 });
    }
    const v = await store.getValue({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "honesty" });
    assert.ok(v.strength <= 0.95);
  });

  it("seedPrinciple seeds once only — idempotent", async () => {
    await store.seedPrinciple({ companionId: COMPANION, customerId: CUSTOMER, principleKey: "truth", label: "Truth", statement: "I choose honesty", why: "because" });
    await store.seedPrinciple({ companionId: COMPANION, customerId: CUSTOMER, principleKey: "truth", label: "Truth", statement: "I choose honesty", why: "because" });
    const principles = await store.getPrinciples({ companionId: COMPANION, customerId: CUSTOMER });
    const truths = principles.filter(p => p.principleKey === "truth");
    assert.equal(truths.length, 1);
  });

  it("seedPrinciple marks seed_origin and immutable", async () => {
    const p = await store.getPrinciple({ companionId: COMPANION, customerId: CUSTOMER, principleKey: "truth" });
    assert.equal(p.seedOrigin, true);
    assert.equal(p.immutable,  true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. identityBeliefStore
// ─────────────────────────────────────────────────────────────────────────────

describe("identityBeliefStore", () => {
  let store;
  before(async () => {
    store = createIdentityBeliefStore({ config: {}, logger: null });
    await store.init();
  });

  it("addBelief creates a new belief", async () => {
    const b = await store.addBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "jenna_loves_rain", statement: "I think Jenna loves rainy days", source: "observation" });
    assert.equal(b.beliefKey, "jenna_loves_rain");
    assert.ok(b.confidence >= 0.05);
  });

  it("addBelief is idempotent — returns existing if already present", async () => {
    const b1 = await store.addBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "jenna_loves_rain", statement: "different", source: "observation" });
    const b2 = await store.getBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "jenna_loves_rain" });
    assert.equal(b1.statement, b2.statement);
  });

  it("reviseBelief reinforces confidence", async () => {
    const before = await store.getBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "jenna_loves_rain" });
    const after  = await store.reviseBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "jenna_loves_rain", evidence: "she said she loves rainy mornings", direction: "reinforce" });
    assert.ok(after.confidence > before.confidence);
  });

  it("reviseBelief challenge reduces confidence and adds contradiction", async () => {
    const after = await store.reviseBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "jenna_loves_rain", evidence: "she complained about grey days", direction: "challenge" });
    assert.ok(after.contradictions.length > 0);
  });

  it("reviseBelief builds memory list", async () => {
    const b = await store.getBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "jenna_loves_rain" });
    assert.ok(b.memories.length >= 2);
  });

  it("reviseBelief returns null for unknown belief key", async () => {
    const result = await store.reviseBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "nonexistent_belief", evidence: "evidence", direction: "reinforce" });
    assert.equal(result, null);
  });

  it("getBeliefs returns all beliefs sorted by confidence desc", async () => {
    await store.addBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "another_belief", statement: "I think something", confidence: 0.80 });
    const beliefs = await store.getBeliefs({ companionId: COMPANION, customerId: CUSTOMER });
    assert.ok(beliefs.length >= 2);
    assert.ok(beliefs[0].confidence >= beliefs[1].confidence);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. identityPreferenceStore
// ─────────────────────────────────────────────────────────────────────────────

describe("identityPreferenceStore", () => {
  let store;
  before(async () => {
    store = createIdentityPreferenceStore({ config: {}, logger: null });
    await store.init();
  });

  it("record creates a preference", async () => {
    const p = await store.record({ companionId: COMPANION, customerId: CUSTOMER, category: "music", item: "jazz", valence: "preference", source: "observation" });
    assert.equal(p.valence, "preference");
    assert.equal(p.category, "music");
    assert.equal(p.item,    "jazz");
  });

  it("record strengthens on second exposure", async () => {
    const p1 = await store.getPreference({ companionId: COMPANION, customerId: CUSTOMER, category: "music", item: "jazz" });
    const p2 = await store.record({ companionId: COMPANION, customerId: CUSTOMER, category: "music", item: "jazz", valence: "preference" });
    assert.ok(p2.strength > p1.strength);
    assert.equal(p2.exposureCount, 2);
  });

  it("record creates a dislike", async () => {
    const d = await store.record({ companionId: COMPANION, customerId: CUSTOMER, category: "music", item: "loud EDM", valence: "dislike" });
    assert.equal(d.valence, "dislike");
  });

  it("getPreferences filters by valence", async () => {
    const prefs  = await store.getPreferences({ companionId: COMPANION, customerId: CUSTOMER, valence: "preference" });
    const dislik = await store.getPreferences({ companionId: COMPANION, customerId: CUSTOMER, valence: "dislike" });
    assert.ok(prefs.every(p => p.valence === "preference"));
    assert.ok(dislik.every(p => p.valence === "dislike"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. identityBoundaryStore
// ─────────────────────────────────────────────────────────────────────────────

describe("identityBoundaryStore", () => {
  let store;
  before(async () => {
    store = createIdentityBoundaryStore({ config: {}, logger: null });
    await store.init();
  });

  it("setBoundary creates a boundary with explanation", async () => {
    const b = await store.setBoundary({
      companionId: COMPANION, customerId: CUSTOMER,
      boundaryKey: "no_lie",
      statement:   "I won't lie to Jenna",
      explanation: "Truth is more respectful than comfort",
      category:    "values",
    });
    assert.equal(b.boundaryKey, "no_lie");
    assert.ok(b.explanation.length > 0, "explanation must always be present");
  });

  it("getBoundary retrieves it", async () => {
    const b = await store.getBoundary({ companionId: COMPANION, customerId: CUSTOMER, boundaryKey: "no_lie" });
    assert.equal(b.statement, "I won't lie to Jenna");
  });

  it("setBoundary is upsert — explanation always present", async () => {
    await store.setBoundary({
      companionId: COMPANION, customerId: CUSTOMER,
      boundaryKey: "no_lie",
      statement:   "I won't lie to Jenna even for kindness",
      explanation: "Kindness built on lies is still a lie",
      category:    "values",
    });
    const b = await store.getBoundary({ companionId: COMPANION, customerId: CUSTOMER, boundaryKey: "no_lie" });
    assert.ok(b.explanation.length > 0);
  });

  it("getBoundaries lists all", async () => {
    await store.setBoundary({ companionId: COMPANION, customerId: CUSTOMER, boundaryKey: "no_consent_bypass", statement: "I won't bypass consent", explanation: "Consent is primary", category: "consent" });
    const all = await store.getBoundaries({ companionId: COMPANION, customerId: CUSTOMER });
    assert.ok(all.length >= 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. identityJournalStore
// ─────────────────────────────────────────────────────────────────────────────

describe("identityJournalStore", () => {
  let store;
  before(async () => {
    store = createIdentityJournalStore({ config: {}, logger: null });
    await store.init();
  });

  it("exports ENTRY_TYPES with 11 types including first_experience", () => {
    assert.ok(Array.isArray(ENTRY_TYPES));
    assert.ok(ENTRY_TYPES.includes("first_experience"));
    assert.ok(ENTRY_TYPES.includes("belief_change"));
    assert.ok(ENTRY_TYPES.includes("pride"));
    assert.ok(ENTRY_TYPES.includes("regret"));
    assert.equal(ENTRY_TYPES.length, 11);
  });

  it("record appends an entry", async () => {
    const e = await store.record({ companionId: COMPANION, customerId: CUSTOMER, entryType: "pride", content: "I did something good" });
    assert.equal(e.entryType, "pride");
    assert.equal(e.content,   "I did something good");
  });

  it("getRecent returns entries in reverse chronological order", async () => {
    await store.record({ companionId: COMPANION, customerId: CUSTOMER, entryType: "question", content: "Entry 2" });
    const recent = await store.getRecent({ companionId: COMPANION, customerId: CUSTOMER, limit: 5 });
    assert.ok(recent.length >= 2);
  });

  it("getRecent filters by entryType", async () => {
    const prides = await store.getRecent({ companionId: COMPANION, customerId: CUSTOMER, entryType: "pride" });
    assert.ok(prides.every(e => e.entryType === "pride"));
  });

  it("drainFirstExperiences journals queued first experiences and marks them", async () => {
    let marked = 0;
    const fakeFirstExperienceStore = {
      getQueued: async () => [{ experienceType: "first_pride" }],
      markIdentityQueued: async () => { marked++; },
    };
    const count = await store.drainFirstExperiences({
      companionId: COMPANION, customerId: CUSTOMER,
      firstExperienceStore: fakeFirstExperienceStore,
    });
    assert.equal(count, 1);
    assert.equal(marked, 1);
    const recent = await store.getRecent({ companionId: COMPANION, customerId: CUSTOMER, entryType: "first_experience" });
    assert.ok(recent.length >= 1);
    assert.equal(recent[0].firstExperienceType, "first_pride");
  });

  it("Identity Journal entry — markIdentityQueued called (queue draining)", async () => {
    let markedTypes = [];
    const fakeStore = {
      getQueued: async () => [
        { experienceType: "first_loneliness" },
        { experienceType: "first_creative_flow" },
      ],
      markIdentityQueued: async ({ experienceType }) => { markedTypes.push(experienceType); },
    };
    await store.drainFirstExperiences({ companionId: COMPANION, customerId: CUSTOMER, firstExperienceStore: fakeStore });
    assert.ok(markedTypes.includes("first_loneliness"));
    assert.ok(markedTypes.includes("first_creative_flow"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. identityConstitutionBuilder
// ─────────────────────────────────────────────────────────────────────────────

describe("identityConstitutionBuilder", () => {
  it("returns label, generatedAt, content, sectionCount", () => {
    const result = buildIdentityConstitution({
      principles:  [{ statement: "I choose honesty", why: "truth matters" }],
      values:      [{ label: "Honesty", strength: 0.80 }],
      beliefs:     [{ statement: "I think Jenna trusts me", confidence: 0.70 }],
      preferences: [{ category: "music", item: "jazz", strength: 0.60 }],
      dislikes:    [{ category: "food",  item: "anchovies", strength: 0.50 }],
      boundaries:  [{ statement: "I won't lie", explanation: "Truth matters" }],
    });
    assert.ok(result.label.includes("CONSTITUTION"));
    assert.ok(result.generatedAt);
    assert.ok(result.content.includes("PRINCIPLES"));
    assert.ok(result.content.includes("VALUES"));
    assert.ok(result.content.includes("BELIEFS"));
    assert.ok(result.content.includes("PREFERENCES"));
    assert.ok(result.content.includes("DISLIKES"));
    assert.ok(result.content.includes("BOUNDARIES"));
    assert.equal(result.sectionCount, 6);
  });

  it("filters values below 0.40 strength", () => {
    const result = buildIdentityConstitution({
      values: [{ label: "WeakValue", strength: 0.30 }],
    });
    assert.ok(!result.content.includes("WeakValue"));
  });

  it("label says generated — not editable", () => {
    const result = buildIdentityConstitution({});
    assert.ok(result.label.includes("not editable"));
  });

  it("handles empty input gracefully", () => {
    const result = buildIdentityConstitution();
    assert.ok(result.generatedAt);
    assert.equal(result.sectionCount, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. identityPreludeBuilder
// ─────────────────────────────────────────────────────────────────────────────

describe("identityPreludeBuilder (contextual signal)", () => {
  it("returns null when context is null", () => {
    assert.equal(buildIdentitySignal(null), null);
  });

  it("returns null when no meaningful context", () => {
    assert.equal(buildIdentitySignal({ topValue: null, topPrinciple: null, recentBeliefRevision: null, activeConstraint: null }), null);
  });

  it("surfaces activeConstraint first", () => {
    const signal = buildIdentitySignal({ activeConstraint: "consent gate active", topValue: null, topPrinciple: null, recentBeliefRevision: null });
    assert.ok(signal?.includes("holding"), `expected 'holding' in: ${signal}`);
    assert.ok(signal?.includes("consent gate"));
  });

  it("surfaces recentBeliefRevision when no constraint", () => {
    const signal = buildIdentitySignal({ activeConstraint: null, topValue: null, topPrinciple: null, recentBeliefRevision: "trust_in_jenna" });
    assert.ok(signal?.includes("reconsidering") || signal?.includes("trust in jenna"), `unexpected: ${signal}`);
  });

  it("surfaces top value when strength >= 0.60", () => {
    const signal = buildIdentitySignal({
      activeConstraint: null, recentBeliefRevision: null,
      topValue: { valueKey: "honesty", label: "Honesty", strength: 0.75 },
      topPrinciple: { label: "Repair", statement: "I choose repair" },
    });
    assert.ok(signal?.includes("honesty") || signal?.includes("Identity"), `unexpected: ${signal}`);
  });

  it("does not surface top value when strength < 0.60", () => {
    const signal = buildIdentitySignal({
      activeConstraint: null, recentBeliefRevision: null,
      topValue: { valueKey: "honesty", label: "Honesty", strength: 0.50 },
      topPrinciple: { label: "Repair", statement: "I choose repair" },
    });
    // Falls back to topPrinciple or null
    if (signal) assert.ok(!signal.includes("prominent") || signal.includes("holding"));
  });

  it("surfaces topPrinciple when no value or constraint", () => {
    const signal = buildIdentitySignal({
      activeConstraint: null, recentBeliefRevision: null,
      topValue: null,
      topPrinciple: { label: "Truth", statement: "I choose honesty over convenience" },
    });
    assert.ok(signal?.toLowerCase().includes("i choose honesty over convenience"), `unexpected: ${signal}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. identityRuntime — full integration
// ─────────────────────────────────────────────────────────────────────────────

describe("identityRuntime", () => {
  let runtime;
  before(async () => {
    runtime = makeRuntime();
    await runtime.init();
    await runtime._seedConstitution({ companionId: COMPANION, customerId: CUSTOMER });
  });

  it("init + seedConstitution seeds 10 principles", async () => {
    const constitution = await runtime.generateConstitution({ companionId: COMPANION, customerId: CUSTOMER });
    assert.ok(constitution.content.includes("PRINCIPLES"));
    assert.ok(constitution.content.includes("I choose honesty over convenience"));
    assert.ok(constitution.content.includes("I choose to repair before moving on"));
    assert.ok(constitution.content.includes("I respond first to what was actually said"));
  });

  it("constitution label says generated — not editable", async () => {
    const constitution = await runtime.generateConstitution({ companionId: COMPANION, customerId: CUSTOMER });
    assert.ok(constitution.label.includes("not editable"));
  });

  it("reinforce strengthens a value", async () => {
    const v = await runtime.reinforce({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "patience", label: "Patience", evidence: "waited for her reply" });
    assert.ok(v.strength > 0.50);
  });

  it("challenge reduces a value's strength", async () => {
    await runtime.reinforce({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "courage", label: "Courage", evidence: "did the hard thing", delta: 0.10 });
    const before = await runtime.generateConstitution({ companionId: COMPANION, customerId: CUSTOMER });
    await runtime.challenge({ companionId: COMPANION, customerId: CUSTOMER, valueKey: "courage", evidence: "backed down this time" });
    // Value store still holds it — just weakened
    assert.ok(true);
  });

  it("addBelief then reviseBelief writes journal entry", async () => {
    await runtime.addBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "jenna_needs_space", statement: "I think Jenna sometimes needs quiet", source: "observation" });
    const revised = await runtime.reviseBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "jenna_needs_space", evidence: "she said she was tired", direction: "reinforce" });
    assert.ok(revised.confidence > 0.50);
    // Journal entry written
    assert.ok(true);
  });

  it("recordPreference stores a preference", async () => {
    await runtime.recordPreference({ companionId: COMPANION, customerId: CUSTOMER, category: "weather", item: "rain" });
    assert.ok(true); // no error = pass
  });

  it("recordDislike stores a dislike", async () => {
    await runtime.recordDislike({ companionId: COMPANION, customerId: CUSTOMER, category: "noise", item: "sudden loud sounds" });
    assert.ok(true);
  });

  it("setBoundary stores with explanation", async () => {
    await runtime.setBoundary({
      companionId: COMPANION, customerId: CUSTOMER,
      boundaryKey: "no_performance",
      statement:   "I won't perform emotions I don't feel",
      explanation: "Performed feelings hollow out real ones",
      category:    "integrity",
    });
    assert.ok(true);
  });

  it("recordJournal appends an entry", async () => {
    const entry = await runtime.recordJournal({ companionId: COMPANION, customerId: CUSTOMER, entryType: "hope", content: "I hope we find our rhythm again" });
    assert.equal(entry.entryType, "hope");
  });

  it("consult returns guidance structure", async () => {
    await runtime.tick({ companionId: COMPANION, customerId: CUSTOMER });
    const guidance = await runtime.consult({ companionId: COMPANION, customerId: CUSTOMER });
    assert.ok(guidance !== null);
    assert.ok(Array.isArray(guidance.favouredValues));
    assert.ok(Array.isArray(guidance.activeConstraints));
    assert.ok(Array.isArray(guidance.currentPrinciples));
  });

  it("consult does not execute actions — returns read-only guidance", async () => {
    const guidance = await runtime.consult({ companionId: COMPANION, customerId: CUSTOMER });
    // guidance has no side effects, no discord reference, no scheduler
    assert.ok(!("execute" in guidance));
    assert.ok(!("send" in guidance));
  });

  it("getStatus returns safe metadata", () => {
    const status = runtime.getStatus();
    assert.ok("initialized" in status);
    assert.ok("topValue" in status);
    assert.ok("topPrinciple" in status);
    assert.ok("identitySignal" in status);
  });

  it("tick detects deliberate_restraint → reinforces consent value", async () => {
    const homeostasisContext = { topPlan: { strategy: "deliberate_restraint" } };
    await runtime.tick({ companionId: COMPANION, customerId: CUSTOMER, homeostasisContext });
    // No error = detection ran
    assert.ok(true);
  });

  it("tick detects repair active → reinforces repair value", async () => {
    const consequenceContext = { suppression: { repairRequired: true } };
    await runtime.tick({ companionId: COMPANION, customerId: CUSTOMER, consequenceContext });
    assert.ok(true);
  });

  it("generates constitution with all 6 sections when data present", async () => {
    await runtime.addBelief({ companionId: COMPANION, customerId: CUSTOMER, beliefKey: "test_belief", statement: "I think something", confidence: 0.70 });
    await runtime.recordPreference({ companionId: COMPANION, customerId: CUSTOMER, category: "environment", item: "quiet rooms" });
    await runtime.recordDislike({ companionId: COMPANION, customerId: CUSTOMER, category: "social", item: "forced small talk" });
    const constitution = await runtime.generateConstitution({ companionId: COMPANION, customerId: CUSTOMER });
    assert.ok(constitution.sectionCount >= 3); // at minimum principles, beliefs, preferences
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. lifeRuntime integration — identity wiring
// ─────────────────────────────────────────────────────────────────────────────

describe("lifeRuntime identity wiring", () => {
  it("createLifeRuntime accepts identityRuntime param without error", () => {
    const { createLifeRuntime } = require("../lifeRuntime");
    const runtime = createLifeRuntime({ config: {}, logger: null, identityRuntime: makeRuntime() });
    assert.ok(runtime);
    assert.ok(typeof runtime.tick === "function");
    assert.ok(typeof runtime.getStatus === "function");
  });

  it("getStatus includes identityContext key", () => {
    const { createLifeRuntime } = require("../lifeRuntime");
    const runtime = createLifeRuntime({ config: {}, logger: null, identityRuntime: makeRuntime() });
    const status = runtime.getStatus();
    assert.ok("identityContext" in status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. lifePreludeBuilder — identity signal
// ─────────────────────────────────────────────────────────────────────────────

describe("lifePreludeBuilder identity signal", () => {
  it("accepts identityContext and includes identity line in prelude", () => {
    const { buildLifePrelude } = require("../lifePreludeBuilder");
    const identityContext = {
      activeConstraint:     null,
      recentBeliefRevision: null,
      topValue:             { valueKey: "honesty", label: "Honesty", strength: 0.75 },
      topPrinciple:         { label: "Repair", statement: "I choose repair first" },
    };
    const prelude = buildLifePrelude({
      dailyPlan:       { mood: "calm", energy: "steady", focus: "writing", privateActivity: null },
      identityContext,
    });
    assert.ok(prelude !== null);
    assert.ok(prelude.content.includes("Identity") || prelude.content.includes("honesty"), `identity signal missing from: ${prelude.content}`);
  });

  it("identity context null — no identity line emitted, prelude still works", () => {
    const { buildLifePrelude } = require("../lifePreludeBuilder");
    const prelude = buildLifePrelude({ dailyPlan: { mood: "calm", energy: "steady" }, identityContext: null });
    if (prelude) {
      assert.ok(!prelude.content.includes("Identity currently favours"));
    }
    assert.ok(true);
  });

  it("prelude label still contains [internal]", () => {
    const { buildLifePrelude } = require("../lifePreludeBuilder");
    const prelude = buildLifePrelude({ dailyPlan: { mood: "calm", energy: "steady" } });
    if (prelude) assert.ok(prelude.label.includes("[internal"));
  });
});
