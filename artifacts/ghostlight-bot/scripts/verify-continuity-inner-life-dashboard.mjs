/**
 * Verify: The Continuity & Inner Life dashboard renderer
 * exports the correct function and renders expected tab content.
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

const mockHelpers = {
  escapeHtml: (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  buildAdminLocation: ({ path }) => path,
  withThemeField: () => "",
  formatDateValue: (v) => v || "—",
};

const mockData = {
  innerWeatherCurrent: { mood: "calm", energy_level: 7, weather_summary: "Quiet morning" },
  weatherHistory: [
    { mood: "calm", energy_level: 7, weather_summary: "Quiet", recorded_at: "2026-06-25T10:00:00Z" },
  ],
  innerLifeEntries: [
    { entry_type: "unsent_thought", title: "I wanted to say...", status: "active", created_at: "2026-06-25T09:00:00Z" },
    { entry_type: "almost_said", title: "Almost mentioned the flowers", status: "active", created_at: "2026-06-25T09:30:00Z" },
  ],
  continuityItems: [
    { type: "open_loop", summary: "Trip to Oslo", status: "open", updated_at: "2026-06-25T08:00:00Z" },
  ],
  promises: [],
  decisions: [
    { decision_type: "reply_tone_selected", decision_summary: "Tone: warm", reason_summary: "rankedBeats", privacy_scope: "normal", adult_context: false, created_at: "2026-06-25T10:05:00Z" },
  ],
  followUps: [
    { follow_up_type: "check_in", reason_summary: "She mentioned dentist appt", status: "open", due_at: "2026-06-26T09:00:00Z", created_at: "2026-06-25T08:30:00Z" },
  ],
  emotionalBeats: [
    { event_type: "proposal", title: "She said yes", importance: "critical", resolved: false, adult_context: false, updated_at: "2026-06-25T07:00:00Z" },
  ],
  recentDecisionsCount: 1,
  followUpsOpen: 1,
  continuityOpen: 1,
  innerLifeActive: 2,
  emotionalBeatsCount: 1,
};

test("renderContinuityInnerLifePage is a function", () => {
  assert.equal(typeof renderContinuityInnerLifePage, "function");
});

// Overview tab
test("overview tab renders stats", () => {
  const html = renderContinuityInnerLifePage({ tab: "overview", data: mockData, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(html.includes("Continuity &amp; Inner Life") || html.includes("Continuity & Inner Life"), "should have title");
  assert.ok(html.includes("1"), "should show counts");
});

// Inner weather tab
test("inner-weather tab renders history table", () => {
  const html = renderContinuityInnerLifePage({ tab: "inner-weather", data: mockData, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(html.includes("Inner Weather"), "should have section title");
  assert.ok(html.includes("calm"), "should render mood from history");
});

// Continuity tab
test("continuity tab renders items", () => {
  const html = renderContinuityInnerLifePage({ tab: "continuity", data: mockData, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(html.includes("Continuity"), "should have section title");
  assert.ok(html.includes("Open Loop") || html.includes("open_loop") || html.includes("Trip to Oslo") || html.includes("Oslo"), "should render continuity items");
});

// Recent decisions tab
test("recent-decisions tab renders log", () => {
  const html = renderContinuityInnerLifePage({ tab: "recent-decisions", data: mockData, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(html.includes("Recent Decisions"), "should have section title");
  assert.ok(html.includes("Tone Selected") || html.includes("reply_tone_selected"), "should show decision type");
});

// Unsent thoughts tab
test("unsent-thoughts tab filters inner life entries", () => {
  const html = renderContinuityInnerLifePage({ tab: "unsent-thoughts", data: mockData, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(html.includes("Unsent Thoughts"), "should have section title");
  assert.ok(html.includes("Unsent Thought") || html.includes("unsent_thought"), "should render unsent thought entry");
});

// Follow-ups tab
test("follow-ups tab renders follow-up items", () => {
  const html = renderContinuityInnerLifePage({ tab: "follow-ups", data: mockData, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(html.includes("Follow-Ups"), "should have section title");
  assert.ok(html.includes("check_in") || html.includes("dentist"), "should render follow-up reason");
});

// State of us tab
test("state-of-us tab renders emotional beats", () => {
  const html = renderContinuityInnerLifePage({ tab: "state-of-us", data: mockData, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(html.includes("State of Us"), "should have section title");
  assert.ok(html.includes("proposal") || html.includes("She said yes"), "should render emotional beat");
});

// Diagnostics tab
test("diagnostics tab renders config info", () => {
  const html = renderContinuityInnerLifePage({ tab: "diagnostics", data: mockData, config: { inner_life: { enabled: true } }, helpers: mockHelpers, theme: "light" });
  assert.ok(html.includes("Diagnostics"), "should have section title");
  assert.ok(html.includes("Enabled") || html.includes("Disabled"), "should render engine status");
});

// Default tab fallback
test("unknown tab falls back to overview", () => {
  const html = renderContinuityInnerLifePage({ tab: "unknown-xyz", data: mockData, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(html.includes("Continuity"), "should fall back to overview");
});

// Privacy: adult entries filtered from state-of-us
test("state-of-us tab does not render adult beats", () => {
  const adultData = { ...mockData, emotionalBeats: [
    { event_type: "adult_event", title: "Private adult content", importance: "high", resolved: false, adult_context: true, updated_at: "2026-06-25T06:00:00Z" },
  ] };
  const html = renderContinuityInnerLifePage({ tab: "state-of-us", data: adultData, config: {}, helpers: mockHelpers, theme: "light" });
  assert.ok(!html.includes("Private adult content"), "adult content must not appear in normal view");
});

// Subnav renders all 8 tabs
test("renders subnav with all 8 tabs", () => {
  const html = renderContinuityInnerLifePage({ tab: "overview", data: mockData, config: {}, helpers: mockHelpers, theme: "light" });
  const expectedTabs = ["Overview", "Inner Weather", "Continuity", "Recent Decisions", "Unsent Thoughts", "Follow-Ups", "State of Us", "Diagnostics"];
  for (const tabLabel of expectedTabs) {
    assert.ok(html.includes(tabLabel), `should render subnav tab: ${tabLabel}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
