/**
 * Verify: Decision logging is wired into createChatPipeline.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

const __here = dirname(fileURLToPath(import.meta.url));
const pipelineSource = readFileSync(resolve(__here, "../src/chat/createChatPipeline.js"), "utf8");

test("createChatPipeline accepts recentDecisionStore param", () => {
  assert.ok(pipelineSource.includes("recentDecisionStore = null"), "should have recentDecisionStore parameter");
});

test("logDecision helper is defined inside pipeline run", () => {
  assert.ok(pipelineSource.includes("const logDecision"), "should define logDecision helper");
});

test("tone selection logs a decision", () => {
  assert.ok(pipelineSource.includes("logDecision(\"reply_tone_selected\"") || pipelineSource.includes("logDecision('reply_tone_selected'"), "should log tone decision");
});

test("repair mode logs a decision", () => {
  assert.ok(pipelineSource.includes("logDecision(\"repair_mode_triggered\"") || pipelineSource.includes("logDecision('repair_mode_triggered'"), "should log repair decision");
});

test("web search logs a decision", () => {
  assert.ok(pipelineSource.includes("logDecision(\"web_search_used\"") || pipelineSource.includes("logDecision('web_search_used'"), "should log web search decision");
});

test("fallback logs a decision", () => {
  assert.ok(pipelineSource.includes("logDecision(\"fallback_used\"") || pipelineSource.includes("logDecision('fallback_used'"), "should log fallback decision");
});

test("logDecision is fire-and-forget (uses .catch())", () => {
  assert.ok(pipelineSource.includes(".catch(() => {})"), "logDecision should be fire-and-forget");
});

test("logDecision does NOT log raw message content", () => {
  const logDecisionCalls = pipelineSource.match(/logDecision\([^)]+\)/g) || [];
  const badPatterns = ["input.content", "message.content", "reply.content", "modelOutput.text"];
  for (const call of logDecisionCalls) {
    for (const bad of badPatterns) {
      assert.ok(!call.includes(bad), `logDecision must not log raw content: ${call}`);
    }
  }
});

test("logDecision handles adultContext from context, not content", () => {
  const lines = pipelineSource.split("\n").filter((l) => l.includes("logDecision"));
  assert.ok(lines.length > 0, "logDecision must be called");
  for (const line of lines) {
    assert.ok(!line.includes("adultSystemPromptPrefix"), "should not expose adult prompt content in decisions");
  }
});

// --- Verify createChatPipeline wiring in src/index.js ---
const indexSource = readFileSync(resolve(__here, "../src/index.js"), "utf8");

test("index.js imports createRecentDecisionStore", () => {
  assert.ok(indexSource.includes("createRecentDecisionStore"), "should import createRecentDecisionStore");
});

test("index.js creates recentDecisionStore", () => {
  assert.ok(indexSource.includes("createRecentDecisionStore({"), "should instantiate recentDecisionStore");
});

test("index.js inits recentDecisionStore at startup", () => {
  assert.ok(indexSource.includes("recentDecisionStore.init"), "should init recentDecisionStore");
});

test("index.js passes recentDecisionStore to createChatPipeline", () => {
  assert.ok(indexSource.includes("recentDecisionStore,"), "should pass to pipeline");
});

test("index.js includes recentDecisionStore in appContext", () => {
  const appCtxStart = indexSource.indexOf("const appContext = {");
  const appCtxEnd = indexSource.indexOf("client.appContext = {", appCtxStart);
  const appCtxSlice = indexSource.slice(appCtxStart, appCtxEnd);
  assert.ok(appCtxSlice.includes("recentDecisionStore"), "should be in appContext");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
