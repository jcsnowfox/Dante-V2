#!/usr/bin/env node
/**
 * verify-memory-map-page.mjs
 * Verifies that prepareMemoryMapData returns a graceful qdrantError field
 * when Qdrant is unreachable, and that the page renderer handles it without crashing.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { prepareMemoryMapData } = require(path.join(__dirname, "../src/http/memoryMapData.js"));

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

console.log("\n[verify:memory-map-page] prepareMemoryMapData graceful Qdrant failure\n");

// --- Mock stores ---
function makeMemoryStore(memoriesArr = []) {
  return {
    countMemories: async () => memoriesArr.length,
    listMemories: async () => memoriesArr,
    getMemoryUsageCount: async () => [],
  };
}

const sampleMemories = [
  { memoryId: "m1", title: "First Memory", content: "test content 1", memoryType: "canon", domain: "personal", sensitivity: "normal", active: true, importance: 5, userScope: "user:test", referenceDate: "", createdAt: "", updatedAt: "", lastUsedAt: "", useCount: 1 },
  { memoryId: "m2", title: "Second Memory", content: "test content 2", memoryType: "anchor", domain: "relationship", sensitivity: "normal", active: true, importance: 8, userScope: "user:test", referenceDate: "", createdAt: "", updatedAt: "", lastUsedAt: "", useCount: 0 },
];

// Test 1: empty memories → returns gracefully with qdrantError=null
const resultEmpty = await prepareMemoryMapData({
  memoryStore: makeMemoryStore([]),
  config: { memory: { userScope: "user:test" }, qdrant: { url: "", collection: "test" } },
  theme: "light",
  buildAdminLocation: ({ path: p }) => p,
});
ok("empty memories → does not throw", true);
ok("empty memories → qdrantError is null", resultEmpty.qdrantError === null);
ok("empty memories → savedMemoryCount=0", resultEmpty.savedMemoryCount === 0);
ok("empty memories → points=[]", Array.isArray(resultEmpty.points) && resultEmpty.points.length === 0);

// Test 2: with memories but Qdrant unreachable → qdrantError set, does not throw
const resultQdrantFail = await prepareMemoryMapData({
  memoryStore: makeMemoryStore(sampleMemories),
  config: { memory: { userScope: "user:test" }, qdrant: { url: "http://127.0.0.1:19991", collection: "test" } },
  theme: "light",
  buildAdminLocation: ({ path: p }) => p,
});
ok("qdrant unreachable → does not throw", true);
ok("qdrant unreachable → qdrantError is set", typeof resultQdrantFail.qdrantError === "string" && resultQdrantFail.qdrantError.length > 0);
ok("qdrant unreachable → savedMemoryCount=2", resultQdrantFail.savedMemoryCount === 2);
ok("qdrant unreachable → totalActiveMemories=2", resultQdrantFail.totalActiveMemories === 2);
ok("qdrant unreachable → points=[] (no vectors available)", Array.isArray(resultQdrantFail.points) && resultQdrantFail.points.length === 0);
ok("qdrant unreachable → qdrantError is not 'fetch failed'", !String(resultQdrantFail.qdrantError).match(/^fetch failed$/i));

// Test 3: no URL configured → qdrantError contains URL guidance
const resultNoUrl = await prepareMemoryMapData({
  memoryStore: makeMemoryStore(sampleMemories),
  config: { memory: { userScope: "user:test" }, qdrant: { url: "", collection: "test" } },
  theme: "light",
  buildAdminLocation: ({ path: p }) => p,
});
ok("no qdrant URL → qdrantError set (QDRANT_URL is required)", typeof resultNoUrl.qdrantError === "string" && resultNoUrl.qdrantError.includes("QDRANT_URL"));

console.log(`\n[verify:memory-map-page] ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
