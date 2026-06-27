# Safe Edit Zones

This document classifies every major area of the codebase by risk level.
Check this before making any change to understand impact and required verification.

**Active runtime source:** `artifacts/ghostlight-bot/src/`
**Test runner:** `cd artifacts/ghostlight-bot && node --test`

---

## GREEN — Safe to Edit

Low risk. Regressions are caught by the test suite and verify scripts.

| Path | What lives here | Required after edit |
|------|-----------------|---------------------|
| `src/alive/` | Alive layer engines and stores | `node --test` + `verify-alive-layer-proof.js` |
| `src/innerLife/` | Inner life engine | `node --test` |
| `src/continuity/` | Continuity engine | `node --test` |
| `src/humanSimulation/` | Human simulation pack | `node --test` |
| `src/companionSystems/` | Emotional arc, feedback, relational state | `node --test` |
| `src/memory/` | Memory stores, Qdrant client, curator | `node --test` |
| `src/storage/` | Postgres store factories (additive changes only) | `node --test` |
| `src/tools/` | Tool registry and implementations | `node --test` |
| `src/context/` | Context builders (cross-channel, URL, world) | `node --test` |
| `src/games/` | Game logic | `node --test` |
| `src/music/` | Spotify / music library | `node --test` |
| `src/norwegian/` | Norwegian learning system | `node --test` |
| `src/images/` | Image generation (DALL-E 3) | `node --test` |
| `src/audio/` | Audio generation (Fish Audio) | `node --test` |
| `src/media/` | GIF normalization | `node --test` |
| `src/proactiveActions/` | Proactive action definitions | `node --test` |
| `src/awareness/` | Situational awareness engine | `node --test` |
| `docs/` | Documentation | None |
| `artifacts/ghostlight-bot/scripts/` | Verify and audit scripts | Run the script itself |

---

## YELLOW — Dashboard Presentation Layer

These files render HTML and return JSON for the admin UI. They must not own runtime behavior.

| Path | What lives here | Rule |
|------|-----------------|------|
| `src/http/adminPageHandlers/` | HTML page renderers (16 files) | Read-only state access. No `.start()`, `.stop()`, or scheduler calls. |
| `src/http/actions/` | Admin action handlers (24 files) | Only memory, music, heartbeat, and image admin operations. No scheduler mutations. |
| `src/http/createHealthServer.js` | Express server + route wiring | Add routes here only. Never wire scheduler or engine lifecycle here. |

**Required after dashboard changes:** `node scripts/verify-dashboard-not-broken.js`

---

## RED — Runtime Critical

Changes here can break the bot, corrupt state, or silently disable core behavior.
Run the full verification suite before merging anything that touches these files.

| Path | Why it's dangerous | Required after edit |
|------|--------------------|---------------------|
| `src/index.js` | Startup order, engine init, scheduler wiring — everything boots from here | Full test suite + `audit-active-runtime.js` + manual Discord smoke test |
| `src/chat/createChatPipeline.js` | Sole LLM call assembly point — all context injection is here | Full test suite + manual chat test covering every context section |
| `src/bot/events/messageCreate.js` | All Discord message routing, thread logic, reply delivery | Full test suite + manual Discord inbound test |
| `src/automations/runners.js` | **The one production send path** — alive executor + heartbeat + all proactive sends go through here | Full test suite + `audit-active-runtime.js` |
| `src/runtime/schedulerRegistry.js` | Governs startup of all recurring engines (both phases) | Full test suite + `verify-life-wiring.js` |
| `src/storage/postgres/schemaRegistry.js` | All 86 Postgres table schemas | Additive changes only. Never change column types or drop columns. |
| `src/storage/postgres/runSchemaGuard.js` | Schema guard runs at startup — a crash here prevents bot startup | Test in staging first. |
| `src/life/index.js` | Barrel re-export — require() paths must stay aligned with actual file locations | Check that all require() paths resolve after any file moves |

---

## ARCHIVED — Do Not Import

Quarantined for reference only. Do not add `require()` paths pointing into these directories.

| Path | Status |
|------|--------|
| `archive/planning/` | Planning docs from pre-consolidation phases |

---

## Architectural Invariants

These rules are never to be violated regardless of what you're building:

1. **One Discord send path.** All outbound messages from alive/proactive systems go through `runCheckInAutomation` in `src/automations/runners.js`. Never add a second `channel.send()` in alive or proactive code.
2. **One context assembly point.** `createChatPipeline.js` is the sole location where `contextSections[]` is built before each LLM call. Never inject context from another file.
3. **One schema guard.** `runSchemaGuard()` runs at startup. No migration files. All tables use `CREATE TABLE IF NOT EXISTS`.
4. **Alive disabled by default.** The alive engine requires `ALIVE_ENABLED === "true"`. This guard must never be removed or inverted.
5. **Dashboard reads only.** No admin page handler may start, stop, or modify scheduler state.
6. **Tests use `node:test`.** Never convert tests to Jest or introduce `describe()` / `jest.*` format in the source tree.
