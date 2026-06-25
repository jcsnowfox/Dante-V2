#!/usr/bin/env node
"use strict";

/**
 * verify-situational-awareness-runtime-wiring.js
 * Verifies the engine is wired into the chat pipeline, heartbeat, and
 * proactive action paths.
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

function readFile(relPath) {
  return fs.readFileSync(path.join(base, relPath), "utf8");
}

// ── index.js wiring ───────────────────────────────────────────────────────────
check("src/index.js imports createSituationalAwarenessEngine", () => {
  const src = readFile("index.js");
  return src.includes("createSituationalAwarenessEngine");
});

check("src/index.js imports createSituationalAwarenessStore", () => {
  const src = readFile("index.js");
  return src.includes("createSituationalAwarenessStore");
});

check("src/index.js creates situationalAwarenessEngine", () => {
  const src = readFile("index.js");
  return src.includes("situationalAwarenessEngine = createSituationalAwarenessEngine(") ||
         src.includes("situationalAwarenessEngine=createSituationalAwarenessEngine(");
});

check("src/index.js initialises situationalAwarenessEngine (runStartupStep)", () => {
  const src = readFile("index.js");
  return src.includes("situationalAwarenessEngine.init");
});

check("src/index.js passes situationalAwarenessEngine to chatPipeline", () => {
  const src = readFile("index.js");
  return src.includes("situationalAwarenessEngine,");
});

check("src/index.js passes situationalAwarenessEngine to heartbeat", () => {
  const src = readFile("index.js");
  return src.includes("situationalAwarenessEngine,");
});

check("src/index.js adds situationalAwarenessEngine to appContext", () => {
  const src = readFile("index.js");
  const appCtxIdx = src.indexOf("const appContext = {");
  if (appCtxIdx < 0) return false;
  const appCtxSection = src.slice(appCtxIdx, appCtxIdx + 4000);
  return appCtxSection.includes("situationalAwarenessEngine");
});

// ── createChatPipeline.js wiring ──────────────────────────────────────────────
check("createChatPipeline.js accepts situationalAwarenessEngine parameter", () => {
  const src = readFile("chat/createChatPipeline.js");
  return src.includes("situationalAwarenessEngine");
});

check("createChatPipeline.js calls engine.processMessage", () => {
  const src = readFile("chat/createChatPipeline.js");
  return src.includes("situationalAwarenessEngine.processMessage");
});

check("createChatPipeline.js injects preludeSection into contextSections", () => {
  const src = readFile("chat/createChatPipeline.js");
  return src.includes("awarenessResult?.preludeSection") || src.includes("awarenessResult.preludeSection");
});

// ── heartbeat/index.js wiring ─────────────────────────────────────────────────
check("heartbeat/index.js accepts situationalAwarenessEngine parameter", () => {
  const src = readFile("heartbeat/index.js");
  return src.includes("situationalAwarenessEngine");
});

check("heartbeat/index.js calls buildProactiveAwarenessContext", () => {
  const src = readFile("heartbeat/index.js");
  return src.includes("buildProactiveAwarenessContext");
});

check("heartbeat/index.js sets heartbeatContext.awarenessPrelude", () => {
  const src = readFile("heartbeat/index.js");
  return src.includes("awarenessPrelude");
});

// ── proactiveActions/index.js wiring ─────────────────────────────────────────
check("proactiveActions/index.js uses heartbeatContext.awarenessPrelude", () => {
  const src = readFile("proactiveActions/index.js");
  return src.includes("awarenessPrelude");
});

check("buildThreadHeartbeatContextText includes awarenessPrelude when set", async () => {
  const { buildThreadHeartbeatContextText } = require(path.join(base, "proactiveActions/index.js"));
  if (typeof buildThreadHeartbeatContextText !== "function") return false;
  const result = buildThreadHeartbeatContextText({
    currentLocalTime: "2025-06-25 14:30:00 UTC",
    awarenessPrelude: "## SITUATIONAL AWARENESS\n• Time: Wednesday | Season: summer",
  });
  return typeof result === "string" && result.includes("SITUATIONAL AWARENESS");
});

// ── storage/index.js exports ──────────────────────────────────────────────────
check("storage/index.js exports createSituationalAwarenessStore", () => {
  const src = readFile("storage/index.js");
  return src.includes("createSituationalAwarenessStore");
});

// ── config/env.js ─────────────────────────────────────────────────────────────
check("config/env.js defines situationalAwareness block", () => {
  const src = readFile("config/env.js");
  return src.includes("situationalAwareness:");
});

check("config/env.js has SITUATIONAL_AWARENESS_ENABLED", () => {
  const src = readFile("config/env.js");
  return src.includes("SITUATIONAL_AWARENESS_ENABLED");
});

check("config/env.js has SITUATIONAL_AWARENESS_STORE_SNAPSHOTS", () => {
  const src = readFile("config/env.js");
  return src.includes("SITUATIONAL_AWARENESS_STORE_SNAPSHOTS");
});

check("config/env.js has SITUATIONAL_AWARENESS_MAX_BULLETS", () => {
  const src = readFile("config/env.js");
  return src.includes("SITUATIONAL_AWARENESS_MAX_BULLETS");
});

// ── Run all checks ────────────────────────────────────────────────────────────
(async () => {
  for (const fn of pendingChecks) {
    await fn();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("  SITUATIONAL AWARENESS RUNTIME WIRING — VERIFY");
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
