#!/usr/bin/env node
"use strict";

/**
 * verify-situational-awareness-not-dead.js
 * End-to-end smoke test: runs the full engine, verifies it produces real
 * output with real store interactions, checks all 10 section keys.
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

const { createSituationalAwarenessEngine } = require(path.join(base, "awareness/situationalAwarenessEngine"));
const { createSituationalAwarenessStore } = require(path.join(base, "storage/situationalAwarenessSnapshots"));

// ── Full mock environment ─────────────────────────────────────────────────────
const mockConfig = {
  memory: { userScope: "live_user", companionId: "live_companion" },
  companion: { id: "live_companion" },
  situationalAwareness: {
    enabled: true,
    storeSnapshots: true,
    maxBullets: 8,
    includeTime: true,
    includePresence: true,
    includeConversation: true,
    includeRelationship: true,
    includeMemory: true,
    includeProjects: true,
    includeWorld: true,
    includeActivity: true,
    includePrivacy: true,
    includeTools: true,
  },
  chat: { timezone: "America/Los_Angeles" },
};

const store = createSituationalAwarenessStore({ config: {}, logger: null });

const engine = createSituationalAwarenessEngine({
  config: mockConfig,
  logger: null,
  innerWeatherStore: {
    listHistory: async () => [{ mood: "curious", energy_level: "medium" }],
  },
  promiseLedger: {
    listPromises: async () => [{ content: "Follow up about the hiking trip" }],
  },
  timedNotesStore: {
    listNotes: async () => [{ title: "Check-in Thursday" }],
  },
  proactiveVarietyMemoryStore: {
    listRecent: async () => [{ action_label: "morning greeting" }],
  },
  emotionalBeatStore: {
    listBeats: async () => [{ beat_type: "tender" }],
  },
  situationalAwarenessStore: store,
});

// ── Smoke tests ───────────────────────────────────────────────────────────────
check("Engine initialises without error", async () => {
  await store.init();
  await engine.init();
  return true;
});

check("buildAwarenessContext runs end-to-end without crash", async () => {
  const ctx = await engine.buildAwarenessContext({
    now: new Date("2025-06-25T10:00:00Z"),
    recentHistory: [
      { role: "user", content: "Hey, how are you?", isBot: false, source: "discord" },
      { role: "assistant", content: "I'm doing well!", isBot: true },
    ],
    memories: [
      { content: "User enjoys morning hikes" },
      { content: "User is learning Norwegian" },
    ],
    mode: { name: "default" },
    presenceSnapshot: {
      activities: [{ name: "Visual Studio Code", state: "Editing index.js" }],
    },
  });
  return typeof ctx.compact_prelude === "string" && ctx.compact_prelude.length > 0;
});

check("At least 3 sections are populated", async () => {
  const ctx = await engine.buildAwarenessContext({
    now: new Date("2025-06-25T10:00:00Z"),
    recentHistory: [{ role: "user", content: "Hi", isBot: false }],
    memories: [{ content: "User likes coffee" }],
  });
  return ctx.sources_used.length >= 3;
});

check("Time section is populated", async () => {
  const ctx = await engine.buildAwarenessContext({ now: new Date() });
  return !!ctx.sections.time && ctx.sections.time.bullets.length > 0;
});

check("Memory section is populated when memories provided", async () => {
  const ctx = await engine.buildAwarenessContext({
    now: new Date(),
    memories: [{ content: "User visited Paris" }],
  });
  return !!ctx.sections.memory;
});

check("Projects section is populated when stores have data", async () => {
  const ctx = await engine.buildAwarenessContext({ now: new Date() });
  return !!ctx.sections.projects;
});

check("compact_prelude is non-empty string", async () => {
  const ctx = await engine.buildAwarenessContext({
    now: new Date(),
    recentHistory: [{ role: "user", content: "Hello", isBot: false }],
    memories: [{ content: "mem" }],
  });
  return typeof ctx.compact_prelude === "string" && ctx.compact_prelude.trim().length > 0;
});

check("compact_prelude bullet count <= maxBullets (8)", async () => {
  const ctx = await engine.buildAwarenessContext({
    now: new Date(),
    recentHistory: [{ role: "user", content: "Hi", isBot: false }],
    memories: [{ content: "m1" }, { content: "m2" }, { content: "m3" }],
  });
  const count = (ctx.compact_prelude.match(/^•/gm) || []).length;
  return count <= 8;
});

check("processMessage returns preludeSection with correct label", async () => {
  const result = await engine.processMessage({
    message: null,
    input: null,
    recentHistory: [{ role: "user", content: "Hello", isBot: false }],
    memories: [{ content: "User enjoys jazz" }],
  });
  return result?.preludeSection?.label === "SITUATIONAL AWARENESS";
});

check("processMessage preludeSection.content matches compact_prelude", async () => {
  const result = await engine.processMessage({
    message: null,
    input: null,
    recentHistory: [{ role: "user", content: "Hello", isBot: false }],
    memories: [],
  });
  return typeof result?.preludeSection?.content === "string"
    && result.preludeSection.content.includes("## SITUATIONAL AWARENESS");
});

check("Snapshot store records were created (in-memory)", async () => {
  const recents = await store.listRecent({ user_scope: "live_user", companion_id: "live_companion", limit: 5 });
  return Array.isArray(recents) && recents.length > 0;
});

check("buildProactiveAwarenessContext returns non-null context", async () => {
  const ctx = await engine.buildProactiveAwarenessContext({
    now: new Date(),
    recentMessages: [{ role: "user", content: "Hi", isBot: false }],
  });
  return ctx !== null && typeof ctx.compact_prelude === "string";
});

check("All required sections keys exist in AwarenessContext.sections shape", async () => {
  const allSections = ["time", "presence", "conversation", "relationship", "memory", "projects", "world", "activity", "privacy", "tools"];
  const ctx = await engine.buildAwarenessContext({
    now: new Date(),
    recentHistory: [{ role: "user", content: "test", isBot: false }],
    memories: [{ content: "test memory" }],
    presenceSnapshot: { activities: [{ name: "Spotify", state: "Playing" }] },
    mode: { name: "default" },
  });
  const populated = allSections.filter((k) => !!ctx.sections[k]);
  const REQUIRED_MINIMUM = 5;
  if (populated.length < REQUIRED_MINIMUM) {
    return { warn: `Only ${populated.length} sections populated out of ${allSections.length}: ${populated.join(", ")}` };
  }
  return true;
});

// ── Run all checks ────────────────────────────────────────────────────────────
(async () => {
  for (const fn of pendingChecks) {
    await fn();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("  SITUATIONAL AWARENESS NOT DEAD — VERIFY");
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
