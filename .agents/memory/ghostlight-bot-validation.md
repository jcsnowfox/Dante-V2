---
name: ghostlight-bot validation
description: How to validate ghostlight-bot changes — it has no typecheck script.
---

# Validating ghostlight-bot changes

The `@workspace/ghostlight-bot` artifact is plain CommonJS. It has **no `typecheck`
script**, so `pnpm --filter @workspace/ghostlight-bot run typecheck` prints
"None of the selected packages has a 'typecheck' script" and does nothing.

**How to apply / validate instead:**
- Syntax-check touched files individually: `node --check <file>` (catches parse errors).
- Use the `scripts/verify-*.js` harness convention: each major feature has a
  self-contained node verifier that asserts behaviour + admin wiring without a
  real DB (DATABASE_URL is a placeholder in the workspace). Add one per feature
  and run it with its `verify:*` npm script.

**Why:** the pnpm-workspace skill tells you to run `typecheck`, but that guidance
is for the TS artifacts. Don't burn time expecting a typecheck pass here — the
verify scripts + `node --check` are the real signal.

**Gotcha — async checks in the verify harness:** the harness has both `check()`
(sync) and `checkAsync()`. `checkAsync` calls MUST be `await`ed. Without `await`,
the verdict + `process.exit()` fire before the async assertion's microtasks run,
so the check silently never executes and the section prints zero results — yet
the run still shows a green PASS. If a new section's header prints with no checks
under it, look for a missing `await` before `checkAsync`.
