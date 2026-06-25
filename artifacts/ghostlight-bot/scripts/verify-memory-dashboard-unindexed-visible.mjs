#!/usr/bin/env node
/**
 * verify-memory-dashboard-unindexed-visible.mjs
 * Verifies that the System Truth snapshot includes Qdrant configuration fields,
 * and that runtimeState tracks qdrantLastError and qdrantLastSuccessfulSync.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { getSystemTruthSnapshot } = require(path.join(__dirname, "../src/systemTruth/snapshot.js"));
const { updateSystemTruth } = require(path.join(__dirname, "../src/systemTruth/runtimeState.js"));

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

console.log("\n[verify:memory-dashboard-unindexed-visible] System Truth Qdrant section\n");

const mockAppContext = {
  config: {
    nodeEnv: "test",
    memory: { userScope: "user:test", companionId: "dante" },
    qdrant: { url: "http://qdrant:6333", apiKey: "sk-test-key", collection: "ghostlight-memory" },
    chat: { promptBlocks: { personaName: "Dante" } },
    openai: {},
    llm: {},
    audio: {},
    images: {},
  },
  memoryStore: { available: true },
  generatedMemories: {},
};

// --- Snapshot before any runtime updates ---
const snap1 = getSystemTruthSnapshot({ appContext: mockAppContext });
ok("snapshot has qdrant section", "qdrant" in snap1);
ok("qdrant.qdrantEnabled=true when URL configured", snap1.qdrant.qdrantEnabled === true);
ok("qdrant.qdrantUrlConfigured=true", snap1.qdrant.qdrantUrlConfigured === true);
ok("qdrant.qdrantKeyConfigured=true", snap1.qdrant.qdrantKeyConfigured === true);
ok("qdrant.qdrantCollectionName='ghostlight-memory'", snap1.qdrant.qdrantCollectionName === "ghostlight-memory");
ok("qdrant.qdrantUrlSafe does not include full URL", !snap1.qdrant.qdrantUrlSafe.includes("6333"));
ok("qdrant.qdrantUrlSafe is not empty", snap1.qdrant.qdrantUrlSafe !== "not_configured" && snap1.qdrant.qdrantUrlSafe.length > 0);
ok("qdrant.qdrantConnected is 'unknown' initially", snap1.qdrant.qdrantConnected === "unknown");
ok("qdrant.qdrantLastCheck='never' initially", snap1.qdrant.qdrantLastCheck === "never");
ok("qdrant.qdrantLastError='none' initially", snap1.qdrant.qdrantLastError === "none");
ok("qdrant.qdrantLastSuccessfulSync='never' initially", snap1.qdrant.qdrantLastSuccessfulSync === "never");
ok("qdrant.qdrantIndexedCount='unknown' initially", snap1.qdrant.qdrantIndexedCount === "unknown");

// --- API key not exposed in safe URL ---
ok("qdrantUrlSafe does not contain API key", !snap1.qdrant.qdrantUrlSafe.includes("sk-test-key"));

// --- No URL configured ---
const snapNoUrl = getSystemTruthSnapshot({
  appContext: { ...mockAppContext, config: { ...mockAppContext.config, qdrant: { url: "", collection: "ghostlight-memory" } } },
});
ok("no URL → qdrantEnabled=false", !snapNoUrl.qdrant.qdrantEnabled);
ok("no URL → qdrantUrlSafe='not_configured'", snapNoUrl.qdrant.qdrantUrlSafe === "not_configured");

// --- Runtime state updates are reflected ---
updateSystemTruth("memory", {
  qdrantConnected: true,
  qdrantLastSuccessfulSync: "2026-06-25T10:00:00.000Z",
  qdrantIndexedCount: 42,
  qdrantLastError: null,
});
const snap2 = getSystemTruthSnapshot({ appContext: mockAppContext });
ok("after sync: qdrantConnected=true", snap2.qdrant.qdrantConnected === true);
ok("after sync: qdrantLastSuccessfulSync updated", snap2.qdrant.qdrantLastSuccessfulSync === "2026-06-25T10:00:00.000Z");
ok("after sync: qdrantIndexedCount=42", snap2.qdrant.qdrantIndexedCount === 42);

// --- Error state reflected ---
updateSystemTruth("memory", {
  qdrantConnected: false,
  qdrantLastError: "Qdrant hostname could not be resolved [dns_failed]",
});
const snap3 = getSystemTruthSnapshot({ appContext: mockAppContext });
ok("after error: qdrantConnected=false", snap3.qdrant.qdrantConnected === false);
ok("after error: qdrantLastError set", typeof snap3.qdrant.qdrantLastError === "string" && snap3.qdrant.qdrantLastError.includes("dns_failed"));

console.log(`\n[verify:memory-dashboard-unindexed-visible] ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
