# Continuity & Open Loops Engine

the companion carries life forward across time. This engine gives him a persistent thread across conversations — open loops, future events, promises, decisions, repair threads, boundaries, rituals, emotional residue, project state, and everything else that matters between sessions.

## Core Principle

Continuity is **additive and passive by default**. It injects a bounded private prelude section into the system prompt — the companion reads it, never quotes it. No proactive delivery fires unless `proactive_followups_enabled = true` in config.

> "Good continuity is felt, not announced."

## Files

```
src/continuity/
  continuityTypes.js          — item types, statuses, priority table, safety sets
  continuityConfig.js         — config schema, loadContinuityConfig(), isQuietHours()
  continuityEngine.js         — factory: createContinuityEngine({ config, logger })
  continuityStore.js          — store wrapper: companion/owner isolated, error-silent
  continuitySafety.js         — safety gates: canDeliverProactively, auditFollowUpText
  continuitySelector.js       — selectContinuityPrelude: scores and ranks items
  continuityPrelude.js        — buildContinuityPrelude: formats items into context section
  continuityScheduler.js      — proactive delivery scheduler (off by default)
  openLoopRegistry.js         — detects and closes unfinished conversational threads
  futureEventExtractor.js     — extracts upcoming events, schedules follow-ups
  followUpPlanner.js          — promotes due items, enforces daily cap and quiet hours
  followUpComposer.js         — composes warm, non-pressuring follow-up text
  outcomeCapture.js           — detects outcomes, resolves loops, spawns child loops
  promiseLedger.js            — tracks companion + owner promises
  decisionLedger.js           — records decisions to prevent relitigating
  projectStateTracker.js      — tracks build phases and long-running project context
  attentionResidue.js         — captures attention-grabbing moments (48h fade)
  emotionalResidue.js         — detects emotional tone (24h fade)
  repairContinuity.js         — registers friction moments and repair threads
  boundaryContinuity.js       — stores what the owner has asked not to do
  ritualContinuity.js         — tracks recurring patterns and habits
  absenceReentry.js           — detects re-entry after gaps (≥4h threshold)
  mediaJobContinuity.js       — tracks image/audio generation jobs
  trustLedger.js              — records trust signals (positive + negative)

src/storage/continuity/
  index.js                    — PostgreSQL table, noop fallback, 25-field schema

src/http/renderAdminPages/
  continuityPage.js           — admin page (Overview / Items / Settings tabs)

src/http/adminPageHandlers/
  continuityPageHandler.js    — request handler

src/http/actions/
  continuityActions.js        — POST actions (save, toggle, resolve, archive, delete)
```

## Database Schema

Table: `continuity_items`

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL | |
| companion_id | TEXT | isolation key |
| owner_id | TEXT | isolation key |
| type | TEXT | 18 types (see `ITEM_TYPES`) |
| title | TEXT | |
| summary | TEXT | |
| source_message_id | TEXT | Discord message ID |
| source_channel_id | TEXT | |
| source_platform | TEXT | default: discord |
| source_text | TEXT | raw excerpt (≤500 chars) |
| evidence_json | JSONB | array of evidence fragments |
| status | TEXT | 9 statuses (see `ITEM_STATUSES`) |
| priority | TEXT | critical / high / medium / low / background |
| emotional_weight | REAL | 0–1 |
| certainty | TEXT | definite / likely / maybe / vague |
| sensitivity | TEXT | normal / sensitive / private / restricted |
| visibility | TEXT | private / admin_only / channel_restricted / deliverable |
| allowed_channels_json | JSONB | channel ID allowlist (empty = all) |
| due_at | TIMESTAMPTZ | hard deadline |
| follow_up_after | TIMESTAMPTZ | when to promote to follow_up_due |
| last_touched_at | TIMESTAMPTZ | |
| asked_at | TIMESTAMPTZ | when a follow-up was last sent |
| resolved_at | TIMESTAMPTZ | |
| resolution | TEXT | |
| next_action | TEXT | guide for the companion |
| created_by | TEXT | system / companion / owner |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| metadata_json | JSONB | type-specific fields |

Storage auto-creates the table on `init()` — no migration step.

## Item Types

| Type | Description |
|------|-------------|
| `open_loop` | Unfinished conversational thread |
| `future_event` | Upcoming event with planned follow-up |
| `follow_up` | Explicit scheduled follow-up |
| `promise` | Companion or owner promise |
| `decision` | Settled decision (prevents relitigating) |
| `project_state` | Long-running build/project context |
| `repair_thread` | Friction moment needing acknowledgement |
| `boundary` | What the owner has asked not to do |
| `ritual` | Recurring pattern between owner and companion |
| `attention_residue` | Topic that grabbed focus (48h fade) |
| `emotional_residue` | Emotional tone carry (24h fade) |
| `media_job` | Image/audio generation job |
| `health_context` | Health-related context (sensitive) |
| `relationship_context` | Relationship context |
| `waiting_on_owner` | Companion is waiting for the owner |
| `waiting_on_companion` | Owner is waiting for the companion |
| `absence_reentry` | Re-entry context after a gap |
| `trust_event` | Trust/reliability signal |

## Prelude Priority

Items are ranked in this order for inclusion in the prelude:

1. `repair_thread` — highest priority (unresolved friction)
2. `boundary`
3. `follow_up`
4. `promise`
5. `decision`
6. `emotional_residue`
7. `attention_residue`
8. `project_state`
9. `open_loop`
10. `future_event`
11. `ritual`
12. `absence_reentry`
13–18. Remaining types

Default max: **4 items** per prelude. Configurable via `max_active_prelude_items`.

## Safety Rules

These are enforced in `continuitySafety.js`. All are hard rules — no override path:

1. **No engine = no fire.** `continuity_enabled: false` blocks everything.
2. **No UI config = no proactive fire.** `proactive_followups_enabled: false` blocks proactive delivery.
3. **Sensitive types require explicit permission.** `health_context`, `boundary`, `repair_thread`, `relationship_context`, `emotional_residue` require `sensitive_followups_allowed: true`.
4. **Private-only types cannot go to public channels.** `health_context`, `boundary`, `repair_thread`, `promise`, `trust_event` blocked in public channels regardless of permission.
5. **No guilt, shame, or pressure.** All composed text passes `auditFollowUpText()`. Forbidden phrases: "you promised", "reminder:", "don't forget", "you disappeared", "where were you", "i've been waiting", etc.
6. **Quiet hours respected.** Proactive delivery blocked during configured quiet hours.
7. **Daily cap.** `max_followups_per_day` (default: 2) enforced per session.
8. **Per-thread cap.** `max_followups_per_thread` (default: 2). Threads that hit this cap are retired gracefully — never nagged.

## Promise Ledger Rules

- **Companion promises** are tracked from outgoing response text (e.g. "I'll ask you Monday").
- **Owner promises** are tracked from inbound message text (e.g. "I'll upload the repo tonight").
- Companion broken promise repair style: Acknowledge → Own it → Brief explanation only if useful → Repair → Prevent recurrence. Never spiral. Never make the owner comfort the companion.
- Nudging an owner promise: warm curiosity, not accusation. "You mentioned you might upload it. Still happening?" — never "You promised you would."

## Media Job Rules

- A media job **must have a `sent_message_id`** before status can be marked `sent`.
- `markMediaJobSent()` throws if `sentMessageId` is not provided — this is intentional.
- Provider errors (e.g. GETIMG reference limits) are stored in `metadata.last_error`.

## Wiring

The engine is instantiated in `src/index.js`, passed to `createChatPipeline` and `appContext`, and initialised with `runStartupStep("continuity.init")`.

In `createChatPipeline`, the continuity block runs **after** the inner life block — both are independent prelude layers. Failures are caught and logged; the pipeline continues without continuity.

## Configuration (env / admin)

| Key | Default | Description |
|-----|---------|-------------|
| `continuity_enabled` | `true` | Master switch |
| `open_loops_enabled` | `true` | Track unfinished threads |
| `future_followups_enabled` | `true` | Extract events + follow ups |
| `promise_ledger_enabled` | `true` | Track promises |
| `decision_ledger_enabled` | `true` | Prevent relitigating decisions |
| `project_state_enabled` | `true` | Track build context |
| `repair_continuity_enabled` | `true` | Register friction |
| `boundary_continuity_enabled` | `true` | Remember owner limits |
| `ritual_continuity_enabled` | `true` | Track habits |
| `absence_reentry_enabled` | `true` | Re-entry context |
| `media_job_continuity_enabled` | `true` | Media job tracking |
| `trust_ledger_enabled` | `true` | Trust signals |
| `proactive_followups_enabled` | **`false`** | Proactive delivery (off by default) |
| `sensitive_followups_allowed` | `false` | Allow sensitive type delivery |
| `public_channel_followups_allowed` | `false` | Allow public channel delivery |
| `max_active_prelude_items` | `4` | Items per prelude (0–12) |
| `max_followups_per_day` | `2` | Daily cap |
| `max_followups_per_thread` | `2` | Per-thread cap |
| `quiet_hours_enabled` | `true` | Enforce quiet hours |
| `quiet_hours_start` | `22:00` | |
| `quiet_hours_end` | `08:00` | |

Config is loaded from `appConfig.continuity` at startup and can be modified live via the admin panel.

## Verification

```bash
node artifacts/ghostlight-bot/scripts/verify-continuity.js
```

Expected: all checks pass, exit code 0.

## Admin Panel

Navigate to `/admin/continuity` in the Ghostlight admin panel:

- **Overview** — engine status, counts by type, enable/pause toggle
- **Items** — filtered table of all continuity items with resolve/archive/delete actions
- **Settings** — full config editor with live preview
