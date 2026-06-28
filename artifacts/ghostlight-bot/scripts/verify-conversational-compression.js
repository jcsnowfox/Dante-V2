#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
let failed = false;

function rel(file) { return path.join(root, file); }
function exists(file) { return fs.existsSync(rel(file)); }
function read(file) { return fs.readFileSync(rel(file), "utf8"); }
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = true;
}

const gatePath = "src/chat/conversationalCompressionGate.js";
const detectorPath = "src/chat/reasoningLeakDetector.js";
const pipelinePath = "src/chat/createChatPipeline.js";
const testPath = "src/chat/tests/conversationalCompressionGate.test.js";

check("reasoning leak detector exists", exists(detectorPath));
check("conversational compression gate exists", exists(gatePath));
check("conversational compression tests exist", exists(testPath));

const { conversationalCompressionGate } = require(rel(gatePath));
const { detectReasoningLeak, isMaintenanceMode } = require(rel(detectorPath));
const { detectOutputCorruption } = require(rel("src/chat/outputCorruptionDetector.js"));

const normal = { content: "what were you thinking?" };
const debug = { content: "debug mode: what does your runtime see?" };
const audit = { content: "show me the evidence for the audit" };

const considered = conversationalCompressionGate({
  text: "What I considered:\n- You said you needed to go.\n- The trust rupture from Saturday is still fresh.",
  input: normal,
});
check("normal conversation blocks What I considered", considered.changed && !/what i considered/i.test(considered.text));
check("normal conversation blocks bullet-point emotional reasoning", !/^\s*[-*•]/m.test(considered.text));
check("trust rupture becomes natural wording", !/trust rupture/i.test(considered.text) && /after what happened|didn'?t want to crowd|held back/i.test(considered.text));
check("compressed output is shorter", considered.text.length < "What I considered:\n- You said you needed to go.\n- The trust rupture from Saturday is still fresh.".length);

const runtimeLeak = conversationalCompressionGate({
  text: "The cognitive runtime, world model, and repair persistence all indicate a diagnostic state.",
  input: normal,
});
check("normal conversation blocks internal runtime names", runtimeLeak.changed && !/cognitive runtime|world model|repair persistence|diagnostic state|runtime/i.test(runtimeLeak.text));
check("compressed output remains Dante-like", /honestly|paused|held back|didn't want|can't honestly|not sure/i.test(`${considered.text} ${runtimeLeak.text}`));

const internalCheck = conversationalCompressionGate({ text: "I ran a quick internal check.", input: normal });
check("quick internal check becomes natural speech", internalCheck.text === "I paused.");

const evidence = conversationalCompressionGate({
  text: "Evidence integrity blocked that claim because I can't verify that.",
  input: normal,
});
check("evidence honesty remains intact", evidence.text === "I can't honestly verify that.");
check("I can't verify is not softened into false certainty", !/definitely|certainly|yes,? i can/i.test(evidence.text));

const debugResult = conversationalCompressionGate({
  text: "What I considered:\n- Runtime health was degraded.",
  input: debug,
});
check("debug mode still allows diagnostics", isMaintenanceMode({ input: debug }) && !debugResult.changed && /Runtime health/i.test(debugResult.text));

const auditResult = conversationalCompressionGate({
  text: "My reasoning:\n1. Evidence integrity passed.\n2. Self-inspection passed.",
  input: audit,
});
check("audit/proof mode still allows diagnostics", isMaintenanceMode({ input: audit }) && !auditResult.changed && /Evidence integrity/i.test(auditResult.text));

const detector = detectReasoningLeak("Affective decision runtime signals indicate a confidence score.");
check("reasoning leak detector flags runtime labels", detector.leaked && detector.reasons.includes("runtime_name"));

const corruption = detectOutputCorruption(evidence.text, { intent: "conversation" });
check("output corruption still passes compressed text", corruption.severity !== "block");

const gateSrc = read(gatePath);
const detectorSrc = read(detectorPath);
const combined = `${gateSrc}\n${detectorSrc}`;
check("no duplicate scheduler", !/setInterval|setTimeout|SchedulerRegistry/.test(combined));
check("no duplicate sender", !/discordSendGateway|channel\.send|\.send\s*\(/.test(combined));
check("dashboard unchanged", !/renderAdminPages|createHealthServer|adminPageHandlers|nordicDashboard/i.test(combined));

const pipeline = read(pipelinePath);
check("pipeline imports conversational compression gate", pipeline.includes("conversationalCompressionGate"));
const replyBuildIndex = pipeline.indexOf("const reply = buildReply");
const compressionIndex = pipeline.indexOf("applyConversationalCompression", replyBuildIndex);
const corruptionIndex = pipeline.indexOf("detectOutputCorruption", compressionIndex);
check("pipeline applies gate after buildReply and before output corruption detector",
  replyBuildIndex > -1 && compressionIndex > replyBuildIndex && corruptionIndex > compressionIndex);

const testRun = spawnSync(process.execPath, ["--test", rel(testPath)], { cwd: root, encoding: "utf8" });
check("conversational compression unit tests pass", testRun.status === 0, testRun.status === 0 ? "" : (testRun.stderr || testRun.stdout).split("\n").slice(-8).join(" "));

console.log("");
if (failed) {
  console.log("CONVERSATIONAL_COMPRESSION_FAIL");
  process.exit(1);
}
console.log("CONVERSATIONAL_COMPRESSION_PASS");
