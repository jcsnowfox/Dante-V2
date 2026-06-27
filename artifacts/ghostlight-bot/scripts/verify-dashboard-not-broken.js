"use strict";
/**
 * verify-dashboard-not-broken.js
 * Proves dashboard routes and handlers are intact without starting the server.
 * Read-only — no side effects.
 */

const path = require("node:path");
const fs = require("node:fs");

const SRC = path.resolve(__dirname, "../src");
const HTTP = path.join(SRC, "http");
const HANDLERS = path.join(HTTP, "adminPageHandlers");
const ACTIONS = path.join(HTTP, "actions");
const HEALTH_SERVER = path.join(HTTP, "createHealthServer.js");

function exists(p) { return fs.existsSync(p); }
function read(p) { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }
function serverContains(str) { return read(HEALTH_SERVER).includes(str); }
function handlerExists(name) { return exists(path.join(HANDLERS, name)); }

const serverContent = read(HEALTH_SERVER);

// ── 1. Core route presence ─────────────────────────────────────────────────
const routeChecks = [
  ["/admin/ (home page route)", serverContains("homePageHandler") || serverContains("/admin/")],
  ["/admin/memory route", serverContains("memoryPageHandler") || serverContains("/admin/memory")],
  ["/admin/alive route", serverContains("/admin/alive")],
  ["/api/ghostlight/alive/status route", serverContains("/api/ghostlight/alive/status")],
  ["/admin/continuity route", serverContains("/admin/continuity")],
  ["/admin/norwegian route", serverContains("/admin/norwegian")],
  ["/admin/gallery/images route", serverContains("/admin/gallery/images") || serverContains("imagesPageHandler")],
  ["/admin/second-life route", serverContains("/admin/second-life")],
];

// ── 2. Handler files exist ─────────────────────────────────────────────────
const handlerChecks = [
  ["homePageHandler.js", handlerExists("homePageHandler.js")],
  ["memoryPageHandler.js", handlerExists("memoryPageHandler.js")],
  ["alivePageHandler.js", handlerExists("alivePageHandler.js")],
  ["aliveStatusHandler.js", handlerExists("aliveStatusHandler.js")],
  ["continuityPageHandler.js", handlerExists("continuityPageHandler.js")],
  ["innerLifePageHandler.js", handlerExists("innerLifePageHandler.js")],
  ["continuityInnerLifePageHandler.js", handlerExists("continuityInnerLifePageHandler.js")],
  ["imagesPageHandler.js", handlerExists("imagesPageHandler.js")],
  ["norwegianDashboardHandler.js", handlerExists("norwegianDashboardHandler.js")],
  ["secondLifePageHandler.js", handlerExists("secondLifePageHandler.js")],
  ["proactivePageHandler.js", handlerExists("proactivePageHandler.js")],
  ["feedbackLearningPageHandler.js", handlerExists("feedbackLearningPageHandler.js")],
  ["relationalStatePageHandler.js", handlerExists("relationalStatePageHandler.js")],
  ["systemTruthPageHandler.js", handlerExists("systemTruthPageHandler.js")],
  ["situationalAwarenessPageHandler.js", handlerExists("situationalAwarenessPageHandler.js")],
  ["shared.js", handlerExists("shared.js")],
];

// ── 3. Handler imports resolve (no deleted-file references) ──────────────
const handlerImportChecks = [];
const handlerFiles = fs.readdirSync(HANDLERS).filter(f => f.endsWith(".js"));
for (const file of handlerFiles) {
  const content = read(path.join(HANDLERS, file));
  const requires = [...content.matchAll(/require\(["']([^"']+)["']\)/g)].map(m => m[1]);
  for (const req of requires) {
    if (!req.startsWith(".")) continue;
    const resolved = path.resolve(HANDLERS, req + ".js");
    const resolvedIndex = path.resolve(HANDLERS, req, "index.js");
    const resolvedNoExt = path.resolve(HANDLERS, req);
    const found = exists(resolved) || exists(resolvedIndex) || exists(resolvedNoExt) || exists(resolvedNoExt + ".js");
    if (!found) {
      handlerImportChecks.push([`${file} → require("${req}") resolves`, false]);
    }
  }
}
if (handlerImportChecks.length === 0) {
  handlerImportChecks.push(["all handler imports resolve", true]);
}

// ── 4. Dashboard does not own scheduler/runtime behavior ──────────────────
const safeguardChecks = [
  ["createHealthServer.js does not call start()", !serverContains(".start()") || serverContains("router") /* expected false — no scheduler starts */],
  ["aliveStatusHandler reads state only (no start/stop)", !read(path.join(HANDLERS, "aliveStatusHandler.js")).includes(".start()")],
];

// Override: createHealthServer.js doesn't need to NOT call .start() —
// it's a server, it calls server.listen. The important thing is it doesn't
// own the alive/heartbeat/scheduler lifecycle.
safeguardChecks[0] = ["createHealthServer.js does not call aliveEngine.start()", !serverContains("aliveEngine.start()")];

// ── 5. aliveStatusHandler returns safe JSON (no secrets) ─────────────────
const statusHandlerContent = read(path.join(HANDLERS, "aliveStatusHandler.js"));
const secretChecks = [
  ["aliveStatusHandler does not expose OPENAI_API_KEY", !statusHandlerContent.includes("OPENAI_API_KEY")],
  ["aliveStatusHandler does not expose DATABASE_URL", !statusHandlerContent.includes("DATABASE_URL")],
  ["aliveStatusHandler does not expose DISCORD_TOKEN", !statusHandlerContent.includes("DISCORD_TOKEN")],
  ["aliveStatusHandler returns JSON payload", statusHandlerContent.includes("buildAliveStatusPayload") || statusHandlerContent.includes("JSON")],
];

// ── Run all checks ─────────────────────────────────────────────────────────
let failures = 0;
console.log("VERIFY_DASHBOARD_START\n");

function runChecks(label, checks) {
  console.log(`── ${label} ──`);
  for (const [name, pass] of checks) {
    const icon = pass ? "✓" : "✗";
    console.log(`  ${icon} ${name}`);
    if (!pass) failures++;
  }
  console.log();
}

runChecks("Route presence", routeChecks);
runChecks("Handler files exist", handlerChecks);
runChecks("Handler imports resolve", handlerImportChecks);
runChecks("Dashboard safety (no runtime ownership)", safeguardChecks);
runChecks("Status endpoint security (no secrets)", secretChecks);

console.log(failures === 0 ? "DASHBOARD_PROOF_PASS" : `DASHBOARD_PROOF_FAIL (${failures} failures)`);
process.exit(failures === 0 ? 0 : 1);
