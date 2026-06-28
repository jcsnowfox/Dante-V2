# BUG_FRAGILITY_AUDIT.md

## Findings
- Baseline `pnpm test` already fails before cleanup; see `AUDIT_BASELINE.md` for current failure output.
- Baseline `pnpm --dir scripts run typecheck` already fails before cleanup; see `AUDIT_BASELINE.md`.
- Baseline dashboard verification and bot `verify:all` already fail before cleanup; see `AUDIT_BASELINE.md`.
- Verification scripts are spread across root `scripts/`, bot `scripts/`, and previously root-level stale copies. This increases drift risk; removed only stale root copies.
- Dashboard/admin route surface is broad (`src/http/actions/*`, `src/http/adminPageHandlers/*`), with many script verifiers. Avoided route removal because pages may be customer-facing.
- Environment/config handling appears split between root config, bot `src/config/env.js`, Railway files, and package scripts. Needs a future env-name audit before consolidation.

## Small fixes made
- Removed stale root verifier copies to reduce confusion and prevent accidental execution of outdated checks.

## Needs human review
- Whether `artifacts/api-server/dist` should be generated at build time or committed for deployment.
- Whether historical root reports should be moved into `docs/archive` in a separate documentation-only PR.
