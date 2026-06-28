# DEEP_SWEEP_REPORT.md

## Summary
- Baseline captured before deletion in `AUDIT_BASELINE.md`.
- Created repo map and audit documents: `REPO_MAP.md`, `DEAD_CODE_AUDIT.md`, `BUG_FRAGILITY_AUDIT.md`, `PROMPT_CONTEXT_BLOAT_AUDIT.md`, `OVERLAPPING_SYSTEMS_AUDIT.md`, `REPO_REORG_PLAN.md`, `CLEANUP_VERIFICATION.md`.
- Removed 19 stale root-level `verify-norwegian-*.mjs` scripts (87,535 bytes tracked content). Active root package scripts call `scripts/verify-norwegian-*.mjs`; bot verifiers live under `artifacts/ghostlight-bot/scripts`.
- Files moved: none.
- Imports updated: none required; removed files had no active import/package-script references.
- Dependencies removed: none.
- Prompt/context bloat reduced: none in runtime; prompt changes were intentionally avoided to preserve companion behavior.

## Files removed
- `verify-norwegian-daily-practice.mjs`
- `verify-norwegian-dashboard-privacy.mjs`
- `verify-norwegian-dashboard-settings.mjs`
- `verify-norwegian-dashboard-storage.mjs`
- `verify-norwegian-dashboard-tabs.mjs`
- `verify-norwegian-dashboard.mjs`
- `verify-norwegian-mastery-privacy.mjs`
- `verify-norwegian-mastery.mjs`
- `verify-norwegian-media-curator.mjs`
- `verify-norwegian-media-no-hallucinations.mjs`
- `verify-norwegian-media-privacy.mjs`
- `verify-norwegian-pronunciation-audio-routing.mjs`
- `verify-norwegian-pronunciation-dashboard.mjs`
- `verify-norwegian-pronunciation-discord.mjs`
- `verify-norwegian-pronunciation-privacy.mjs`
- `verify-norwegian-pronunciation-storage.mjs`
- `verify-norwegian-pronunciation.mjs`
- `verify-norwegian-review-engine.mjs`
- `verify-norwegian-review-privacy.mjs`

## Dead code found
- High confidence: stale root-level Norwegian verifier scripts, removed.
- Medium confidence: committed `artifacts/api-server/dist` generated output; needs deployment review before removal.
- Low confidence: historical reports/archive docs and one-off verifier scripts; kept.

## Bugs/fragility found
- Pre-existing failing tests/typecheck/dashboard verification in baseline.
- Verification script drift across multiple directories.
- Broad dashboard/admin and context/prompt surfaces need ownership maps before consolidation.

## Prompt/context bloat found
- Potential overlapping prompt/context sections in chat prompt, model context, companion prompt, and prelude builders.
- No runtime prompt change made because persona/relationship behavior is sensitive.

## Overlapping systems found
- Verification scripts, prompt/context builders, memory stores/writers, schedule runners, dashboard health/status routes, and Second Life adapter/reply layers.

## Verification results
- After cleanup, `pnpm build` passed.
- `pnpm test`, `pnpm --dir scripts run typecheck`, dashboard verification, and bot `verify:all` still fail consistently with baseline failures.

## Merge Decision
MERGE WITH REVIEW

Reason: cleanup removed only high-confidence stale root files and added audit documentation. Existing baseline failures remain and should be reviewed separately before broader reorganization.

## Progress Ladder
- Phase 0: complete, 100%.
- Phase 1: complete, 100%.
- Phase 2: complete for safe candidates, 70% overall.
- Phase 3: complete as audit, 70% overall.
- Phase 4: complete as audit, 60% overall; runtime prompt work deferred.
- Phase 5: complete as audit, 70% overall.
- Phase 6: complete as plan, 100%.
- Phase 7: complete for one safe cleanup batch, 25% of possible cleanup.
- Phase 8: complete for this batch, 100%.
- Phase 9: complete, 100%.

## Remaining cleanup opportunities
- Stabilize baseline test/typecheck/dashboard failures.
- Confirm whether generated `artifacts/api-server/dist` should be committed.
- Add prompt snapshot tests before any context deduplication.
- Create import graph and ownership docs before moving active bot/dashboard files.

## Needs human review
- Baseline failures.
- Deployment dependency on committed API server `dist`.
- Any prompt/context consolidation that could alter Dante’s behavior.
