#!/usr/bin/env node
"use strict";

/**
 * verify-situational-awareness-tools.js
 * Verifies that tool availability is reported honestly, and that
 * includeTools=false suppresses the tools section.
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

const baseConfig = {
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

// ── includeTools=false suppresses tools section ───────────────────────────────
check("includeTools=false: tools section absent even when tools provided", async () => {
  const engine = createSituationalAwarenessEngine({ config: baseConfig, logger: null });
  const mockTools = {
    list: () => [{ name: "image_generation" }, { name: "web_search" }],
  };
  const ctx = await engine.buildAwarenessContext({
    tools: mockTools,
    recentHistory: [],
    memories: [],
  });
  return !ctx.sections.tools;
});

// ── includeTools=true shows real tool list ────────────────────────────────────
check("includeTools=true: tools section present when tools available", async () => {
  const engine = createSituationalAwarenessEngine({
    config: {
      ...baseConfig,
      situationalAwareness: { ...baseConfig.situationalAwareness, includeTools: true },
    },
    logger: null,
  });
  const mockTools = {
    list: () => [{ name: "image_generation" }, { name: "get_gif" }],
  };
  const ctx = await engine.buildAwarenessContext({
    tools: mockTools,
    recentHistory: [],
    memories: [],
  });
  return !!ctx.sections.tools;
});

check("includeTools=true: tools section lists actual tool names", async () => {
  const engine = createSituationalAwarenessEngine({
    config: {
      ...baseConfig,
      situationalAwareness: { ...baseConfig.situationalAwareness, includeTools: true },
    },
    logger: null,
  });
  const mockTools = {
    list: () => [{ name: "image_generation" }, { name: "get_gif" }],
  };
  const ctx = await engine.buildAwarenessContext({
    tools: mockTools,
    recentHistory: [],
    memories: [],
  });
  const section = ctx.sections.tools;
  if (!section) return false;
  return section.bullets.some((b) => b.includes("image_generation") || b.includes("get_gif"));
});

// ── No tools object: section absent ──────────────────────────────────────────
check("includeTools=true: no tools section when tools=null", async () => {
  const engine = createSituationalAwarenessEngine({
    config: {
      ...baseConfig,
      situationalAwareness: { ...baseConfig.situationalAwareness, includeTools: true },
    },
    logger: null,
  });
  const ctx = await engine.buildAwarenessContext({
    tools: null,
    recentHistory: [],
    memories: [],
  });
  return !ctx.sections.tools;
});

// ── Empty tool list: section absent ──────────────────────────────────────────
check("includeTools=true: no tools section when tool list is empty", async () => {
  const engine = createSituationalAwarenessEngine({
    config: {
      ...baseConfig,
      situationalAwareness: { ...baseConfig.situationalAwareness, includeTools: true },
    },
    logger: null,
  });
  const mockTools = { list: () => [] };
  const ctx = await engine.buildAwarenessContext({
    tools: mockTools,
    recentHistory: [],
    memories: [],
  });
  return !ctx.sections.tools;
});

// ── Tools section capped at 5 ────────────────────────────────────────────────
check("includeTools=true: tools section shows at most 5 tools", async () => {
  const engine = createSituationalAwarenessEngine({
    config: {
      ...baseConfig,
      situationalAwareness: { ...baseConfig.situationalAwareness, includeTools: true },
    },
    logger: null,
  });
  const mockTools = {
    list: () => ["a", "b", "c", "d", "e", "f", "g"].map((n) => ({ name: `tool_${n}` })),
  };
  const ctx = await engine.buildAwarenessContext({
    tools: mockTools,
    recentHistory: [],
    memories: [],
  });
  const section = ctx.sections.tools;
  if (!section) return false;
  const toolLine = section.bullets[0] || "";
  const count = (toolLine.match(/tool_/g) || []).length;
  return count <= 5;
});

// ── Tool errors don't crash engine ────────────────────────────────────────────
check("includeTools=true: crashing tools.list does not crash engine", async () => {
  const engine = createSituationalAwarenessEngine({
    config: {
      ...baseConfig,
      situationalAwareness: { ...baseConfig.situationalAwareness, includeTools: true },
    },
    logger: null,
  });
  const mockTools = {
    list: () => { throw new Error("tools registry down"); },
  };
  let threw = false;
  try {
    const ctx = await engine.buildAwarenessContext({
      tools: mockTools,
      recentHistory: [],
      memories: [],
    });
    return typeof ctx.compact_prelude === "string";
  } catch {
    threw = true;
  }
  return !threw;
});

// ── Run all checks ────────────────────────────────────────────────────────────
(async () => {
  for (const fn of pendingChecks) {
    await fn();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("  SITUATIONAL AWARENESS TOOLS — VERIFY");
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
