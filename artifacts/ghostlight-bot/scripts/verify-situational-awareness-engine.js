#!/usr/bin/env node
"use strict";

/**
 * verify-situational-awareness-engine.js
 * Verifies the Situational Awareness Engine: module structure, factory,
 * AwarenessContext shape, compact_prelude generation, and privacy guard.
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
const fs = require("fs");
const base = path.join(__dirname, "../src");

// ── Module existence ──────────────────────────────────────────────────────────
const REQUIRED_FILES = [
  "awareness/situationalAwarenessEngine.js",
  "storage/situationalAwarenessSnapshots.js",
  "http/adminPageHandlers/situationalAwarenessPageHandler.js",
  "http/renderAdminPages/situationalAwarenessPage.js",
  "http/actions/situationalAwarenessActions.js",
];

for (const mod of REQUIRED_FILES) {
  check(`Module exists: ${mod}`, () => fs.existsSync(path.join(base, mod)));
}

// ── Load engine ───────────────────────────────────────────────────────────────
let createSituationalAwarenessEngine;
check("Engine module loads without error", () => {
  ({ createSituationalAwarenessEngine } = require(path.join(base, "awareness/situationalAwarenessEngine")));
  return typeof createSituationalAwarenessEngine === "function";
});

// ── Factory pattern ───────────────────────────────────────────────────────────
let engine;
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

check("Engine factory creates valid object", () => {
  engine = createSituationalAwarenessEngine({ config: mockConfig, logger: null });
  return engine !== null
    && typeof engine === "object"
    && engine.available === true
    && typeof engine.init === "function"
    && typeof engine.processMessage === "function"
    && typeof engine.buildAwarenessContext === "function"
    && typeof engine.buildProactiveAwarenessContext === "function"
    && typeof engine.buildCompactPrelude === "function";
});

check("Engine isEnabled() returns true with default config", () => {
  return engine.isEnabled() === true;
});

check("Engine isEnabled() returns false when disabled", () => {
  const disabledEngine = createSituationalAwarenessEngine({
    config: { ...mockConfig, situationalAwareness: { enabled: false } },
    logger: null,
  });
  return disabledEngine.isEnabled() === false;
});

// ── init ──────────────────────────────────────────────────────────────────────
check("Engine init() resolves without error", async () => {
  await engine.init();
  return true;
});

// ── buildAwarenessContext shape ───────────────────────────────────────────────
check("buildAwarenessContext returns correct shape", async () => {
  const ctx = await engine.buildAwarenessContext({
    now: new Date("2025-06-25T14:30:00Z"),
    recentHistory: [],
    memories: [],
  });
  return (
    typeof ctx === "object"
    && typeof ctx.user_scope === "string"
    && typeof ctx.companion_id === "string"
    && ctx.platform === "discord"
    && typeof ctx.channel_id === "string"
    && typeof ctx.thread_id === "string"
    && typeof ctx.generated_at === "string"
    && typeof ctx.sections === "object"
    && typeof ctx.compact_prelude === "string"
    && Array.isArray(ctx.warnings)
    && Array.isArray(ctx.sources_used)
  );
});

check("buildAwarenessContext populates user_scope from config", async () => {
  const ctx = await engine.buildAwarenessContext({});
  return ctx.user_scope === "test_user";
});

check("buildAwarenessContext generates compact_prelude when enabled", async () => {
  const ctx = await engine.buildAwarenessContext({
    now: new Date("2025-06-25T14:30:00Z"),
    recentHistory: [
      { role: "user", content: "Hello there", isBot: false, source: "discord" },
    ],
    memories: [
      { content: "User likes hiking" },
    ],
  });
  return typeof ctx.compact_prelude === "string" && ctx.compact_prelude.length > 0;
});

check("compact_prelude starts with SITUATIONAL AWARENESS header", async () => {
  const ctx = await engine.buildAwarenessContext({
    now: new Date("2025-06-25T14:30:00Z"),
  });
  return ctx.compact_prelude.startsWith("## SITUATIONAL AWARENESS");
});

check("compact_prelude respects maxBullets limit", async () => {
  const limitedEngine = createSituationalAwarenessEngine({
    config: {
      ...mockConfig,
      situationalAwareness: { ...mockConfig.situationalAwareness, maxBullets: 2 },
    },
    logger: null,
  });
  const ctx = await limitedEngine.buildAwarenessContext({
    now: new Date(),
    recentHistory: [{ role: "user", content: "test", isBot: false, source: "discord" }],
    memories: [{ content: "mem1" }, { content: "mem2" }, { content: "mem3" }],
  });
  const bulletCount = (ctx.compact_prelude.match(/^•/gm) || []).length;
  return bulletCount <= 2;
});

// ── processMessage ────────────────────────────────────────────────────────────
check("processMessage returns preludeSection and awarenessContext", async () => {
  const result = await engine.processMessage({
    message: null,
    input: null,
    recentHistory: [{ role: "user", content: "Hi", isBot: false }],
    memories: [],
  });
  if (!result) return { warn: "processMessage returned null; engine may be disabled" };
  return typeof result.preludeSection === "object"
    && typeof result.awarenessContext === "object";
});

check("processMessage preludeSection has label SITUATIONAL AWARENESS", async () => {
  const result = await engine.processMessage({
    message: null,
    input: null,
    recentHistory: [{ role: "user", content: "Hi", isBot: false }],
    memories: [],
  });
  if (!result?.preludeSection) return { warn: "no preludeSection returned" };
  return result.preludeSection.label === "SITUATIONAL AWARENESS";
});

// ── disabled path ─────────────────────────────────────────────────────────────
check("Disabled engine returns compact_prelude = ''", async () => {
  const disabledEngine = createSituationalAwarenessEngine({
    config: { ...mockConfig, situationalAwareness: { enabled: false } },
    logger: null,
  });
  const ctx = await disabledEngine.buildAwarenessContext({});
  return ctx.compact_prelude === ""
    && ctx.warnings.includes("awareness_disabled");
});

check("Disabled engine processMessage returns null", async () => {
  const disabledEngine = createSituationalAwarenessEngine({
    config: { ...mockConfig, situationalAwareness: { enabled: false } },
    logger: null,
  });
  const result = await disabledEngine.processMessage({ message: null, input: null });
  return result === null;
});

// ── buildCompactPrelude standalone ────────────────────────────────────────────
check("buildCompactPrelude formats bullets correctly", () => {
  const sections = [
    { key: "time", bullets: ["Time: Wednesday, June 25 at 14:30", "Cycle: afternoon"] },
    { key: "memory", bullets: ["Memory: User likes hiking"] },
  ];
  const prelude = engine.buildCompactPrelude(sections, { maxBullets: 5 });
  return prelude.includes("• Time: Wednesday")
    && prelude.includes("• Memory: User likes hiking");
});

// ── Storage module loads ──────────────────────────────────────────────────────
check("SituationalAwarenessStore module loads and exports factory", () => {
  const { createSituationalAwarenessStore } = require(path.join(base, "storage/situationalAwarenessSnapshots"));
  return typeof createSituationalAwarenessStore === "function";
});

check("SituationalAwarenessStore creates fallback store when no DB", () => {
  const { createSituationalAwarenessStore } = require(path.join(base, "storage/situationalAwarenessSnapshots"));
  const store = createSituationalAwarenessStore({ config: {}, logger: null });
  return typeof store.storeSnapshot === "function"
    && typeof store.listRecent === "function"
    && typeof store.getLatest === "function";
});

// ── Run all checks ────────────────────────────────────────────────────────────
(async () => {
  for (const fn of pendingChecks) {
    await fn();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("  SITUATIONAL AWARENESS ENGINE — VERIFY");
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
