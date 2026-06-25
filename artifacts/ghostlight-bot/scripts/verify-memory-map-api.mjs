#!/usr/bin/env node
/**
 * verify-memory-map-api.mjs
 * Verifies the memory map page renderer handles qdrantError gracefully:
 * produces valid HTML with error state, retry button, and saved memory count.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const memoryPagesPath = path.join(__dirname, "../src/http/renderAdminPages/memoryPages.js");
const memoryPages = require(memoryPagesPath);

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    failed++;
  }
}

const helpers = {
  escapeHtml: (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
};

console.log("\n[verify:memory-map-api] renderMemoryMapPage handles qdrantError\n");

// Test 1: qdrantError set → renders error state HTML
const htmlError = memoryPages.renderMemoryMapPage({
  mapData: {
    totalActiveMemories: 7,
    plottedCount: 0,
    omittedWithoutVectorCount: 0,
    qdrantError: "Qdrant hostname could not be resolved — check QDRANT_URL hostname [dns_failed]",
    savedMemoryCount: 7,
    points: [],
    availableDomains: [],
    availableMemoryTypes: [],
  },
  theme: "light",
  helpers,
});
ok("qdrant error → renders HTML string", typeof htmlError === "string" && htmlError.length > 0);
ok("qdrant error → contains error state heading", htmlError.includes("Memory Map unavailable") || htmlError.includes("vector index"));
ok("qdrant error → shows saved memory count", htmlError.includes("7"));
ok("qdrant error → contains retry/resync button", htmlError.includes("Retry Resync") || htmlError.includes("memory-rebuild"));
ok("qdrant error → contains link to library", htmlError.includes("/admin/memory/library"));
ok("qdrant error → does not contain full SVG canvas", !htmlError.includes("data-memory-map-svg"));
ok("qdrant error → error code shown in output", htmlError.includes("dns_failed"));

// Test 2: qdrantError null, no memories → standard empty state
const htmlEmpty = memoryPages.renderMemoryMapPage({
  mapData: {
    totalActiveMemories: 0,
    plottedCount: 0,
    qdrantError: null,
    points: [],
    availableDomains: [],
    availableMemoryTypes: [],
  },
  theme: "light",
  helpers,
});
ok("no memories → renders empty state", htmlEmpty.includes("No active memories yet") || htmlEmpty.includes("active memories"));
ok("no memories → does not show qdrant error", !htmlEmpty.includes("vector index unreachable"));

// Test 3: qdrantError null, memories but no plots → sync-needed state
const htmlNoPlots = memoryPages.renderMemoryMapPage({
  mapData: {
    totalActiveMemories: 5,
    plottedCount: 0,
    qdrantError: null,
    points: [],
    availableDomains: [],
    availableMemoryTypes: [],
  },
  theme: "light",
  helpers,
});
ok("has memories but no plots → sync-needed state", htmlNoPlots.includes("resync") || htmlNoPlots.includes("embeddings"));

// Test 4: no qdrantError, real points → renders canvas
const htmlCanvas = memoryPages.renderMemoryMapPage({
  mapData: {
    totalActiveMemories: 2,
    plottedCount: 2,
    omittedWithoutVectorCount: 0,
    qdrantError: null,
    savedMemoryCount: 2,
    maxSemanticNeighbors: 3,
    availableDomains: ["personal"],
    availableMemoryTypes: ["canon"],
    points: [
      { memoryId: "m1", title: "Test", excerpt: "content", memoryType: "canon", domain: "personal", sensitivity: "normal", importance: 5, x: 0.5, y: 0.5, semanticNeighbors: [], referenceDate: "", updatedAt: "", lastUsedAt: "", useCount: 0, useCount7d: 0, useCount30d: 0, useCount90d: 0, editPath: "/admin/memory?edit=m1" },
      { memoryId: "m2", title: "Test 2", excerpt: "content 2", memoryType: "canon", domain: "personal", sensitivity: "normal", importance: 3, x: 0.3, y: 0.7, semanticNeighbors: [], referenceDate: "", updatedAt: "", lastUsedAt: "", useCount: 0, useCount7d: 0, useCount30d: 0, useCount90d: 0, editPath: "/admin/memory?edit=m2" },
    ],
  },
  theme: "light",
  helpers,
});
ok("valid points → renders canvas SVG", htmlCanvas.includes("data-memory-map-svg") || htmlCanvas.includes("memoryMapData"));
ok("valid points → does not show qdrant error state", !htmlCanvas.includes("Memory Map unavailable"));

console.log(`\n[verify:memory-map-api] ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
