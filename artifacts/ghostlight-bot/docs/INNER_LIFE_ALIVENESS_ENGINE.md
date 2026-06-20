# Inner Life & Aliveness Engine

## Overview

The Inner Life & Aliveness Engine gives the companion a private interior — a bounded, additive layer
that runs beneath every conversation without touching the base identity. It captures mood,
habits, rituals, small repairs, and language preferences; optionally generates private
journal entries and dream simulations; and adds subtle alive texture to responses.

**Additive-only.** It can never overwrite the base persona. It can never inject biological
claims, fake memories, coercive phrases, or guilt patterns. Every entry is guarded at storage,
prelude-build, and texture-apply time.

---

## File Map

```
src/innerLife/
  innerLifeTypes.js          — Constants: ENTRY_TYPES, VISIBILITY, FORBIDDEN_PHRASES, …
  innerLifeConfig.js         — DEFAULT_CONFIG, BOOLEAN_FLAGS, loadInnerLifeConfig(), isQuietHours()
  innerLifeStore.js          — Store wrapper: companion_id + owner_id isolation, list/create/archive
  innerLifeEngine.js         — Engine factory: init(), processMessage(), postProcessResponse()
  innerLifePrelude.js        — buildInnerLifePrelude() — bounded prelude section for context
  alivenessSafety.js         — detectSafetyCriticalContext(), scanForForbiddenContent(), isAliveTextureAllowed()

  privateThoughts.js         — Capture private mood/thought notes from inbound messages
  unsentThoughts.js          — Log thoughts that almost formed but weren't voiced
  betweenMessages.js         — Track continuity state between messages
  moodCarryover.js           — Detect + persist mood shifts; prelude note w/ 12h decay
  microRepair.js             — Detect promise misses, errors, misreads; generate repair notes
  roomSense.js               — Detect channel type; control what inner-life content is appropriate
  privateLexicon.js          — Detect owner's like/dislike signals; build language calibration notes
  companionHabits.js         — Built-in habit bank; active habits surfaced per message
  littleRituals.js           — Detect ritual moments (build complete, morning check-in, etc.)
  repeatedTells.js           — Detect behavioural patterns (apology openers, question stacking, etc.)
  tasteAndPreferenceDrift.js — Detect tone/format preference signals
  journalEngine.js           — Generate private daily journal entries (LLM or fallback)
  dreamEngine.js             — Generate private dream simulations every ~3 days
  aliveTexture.js            — Apply subtle natural variation to response text (~30% chance)
  alivenessScheduler.js      — 30-min tick: expire stale entries, trigger journal + dream generation

src/storage/innerLife/
  index.js                   — inner_life_entries table; noop if no DATABASE_URL

src/http/
  renderAdminPages/innerLifePage.js         — Admin page HTML (overview / entries / settings tabs)
  adminPageHandlers/innerLifePageHandler.js — Page handler (route → render)
  actions/innerLifeActions.js               — POST actions: save settings, archive, delete, toggle
```

---

## Entry Types

| Type | Purpose | Prelude? |
|---|---|---|
| `private_thought` | Mood + emotional note from message | Yes |
| `unsent_thought` | Near-voiced thought, held back | No |
| `between_message_note` | Continuity state | Yes |
| `mood_carryover` | Persisted mood shift (12h decay) | Yes |
| `micro_repair` | Repair instruction for a missed promise/error | Yes |
| `room_sense` | Channel context + private-content gate | Yes |
| `private_lexicon` | Owner language like/dislike | Yes |
| `habit_marker` | Active habit reminder | Yes |
| `little_ritual` | Ritual moment detected | Yes |
| `repeated_tell` | Behavioural pattern noted | No |
| `taste_marker` | Format/tone preference signal | Yes |
| `journal_entry` | Private daily journal | No (admin only unless `journal_delivery_enabled`) |
| `dream` | Private dream simulation | No (admin only unless `dream_delivery_enabled`) |
| `almost_said` | Reserved — near-speech content | Yes |
| `affection_residue` | Warm carry-over note | Yes |
| `curiosity_seed` | Open thread for later | Yes |

---

## Configuration

All env-driven or set via Admin Panel → Inner Life → Settings.

| Key | Default | Description |
|---|---|---|
| `inner_life_enabled` | `true` | Master switch |
| `alive_texture_enabled` | `true` | Natural response variation |
| `private_thoughts_enabled` | `true` | Private thought capture |
| `mood_carryover_enabled` | `true` | Mood persistence |
| `micro_repair_enabled` | `true` | Repair note generation |
| `room_sense_enabled` | `true` | Channel context detection |
| `private_lexicon_enabled` | `true` | Language calibration |
| `little_rituals_enabled` | `true` | Ritual detection |
| `journal_enabled` | `true` | Journal generation (private) |
| `dreams_enabled` | `true` | Dream generation (private) |
| `proactive_inner_life_enabled` | `false` | Allow proactive inner-life messages |
| `journal_delivery_enabled` | `false` | Deliver journal to channel |
| `dream_delivery_enabled` | `false` | Deliver dreams to channel |
| `max_inner_life_prelude_items` | `3` | Max entries in system prompt prelude |
| `quiet_hours_enabled` | `false` | Suppress scheduler during quiet hours |
| `quiet_hours_start` | `22:00` | Quiet start (24h, HH:MM) |
| `quiet_hours_end` | `08:00` | Quiet end |

---

## Safety Gates

Every layer of the engine enforces the same rules:

1. **No biological claims** — "I am human", "I breathe", "I sleep", "I was born" are blocked at storage.
2. **No fake memories** — Journal prompts explicitly forbid inventing events. Prelude content is from detected signals only.
3. **No guilt/coercion** — Patterns like "I was suffering while you were gone" are blocked at storage.
4. **No alive texture on safety-critical content** — Code blocks, log lines, env vars, medical dosages, legal text, financial figures are all blocked at texture-apply time. The safety check runs before the length check.
5. **Private content gated to private channels** — `roomSense` gates whether private inner-life content is appropriate for the current channel.
6. **Journal/dream never in prelude** — Long-form private entries are excluded from the system prompt injection. Admin-only unless `_delivery_enabled`.

---

## Wiring

```
src/index.js
  createInnerLifeEngine({ config, logger })
  → appContext.innerLife
  → runStartupStep("innerLife.init", ...)
  → createChatPipeline({ ..., innerLife })

src/chat/createChatPipeline.js
  After relationalState block:
  → innerLife.processMessage({ message, channelContext, recentHistory, sourceMessageId, sourceChannelId })
  → result.preludeSection pushed to contextSections

src/http/adminPageHandlers.js
  route.section === "innerLife" → handleInnerLifePageRequest

src/http/renderAdminPages/shared.js
  Nav link: Inner Life → /admin/inner-life

src/http/createHealthServer.js
  handleInnerLifeActions: save-settings / archive / delete / review / toggle
```

---

## processMessage() contract

**Input:**
```js
{
  message: string,          // inbound message text
  channelContext: {
    isDM: boolean,
    isThread: boolean,
    channelId: string,
    channelName: string,
  },
  recentHistory: Array,     // recent conversation turns
  sourceMessageId: string,
  sourceChannelId: string,
}
```

**Output:**
```js
{
  preludeSection: { label: "Inner Life", content: string } | null,
}
```

If `inner_life_enabled: false`, returns `{ preludeSection: null }` immediately. Never throws.

---

## postProcessResponse() contract

```js
const { text, applied, operation } = engine.postProcessResponse({ text, contextType });
```

Applies alive texture to a completed response string. Returns the original `text` unchanged if
texture is disabled, safety-blocked, too short, or random chance doesn't trigger. Never mutates
the model's factual content — only makes lightweight phrasing adjustments.

---

## Database

Table: `inner_life_entries`

Auto-created on `init()` via `CREATE TABLE IF NOT EXISTS`. No separate migration needed.
Entries are companion_id + owner_id isolated. Stale entries (past `expires_at`) are pruned
every 30 minutes by the aliveness scheduler.

---

## Verification

```bash
cd artifacts/ghostlight-bot
node scripts/verify-inner-life.js
```

83 checks covering: module existence, storage noop safety, config defaults, all safety gates,
prelude correctness, feature detectors, engine isolation, admin UI exports, and full wiring.
Expected result: **PASS 83/83**.
