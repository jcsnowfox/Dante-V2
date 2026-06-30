# Duplicated Systems Audit

## Findings
- Media has multiple entry points: natural chat image intent, structured media tools, scheduled/journal actions, dashboard/call paths. They converge on `generateImage`/Discord payload files rather than being safe to consolidate immediately.
- Autonomy has multiple outbound systems: automation runner, alive engine/executor, life runtime, inner life, emotional arc, proactive actions, follow-ups, timed notes, journals/dreams. No unknown outbound system was removed.
- Prompt/context has overlapping continuity, memory, world model, and media sections. Sanitizer preserves action/media continuity labels but prompt section budget snapshots are still recommended.

## Safe fix applied
- Added a dashboard store invocation helper instead of duplicating `.catch` fallback logic for each Human Simulation store list.
