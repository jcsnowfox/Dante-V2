## What changed

<!-- One-paragraph summary. What was added, removed, or modified? -->

## Why

<!-- What problem does this solve? What requirement or failure prompted it? -->

## Runtime touched

Check all that apply — unchecked means untouched.

- [ ] `src/index.js` — startup order or engine wiring
- [ ] `src/chat/createChatPipeline.js` — pipeline or context injection
- [ ] `src/bot/events/messageCreate.js` — Discord inbound routing
- [ ] `src/automations/runners.js` — production send path
- [ ] `src/runtime/schedulerRegistry.js` — scheduler lifecycle
- [ ] `src/storage/postgres/schemaRegistry.js` — Postgres schema (additive only)
- [ ] New Postgres tables added (list them below)
- [ ] None of the above — docs/scripts/dashboard only

## Verification run

- [ ] `cd artifacts/ghostlight-bot && node --test` — all tests pass (list count: N/N)
- [ ] `node scripts/audit-active-runtime.js` — AUDIT_PASS
- [ ] `node scripts/verify-life-wiring.js` — LIFE_WIRING_PASS
- [ ] `node scripts/verify-dashboard-not-broken.js` — DASHBOARD_PROOF_PASS
- [ ] `node scripts/verify-alive-layer-proof.js` — ALIVE_PROOF_PASS

Paste the final line of each script's output below:

```
node --test: 
audit-active-runtime: 
verify-life-wiring: 
verify-dashboard-not-broken: 
verify-alive-layer-proof: 
```

## Dashboard modified

- [ ] Yes — describe what changed in the admin UI:
- [ ] No

## Rollback plan

<!-- How would you revert this if it causes a production issue? (git revert <sha>, env var toggle, etc.) -->
