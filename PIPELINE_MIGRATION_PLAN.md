# Ghostlight Canonical Pipeline Migration Plan

## Goal

Consolidate Ghostlight into a many-inputs / one-brain / many-outputs architecture without changing companion behavior.

## Canonical Runtime Contract

1. Channel adapter
2. Companion event
3. Identity resolver
4. User resolver
5. Capability resolver
6. Permission resolver
7. Relationship resolver
8. World/time resolver
9. Memory retrieval
10. Journal retrieval
11. Dream retrieval
12. Schedule context
13. Travel context
14. Emotional state
15. Prompt assembly
16. LLM provider
17. Tool router
18. Post processing
19. Memory writer
20. Journal writer
21. Diagnostics
22. Channel adapter response

## Migration Order

1. Trace the existing `processCompanionEvent` entrypoint so current Discord and Second Life behavior remains pass-through compatible.
2. Move Discord-only intelligence behind canonical resolvers one resolver at a time.
3. Move Second Life reply generation behind the same resolver interfaces after Discord parity is verified.
4. Add dashboard/web events as thin adapters once the resolver contract is stable.
5. Add Telegram, voice, video, mobile, and API access only as adapters.

## Non-goals

- No personality rewrite.
- No prompt copy changes except routing/assembly consolidation.
- No memory schema migration in this phase.
- No provider changes.
