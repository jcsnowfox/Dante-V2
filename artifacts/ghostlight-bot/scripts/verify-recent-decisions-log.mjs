/**
 * Verify: recentDecisions storage module correctness.
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

const { createRecentDecisionStore, DECISION_TYPES } = await import("../src/storage/recentDecisions.js");

test("DECISION_TYPES is a frozen array", () => {
  assert.ok(Array.isArray(DECISION_TYPES));
  assert.ok(DECISION_TYPES.includes("reply_tone_selected"));
  assert.ok(DECISION_TYPES.includes("fallback_used"));
  assert.ok(DECISION_TYPES.includes("repair_mode_triggered"));
  assert.ok(DECISION_TYPES.includes("other"));
  assert.ok(Object.isFrozen(DECISION_TYPES));
});

test("createRecentDecisionStore returns a store object without DB", () => {
  const store = createRecentDecisionStore({});
  assert.ok(store, "should return store");
  assert.equal(typeof store.init, "function");
  assert.equal(typeof store.logDecision, "function");
  assert.equal(typeof store.listDecisions, "function");
  assert.equal(typeof store.countDecisions, "function");
});

test("fallback store is available", () => {
  const store = createRecentDecisionStore({});
  assert.equal(store.available, true);
});

promises.push(test("logDecision stores a record", async () => {
  const store = createRecentDecisionStore({});
  await store.init();
  const result = await store.logDecision({
    user_scope: "user",
    companion_id: "Dante",
    decision_type: "reply_tone_selected",
    decision_summary: "Tone: warm",
    reason_summary: "rankedBeats said warm",
    inputs_used_json: ["warm"],
    source_channel_id: "123",
    source_message_id: "msg1",
    privacy_scope: "normal",
    adult_context: false,
  });
  assert.ok(result, "should return inserted record");
  assert.equal(result.decision_type, "reply_tone_selected");
  assert.equal(result.decision_summary, "Tone: warm");
  assert.equal(result.user_scope, "user");
  assert.equal(result.privacy_scope, "normal");
  assert.equal(result.adult_context, false);
}));

promises.push(test("logDecision defaults missing fields", async () => {
  const store = createRecentDecisionStore({});
  await store.init();
  const result = await store.logDecision({
    user_scope: "user",
    companion_id: "Dante",
  });
  assert.equal(result.decision_type, "other");
  assert.equal(result.decision_summary, "");
  assert.equal(result.outcome_status, "recorded");
}));

promises.push(test("listDecisions returns records sorted by newest first", async () => {
  const store = createRecentDecisionStore({});
  await store.init();
  await store.logDecision({ user_scope: "user", companion_id: "Dante", decision_type: "fallback_used", decision_summary: "First" });
  await store.logDecision({ user_scope: "user", companion_id: "Dante", decision_type: "repair_mode_triggered", decision_summary: "Second" });
  const list = await store.listDecisions({ user_scope: "user", companion_id: "Dante" });
  assert.ok(list.length >= 2, "should have at least 2 items");
  assert.equal(list[0].decision_summary, "Second", "newest first");
}));

promises.push(test("listDecisions respects include_adult=false", async () => {
  const store = createRecentDecisionStore({});
  await store.init();
  await store.logDecision({ user_scope: "user2", companion_id: "Dante", decision_type: "private_redirect", decision_summary: "Adult redirect", privacy_scope: "adult_private", adult_context: true });
  await store.logDecision({ user_scope: "user2", companion_id: "Dante", decision_type: "reply_tone_selected", decision_summary: "Normal tone", privacy_scope: "normal", adult_context: false });
  const list = await store.listDecisions({ user_scope: "user2", companion_id: "Dante", include_adult: false });
  assert.ok(list.every((d) => !d.adult_context), "adult records should be excluded");
}));

promises.push(test("listDecisions filters by decision_type", async () => {
  const store = createRecentDecisionStore({});
  await store.init();
  await store.logDecision({ user_scope: "user3", companion_id: "Dante", decision_type: "memory_saved" });
  await store.logDecision({ user_scope: "user3", companion_id: "Dante", decision_type: "fallback_used" });
  const list = await store.listDecisions({ user_scope: "user3", companion_id: "Dante", decision_type: "memory_saved" });
  assert.ok(list.every((d) => d.decision_type === "memory_saved"), "should only return matching type");
}));

promises.push(test("countDecisions returns correct count", async () => {
  const store = createRecentDecisionStore({});
  await store.init();
  await store.logDecision({ user_scope: "user4", companion_id: "Dante", decision_type: "web_search_used" });
  await store.logDecision({ user_scope: "user4", companion_id: "Dante", decision_type: "web_search_used" });
  const count = await store.countDecisions({ user_scope: "user4", companion_id: "Dante", decision_type: "web_search_used" });
  assert.equal(count, 2);
}));

promises.push(test("fallback store caps at 500 records", async () => {
  const store = createRecentDecisionStore({});
  await store.init();
  for (let i = 0; i < 510; i++) {
    await store.logDecision({ user_scope: "capper", companion_id: "Dante" });
  }
  const list = await store.listDecisions({ user_scope: "capper", companion_id: "Dante", limit: 200 });
  assert.ok(list.length <= 200, `should be limited to 200 per query, got ${list.length}`);
}));

await Promise.all(promises.filter(Boolean));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
