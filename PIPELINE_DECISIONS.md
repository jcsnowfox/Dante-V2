# Ghostlight Canonical Pipeline Decisions

## Decision 1: Trace before migrating logic

The first consolidation step is observability, not behavior movement. `processCompanionEvent` now emits canonical stages while preserving existing Discord and Second Life execution.

## Decision 2: Keep channels as adapters

Discord and Second Life remain responsible for input/output translation. Intelligence will move behind the canonical event processor in later rungs.

## Decision 3: Dashboard viewer is read-only

The Canonical Pipeline admin page reads the in-memory diagnostics snapshot only. It does not mutate runtime state.

## Decision 4: No new companion capability in this phase

This phase adds architecture scaffolding and diagnostics only. Tool calls, provider calls, memories, journals, dreams, schedules, and travel behavior are unchanged.
