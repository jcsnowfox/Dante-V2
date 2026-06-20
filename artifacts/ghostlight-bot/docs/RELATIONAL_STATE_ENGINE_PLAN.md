# Relational State Engine — Build Plan

This documents the build of the Relational State Engine so it can be audited and
extended. The engine mirrors the two completed engines (Emotional Arc + Feedback
& Learning) exactly; this plan records the decisions specific to relational
state.

## Goals

1. Give the companion a slow-moving relational state (trust, closeness,
   distance, longing, hurt, guilt, …) that the owner fully controls.
2. Be **additive only** — never overwrite the base prompt, identity, or model
   provider. The only live-reply influence is an optional prelude section.
3. Be **fail-safe** — inert with no DB / disabled settings; never throw into the
   chat pipeline.
4. Enforce **companion_id isolation** on every store query.
5. Make the **Admin UI the single source of truth** — "no UI config = no fire".
6. **Reuse, not duplicate** — read emotion from Emotional Arc, delegate learning
   to Feedback & Learning.

## Module layout (`src/companionSystems/relationalState/`)

| Module | Responsibility |
| --- | --- |
| `relationalTypes.js` | Enums: signals, expression modes, relational depths. |
| `relationalConfigSchema.js` | Owner config: flags, numeric clamps, defaults, merge/validate. Safety posture off by default (audit on). |
| `relationalSettingsService.js` | Load/save settings; resolve companion id; `active = enabled && ownerEditable && config.enabled`. |
| `relationalAuditLog.js` | Append + list audit entries (companion scoped). |
| `relationalEventService.js` | Record + list relational events with daily cap. |
| `relationalStateService.js` | Slow relational dimensions; fold appraisal; clear repair need. |
| `relationalAppraisalEngine.js` | Deterministic signal detection; reads Emotional Arc; `applyTrackingFlags` enforces "no UI config = no fire". |
| `relationalExpressionGate.js` | Blocks manipulation/guilt/threats; suppresses anger in safety-critical; blocks private expression in public. |
| `relationalRepairService.js` | Draft inert repair directives; resolve repairs. |
| `relationalDesireService.js` | Record internal desires (never execute). |
| `relationalDecayService.js` | Fade transient signals; persist guilt/remorse/repair_needed. |
| `relationalMemoryHooks.js` | Stage memory candidates (never live). |
| `relationalPreludeBuilder.js` | Build the optional additive prelude. |
| `index.js` | Factory `createRelationalStateEngine`; `processMessage` / `buildPrelude` / `requestTuningFromFeedback` / `resolveRepair`. |
| `relationalVerification.js` | In-memory 19-check safety harness. |

## Store (`src/storage/relationalState/index.js`)

Six companion_id-scoped tables (`CREATE TABLE IF NOT EXISTS`, inert with no
pool) plus the shared `companion_system_settings` row (`system_key =
relational_state`):

- `companion_relational_settings`
- `companion_relational_state`
- `companion_relational_events`
- `companion_relational_desires`
- `companion_relational_repairs`
- `companion_relational_audit_log`

## Wiring

- **Admin UI:** nav link, route mapping, page handler dispatch, render helper,
  GET allowlist, and save action registered alongside the Feedback & Learning
  trio.
- **Pipeline:** `src/index.js` constructs the engine (passing in `emotionalArc`
  + `feedbackLearning`), adds an init step, and passes it to the pipeline +
  appContext. `src/chat/createChatPipeline.js` adds a guarded, additive prelude
  hook after the feedback hook.

## Verification

`scripts/verify-relational-state.js` runs the in-memory harness (engine safety
guarantees) then verifies admin/pipeline/render/docs wiring from source.
Verdict is **NO GO** if any check fails. See
`RELATIONAL_STATE_VERIFICATION.md`.
