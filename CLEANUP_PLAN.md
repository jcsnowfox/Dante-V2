# Cleanup Plan

## Safe immediate changes completed in this PR

- Added deep-sweep audit reports only. No runtime behavior was changed.

## Safe next PR candidates

1. Add prompt-section budget snapshot tests (normal/adult/image/SL/call scenarios).
2. Add dashboard route manifest/link checker.
3. Add memory duplicate/orphan audit script with read-only reporting.
4. Add root dependency audit tooling explicitly (`knip` devDependency or `pnpm dlx knip` script) after team agrees on tool policy.
5. Consolidate verifier alias documentation without removing old aliases.
6. Decide generated `artifacts/api-server/dist` commit policy.

## Requires explicit approval before changes

- Prompt/persona rewrites.
- Memory semantics or destructive schema changes.
- Adult routing behavior.
- Second Life protocol changes.
- Large file/folder moves.
- Dependency removal used by optional features.
