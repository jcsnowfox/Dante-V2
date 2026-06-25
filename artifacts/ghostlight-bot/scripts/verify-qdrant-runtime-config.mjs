#!/usr/bin/env node
/**
 * verify-qdrant-runtime-config.mjs
 * Verifies that qdrantClient exports validateQdrantUrl, classifyFetchError,
 * and checkQdrantHealth; and that config-based URL validation logic is correct.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const qdrantClient = require(path.join(__dirname, "../src/memory/qdrantClient.js"));

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

console.log("\n[verify:qdrant-runtime-config] Qdrant runtime config validation\n");

// --- exports ---
ok("validateQdrantUrl is exported", typeof qdrantClient.validateQdrantUrl === "function");
ok("classifyFetchError is exported", typeof qdrantClient.classifyFetchError === "function");
ok("checkQdrantHealth is exported", typeof qdrantClient.checkQdrantHealth === "function");
ok("normalizeBaseUrl is exported", typeof qdrantClient.normalizeBaseUrl === "function");

// --- validateQdrantUrl ---
const { validateQdrantUrl } = qdrantClient;
ok("empty string → invalid (empty)", !validateQdrantUrl("").valid);
ok("missing protocol → invalid (missing_protocol)", !validateQdrantUrl("qdrant:6333").valid && validateQdrantUrl("qdrant:6333").reason === "missing_protocol");
ok("bare hostname → invalid (missing_protocol)", !validateQdrantUrl("qdrant").valid);
ok("http:// URL → valid", validateQdrantUrl("http://qdrant:6333").valid);
ok("https:// URL → valid", validateQdrantUrl("https://qdrant.example.com").valid);
ok("Railway internal http://qdrant:6333 → valid", validateQdrantUrl("http://qdrant:6333").valid);

// --- classifyFetchError ---
const { classifyFetchError } = qdrantClient;
ok("classifies ENOTFOUND as dns_failed", classifyFetchError({ message: "fetch failed", cause: { code: "ENOTFOUND" } }) === "dns_failed");
ok("classifies ECONNREFUSED as connection_refused", classifyFetchError({ message: "fetch failed", cause: { code: "ECONNREFUSED" } }) === "connection_refused");
ok("classifies invalid URL as invalid_url", classifyFetchError({ message: "Invalid URL" }) === "invalid_url");
ok("classifies unknown as unknown_network_error", classifyFetchError({ message: "fetch failed" }) === "unknown_network_error");
ok("classifies timeout", classifyFetchError({ message: "timed out" }) === "timeout");

// --- checkQdrantHealth with empty URL ---
const healthEmpty = await qdrantClient.checkQdrantHealth({ config: { qdrant: { url: "" } } });
ok("no URL → enabled=false", !healthEmpty.enabled);
ok("no URL → urlConfigured=false", !healthEmpty.urlConfigured);
ok("no URL → reachable=false", !healthEmpty.reachable);
ok("no URL → safeErrorReason=qdrant_url_not_configured", healthEmpty.safeErrorReason === "qdrant_url_not_configured");

// --- checkQdrantHealth with invalid URL (no protocol) ---
const healthBadUrl = await qdrantClient.checkQdrantHealth({ config: { qdrant: { url: "qdrant:6333" } } });
ok("bad URL → reachable=false", !healthBadUrl.reachable);
ok("bad URL → safeErrorReason=url_missing_http_protocol", healthBadUrl.safeErrorReason === "url_missing_http_protocol");

// --- collectionName defaults ---
const healthWithCollection = await qdrantClient.checkQdrantHealth({ config: { qdrant: { url: "", collection: "my-collection" } } });
ok("collection name preserved", healthWithCollection.collectionName === "my-collection");
const healthDefaultCollection = await qdrantClient.checkQdrantHealth({ config: { qdrant: { url: "" } } });
ok("collection defaults to ghostlight-memory", healthDefaultCollection.collectionName === "ghostlight-memory");

console.log(`\n[verify:qdrant-runtime-config] ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
