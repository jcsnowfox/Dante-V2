/**
 * Verify: Daily Thread Tool Support.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

const { createProactiveVarietyMemoryStore } = await import(
  "../src/storage/proactiveVarietyMemory.js"
);
const { createTimedNotesStore } = await import("../src/storage/timedNotes.js");

test("variety memory can track tools_used", async () => {
  const store = createProactiveVarietyMemoryStore({});
  await store.init();
  const run = await store.recordRun({
    user_scope: "user",
    companion_id: "Dante",
    action_type: "daily_thread",
    tools_used_json: ["gifs", "images", "web_search"],
  });
  assert.ok(Array.isArray(run.tools_used_json));
  assert.equal(run.tools_used_json.length, 3);
});

test("variety memory retrieves recent runs for daily threads", async () => {
  const store = createProactiveVarietyMemoryStore({});
  await store.init();
  await store.recordRun({
    user_scope: "user2",
    companion_id: "Dante",
    action_id: "daily_1",
    action_type: "daily_thread",
  });
  const recent = await store.listRecent({
    user_scope: "user2",
    companion_id: "Dante",
    action_id: "daily_1",
  });
  assert.ok(recent.length >= 1);
});

test("timed notes can be retrieved for daily thread context", async () => {
  const store = createTimedNotesStore({});
  await store.init();
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const note = await store.createNote({
    user_scope: "user3",
    companion_id: "Dante",
    title: "Important event tomorrow",
    starts_at: tomorrow,
    status: "upcoming",
  });

  const upcoming = await store.listNotes({
    user_scope: "user3",
    companion_id: "Dante",
    status: "upcoming",
  });

  assert.ok(upcoming.length >= 1);
  assert.ok(upcoming.some((n) => n.id === note.id));
});

test("variety memory tracks action types for daily threads", async () => {
  const store = createProactiveVarietyMemoryStore({});
  await store.init();

  const run = await store.recordRun({
    user_scope: "user4",
    companion_id: "Dante",
    action_type: "daily_thread",
    theme_summary: "morning greeting with weather mention",
  });

  assert.equal(run.action_type, "daily_thread");
  assert.ok(run.theme_summary.includes("morning"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
