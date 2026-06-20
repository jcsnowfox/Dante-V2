# Feedback & Learning Engine — Verification

Run from `artifacts/ghostlight-bot`:

```bash
node scripts/verify-feedback-learning.js
```

The script runs an **in-memory** proof harness (no `DATABASE_URL` needed) plus
source-level wiring checks, then prints a PASS / NO GO verdict.

## What is verified

### 1. Engine safety guarantees (in-memory harness)

| # | Check | Guarantee |
|---|-------|-----------|
| 1 | Default config safety posture is off | All gating flags default off, `review_required` true |
| 2 | Inert when no settings row exists | Fail-safe: no config ⇒ no-op |
| 3 | Inert when settings row disabled | Owner master switch respected |
| 4 | Inert when `config.enabled` false | Config-level master switch respected |
| 5 | companion_id isolation blocks foreign proposals | Strict per-companion isolation |
| 6 | Feedback recorded and proposal drafted | Happy path works when enabled |
| 7 | Proposal stays pending without approval | Review-first, no silent apply |
| 8 | Gate blocks apply when type flag disabled | "Not configurable ⇒ does not fire" |
| 9 | Memory candidates require staged review | Memory never written as canon |
| 10 | Gate blocks forbidden keys | Identity / provider / secrets protected |
| 11 | Gate blocks unsafe directives | Manipulation-style changes rejected |
| 12 | Approved rule applies and feeds prelude | Approve → apply → additive prelude |
| 13 | No-UI target blocked + memory candidate staged | UI-only surface + safe staging |

### 2. Admin dashboard wiring

Nav link, route-state mapping, GET allowlist, page handler dispatch, render page +
save form, and the registered POST actions (save / submit / proposal).

### 3. Chat pipeline + index.js wiring

Pipeline calls `feedbackLearning.processMessage`; `index.js` constructs, inits, and
passes the engine into the pipeline and appContext.

### 4. Render page end-to-end

The admin page renders the save/submit/proposal forms, a proposal row, and the
audit table.

### 5. Documentation

The plan, engine, and verification docs are present.

## Expected verdict

```
  VERDICT:  ✅ PASS
```
