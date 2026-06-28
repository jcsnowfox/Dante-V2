# Prompt Diet Report

## Scope

Audited the runtime prelude path that is injected into the LLM through `lifeRuntime.getCurrentPrelude()` and `createChatPipeline` context sections. This pass only removes redundant prompt text; it does not remove runtime ownership or behavioral decision logic.

## Prompt contract after this pass

- One availability line: `Availability: ...`
- One repair line: `Repair ...`
- One runtime health line: `Runtime health: ...`
- One cognitive line: `Deliberating: ...` or `Privately planning: ...`
- One emergence line: `Living behavior: ...`, `Relationship DNA: ...`, or `Emergent pattern: ...`

## Removed redundancy

- Removed confidence percentages from LLM-facing availability lines. Confidence remains in runtime state and tests, but the prompt receives only the actionable availability fact.
- Replaced the old combined `World:` metadata line with category-specific lines so availability, repair, health, and quiet-hours signals cannot repeat inside one summary blob.
- Suppressed the healthy `Integration: all runtime systems coherent` line from the actual life prelude because it does not improve replies when no conflict exists.
- Collapsed repeated relationship lessons to a single highest-priority lesson line.
- Suppressed standalone relationship weather when repair, relationship lessons, or emergence already provide the relationship state.
- Kept behavioral-quality lines that shape tone and choices: repair, evidence integrity, self-consistency warnings, current plan/activity, identity, cognitive restraint, and emergent living behavior.

## Measurement

Measured with a representative worst-case prelude containing duplicate availability, repair, runtime health, relationship lessons, relationship weather, neural healthy status, and repeated recent-event context.

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Prompt characters | 1,175 | 959 | 216 chars |
| Estimated tokens (`ceil(chars / 4)`) | 294 | 240 | 54 tokens |
| Estimated reduction | — | — | 18% |

## Quality impact

- Expected reply quality: unchanged to improved.
- Repair quality is preserved: the repair line remains and still leads over casual/romantic behavior.
- Availability quality is preserved: the model still sees Jenna's availability, but without non-actionable confidence metadata.
- Runtime safety quality is preserved: degraded runtime health still surfaces once; healthy/no-conflict status stays silent.
- Cognitive quality is preserved: restraint/conflict guidance remains one compact line.
- Emergence quality is preserved: established living behavior/relationship DNA remains one compact line.

## Merge recommendation

MERGE

MERGE TO STAGING
