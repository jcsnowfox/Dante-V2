# Memory and Retrieval Audit

## Findings
- Memory curation is skipped for fallback/corruption repair paths in the inspected chat pipeline, reducing risk of saving tool errors/fallbacks as memories.
- Assistant memory source IDs use `${message.id}:assistant`, while user/source paths use message IDs; no same-ID duplicate save in the inspected path was verified.
- Qdrant/vector health is checked by maintenance/diagnostic code; no schema-destructive change was made.

## Left untouched
- Memory semantics, adult/private gating, companionId/userScope policy, and emotional weighting were not changed.
