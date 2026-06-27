"use strict";
/**
 * find-dead-code.js
 * Scans for dead/orphaned files. Read-only — no side effects.
 * Reports each finding with a classification.
 */

const path = require("node:path");
const fs = require("node:fs");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SRC = path.resolve(__dirname, "../src");
const SCRIPTS_ROOT = path.resolve(__dirname, "../../../scripts");

function exists(p) { return fs.existsSync(p); }
function dirContents(p) { try { return fs.readdirSync(p); } catch { return []; } }
function readFile(p) { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }

const findings = [];

function report(file, classification, reason) {
  findings.push({ file, classification, reason });
}

// ── Root src/ ──────────────────────────────────────────────────────────────
const rootSrc = path.join(REPO_ROOT, "src");
if (exists(rootSrc)) {
  report("root src/", "DELETE", "Dead root src/ directory — production source is artifacts/ghostlight-bot/src/");
} else {
  report("root src/", "ACTIVE", "Already removed — correct");
}

// ── scripts/src/ ──────────────────────────────────────────────────────────
const scriptsSrc = path.join(SCRIPTS_ROOT, "src");
const scriptsSrcFiles = dirContents(scriptsSrc);
if (scriptsSrcFiles.length > 0) {
  for (const f of scriptsSrcFiles) {
    const content = readFile(path.join(scriptsSrc, f));
    if (content.includes("cadence-bot") || content.includes("Hello from")) {
      report(`scripts/src/${f}`, "DELETE", "References cadence-bot (dead project) or is a placeholder");
    } else {
      report(`scripts/src/${f}`, "UNSURE", "Unknown content — verify before deleting");
    }
  }
} else {
  report("scripts/src/", "ACTIVE", "Empty or removed — correct");
}

// ── Empty __tests__ directories ────────────────────────────────────────────
function findEmptyTestDirs(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") {
          const contents = dirContents(full).filter(f => f.endsWith(".test.js") || f.endsWith(".spec.js"));
          if (contents.length === 0) {
            report(path.relative(REPO_ROOT, full), "DELETE", "Empty __tests__ directory");
          }
        } else {
          findEmptyTestDirs(full);
        }
      }
    }
  } catch {}
}
findEmptyTestDirs(SRC);

// ── Planning/report docs at root ───────────────────────────────────────────
for (const name of ["IMPLEMENTATION_SUMMARY.md", "PHASE_3_REPORT.md"]) {
  if (exists(path.join(REPO_ROOT, name))) {
    report(name, "ARCHIVE", "Planning documentation — move to archive/planning/");
  }
}

// ── Archive check ──────────────────────────────────────────────────────────
const archiveDir = path.join(REPO_ROOT, "archive");
if (exists(archiveDir)) {
  report("archive/", "ARCHIVE", "Archive directory exists with quarantined dead code");
} else {
  report("archive/", "UNSURE", "No archive directory yet");
}

// ── scripts/src/proveFeatures.cjs (cadence-bot refs) ─────────────────────
const proveFeatures = path.join(SCRIPTS_ROOT, "src", "proveFeatures.cjs");
if (exists(proveFeatures)) {
  report("scripts/src/proveFeatures.cjs", "DELETE", "All require() paths reference cadence-bot which does not exist");
}

// ── Check for Jest test files ──────────────────────────────────────────────
function findJestTests(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "archive") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findJestTests(full);
      } else if (entry.name.endsWith(".test.js") || entry.name.endsWith(".spec.js")) {
        const content = readFile(full);
        if (content.includes("describe(") && (content.includes("jest.") || content.includes("expect(") && !content.includes("require(\"node:assert"))) {
          report(path.relative(REPO_ROOT, full), "DELETE", "Appears to be a Jest-format test file in active source");
        }
      }
    }
  } catch {}
}
findJestTests(SRC);

// ── Report ─────────────────────────────────────────────────────────────────
console.log("FIND_DEAD_CODE_START\n");

const byClass = {};
for (const f of findings) {
  (byClass[f.classification] = byClass[f.classification] || []).push(f);
}

for (const cls of ["DELETE", "ARCHIVE", "UNSURE", "ACTIVE"]) {
  const items = byClass[cls] || [];
  if (items.length === 0) continue;
  console.log(`── ${cls} (${items.length}) ──`);
  for (const { file, reason } of items) {
    console.log(`  ${file}`);
    console.log(`    → ${reason}`);
  }
  console.log();
}

const deleteCount = (byClass.DELETE || []).length;
const archiveCount = (byClass.ARCHIVE || []).length;
console.log(`SUMMARY: ${deleteCount} DELETE, ${archiveCount} ARCHIVE, ${(byClass.UNSURE || []).length} UNSURE`);
console.log("FIND_DEAD_CODE_DONE");
