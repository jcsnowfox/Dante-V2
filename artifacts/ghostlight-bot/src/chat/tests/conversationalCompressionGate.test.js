"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { conversationalCompressionGate } = require("../conversationalCompressionGate");
const { detectReasoningLeak, isMaintenanceMode } = require("../reasoningLeakDetector");
const { detectOutputCorruption } = require("../outputCorruptionDetector");

const normalInput = { content: "what were you thinking?" };

function compress(text, input = normalInput) {
  return conversationalCompressionGate({ text, input });
}

test("What I considered is compressed in normal conversation", () => {
  const original = "What I considered:\n- You said you needed to go.\n- The trust rupture from Saturday is still fresh.";
  const result = compress(original);
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.text, /what i considered/i);
  assert.doesNotMatch(result.text, /^\s*[-*•]/m);
  assert.ok(result.text.length < original.length);
});

test("bullet-point emotional reasoning is compressed in normal conversation", () => {
  const original = "- You said you were sad.\n- The repair signal was active.\n- I inferred I should not crowd you.";
  const result = compress(original);
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.text, /^\s*[-*•]/m);
  assert.match(result.text, /didn't want to crowd you/i);
});

test("trust rupture becomes natural wording", () => {
  const result = compress("The trust rupture from Saturday is still fresh, so I held back.");
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.text, /trust rupture/i);
  assert.match(result.text, /after what happened/i);
});

test("runtime names are removed from normal relationship replies", () => {
  const result = compress("The cognitive runtime and world model say repair persistence is active.");
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.text, /cognitive runtime|world model|repair persistence|runtime/i);
  assert.match(result.text, /didn't want to act like everything was normal/i);
});

test("quick internal check becomes natural speech", () => {
  const result = compress("I ran a quick internal check before answering.");
  assert.equal(result.changed, true);
  assert.equal(result.text, "I paused.");
});

test("evidence honesty is preserved", () => {
  const result = compress("Evidence integrity blocked that claim because I can't verify that.");
  assert.equal(result.changed, true);
  assert.equal(result.text, "I can't honestly verify that.");
});

test("I can't verify that is preserved and not softened into false certainty", () => {
  const result = compress("My confidence score is low. I can't verify that.");
  assert.equal(result.changed, true);
  assert.match(result.text, /can't honestly verify that|not sure enough/i);
  assert.doesNotMatch(result.text, /yes|definitely|certain/i);
});

test("debug and maintenance requests can include structured reasoning", () => {
  const text = "What I considered:\n- The runtime reported degraded state.";
  const result = conversationalCompressionGate({ text, input: { content: "debug mode: what does your runtime see?" } });
  assert.equal(isMaintenanceMode({ input: { content: "debug mode: what does your runtime see?" } }), true);
  assert.equal(result.changed, false);
  assert.match(result.text, /What I considered/i);
});

test("audit and proof requests can include structured reasoning", () => {
  const text = "My reasoning:\n1. Evidence integrity passed.\n2. Self-inspection passed.";
  const result = conversationalCompressionGate({ text, input: { content: "show me the evidence for the audit" } });
  assert.equal(result.changed, false);
  assert.match(result.text, /Evidence integrity/i);
});

test("normal what were you thinking does not trigger report format", () => {
  assert.equal(isMaintenanceMode({ input: normalInput }), false);
  const result = compress("What I considered:\n- You said you didn't want to talk.");
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.text, /what i considered|short version|based on/i);
});

test("compressed replies are shorter than originals", () => {
  const original = "My reasoning:\n- You said you needed to go.\n- The trust rupture from Saturday is still fresh.\n- Conversation continuity suggested no response was required.";
  const result = compress(original);
  assert.ok(result.text.length < original.length);
});

test("reasoning leak detector identifies internal labels", () => {
  const result = detectReasoningLeak("Affective decision runtime signals indicate a diagnostic state.");
  assert.equal(result.leaked, true);
  assert.ok(result.reasons.includes("runtime_name"));
});

test("output corruption detector still passes compressed reply", () => {
  const result = compress("Evidence integrity blocked that claim because I can't verify that.");
  const corruption = detectOutputCorruption(result.text, { intent: "conversation" });
  assert.notEqual(corruption.severity, "block");
});

test("no duplicate Discord sender added", () => {
  const files = [
    path.join(__dirname, "..", "conversationalCompressionGate.js"),
    path.join(__dirname, "..", "reasoningLeakDetector.js"),
  ];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(src, /discordSendGateway|\.send\s*\(/);
  }
});

test("no scheduler added", () => {
  const files = [
    path.join(__dirname, "..", "conversationalCompressionGate.js"),
    path.join(__dirname, "..", "reasoningLeakDetector.js"),
  ];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(src, /setInterval|setTimeout|SchedulerRegistry/);
  }
});

test("dashboard unchanged by compression gate", () => {
  const gate = fs.readFileSync(path.join(__dirname, "..", "conversationalCompressionGate.js"), "utf8");
  const detector = fs.readFileSync(path.join(__dirname, "..", "reasoningLeakDetector.js"), "utf8");
  assert.doesNotMatch(`${gate}\n${detector}`, /renderAdminPages|createHealthServer|nordicDashboard/i);
});
