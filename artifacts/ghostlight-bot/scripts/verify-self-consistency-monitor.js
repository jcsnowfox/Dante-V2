"use strict";

const assert = require("node:assert/strict");
const { createSelfConsistencyMonitor, evaluateSelfConsistency, SELF_CHECK_WARNING } = require("../src/lifeRuntime/selfConsistencyMonitor");
const { buildLifePrelude } = require("../src/lifeRuntime/lifePreludeBuilder");
const { createSchedulerRegistry } = require("../src/runtime/schedulerRegistry");

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

console.log("SELF_CONSISTENCY_VERIFY_START");

check("selfConsistencyMonitor active", () => {
  const monitor = createSelfConsistencyMonitor();
  assert.equal(monitor.getStatus().active, true);
});

check("self-confidence event logged", () => {
  const monitor = createSelfConsistencyMonitor();
  monitor.evaluate({ replyText: "Done, I fixed it." });
  assert.equal(monitor.getStatus().recentEvents[0].eventType, "self_confidence_low");
});

check("low confidence signal reaches prelude/status", () => {
  const monitor = createSelfConsistencyMonitor();
  monitor.evaluate({ replyText: "Done, I posted it." });
  assert.equal(monitor.getStatus().lastSignal.self_confidence, "low");
  const prelude = buildLifePrelude({ selfConsistencyContext: { preludeWarning: monitor.getPreludeWarning() } });
  assert.match(prelude.content, /Self-check: last response may have been inconsistent/);
});

check("claimed action without evidence is caught", () => {
  const result = evaluateSelfConsistency({ replyText: "Done, I saved it." });
  assert.equal(result.self_confidence, "low");
  assert.match(result.reason, /without evidence/i);
});

check("repetitive rhetorical pattern is medium confidence", () => {
  const result = evaluateSelfConsistency({
    replyText: "This is not a failure, this is a signal.",
    recentHistory: [{ role: "assistant", content: "This is not the end, this is the wiring showing itself." }],
  });
  assert.equal(result.self_confidence, "medium");
  assert.equal(result.recommended_action, "Switch to direct, embodied, specific speech.");
});

check("no duplicate scheduler", () => {
  const registry = createSchedulerRegistry();
  registry.registerPostLogin("lifeRuntime", () => {});
  const names = registry.status().map((entry) => entry.name);
  assert.equal(names.filter((name) => name === "lifeRuntime").length, 1);
});

check("no duplicate sender", () => {
  const code = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/lifeRuntime/selfConsistencyMonitor.js"), "utf8");
  assert.equal(/channel\.send|runCheckInAutomation|intentionQueue\.enqueue/.test(code), false);
});

if (failures > 0) {
  console.error("SELF_CONSISTENCY_VERIFY_FAIL");
  process.exit(1);
}
console.log("SELF_CONSISTENCY_VERIFY_PASS");
