/**
 * Verify: Privacy rules for the Continuity & Inner Life dashboard.
 * - Adult/private entries are not exposed in normal admin view
 * - No API keys or secrets are exposed
 * - Raw adult message content is never logged in decisions
 * - Private adult memory is not shown in the dashboard
 */
import assert from "node:assert/strict";

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

const { renderContinuityInnerLifePage } = await import("../src/http/renderAdminPages/continuityInnerLifePage.js");
const { createRecentDecisionStore } = await import("../src/storage/recentDecisions.js");

const mockHelpers = {
  escapeHtml: (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  buildAdminLocation: ({ path }) => path,
  withThemeField: () => "",
};

// --- Privacy: Adult emotional beats not shown in State of Us ---
test("state-of-us hides adult beats from normal view", () => {
  const data = {
    emotionalBeats: [
      { event_type: "adult_fantasy", title: "PRIVATE ADULT CONTENT XYZ", importance: "high", resolved: false, adult_context: true },
      { event_type: "normal_event", title: "Regular memory", importance: "medium", resolved: false, adult_context: false },
    ],
    weatherHistory: [], innerLifeEntries: [], continuityItems: [], promises: [], decisions: [], followUps: [],
    innerWeatherCurrent: null, recentDecisionsCount: 0, followUpsOpen: 0, continuityOpen: 0, innerLifeActive: 0, emotionalBeatsCount: 2,
  };
  const html = renderContinuityInnerLifePage({ tab: "state-of-us", data, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(!html.includes("PRIVATE ADULT CONTENT XYZ"), "adult beat title must not appear in state-of-us");
  assert.ok(html.includes("Regular memory"), "normal beats should still appear");
});

// --- Privacy: Adult decisions not shown when include_adult=false (storage level) ---
test("recentDecisionStore filters adult decisions by default", async () => {
  const store = createRecentDecisionStore({});
  await store.init();
  await store.logDecision({ user_scope: "privtest", companion_id: "Dante", decision_type: "private_redirect", decision_summary: "PRIVATE ADULT REDIRECT", adult_context: true, privacy_scope: "adult_private" });
  const list = await store.listDecisions({ user_scope: "privtest", companion_id: "Dante", include_adult: false });
  assert.ok(list.every((d) => !d.adult_context), "adult decisions must be hidden when include_adult=false");
  assert.ok(!list.some((d) => d.decision_summary === "PRIVATE ADULT REDIRECT"), "private adult summary must not appear");
});

// --- Privacy: Handler uses include_adult: false for decisions ---
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const __here = dirname(fileURLToPath(import.meta.url));
const handlerSource = readFileSync(resolve(__here, "../src/http/adminPageHandlers/continuityInnerLifePageHandler.js"), "utf8");

test("handler passes include_adult: false to listDecisions", () => {
  assert.ok(handlerSource.includes("include_adult: false"), "handler must request non-adult decisions");
});

test("handler passes allowAdultPrivate: false to listPromises", () => {
  assert.ok(handlerSource.includes("allowAdultPrivate: false"), "handler must not expose adult promises");
});

// --- Privacy: No API keys in rendered HTML ---
test("rendered dashboard does not expose API key patterns", () => {
  const data = {
    weatherHistory: [], innerLifeEntries: [], continuityItems: [], promises: [], decisions: [], followUps: [], emotionalBeats: [],
    innerWeatherCurrent: null, recentDecisionsCount: 0, followUpsOpen: 0, continuityOpen: 0, innerLifeActive: 0, emotionalBeatsCount: 0,
  };
  const configWithKeys = { llm: { apiKey: "sk-secret-key-12345" }, qdrant: { apiKey: "qdrant-secret-abc" } };
  for (const tab of ["overview", "diagnostics"]) {
    const html = renderContinuityInnerLifePage({ tab, data, config: configWithKeys, helpers: mockHelpers, theme: "light" });
    assert.ok(!html.includes("sk-secret-key-12345"), `${tab} tab must not expose LLM API key`);
    assert.ok(!html.includes("qdrant-secret-abc"), `${tab} tab must not expose Qdrant API key`);
  }
});

// --- Privacy: logDecision in pipeline does not log adult message content ---
const pipelineSource = readFileSync(resolve(__here, "../src/chat/createChatPipeline.js"), "utf8");

test("pipeline logDecision never passes raw message content", () => {
  // Extract only the lines where logDecision is actually called (not the helper definition itself)
  const lines = pipelineSource.split("\n");
  const callLines = lines.filter((l) => l.includes("logDecision(") && !l.includes("const logDecision") && !l.includes("recentDecisionStore?.logDecision"));
  const forbidden = ["input.content", "message.content", "reply.content", "modelOutput.text"];
  for (const line of callLines) {
    for (const bad of forbidden) {
      assert.ok(!line.includes(bad), `logDecision call must not log raw content (${bad}): ${line.trim()}`);
    }
  }
});

test("pipeline logDecision marks adult_context from adultScope not from message content", () => {
  assert.ok(pipelineSource.includes("extra.adultContext || false"), "should use passed adultContext flag, not content");
});

// --- Privacy: Continuity page renderer HTML-escapes all user content ---
test("render escapes HTML in decision summaries", () => {
  const data = {
    decisions: [{ decision_type: "other", decision_summary: '<script>alert("xss")</script>', reason_summary: "test", privacy_scope: "normal", adult_context: false, created_at: new Date().toISOString() }],
    weatherHistory: [], innerLifeEntries: [], continuityItems: [], promises: [], followUps: [], emotionalBeats: [],
    innerWeatherCurrent: null, recentDecisionsCount: 1, followUpsOpen: 0, continuityOpen: 0, innerLifeActive: 0, emotionalBeatsCount: 0,
  };
  const html = renderContinuityInnerLifePage({ tab: "recent-decisions", data, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(!html.includes('<script>alert("xss")</script>'), "must escape HTML in decision summaries");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
