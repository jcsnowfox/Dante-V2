/**
 * Verify: Proactive Variety Memory storage and functionality.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(() => {
        console.log(`  PASS  ${name}`);
        passed++;
      }).catch((err) => {
        console.error(`  FAIL  ${name}: ${err.message}`);
        failed++;
      });
    }
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

const promises = [];

const { createProactiveVarietyMemoryStore } = await import(
  "../src/storage/proactiveVarietyMemory.js"
);

test("createProactiveVarietyMemoryStore returns store", () => {
  const store = createProactiveVarietyMemoryStore({});
  assert.ok(store);
  assert.equal(typeof store.init, "function");
  assert.equal(typeof store.recordRun, "function");
  assert.equal(typeof store.listRecent, "function");
  assert.equal(typeof store.clearOldRuns, "function");
});

promises.push(test("recordRun stores action summary", async () => {
  const store = createProactiveVarietyMemoryStore({});
  await store.init();
  const result = await store.recordRun({
    user_scope: "user",
    companion_id: "Dante",
    action_id: "schedule_1",
    action_type: "daily_thread",
    run_id: "run_123",
    output_summary: "Morning greeting about weather",
    theme_summary: "cheerful, rainy day",
    tools_used: ["weather", "gifs"],
  });
  assert.ok(result);
  assert.equal(result.action_id, "schedule_1");
  assert.equal(result.theme_summary, "cheerful, rainy day");
}));

promises.push(test("listRecent returns recent runs sorted by date", async () => {
  const store = createProactiveVarietyMemoryStore({});
  await store.init();

  const run1 = await store.recordRun({
    user_scope: "user2",
    companion_id: "Dante",
    action_id: "act_1",
    output_summary: "First",
  });

  // Small delay to ensure different timestamps
  await new Promise(r => setTimeout(r, 10));

  const run2 = await store.recordRun({
    user_scope: "user2",
    companion_id: "Dante",
    action_id: "act_1",
    output_summary: "Second",
  });

  const recent = await store.listRecent({
    user_scope: "user2",
    companion_id: "Dante",
    action_id: "act_1",
    limit: 10,
  });

  assert.ok(recent.length >= 1);
  assert.equal(recent[0].output_summary, "Second");
}));

promises.push(test("listRecent filters by action_id", async () => {
  const store = createProactiveVarietyMemoryStore({});
  await store.init();

  await store.recordRun({
    user_scope: "user3",
    companion_id: "Dante",
    action_id: "act_A",
    output_summary: "Action A",
  });
  await store.recordRun({
    user_scope: "user3",
    companion_id: "Dante",
    action_id: "act_B",
    output_summary: "Action B",
  });

  const onlyA = await store.listRecent({
    user_scope: "user3",
    companion_id: "Dante",
    action_id: "act_A",
  });

  assert.ok(onlyA.every((r) => r.action_id === "act_A"));
}));

promises.push(test("clearOldRuns removes old records keeping limit", async () => {
  const store = createProactiveVarietyMemoryStore({});
  await store.init();

  for (let i = 0; i < 25; i++) {
    await store.recordRun({
      user_scope: "user4",
      companion_id: "Dante",
      action_id: "act",
      output_summary: `Run ${i}`,
    });
  }

  const before = await store.listRecent({
    user_scope: "user4",
    companion_id: "Dante",
    limit: 100,
  });

  const deleted = await store.clearOldRuns({
    user_scope: "user4",
    companion_id: "Dante",
    action_id: "act",
    keep_count: 10,
  });

  const after = await store.listRecent({
    user_scope: "user4",
    companion_id: "Dante",
    limit: 100,
  });

  assert.ok(deleted > 0, "should delete old runs");
  assert.ok(after.length <= 10, "should keep only requested count");
}));

promises.push(test("tools_used_json stored and retrieved", async () => {
  const store = createProactiveVarietyMemoryStore({});
  await store.init();

  const result = await store.recordRun({
    user_scope: "user5",
    companion_id: "Dante",
    tools_used_json: ["gifs", "images", "web_search"],
  });

  assert.ok(Array.isArray(result.tools_used_json));
  assert.equal(result.tools_used_json.length, 3);
}));

await Promise.all(promises.filter(Boolean));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
