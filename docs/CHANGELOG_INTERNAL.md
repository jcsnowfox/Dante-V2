# Internal Changelog

Changes to the Dante-V2 runtime, dashboard, and infrastructure. Ordered newest-first.

Format per entry:
- **Date / PR / Branch** — identity
- **Purpose** — what problem this solved
- **Files changed** — with scope classification
- **Runtime impact** — startup, pipeline, scheduler, storage
- **Dashboard impact** — new/modified routes or handlers
- **Verification** — scripts run and their results
- **Rollback** — how to revert if production breaks

---

## 2026-06-27 — PR #86 — Repository Guardrails & Maintenance Pass

**Branch:** `claude/repo-guardrails`

**Purpose:** Harden repository against drift. Add safety documentation, a unified health check, an internal changelog, a PR template, and a `verify:all` convenience script. No feature changes.

**Files changed:**

| File | Scope | Type |
|------|-------|------|
| `docs/SAFE_EDIT_ZONES.md` | Docs | NEW |
| `docs/CHANGELOG_INTERNAL.md` | Docs | NEW |
| `docs/DEPENDENCY_AUDIT.md` | Docs | NEW |
| `docs/ARCHITECTURE_MAP.md` | Docs | IMPROVED (flow diagrams added) |
| `.github/pull_request_template.md` | Infra | NEW |
| `artifacts/ghostlight-bot/package.json` | Config | MODIFIED (`verify:all` added) |
| `artifacts/ghostlight-bot/scripts/repository-health.js` | Script | NEW |
| `artifacts/ghostlight-bot/scripts/verify-dashboard-not-broken.js` | Script | IMPROVED (runtime-isolation checks) |

**Runtime impact:** None. No changes to `src/index.js`, pipeline, schedulers, or storage.

**Dashboard impact:** None.

**Verification:** `verify:all` — PASS (202 tests, all hygiene scripts green)

**Rollback:** `git revert <commit>` — all changes are additive docs/scripts only.

---

## 2026-06-26 — PR #85 — Repository Consolidation

**Branch:** `claude/repo-consolidation` (merged as `5644b0e`)

**Purpose:** Zero-feature consolidation pass. Created architectural docs, removed dead code referencing a deleted project (`cadence-bot`), added scheduler registry to replace scattered `setInterval` calls, added life barrel barrel export, added hygiene scripts.

**Files changed:**

| File | Scope | Type |
|------|-------|------|
| `docs/ARCHITECTURE_MAP.md` | Docs | NEW |
| `docs/DEAD_CODE_AUDIT.md` | Docs | NEW |
| `archive/planning/IMPLEMENTATION_SUMMARY.md` | Archive | MOVED |
| `archive/planning/PHASE_3_REPORT.md` | Archive | MOVED |
| `scripts/src/hello.ts` | Dead code | DELETED |
| `scripts/src/proveFeatures.cjs` | Dead code | DELETED |
| `src/life/index.js` | GREEN | NEW (barrel re-export, no file moves) |
| `src/runtime/schedulerRegistry.js` | RED | NEW |
| `src/index.js` | RED | MODIFIED (uses schedulerRegistry) |
| `scripts/audit-active-runtime.js` | Script | NEW |
| `scripts/find-dead-code.js` | Script | NEW |
| `scripts/verify-dashboard-not-broken.js` | Script | NEW |
| `scripts/verify-life-wiring.js` | Script | NEW |

**Runtime impact:**
- `schedulerRegistry` replaces 5 scattered `setInterval`/`start()` calls in `index.js`
- Startup order unchanged — same two phases (background: aliveEngine, post-login: automationRunner + heartbeat + secondLife + emotionalArc)
- No storage schema changes

**Dashboard impact:** None.

**Verification:** 202/202 tests pass, AUDIT_PASS, DASHBOARD_PROOF_PASS, LIFE_WIRING_PASS, ALIVE_PROOF_PASS

**Rollback:** `git revert 5644b0e` — scheduler registry is a thin wrapper; reverting restores previous inline starts.

---

## 2026-06-25 — PR #84 — Alive Layer Implementation

**Branch:** `claude/dante-alive-layer` (merged)

**Purpose:** Complete the Alive Layer — 8 source files wired into the active runtime. Tracks companion absence, enqueues intentions, dispatches unprompted outreach, injects live state into every LLM call.

**Files changed (new):**

| File | Scope | Purpose |
|------|-------|---------|
| `src/alive/aliveEngine.js` | GREEN | Absence assessment + intention enqueue |
| `src/alive/aliveExecutor.js` | GREEN | Intention dispatch via `runCheckInAutomation` |
| `src/alive/aliveEventsStore.js` | GREEN | Append-only event log |
| `src/alive/alivePresenceStore.js` | GREEN | Postgres-backed presence record |
| `src/alive/intentionQueueStore.js` | GREEN | Priority intention queue |
| `src/alive/aliveContextBuilder.js` | GREEN | LLM prelude builder |
| `src/alive/alivePostUpdate.js` | GREEN | Post-message score update |
| `src/alive/backbonePolicy.js` | GREEN | 8-pattern pushback detector |
| `src/alive/__tests__/` | Tests | 5 test files, 48 tests |
| `scripts/verify-alive-layer-proof.js` | Script | 38-point proof script |

**Files modified:**

| File | Scope | What changed |
|------|-------|-------------|
| `src/index.js` | RED | Wires aliveEngine + alivePresenceStore into startup |
| `src/chat/createChatPipeline.js` | RED | Injects alive context, backbone, alivePostUpdate |

**Runtime impact:**
- `aliveEngine.start()` called pre-login (disabled by default via `ALIVE_ENABLED`)
- `alivePresenceStore.init()` called at startup
- `buildAliveContextPrelude()` injected into every LLM call via pipeline
- `alivePostUpdate()` fires post-reply (fire-and-forget)

**Storage:** 3 new tables: `alive_events`, `alive_presence_state`, `intention_queue`

**Verification:** 202 tests, 0 failures. ALIVE_PROOF_PASS (38/38 checks).

**Rollback:** Revert the two RED-scope changes (`index.js`, `createChatPipeline.js`). Alive source files are inert without wiring.

---

## 2026-06-20 — Production Crash Fix

**Branch:** `main` (hotfix)

**Purpose:** Fix `MODULE_NOT_FOUND` crash on Railway — `createPostgresPool` import path was wrong after directory restructure.

**Files changed:**

| File | Scope | What changed |
|------|-------|-------------|
| Affected storage files | GREEN | Fixed `require('../postgres/createPostgresPool')` paths |

**Runtime impact:** Fixed startup crash. No behavior changes.

**Verification:** Bot connected to Discord on Railway after deploy.

**Rollback:** N/A — crash fix only.
