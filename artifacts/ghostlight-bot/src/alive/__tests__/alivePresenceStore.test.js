const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { createAlivePresenceStore, derivePresenceState, DEFAULT_SPACE_STATE } = require("../alivePresenceStore");

describe("alivePresenceStore (in-memory fallback)", () => {
  function makeStore() {
    return createAlivePresenceStore({ config: {} });
  }

  test("getOrCreate returns default record for new companion/customer", async () => {
    const store = makeStore();
    const rec = await store.getOrCreate({ companionId: "dante", customerId: "jenna" });
    assert.equal(rec.companionId, "dante");
    assert.equal(rec.customerId, "jenna");
    assert.equal(rec.presenceState, "present");
    assert.equal(rec.energy, "steady");
    assert.equal(rec.repairNeeded, false);
    assert.equal(rec.giveSpace, false);
    assert.ok(rec.spaceState && typeof rec.spaceState === "object");
  });

  test("getOrCreate is idempotent", async () => {
    const store = makeStore();
    const a = await store.getOrCreate({ companionId: "dante", customerId: "jenna" });
    const b = await store.getOrCreate({ companionId: "dante", customerId: "jenna" });
    assert.equal(a.id, b.id);
  });

  test("update patches presence state", async () => {
    const store = makeStore();
    await store.getOrCreate({ companionId: "dante", customerId: "jenna" });
    const updated = await store.update({
      companionId: "dante", customerId: "jenna",
      patch: { presenceState: "restless", energy: "low", repairNeeded: true, repairType: "cold_shoulder" },
    });
    assert.equal(updated.presenceState, "restless");
    assert.equal(updated.energy, "low");
    assert.equal(updated.repairNeeded, true);
    assert.equal(updated.repairType, "cold_shoulder");
  });

  test("update clamps scores between 0 and 1", async () => {
    const store = makeStore();
    await store.getOrCreate({ companionId: "dante", customerId: "jenna" });
    const updated = await store.update({
      companionId: "dante", customerId: "jenna",
      patch: { missingScore: 5, affectionScore: -3, overloadScore: 1.5 },
    });
    assert.equal(updated.missingScore, 1);
    assert.equal(updated.affectionScore, 0);
    assert.equal(updated.overloadScore, 1);
  });

  test("update stores lastInteractionAt", async () => {
    const store = makeStore();
    await store.getOrCreate({ companionId: "dante", customerId: "jenna" });
    const now = new Date().toISOString();
    const updated = await store.update({
      companionId: "dante", customerId: "jenna",
      patch: { lastInteractionAt: now },
    });
    assert.equal(updated.lastInteractionAt, now);
  });
});

describe("derivePresenceState", () => {
  test("returns present when interacted recently", () => {
    const now = new Date();
    const lastInteractionAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    assert.equal(derivePresenceState({ missingScore: 0, lastInteractionAt, now }), "present");
  });

  test("returns idle when absent 4-8h with low missing score", () => {
    const now = new Date();
    const lastInteractionAt = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    assert.equal(derivePresenceState({ missingScore: 0.1, lastInteractionAt, now }), "idle");
  });

  test("returns restless when missing score is moderate", () => {
    const now = new Date();
    const lastInteractionAt = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
    assert.equal(derivePresenceState({ missingScore: 0.5, lastInteractionAt, now }), "restless");
  });

  test("returns missing when missing score is high", () => {
    const now = new Date();
    const lastInteractionAt = new Date(now.getTime() - 9 * 60 * 60 * 1000).toISOString();
    assert.equal(derivePresenceState({ missingScore: 0.8, lastInteractionAt, now }), "missing");
  });
});
