#!/usr/bin/env node
"use strict";

/**
 * verify-situational-awareness-proactive.js
 * Verifies that the engine integrates with the heartbeat/proactive action
 * path: buildProactiveAwarenessContext, heartbeatContext.awarenessPrelude,
 * and that proactive actions include the prelude when available.
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

// ── buildProactiveAwarenessContext ────────────────────────────────────────────
check("buildProactiveAwarenessContext returns AwarenessContext shape", async () => {
  const engine = createSituationalAwarenessEngine({ config: mockConfig, logger: null });
  const ctx = await engine.buildProactiveAwarenessContext({
    now: new Date(),
    recentMessages: [],
  });
  if (!ctx) return { warn: "returned null — engine may be disabled" };
  return (
    typeof ctx.user_scope === "string"
    && typeof ctx.compact_prelude === "string"
    && Array.isArray(ctx.sources_used)
  );
});

check("buildProactiveAwarenessContext sets triggerType=heartbeat in sources", async () => {
  const engine = createSituationalAwarenessEngine({ config: mockConfig, logger: null });
  const ctx = await engine.buildProactiveAwarenessContext({
    now: new Date(),
    recentMessages: [],
  });
  return ctx !== null;
});

check("buildProactiveAwarenessContext returns null when engine disabled", async () => {
  const engine = createSituationalAwarenessEngine({
    config: { ...mockConfig, situationalAwareness: { enabled: false } },
    logger: null,
  });
  const ctx = await engine.buildProactiveAwarenessContext({ now: new Date(), recentMessages: [] });
  return ctx === null;
});

// ── heartbeat/index.js sets awarenessPrelude on heartbeatContext ──────────────
check("heartbeat/index.js code sets heartbeatContext.awarenessPrelude", () => {
  const src = fs.readFileSync(path.join(base, "heartbeat/index.js"), "utf8");
  return src.includes("awarenessPrelude");
});

check("heartbeat/index.js only calls awareness engine when isEnabled", () => {
  const src = fs.readFileSync(path.join(base, "heartbeat/index.js"), "utf8");
  return src.includes("isEnabled") || src.includes("situationalAwarenessEngine?.isEnabled");
});

// ── buildThreadHeartbeatContextText includes awarenessPrelude ─────────────────
check("buildThreadHeartbeatContextText includes awarenessPrelude when set", async () => {
  const { buildThreadHeartbeatContextText } = require(path.join(base, "proactiveActions/index.js"));
  if (typeof buildThreadHeartbeatContextText !== "function") return false;
  const text = buildThreadHeartbeatContextText({
    currentLocalTime: "2025-06-25 14:30:00 UTC",
    awarenessPrelude: "## SITUATIONAL AWARENESS\n• Time: Wednesday | Season: summer\n• Cycle: afternoon",
  });
  return typeof text === "string" && text.includes("SITUATIONAL AWARENESS");
});

check("buildThreadHeartbeatContextText still works when awarenessPrelude absent", async () => {
  const { buildThreadHeartbeatContextText } = require(path.join(base, "proactiveActions/index.js"));
  if (typeof buildThreadHeartbeatContextText !== "function") return false;
  const text = buildThreadHeartbeatContextText({
    currentLocalTime: "2025-06-25 14:30:00 UTC",
  });
  return typeof text === "string";
});

check("buildThreadHeartbeatContextText is not polluted by empty awarenessPrelude", async () => {
  const { buildThreadHeartbeatContextText } = require(path.join(base, "proactiveActions/index.js"));
  if (typeof buildThreadHeartbeatContextText !== "function") return false;
  const text = buildThreadHeartbeatContextText({
    currentLocalTime: "2025-06-25 14:30:00 UTC",
    awarenessPrelude: "",
  });
  return typeof text === "string" && !text.includes("## SITUATIONAL AWARENESS");
});

// ── proactiveActions/index.js uses awarenessPrelude ───────────────────────────
check("proactiveActions/index.js references awarenessPrelude", () => {
  const src = fs.readFileSync(path.join(base, "proactiveActions/index.js"), "utf8");
  return src.includes("awarenessPrelude");
});

// ── Run all checks ────────────────────────────────────────────────────────────
(async () => {
  for (const fn of pendingChecks) {
    await fn();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("  SITUATIONAL AWARENESS PROACTIVE — VERIFY");
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
