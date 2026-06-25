/**
 * Verify: Context pack modules are wired into runtime.
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

// Check storage/index.js exports the new stores
const storageIndex = readFileSync(
  resolve(__here, "../src/storage/index.js"),
  "utf8"
);

test("storage/index.js imports createConversationFollowupStore", () => {
  assert.ok(
    storageIndex.includes("createConversationFollowupStore"),
    "should import from conversationFollowupState"
  );
});

test("storage/index.js imports createTimedNotesStore", () => {
  assert.ok(
    storageIndex.includes("createTimedNotesStore"),
    "should import from timedNotes"
  );
});

test("storage/index.js imports createProactiveVarietyMemoryStore", () => {
  assert.ok(
    storageIndex.includes("createProactiveVarietyMemoryStore"),
    "should import from proactiveVarietyMemory"
  );
});

test("storage/index.js exports createConversationFollowupStore", () => {
  const exportIdx = storageIndex.lastIndexOf("createConversationFollowupStore");
  const moduleExportIdx = storageIndex.indexOf("module.exports");
  assert.ok(
    exportIdx > -1 && exportIdx > moduleExportIdx,
    "should export in module.exports"
  );
});

test("storage/index.js exports createTimedNotesStore", () => {
  const exportIdx = storageIndex.lastIndexOf("createTimedNotesStore");
  const moduleExportIdx = storageIndex.indexOf("module.exports");
  assert.ok(
    exportIdx > -1 && exportIdx > moduleExportIdx,
    "should export in module.exports"
  );
});

test("storage/index.js exports createProactiveVarietyMemoryStore", () => {
  const exportIdx = storageIndex.lastIndexOf("createProactiveVarietyMemoryStore");
  const moduleExportIdx = storageIndex.indexOf("module.exports");
  assert.ok(
    exportIdx > -1 && exportIdx > moduleExportIdx,
    "should export in module.exports"
  );
});

test("conversationFollowupState.js file exists", () => {
  const content = readFileSync(
    resolve(__here, "../src/storage/conversationFollowupState.js"),
    "utf8"
  );
  assert.ok(content.includes("createConversationFollowupStore"));
});

test("timedNotes.js file exists", () => {
  const content = readFileSync(
    resolve(__here, "../src/storage/timedNotes.js"),
    "utf8"
  );
  assert.ok(content.includes("createTimedNotesStore"));
});

test("proactiveVarietyMemory.js file exists", () => {
  const content = readFileSync(
    resolve(__here, "../src/storage/proactiveVarietyMemory.js"),
    "utf8"
  );
  assert.ok(content.includes("createProactiveVarietyMemoryStore"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
