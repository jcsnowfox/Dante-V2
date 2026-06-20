# Relational State Engine — Verification

Run from `artifacts/ghostlight-bot`:

```bash
node scripts/verify-relational-state.js
```

The script prints a PASS/FAIL line per check and a final verdict. It exits
non-zero (**NO GO**) if any check fails. No `DATABASE_URL` is required — the
safety harness uses an in-memory store.

## Sections

1. **Engine safety guarantees (in-memory harness)** — 20 checks proving the core
   safety contract (see below). Implemented in `relationalVerification.js`.
2. **Admin dashboard wiring** — nav link, route mapping, GET allowlist, page
   handler dispatch, render page + save form, action registration.
3. **Chat pipeline & index.js wiring** — pipeline calls
   `relationalState.processMessage`; `index.js` constructs, inits, and wires the
   engine.
4. **Render page produces valid HTML** — `renderRelationalStatePage` renders the
   save form, state panel, desire row, and audit table.
5. **Documentation** — this file plus the engine + plan docs exist.

## Safety harness checks (Section 1)

1. Default config safety posture is off (audit on)
2. Inert when no settings row exists
3. Inert when settings row disabled
4. Inert when config.enabled false
5. Appraisal detects signals deterministically
6. Reuses Emotional Arc (emotion) via getCurrentState
7. No UI config = no fire (untracked signal dropped)
8. Gate blocks manipulation/guilt/threats (helper + runtime gate path)
9. Negative expression suppressed in safety-critical moment
10. Private expression blocked in public channel
11. Desire is internal only and never executes
12. Desire blocked when tracking flag off
13. Repair drafted as inert directive, no manipulation
14. Trust grows slowly, drops carefully
15. Decay fades transient signals, guilt persists
16. Memory candidate staged as proposed (never live)
17. Prelude additive + bounded; off when prelude disabled
18. companion_id isolation keeps state separate
19. Reuses Feedback & Learning (learning) via delegation
20. relationship_arc_enabled=false freezes slow state (no UI config = no fire)

## Expected baseline

The two completed engines must remain green when this engine is added:

```bash
node scripts/verify-feedback-learning.js   # 34/34 PASS
node scripts/verify-emotional-arc.js       # 59/59 PASS
node scripts/verify-relational-state.js    # PASS
```
