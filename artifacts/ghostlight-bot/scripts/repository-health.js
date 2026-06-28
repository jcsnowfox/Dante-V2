"use strict";
/**
 * repository-health.js
 * Single-pass read-only health report for the entire repository.
 * Covers runtime, dashboard, alive, scheduler, media, Discord, storage, and dead code.
 * No side effects — exits 0 on PASS, 1 on FAIL.
 */

const path = require("node:path");
const fs = require("node:fs");

const SRC = path.resolve(__dirname, "../src");
const REPO_ROOT = path.resolve(__dirname, "../../..");

function exists(rel) { return fs.existsSync(path.join(SRC, rel)); }
function read(rel) {
  try { return fs.readFileSync(path.join(SRC, rel), "utf8"); } catch { return ""; }
}
function contains(rel, str) { return read(rel).includes(str); }

let failures = 0;
const sections = [];

function section(label, checks) {
  sections.push({ label, checks });
}

function check(name, pass) {
  return { name, pass };
}

// ── 1. Active runtime path ────────────────────────────────────────────────────
section("Runtime: core files", [
  check("src/index.js exists",                 exists("index.js")),
  check("src/bot/events/messageCreate.js",     exists("bot/events/messageCreate.js")),
  check("src/chat/createChatPipeline.js",      exists("chat/createChatPipeline.js")),
  check("src/automations/runners.js",          exists("automations/runners.js")),
  check("src/runtime/schedulerRegistry.js",    exists("runtime/schedulerRegistry.js")),
  check("src/life/index.js (barrel)",          exists("life/index.js")),
]);

// ── 2. Runtime wiring ─────────────────────────────────────────────────────────
section("Runtime: wiring in index.js", [
  check("index.js imports createSchedulerRegistry", contains("index.js", "createSchedulerRegistry")),
  check("index.js calls startPostLogin",            contains("index.js", "startPostLogin")),
  check("index.js calls alivePresenceStore.init",   contains("index.js", "alivePresenceStore.init")),
  check("index.js imports createAliveEngine",       contains("index.js", "createAliveEngine")),
  check("index.js imports createInnerLifeEngine",   contains("index.js", "createInnerLifeEngine")),
  check("index.js imports createContinuityEngine",  contains("index.js", "createContinuityEngine")),
  check("index.js imports createHumanSimulationEngine", contains("index.js", "createHumanSimulationEngine")),
]);

// ── 3. Pipeline wiring ────────────────────────────────────────────────────────
section("Runtime: pipeline context injection", [
  check("pipeline injects buildAliveContextPrelude", contains("chat/createChatPipeline.js", "buildAliveContextPrelude")),
  check("pipeline injects checkBackbone",            contains("chat/createChatPipeline.js", "checkBackbone")),
  check("pipeline fires alivePostUpdate",            contains("chat/createChatPipeline.js", "alivePostUpdate")),
  check("pipeline accepts innerLife",                contains("chat/createChatPipeline.js", "innerLife")),
  check("pipeline accepts continuity",               contains("chat/createChatPipeline.js", "continuity")),
  check("pipeline accepts humanSimulation",          contains("chat/createChatPipeline.js", "humanSimulation")),
  check("pipeline accepts emotionalArc",             contains("chat/createChatPipeline.js", "emotionalArc")),
]);

// ── 4. Alive layer ────────────────────────────────────────────────────────────
section("Alive layer: files and safety", [
  check("alive/aliveEngine.js",          exists("alive/aliveEngine.js")),
  check("alive/aliveExecutor.js",        exists("alive/aliveExecutor.js")),
  check("alive/alivePresenceStore.js",   exists("alive/alivePresenceStore.js")),
  check("alive/aliveEventsStore.js",     exists("alive/aliveEventsStore.js")),
  check("alive/intentionQueueStore.js",  exists("alive/intentionQueueStore.js")),
  check("alive/aliveContextBuilder.js",  exists("alive/aliveContextBuilder.js")),
  check("alive/alivePostUpdate.js",      exists("alive/alivePostUpdate.js")),
  check("alive/backbonePolicy.js",       exists("alive/backbonePolicy.js")),
  check("alive disabled by default (=== true guard)", contains("alive/aliveEngine.js", "=== true")),
  check("executor uses runCheckInAutomation",         contains("alive/aliveExecutor.js", "runCheckInAutomation")),
  check("executor requires ALIVE_UNPROMPTED_ENABLED", contains("alive/aliveExecutor.js", "ALIVE_UNPROMPTED_ENABLED")),
]);

// ── 5. Scheduler ──────────────────────────────────────────────────────────────
section("Scheduler: registry", [
  check("registerBackground function exists", contains("runtime/schedulerRegistry.js", "registerBackground")),
  check("registerPostLogin function exists",  contains("runtime/schedulerRegistry.js", "registerPostLogin")),
  check("startBackground function exists",    contains("runtime/schedulerRegistry.js", "startBackground")),
  check("startPostLogin function exists",     contains("runtime/schedulerRegistry.js", "startPostLogin")),
  check("status function exists",             contains("runtime/schedulerRegistry.js", "status")),
]);

// ── 6. Dashboard health ───────────────────────────────────────────────────────
const HEALTH_SERVER = path.join(SRC, "http/createHealthServer.js");
const serverContent = (() => { try { return fs.readFileSync(HEALTH_SERVER, "utf8"); } catch { return ""; } })();

const HANDLERS = path.join(SRC, "http/adminPageHandlers");
function handlerExists(name) { return fs.existsSync(path.join(HANDLERS, name)); }

section("Dashboard: routes and handlers", [
  check("/admin/ route present",                   serverContent.includes("/admin/") || serverContent.includes("homePageHandler")),
  check("/admin/alive route present",              serverContent.includes("/admin/alive")),
  check("/api/ghostlight/alive/status present",    serverContent.includes("/api/ghostlight/alive/status")),
  check("/admin/continuity route present",         serverContent.includes("/admin/continuity")),
  check("/admin/norwegian route present",          serverContent.includes("/admin/norwegian")),
  check("homePageHandler.js exists",               handlerExists("homePageHandler.js")),
  check("alivePageHandler.js exists",              handlerExists("alivePageHandler.js")),
  check("aliveStatusHandler.js exists",            handlerExists("aliveStatusHandler.js")),
  check("continuityPageHandler.js exists",         handlerExists("continuityPageHandler.js")),
  check("dashboard does not call aliveEngine.start()", !serverContent.includes("aliveEngine.start()")),
]);

// ── 7. Media tools ────────────────────────────────────────────────────────────
section("Media: tools and generators", [
  check("tools/mediaTools.js exists",             exists("tools/mediaTools.js")),
  check("generate_image tool registered",         contains("tools/mediaTools.js", "generate_image")),
  check("generate_audio tool registered",         contains("tools/mediaTools.js", "generate_audio")),
  check("images/generateImage.js exists",         exists("images/generateImage.js")),
  check("audio/generateAudio.js exists",          exists("audio/generateAudio.js")),
]);

// ── 8. Discord inbound ────────────────────────────────────────────────────────
section("Discord: inbound and client", [
  check("bot/createDiscordClient.js exists",       exists("bot/createDiscordClient.js")),
  check("bot/registerEventHandlers.js exists",     exists("bot/registerEventHandlers.js")),
  check("bot/events/messageCreate.js exists",      exists("bot/events/messageCreate.js")),
]);

// ── 9. Storage ────────────────────────────────────────────────────────────────
section("Storage: schema guard and pool", [
  check("storage/postgres/runSchemaGuard.js",      exists("storage/postgres/runSchemaGuard.js")),
  check("storage/postgres/schemaRegistry.js",      exists("storage/postgres/schemaRegistry.js")),
  check("storage/postgres/createPostgresPool.js",  exists("storage/postgres/createPostgresPool.js")),
  check("schemaRegistry has ≥80 tables (CREATE TABLE)", (() => {
    const c = read("storage/postgres/schemaRegistry.js");
    return (c.match(/CREATE TABLE IF NOT EXISTS/gi) || []).length >= 80;
  })()),
]);

// ── 10. Dead root src/ directory ──────────────────────────────────────────────
const deadRootSrc = path.resolve(REPO_ROOT, "src");
section("Dead code", [
  check("Root src/ removed", !fs.existsSync(deadRootSrc)),
  check("scripts/src/ is empty or removed", (() => {
    const scriptsSrc = path.resolve(REPO_ROOT, "scripts/src");
    if (!fs.existsSync(scriptsSrc)) return true;
    const files = fs.readdirSync(scriptsSrc).filter(f => !f.startsWith("."));
    return files.length === 0;
  })()),
]);

// ── Render ────────────────────────────────────────────────────────────────────
console.log("REPOSITORY_HEALTH_START\n");

for (const { label, checks } of sections) {
  console.log(`── ${label} ──`);
  for (const { name, pass } of checks) {
    const icon = pass ? "✓" : "✗";
    console.log(`  ${icon} ${name}`);
    if (!pass) failures++;
  }
  console.log();
}

const verdict = failures === 0 ? "REPOSITORY_HEALTH_PASS" : `REPOSITORY_HEALTH_FAIL (${failures} failures)`;
console.log(verdict);
process.exit(failures === 0 ? 0 : 1);
