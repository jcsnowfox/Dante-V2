const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { isInQuietHours } = require("../aliveExecutor");
const { createIntentionQueueStore } = require("../intentionQueueStore");
const { createAliveEventsStore } = require("../aliveEventsStore");
const { createAlivePresenceStore } = require("../alivePresenceStore");

describe("isInQuietHours", () => {
  test("in quiet hours when hour >= quietStart (e.g. 23:30)", () => {
    const late = new Date("2025-06-25T23:30:00Z");
    assert.equal(isInQuietHours(late, { quietStart: 23, quietEnd: 7, timezone: "UTC" }), true);
  });

  test("in quiet hours when hour < quietEnd (e.g. 03:00)", () => {
    const early = new Date("2025-06-25T03:00:00Z");
    assert.equal(isInQuietHours(early, { quietStart: 23, quietEnd: 7, timezone: "UTC" }), true);
  });

  test("not in quiet hours mid-day", () => {
    const midday = new Date("2025-06-25T14:00:00Z");
    assert.equal(isInQuietHours(midday, { quietStart: 23, quietEnd: 7, timezone: "UTC" }), false);
  });

  test("not in quiet hours at exact quietEnd boundary", () => {
    const seven = new Date("2025-06-25T07:00:00Z");
    assert.equal(isInQuietHours(seven, { quietStart: 23, quietEnd: 7, timezone: "UTC" }), false);
  });

  test("falls back to UTC on invalid timezone", () => {
    const late = new Date("2025-06-25T23:30:00Z");
    const result = isInQuietHours(late, { quietStart: 23, quietEnd: 7, timezone: "Invalid/Timezone" });
    assert.equal(typeof result, "boolean");
  });
});

describe("executeNextIntention skips", () => {
  async function getExecutor() {
    const { executeNextIntention } = require("../aliveExecutor");
    return executeNextIntention;
  }

  test("skips when ALIVE_UNPROMPTED_ENABLED is not set", async () => {
    delete process.env.ALIVE_UNPROMPTED_ENABLED;
    const { executeNextIntention } = require("../aliveExecutor");
    const result = await executeNextIntention({
      intentionQueue: createIntentionQueueStore({ config: {} }),
      alivePresenceStore: createAlivePresenceStore({ config: {} }),
      aliveEventsStore: createAliveEventsStore({ config: {} }),
      client: {},
      config: { memory: { companionId: "dante", userScope: "jenna" } },
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "unprompted_disabled");
  });

  test("skips when ALIVE_TARGET_CHANNEL_ID is not set", async () => {
    process.env.ALIVE_UNPROMPTED_ENABLED = "true";
    delete process.env.ALIVE_TARGET_CHANNEL_ID;
    const { executeNextIntention } = require("../aliveExecutor");
    const result = await executeNextIntention({
      intentionQueue: createIntentionQueueStore({ config: {} }),
      alivePresenceStore: createAlivePresenceStore({ config: {} }),
      aliveEventsStore: createAliveEventsStore({ config: {} }),
      client: {},
      config: { memory: { companionId: "dante", userScope: "jenna" } },
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "no_target_channel");
    delete process.env.ALIVE_UNPROMPTED_ENABLED;
  });

  test("skips when no pending intentions", async () => {
    process.env.ALIVE_UNPROMPTED_ENABLED = "true";
    process.env.ALIVE_TARGET_CHANNEL_ID = "123456789012345678";
    const { executeNextIntention } = require("../aliveExecutor");
    const result = await executeNextIntention({
      intentionQueue: createIntentionQueueStore({ config: {} }),
      alivePresenceStore: createAlivePresenceStore({ config: {} }),
      aliveEventsStore: createAliveEventsStore({ config: {} }),
      client: {},
      config: { memory: { companionId: "dante", userScope: "jenna" } },
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "no_pending_intentions");
    delete process.env.ALIVE_UNPROMPTED_ENABLED;
    delete process.env.ALIVE_TARGET_CHANNEL_ID;
  });

  test("skips when in quiet hours", async () => {
    process.env.ALIVE_UNPROMPTED_ENABLED = "true";
    process.env.ALIVE_TARGET_CHANNEL_ID = "123456789012345678";
    const { executeNextIntention } = require("../aliveExecutor");
    const queue = createIntentionQueueStore({ config: {} });
    await queue.enqueue({ companionId: "dante", customerId: "jenna", intentionType: "reach_out", reason: "test" });
    const midnight = new Date("2025-06-25T00:30:00Z"); // UTC 0:30 → in quiet hours (23-7)
    const result = await executeNextIntention({
      intentionQueue: queue,
      alivePresenceStore: createAlivePresenceStore({ config: {} }),
      aliveEventsStore: createAliveEventsStore({ config: {} }),
      client: {},
      config: { memory: { companionId: "dante", userScope: "jenna" }, alive: { quietHoursStart: 23, quietHoursEnd: 7 } },
      now: midnight,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "quiet_hours");
    delete process.env.ALIVE_UNPROMPTED_ENABLED;
    delete process.env.ALIVE_TARGET_CHANNEL_ID;
  });

  test("skips casual intention when give_space is active", async () => {
    process.env.ALIVE_UNPROMPTED_ENABLED = "true";
    process.env.ALIVE_TARGET_CHANNEL_ID = "123456789012345678";
    const { executeNextIntention } = require("../aliveExecutor");
    const queue = createIntentionQueueStore({ config: {} });
    await queue.enqueue({ companionId: "dante", customerId: "jenna", intentionType: "reach_out", reason: "test" });
    const presenceStore = createAlivePresenceStore({ config: {} });
    await presenceStore.update({ companionId: "dante", customerId: "jenna", patch: { giveSpace: true } });
    const midday = new Date("2025-06-25T14:00:00Z");
    const result = await executeNextIntention({
      intentionQueue: queue,
      alivePresenceStore: presenceStore,
      aliveEventsStore: createAliveEventsStore({ config: {} }),
      client: {},
      config: { memory: { companionId: "dante", userScope: "jenna" } },
      now: midday,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "give_space");
    delete process.env.ALIVE_UNPROMPTED_ENABLED;
    delete process.env.ALIVE_TARGET_CHANNEL_ID;
  });

  test("repair_bridge is NOT suppressed by give_space", async () => {
    process.env.ALIVE_UNPROMPTED_ENABLED = "true";
    process.env.ALIVE_TARGET_CHANNEL_ID = "123456789012345678";
    const { executeNextIntention } = require("../aliveExecutor");
    const queue = createIntentionQueueStore({ config: {} });
    await queue.enqueue({ companionId: "dante", customerId: "jenna", intentionType: "repair_bridge", reason: "test", priority: 9 });
    const presenceStore = createAlivePresenceStore({ config: {} });
    await presenceStore.update({ companionId: "dante", customerId: "jenna", patch: { giveSpace: true } });
    const midday = new Date("2025-06-25T14:00:00Z");
    // Will fail at runCheckInAutomation (no real Discord client) — that's the expected failure mode
    const result = await executeNextIntention({
      intentionQueue: queue,
      alivePresenceStore: presenceStore,
      aliveEventsStore: createAliveEventsStore({ config: {} }),
      client: {},
      config: { memory: { companionId: "dante", userScope: "jenna" } },
      now: midday,
    });
    // Should NOT be suppressed for give_space — will error on Discord call
    assert.notEqual(result.reason, "give_space");
    delete process.env.ALIVE_UNPROMPTED_ENABLED;
    delete process.env.ALIVE_TARGET_CHANNEL_ID;
  });
});
