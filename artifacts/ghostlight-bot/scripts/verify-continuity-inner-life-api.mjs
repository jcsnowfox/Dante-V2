/**
 * Verify: The merged Continuity & Inner Life page handler
 * fetches data from the correct stores and calls renderAdminShell correctly.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(() => {
        console.log(`  PASS  ${name}`);
        passed++;
      }).catch((err) => {
        console.error(`  FAIL  ${name}: ${err.message}`);
        failed++;
      });
    }
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

const promises = [];

const { handleContinuityInnerLifePageRequest } = await import("../src/http/adminPageHandlers/continuityInnerLifePageHandler.js");

function makeUrl(pathname, params = {}) {
  const u = new URL("http://localhost" + pathname);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

const baseHelpers = {
  getMessage: () => "",
  getError: () => "",
  renderAdminShell: () => "<html>",
  escapeHtml: (s) => String(s || ""),
  buildAdminLocation: ({ path }) => path,
  withThemeField: () => "",
};

function makeCtx(overrides = {}) {
  return {
    config: { memory: { userScope: "user" }, companion: { id: "Dante" } },
    innerLife: null,
    continuity: null,
    innerWeatherStore: { listHistory: async () => [] },
    promiseLedger: null,
    recentDecisionStore: { listDecisions: async () => [] },
    followUpStore: { listFollowUps: async () => [] },
    emotionalBeatStore: { listBeats: async () => [] },
    ...overrides,
  };
}

promises.push(test("handler calls renderAdminShell with currentSection=continuity", async () => {
  let capturedParams = null;
  const helpers = { ...baseHelpers, renderAdminShell: (p) => { capturedParams = p; return "<html>"; } };
  const innerRes = { end: () => {} };
  await handleContinuityInnerLifePageRequest({
    url: makeUrl("/admin/continuity/overview"),
    innerRes,
    innerContext: makeCtx(),
    helpers,
    theme: "light",
    themeLinks: null,
  });
  assert.equal(capturedParams?.currentSection, "continuity", "must use currentSection not section");
}));

promises.push(test("handler renders overview tab by default", async () => {
  let renderedBody = "";
  const helpers = { ...baseHelpers, renderAdminShell: (p) => { renderedBody = p.pageBody || ""; return "<html>"; } };
  const innerRes = { end: () => {} };
  await handleContinuityInnerLifePageRequest({
    url: makeUrl("/admin/continuity"),
    innerRes,
    innerContext: makeCtx(),
    helpers,
    theme: "light",
    themeLinks: null,
  });
  assert.ok(renderedBody.length > 0, "should render a page body");
}));

promises.push(test("handler fetches from innerWeatherStore", async () => {
  let called = false;
  const ctx = makeCtx({
    innerWeatherStore: { listHistory: async () => { called = true; return []; } },
  });
  const helpers = { ...baseHelpers };
  const innerRes = { end: () => {} };
  await handleContinuityInnerLifePageRequest({
    url: makeUrl("/admin/continuity/inner-weather"),
    innerRes,
    innerContext: ctx,
    helpers,
    theme: "light",
    themeLinks: null,
  });
  assert.ok(called, "should call innerWeatherStore.listHistory");
}));

promises.push(test("handler fetches from recentDecisionStore", async () => {
  let called = false;
  const ctx = makeCtx({
    recentDecisionStore: { listDecisions: async () => { called = true; return []; } },
  });
  const helpers = { ...baseHelpers };
  const innerRes = { end: () => {} };
  await handleContinuityInnerLifePageRequest({
    url: makeUrl("/admin/continuity/recent-decisions"),
    innerRes,
    innerContext: ctx,
    helpers,
    theme: "light",
    themeLinks: null,
  });
  assert.ok(called, "should call recentDecisionStore.listDecisions");
}));

promises.push(test("handler fetches from followUpStore", async () => {
  let called = false;
  const ctx = makeCtx({
    followUpStore: { listFollowUps: async () => { called = true; return []; } },
  });
  const helpers = { ...baseHelpers };
  const innerRes = { end: () => {} };
  await handleContinuityInnerLifePageRequest({
    url: makeUrl("/admin/continuity/follow-ups"),
    innerRes,
    innerContext: ctx,
    helpers,
    theme: "light",
    themeLinks: null,
  });
  assert.ok(called, "should call followUpStore.listFollowUps");
}));

promises.push(test("handler fetches from emotionalBeatStore", async () => {
  let called = false;
  const ctx = makeCtx({
    emotionalBeatStore: { listBeats: async () => { called = true; return []; } },
  });
  const helpers = { ...baseHelpers };
  const innerRes = { end: () => {} };
  await handleContinuityInnerLifePageRequest({
    url: makeUrl("/admin/continuity/state-of-us"),
    innerRes,
    innerContext: ctx,
    helpers,
    theme: "light",
    themeLinks: null,
  });
  assert.ok(called, "should call emotionalBeatStore.listBeats");
}));

promises.push(test("handler gracefully handles missing stores", async () => {
  const ctx = {
    config: { memory: { userScope: "user" }, companion: { id: "Dante" } },
    // All stores missing
  };
  const helpers = { ...baseHelpers };
  const innerRes = { end: () => {} };
  let threw = false;
  try {
    await handleContinuityInnerLifePageRequest({
      url: makeUrl("/admin/continuity/overview"),
      innerRes,
      innerContext: ctx,
      helpers,
      theme: "light",
      themeLinks: null,
    });
  } catch {
    threw = true;
  }
  assert.ok(!threw, "should not throw when stores are missing");
}));

await Promise.all(promises.filter(Boolean));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
