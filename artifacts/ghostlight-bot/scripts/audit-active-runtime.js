"use strict";
/**
 * audit-active-runtime.js
 * Verifies active runtime path, entrypoint, key wiring points.
 * Read-only — no side effects.
 */

const path = require("node:path");
const fs = require("node:fs");

const SRC = path.resolve(__dirname, "../src");

function exists(rel) { return fs.existsSync(path.join(SRC, rel)); }
function contains(rel, str) {
  try { return fs.readFileSync(path.join(SRC, rel), "utf8").includes(str); } catch { return false; }
}

const checks = [
  { name: "Active runtime path", value: SRC, pass: fs.existsSync(SRC) },
  { name: "Entrypoint: index.js", value: "src/index.js", pass: exists("index.js") },
  { name: "Discord inbound: messageCreate.js", value: "src/bot/events/messageCreate.js", pass: exists("bot/events/messageCreate.js") },
  { name: "Chat pipeline: createChatPipeline.js", value: "src/chat/createChatPipeline.js", pass: exists("chat/createChatPipeline.js") },
  { name: "Alive context injected into pipeline", value: "buildAliveContextPrelude in createChatPipeline.js", pass: contains("chat/createChatPipeline.js", "buildAliveContextPrelude") },
  { name: "Backbone injected into pipeline", value: "checkBackbone in createChatPipeline.js", pass: contains("chat/createChatPipeline.js", "checkBackbone") },
  { name: "Post-message alive update", value: "alivePostUpdate in createChatPipeline.js", pass: contains("chat/createChatPipeline.js", "alivePostUpdate") },
  { name: "Scheduler registry: schedulerRegistry.js", value: "src/runtime/schedulerRegistry.js", pass: exists("runtime/schedulerRegistry.js") },
  { name: "Scheduler registry used in index.js", value: "createSchedulerRegistry in index.js", pass: contains("index.js", "createSchedulerRegistry") },
  { name: "Scheduler post-login start in index.js", value: "startPostLogin in index.js", pass: contains("index.js", "startPostLogin") },
  { name: "Discord outbound sender: runCheckInAutomation", value: "automations/runners.js", pass: exists("automations/runners.js") && contains("automations/runners.js", "runCheckInAutomation") },
  { name: "Alive executor uses runCheckInAutomation", value: "alive/aliveExecutor.js", pass: contains("alive/aliveExecutor.js", "runCheckInAutomation") },
  { name: "Media tools: generate_image", value: "tools/mediaTools.js", pass: contains("tools/mediaTools.js", "generate_image") },
  { name: "Media tools: generate_audio", value: "tools/mediaTools.js", pass: contains("tools/mediaTools.js", "generate_audio") },
  { name: "Dashboard route: /api/ghostlight/alive/status", value: "createHealthServer.js", pass: contains("http/createHealthServer.js", "/api/ghostlight/alive/status") },
  { name: "Life barrel: src/life/index.js", value: "src/life/index.js", pass: exists("life/index.js") },
  { name: "Life barrel exports createAliveEngine", value: "life/index.js", pass: contains("life/index.js", "createAliveEngine") },
  { name: "alivePresenceStore.init in index.js", value: "alivePresenceStore.init in index.js", pass: contains("index.js", "alivePresenceStore.init") },
  { name: "Root src/ exception documented", value: "root src/ contains active cognition modules documented as non-Ghostlight runtime", pass: !fs.existsSync(path.resolve(__dirname, "../../../src")) || fs.existsSync(path.resolve(__dirname, "../../../src/cognition/evidenceLedger.js")) },
  { name: "Alive engine disabled by default", value: "=== true guard in aliveEngine.js", pass: contains("alive/aliveEngine.js", '=== true') && !contains("alive/aliveEngine.js", '!== false') },
];

let failures = 0;
console.log("AUDIT_ACTIVE_RUNTIME_START");
console.log(`activeRuntimePath=${SRC}\n`);

for (const { name, value, pass } of checks) {
  const icon = pass ? "✓" : "✗";
  console.log(`  ${icon} ${name}`);
  if (!pass) {
    console.log(`    EXPECTED: ${value}`);
    failures++;
  }
}

console.log(`\n${failures === 0 ? "AUDIT_PASS" : `AUDIT_FAIL (${failures} failures)`}`);
process.exit(failures === 0 ? 0 : 1);
