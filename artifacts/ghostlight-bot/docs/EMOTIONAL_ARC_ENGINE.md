# Emotional Arc Engine

A reusable, portable, **additive** emotional layer for the Ghostlight AI companion.
It lets a companion form transient emotional states (annoyance, hurt, warmth,
longing, pride, worry, protectiveness, …), express them within owner-defined
limits, decay back to baseline over time, and repair after conflict.

The engine is **BASE / single-companion**: one companion per deployment. The
`companion_id` is derived deterministically from the persona name, so no manual
ID wiring is required.

## Design principles

- **Additive & fail-safe.** The engine never breaks the base Ghostlight chat flow.
  Every integration point is wrapped so that if the engine errors, is disabled,
  or has no database, the companion simply behaves exactly as it did before.
- **Owner-configured.** All behaviour is driven by a dashboard-editable profile.
  Turning `emotionalDepth` to `off` (or `enabled` to false) makes the engine
  completely inert.
- **Deterministic appraisal.** Emotional appraisal is rule/context based, not a
  second LLM call — the same input always produces the same emotion. This keeps
  it cheap, predictable, and auditable.
- **Transparent.** Every decision (appraisal, expression gate, prelude, repair,
  output safety block) is written to an audit log visible in the dashboard.
- **Memory-safe.** The engine only ever *stages* memory candidates as
  `proposed`; it never writes canon memory directly. The owner reviews them.

## Architecture

```
incoming Discord message
        │
        ▼
  processMessage()                     (src/companionSystems/emotionalArc/index.js)
        │
        ├─ loadProfile()               profile disabled / depth=off ⇒ inert return
        ├─ runAppraisal()              deterministic emotion + trigger + intensity
        ├─ recordEvent / saveState     persists transient emotional state
        ├─ runExpressionGate()         decides if/how the emotion may surface
        ├─ buildEmotionalPrelude()     → contextSection injected pre-model
        ├─ initiateRepair()            if repair is needed (e.g. companion fault)
        └─ maybeCreateMemoryCandidate()stages a 'proposed' memory only
        │
        ▼
   LLM reply generated (base Ghostlight pipeline)
        │
        ▼
  validateOutputSafety()               post-model manipulation-pattern block
```

A separate **decay scheduler** runs on an interval and lowers the intensity of
the active emotional state over time, retiring it once it falls below a floor.

### Module map (`src/companionSystems/emotionalArc/`)

| File | Responsibility |
|------|----------------|
| `index.js` | Engine factory + `processMessage`, `validateOutputSafety`, `markRepairAttempted`; exposes `stateService`, `auditLog`, `scheduler`, `store`. |
| `emotionProfileSchema.js` | `DEFAULT_PROFILE`, `validateProfile`, `mergeWithDefaults`, `VALID_EMOTIONAL_DEPTHS`. |
| `emotionalAppraisalEngine.js` | `runAppraisal` — deterministic, context-based emotion detection. |
| `emotionalDecayEngine.js` | `applyDecay`, `runDecayCycle` — intensity decay maths. |
| `emotionalExpressionGate.js` | `runExpressionGate`, `checkManipulationPatterns` — what may surface, and output safety. |
| `emotionalPreludeBuilder.js` | `buildEmotionalPrelude` — the pre-model context section. |
| `emotionalRepairService.js` | `initiateRepair`, `validateRepairOutput`, `buildRepairDirective`. |
| `emotionalMemoryHooks.js` | `maybeCreateMemoryCandidate` — stages `proposed` candidates only. |
| `emotionStateService.js` | DB-facing service: profile cache, state, events, arcs, repairs. |
| `emotionalAuditLog.js` | `append`, `list` — transparency log. |
| `emotionalArcScheduler.js` | periodic decay cycle. |
| `emotionTypes.js` | emotion registry + expression modes. |

### Storage (`src/storage/emotionalArc/index.js`)

Raw `pg` with `CREATE TABLE IF NOT EXISTS` migrations inline (same convention as
the rest of the bot — tables auto-create on `init()`). Tables:
`companion_emotion_profiles`, `companion_emotion_states`,
`companion_emotion_events`, `companion_emotion_arcs`,
`companion_emotion_repairs`, `companion_emotion_audit_log`.

If `DATABASE_URL` is not set, the store's pool is `null` and every method returns
a safe empty value — the engine stays inert rather than throwing.

## The profile

Editable from **Admin → Emotional Arc**. Fields:

- `enabled` — master on/off.
- `emotionalDepth` — `off` | `light` | `realistic` | `intense`. `off` is inert.
- `baselineTemperament` — resting disposition (warmth, patience, directness,
  playfulness, protectiveness, anger, jealousy), 0–10.
- `thresholds` — how much pressure before each emotion registers (1–10; higher =
  harder to trigger).
- `expressionStyle` — free-text guidance for how each emotion may surface.
- `blockedExpressions` — hard safety blocks (e.g. silent treatment,
  guilt-tripping, threats of leaving). The companion must never use these.
- `repairStyle` — booleans controlling how the companion makes amends.

Saving from the dashboard calls `store.upsertProfile` then
`stateService.invalidateProfileCache()` so the next message uses the new profile.

## Wiring into Ghostlight (additive points)

- `src/index.js` — constructs the engine, `await emotionalArc.init()` at startup,
  and `emotionalArc.scheduler.start()` for decay.
- `src/chat/createChatPipeline.js` — calls `processMessage` pre-model (injecting
  the prelude as a context section) and `validateOutputSafety` post-model.
- `src/http/*` — the **Emotional Arc** admin page (nav link, route, handler,
  render page) and the `emotional-arc-save` POST action.

All of these are guarded: a thrown error or a missing engine degrades gracefully
to base Ghostlight behaviour.

## Verifying

```bash
cd artifacts/ghostlight-bot
node scripts/verify-emotional-arc.js   # full Phase B + C verification
node scripts/verify-phase-b.js         # Phase B core logic only
```

See `docs/EMOTIONAL_ARC_VERIFICATION.md` for the verification matrix.
