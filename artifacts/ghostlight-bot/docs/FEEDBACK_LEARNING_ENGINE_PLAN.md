# Feedback & Learning Engine — Plan (Phase 0)

A reusable, owner-configurable layer that lets the companion's owner give feedback
on replies and, over time, accumulate **owner-approved** behaviour rules — without
ever changing the companion's identity, the model provider, or the Ghostlight base.

## Hard constraints (non-negotiable)

1. **Additive only.** Nothing in the Ghostlight base is overwritten or refactored.
   The engine only *appends* an optional internal "prelude" context section to a
   reply, exactly like the Emotional Arc engine.
2. **Identity & provider are off-limits.** The engine can never change the
   companion's name/persona or the model provider. The application gate hard-blocks
   any proposed change touching identity/provider/secret keys.
3. **Owner-config only — "if it's not configurable in the Admin UI, it does not
   fire."** Every behaviour is gated behind an explicit Admin toggle stored in
   `companion_system_settings` (system_key = `feedback_learning`).
4. **Fail-safe.** No database, no settings row, disabled row, or `config.enabled`
   false ⇒ the engine is fully inert and every method is a guarded no-op. A
   failure inside the engine can never break the base reply.
5. **companion_id isolation.** Every read/write and the application gate are scoped
   to a deterministic companion_id derived from the persona.
6. **Review-first.** Proposals default to `pending_review`. Nothing is applied
   without passing the application gate; memory candidates are *always* staged for
   review and never written as canon.

## Mirror

The engine mirrors the structure and conventions of `companionSystems/emotionalArc`:
factory in `index.js`, a settings/state service, an audit log, a store under
`storage/`, an admin page + handler + actions, and a chat-pipeline prelude hook.

## Components

- `companionSystems/feedbackLearning/` — engine modules (types, config schema,
  settings/event/proposal services, audit log, learning engine, application gate,
  memory hooks, prelude builder, verification harness, factory `index.js`).
- `storage/feedbackLearning/index.js` — 5 isolated tables, `CREATE TABLE IF NOT
  EXISTS`, inert with no pool.
- `http/renderAdminPages/feedbackLearningPage.js` + `adminPageHandlers/
  feedbackLearningPageHandler.js` + `actions/feedbackLearningActions.js` — the
  single place the engine is configured and operated.
- Wiring: `index.js` (construct/init/appContext), `createChatPipeline.js` (guarded
  prelude hook), and the admin registry/nav/route/allowlist.

## Acceptance

- 13-check in-memory verification passes (no DB required).
- `node scripts/verify-feedback-learning.js` prints a PASS verdict.
- Bot boots clean with the engine inert by default.
