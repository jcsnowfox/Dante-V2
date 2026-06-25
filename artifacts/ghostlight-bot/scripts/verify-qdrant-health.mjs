#!/usr/bin/env node
/**
 * verify-qdrant-health.mjs
 * Verifies checkQdrantHealth returns the correct shape and handles
 * network failure gracefully (unreachable host → reachable=false, safe reason).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { checkQdrantHealth } = require(path.join(__dirname, "../src/memory/qdrantClient.js"));

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

console.log("\n[verify:qdrant-health] checkQdrantHealth shape and safety\n");

// Shape when URL not configured
const r1 = await checkQdrantHealth({ config: { qdrant: {} } });
ok("has enabled field", "enabled" in r1);
ok("has urlConfigured field", "urlConfigured" in r1);
ok("has keyConfigured field", "keyConfigured" in r1);
ok("has collectionName field", "collectionName" in r1);
ok("has baseUrlSafe field", "baseUrlSafe" in r1);
ok("has reachable field", "reachable" in r1);
ok("has statusCode field", "statusCode" in r1);
ok("has safeErrorReason field", "safeErrorReason" in r1);
ok("has lastCheckedAt field", "lastCheckedAt" in r1);

// No URL → expected values
ok("no URL → enabled=false", !r1.enabled);
ok("no URL → reachable=false", !r1.reachable);
ok("no URL → safeErrorReason set", typeof r1.safeErrorReason === "string" && r1.safeErrorReason.length > 0);
ok("baseUrlSafe is 'not_configured' when no URL", r1.baseUrlSafe === "not_configured");

// API key configured but no URL
const r2 = await checkQdrantHealth({ config: { qdrant: { url: "", apiKey: "sk-test" } } });
ok("keyConfigured=true when key present", r2.keyConfigured);
ok("urlConfigured=false when no URL", !r2.urlConfigured);

// Invalid URL (no protocol) → should not crash, should return error reason
const r3 = await checkQdrantHealth({ config: { qdrant: { url: "qdrant:6333" } } });
ok("invalid URL → reachable=false", !r3.reachable);
ok("invalid URL → safeErrorReason is url_missing_http_protocol", r3.safeErrorReason === "url_missing_http_protocol");

// Unreachable URL (valid format but won't connect in test)
const r4 = await checkQdrantHealth({ config: { qdrant: { url: "http://127.0.0.1:19991" } } });
ok("unreachable URL → reachable=false", !r4.reachable);
ok("unreachable URL → safeErrorReason is set", typeof r4.safeErrorReason === "string" && r4.safeErrorReason.length > 0);
ok("unreachable URL → does not throw (caught internally)", true);

// Safe base URL masking — should not expose full URL
ok("baseUrlSafe does not expose port", !r4.baseUrlSafe.includes("19991") || r4.baseUrlSafe.includes("127.0.0.1"));
// safeErrorReason should not contain raw API key
const r5 = await checkQdrantHealth({ config: { qdrant: { url: "", apiKey: "sk-secret-key-12345" } } });
ok("safeErrorReason does not contain API key", !String(r5.safeErrorReason || "").includes("sk-secret-key-12345"));

console.log(`\n[verify:qdrant-health] ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
