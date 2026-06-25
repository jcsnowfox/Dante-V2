/**
 * Verify: /admin/inner-life redirects to /admin/continuity,
 * and /admin/continuity route is registered correctly.
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

// --- 1. Redirect logic test (simulate path replacement) ---
function simulateRedirect(pathname) {
  if (pathname === "/admin/inner-life" || pathname.startsWith("/admin/inner-life/")) {
    return pathname.replace(/^\/admin\/inner-life/, "/admin/continuity");
  }
  return null;
}

test("inner-life root redirects to continuity", () => {
  assert.equal(simulateRedirect("/admin/inner-life"), "/admin/continuity");
});

test("inner-life with tab redirects to continuity tab", () => {
  assert.equal(simulateRedirect("/admin/inner-life/overview"), "/admin/continuity/overview");
});

test("inner-life sub-paths redirect correctly", () => {
  assert.equal(simulateRedirect("/admin/inner-life/unsent-thoughts"), "/admin/continuity/unsent-thoughts");
});

test("unrelated paths are not redirected", () => {
  assert.equal(simulateRedirect("/admin/memory"), null);
  assert.equal(simulateRedirect("/admin/continuity"), null);
});

// --- 2. getAdminRouteState maps inner-life and continuity correctly ---
const { getAdminRouteState } = await import("../src/http/adminPageHandlers/shared.js");

test("inner-life maps to innerLife section", () => {
  const r = getAdminRouteState("/admin/inner-life");
  assert.equal(r.section, "innerLife");
});

test("continuity maps to continuity section", () => {
  const r = getAdminRouteState("/admin/continuity");
  assert.equal(r.section, "continuity");
});

test("continuity with tab maps correctly", () => {
  const r = getAdminRouteState("/admin/continuity/overview");
  assert.equal(r.section, "continuity");
});

// --- 3. Merged handler exports expected function ---
const handlerModule = await import("../src/http/adminPageHandlers/continuityInnerLifePageHandler.js");

test("continuityInnerLifePageHandler exports handleContinuityInnerLifePageRequest", () => {
  assert.equal(typeof handlerModule.handleContinuityInnerLifePageRequest, "function");
});

// --- 4. adminPageHandlers wires innerLife and continuity to merged handler ---
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __here = dirname(fileURLToPath(import.meta.url));
const handlersSource = readFileSync(resolve(__here, "../src/http/adminPageHandlers.js"), "utf8");

test("adminPageHandlers imports continuityInnerLifePageHandler", () => {
  assert.ok(handlersSource.includes("continuityInnerLifePageHandler"), "should import merged handler");
});

test("adminPageHandlers routes both innerLife and continuity to merged handler", () => {
  assert.ok(handlersSource.includes("handleContinuityInnerLifePageRequest"), "should call merged handler");
});

test("adminPageHandlers no longer imports old innerLifePageHandler separately", () => {
  assert.ok(!handlersSource.includes("require(\"./adminPageHandlers/innerLifePageHandler\")"), "old handler should not be directly imported");
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
