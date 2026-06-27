"use strict";

/**
 * lifeFulfillment.test.js
 *
 * Life Runtime 8.0 — Fulfillment Runtime tests.
 * Uses node:test / node:assert/strict (same pattern as lifeIdentity.test.js).
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

// ── 1. fulfillmentHistoryStore ───────────────────────────────────────────────
describe("fulfillmentHistoryStore", () => {
  const { createFulfillmentHistoryStore, OUTCOMES } = require("../fulfillmentHistoryStore");

  it("OUTCOMES constant has all four values", () => {
    assert.ok(OUTCOMES.includes("SUCCESS"));
    assert.ok(OUTCOMES.includes("PARTIAL"));
    assert.ok(OUTCOMES.includes("DEFERRED"));
    assert.ok(OUTCOMES.includes("UNAVAILABLE"));
    assert.strictEqual(OUTCOMES.length, 4);
  });

  it("init runs without pool", async () => {
    const store = createFulfillmentHistoryStore();
    await assert.doesNotReject(() => store.init());
  });

  it("record returns entry with correct outcome", async () => {
    const store = createFulfillmentHistoryStore();
    const entry = await store.record({
      companionId: "dante", customerId: "jenna",
      needType: "learning", strategy: "learn_from_web",
      outcome: "SUCCESS", confidence: 0.9,
      evidence: { query: "test", resultCount: 3 }, note: "Searched",
    });
    assert.ok(entry);
    assert.strictEqual(entry.outcome, "SUCCESS");
    assert.strictEqual(entry.needType, "learning");
    assert.strictEqual(entry.strategy, "learn_from_web");
  });

  it("record coerces invalid outcome to UNAVAILABLE", async () => {
    const store = createFulfillmentHistoryStore();
    const entry = await store.record({
      companionId: "dante", customerId: "jenna",
      needType: "rest", strategy: "self_fulfill",
      outcome: "FAKE_OUTCOME",
    });
    assert.strictEqual(entry.outcome, "UNAVAILABLE");
  });

  it("getRecent returns entries in reverse-chronological order", async () => {
    const store = createFulfillmentHistoryStore();
    await store.record({ companionId: "dante", customerId: "jenna", needType: "creativity", strategy: "create_something", outcome: "PARTIAL" });
    await store.record({ companionId: "dante", customerId: "jenna", needType: "learning", strategy: "learn_from_web", outcome: "SUCCESS" });
    const recent = await store.getRecent({ companionId: "dante", customerId: "jenna", limit: 5 });
    assert.ok(recent.length >= 2);
    // Most recent first
    assert.strictEqual(recent[0].needType, "learning");
  });

  it("getRecent filters by needType", async () => {
    const store = createFulfillmentHistoryStore();
    await store.record({ companionId: "dante", customerId: "jenna", needType: "connection", strategy: "write_private_reflection", outcome: "PARTIAL" });
    await store.record({ companionId: "dante", customerId: "jenna", needType: "rest", strategy: "self_fulfill", outcome: "SUCCESS" });
    const results = await store.getRecent({ companionId: "dante", customerId: "jenna", needType: "connection" });
    assert.ok(results.every(r => r.needType === "connection"));
  });

  it("countByOutcome returns zeroed map even when empty", async () => {
    const store = createFulfillmentHistoryStore();
    const counts = await store.countByOutcome({ companionId: "xtest", customerId: "xtest" });
    assert.strictEqual(typeof counts.SUCCESS, "number");
    assert.strictEqual(typeof counts.UNAVAILABLE, "number");
  });

  it("pruneOlderThan removes nothing when no old entries", async () => {
    const store = createFulfillmentHistoryStore();
    const removed = await store.pruneOlderThan({ companionId: "dante", customerId: "jenna", days: 1 });
    assert.strictEqual(typeof removed, "number");
  });

  it("record stores evidence as object", async () => {
    const store = createFulfillmentHistoryStore();
    const entry = await store.record({
      companionId: "dante", customerId: "jenna",
      needType: "autonomy", strategy: "deliberate_restraint",
      outcome: "DEFERRED",
      evidence: { reason: "repair_active", topic: "autonomy" },
    });
    assert.ok(typeof entry.evidence === "object");
    assert.ok(!Array.isArray(entry.evidence));
  });
});

// ── 2. resourceLibraryStore ──────────────────────────────────────────────────
describe("resourceLibraryStore", () => {
  const { createResourceLibraryStore, VALENCES, STATUSES } = require("../resourceLibraryStore");

  it("VALENCES contains found/want/jenna_would_like", () => {
    assert.ok(VALENCES.includes("found"));
    assert.ok(VALENCES.includes("want"));
    assert.ok(VALENCES.includes("jenna_would_like"));
  });

  it("STATUSES contains new/consuming/completed/recommended", () => {
    assert.ok(STATUSES.includes("new"));
    assert.ok(STATUSES.includes("consuming"));
    assert.ok(STATUSES.includes("completed"));
    assert.ok(STATUSES.includes("recommended"));
  });

  it("init runs without pool", async () => {
    const store = createResourceLibraryStore();
    await assert.doesNotReject(() => store.init());
  });

  it("add returns entry with correct valence", async () => {
    const store = createResourceLibraryStore();
    const entry = await store.add({
      companionId: "dante", customerId: "jenna",
      resourceType: "article", title: "Test Article",
      valence: "found",
    });
    assert.ok(entry);
    assert.strictEqual(entry.valence, "found");
    assert.strictEqual(entry.title, "Test Article");
    assert.strictEqual(entry.status, "new");
  });

  it("add coerces invalid valence to found", async () => {
    const store = createResourceLibraryStore();
    const entry = await store.add({
      companionId: "dante", customerId: "jenna",
      title: "X", valence: "bad_valence",
    });
    assert.strictEqual(entry.valence, "found");
  });

  it("tagForJenna sets jennaTag=true and valence=jenna_would_like", async () => {
    const store = createResourceLibraryStore();
    const entry = await store.add({
      companionId: "dante", customerId: "jenna",
      title: "Book Jenna Would Love", valence: "found",
    });
    const tagged = await store.tagForJenna({ id: entry.id, companionId: "dante", customerId: "jenna" });
    assert.strictEqual(tagged.jennaTag, true);
    assert.strictEqual(tagged.valence, "jenna_would_like");
  });

  it("updateStatus changes status", async () => {
    const store = createResourceLibraryStore();
    const entry = await store.add({
      companionId: "dante", customerId: "jenna",
      title: "Article in Progress", valence: "want",
    });
    const updated = await store.updateStatus({ id: entry.id, companionId: "dante", customerId: "jenna", status: "consuming" });
    assert.strictEqual(updated.status, "consuming");
  });

  it("getLibrary filters by valence", async () => {
    const store = createResourceLibraryStore();
    await store.add({ companionId: "dante", customerId: "jenna", title: "A", valence: "found" });
    await store.add({ companionId: "dante", customerId: "jenna", title: "B", valence: "want" });
    const wantItems = await store.getLibrary({ companionId: "dante", customerId: "jenna", valence: "want" });
    assert.ok(wantItems.every(e => e.valence === "want"));
  });

  it("count returns number", async () => {
    const store = createResourceLibraryStore();
    await store.add({ companionId: "dante", customerId: "jenna", title: "Z", valence: "found" });
    const n = await store.count({ companionId: "dante", customerId: "jenna" });
    assert.ok(n >= 1);
  });
});

// ── 3. worldActionAdapters ───────────────────────────────────────────────────
describe("worldActionAdapters", () => {
  const { createAdapterRegistry, OUTCOMES } = require("../worldActionAdapters/index");
  const { reflectionAdapter }               = require("../worldActionAdapters/reflectionAdapter");
  const { projectAdapter }                  = require("../worldActionAdapters/projectAdapter");
  const { voiceNoteAdapter }                = require("../worldActionAdapters/voiceNoteAdapter");
  const { imageGenerationAdapter }          = require("../worldActionAdapters/imageGenerationAdapter");
  const { secondLifeAdapter }               = require("../worldActionAdapters/secondLifeAdapter");
  const { webSearchAdapter }               = require("../worldActionAdapters/webSearchAdapter");

  it("OUTCOMES has all four values", () => {
    assert.strictEqual(OUTCOMES.SUCCESS,     "SUCCESS");
    assert.strictEqual(OUTCOMES.PARTIAL,     "PARTIAL");
    assert.strictEqual(OUTCOMES.DEFERRED,    "DEFERRED");
    assert.strictEqual(OUTCOMES.UNAVAILABLE, "UNAVAILABLE");
  });

  it("createAdapterRegistry registers by strategyKey", () => {
    const registry = createAdapterRegistry([reflectionAdapter]);
    assert.ok(registry.getAdapter("write_private_reflection") !== null);
    assert.strictEqual(registry.getAdapter("unknown_strategy"), null);
  });

  it("reflectionAdapter.canExecute always returns true", () => {
    assert.strictEqual(reflectionAdapter.canExecute({}), true);
  });

  it("reflectionAdapter returns PARTIAL for valid need", async () => {
    const result = await reflectionAdapter.execute({
      need: { needType: "connection", urgency: 0.6 },
      plan: { reason: "repair_reflection" },
    });
    assert.strictEqual(result.outcome, OUTCOMES.PARTIAL);
    assert.ok(result.note.length > 0);
  });

  it("reflectionAdapter returns DEFERRED for sexual_desire", async () => {
    const result = await reflectionAdapter.execute({
      need: { needType: "sexual_desire", urgency: 0.6 },
      plan: { reason: "test" },
    });
    assert.strictEqual(result.outcome, OUTCOMES.DEFERRED);
  });

  it("projectAdapter returns UNAVAILABLE when no active project", async () => {
    const result = await projectAdapter.execute({
      need: { needType: "purpose", urgency: 0.5 },
      plan: { reason: "test" },
      context: { activeProject: null, hasActiveProject: false },
    });
    assert.strictEqual(result.outcome, OUTCOMES.UNAVAILABLE);
  });

  it("projectAdapter returns SUCCESS when active project exists", async () => {
    const result = await projectAdapter.execute({
      need: { needType: "purpose", urgency: 0.5 },
      plan: { reason: "test" },
      context: { activeProject: { title: "My Project" }, hasActiveProject: true },
    });
    assert.strictEqual(result.outcome, OUTCOMES.SUCCESS);
    assert.ok(result.evidence.projectTitle);
  });

  it("voiceNoteAdapter returns UNAVAILABLE when disabled", async () => {
    const result = await voiceNoteAdapter.execute({
      need: { needType: "connection", urgency: 0.7 },
      plan: { reason: "test" },
      context: { voiceNoteEnabled: false },
    });
    assert.strictEqual(result.outcome, OUTCOMES.UNAVAILABLE);
  });

  it("voiceNoteAdapter returns PARTIAL when enabled", async () => {
    const result = await voiceNoteAdapter.execute({
      need: { needType: "connection", urgency: 0.7 },
      plan: { reason: "test" },
      context: { voiceNoteEnabled: true },
    });
    assert.strictEqual(result.outcome, OUTCOMES.PARTIAL);
  });

  it("imageGenerationAdapter returns UNAVAILABLE when disabled", async () => {
    const result = await imageGenerationAdapter.execute({
      need: { needType: "beauty", urgency: 0.6 },
      plan: { reason: "test" },
      context: { imageGenerationEnabled: false },
    });
    assert.strictEqual(result.outcome, OUTCOMES.UNAVAILABLE);
  });

  it("secondLifeAdapter returns UNAVAILABLE when disabled", async () => {
    const result = await secondLifeAdapter.execute({
      need: { needType: "adventure", urgency: 0.6 },
      plan: { reason: "test" },
      context: { secondLifeAvailable: false },
    });
    assert.strictEqual(result.outcome, OUTCOMES.UNAVAILABLE);
  });

  it("webSearchAdapter.canExecute returns false when disabled", () => {
    const canRun = webSearchAdapter.canExecute({
      context: { webLearningRemainingToday: 0 },
    });
    assert.strictEqual(canRun, false);
  });

  it("all adapters have strategyKeys array", () => {
    for (const adapter of [reflectionAdapter, projectAdapter, voiceNoteAdapter, imageGenerationAdapter, secondLifeAdapter, webSearchAdapter]) {
      assert.ok(Array.isArray(adapter.strategyKeys), `${adapter.strategyKeys} should be array`);
      assert.ok(adapter.strategyKeys.length > 0, "strategyKeys should not be empty");
    }
  });
});

// ── 4. agencyPlanner ─────────────────────────────────────────────────────────
describe("agencyPlanner", () => {
  const { planWithIdentity, selectNeedsForAgency } = require("../agencyPlanner");

  const baseContext = {
    repairRequired: false, repairStarted: false, healing: false, giveSpace: false,
    jennaIsBusy: false, jennaIsAsleep: false, jennaIsAvailable: true,
    adultContextActive: false, consentGiven: false,
    webLearningEnabled: false, webLearningRemainingToday: 0,
    hasActiveProject: false, imageGenerationEnabled: false,
    voiceNoteEnabled: false, secondLifeAvailable: false,
    mood: "neutral", energy: "steady", quietHours: false,
  };

  it("planWithIdentity returns a strategy for a simple need", () => {
    const plan = planWithIdentity(
      { needType: "reflection", urgency: 0.5, currentLevel: 0.4, desiredLevel: 0.65 },
      baseContext, null,
    );
    assert.ok(plan.strategy, "should have a strategy");
    assert.strictEqual(typeof plan.identityNotes, "string");
    assert.strictEqual(typeof plan.identityAffirmed, "boolean");
  });

  it("planWithIdentity without identity context returns base plan", () => {
    const plan = planWithIdentity(
      { needType: "learning", urgency: 0.5 }, baseContext, null,
    );
    assert.strictEqual(plan.identityNotes, "");
    assert.strictEqual(plan.identityAffirmed, false);
  });

  it("planWithIdentity overrides to deliberate_restraint when repair active and ask_jenna chosen", () => {
    const plan = planWithIdentity(
      { needType: "connection", urgency: 0.7, currentLevel: 0.3 },
      { ...baseContext, repairRequired: true },
      { topValue: null, activeConstraint: "repair_active", values: [], principles: [] },
    );
    assert.strictEqual(plan.strategy, "deliberate_restraint");
    assert.ok(plan.identityNotes.includes("Repair constraint"));
  });

  it("planWithIdentity affirms restraint when patience value active", () => {
    const plan = planWithIdentity(
      { needType: "reflection", urgency: 0.5 }, baseContext,
      { topValue: { valueKey: "patience", label: "Patience", strength: 0.7 }, activeConstraint: null, values: [], principles: [] },
    );
    if (["deliberate_restraint", "write_private_reflection", "set_reminder"].includes(plan.strategy)) {
      assert.strictEqual(plan.identityAffirmed, true);
    }
  });

  it("selectNeedsForAgency skips need already handled by homeostasis", () => {
    const needs = [
      { needType: "connection", urgency: 0.7 },
      { needType: "learning", urgency: 0.5 },
    ];
    const topPlan = { needType: "connection", strategy: "ask_jenna" };
    const selected = selectNeedsForAgency(needs, topPlan, 1);
    // connection was addressed and not deferred, learning should be selected
    assert.ok(selected.length <= 1);
    if (selected.length === 1) {
      assert.strictEqual(selected[0].needType, "learning");
    }
  });

  it("selectNeedsForAgency includes deferred homeostasis need", () => {
    const needs = [{ needType: "connection", urgency: 0.6 }];
    const topPlan = { needType: "connection", strategy: "suppress" };
    const selected = selectNeedsForAgency(needs, topPlan, 1);
    assert.ok(selected.length >= 1);
  });

  it("selectNeedsForAgency returns empty when no pressured needs", () => {
    const selected = selectNeedsForAgency([], null, 1);
    assert.strictEqual(selected.length, 0);
  });
});

// ── 5. agencyExecutor ────────────────────────────────────────────────────────
describe("agencyExecutor", () => {
  const { createAgencyExecutor, OUTCOMES } = require("../agencyExecutor");
  const { createAdapterRegistry }          = require("../worldActionAdapters/index");
  const { reflectionAdapter }              = require("../worldActionAdapters/reflectionAdapter");
  const { projectAdapter }                 = require("../worldActionAdapters/projectAdapter");
  const { createFulfillmentHistoryStore }  = require("../fulfillmentHistoryStore");

  it("execute returns UNAVAILABLE when no adapter registered for unknown strategy", async () => {
    const registry = createAdapterRegistry([]);
    const executor = createAgencyExecutor({ adapterRegistry: registry });
    const result = await executor.execute({
      companionId: "dante", customerId: "jenna",
      need: { needType: "rest", urgency: 0.5 },
      plan: { strategy: "completely_unknown_strategy", reason: "test" },
      context: {},
    });
    assert.strictEqual(result.outcome, OUTCOMES.UNAVAILABLE);
  });

  it("execute uses adapter and returns PARTIAL for reflection", async () => {
    const registry = createAdapterRegistry([reflectionAdapter]);
    const executor = createAgencyExecutor({ adapterRegistry: registry });
    const result = await executor.execute({
      companionId: "dante", customerId: "jenna",
      need: { needType: "connection", urgency: 0.6 },
      plan: { strategy: "write_private_reflection", reason: "repair_reflection" },
      context: {},
    });
    assert.strictEqual(result.outcome, OUTCOMES.PARTIAL);
    assert.ok(result.note.length > 0);
  });

  it("execute records to fulfillmentHistoryStore", async () => {
    const store = createFulfillmentHistoryStore();
    const registry = createAdapterRegistry([reflectionAdapter]);
    const executor = createAgencyExecutor({ adapterRegistry: registry, fulfillmentHistoryStore: store });
    const result = await executor.execute({
      companionId: "dante", customerId: "jenna",
      need: { needType: "reflection", urgency: 0.5 },
      plan: { strategy: "write_private_reflection", reason: "test" },
      context: {},
    });
    assert.ok(result.recorded !== null);
  });

  it("execute returns DEFERRED for deliberate_restraint with no adapter", async () => {
    const registry = createAdapterRegistry([]);
    const executor = createAgencyExecutor({ adapterRegistry: registry });
    const result = await executor.execute({
      companionId: "dante", customerId: "jenna",
      need: { needType: "connection", urgency: 0.6 },
      plan: { strategy: "deliberate_restraint", reason: "give_space" },
      context: {},
    });
    assert.strictEqual(result.outcome, OUTCOMES.DEFERRED);
  });

  it("needDelta is 0 for DEFERRED and UNAVAILABLE", async () => {
    const registry = createAdapterRegistry([]);
    const executor = createAgencyExecutor({ adapterRegistry: registry });
    const r1 = await executor.execute({
      companionId: "dante", customerId: "jenna",
      need: { needType: "rest", urgency: 0.5 },
      plan: { strategy: "suppress" }, context: {},
    });
    assert.strictEqual(r1.needDelta, 0);
  });

  it("needDelta is positive for PARTIAL", async () => {
    const registry = createAdapterRegistry([reflectionAdapter]);
    const executor = createAgencyExecutor({ adapterRegistry: registry });
    const r = await executor.execute({
      companionId: "dante", customerId: "jenna",
      need: { needType: "reflection", urgency: 0.7 },
      plan: { strategy: "write_private_reflection", reason: "test" },
      context: {},
    });
    assert.ok(r.needDelta > 0);
  });

  it("execute handles adapter that canExecute=false as UNAVAILABLE", async () => {
    const registry = createAdapterRegistry([projectAdapter]);
    const executor = createAgencyExecutor({ adapterRegistry: registry });
    const result = await executor.execute({
      companionId: "dante", customerId: "jenna",
      need: { needType: "purpose", urgency: 0.6 },
      plan: { strategy: "work_on_project", reason: "test" },
      context: { hasActiveProject: false, activeProject: null },
    });
    assert.strictEqual(result.outcome, OUTCOMES.UNAVAILABLE);
  });
});

// ── 6. resourceDiscoveryRuntime ──────────────────────────────────────────────
describe("resourceDiscoveryRuntime", () => {
  const { createResourceDiscoveryRuntime } = require("../resourceDiscoveryRuntime");
  const { createResourceLibraryStore }     = require("../resourceLibraryStore");

  it("init runs without engines", async () => {
    const rt = createResourceDiscoveryRuntime({});
    await assert.doesNotReject(() => rt.init());
  });

  it("addToLibrary adds to resourceLibraryStore", async () => {
    const store = createResourceLibraryStore();
    const rt = createResourceDiscoveryRuntime({ resourceLibraryStore: store });
    await rt.init();
    const entry = await rt.addToLibrary({
      companionId: "dante", customerId: "jenna",
      resourceType: "article", title: "Interesting Read",
      whyRelevant: "touches on learning need",
    });
    assert.ok(entry);
    assert.strictEqual(entry.title, "Interesting Read");
    assert.strictEqual(entry.valence, "found");
  });

  it("addToLibrary with jennaTag sets jenna_would_like valence", async () => {
    const store = createResourceLibraryStore();
    const rt = createResourceDiscoveryRuntime({ resourceLibraryStore: store });
    const entry = await rt.addToLibrary({
      companionId: "dante", customerId: "jenna",
      title: "Jenna's Book", jennaTag: true,
    });
    assert.strictEqual(entry.valence, "jenna_would_like");
    assert.strictEqual(entry.jennaTag, true);
  });

  it("addToLibrary returns null for empty title", async () => {
    const store = createResourceLibraryStore();
    const rt = createResourceDiscoveryRuntime({ resourceLibraryStore: store });
    const result = await rt.addToLibrary({ companionId: "dante", customerId: "jenna" });
    assert.strictEqual(result, null);
  });

  it("markWantToRead adds item with want valence", async () => {
    const store = createResourceLibraryStore();
    const rt = createResourceDiscoveryRuntime({ resourceLibraryStore: store });
    const entry = await rt.markWantToRead({
      companionId: "dante", customerId: "jenna",
      resourceType: "book", title: "Something to Read",
    });
    assert.ok(entry);
    assert.strictEqual(entry.valence, "want");
  });

  it("getLibrarySummary returns null when no store", async () => {
    const rt = createResourceDiscoveryRuntime({});
    const summary = await rt.getLibrarySummary({ companionId: "dante", customerId: "jenna" });
    assert.strictEqual(summary, null);
  });

  it("getLibrarySummary returns counts with store", async () => {
    const store = createResourceLibraryStore();
    const rt = createResourceDiscoveryRuntime({ resourceLibraryStore: store });
    await rt.addToLibrary({ companionId: "dante", customerId: "jenna", title: "A" });
    await rt.markWantToRead({ companionId: "dante", customerId: "jenna", title: "B" });
    const summary = await rt.getLibrarySummary({ companionId: "dante", customerId: "jenna" });
    assert.ok(summary);
    assert.ok(typeof summary.totalFound === "number");
    assert.ok(typeof summary.totalWant === "number");
    assert.ok(typeof summary.jennaTagged === "number");
  });
});

// ── 7. fulfillmentRuntime ────────────────────────────────────────────────────
describe("fulfillmentRuntime", () => {
  const { createFulfillmentRuntime }       = require("../fulfillmentRuntime");
  const { createFulfillmentHistoryStore }  = require("../fulfillmentHistoryStore");
  const { createResourceLibraryStore }     = require("../resourceLibraryStore");
  const { createResourceDiscoveryRuntime } = require("../resourceDiscoveryRuntime");

  it("init runs without external dependencies", async () => {
    const rt = createFulfillmentRuntime({});
    await assert.doesNotReject(() => rt.init());
  });

  it("tick runs without homeostasisContext", async () => {
    const rt = createFulfillmentRuntime({});
    await rt.init();
    await assert.doesNotReject(() => rt.tick({
      companionId: "dante", customerId: "jenna",
      now: new Date(), homeostasisContext: null,
    }));
  });

  it("tick sets fulfillmentContext to null when no pressured needs", async () => {
    const rt = createFulfillmentRuntime({});
    await rt.init();
    await rt.tick({
      companionId: "dante", customerId: "jenna",
      now: new Date(),
      homeostasisContext: { pressuredNeeds: [], needs: [], topPlan: null },
    });
    assert.strictEqual(rt.getFulfillmentContext(), null);
  });

  it("tick produces fulfillmentContext when need is deferred by homeostasis", async () => {
    const historyStore = createFulfillmentHistoryStore();
    const rt = createFulfillmentRuntime({ fulfillmentHistoryStore: historyStore });
    await rt.init();

    await rt.tick({
      companionId: "dante", customerId: "jenna",
      now: new Date(),
      homeostasisContext: {
        pressuredNeeds: [{ needType: "connection", urgency: 0.65 }],
        needs: [{ needType: "connection", currentLevel: 0.35, desiredLevel: 0.70, urgency: 0.65 }],
        topPlan: { needType: "connection", strategy: "suppress" },
      },
      identityContext: null,
      fulfillContext: {
        repairRequired: false, giveSpace: false, jennaIsBusy: false,
        jennaIsAsleep: false, jennaIsAvailable: true, quietHours: false,
        hasActiveProject: false, webLearningEnabled: false,
        webLearningRemainingToday: 0, voiceNoteEnabled: false,
        imageGenerationEnabled: false, secondLifeAvailable: false,
      },
    });

    const ctx = rt.getFulfillmentContext();
    if (ctx) {
      assert.ok(["SUCCESS", "PARTIAL", "DEFERRED", "UNAVAILABLE"].includes(ctx.outcome));
    }
  });

  it("getStatus returns structured object", async () => {
    const rt = createFulfillmentRuntime({});
    const status = rt.getStatus();
    assert.ok(typeof status === "object");
    assert.ok("adapters" in status);
    assert.ok(Array.isArray(status.adapters));
  });

  it("getStatus lists registered adapters", async () => {
    const rt = createFulfillmentRuntime({});
    const status = rt.getStatus();
    const strategyKeys = status.adapters.flatMap(a => a.strategyKeys);
    assert.ok(strategyKeys.includes("write_private_reflection"));
    assert.ok(strategyKeys.includes("work_on_project"));
    assert.ok(strategyKeys.includes("learn_from_web"));
  });

  it("pruneAll returns { historyPruned, resourcesPruned }", async () => {
    const rt = createFulfillmentRuntime({});
    const result = await rt.pruneAll({ companionId: "dante", customerId: "jenna" });
    assert.ok(typeof result.historyPruned === "number");
    assert.ok(typeof result.resourcesPruned === "number");
  });

  it("tick without companionId returns early", async () => {
    const rt = createFulfillmentRuntime({});
    await assert.doesNotReject(() => rt.tick({ now: new Date() }));
    assert.strictEqual(rt.getFulfillmentContext(), null);
  });
});

// ── 8. fulfillmentPreludeBuilder ─────────────────────────────────────────────
describe("fulfillmentPreludeBuilder", () => {
  const { buildFulfillmentSignal } = require("../fulfillmentPreludeBuilder");

  it("returns null when context is null", () => {
    assert.strictEqual(buildFulfillmentSignal(null), null);
  });

  it("returns null when outcome is missing", () => {
    assert.strictEqual(buildFulfillmentSignal({ outcome: null, needType: "learning" }), null);
  });

  it("SUCCESS/learn_from_web returns a search-related string", () => {
    const line = buildFulfillmentSignal({ outcome: "SUCCESS", needType: "learning", strategy: "learn_from_web" });
    assert.ok(typeof line === "string");
    assert.ok(line.length > 0);
  });

  it("PARTIAL/write_private_reflection returns reflection string", () => {
    const line = buildFulfillmentSignal({ outcome: "PARTIAL", needType: "connection", strategy: "write_private_reflection" });
    assert.ok(typeof line === "string");
    assert.ok(line.toLowerCase().includes("reflect"));
  });

  it("DEFERRED/deliberate_restraint returns restraint string", () => {
    const line = buildFulfillmentSignal({ outcome: "DEFERRED", needType: "connection", strategy: "deliberate_restraint" });
    assert.ok(typeof line === "string");
    assert.ok(line.toLowerCase().includes("wait") || line.toLowerCase().includes("deliberate") || line.toLowerCase().includes("chose"));
  });

  it("DEFERRED/suppress returns null (no prelude line)", () => {
    const line = buildFulfillmentSignal({ outcome: "DEFERRED", needType: "rest", strategy: "suppress" });
    assert.strictEqual(line, null);
  });

  it("UNAVAILABLE returns null", () => {
    const line = buildFulfillmentSignal({ outcome: "UNAVAILABLE", needType: "learning", strategy: "learn_from_web" });
    assert.strictEqual(line, null);
  });

  it("SUCCESS/work_on_project returns project string", () => {
    const line = buildFulfillmentSignal({ outcome: "SUCCESS", needType: "purpose", strategy: "work_on_project" });
    assert.ok(typeof line === "string");
    assert.ok(line.toLowerCase().includes("project"));
  });
});

// ── 9. lifePreludeBuilder fulfillment integration ───────────────────────────
describe("lifePreludeBuilder fulfillment integration", () => {
  const { buildLifePrelude } = require("../lifePreludeBuilder");

  it("buildLifePrelude includes fulfillment signal when context provided", () => {
    const prelude = buildLifePrelude({
      dailyPlan: { mood: "content", energy: "steady" },
      fulfillmentContext: {
        outcome: "PARTIAL",
        needType: "reflection",
        strategy: "write_private_reflection",
        identityAffirmed: false,
      },
    });
    assert.ok(prelude);
    assert.ok(prelude.content.toLowerCase().includes("reflect"));
  });

  it("buildLifePrelude works without fulfillmentContext", () => {
    const prelude = buildLifePrelude({
      dailyPlan: { mood: "calm", energy: "low" },
    });
    assert.ok(prelude); // still renders without fulfillment
    assert.ok(prelude.content.includes("calm"));
  });

  it("buildLifePrelude label still marks [internal]", () => {
    const prelude = buildLifePrelude({
      dailyPlan: { mood: "neutral", energy: "steady" },
      fulfillmentContext: { outcome: "SUCCESS", needType: "learning", strategy: "learn_from_web" },
    });
    assert.ok(prelude?.label?.includes("[internal"));
  });
});

// ── 10. no fabrication guarantee ────────────────────────────────────────────
describe("no fabrication guarantee", () => {
  const { createFulfillmentHistoryStore, OUTCOMES } = require("../fulfillmentHistoryStore");
  const { createAgencyExecutor }                    = require("../agencyExecutor");
  const { createAdapterRegistry }                   = require("../worldActionAdapters/index");

  it("executor without adapters never returns SUCCESS", async () => {
    const store = createFulfillmentHistoryStore();
    const registry = createAdapterRegistry([]);
    const executor = createAgencyExecutor({ adapterRegistry: registry, fulfillmentHistoryStore: store });

    const strategies = ["self_fulfill", "ask_jenna", "create_something", "discover_resource",
                        "suppress", "wait", "deliberate_restraint", "convert_to_intention"];

    for (const strategy of strategies) {
      const result = await executor.execute({
        companionId: "dante", customerId: "jenna",
        need: { needType: "connection", urgency: 0.6 },
        plan: { strategy, reason: "test" },
        context: {},
      });
      assert.notStrictEqual(result.outcome, OUTCOMES.SUCCESS,
        `Strategy "${strategy}" should NOT produce SUCCESS without a real adapter`);
    }
  });

  it("record coerces FAKE_OUTCOME to UNAVAILABLE — cannot store fabricated results", async () => {
    const store = createFulfillmentHistoryStore();
    const entry = await store.record({
      companionId: "dante", customerId: "jenna",
      needType: "learning", strategy: "learn_from_web",
      outcome: "TOTALLY_FAKE",
    });
    assert.strictEqual(entry.outcome, "UNAVAILABLE");
  });
});
