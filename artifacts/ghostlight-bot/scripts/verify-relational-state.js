#!/usr/bin/env node
/**
 * Relational State Engine — Full Verification
 *
 * Runs the in-memory proof harness (engine safety guarantees) and then verifies
 * the admin dashboard + chat pipeline wiring from source. No DATABASE_URL is
 * required — the harness uses an in-memory store.
 *
 * Run from artifacts/ghostlight-bot:  node scripts/verify-relational-state.js
 */

const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  \u2713  ${label}`);
  passed++;
}
function fail(label, err = "") {
  console.log(`  \u2717  ${label}${err ? `: ${err}` : ""}`);
  failed++;
}
function section(title) {
  console.log(`\n\u2500\u2500 ${title}`);
}
function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function fileHas(rel, needle) {
  try {
    return readFile(rel).includes(needle);
  } catch {
    return false;
  }
}

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
console.log("\u2551  RELATIONAL STATE ENGINE \u2014 VERIFY    \u2551");
console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");

const RS = "src/companionSystems/relationalState";
const { runVerification } = require(path.join(ROOT, RS, "relationalVerification.js"));

(async () => {
  // ─── 1. Engine safety harness (in-memory store) ─────────────────────────
  section("1. Engine safety guarantees (in-memory harness)");
  try {
    const result = await runVerification({ logger: mockLogger });
    for (const check of result.checks) {
      if (check.pass) pass(check.name);
      else fail(check.name, check.detail);
    }
  } catch (e) {
    fail("verification harness threw", e.stack || e.message);
  }

  // ─── 2. Admin dashboard wiring ──────────────────────────────────────────
  section("2. Admin dashboard wiring");
  {
    if (fileHas("src/http/renderAdminPages/shared.js", "/admin/relational-state")) pass("nav link added");
    else fail("nav link missing");

    if (fileHas("src/http/adminPageHandlers/shared.js", "relationalState")) pass("route state mapping added");
    else fail("route state mapping missing");

    if (fileHas("src/http/createHealthServer.js", "/admin/relational-state")) pass("GET route allowlisted");
    else fail("GET route not allowlisted");

    if (fileHas("src/http/adminPageHandlers.js", "handleRelationalStatePageRequest")) pass("page handler dispatched");
    else fail("page handler not dispatched");

    if (fileHas("src/http/renderAdminPages/relationalStatePage.js", "relational-state-save")) pass("render page + save form present");
    else fail("render page/save form missing");

    if (fileHas("src/http/createHealthServer.js", "handleRelationalStateActions")) pass("actions registered");
    else fail("actions not registered");

    if (fileHas("src/http/actions/relationalStateActions.js", "relational-state-save")) pass("save action present");
    else fail("save action missing");
  }

  // ─── 3. Chat pipeline + index.js wiring ─────────────────────────────────
  section("3. Chat pipeline & index.js wiring");
  {
    const pipe = "src/chat/createChatPipeline.js";
    if (fileHas(pipe, "relationalState") && fileHas(pipe, "relationalState.processMessage")) pass("pipeline calls relationalState.processMessage");
    else fail("pipeline missing relationalState.processMessage");

    if (fileHas("src/index.js", "createRelationalStateEngine") && fileHas("src/index.js", "relationalState.init"))
      pass("index.js constructs + inits the engine");
    else fail("index.js missing engine construct/init");

    if (fileHas("src/index.js", "relationalState,")) pass("index.js passes engine into pipeline + appContext");
    else fail("index.js missing engine wiring");
  }

  // ─── 4. Render the page end-to-end ──────────────────────────────────────
  section("4. Render page produces valid HTML");
  try {
    const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
    const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
    const html = helpers.renderRelationalStatePage({
      settings: { enabled: true, ownerEditable: true, active: true, config: { enabled: true, prelude_enabled: true } },
      state: { trustLevel: 5, closenessLevel: 5, distanceLevel: 0, repairNeeded: false },
      events: [{ eventType: "warmth", triggerSummary: "warmth(5)", createdAt: new Date().toISOString() }],
      desires: [{ desireType: "reconnect", intensity: 4, requiresPermission: true, status: "internal", createdAt: new Date().toISOString() }],
      repairs: [{ repairType: "direct_apology", resolved: false, createdAt: new Date().toISOString() }],
      auditEntries: [{ eventType: "expression:allowed", decision: "allowed", reason: "", createdAt: new Date().toISOString() }],
      companionId: "ghostlight",
      storeAvailable: true,
      theme: "light",
    });
    const checks = [
      ["save form", "relational-state-save"],
      ["state panel", "Trust"],
      ["desire row", "reconnect"],
      ["audit table", "expression:allowed"],
    ];
    for (const [name, needle] of checks) {
      if (html.includes(needle)) pass(`page renders ${name}`);
      else fail(`page missing ${name}`);
    }
  } catch (e) {
    fail("render page threw", e.message);
  }

  // ─── 5. Documentation ───────────────────────────────────────────────────
  section("5. Documentation");
  {
    for (const doc of [
      "docs/RELATIONAL_STATE_ENGINE_PLAN.md",
      "docs/RELATIONAL_STATE_ENGINE.md",
      "docs/RELATIONAL_STATE_VERIFICATION.md",
    ]) {
      if (fs.existsSync(path.join(ROOT, doc))) pass(`${doc} present`);
      else fail(`${doc} missing`);
    }
  }

  // ─── Verdict ────────────────────────────────────────────────────────────
  console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log(`  PASSED:   ${passed}`);
  console.log(`  FAILED:   ${failed}`);
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  if (failed > 0) console.log("  VERDICT:  \u274c NO GO");
  else console.log("  VERDICT:  \u2705 PASS");
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
})();
