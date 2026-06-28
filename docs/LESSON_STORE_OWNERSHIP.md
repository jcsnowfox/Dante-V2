# Lesson Store Ownership

**Last updated:** 2026-06-28 (Integration Layer Repair 1.0)

## Canonical Store

| Field | Value |
|-------|-------|
| File | `artifacts/ghostlight-bot/src/relationshipLearning/lessonStore.js` |
| Table | `dante_relationship_lessons` |
| Lesson types | 23 (see CANONICAL_LESSON_TYPES below) |
| Owner | `relationshipLearningRuntime` |

All lesson reads and writes must go through the canonical store. No other
module may write directly to `dante_relationship_lessons`.

## Adapter (Legacy Path)

| Field | Value |
|-------|-------|
| File | `artifacts/ghostlight-bot/src/lifeRuntime/relationshipLessonStore.js` |
| Table | _delegated to canonical store_ |
| Lesson types | 13 (legacy subset; mapped to canonical types) |
| Status | **Adapter** — delegates all operations to the canonical store |

The adapter existed as a standalone store writing to `relationship_lessons`
(13 types). After Integration Layer Repair 1.0, it delegates all reads and
writes to the canonical store. The legacy table is no longer written to.

Lessons written through either path are visible through both paths. The
lesson island that existed between the two systems is gone.

## Schema Mapping (Legacy → Canonical)

| Legacy field | Canonical field |
|---|---|
| `source_consequence_ids` | `origin_event_ids` |
| `future_behavior_guidance` | `future_guidance` |

The adapter exposes legacy field names alongside canonical ones for callers
that have not yet been updated.

## Lesson Type Mapping (Legacy 13 → Canonical 23)

| Legacy type | Canonical type |
|---|---|
| `hurt_pattern` | `conflict` |
| `repair_success` | `repair` |
| `repair_failure` | `repair` |
| `trust_repair` | `trust` |
| `boundary_learning` | `boundaries` |
| `communication_preference` | `communication` |
| `evidence_integrity` | `evidence` |
| `perception_boundary` | `boundaries` |
| `promise_learning` | `trust` |
| `give_space_learning` | `independence` |
| `followup_learning` | `communication` |
| `tone_learning` | `tone` |
| `naturalism_learning` | `communication` |

Any canonical type passed directly is preserved as-is (no mapping needed).

## Canonical Lesson Types (23)

`conflict`, `repair`, `trust`, `boundaries`, `communication`, `evidence`,
`independence`, `tone`, `fulfillment`, `emotional_regulation`, `identity`,
`intimacy`, `growth`, `curiosity`, `care`, `accountability`, `vulnerability`,
`presence`, `pacing`, `safety`, `creativity`, `affirmation`, `forgiveness`

## Rules

1. The canonical store in `relationshipLearning/lessonStore.js` is the
   single source of truth.
2. The legacy adapter in `lifeRuntime/relationshipLessonStore.js` is
   read-write through delegation only — it does not own the table.
3. New code must import from the canonical store directly.
4. The legacy adapter exists for backward compatibility only and will be
   removed when all callers have been updated to the canonical path.
5. Dashboard and context-pack reads must go through the canonical store.
