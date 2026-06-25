#!/usr/bin/env node
"use strict";

/**
 * verify-situational-awareness-dashboard.js
 * Verifies the /admin/awareness dashboard route, handler, and renderer.
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

// ── File existence ────────────────────────────────────────────────────────────
check("adminPageHandlers/situationalAwarenessPageHandler.js exists", () => {
  return fs.existsSync(path.join(base, "http/adminPageHandlers/situationalAwarenessPageHandler.js"));
});

check("renderAdminPages/situationalAwarenessPage.js exists", () => {
  return fs.existsSync(path.join(base, "http/renderAdminPages/situationalAwarenessPage.js"));
});

check("actions/situationalAwarenessActions.js exists", () => {
  return fs.existsSync(path.join(base, "http/actions/situationalAwarenessActions.js"));
});

// ── Handler exports ───────────────────────────────────────────────────────────
check("PageHandler exports handleSituationalAwarenessPageRequest", () => {
  const { handleSituationalAwarenessPageRequest } = require(path.join(base, "http/adminPageHandlers/situationalAwarenessPageHandler.js"));
  return typeof handleSituationalAwarenessPageRequest === "function";
});

check("Renderer exports renderSituationalAwarenessPage", () => {
  const { renderSituationalAwarenessPage } = require(path.join(base, "http/renderAdminPages/situationalAwarenessPage.js"));
  return typeof renderSituationalAwarenessPage === "function";
});

check("Actions exports handleSituationalAwarenessActions", () => {
  const { handleSituationalAwarenessActions } = require(path.join(base, "http/actions/situationalAwarenessActions.js"));
  return typeof handleSituationalAwarenessActions === "function";
});

// ── Renderer output ───────────────────────────────────────────────────────────
check("renderSituationalAwarenessPage produces HTML string", () => {
  const { renderSituationalAwarenessPage } = require(path.join(base, "http/renderAdminPages/situationalAwarenessPage.js"));
  const html = renderSituationalAwarenessPage({
    data: {
      enabled: true,
      persistenceEnabled: false,
      storeSnapshots: false,
      maxBullets: 8,
      sections: {
        time: true, presence: true, conversation: true, relationship: true, memory: true,
        projects: true, world: false, activity: true, privacy: true, tools: false,
      },
      latestSnapshot: null,
      recentSnapshots: [],
      userScope: "test_user",
      companionId: "test_companion",
      warnings: [],
    },
    config: {},
    helpers: {},
    theme: "default",
  });
  return typeof html === "string" && html.length > 100;
});

check("renderSituationalAwarenessPage includes 'Situational Awareness' heading", () => {
  const { renderSituationalAwarenessPage } = require(path.join(base, "http/renderAdminPages/situationalAwarenessPage.js"));
  const html = renderSituationalAwarenessPage({
    data: {
      enabled: true, persistenceEnabled: false, storeSnapshots: false, maxBullets: 8,
      sections: { time: true, presence: true, conversation: true, relationship: true, memory: true, projects: true, world: false, activity: true, privacy: true, tools: false },
      latestSnapshot: null, recentSnapshots: [], userScope: "u", companionId: "c", warnings: [],
    },
    config: {}, helpers: {}, theme: "default",
  });
  return html.includes("Situational Awareness");
});

check("renderSituationalAwarenessPage shows engine status", () => {
  const { renderSituationalAwarenessPage } = require(path.join(base, "http/renderAdminPages/situationalAwarenessPage.js"));
  const html = renderSituationalAwarenessPage({
    data: {
      enabled: true, persistenceEnabled: false, storeSnapshots: false, maxBullets: 8,
      sections: { time: true, presence: true, conversation: true, relationship: true, memory: true, projects: true, world: false, activity: true, privacy: true, tools: false },
      latestSnapshot: null, recentSnapshots: [], userScope: "u", companionId: "c", warnings: [],
    },
    config: {}, helpers: {}, theme: "default",
  });
  return html.includes("Engine") && (html.includes("enabled") || html.includes("disabled"));
});

check("renderSituationalAwarenessPage shows snapshot storage status", () => {
  const { renderSituationalAwarenessPage } = require(path.join(base, "http/renderAdminPages/situationalAwarenessPage.js"));
  const html = renderSituationalAwarenessPage({
    data: {
      enabled: true, persistenceEnabled: false, storeSnapshots: false, maxBullets: 8,
      sections: { time: true, presence: true, conversation: true, relationship: true, memory: true, projects: true, world: false, activity: true, privacy: true, tools: false },
      latestSnapshot: null, recentSnapshots: [], userScope: "u", companionId: "c", warnings: [],
    },
    config: {}, helpers: {}, theme: "default",
  });
  return html.includes("Snapshot");
});

check("renderSituationalAwarenessPage renders section toggles", () => {
  const { renderSituationalAwarenessPage } = require(path.join(base, "http/renderAdminPages/situationalAwarenessPage.js"));
  const html = renderSituationalAwarenessPage({
    data: {
      enabled: true, persistenceEnabled: false, storeSnapshots: false, maxBullets: 8,
      sections: { time: true, presence: true, conversation: true, relationship: true, memory: true, projects: true, world: false, activity: true, privacy: true, tools: false },
      latestSnapshot: null, recentSnapshots: [], userScope: "u", companionId: "c", warnings: [],
    },
    config: {}, helpers: {}, theme: "default",
  });
  return html.includes("time") && html.includes("memory") && html.includes("privacy");
});

check("renderSituationalAwarenessPage renders snapshot table when snapshots exist", () => {
  const { renderSituationalAwarenessPage } = require(path.join(base, "http/renderAdminPages/situationalAwarenessPage.js"));
  const html = renderSituationalAwarenessPage({
    data: {
      enabled: true, persistenceEnabled: true, storeSnapshots: true, maxBullets: 8,
      sections: { time: true, presence: true, conversation: true, relationship: true, memory: true, projects: true, world: false, activity: true, privacy: true, tools: false },
      latestSnapshot: { id: 1, trigger_type: "chat", sections_used: ["time", "memory"], prelude_length: 150, warnings_count: 0, channel_id: "123", created_at: new Date().toISOString() },
      recentSnapshots: [
        { id: 1, trigger_type: "chat", sections_used: ["time", "memory"], prelude_length: 150, warnings_count: 0, created_at: new Date().toISOString() },
      ],
      userScope: "u", companionId: "c", warnings: [],
    },
    config: {}, helpers: {}, theme: "default",
  });
  return html.includes("<table") && html.includes("chat");
});

// ── Route wiring in createHealthServer.js ─────────────────────────────────────
check("createHealthServer.js includes /admin/awareness route", () => {
  const src = readFile("http/createHealthServer.js");
  return src.includes("/admin/awareness");
});

check("createHealthServer.js imports handleSituationalAwarenessActions", () => {
  const src = readFile("http/createHealthServer.js");
  return src.includes("handleSituationalAwarenessActions");
});

check("adminPageHandlers.js imports handleSituationalAwarenessPageRequest", () => {
  const src = readFile("http/adminPageHandlers.js");
  return src.includes("handleSituationalAwarenessPageRequest");
});

check("adminPageHandlers.js dispatches awareness section", () => {
  const src = readFile("http/adminPageHandlers.js");
  return src.includes("awareness");
});

check("adminPageHandlers/shared.js maps /admin/awareness to section: awareness", () => {
  const src = readFile("http/adminPageHandlers/shared.js");
  return src.includes("/admin/awareness") && src.includes("\"awareness\"");
});

// ── Actions handler is a pass-through (no-op) ─────────────────────────────────
check("handleSituationalAwarenessActions returns false (pass-through) for GET", async () => {
  const { handleSituationalAwarenessActions } = require(path.join(base, "http/actions/situationalAwarenessActions.js"));
  const result = await handleSituationalAwarenessActions({
    req: { method: "GET" },
    res: {},
    url: new URL("http://localhost/admin/awareness"),
    context: {},
    withAdmin: null,
  });
  return result === false;
});

// ── Run all checks ────────────────────────────────────────────────────────────
(async () => {
  for (const fn of pendingChecks) {
    await fn();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("  SITUATIONAL AWARENESS DASHBOARD — VERIFY");
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
