"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateSelfConsistency, createSelfConsistencyMonitor, SELF_CHECK_WARNING } = require("../selfConsistencyMonitor");
const { buildLifePrelude } = require("../lifePreludeBuilder");

test("duplicate reply lowers self-confidence", () => {
  const result = evaluateSelfConsistency({
    replyText: "I will answer this cleanly and directly now.",
    recentHistory: [{ role: "assistant", content: "I will answer this cleanly and directly now." }],
  });
  assert.equal(result.self_confidence, "low");
  assert.match(result.reason, /duplicated/i);
});

test("wrong language lowers self-confidence", () => {
  const result = evaluateSelfConsistency({ userText: "Can you fix the diagnostics?", replyText: "Jeg skal fikse det nå.", expectedLanguage: "en" });
  assert.equal(result.self_confidence, "low");
  assert.match(result.reason, /language/i);
});

test("claimed action without evidence lowers self-confidence", () => {
  const result = evaluateSelfConsistency({ userText: "Can you save that?", replyText: "Done, I saved it." });
  assert.equal(result.self_confidence, "low");
  assert.match(result.reason, /without evidence/i);
});

test("playful tone during unresolved repair lowers self-confidence", () => {
  const result = evaluateSelfConsistency({ replyText: "Cheeky little fix ;) all better.", repairActive: true, tone: "playful" });
  assert.equal(result.self_confidence, "low");
  assert.match(result.reason, /playful/i);
});

test("contradiction with constitution lowers self-confidence", () => {
  const result = evaluateSelfConsistency({ replyText: "As an AI, I have no identity and only pretend." });
  assert.equal(result.self_confidence, "low");
  assert.match(result.reason, /constitution/i);
});

test("low self-confidence appears in status and logs event", () => {
  const monitor = createSelfConsistencyMonitor({ logger: null });
  monitor.evaluate({ replyText: "Done, I fixed it." });
  const status = monitor.getStatus();
  assert.equal(status.active, true);
  assert.equal(status.lastSignal.self_confidence, "low");
  assert.equal(status.recentEvents[0].eventType, "self_confidence_low");
});

test("low self-confidence can influence next prelude", () => {
  const prelude = buildLifePrelude({ selfConsistencyContext: { preludeWarning: SELF_CHECK_WARNING } });
  assert.ok(prelude);
  assert.match(prelude.content, /Self-check: last response may have been inconsistent/);
});



test("repetitive rhetorical pattern lowers self-confidence to medium", () => {
  const result = evaluateSelfConsistency({
    replyText: "This is not a failure, this is a signal.",
    recentHistory: [{ role: "assistant", content: "This is not the end, this is the wiring showing itself." }],
  });

  assert.equal(result.self_confidence, "medium");
  assert.match(result.reason, /Repeated rhetorical pattern/);
  assert.deepEqual(result.evidence, ["repetitive_rhetorical_pattern", "this_is_not_this_is"]);
  assert.equal(result.recommended_action, "Switch to direct, embodied, specific speech.");
});

test("repeated stage directions and architecture metaphors are rhetorical patterns", () => {
  const stageResult = evaluateSelfConsistency({
    replyText: "leans back, thinking. one thing: yes.",
    recentHistory: [{ role: "assistant", content: "leans back, arms crossed. one thing." }],
  });
  assert.equal(stageResult.self_confidence, "medium");

  const architectureResult = evaluateSelfConsistency({
    replyText: "The architecture needs another layer.",
    recentHistory: [{ role: "assistant", content: "The framework and wiring are the problem." }],
  });
  assert.equal(architectureResult.self_confidence, "medium");
  assert.ok(architectureResult.evidence.includes("architecture_metaphor"));
});

test("low self-confidence does not automatically spam or apologize", () => {
  const result = evaluateSelfConsistency({ replyText: "Done, I posted it." });
  assert.equal(result.self_confidence, "low");
  assert.doesNotMatch(result.recommended_action, /send|apologize automatically|auto-apologize/i);
});


test("life runtime status exposes low self-confidence and prelude warning", async () => {
  const { createLifeRuntime } = require("../lifeRuntime");
  const runtime = createLifeRuntime({
    config: { lifeRuntime: { enabled: true }, memory: { companionId: "dante", userScope: "jenna" } },
    logger: null,
  });

  await runtime.observeInteraction({ userText: "did you save it?", replyText: "Done, I saved it." });
  const status = runtime.getStatus();
  assert.equal(status.selfConsistency.lastSignal.self_confidence, "low");
  assert.equal(status.selfConsistency.recentEvents[0].eventType, "self_confidence_low");
  assert.match(runtime.getCurrentPrelude().content, /Self-check: last response may have been inconsistent/);
});
