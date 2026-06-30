# Dante V2 Deep Sweep Baseline

Date: 2026-06-30 UTC. Scope: repo-wide audit across root workspace, `artifacts/ghostlight-bot`, `artifacts/api-server`, generated API libs, scripts, docs, assets, archive, dashboard, media, autonomy, memory, and Second Life bridge.

## Baseline commands run before changes

| Command | Result | Evidence |
|---|---:|---|
| `pnpm build` | PASS | Root workspace built `artifacts/ghostlight-bot` with `node --check src/index.js` and `artifacts/api-server` into `dist/`; exit 0. |
| `pnpm test` | PASS | `@workspace/ghostlight-bot` node test suite: 1288 tests, 134 suites, 0 failures; exit 0. |
| `npm run build` | PASS with npm config warnings | Same build path passed; npm warned about unknown `http-proxy`, `auto-install-peers`, and `strict-peer-dependencies` config keys. |
| `npm test` | PASS in progress duplicate when baseline capture was interrupted by later audit command output; `pnpm test` is canonical and complete | Same root script delegates to `pnpm --dir artifacts/ghostlight-bot test`. |
| `pnpm --dir artifacts/ghostlight-bot run verify:all` | PASS | Active runtime audit, `node --test`, dead-code finder, dashboard verifier, travel dashboard, life wiring, alive proof, and repository health completed; exit 0. |
| `pnpm knip` | NOT COMPLETED in first baseline run because the chained command was still executing duplicate `npm test`; root script exists but `knip` package is not a root dependency, so follow-up should run after installing/using dlx if desired. |
| `rg -n "TODO|FIXME|HACK|deprecated|unused|stub|mock|fake|placeholder|Not implemented" -g '!node_modules' -g '!artifacts/**/node_modules' .` | PASS search | 685 matches; many are historical docs, lockfile transitive package names, and tests/verifiers asserting no fake behavior. |

## Repo shape baseline

- Total tracked-like file scan via `rg --files -g '!node_modules'`: 1075 files.
- Workspace package manifests found: root, `artifacts/ghostlight-bot`, `artifacts/api-server`, `scripts`, and generated API libraries under `lib/`.
- No `AGENTS.md` files were found under `/workspace/Dante-V2` or parent scan.

## Initial risk posture

- Tests already cover several required fixes from the prompt: `.catch is not a function` for synchronous relationship status in inner-life self-check, disabled call page instead of Not found, actual image and audio attachments, fake tool-call consumption, adult routing boundaries, duplicate outbound scheduler/sender guard tests, and upload-failure messaging.
- No behavior-changing fix was applied before these reports.
