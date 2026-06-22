# Startup schema migration audit

Root cause: Railway Postgres may contain tables created by older deployments. `CREATE TABLE IF NOT EXISTS` creates missing tables but does not add missing columns to existing tables, so indexes must be created only after all expected columns are ensured.

## Production startup init order

1. `settingsStore.init` — `artifacts/ghostlight-bot/src/storage/settings/index.js`
2. `runtimeSettings.apply` — reads settings; no schema
3. `conversations.init` — `artifacts/ghostlight-bot/src/storage/conversations/index.js`
4. `memoryStore.init` — `artifacts/ghostlight-bot/src/storage/memories/index.js`
5. `generatedMemories.init` — `artifacts/ghostlight-bot/src/storage/stagedMemories/index.js`
6. `generatedImages.init` — `artifacts/ghostlight-bot/src/storage/generatedImages/index.js`
7. `generatedAudio.init` — `artifacts/ghostlight-bot/src/storage/generatedAudio/index.js`
8. `musicStore.init` — `artifacts/ghostlight-bot/src/storage/music/index.js`
9. `imageStylePresets.init` — `artifacts/ghostlight-bot/src/storage/imageStylePresets/index.js`
10. `imageAppearancePresets.init` — `artifacts/ghostlight-bot/src/storage/imageAppearancePresets/index.js`
11. `cacheStore.init` — `artifacts/ghostlight-bot/src/storage/cache/index.js`
12. `cache.pruneStartup` — uses cache table; no new schema
13. `summaryQueueStore.init` — `artifacts/ghostlight-bot/src/storage/summaryQueue/index.js`
14. `journalStore.init` — `artifacts/ghostlight-bot/src/storage/journals/index.js`
15. `automationStore.init` — `artifacts/ghostlight-bot/src/storage/automations/index.js`
16. `heartbeatActionStore.init` — `artifacts/ghostlight-bot/src/storage/heartbeatActions/index.js`
17. `heartbeatActionStore.seedStarters` — uses heartbeat actions; no new schema
18. `proactiveActionStore.init` — `artifacts/ghostlight-bot/src/storage/proactiveActions/index.js`
19. `channelModes.init` — `artifacts/ghostlight-bot/src/storage/channelModes/index.js`
20. `emotionalArc.init` — `artifacts/ghostlight-bot/src/storage/emotionalArc/index.js`
21. `feedbackLearning.init` — `artifacts/ghostlight-bot/src/storage/feedbackLearning/index.js`
22. `relationalState.init` — `artifacts/ghostlight-bot/src/storage/relationalState/index.js`
23. `innerLife.init` — `artifacts/ghostlight-bot/src/storage/innerLife/index.js`
24. `continuity.init` — `artifacts/ghostlight-bot/src/storage/continuity/index.js`
25. `secondLife.init` — `artifacts/ghostlight-bot/src/storage/secondLife/index.js`
26. `secondLife.seedCommands` — uses Second Life commands; no new schema
27. `secondLife.seedOutfits` — uses Second Life outfits; no new schema
28. `secondLife.seedSchedule` — uses Second Life daily schedule; no new schema
29. `gameSystem.init` — `artifacts/ghostlight-bot/src/games/gameSessionStore.js`
30. `gameSettings.load` — reads settings; no new schema
31. `heartbeat.init` — no startup table creation beyond initialized stores
32. `musicLibrary.background.start` — uses music tables; no startup schema
33. `license.validateStartup` — cache/license runtime only

## Store-by-store schema risk

| Store | Tables | Expected columns/indexes | Migration status | Index ordering | Risk |
| --- | --- | --- | --- | --- | --- |
| settings | `app_settings` | See `scripts/startup-schema-spec.mjs` | table create only | no indexes | Low |
| conversations | `conversation_events` | verifier spec | existing idempotent migration proven by Railway log | after columns | Low |
| memory | `memories`, `memory_usage_events` | verifier spec | existing idempotent migration proven by Railway log | after columns | Low |
| generated memories | `staged_memories` | verifier spec | partial `ALTER TABLE` for newer `reference_date`; older fresh-schema parity checked by verifier | after ALTER | Medium |
| generated images | `generated_images` | verifier spec | partial `ALTER TABLE` for gallery columns | after ALTER | Medium |
| generated audio | `generated_audio` | verifier spec | full `ALTER TABLE ADD COLUMN IF NOT EXISTS` sweep added | after ALTER/backfill | Low |
| music | `music_spotify_connections`, `music_tracks`, `music_track_affinities`, `music_playlists`, `music_playlist_tracks` | verifier spec | existing idempotent migration proven by Railway log | after columns | Low |
| image style presets | `image_style_presets` | verifier spec | table create path; verifier covers existing DB drift | after columns | Medium |
| image appearance presets | `image_appearance_presets` | verifier spec | table create path; verifier covers existing DB drift | after columns | Medium |
| cache | `cache` | verifier spec | `expires_at` ALTER exists | after ALTER | Medium |
| summary queue | `summary_queue` | verifier spec | table create path; verifier covers existing DB drift | after columns | Medium |
| journal | `journal_entries` | verifier spec | full `ALTER TABLE ADD COLUMN IF NOT EXISTS` sweep added, including `user_scope` | after ALTER/backfill | Low |
| automations | `automations` | verifier spec | partial ALTER for newer thread/tool columns | after ALTER | Medium |
| heartbeat actions | `heartbeat_actions` | verifier spec | partial ALTER and historical cleanup | after ALTER | Medium |
| proactive actions | `proactive_actions` | verifier spec | partial ALTER for newer thread columns | after ALTER | Medium |
| channel modes | `channel_mode_definitions`, `channel_mode_assignments` | verifier spec | partial ALTER for newer mode fields | after ALTER | Medium |
| companion systems | emotional arc, feedback learning, relational state, inner life, continuity tables | module-specific stores | existing init paths remain audited by startup order; not all covered by new verifier | after module migrations | Medium |
| second life | Second Life bridge/profile/life tables | module-specific plus bridge verifier spec | multiple inline ALTERs exist; verifier checks bridge settings table | some early indexes predate later ALTERs on unrelated columns | Medium |
| games | `game_sessions` | verifier spec | table create path; verifier covers existing DB drift | after columns | Medium |

## Proof commands

- `pnpm run build`
- `node --check artifacts/ghostlight-bot/src/storage/journals/index.js`
- `node --check artifacts/ghostlight-bot/scripts/verify-startup-schema.mjs`
- `node --check artifacts/ghostlight-bot/scripts/verify-journal-schema.mjs`
- `pnpm run verify:journal-schema` with `DATABASE_URL`
- `pnpm run verify:startup-schema` with `DATABASE_URL`
