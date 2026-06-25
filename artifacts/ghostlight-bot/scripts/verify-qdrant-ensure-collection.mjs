#!/usr/bin/env node
/**
 * verify-qdrant-ensure-collection.mjs
 * Verifies that qdrantRequest / ensureCollection throws a classified,
 * human-readable error (not "fetch failed") when Qdrant is unreachable.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { ensureCollection } = require(path.join(__dirname, "../src/memory/qdrantClient.js"));

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

console.log("\n[verify:qdrant-ensure-collection] ensureCollection error classification\n");

// No URL → should throw with "QDRANT_URL is required"
let err1 = null;
try {
  await ensureCollection({ config: { qdrant: { url: "" } }, vectorSize: 1536 });
} catch (e) {
  err1 = e;
}
ok("no URL throws", err1 !== null);
ok("no URL error message includes 'QDRANT_URL is required'", String(err1?.message || "").includes("QDRANT_URL is required"));

// Bad URL (no protocol) → should throw classified error, not raw "fetch failed"
let err2 = null;
try {
  await ensureCollection({ config: { qdrant: { url: "qdrant:6333" } }, vectorSize: 1536 });
} catch (e) {
  err2 = e;
}
ok("bad URL (no protocol) throws", err2 !== null);
ok("bad URL error message does not say 'fetch failed'", !String(err2?.message || "").includes("fetch failed"));
ok("bad URL error message references URL validation", String(err2?.message || "").toLowerCase().includes("url"));

// Unreachable URL → classified error, not raw "fetch failed"
let err3 = null;
try {
  await ensureCollection({ config: { qdrant: { url: "http://127.0.0.1:19991" } }, vectorSize: 1536 });
} catch (e) {
  err3 = e;
}
ok("unreachable URL throws", err3 !== null);
ok("unreachable URL error is not raw 'fetch failed'", !String(err3?.message || "").match(/^fetch failed$/i));
ok("unreachable URL error message has human-readable content", String(err3?.message || "").length > 20);
ok("unreachable URL error message includes error reason code", String(err3?.message || "").includes("["));

console.log(`\n[verify:qdrant-ensure-collection] ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
