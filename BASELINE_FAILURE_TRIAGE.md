# Baseline Failure Triage

Date: 2026-06-28

## Summary

All four previously failing baseline commands were triaged. Three failures were stale verifier/test assumptions caused by quiet-hours/date sensitivity or missing script aliases. One was TypeScript config drift in the scripts workspace.

| Command | Before | Root cause | Category | Safe fix | After |
|---|---:|---|---|---|---:|
| `pnpm test` | fail | Alive tests used `new Date()` and could run during default quiet hours before the assertion under test | stale test | yes | pass |
| `pnpm --dir scripts run typecheck` | fail | `scripts/tsconfig.json` included `src`, but this workspace has no `scripts/src` and stores verifier scripts at package root | type drift | yes | pass |
| `pnpm --dir artifacts/ghostlight-bot run verify:dashboard-not-broken` | fail | Proof script existed but package script alias was missing | stale verifier | yes | pass |
| `pnpm --dir artifacts/ghostlight-bot run verify:all` | fail | Same Alive quiet-hours/date sensitivity, plus proof used an expired fixed intention date during queue counting | stale verifier | yes | pass |

## `pnpm test`

- Exact failing file: `artifacts/ghostlight-bot/src/alive/__tests__/aliveEngine.test.js`.
- Exact errors before fix:
  - `enabled when ALIVE_ENABLED=true`: expected `result.enqueued === true`, actual `undefined`.
  - `daily cap enforced`: expected `daily_cap_reached`, actual `quiet_hours`.
  - `cooldown prevents rapid successive enqueues`: expected `cooldown_active`, actual `quiet_hours`.
  - `absence guard suppresses when user recently active`: expected `owner_recently_active`, actual `quiet_hours`.
- Root cause: tests used the wall clock. During default quiet hours, `aliveEngine.assess()` exits before daily-cap, cooldown, absence, or enqueue logic.
- Category: stale test.
- User-visible risk: low for runtime; medium for CI because tests were time-of-day flaky.
- Safe fix available: yes.
- Recommended action: pin affected test assessments to a known non-quiet UTC time.

## `pnpm --dir scripts run typecheck`

- Exact failing file: `scripts/tsconfig.json`.
- Exact error before fix: `TS18003: No inputs were found in config file ... Specified 'include' paths were '["src"]'`.
- Root cause: config expected TypeScript sources under `scripts/src`, but verifier scripts live as root-level `.mjs`/`.js` files in `scripts/`.
- Category: type drift.
- User-visible risk: low runtime risk, medium maintenance risk because CI could not validate the scripts package.
- Safe fix available: yes.
- Recommended action: point the scripts tsconfig at existing script files and enable JS input for no-emit checking.

## `pnpm --dir artifacts/ghostlight-bot run verify:dashboard-not-broken`

- Exact failing file: `artifacts/ghostlight-bot/package.json`.
- Exact error before fix: `ERR_PNPM_NO_SCRIPT Missing script: verify:dashboard-not-broken`.
- Root cause: `artifacts/ghostlight-bot/scripts/verify-dashboard-not-broken.js` exists and is used by `verify:all`, but no direct package script alias existed.
- Category: stale verifier.
- User-visible risk: low runtime risk, medium operator risk because the documented verifier command did not run.
- Safe fix available: yes.
- Recommended action: add the missing package script alias without changing the verifier body.

## `pnpm --dir artifacts/ghostlight-bot run verify:all`

- Exact failing file: `artifacts/ghostlight-bot/scripts/verify-alive-layer-proof.js`.
- Exact errors before fix: Alive proof functional checks failed for daily cap, cooldown, absence guard, enqueue, and pending count.
- Root cause: the verifier used wall-clock `new Date()` while default quiet hours can short-circuit the tested branches. An intermediate fixed past date made pending queue TTL checks fail because the in-memory queue evaluates expiry against `Date.now()`.
- Category: stale verifier.
- User-visible risk: low runtime risk, high CI risk because a proof verifier reported false negatives.
- Safe fix available: yes.
- Recommended action: keep wall-clock timestamps for queue TTL validity, but set `quietHoursStart: 0` and `quietHoursEnd: 0` in the targeted functional fixtures that are not testing quiet hours.

## Low-Risk Fixes Applied

1. Pinned time-sensitive Alive tests to a known non-quiet timestamp.
2. Updated `scripts/tsconfig.json` to typecheck existing root script files instead of a nonexistent `scripts/src` tree.
3. Added `verify:dashboard-not-broken` script alias in the Ghostlight bot package.
4. Updated the Alive proof verifier fixtures to disable quiet hours only for non-quiet-hour branch checks.

## Merge Decision

MERGE

## Progress Ladder

- Phase complete: baseline failure triage, low-risk fixes, integration truth audit, communication matrix, canonical pipeline plan, and verification.
- Percent complete: 100% for this triage pass.
- Blockers: none for the triaged baseline commands; broader integration consolidation remains future work.
- Next phase: implement cross-system integration tests before consolidating duplicate prompt/memory/schedule paths.
