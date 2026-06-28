"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRuntimeEventBus } = require("../runtimeEventBus");
const { createRuntimeEventStore } = require("../runtimeEventStore");
const { createSourceHealthTracker } = require("../sourceHealth");
const { buildMindStateSnapshot } = require("../mindStateSnapshotBuilder");
const { createLifeRuntime } = require("../lifeRuntime");

test("runtimeEventBus emits and store persists events", async () => {
  const store = createRuntimeEventStore();
  const bus = createRuntimeEventBus({ store });
  await bus.emit({ companionId: "dante", customerId: "jenna", event_type: "need_changed", source_runtime: "homeostasis", summary: "need changed" });
  const events = await store.listRecent({ companionId: "dante" });
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, "need_changed");
});

test("missing event store does not crash and strips secrets", async () => {
  const bus = createRuntimeEventBus({ store: null });
  await bus.emit({ event_type: "diagnostic_warning", source_runtime: "diagnostics", payload: { ok: true, apiToken: "secret" } });
  const events = await bus.listRecent({ limit: 1 });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.apiToken, undefined);
});

test("major runtimes can emit required cohesion event types", async () => {
  const bus = createRuntimeEventBus();
  // identity_preference_changed and resource_discovered were dead events removed
  // in Integration Layer Repair 1.0 (never emitted AND never consumed).
  const cases = [
    ["homeostasis", "need_changed"],
    ["identity", "identity_belief_changed"],
    ["identity", "identity_value_changed"],
    ["fulfillment", "fulfillment_succeeded"],
    ["fulfillment", "fulfillment_failed"],
    ["curiosity", "insight_created"],
    ["growth", "project_progressed"],
    ["relationship", "relationship_weather_changed"],
    ["relationship", "consequence_created"],
    ["diagnostics", "self_confidence_low"],
  ];
  for (const [source_runtime, event_type] of cases) {
    await bus.emit({ event_type, source_runtime, summary: `${source_runtime}:${event_type}`, evidence_ids: event_type === "fulfillment_succeeded" ? ["evidence-1"] : [] });
  }
  assert.equal((await bus.listRecent({ limit: 20 })).length, cases.length);
});

test("mind state snapshot tolerates missing runtimes and strips secrets", async () => {
  const sourceHealth = createSourceHealthTracker();
  sourceHealth.degraded("homeostasis", "store_missing");
  const snapshot = await buildMindStateSnapshot({
    sourceHealth,
    contexts: { homeostasis: { topNeed: "rest", password: "nope" } },
  });
  for (const key of ["alive","innerLife","continuity","growth","curiosity","relationship","consequences","homeostasis","identity","fulfillment","diagnostics","recentEvents","currentPrelude","sourceHealth","generatedAt"]) {
    assert.ok(Object.hasOwn(snapshot, key), key);
  }
  assert.equal(snapshot.homeostasis.password, undefined);
  assert.equal(snapshot.sourceHealth.homeostasis.status, "degraded");
});

test("source health reports degraded systems", () => {
  const h = createSourceHealthTracker();
  const state = h.degraded("curiosity", "disabled");
  assert.equal(state.status, "degraded");
  assert.ok(state.last_error_at);
});

test("lifeRuntime exposes getMindStateSnapshot and safe status metadata", async () => {
  const lr = createLifeRuntime({ config: { memory: { companionId: "dante" } } });
  assert.equal(typeof lr.getMindStateSnapshot, "function");
  const status = lr.getStatus();
  assert.equal(status.mindStateSnapshot.available, true);
  const snapshot = await lr.getMindStateSnapshot();
  assert.ok(snapshot.sourceHealth.homeostasis);
});
