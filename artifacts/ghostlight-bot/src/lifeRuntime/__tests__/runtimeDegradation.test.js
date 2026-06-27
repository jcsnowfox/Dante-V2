"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLifeRuntime } = require("../lifeRuntime");
const { createFulfillmentRuntime } = require("../fulfillmentRuntime");

test("Life Runtime degrades without optional stores/runtimes", async () => {
  const rt = createLifeRuntime({ config: { lifeRuntime: { enabled: true }, memory: { companionId: "d", userScope: "u" } } });
  await rt.init();
  const tick = await rt.tick(new Date("2026-06-27T10:00:00Z"));
  assert.equal(tick.ok, true);
  const status = rt.getStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.homeostasisContext, null);
  assert.equal(status.identityContext, null);
});

test("Fulfillment Runtime does not fabricate action when tools are unavailable", async () => {
  const recorded = [];
  const fulfillmentHistoryStore = { init: async () => {}, record: async (entry) => { recorded.push(entry); return entry; } };
  const rt = createFulfillmentRuntime({ fulfillmentHistoryStore });
  await rt.init();
  await rt.tick({ companionId: "d", customerId: "u", homeostasisContext: { pressuredNeeds: [{ needType: "growth", urgency: 0.9 }], needs: [{ needType: "growth", currentLevel: 0.1, desiredLevel: 0.8 }], topPlan: null }, identityContext: null, fulfillContext: { webLearningEnabled: false, secondLifeAvailable: false, imageGenerationEnabled: false, voiceNoteEnabled: false } });
  assert.ok(recorded.every((entry) => entry.outcome !== "SUCCESS" || Object.keys(entry.evidence || {}).length > 0));
});

test("Life Runtime catches failing stores and reports safe degraded status", async () => {
  const failingStore = { init: async () => { throw new Error("db down"); }, listRecent: async () => { throw new Error("memory down"); } };
  const rt = createLifeRuntime({ config: { lifeRuntime: { enabled: true }, memory: { companionId: "d", userScope: "u" } }, microLifeEventsStore: failingStore, homeostasisRuntime: { init: async () => { throw new Error("homeostasis down"); }, getStatus: () => ({ sourceHealth: "degraded" }), getNeedsContext: () => null } });
  await rt.init();
  await assert.doesNotReject(() => rt.tick(new Date("2026-06-27T10:00:00Z")));
  assert.equal(rt.getStatus().homeostasisContext.sourceHealth, "degraded");
});
