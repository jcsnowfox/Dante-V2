# Relational State Engine

A generic, owner-configurable layer that gives the companion a slow-moving
**relational state** (trust, closeness, distance, longing, hurt, guilt, …) and a
safe way to *optionally* let that state colour a reply. It is purely additive: it
never overwrites the Ghostlight base prompt, never changes the companion identity,
and never touches the model provider. It is fully inert until enabled in the
Admin UI.

Like the Emotional Arc and Feedback & Learning engines it mirrors, every
behaviour is owner-gated — **no UI config = no fire**.

## How it works

```
message ─▶ decay (gated) ─▶ appraisal ─▶ applyTrackingFlags ("no UI config = no fire")
                                              │
                          record event (companion_id scoped, daily-capped)
                                              │
                            fold into slow relational state
                                              │
                          expression gate (blocks manipulation / guilt /
                          threats; suppresses anger in safety-critical;
                          blocks private expression in public channels)
                                              │
            inert side effects: repair draft · internal desire · memory candidate
                                              │
              prelude builder ─▶ OPTIONAL additive context section
                                              │
                       appended to the next reply (never rewrites it)
```

### Reuse, not duplication

- **Emotion** is read from the **Emotional Arc** engine during appraisal — the
  Relational State Engine never re-implements emotion detection.
- **Learning** is delegated to the **Feedback & Learning** engine via
  `requestTuningFromFeedback()` — the engine never grows its own
  proposal/learning store.

### Safety guarantees

- **Fail-safe by construction.** With no database or disabled settings, every
  public method is a guarded no-op and `processMessage` returns
  `{ preludeSection: null, active: false }`.
- **companion_id isolation.** Every store query is scoped to the resolved
  companion id; state never leaks across companions.
- **Desires are internal only.** A desire is recorded with
  `requiresPermission: true` and `allowedAction: null`; it can never execute an
  action on its own.
- **Repairs are inert directives.** A drafted repair is a suggestion for the
  prelude, never an automatically-sent message, and never contains manipulation.
- **Persistent guilt.** Decay fades transient signals but deliberately preserves
  guilt / remorse / repair_needed until the owner resolves the repair.

## Configuration (Admin → Relational State)

This page is the **only** place the engine is configured. Every behaviour has a
toggle; if a toggle is off, that behaviour cannot fire. The page also surfaces
the current relational state, recent events, internal desires, repairs, and the
audit log.

- **Master switch** (`enabled`) — off = fully inert.
- **Per-signal tracking flags** — emotion, wants, desire, repair, trust,
  closeness, distance, longing, annoyance, hurt, guilt/remorse, boundary. A
  signal that is not tracked is dropped before it can affect state.
- **relationship_arc_enabled / memory_hooks_enabled / prelude_enabled /
  decay_enabled / audit_log_enabled** — the higher-level behaviours.
- **Numeric sensitivities & thresholds** — trust/closeness/distance sensitivity,
  annoyance/hurt/anger/guilt/repair/longing thresholds, desire/wants intensity,
  decay speed, and the daily event cap.
- **Style fields** — repair, conflict, boundary, affection, desire, longing.

## Where it lives

- `src/companionSystems/relationalState/` — engine modules + factory + harness.
- `src/storage/relationalState/` — 6 companion_id-scoped tables + settings row.
- `src/http/renderAdminPages/relationalStatePage.js` — Admin UI (single source
  of truth).
- `src/http/adminPageHandlers/relationalStatePageHandler.js` — page loader.
- `src/http/actions/relationalStateActions.js` — save action.
- `src/chat/createChatPipeline.js` — guarded, additive prelude hook.
- `src/index.js` — construct + init + wiring.
