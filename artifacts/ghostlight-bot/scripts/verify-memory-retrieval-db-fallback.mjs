#!/usr/bin/env node
/**
 * verify-memory-retrieval-db-fallback.mjs
 * Verifies that qdrantMemoryProvider falls back to DB memories (pinned/active)
 * when all Qdrant layers fail, instead of returning an empty array.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { createQdrantMemoryProvider } = require(path.join(__dirname, "../src/memory/providers/qdrantMemoryProvider.js"));

let passed = 0;
let failed = 0;
const warnMessages = [];

function ok(label, cond) {
  if (cond) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    failed++;
  }
}

console.log("\n[verify:memory-retrieval-db-fallback] DB fallback when Qdrant fails\n");

const fallbackMemories = [
  { memoryId: "fb1", title: "Fallback Memory 1", content: "important content", memoryType: "anchor", domain: "personal", sensitivity: "normal", active: true, importance: 9, userScope: "user:test", pinned: true },
  { memoryId: "fb2", title: "Fallback Memory 2", content: "another important thing", memoryType: "canon", domain: "relationship", sensitivity: "normal", active: true, importance: 7, userScope: "user:test", pinned: true },
];

// Mock memory store that provides fallback
const mockMemoryStore = {
  listMemories: async ({ pinned, activeOnly, limit } = {}) => {
    return fallbackMemories.slice(0, limit || 20);
  },
  getMemoriesByIds: async (ids) => {
    return fallbackMemories.filter((m) => ids.includes(m.memoryId));
  },
  markMemoryUsed: async () => {},
};

const mockLogger = {
  warn: (msg, meta) => { warnMessages.push(String(msg)); },
  info: (msg) => {},
  debug: () => {},
};

// Config with unreachable Qdrant
const mockConfig = {
  qdrant: { url: "http://127.0.0.1:19991", collection: "test" },
  openai: { apiKey: "sk-test" },
  memory: { userScope: "user:test" },
  llm: {},
};

const provider = createQdrantMemoryProvider({
  config: mockConfig,
  logger: mockLogger,
  memoryStore: mockMemoryStore,
});

ok("provider created successfully", provider !== null);
ok("provider has retrieve method", typeof provider.retrieve === "function");

// Attempt retrieval with Qdrant unreachable
let retrievedMemories = null;
let retrieveError = null;
try {
  retrievedMemories = await provider.retrieve({
    query: { primary: "important relationship memories", continuity: "what do I care about" },
    mode: {},
  });
} catch (e) {
  retrieveError = e;
}

ok("retrieve does not throw when Qdrant fails", retrieveError === null);
ok("retrieve returns array when Qdrant fails", Array.isArray(retrievedMemories));
ok("retrieve returns DB fallback memories (not empty)", retrievedMemories !== null && retrievedMemories.length > 0);
ok("fallback memories have memoryId", retrievedMemories[0]?.memoryId?.length > 0);

// Check that the warning was logged
const dbFallbackWarned = warnMessages.some((m) => m.includes("fallback") || m.includes("Qdrant layers failed") || m.includes("db fallback"));
ok("warn logged about db fallback", dbFallbackWarned);

// --- No DB fallback when memoryStore is null ---
const providerNoStore = createQdrantMemoryProvider({
  config: mockConfig,
  logger: mockLogger,
  memoryStore: null,
});

let resultNoStore = null;
try {
  resultNoStore = await providerNoStore.retrieve({
    query: { primary: "test query", continuity: "" },
    mode: {},
  });
} catch {
  // swallow
}
ok("no store: retrieve returns empty array (not undefined)", Array.isArray(resultNoStore));

// --- No query → returns [] immediately (no Qdrant call) ---
const resultNoQuery = await provider.retrieve({ query: {}, mode: {} });
ok("empty query → returns []", Array.isArray(resultNoQuery) && resultNoQuery.length === 0);

console.log(`\n[verify:memory-retrieval-db-fallback] ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
