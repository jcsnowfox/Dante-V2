"use strict";
/**
 * verify-life-wiring.js
 * Proves all life systems are wired into the active runtime.
 * Read-only — no side effects, no real Discord/Postgres calls.
 */

const path = require("node:path");
const fs = require("node:fs");

const SRC = path.resolve(__dirname, "../src");
const INDEX = path.join(SRC, "index.js");

function exists(rel) { return fs.existsSync(path.join(SRC, rel)); }
function indexContains(str) {
  try { return fs.readFileSync(INDEX, "utf8").includes(str); } catch { return false; }
}
function fileContains(rel, str) {
  try { return fs.readFileSync(path.join(SRC, rel), "utf8").includes(str); } catch { return false; }
}

const checks = [
  // ── Files exist ─────────────────────────────────────────────────────────
  ["alive/aliveEngine.js exists",         exists("alive/aliveEngine.js")],
  ["alive/alivePresenceStore.js exists",  exists("alive/alivePresenceStore.js")],
  ["alive/aliveExecutor.js exists",       exists("alive/aliveExecutor.js")],
  ["alive/alivePostUpdate.js exists",     exists("alive/alivePostUpdate.js")],
  ["alive/aliveContextBuilder.js exists", exists("alive/aliveContextBuilder.js")],
  ["alive/backbonePolicy.js exists",      exists("alive/backbonePolicy.js")],
  ["innerLife/innerLifeEngine.js exists", exists("innerLife/innerLifeEngine.js")],
  ["continuity/continuityEngine.js exists", exists("continuity/continuityEngine.js")],
  ["humanSimulation/humanSimulationEngine.js exists", exists("humanSimulation/humanSimulationEngine.js")],
  ["lifeEngine/index.js exists",          exists("lifeEngine/index.js")],
  ["companionSystems/emotionalArc/ exists", exists("companionSystems/emotionalArc")],
  ["companionSystems/feedbackLearning/ exists", exists("companionSystems/feedbackLearning")],
  ["companionSystems/relationalState/ exists", exists("companionSystems/relationalState")],
  ["life/index.js barrel exists",         exists("life/index.js")],
  ["runtime/schedulerRegistry.js exists", exists("runtime/schedulerRegistry.js")],

  // ── index.js wiring ─────────────────────────────────────────────────────
  ["index.js imports createAliveEngine",         indexContains("createAliveEngine")],
  ["index.js imports createAlivePresenceStore",  indexContains("createAlivePresenceStore")],
  ["index.js imports createInnerLifeEngine",     indexContains("createInnerLifeEngine")],
  ["index.js imports createContinuityEngine",    indexContains("createContinuityEngine")],
  ["index.js imports createHumanSimulationEngine", indexContains("createHumanSimulationEngine")],
  ["index.js imports createLifeEngine",          indexContains("createLifeEngine")],
  ["index.js imports createEmotionalArcEngine",  indexContains("createEmotionalArcEngine")],
  ["index.js calls alivePresenceStore.init",     indexContains("alivePresenceStore.init")],
  ["index.js starts aliveEngine via schedulerRegistry", indexContains("aliveEngine") && indexContains("registerBackground")],
  ["index.js starts automationRunner via registry", indexContains("automationRunner") && indexContains("registerPostLogin")],
  ["index.js starts heartbeat via registry",     indexContains("heartbeat") && indexContains("registerPostLogin")],
  ["index.js calls schedulerRegistry.startPostLogin", indexContains("startPostLogin")],
  ["index.js exposes schedulerRegistry in appContext", indexContains("appContext.schedulerRegistry")],

  // ── Pipeline wiring ─────────────────────────────────────────────────────
  ["createChatPipeline.js accepts alivePresenceStore", fileContains("chat/createChatPipeline.js", "alivePresenceStore")],
  ["createChatPipeline.js injects buildAliveContextPrelude", fileContains("chat/createChatPipeline.js", "buildAliveContextPrelude")],
  ["createChatPipeline.js injects checkBackbone",   fileContains("chat/createChatPipeline.js", "checkBackbone")],
  ["createChatPipeline.js fires alivePostUpdate",   fileContains("chat/createChatPipeline.js", "alivePostUpdate")],
  ["createChatPipeline.js accepts innerLife",        fileContains("chat/createChatPipeline.js", "innerLife")],
  ["createChatPipeline.js accepts continuity",       fileContains("chat/createChatPipeline.js", "continuity")],
  ["createChatPipeline.js accepts humanSimulation",  fileContains("chat/createChatPipeline.js", "humanSimulation")],
  ["createChatPipeline.js accepts emotionalArc",     fileContains("chat/createChatPipeline.js", "emotionalArc")],

  // ── Safety ──────────────────────────────────────────────────────────────
  ["alive engine disabled by default (=== true guard)", fileContains("alive/aliveEngine.js", '=== true')],
  ["alive executor requires ALIVE_UNPROMPTED_ENABLED", fileContains("alive/aliveExecutor.js", "ALIVE_UNPROMPTED_ENABLED")],
  ["alive executor requires ALIVE_TARGET_CHANNEL_ID", fileContains("alive/aliveExecutor.js", "ALIVE_TARGET_CHANNEL_ID")],
  ["executor uses runCheckInAutomation (not channel.send)", fileContains("alive/aliveExecutor.js", "runCheckInAutomation")],

  // ── Life barrel re-exports ───────────────────────────────────────────────
  ["life/index.js re-exports createAliveEngine",     fileContains("life/index.js", "createAliveEngine")],
  ["life/index.js re-exports createInnerLifeEngine",  fileContains("life/index.js", "createInnerLifeEngine")],
  ["life/index.js re-exports createContinuityEngine", fileContains("life/index.js", "createContinuityEngine")],
  ["life/index.js re-exports createHumanSimulationEngine", fileContains("life/index.js", "createHumanSimulationEngine")],
];

let failures = 0;
console.log("VERIFY_LIFE_WIRING_START\n");

for (const [name, pass] of checks) {
  const icon = pass ? "✓" : "✗";
  console.log(`  ${icon} ${name}`);
  if (!pass) failures++;
}

console.log(`\n${failures === 0 ? "LIFE_WIRING_PASS" : `LIFE_WIRING_FAIL (${failures} failures)`}`);
process.exit(failures === 0 ? 0 : 1);
