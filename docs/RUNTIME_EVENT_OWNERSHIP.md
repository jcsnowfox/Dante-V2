# Runtime Event Ownership

**Last updated:** 2026-06-28 (Integration Layer Repair 1.0)

## Overview

Every event emitted on the runtime event bus must be listed in this table.
Events not listed here must not be emitted. Events listed here but never
emitted AND never consumed are dead and must be removed.

Dead events removed 2026-06-28 (never emitted AND never consumed):
`need_satisfied`, `need_depleted`, `identity_preference_changed`,
`project_completed`, `project_abandoned`, `curiosity_matured`,
`resource_discovered`, `first_experience_recorded`,
`narrative_chapter_opened`, `narrative_self_story_updated`,
`perception_availability_changed`, `perception_confidence_decayed`

## Event Registry

### Consumed Events (real-time reactor exists)

| Event type | Consumer | Purpose |
|---|---|---|
| `repair_started` | `perceptionRuntime` | Triggers perception re-evaluation when repair opens |
| `repair_completed` | `perceptionRuntime` | Clears repair signals after consequence resolves |
| `diagnostic_warning` | `perceptionRuntime` | Elevates perception attention when runtime degrades |
| `self_confidence_low` | `perceptionRuntime` | Signals confidence drop to perception layer |

### Audit-Only Events (emitted with live data; no real-time consumer)

These events are recorded to the runtime event store for audit, replay, and
debugging. They do not drive real-time reactions in the current system.

| Event type | Emitter | Purpose |
|---|---|---|
| `need_changed` | `lifeRuntime/homeostasis` | Need level shifted above/below threshold |
| `identity_value_changed` | `lifeRuntime/identity` | Core value updated or reinforced |
| `project_progressed` | `lifeRuntime/growth` | Growth project milestone reached |
| `insight_created` | `lifeRuntime/curiosity` | Curiosity insight matured into a lesson |
| `relationship_weather_changed` | `lifeRuntime/relationship` | Relationship warmth or trust shifted |
| `consequence_created` | `lifeRuntime/consequences` | New consequence registered |
| `fulfillment_succeeded` | `lifeRuntime/fulfillment` | Fulfillment action completed successfully |
| `fulfillment_failed` | `lifeRuntime/fulfillment` | Fulfillment action failed (no evidence) |
| `fulfillment_deferred` | `lifeRuntime/fulfillment` | Fulfillment action deferred (timing constraint) |
| `narrative_chapter_updated` | `narrativeIdentityRuntime` | Narrative chapter content changed |
| `prelude_refreshed` | `lifeRuntime` | Life prelude rebuilt after tick |
| `perception_world_state_updated` | `perceptionRuntime` | Perception world state rebuilt |
| `world_model_updated` | `worldModelRuntime` | World belief map updated after tick |
| `world_belief_conflict` | `worldModelRuntime` | Two sources disagree on same belief key |
| `world_belief_decayed` | `worldModelRuntime` | Belief confidence fell below unknown threshold |
| `identity_belief_changed` | `lifeRuntime/relationshipLearning` | Relationship belief updated from lesson |
| `journal_entry_created` | `repairReflectionEngine` | Private journal entry written |

## Rules

1. Every event type in `EVENT_TYPES` must appear in this table.
2. Every event type in this table must appear in `EVENT_TYPES`.
3. Before adding a new event type, verify that a consumer or emitter exists.
4. Before removing an event type, verify it is never emitted or consumed.
5. `audit_only` events must not be used to drive real-time behaviour.
   If a consumer is added, update the category to `consumed`.
6. The `EVENT_OWNERSHIP` map in `runtimeEventBus.js` is the code-level
   mirror of this document and must stay in sync.
