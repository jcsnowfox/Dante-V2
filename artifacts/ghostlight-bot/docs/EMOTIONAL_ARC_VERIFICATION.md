# Emotional Arc Engine — Verification

This document describes how the Emotional Arc Engine is verified and what each
check proves. The engine is additive and fail-safe, so verification focuses on
two things: (1) the core logic is correct and deterministic, and (2) the engine
is genuinely wired into the chat pipeline and the admin dashboard.

## How to run

```bash
cd artifacts/ghostlight-bot

# Full Phase B + C verification (core logic + dashboard wiring + docs)
node scripts/verify-emotional-arc.js

# Phase B core-logic-only verification
node scripts/verify-phase-b.js
```

Each script prints a per-check `✓ / ✗ / ⚠` list and a final verdict block:

- `✅ PASS` — all checks passed, no warnings.
- `⚠️ PASS WITH WARNINGS` — all required checks passed; one or more soft checks
  warned.
- `❌ NO GO` — at least one required check failed. Exit code is non-zero.

## Verification matrix — `verify-emotional-arc.js`

| # | Section | Proves |
|---|---------|--------|
| 1 | Profile schema & defaults | `DEFAULT_PROFILE` is valid; `mergeWithDefaults` is complete; depth enum includes the safe `off`; invalid profiles are rejected with errors. |
| 2 | Appraisal | Context-based emotion detection is correct, **deterministic** (identical input ⇒ identical output), unsafe content is flagged, and `depth=off` is inert. |
| 3 | Decay engine | `applyDecay` reduces an aged state's intensity over elapsed time. |
| 4 | Repair directive | `buildRepairDirective` produces guidance from `profile.repairStyle`. |
| 5 | Memory hook | A qualifying appraisal stages a **`proposed`** candidate (never canon). |
| 6 | Engine surface | The factory exposes its full public surface, `stateService` exposes the profile/state methods, `store.upsertProfile` exists, and `processMessage` runs with **no database** (fail-safe). |
| 7 | Chat pipeline wiring | `createChatPipeline` calls `processMessage` pre-model and `validateOutputSafety` post-model; `index.js` constructs, inits, and starts the scheduler. |
| 8 | Admin dashboard wiring | Nav link, route-state mapping, GET allowlist, page handler dispatch, render page + save form, save action registration, and the save action persists + invalidates the cache. |
| 9 | Render page | The Emotional Arc page renders valid HTML containing the form, depth select, blocked-expressions field, audit table, and current state. |
| 10 | Documentation | `EMOTIONAL_ARC_ENGINE.md` and this file exist. |
| 11 | Output-side safety interception | A hard-blocked guilt-trip, threat, and cruelty/manipulation reply is **not sent as-is** — `validateOutputSafety` returns a neutral safe `safeText`, the fallback itself passes the safety check, and both `output_blocked` and `output_replaced` audit events are written. Normal safe output is passed through unchanged with no audit noise, and the chat pipeline actually assigns the fallback to the outbound text. |
| 12 | Repair persistence logging | A failing `saveRepair` does **not** crash the base reply flow, logs a `repair:persist_failed` warning, writes a `repair_persist_failed` audit event, and no silent `.catch(() => null)` remains in source. |
| 13 | Regression | Input-side gates still hold (jealousy blocked in public, inert at `depth=off`) and `companion_id` is deterministic and isolated per persona. |

## What "fail-safe" verification means

Section 6 deliberately constructs the engine with an empty database URL and calls
`processMessage`. This proves the most important property of the engine: **it
cannot break base Ghostlight**. With no DB, no profile, or the engine disabled, the
call returns a well-formed (inert) result instead of throwing.

## Expected result

A clean tree on a correctly wired checkout produces:

```
VERDICT:  ✅ PASS
```

If you see `❌ NO GO`, read the `✗` lines — each names the exact missing wiring or
broken behaviour. Warnings (`⚠`) do not fail the build but are worth reviewing.
