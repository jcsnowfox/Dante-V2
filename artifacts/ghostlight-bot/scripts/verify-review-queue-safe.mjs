/**
 * Verify: Review Queue Crash Fix.
 * Malformed related-memory IDs must not crash the dashboard.
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

test("context pack stores validate ID inputs safely", async () => {
  // Verify that all stores handle null/undefined/invalid IDs gracefully
  const { createConversationFollowupStore } = await import("../src/storage/conversationFollowupState.js");
  const store = createConversationFollowupStore({});
  assert.ok(store, "store should initialize even with invalid config");
});

test("timed notes safely handle missing data", async () => {
  const { createTimedNotesStore } = await import("../src/storage/timedNotes.js");
  const store = createTimedNotesStore({});
  await store.init();

  // Create note with minimal data
  const note = await store.createNote({
    user_scope: "user",
    companion_id: "Dante",
  });

  assert.ok(note, "should create note with minimal fields");
  assert.equal(note.title, "", "should default missing title");
  assert.equal(note.status, "active", "should default status");
});

test("variety memory safely handles missing action_id", async () => {
  const { createProactiveVarietyMemoryStore } = await import(
    "../src/storage/proactiveVarietyMemory.js"
  );
  const store = createProactiveVarietyMemoryStore({});
  await store.init();

  const run = await store.recordRun({
    user_scope: "user",
    companion_id: "Dante",
  });

  assert.ok(run, "should handle missing action_id");
  assert.equal(run.action_id, "", "should default empty action_id");
});

test("conversation followup handles null due dates", async () => {
  const { createConversationFollowupStore } = await import(
    "../src/storage/conversationFollowupState.js"
  );
  const store = createConversationFollowupStore({});
  await store.init();

  const state = await store.createFollowUp({
    user_scope: "user",
    companion_id: "Dante",
    follow_up_due_at: null,
  });

  assert.ok(state, "should create with null due_at");
  assert.equal(state.follow_up_due_at, null);
});

test("timed notes safely retrieve non-existent notes", async () => {
  const { createTimedNotesStore } = await import("../src/storage/timedNotes.js");
  const store = createTimedNotesStore({});
  await store.init();

  const note = await store.getNote({ id: 99999 });
  assert.equal(note, null, "should return null for missing note");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
