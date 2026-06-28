# Performance Audit Report

## Scope

Audited the runtime paths that repeatedly feed the chat loop and life tick: life runtime prelude refresh, relationship learning, romantic surprise storage, prompt budgeting, embedding/vector call sites, cache usage, JSON serialization/cloning, event emission, context generation, and store fallback paths.

## Measurements Reviewed

- DB reads: store `list*`, `get*`, `findSimilar`, and status paths used during runtime ticks and prelude refreshes.
- DB writes: consequence, lesson, romantic surprise, event, and runtime health write paths.
- Repeated queries: status/prelude builders that re-read or re-filter the same state.
- Repeated embedding/vector searches: music/library and memory vector search call sites; no safe consolidation applied because ownership differs between music discovery and memory recall.
- Repeated prompt builders: life prelude and prompt budget paths; prompt diet from the previous pass already prevents duplicated prompt sections.
- Repeated cache misses: runtime status builders and store in-memory fallbacks.
- Repeated runtime ticks/events/context generation: life runtime tick chain and event bus calls.
- Repeated serialization / JSON cloning: JSON payload writes and bounded context strings.

## Optimizations Applied

### Relationship learning status cache

- Replaced repeated status filtering in `relationshipLearningRuntime.getStatus()` with cached status counts computed once when active lessons are loaded.
- Reused cached behavior guidance for `getPreludeSignal()` when available instead of rebuilding guidance during prelude refresh.

Expected savings: removes up to five repeated full-array scans per status call and one repeated guidance build per prelude refresh.

### Romantic surprise targeted reads

- `acknowledgeLatest()` now queries only the latest unacknowledged sent surprise instead of loading recent surprises, filtering, and sorting again.
- `getActiveTemporaryBlock()` now queries only active temporary blocks instead of loading recent surprises and scanning client-side.
- In-memory fallback sorting now mirrors SQL ordering for due surprises and uses shared ISO comparators.

Expected savings: avoids broad recent-list reads and duplicate in-memory filtering/sorting on acknowledgement/block checks.

## Findings Left Unchanged

- Embedding and vector search call sites are owned by separate systems (music discovery vs memory recall). Consolidating them would merge different ownership and risk behavioral regressions.
- JSON serialization in store writes is necessary for JSONB boundaries; no dead clone pattern was found in the hot chat path.
- Runtime event emissions are already bounded and safe; batching would change observability timing.
- Prompt-builder reductions were already applied in `PROMPT_DIET_REPORT.md`; this pass did not remove behavioral context.

## Estimated Improvements

- CPU savings: small but repeatable; about 1-3% in relationship-learning/status-heavy life tick paths, higher for in-memory test/fallback stores with many lessons or surprises.
- Memory savings: small; avoids temporary filtered arrays in status and targeted romantic surprise lookups.
- Prompt savings: neutral in this pass; prompt reductions were preserved, not expanded.
- Latency savings: low single-digit milliseconds per affected tick/status call in fallback mode; one less broad DB result set for romantic surprise acknowledgement/block checks in Postgres mode.

## Quality Impact

Behavioral quality should remain unchanged. The changes preserve canonical ownership, do not add features, do not add runtimes, and only remove repeated scans/builds or replace broad reads with equivalent targeted reads.
