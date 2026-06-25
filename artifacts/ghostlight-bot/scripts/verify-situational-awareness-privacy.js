#!/usr/bin/env node
"use strict";

/**
 * verify-situational-awareness-privacy.js
 * Verifies that adult/private data never enters normal channel awareness,
 * and that web search does not run automatically.
 */

let pass = 0;
let warn = 0;
let fail = 0;
const results = [];
const pendingChecks = [];

function check(label, fn) {
  pendingChecks.push(async () => {
    try {
      let result = fn();
      if (result && typeof result.then === "function") {
        result = await result;
      }
      if (result === true) {
        pass++;
        results.push(`  ✓ PASS  ${label}`);
      } else if (result && result.warn) {
        warn++;
        results.push(`  ⚠ WARN  ${label} — ${result.warn}`);
      } else {
        fail++;
        results.push(`  ✗ FAIL  ${label} — ${JSON.stringify(result)}`);
      }
    } catch (err) {
      fail++;
      results.push(`  ✗ FAIL  ${label} — THREW: ${err.message}`);
    }
  });
}

const path = require("path");
const base = path.join(__dirname, "../src");

// ── Load engine ───────────────────────────────────────────────────────────────
const { createSituationalAwarenessEngine } = require(path.join(base, "awareness/situationalAwarenessEngine"));

const mockConfig = {
  memory: { userScope: "test_user", companionId: "test_companion" },
  companion: { id: "test_companion" },
  situationalAwareness: {
    enabled: true,
    storeSnapshots: false,
    maxBullets: 8,
    includeTime: true,
    includePresence: true,
    includeConversation: true,
    includeRelationship: true,
    includeMemory: true,
    includeProjects: true,
    includeWorld: false,
    includeActivity: true,
    includePrivacy: true,
    includeTools: false,
  },
  chat: { timezone: "UTC" },
};

// ── adult_private mode excludes relationship section ──────────────────────────
check("adult_private mode: relationship section is excluded from context", async () => {
  const engine = createSituationalAwarenessEngine({
    config: mockConfig,
    logger: null,
    innerWeatherStore: {
      listHistory: async () => [{ mood: "playful", energy_level: "high" }],
    },
  });
  const adultMode = { name: "adult_private" };
  const ctx = await engine.buildAwarenessContext({
    mode: adultMode,
    recentHistory: [],
    memories: [],
  });
  return !ctx.sections.relationship;
});

check("normal mode: relationship section can be present when store has data", async () => {
  const engine = createSituationalAwarenessEngine({
    config: mockConfig,
    logger: null,
    innerWeatherStore: {
      listHistory: async () => [{ mood: "thoughtful", energy_level: "medium" }],
    },
  });
  const normalMode = { name: "default" };
  const ctx = await engine.buildAwarenessContext({
    mode: normalMode,
    recentHistory: [],
    memories: [],
  });
  return !!ctx.sections.relationship;
});

// ── adult_private mode excludes projects/promises section ─────────────────────
check("adult_private mode: projects section is excluded from context", async () => {
  const engine = createSituationalAwarenessEngine({
    config: mockConfig,
    logger: null,
    promiseLedger: {
      listPromises: async () => [{ content: "Secret promise" }],
    },
    timedNotesStore: {
      listNotes: async () => [{ title: "Private note" }],
    },
  });
  const adultMode = { name: "adult_private" };
  const ctx = await engine.buildAwarenessContext({
    mode: adultMode,
    recentHistory: [],
    memories: [],
  });
  return !ctx.sections.projects;
});

// ── adult_private mode excludes activity section ──────────────────────────────
check("adult_private mode: activity section is excluded from context", async () => {
  const engine = createSituationalAwarenessEngine({
    config: mockConfig,
    logger: null,
    proactiveVarietyMemoryStore: {
      listRecent: async () => [{ action_label: "some action" }],
    },
    emotionalBeatStore: {
      listBeats: async () => [{ beat_type: "tender" }],
    },
  });
  const adultMode = { name: "adult_private" };
  const ctx = await engine.buildAwarenessContext({
    mode: adultMode,
    recentHistory: [],
    memories: [],
  });
  return !ctx.sections.activity;
});

// ── Privacy scope is reported correctly ───────────────────────────────────────
check("adult_private mode: privacy section reports 'adult_private' scope", async () => {
  const engine = createSituationalAwarenessEngine({ config: mockConfig, logger: null });
  const ctx = await engine.buildAwarenessContext({
    mode: { name: "adult_private" },
    recentHistory: [],
    memories: [],
  });
  const privacySection = ctx.sections.privacy;
  if (!privacySection) return { warn: "privacy section not found" };
  return privacySection.bullets.some((b) => b.includes("adult_private"));
});

check("normal mode: privacy section reports 'normal' scope", async () => {
  const engine = createSituationalAwarenessEngine({ config: mockConfig, logger: null });
  const ctx = await engine.buildAwarenessContext({
    mode: { name: "default" },
    recentHistory: [],
    memories: [],
  });
  const privacySection = ctx.sections.privacy;
  if (!privacySection) return { warn: "privacy section not found" };
  return privacySection.bullets.some((b) => b.includes("normal"));
});

// ── Web search does NOT run automatically ─────────────────────────────────────
check("Engine does not call web search tools automatically", async () => {
  let webSearchCalled = false;
  const mockTools = {
    list: () => [
      { name: "web_search" },
      { name: "web_browse" },
    ],
    execute: async (name) => {
      if (name === "web_search" || name === "web_browse") {
        webSearchCalled = true;
      }
      return {};
    },
  };
  const engine = createSituationalAwarenessEngine({
    config: {
      ...mockConfig,
      situationalAwareness: { ...mockConfig.situationalAwareness, includeTools: true },
    },
    logger: null,
  });
  await engine.buildAwarenessContext({
    tools: mockTools,
    recentHistory: [],
    memories: [],
  });
  return !webSearchCalled;
});

// ── Store snapshot skips when disabled ────────────────────────────────────────
check("Snapshot store is NOT called when storeSnapshots=false", async () => {
  let snapshotStoreCalled = false;
  const mockStore = {
    storeSnapshot: async () => { snapshotStoreCalled = true; return {}; },
    listRecent: async () => [],
    getLatest: async () => null,
  };
  const engine = createSituationalAwarenessEngine({
    config: {
      ...mockConfig,
      situationalAwareness: { ...mockConfig.situationalAwareness, storeSnapshots: false },
    },
    logger: null,
    situationalAwarenessStore: mockStore,
  });
  await engine.buildAwarenessContext({ recentHistory: [], memories: [] });
  return !snapshotStoreCalled;
});

check("Snapshot store IS called when storeSnapshots=true", async () => {
  let snapshotStoreCalled = false;
  const mockStore = {
    storeSnapshot: async () => { snapshotStoreCalled = true; return {}; },
    listRecent: async () => [],
    getLatest: async () => null,
  };
  const engine = createSituationalAwarenessEngine({
    config: {
      ...mockConfig,
      situationalAwareness: { ...mockConfig.situationalAwareness, storeSnapshots: true },
    },
    logger: null,
    situationalAwarenessStore: mockStore,
  });
  await engine.buildAwarenessContext({ recentHistory: [], memories: [] });
  return snapshotStoreCalled;
});

// ── Graceful failure of sub-stores ────────────────────────────────────────────
check("Engine handles store failures gracefully (warnings instead of crash)", async () => {
  const engine = createSituationalAwarenessEngine({
    config: mockConfig,
    logger: null,
    innerWeatherStore: {
      listHistory: async () => { throw new Error("DB is down"); },
    },
    promiseLedger: {
      listPromises: async () => { throw new Error("DB is down"); },
    },
  });
  let error = null;
  try {
    const ctx = await engine.buildAwarenessContext({ recentHistory: [], memories: [] });
    return typeof ctx.compact_prelude === "string";
  } catch (err) {
    error = err;
    return false;
  }
});

// ── Run all checks ────────────────────────────────────────────────────────────
(async () => {
  for (const fn of pendingChecks) {
    await fn();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("  SITUATIONAL AWARENESS PRIVACY — VERIFY");
  console.log("══════════════════════════════════════════════");
  for (const line of results) console.log(line);
  console.log("──────────────────────────────────────────────");
  console.log(`  PASS: ${pass}  WARN: ${warn}  FAIL: ${fail}`);
  console.log("══════════════════════════════════════════════\n");

  if (fail > 0) {
    console.log("RESULT: NO GO\n");
    process.exit(1);
  } else if (warn > 0) {
    console.log("RESULT: PASS WITH WARNINGS\n");
  } else {
    console.log("RESULT: PASS\n");
  }
})();
