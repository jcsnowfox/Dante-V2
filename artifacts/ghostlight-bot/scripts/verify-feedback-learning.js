#!/usr/bin/env node
/**
 * Feedback & Learning Engine — Full Verification
 *
 * Runs the in-memory proof harness (engine safety guarantees) and then verifies
 * the admin dashboard + chat pipeline wiring from source. No DATABASE_URL is
 * required — the harness uses an in-memory store.
 *
 * Run from artifacts/ghostlight-bot:  node scripts/verify-feedback-learning.js
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
console.log("\u2551  FEEDBACK & LEARNING ENGINE \u2014 VERIFY   \u2551");
console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");

const FL = "src/companionSystems/feedbackLearning";
const { runVerification } = require(path.join(ROOT, FL, "feedbackVerification.js"));

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
    fail("verification harness threw", e.message);
  }

  // ─── 2. Admin dashboard wiring ──────────────────────────────────────────
  section("2. Admin dashboard wiring");
  {
    if (fileHas("src/http/renderAdminPages/shared.js", "/admin/feedback-learning")) pass("nav link added");
    else fail("nav link missing");

    if (fileHas("src/http/adminPageHandlers/shared.js", "feedbackLearning")) pass("route state mapping added");
    else fail("route state mapping missing");

    if (fileHas("src/http/createHealthServer.js", "/admin/feedback-learning")) pass("GET route allowlisted");
    else fail("GET route not allowlisted");

    if (fileHas("src/http/adminPageHandlers.js", "handleFeedbackLearningPageRequest")) pass("page handler dispatched");
    else fail("page handler not dispatched");

    if (fileHas("src/http/renderAdminPages/feedbackLearningPage.js", "feedback-learning-save")) pass("render page + save form present");
    else fail("render page/save form missing");

    if (fileHas("src/http/createHealthServer.js", "handleFeedbackLearningActions")) pass("actions registered");
    else fail("actions not registered");

    if (fileHas("src/http/actions/feedbackLearningActions.js", "feedback-learning-submit") &&
        fileHas("src/http/actions/feedbackLearningActions.js", "feedback-learning-proposal"))
      pass("submit + proposal actions present");
    else fail("submit/proposal actions missing");
  }

  // ─── 3. Chat pipeline + index.js wiring ─────────────────────────────────
  section("3. Chat pipeline & index.js wiring");
  {
    const pipe = "src/chat/createChatPipeline.js";
    if (fileHas(pipe, "feedbackLearning") && fileHas(pipe, "feedbackLearning.processMessage")) pass("pipeline calls feedbackLearning.processMessage");
    else fail("pipeline missing feedbackLearning.processMessage");

    if (fileHas("src/index.js", "createFeedbackLearningEngine") && fileHas("src/index.js", "feedbackLearning.init"))
      pass("index.js constructs + inits the engine");
    else fail("index.js missing engine construct/init");

    if (fileHas("src/index.js", "feedbackLearning,")) pass("index.js passes engine into pipeline + appContext");
    else fail("index.js missing engine wiring");
  }

  // ─── 4. Render the page end-to-end ──────────────────────────────────────
  section("4. Render page produces valid HTML");
  try {
    const { buildAdminPageHelpers } = require(path.join(ROOT, "src/http/adminRenderHelpers.js"));
    const helpers = buildAdminPageHelpers({ sortMemories: (x) => x, config: {} });
    const html = helpers.renderFeedbackLearningPage({
      settings: { enabled: true, ownerEditable: true, active: true, config: { enabled: true, feedback_buttons_enabled: true } },
      proposals: [{ proposalId: 1, summary: "Be more direct", proposalType: "communication_rule_update", targetSystem: "communication_intelligence", riskLevel: "low", status: "pending_review" }],
      events: [{ feedbackLabel: "More direct", feedbackText: "", createdAt: new Date().toISOString() }],
      auditEntries: [{ eventType: "feedback:recorded", decision: "accepted", reason: "", createdAt: new Date().toISOString() }],
      companionId: "ghostlight",
      storeAvailable: true,
      theme: "light",
    });
    const checks = [
      ["save form", "feedback-learning-save"],
      ["submit form", "feedback-learning-submit"],
      ["proposal form", "feedback-learning-proposal"],
      ["proposal row", "Be more direct"],
      ["audit table", "feedback:recorded"],
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
      "docs/FEEDBACK_LEARNING_ENGINE_PLAN.md",
      "docs/FEEDBACK_LEARNING_ENGINE.md",
      "docs/FEEDBACK_LEARNING_VERIFICATION.md",
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
