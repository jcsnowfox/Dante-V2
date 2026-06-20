# Feedback & Learning Engine

An owner-configurable layer that turns owner feedback into **owner-approved**
behaviour rules, applied additively to replies. It never changes the companion's
identity or model provider, and is fully inert until enabled in the Admin UI.

## How it works

```
owner feedback ─▶ feedback event ─▶ learning proposal (pending_review)
                                          │
                            owner approves in Admin UI
                                          │
                                application gate (safety)
                                          │
                                  applied rule (stored)
                                          │
                       prelude builder ─▶ optional context section
                                          │
                            appended to the next reply (additive)
```

Memory-type feedback never becomes canon — it is staged as a *memory candidate*
for separate review.

## Configuration (Admin → Feedback & Learning)

This page is the **only** place the engine is configured. Every behaviour has a
toggle; if a toggle is off, that behaviour cannot fire.

- **Engine enabled** — master switch. Off ⇒ fully inert.
- **Feedback buttons / Freeform feedback** — which feedback channels are allowed.
- **Learning proposals** — draft proposals from feedback.
- **Auto-apply (advanced)** — apply approved-equivalent proposals without manual
  review. Off by default; still passes the application gate.
- **Review required** — force manual review before applying.
- **Memory candidates** — stage memory candidates (never live).
- **Per-domain tuning toggles** — communication, voice/style, emotion, tool
  behaviour, autonomy, blocked phrases, repair. Each is independently gated.
- **Max learning proposals per day** — rate limit.

## Safety: the application gate

`feedbackApplicationGate.canApply()` blocks an apply unless **all** hold:

- companion_id matches (isolation).
- proposal status is `approved` (or auto-apply explicitly enabled).
- the proposal's type flag and target-system flag are enabled in config.
- the target system is UI-configurable (`UI_CONFIGURABLE_TARGET_SYSTEMS`).
- the proposed change contains no forbidden keys (identity / provider / secrets).
- the proposed change contains no unsafe directive (e.g. manipulation).
- memory candidates are routed to staged review, never applied as a live change.

## Fail-safe behaviour

- No `DATABASE_URL` / no pool ⇒ store is inert, engine stays inactive.
- No settings row, disabled row, or `config.enabled` false ⇒ every method no-ops.
- Any thrown error in `processMessage` is caught; the base reply proceeds without
  a prelude.

## Files

- `src/companionSystems/feedbackLearning/` — engine modules + factory.
- `src/storage/feedbackLearning/index.js` — 5 companion_id-isolated tables.
- `src/http/renderAdminPages/feedbackLearningPage.js`,
  `src/http/adminPageHandlers/feedbackLearningPageHandler.js`,
  `src/http/actions/feedbackLearningActions.js` — admin UI.
- Wiring: `src/index.js`, `src/chat/createChatPipeline.js`.

## Logs

All engine telemetry is tagged `[feedback-learning:*]`.
