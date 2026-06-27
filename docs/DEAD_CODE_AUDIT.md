# Dead Code Audit

**Date:** 2026-06-27
**Auditor:** Consolidation pass

---

## Classification Key

| Label | Meaning |
|-------|---------|
| `ACTIVE` | Used by production runtime — do not touch |
| `TEST` | Test file — keep |
| `DOCS` | Documentation — keep in docs/ or archive/ |
| `ARCHIVE` | Safe to archive — not used but has reference value |
| `DELETE` | Proven unused, references dead paths, safe to delete |
| `UNSURE` | References exist but unclear if actively exercised |

---

## Findings

### scripts/src/hello.ts
**Classification: DELETE**
Content: `console.log("Hello from @workspace/scripts")`
This is a workspace scaffold placeholder. Never referenced by any build or CI command.
No imports. No callers.

### scripts/src/proveFeatures.cjs
**Classification: DELETE**
References `../../artifacts/cadence-bot/src/context/worldContext` and 6 other paths under `cadence-bot/`.
`cadence-bot/` does not exist in this repository. All `require()` calls in this file will throw `MODULE_NOT_FOUND` at runtime.
This was written for a previous project name and never updated.

### IMPLEMENTATION_SUMMARY.md (root)
**Classification: ARCHIVE → archive/planning/**
763-line planning/implementation summary document.
Not referenced by any code or test. Has historical reference value. Moved to `archive/planning/`.

### PHASE_3_REPORT.md (root)
**Classification: ARCHIVE → archive/planning/**
269-line phase report document.
Not referenced by any code or test. Has historical reference value. Moved to `archive/planning/`.

---

## Checked and Confirmed ACTIVE

### src/channels/secondLifeAdapter.js
**Classification: ACTIVE**
Imported at `index.js:73`. Used at lines 293, 433, 483 of `index.js`.
Critical bridge between Second Life HTTP callbacks and the companion system.

### src/proactiveActions/index.js + src/proactiveActions/toolContext.js
**Classification: ACTIVE**
`proactiveActions/index.js` is the execution runner for proactive actions.
`toolContext.js` is imported by `proactiveActions/index.js`.
Both are imported and called in `automations/runners.js`.

### Root src/ directory
**Classification: NOT PRESENT**
The root `src/` directory was already removed in a prior PR (PR #80). No dead root src/ remains.

### Root-level Jest test files
**Classification: NOT PRESENT**
All test files in the active runtime use `node:test` / `node:assert`. No Jest files found in `artifacts/ghostlight-bot/src/`.

### Empty __tests__ directories
**Classification: NOT PRESENT**
All `__tests__` directories found contain at least one test file.

### src/innerLife/ (all 20 files)
**Classification: ACTIVE**
`innerLifeEngine.js` is initialized in `index.js:246` and passed to `createChatPipeline`. All referenced sub-engines are imported by `innerLifeEngine.js` internally.

### src/continuity/ (all 28 files)
**Classification: ACTIVE**
`continuityEngine.js` is initialized in `index.js:247`. All sub-modules are imported by the continuity engine.

### src/humanSimulation/ (12 files)
**Classification: ACTIVE**
`humanSimulationEngine.js` initialized at `index.js:202`. All sub-engines imported internally.

### src/lifeEngine/ + src/secondLife/
**Classification: ACTIVE**
`createLifeEngine` imported at `index.js:81`. All seven SL engines imported and used.

### src/companionSystems/emotionalArc.js, feedbackLearning.js, relationalState.js
**Classification: ACTIVE**
All three imported at `index.js:65-67` and passed to `createChatPipeline`.

### src/awareness/situationalAwarenessEngine.js
**Classification: ACTIVE**
Imported at `index.js:57`. Passed to `createChatPipeline`.

### src/http/adminPageHandlers/ (all 16 handlers)
**Classification: ACTIVE**
All handlers are registered in `createHealthServer.js`. `feedbackLearningPageHandler.js`, `relationalStatePageHandler.js`, and `systemTruthPageHandler.js` all have corresponding action handlers and routes.

---

## Duplicate System Analysis

### Repair Systems: Not Duplicates
Three repair-related files exist:
- `src/relationshipRepair/` — detects repair signals from messages
- `src/continuity/repairContinuity.js` — maintains continuity across repair
- `src/alive/alivePostUpdate.js` — enqueues `repair_bridge` intention when repair needed

These are **layered**, not duplicate. relationshipRepair detects → alivePostUpdate enqueues → aliveExecutor dispatches → repairContinuity tracks the outcome. Each has a distinct role.

### Emotional Systems: Not Duplicates
- `src/companionSystems/emotionalArc.js` — tracks multi-session emotional narrative
- `src/innerLife/moodCarryover.js` — persists mood within and across messages
- `src/alive/alivePresenceStore.js` — tracks presence state (energy, mood, scores)

These operate at different time scales and are not interchangeable.

### Scheduler Systems: Not Duplicates (now consolidated)
- `automations/` — scheduled message sends (daily summaries, weekly recaps)
- `heartbeat/` — tick-based event execution (heartbeat actions)
- `aliveEngine` — absence detection and intention enqueueing
- `emotionalArc.scheduler` — arc state update
- `secondLifeLifeEngine` — SL goal/behavior tick

All now registered through `src/runtime/schedulerRegistry.js`.

### Discord Send Paths: Single Active Path
Only `runCheckInAutomation` in `automations/runners.js` is used for outbound messages from the alive/proactive system.
`channel.send()` is called directly in `messageCreate.js` for reply delivery — that is the only legitimate direct send.
`proactiveActions/index.js` also calls into `callModel` + `channel.send()` but this is the scheduled actions runner (heartbeat executor), not a duplicate.

---

## Remaining Uncertainty

### src/developer/
**Classification: UNSURE**
Contains dev-mode utilities. Referenced in `messageCreate.js` for dev channel detection. Appears active but may have unused sub-utilities.

### scripts/tsconfig.json (at repo root scripts/ package)
**Classification: ACTIVE**
Used by the scripts package typecheck command. Required for TypeScript tooling in the scripts workspace package, even if the scripts themselves are minimal.

### Root scripts/*.mjs (Norwegian verification scripts at repo root)
**Classification: ACTIVE**
These run against the live service. They reference `artifacts/ghostlight-bot/src/` paths correctly (they go through the API, not direct file imports). The root `scripts/package.json` registers them as verify commands.
