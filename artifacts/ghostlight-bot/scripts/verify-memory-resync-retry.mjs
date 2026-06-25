#!/usr/bin/env node
/**
 * verify-memory-resync-retry.mjs
 * Verifies that syncMemoriesToQdrant updates runtimeState on success/failure,
 * and that the annotated error message is human-readable (not "fetch failed").
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const syncMemoriesPath = path.join(__dirname, "../src/memory/syncMemories.js");
const runtimeStatePath = path.join(__dirname, "../src/systemTruth/runtimeState.js");
const { syncMemoriesToQdrant, canSyncMemories } = require(syncMemoriesPath);
const { getRuntimeState } = require(runtimeStatePath);

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    failed++;
  }
}

console.log("\n[verify:memory-resync-retry] syncMemoriesToQdrant runtimeState updates\n");

// canSyncMemories requires qdrant.url + embeddings key
ok("canSyncMemories false when no URL", !canSyncMemories({ qdrant: { url: "" }, llm: { apiKey: "sk-test" } }));
ok("canSyncMemories false when URL but no LLM key", !canSyncMemories({ qdrant: { url: "http://qdrant:6333" }, llm: {} }));

// --- Failure path: unreachable URL → annotated error (not "fetch failed") ---
const badConfig = {
  qdrant: { url: "http://127.0.0.1:19991", collection: "test" },
  llm: { apiKey: "sk-test" },
};

let syncError = null;
try {
  await syncMemoriesToQdrant({
    config: badConfig,
    memories: [{ memoryId: "m1", title: "T", content: "C", active: true, memoryType: "canon" }],
    deps: {
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      embedTexts: async () => [[0.1, 0.2, 0.3]],
    },
  });
} catch (e) {
  syncError = e;
}
ok("sync with unreachable qdrant throws", syncError !== null);
ok("sync error message is not raw 'fetch failed'", !String(syncError?.message || "").match(/^fetch failed$/i));
ok("sync error message has stage annotation", String(syncError?.message || "").includes("memory sync qdrant"));
ok("sync error message has human-readable cause", String(syncError?.message || "").length > 30);

// Verify runtimeState.memory.qdrantConnected=false after failure
const stateAfterFail = getRuntimeState();
ok("runtimeState.memory.qdrantConnected=false after failure", stateAfterFail.memory.qdrantConnected === false);
ok("runtimeState.memory.qdrantLastError set after failure", typeof stateAfterFail.memory.qdrantLastError === "string" && stateAfterFail.memory.qdrantLastError.length > 0);

// --- Success path: mock all deps ---
let syncResult = null;
let syncSuccessError = null;
try {
  syncResult = await syncMemoriesToQdrant({
    config: {
      qdrant: { url: "http://qdrant-mock:6333", collection: "test" },
      llm: { apiKey: "sk-test" },
    },
    memories: [
      { memoryId: "m1", title: "T1", content: "C1", active: true, memoryType: "canon" },
      { memoryId: "m2", title: "T2", content: "C2", active: true, memoryType: "anchor" },
    ],
    deps: {
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      embedTexts: async ({ inputs }) => inputs.map(() => Array.from({ length: 8 }, (_, i) => i * 0.1)),
      ensureCollection: async () => ({ status: "ok" }),
      upsertPoints: async () => ({ status: "ok" }),
      buildQdrantPoint: (memory, vector) => ({ id: memory.memoryId, vector, payload: {} }),
    },
  });
} catch (e) {
  syncSuccessError = e;
}
ok("sync with mocked deps succeeds", syncSuccessError === null && syncResult !== null);
ok("sync result has syncedCount=2", syncResult?.syncedCount === 2);
ok("sync result has skipped=false", syncResult?.skipped === false);

// Check runtimeState after success
const stateAfterSuccess = getRuntimeState();
ok("runtimeState.qdrantConnected=true after success", stateAfterSuccess.memory.qdrantConnected === true);
ok("runtimeState.qdrantLastSuccessfulSync set after success", typeof stateAfterSuccess.memory.qdrantLastSuccessfulSync === "string" && stateAfterSuccess.memory.qdrantLastSuccessfulSync.length > 0);
ok("runtimeState.qdrantIndexedCount=2 after success", stateAfterSuccess.memory.qdrantIndexedCount === 2);

console.log(`\n[verify:memory-resync-retry] ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
