# OVERLAPPING_SYSTEMS_AUDIT.md

| Overlap | Systems involved | Active? | Conflict? | Recommendation | Risk |
| --- | --- | --- | --- | --- | --- |
| Verification scripts | root `scripts/`, bot `scripts/`, removed root-level stale `verify-norwegian-*.mjs` | yes, except removed stale root copies | drift risk | keep active script dirs; avoid root loose verifiers | low |
| Prompt/context builders | chat prompt, model context, companion prompt, prelude builders | yes | possible duplication | add snapshot tests before consolidation | high |
| Memory writers/stores | `src/storage/memories`, staged/generated memories, continuity stores, relationship hooks | yes | possible overlap by design | document ownership before consolidation | high |
| Schedule runners | automations, heartbeat, continuity scheduler, emotional arc scheduler | yes | possible timing overlap | future runtime ownership map | medium |
| Dashboard health/status routes | health server, admin pages, diagnostics routes, verifier scripts | yes | low visible conflict | keep; route removal is customer-facing risk | medium |
| Second Life adapters | `src/secondLife/*`, `src/channels/secondLifeAdapter.js`, companion reply generator | yes | likely layered | keep | high |

## Consolidated in this pass
- Removed stale root verifier copies only.
