# Dante-V2 Architecture Map

**Active production source:** `artifacts/ghostlight-bot/src/`
**Entrypoint:** `artifacts/ghostlight-bot/src/index.js` (691 lines)

---

## System Index

| System | Directory | Status |
|--------|-----------|--------|
| Entrypoint | `src/index.js` | ACTIVE |
| Discord inbound | `src/bot/` | ACTIVE |
| Chat pipeline | `src/chat/` | ACTIVE |
| Alive Layer | `src/alive/` | ACTIVE |
| Inner Life | `src/innerLife/` | ACTIVE |
| Continuity | `src/continuity/` | ACTIVE |
| Human Simulation | `src/humanSimulation/` | ACTIVE |
| Life Engine (Second Life) | `src/lifeEngine/` + `src/secondLife/` | ACTIVE |
| Companion Systems | `src/companionSystems/` | ACTIVE |
| Memory | `src/memory/` | ACTIVE |
| Automations / Heartbeat | `src/automations/` + `src/heartbeat/` | ACTIVE |
| Media (images/audio/GIF) | `src/images/` + `src/audio/` + `src/media/` | ACTIVE |
| Tools | `src/tools/` | ACTIVE |
| Admin Dashboard | `src/http/` | ACTIVE |
| Storage | `src/storage/` | ACTIVE |
| Norwegian Learning | `src/norwegian/` | ACTIVE |
| Games | `src/games/` | ACTIVE |
| Awareness | `src/awareness/` | ACTIVE |
| Second Life Adapter | `src/channels/` | ACTIVE |
| Proactive Actions | `src/proactiveActions/` | ACTIVE |
| Scheduler Registry | `src/runtime/schedulerRegistry.js` | ACTIVE |
| Life Barrel | `src/life/index.js` | ACTIVE |

---

## 1. Entrypoint

**Purpose:** Bootstrap all stores, engines, services, and schedulers. Wire Discord client.

**File:** `src/index.js`

**Startup order:**
1. Load config → apply runtime settings → create logger
2. `runSchemaGuard()` — create 86 Postgres tables if missing
3. Initialize 32+ stores (memory, music, settings, behavioral)
4. Create services: Discord client, chat pipeline, memory curator, music
5. Create and init 12+ behavioral engines
6. Register Discord event handlers
7. `aliveEngine.start()` — begins absence-assessment interval (pre-login)
8. `client.login()` — connect to Discord
9. `schedulerRegistry.startPostLogin()` — automationRunner, heartbeat, secondLifeLifeEngine, emotionalArc.scheduler
10. `automationRunner.runNow()` — immediate first run

**Env vars:** `DISCORD_TOKEN`, `DATABASE_URL`, `LOG_LEVEL`, `NODE_ENV`, `PORT`

**Status:** ACTIVE

---

## 2. Discord Inbound Path

**Purpose:** Receive Discord messages, route to chat pipeline, deliver reply.

**Files:**
- `src/bot/createDiscordClient.js` — Discord.js v14 client factory
- `src/bot/registerEventHandlers.js` — wires `messageCreate`, `interactionCreate`, `ready`
- `src/bot/events/messageCreate.js` — main handler (32KB)

**Flow:**
```
Discord API → messageCreate event
  → validate message (is bot mention? thread reply?)
  → chatPipeline.run({ message, mode, modeName })
  → split reply into ≤5 chunks of ≤2000 chars
  → channel.send() each chunk
  → trigger audio generation if voice note active
```

**Called by:** Discord gateway
**Calls into:** `chatPipeline.run()`, `channel.send()`, audio generation

**Status:** ACTIVE

---

## 3. Chat Pipeline

**Purpose:** Transform an inbound Discord message into a companion reply. Assembles all context, calls LLM, runs tool loop.

**Main file:** `src/chat/createChatPipeline.js` (1035 lines)

**Pipeline stages (src/chat/pipeline/):**
1. `preprocessMessage` — strip mentions, validate
2. `enrichInput` — URLs, attachments, image context
3. `loadScopedRecentHistory` — conversation history from DB
4. `retrieveMemory` — Qdrant vector search
5. `buildChatRequest` — assemble API payload
6. `callModel` — LLM call with streaming + tool loop (30KB)
7. `buildReply` — format, split, apply reactions

**Context sections injected (in order):**
1. System prompt (`src/chat/prompt/buildSystemPrompt.js`)
2. Alive Layer prelude — `buildAliveContextPrelude()` (presence, scores, repair, space)
3. Backbone pushback guidance — `checkBackbone()` / `buildBackboneSection()`
4. Emotional beat — `classifyEmotionalBeat()`
5. Promise/continuity ledger entries
6. Tone mode — `resolveToneMode()` (adult mode, voice guard)
7. Main user presence — `buildMainUserPresenceContextSection()`
8. Image conversation state
9. Model context — cross-channel awareness, URLs
10. Human simulation — micro-preferences, inner weather, user energy
11. Situational awareness — recent decisions, timed notes
12. Inner life texture — via `innerLife`

**Post-reply:** `alivePostUpdate()` fires fire-and-forget to update presence scores.

**Parameters (key):** `config, logger, memory, tools, conversations, emotionalArc, feedbackLearning, relationalState, innerLife, continuity, humanSimulation, alivePresenceStore, aliveEventsStore, intentionQueue`

**Called by:** `messageCreate.js` (Discord), `automations/runners.js` (proactive sends)
**Calls into:** LLM client, tool registry, memory, alive layer, continuity, inner life

**Storage tables:** `conversation_events`, `memories`, `staged_memories`

**Env vars:** `OPENAI_API_KEY` (or configured LLM provider)

**Status:** ACTIVE — single authoritative context assembly point

---

## 4. Alive Layer

**Purpose:** Companion "alive" presence — tracks absence, enqueues intentions, dispatches unprompted outreach, injects live state into every LLM call.

**Directory:** `src/alive/`

**Files:**
| File | Purpose |
|------|---------|
| `aliveEngine.js` | Assesses absence, enforces daily cap / cooldown / quiet hours, enqueues intentions |
| `aliveExecutor.js` | Reads pending intentions, executes via `runCheckInAutomation`, guards `ALIVE_UNPROMPTED_ENABLED` + `ALIVE_TARGET_CHANNEL_ID`, suppresses during `give_space`, `repair_bridge` bypasses suppression |
| `aliveEventsStore.js` | Append-only event log (intention_created, presence_update, reachout_sent) |
| `alivePresenceStore.js` | Postgres-backed presence record: energy, mood, scores, spaceState, giveSpace, repairNeeded |
| `intentionQueueStore.js` | Priority queue of pending outreach intentions |
| `aliveContextBuilder.js` | Builds private LLM prelude from presence state |
| `alivePostUpdate.js` | Post-message score adjustment + repair_bridge enqueue |
| `backbonePolicy.js` | 8-pattern pushback detector (force merge, quick fix, spiraling, etc.) |

**Called by:** `index.js` (engine.start), `createChatPipeline.js` (context + post-update)
**Calls into:** `runCheckInAutomation` (automations/runners.js), `alivePresenceStore`, `aliveEventsStore`, `intentionQueueStore`

**Storage tables:** `alive_events`, `alive_presence_state`, `intention_queue`

**Env vars:**
- `ALIVE_ENABLED` — enable/disable engine (default: disabled)
- `ALIVE_UNPROMPTED_ENABLED` — allow executor to send (default: disabled)
- `ALIVE_TARGET_CHANNEL_ID` — Discord channel for outreach
- `ALIVE_QUIET_HOURS_START` / `ALIVE_QUIET_HOURS_END` — quiet window (default 23-7 UTC)
- `ALIVE_TIMEZONE` — timezone for quiet hours

**Tests:** `src/alive/__tests__/` (5 files, 48 tests)

**Status:** ACTIVE

---

## 5. Inner Life

**Purpose:** Internal monologue, private thoughts, dreams, habits, mood carryover — makes companion feel continuous and real between conversations.

**Directory:** `src/innerLife/`

**Key files:**
- `innerLifeEngine.js` — orchestrator
- `innerLifeStore.js` — persistence
- `alivenessScheduler.js` — schedules aliveness updates
- `dreamEngine.js` — offline dream generation
- `journalEngine.js` — private journal entries
- `privateThoughts.js` — unspoken internal monologue
- `moodCarryover.js` — emotion persistence across messages
- `aliveTexture.js` — applies texture to responses

**Called by:** `index.js` (init), `createChatPipeline.js` (context injection)
**Calls into:** LLM client (dream/journal generation), `storage/journals`

**Storage tables:** `inner_life_entries`, `journal_entries`

**Status:** ACTIVE

---

## 6. Continuity

**Purpose:** Remember promises, emotional beats, conversation history. Detect voice drift. Prevent duplicate replies.

**Directory:** `src/continuity/`

**Key files:**
- `continuityEngine.js` — orchestrator
- `emotionalBeats.js` — classify and persist emotional events
- `promiseLedger.js` — track made/kept/broken promises
- `toneModeResolver.js` — determine appropriate response tone
- `voiceFingerprintGuard.js` — detect character/voice drift
- `replyFallbacks.js` — block near-identical recent replies
- `followUpComposer.js` + `followUpPlanner.js` — craft and schedule follow-ups
- `repairContinuity.js` — handle continuity breaks

**Called by:** `index.js` (init), `createChatPipeline.js` (promise detection, tone, voice guard)
**Calls into:** LLM, storage stores

**Storage tables:** `companion_emotional_beats`, `companion_promises`, `conversation_followup_state`

**Status:** ACTIVE

---

## 7. Human Simulation

**Purpose:** Make responses feel human — energy swings, attention residue, topic memory per channel, boundary enforcement, follow-up scheduling.

**Directory:** `src/humanSimulation/`

**Key files:**
- `humanSimulationEngine.js` — orchestrator (16KB)
- `attentionResidueEngine.js` — focus lingers from previous topic
- `boundaryConsentEngine.js` — enforce conversation boundaries
- `doNotAskEngine.js` — never revisit blocked topics
- `innerWeatherEngine.js` — mood/energy fluctuation
- `microPreferenceLearner.js` — learns preferences real-time
- `userEnergyEngine.js` — detect fatigue/engagement
- `followUpScheduler.js` — time follow-up messages
- `channelAwarenessMap.js` — track topics per channel
- `silenceBehaviorEngine.js` — realistic idle gaps

**Called by:** `index.js` (init), `createChatPipeline.js` (context injection)
**Calls into:** LLM, storage stores

**Storage tables:** `companion_micro_preferences`, `inner_weather_state`, `attention_residue`, `boundary_consent_profiles`, `do_not_ask_rules`, `user_energy_observations`, `companion_channel_awareness`, `companion_follow_up_items`, `companion_timeline_events`

**Status:** ACTIVE

---

## 8. Life Engine (Second Life)

**Purpose:** Autonomous companion goals, discovery, social relationships, and schedule — primarily for the Second Life virtual world integration.

**Directories:** `src/lifeEngine/` + `src/secondLife/`

**lifeEngine/ files:** `autonomyEngine`, `dailyScheduleEngine`, `discoveryEngine`, `emotionalStateEngine`, `goalEngine`, `initiativeEngine`, `presenceEngine`, `relationshipEngine`, `sharedExperienceEngine`, `socialIntelligenceEngine`, `worldAwarenessEngine`, `memoryEngineBridge`, `index.js`

**secondLife/ files:** `slIdentityResolver`, `slSocialEngine`, `slCommandRegistry`, `slOutfitManager`, `slLandmarkManager`, `slMovementEngine`, `slObjectInteractionEngine`

**channels/secondLifeAdapter.js** — bridge between Second Life HTTP callbacks and Discord/companion systems

**Called by:** `index.js` (init + schedulerRegistry secondLifeLifeEngine tick)
**Calls into:** LLM, companion, storage

**Storage tables:** `second_life_bridge_settings`, `second_life_avatar_relationships`, `second_life_outfits`, `second_life_landmarks`, `second_life_objects`, `second_life_commands`, `second_life_world_state`, `second_life_life_journal`, `second_life_discoveries`, `second_life_shared_experiences`, `second_life_goals`, `second_life_initiatives`

**Env vars:** `SECOND_LIFE_ENABLED`, `SECOND_LIFE_BRIDGE_TOKEN`

**Status:** ACTIVE (conditional on config)

---

## 9. Companion Systems

**Purpose:** Emotional arc tracking, feedback learning, relational state — meta-level state tracking above individual messages.

**Directory:** `src/companionSystems/`

**Files:**
- `emotionalArc.js` — tracks emotional narrative arc across sessions
- `feedbackLearning.js` — learns from user feedback signals
- `relationalState.js` — models relationship depth/trust/affection

**Called by:** `index.js` (init + `emotionalArc.scheduler.start()`), `createChatPipeline.js`
**Status:** ACTIVE

---

## 10. Memory

**Purpose:** Long-term memory storage and retrieval via Qdrant vector search + Postgres.

**Directory:** `src/memory/`

**Key files:**
- `curator.js` — memory curation engine
- `index.js` — `createMemoryService` factory
- `qdrantClient.js` — vector DB client
- `curatorPrompts.js` (30KB) — classification prompts
- `syncMemories.js` — Qdrant sync
- `embeddings.js` — compute embeddings
- `saveRequest.js` — save handler (16KB)

**Called by:** `createChatPipeline.js` (retrieve on every message), tools (`save_memory`, `search_memories`)
**Calls into:** Qdrant, OpenAI embeddings, Postgres

**Storage tables:** `memories`, `staged_memories`, `memory_usage_events`

**Env vars:** `QDRANT_URL`, `QDRANT_API_KEY`, `OPENAI_API_KEY` (for embeddings)

**Status:** ACTIVE

---

## 11. Automations / Heartbeat

**Purpose:** Recurring scheduled tasks — daily summaries, weekly recaps, journal curation, proactive messages, daily threads.

**Directories:** `src/automations/` + `src/heartbeat/`

**automations/ key files:**
- `index.js` — `createAutomationRunner`
- `runners.js` — `runCheckInAutomation` (the ONE production send path, used by alive executor and all proactive sends)
- `curator.js` — memory curation automation
- `dailyThreadAction.js` — daily forum thread
- `summaries.js` — conversation summarization

**heartbeat/ key files:**
- `index.js` — `createHeartbeatService`
- `conductor.js` — schedules and fires heartbeat ticks
- `executors.js` — execute heartbeat action types
- `helpers.js` — date/time helpers

**Called by:** `schedulerRegistry` (post-login start)
**Calls into:** LLM, Discord `channel.send()`, memory, storage

**Storage tables:** `automations`, `heartbeat_actions`

**Status:** ACTIVE

---

## 12. Media (Images / Audio / GIF)

**Purpose:** Generate and deliver images (DALL-E 3), audio (Fish Audio TTS), and GIFs.

**Directories:** `src/images/`, `src/audio/`, `src/media/`

**images/ files:** `generateImage.js` (21KB), `presetContext.js`, `bucketStorage.js` (S3), `analyzeImage.js`
**audio/ files:** `generateAudio.js` (16KB), `latestReplyCache.js`, `galleryPolicy.js`, `providers/`
**media/ files:** `gifUrlNormalizer.js`

**Called by:** `tools/mediaTools.js` (via tool loop), `automations/runners.js` (alive executor media sends)
**Calls into:** OpenAI DALL-E API, Fish Audio API, S3

**Storage tables:** `generated_images`, `generated_audio`

**Env vars:** `OPENAI_API_KEY`, `FISH_AUDIO_API_KEY`, `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

**Status:** ACTIVE

---

## 13. Tools

**Purpose:** Tool registry and implementations for LLM tool-use loop.

**Directory:** `src/tools/`

**Files:**
- `registry.js` — tool registration factory
- `mediaTools.js` — `generate_image`, `generate_audio`, `analyze_image`
- `memoryTools.js` — `save_memory`, `search_memories`, `get_memory_map`
- `musicTools.js` — Spotify operations (83KB)
- `webSearchService.js` — Brave Search wrapper
- `index.js` — `createToolRegistry`

**Called by:** `createChatPipeline.js` (tool loop in `callModel.js`)
**Status:** ACTIVE

---

## 14. Admin Dashboard

**Purpose:** Read-only admin UI for inspecting companion state. Does not own scheduler or runtime behavior.

**Directory:** `src/http/`

**Main file:** `src/http/createHealthServer.js`

**Routes:**
- `GET /admin/` — home
- `GET /admin/memory` — memory browser
- `GET /admin/continuity` — continuity state
- `GET /admin/alive` — alive layer status (HTML)
- `GET /api/ghostlight/alive/status` — alive layer status (JSON)
- `GET /admin/emotional-arc` — emotional arc
- `GET /admin/images` — image gallery
- `GET /admin/games` — game dashboard
- `GET /admin/secondlife` — Second Life dashboard
- `GET /admin/norwegian` — Norwegian learning
- `GET /admin/situational-awareness` — awareness state

**Handlers:** `src/http/adminPageHandlers/` (16 files)
**Actions:** `src/http/actions/` (24 files) — memory/music/image/heartbeat management

**Called by:** HTTP clients (browser)
**Calls into:** All stores (read-only), `buildAliveStatusPayload`

**Env vars:** `PORT` (default 8080), `ADMIN_SECRET`

**Status:** ACTIVE — does not own any runtime behavior

---

## 15. Storage

**Purpose:** Postgres-backed store factory layer. 32 stores, 86 tables. All tables created via `CREATE TABLE IF NOT EXISTS` at startup.

**Directory:** `src/storage/`

**Main file:** `src/storage/postgres/schemaRegistry.js` — all 86 table schemas

**Pattern:**
```
createXxxStore({ pool, config }) → { init(), getXxx(), setXxx(), ... }
```

**Schema guard:** `runSchemaGuard()` in `src/storage/postgres/runSchemaGuard.js` — runs at startup, creates missing tables

**Status:** ACTIVE — no migration files needed (CREATE TABLE IF NOT EXISTS)

---

## 16. Scheduler Registry

**Purpose:** Single place to register, start, stop, and query status of all recurring engines.

**File:** `src/runtime/schedulerRegistry.js`

**Registered schedulers:**
| Name | Phase | Engine |
|------|-------|--------|
| `aliveEngine` | background (pre-login) | `aliveEngine.start()` |
| `automationRunner` | post-login | `automationRunner.start()` |
| `heartbeat` | post-login | `heartbeat.start()` |
| `secondLifeLifeEngine` | post-login (conditional) | `setInterval(runLifeTick, tickMs)` |
| `emotionalArc.scheduler` | post-login | `emotionalArc.scheduler.start()` |

**Called by:** `index.js`
**Status:** ACTIVE

---

## 17. Life Barrel Export

**Purpose:** Single import point for all life-system factory functions. Does not move files.

**File:** `src/life/index.js`

**Re-exports from:**
- `alive/aliveEngine.js`
- `innerLife/innerLifeEngine.js`
- `continuity/continuityEngine.js`
- `humanSimulation/humanSimulationEngine.js`
- `lifeEngine/index.js`
- `companionSystems/emotionalArc.js`
- `companionSystems/relationalState.js`

**Status:** ACTIVE (barrel index — zero runtime risk)

---

## 18. Tests

**Test runner:** `node --test` (Node.js native, no Jest)
**Command:** `cd artifacts/ghostlight-bot && node --test`

**Test files (18 total):**
- `src/alive/__tests__/` — 5 files (aliveContextBuilder, aliveEngine, aliveExecutor, alivePresenceStore, backbonePolicy)
- `src/context/__tests__/` — 3 files (crossChannelAwareness, urlHandler, worldContext)
- `src/chat/tests/` — 1 file (adultPrivateModeScope)
- `src/music/` — 3 files (spotify.test, library.test, library.importPlaylist.test)
- `src/media/__tests__/` — 1 file (gifUrlNormalizer)
- `src/tools/` — 1 file (mediaTools.test)
- `src/http/` — 1 file (iconLibrary.test)
- `src/http/actions/` — 1 file (musicActions.test)
- `src/bot/events/` — 1 file (messageCreate.test)
- `src/games/tests/` — 1 file (games.test)

**Status:** ACTIVE (202 tests, 0 failures)

---

## 19. Scripts

**Root-level scripts (`scripts/`):** Norwegian learning verify scripts (37 .mjs files)
**Bot scripts (`artifacts/ghostlight-bot/scripts/`):** 67 verify scripts covering all systems

**Key hygiene scripts:**
- `scripts/audit-active-runtime.js` — verify active runtime path and wiring
- `scripts/find-dead-code.js` — find dead/orphaned files
- `scripts/verify-dashboard-not-broken.js` — dashboard route integrity
- `scripts/verify-life-wiring.js` — all life system wiring
- `scripts/verify-alive-layer-proof.js` — alive layer completeness

---

## Flow Diagrams

### Flow 1: Discord → Reply

```
User message
  │
  ▼
Discord API (messageCreate event)
  │
  ▼
bot/events/messageCreate.js
  ├─ Validate: is bot mention? thread reply? not self?
  ├─ Rate-limit check
  └─ Route to chatPipeline.run({ message, mode })
       │
       ▼
  chat/createChatPipeline.js  ◄── single context assembly point
       │
       ├─ preprocessMessage        (strip mentions, validate)
       ├─ enrichInput              (URLs, attachments, image context)
       ├─ loadScopedRecentHistory  (conversation history from DB)
       ├─ retrieveMemory           (Qdrant vector search)
       │
       ├─ BUILD contextSections[] ──────────────────────────────────
       │    1. buildSystemPrompt()
       │    2. buildAliveContextPrelude()   ← alive layer
       │    3. checkBackbone()              ← pushback guidance
       │    4. classifyEmotionalBeat()
       │    5. promise/continuity ledger
       │    6. resolveToneMode()
       │    7. buildMainUserPresenceContextSection()
       │    8. image conversation state
       │    9. cross-channel awareness, URLs
       │   10. human simulation context
       │   11. situational awareness
       │   12. inner life texture
       │
       ├─ callModel.js  (LLM + tool loop)
       │    └─ tool calls: save_memory / search_memories /
       │                   generate_image / generate_audio /
       │                   web_search / music tools
       │
       ├─ buildReply (format, split chunks)
       │
       ▼
  channel.send()  (each chunk ≤2000 chars, ≤5 chunks)
       │
       ▼
  alivePostUpdate()  [fire-and-forget — updates presence scores]
```

---

### Flow 2: Scheduler Startup

```
src/index.js boots
  │
  ├─ Phase 0: load config, create logger
  ├─ Phase 1: runSchemaGuard()  (86 Postgres tables)
  ├─ Phase 2: init 32+ stores
  ├─ Phase 3: create services (Discord client, pipeline, memory)
  ├─ Phase 4: create engines (alive, innerLife, continuity, ...)
  │
  ├─ BACKGROUND PHASE ──────────────────────────────────────────────
  │    schedulerRegistry.registerBackground("aliveEngine", () => aliveEngine.start())
  │    schedulerRegistry.startBackground()
  │         └─ aliveEngine.start()  [checks absence every N minutes]
  │              ├─ requires: ALIVE_ENABLED === "true"
  │              └─ on absence: enqueues intention → intentionQueueStore
  │
  ├─ client.login(DISCORD_TOKEN)  ── Discord connects ──────────────
  │
  └─ POST-LOGIN PHASE ──────────────────────────────────────────────
       schedulerRegistry.registerPostLogin("automationRunner", ...)
       schedulerRegistry.registerPostLogin("heartbeat", ...)
       schedulerRegistry.registerPostLogin("secondLifeLifeEngine", ...)  [conditional]
       schedulerRegistry.registerPostLogin("emotionalArc.scheduler", ...)
       schedulerRegistry.startPostLogin()
            ├─ automationRunner.start()   [daily summary, curation, memory sync]
            ├─ heartbeat.start()          [scheduled heartbeat actions]
            ├─ setInterval(runLifeTick)   [Second Life tick — if enabled]
            └─ emotionalArc.scheduler.start()

       automationRunner.runNow()  [immediate first automation pass]
```

---

### Flow 3: Image Generation

```
User: "draw me a picture of..."
  │
  ▼
chatPipeline → callModel.js (LLM decides to call generate_image tool)
  │
  ▼
tools/mediaTools.js  →  generate_image handler
  │
  ├─ images/generateImage.js
  │    ├─ buildPrompt()        (user intent + style presets)
  │    ├─ OpenAI DALL-E 3 API  (1024×1024 or HD)
  │    ├─ sharp (resize/optimize)
  │    └─ bucketStorage.js → AWS S3 upload
  │
  ├─ returns: { url, localPath, prompt }
  │
  ▼
LLM tool result injected into conversation
  │
  ▼
channel.send() with image attachment
  │
  ▼
generated_images table  (Postgres — persisted for gallery)
  │
  ▼
/admin/gallery/images  (dashboard — read-only view)
```

---

### Flow 4: Voice / Audio Generation

```
User: "/voice" command OR auto-voice mode active
  │
  ▼
bot/events/messageCreate.js detects voice trigger
  │
  ▼
LLM generates text reply (normal chat pipeline)
  │
  ▼
audio/generateAudio.js
  ├─ Fish Audio API (TTS)  ← FISH_AUDIO_API_KEY
  ├─ latestReplyCache.js   (de-duplicate concurrent requests)
  ├─ galleryPolicy.js      (decide whether to persist)
  └─ AWS S3 upload         (if gallery policy allows)
  │
  ▼
channel.send() with audio file attachment (.mp3)
  │
  ▼
generated_audio table  (Postgres — if persisted)
```

---

### Flow 5: Dashboard Request

```
Browser → GET /admin/alive
  │
  ▼
http/createHealthServer.js  (Express router)
  │
  ▼
http/adminPageHandlers/alivePageHandler.js
  ├─ receives appContext (pre-built, passed at server creation)
  ├─ reads: alivePresenceStore.getPresence()
  ├─ reads: aliveEventsStore.getRecentEvents()
  ├─ reads: schedulerRegistry.status()   [read-only]
  └─ renders HTML template (no .start() / .stop() calls)
  │
  ▼
200 OK  (HTML page)

Browser → GET /api/ghostlight/alive/status
  │
  ▼
http/adminPageHandlers/aliveStatusHandler.js
  ├─ buildAliveStatusPayload()
  └─ res.json({ enabled, presenceState, recentEvents, schedulers })
  │
  ▼
200 OK  (JSON — no secrets, no mutation)
```

---

### Flow 6: Second Life Integration

```
Second Life viewer (LSL script) → HTTP POST → Railway
  │
  ▼
http/createHealthServer.js  (/api/secondlife/*)
  │
  ▼
channels/secondLifeAdapter.js
  ├─ Verify SECOND_LIFE_BRIDGE_TOKEN
  ├─ Parse SL event (avatar, location, object, chat)
  └─ Dispatch to companion systems:
       ├─ slIdentityResolver   (who is this avatar?)
       ├─ slSocialEngine       (relationship tracking)
       ├─ slCommandRegistry    (handle SL commands)
       └─ lifeEngine tick      (update world awareness)
  │
  ▼
lifeEngine/  (autonomous goals, schedule, discovery)
  ├─ autonomyEngine      (pick next action)
  ├─ dailyScheduleEngine (time-of-day behavior)
  ├─ goalEngine          (long-term SL goals)
  ├─ socialIntelligenceEngine
  └─ worldAwarenessEngine
  │
  ▼
Response → Second Life viewer (LSL http_response)
  AND
Discord channel.send()  (via runCheckInAutomation if outreach triggered)
```

---

## Key Architectural Invariants

1. **One Discord send path:** All outbound messages go through `runCheckInAutomation` in `automations/runners.js`. No other `channel.send()` calls in alive/proactive code.
2. **One context assembly point:** `createChatPipeline.js` is the sole place where `contextSections[]` is built before every LLM call.
3. **One schema guard:** `runSchemaGuard()` at startup. No separate migration files.
4. **Alive disabled by default:** `ALIVE_ENABLED === "true"` required. Never enabled by default.
5. **Scheduler registry:** All recurring engines registered and started through `src/runtime/schedulerRegistry.js`.
6. **Dashboard reads only:** No admin route owns or modifies scheduler/runtime behavior.
