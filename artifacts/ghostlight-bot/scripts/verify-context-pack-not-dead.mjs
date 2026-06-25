/**
 * Verify: Context pack modules actually exist and have real implementations.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

const __here = dirname(fileURLToPath(import.meta.url));

test("conversationFollowupState.js is not stub/placeholder", () => {
  const content = readFileSync(
    resolve(__here, "../src/storage/conversationFollowupState.js"),
    "utf8"
  );
  assert.ok(content.length > 500, "should have substantive implementation");
  assert.ok(content.includes("createPostgresPool"), "should use real database");
  assert.ok(content.includes("async createFollowUp"), "should have createFollowUp");
  assert.ok(content.includes("async getState"), "should have getState");
  assert.ok(content.includes("async listDue"), "should have listDue");
  assert.ok(
    content.includes("conversation_followup_state"),
    "should reference table name"
  );
});

test("timedNotes.js is not stub/placeholder", () => {
  const content = readFileSync(
    resolve(__here, "../src/storage/timedNotes.js"),
    "utf8"
  );
  assert.ok(content.length > 500, "should have substantive implementation");
  assert.ok(content.includes("createPostgresPool"), "should use real database");
  assert.ok(content.includes("async createNote"), "should have createNote");
  assert.ok(content.includes("async listNotes"), "should have listNotes");
  assert.ok(content.includes("timed_notes"), "should reference table name");
  assert.ok(content.includes("STATUSES"), "should export statuses");
});

test("proactiveVarietyMemory.js is not stub/placeholder", () => {
  const content = readFileSync(
    resolve(__here, "../src/storage/proactiveVarietyMemory.js"),
    "utf8"
  );
  assert.ok(content.length > 400, "should have substantive implementation");
  assert.ok(content.includes("createPostgresPool"), "should use real database");
  assert.ok(content.includes("async recordRun"), "should have recordRun");
  assert.ok(content.includes("async listRecent"), "should have listRecent");
  assert.ok(
    content.includes("proactive_variety_memory"),
    "should reference table name"
  );
});

test("storage modules have fallback stores", () => {
  const cfPath = resolve(
    __here,
    "../src/storage/conversationFollowupState.js"
  );
  const tnPath = resolve(__here, "../src/storage/timedNotes.js");
  const pvPath = resolve(__here, "../src/storage/proactiveVarietyMemory.js");

  const cf = readFileSync(cfPath, "utf8");
  const tn = readFileSync(tnPath, "utf8");
  const pv = readFileSync(pvPath, "utf8");

  assert.ok(
    cf.includes("createFallbackStore"),
    "conversationFollowupState should have fallback"
  );
  assert.ok(tn.includes("createFallbackStore"), "timedNotes should have fallback");
  assert.ok(pv.includes("createFallbackStore"), "varietyMemory should have fallback");
});

test("storage/index.js actually exports new stores", async () => {
  const index = await import("../src/storage/index.js");
  assert.ok(index.createConversationFollowupStore, "should export createConversationFollowupStore");
  assert.ok(index.createTimedNotesStore, "should export createTimedNotesStore");
  assert.ok(index.createProactiveVarietyMemoryStore, "should export createProactiveVarietyMemoryStore");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
