const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { createAliveEngine } = require("../aliveEngine");
const { createAliveEventsStore } = require("../aliveEventsStore");
const { createIntentionQueueStore } = require("../intentionQueueStore");

function makeStores() {
  return {
    eventsStore: createAliveEventsStore({ config: {} }),
    intentionQueue: createIntentionQueueStore({ config: {} }),
  };
}

describe("aliveEngine", () => {
  test("disabled by default when ALIVE_ENABLED not set", async () => {
    const saved = process.env.ALIVE_ENABLED;
    delete process.env.ALIVE_ENABLED;
    const { eventsStore, intentionQueue } = makeStores();
    const engine = createAliveEngine({ config: {}, aliveEventsStore: eventsStore, intentionQueue });
    const result = await engine.assess(new Date());
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "disabled");
    process.env.ALIVE_ENABLED = saved;
  });

  test("enabled when ALIVE_ENABLED=true", async () => {
    process.env.ALIVE_ENABLED = "true";
    const { eventsStore, intentionQueue } = makeStores();
    const fakePresence = { listPresence: async () => [] };
    const engine = createAliveEngine({
      config: { memory: { companionId: "dante", userScope: "jenna" } },
      aliveEventsStore: eventsStore,
      intentionQueue,
      interactionPresenceStore: fakePresence,
    });
    const result = await engine.assess(new Date());
    // absence = Infinity, should enqueue
    assert.equal(result.enqueued, true);
    delete process.env.ALIVE_ENABLED;
  });

  test("quiet hours suppress assess", async () => {
    process.env.ALIVE_ENABLED = "true";
    const { eventsStore, intentionQueue } = makeStores();
    const engine = createAliveEngine({
      config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { quietHoursStart: 0, quietHoursEnd: 23 } },
      aliveEventsStore: eventsStore,
      intentionQueue,
    });
    // hour 0 is within 0..23 → quiet
    const midnight = new Date("2025-06-25T00:30:00Z");
    const result = await engine.assess(midnight);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "quiet_hours");
    delete process.env.ALIVE_ENABLED;
  });

  test("daily cap enforced", async () => {
    process.env.ALIVE_ENABLED = "true";
    const { eventsStore, intentionQueue } = makeStores();
    const now = new Date();
    // Log 3 intention_created events
    await eventsStore.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "t1" });
    await eventsStore.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "t2" });
    await eventsStore.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "t3" });
    const engine = createAliveEngine({
      config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { dailyReachOutCap: 3 } },
      aliveEventsStore: eventsStore,
      intentionQueue,
    });
    const result = await engine.assess(now);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "daily_cap_reached");
    delete process.env.ALIVE_ENABLED;
  });

  test("cooldown prevents rapid successive enqueues", async () => {
    process.env.ALIVE_ENABLED = "true";
    const { eventsStore, intentionQueue } = makeStores();
    const now = new Date();
    await eventsStore.logEvent({ companionId: "dante", customerId: "jenna", eventType: "intention_created", reason: "recent" });
    const engine = createAliveEngine({
      config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { cooldownMs: 2 * 60 * 60 * 1000 } },
      aliveEventsStore: eventsStore,
      intentionQueue,
    });
    const result = await engine.assess(now);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "cooldown_active");
    delete process.env.ALIVE_ENABLED;
  });

  test("absence guard suppresses when user recently active", async () => {
    process.env.ALIVE_ENABLED = "true";
    const { eventsStore, intentionQueue } = makeStores();
    const now = new Date();
    const fakePresence = {
      listPresence: async () => [{ last_user_message_at: new Date(now.getTime() - 10 * 60 * 1000).toISOString() }],
    };
    const engine = createAliveEngine({
      config: { memory: { companionId: "dante", userScope: "jenna" } },
      aliveEventsStore: eventsStore,
      intentionQueue,
      interactionPresenceStore: fakePresence,
    });
    const result = await engine.assess(now);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "owner_recently_active");
    delete process.env.ALIVE_ENABLED;
  });

  test("scheduler survives provider failure without throwing", async () => {
    process.env.ALIVE_ENABLED = "true";
    const crashEvents = {
      countTodayByType: async () => { throw new Error("DB down"); },
      listRecent: async () => [],
      logEvent: async () => {},
    };
    const engine = createAliveEngine({
      config: { memory: { companionId: "dante", userScope: "jenna" } },
      aliveEventsStore: crashEvents,
      intentionQueue: createIntentionQueueStore({ config: {} }),
    });
    let threw = false;
    try { await engine.assess(new Date()); } catch { threw = true; }
    assert.equal(threw, false);
    delete process.env.ALIVE_ENABLED;
  });

  test("getStatus includes quiet hours config", () => {
    const engine = createAliveEngine({
      config: { alive: { quietHoursStart: 22, quietHoursEnd: 8, timezone: "America/Chicago" } },
    });
    const status = engine.getStatus();
    assert.equal(status.quietHours.start, 22);
    assert.equal(status.quietHours.end, 8);
    assert.equal(status.quietHours.timezone, "America/Chicago");
  });
});
