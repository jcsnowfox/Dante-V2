# Startup Boot Audit

Generated from `src/index.js` startup sequence.

## Boot Order

| Step | Name | CRITICAL | Notes |
|------|------|----------|-------|
| 0 | loadConfig() | YES | Reads all env vars, applies DB env diagnostic |
| 0 | createLogger() | YES | Required before anything else |
| 1 | settingsStore.init | YES | Runs first; creates app_settings table |
| 2 | runtimeSettings.apply | YES | Overlays DB settings onto live config |
| 3 | conversations.init | YES | Creates conversation_events table + indexes |
| 4 | memoryStore.init | YES | Creates memories + memory_usage_events tables |
| 5 | generatedMemories.init | YES | Creates staged_memories table |
| 6 | generatedImages.init | YES | Creates generated_images table + alters |
| 7 | generatedAudio.init | YES | Creates generated_audio table |
| 8 | musicStore.init | YES | Creates music_* tables |
| 9 | imageStylePresets.init | YES | Creates image_style_presets table |
| 10 | imageAppearancePresets.init | YES | Creates image_appearance_presets table |
| 11 | cacheStore.init | YES | Creates cache table |
| 12 | cache.pruneStartup | NO | Prunes expired cache entries (non-fatal) |
| 13 | summaryQueueStore.init | YES | Creates summary_queue table |
| 14 | journalStore.init | YES | Creates journal_entries table |
| 15 | automationStore.init | YES | Creates automations table |
| 16 | heartbeatActionStore.init | YES | Creates heartbeat_actions table + schema migrations |
| 17 | heartbeatActionStore.seedStarters | NO | Seeds built-in heartbeat actions |
| 18 | proactiveActionStore.init | YES | Creates proactive_actions table |
| 19 | channelModes.init | YES | Creates channel_mode_* tables |
| 20 | emotionalArc.init | NO | Companion system engine |
| 21 | feedbackLearning.init | NO | Companion system engine |
| 22 | relationalState.init | NO | Companion system engine |
| 23 | innerLife.init | NO | Companion system engine |
| 24 | continuity.init | NO | Companion system engine |
| 25 | secondLife.init | YES | Creates all second_life_* tables |
| 26 | secondLife.seedCommands | NO | Seeds SL default commands if companion ID exists |
| 27 | secondLife.seedOutfits | NO | Seeds SL default outfits if companion ID exists |
| 28 | secondLife.seedSchedule | NO | Seeds SL daily schedule if companion ID exists |
| 29 | gameSystem.init | YES | Initializes game registry and session store |
| 30 | gameSettings.load | NO | Loads game settings from app_settings DB |
| 31 | heartbeat.init | YES | Wires heartbeat service |
| 32 | musicLibrary.background.start | NO | Starts background music processing |
| 33 | license.validateStartup | YES | Validates license — blocks bot if invalid |
| 34 | registerEventHandlers | YES | Wires Discord event handlers |
| 35 | client.login | YES | Connects to Discord gateway |
| 36 | automationRunner.start | NO | Starts automation scheduler |
| 37 | heartbeat.start | NO | Starts heartbeat tick |

## CRITICAL Steps

Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 18, 19, 25, 29, 31, 33, 34, 35 are CRITICAL.
If any of these throw, the entire app fails to start.

## Schema Migration Pattern

All stores follow this pattern:
1. `CREATE TABLE IF NOT EXISTS` — idempotent table creation
2. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — safe column additions for existing tables
3. `DROP COLUMN IF EXISTS` — removes deprecated columns if they exist
4. `CREATE INDEX IF NOT EXISTS` — indexes always created AFTER columns

## Key Notes

- `settingsStore.init` and `runtimeSettings.apply` run FIRST (steps 1-2) so that DB-persisted settings are available before any other component initializes.
- Adult private mode config (`chat.adultPrivateMode`) is applied via `applyRuntimeSettings` at step 2.
- The `channel_mismatch` scope guard in the chat pipeline ensures adult mode NEVER activates for messages from a non-configured channel.
- Second Life bridge is NOT behind admin auth gate — it uses `x-bridge-secret` header auth inside the handler.
- Games are wired at step 29 (`gameSystem.init`) and the `createButtonHandler` is registered for Discord interactions.
- License check (step 33) can block the bot from logging in if the runtime is invalid.
