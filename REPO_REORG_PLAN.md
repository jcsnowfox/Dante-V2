# REPO_REORG_PLAN.md

## Current pain points
- Active bot code is concentrated under `artifacts/ghostlight-bot/src`, while root has reports, scripts, generated libraries, and historical artifacts.
- Verification scripts exist in multiple locations, which caused stale root-level verifier drift.
- Dashboard, channel, service, and companion domains are partially separated but still mixed under broad folders.

## Recommended target structure
Use the requested structure as a long-term target: `src/app`, `src/companion`, `src/channels`, `src/services`, `src/dashboard`, `src/shared`, `src/workers`, `tests`, `docs`.

## Safe moves now
- Remove stale loose root verifier scripts (done).
- In a future docs-only PR, move root reports into `docs/reports/` if external links do not depend on current paths.

## Risky moves later
- Moving active bot files out of `artifacts/ghostlight-bot/src` because many relative imports and scripts assume current paths.
- Moving dashboard handlers because route verification is already failing at baseline and should be stabilized first.
- Consolidating prompt builders because companion behavior is persona-sensitive.

## Import update strategy
1. Generate an import graph first.
2. Move one domain at a time.
3. Run `node --test`, `pnpm build`, dashboard verification, and runtime wiring verifiers after each move.
4. Avoid barrel files unless they reduce import churn without hiding ownership.
