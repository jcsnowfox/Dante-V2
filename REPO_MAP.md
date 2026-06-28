# REPO_MAP.md

## Top-level folders
- `artifacts/ghostlight-bot`: active Discord companion runtime. Main entrypoint is `src/index.js`; package entrypoint is `package.json#main`.
- `artifacts/api-server`: TypeScript API server workspace with `src/index.ts` and built `dist/` output.
- `lib/api-spec`, `lib/api-client-react`, `lib/api-zod`, `lib/db`: generated/spec/database workspaces referenced by root TypeScript project references.
- `scripts`: root verification scripts and TypeScript helper workspace.
- `docs`, `archive/planning`: architecture/audit notes and historical plans.
- `assets`, `.canvas`, `artifacts/ghostlight-bot/assets`: static assets.

## Active systems
- Discord bot: `artifacts/ghostlight-bot/src/index.js`, `src/bot/*`, commands in `src/bot/commands/*`, event handlers in `src/bot/events/*`.
- Dashboard/server: `src/http/createHealthServer.js`, `src/http/adminPageHandlers/*`, `src/http/actions/*`, game admin handlers in `src/games/http/*`.
- Memory/storage: `src/storage/*`, Postgres helpers under `src/storage/postgres/*`, Qdrant verification scripts.
- Journal system: `src/storage/journals/index.js`, automation journal context in `src/automations/journalContext.js`.
- Dream/inner-life/alive systems: `src/alive/*`, `src/storage/innerLife/*`, related HTTP handlers.
- Schedule/proactive/background workers: `src/automations/*`, `src/heartbeat/*`, `src/continuity/continuityScheduler.js`, `src/companionSystems/emotionalArc/emotionalArcScheduler.js`.
- Image generation: `src/image/*`, `src/storage/generatedImages/*`, `src/http/actions/imageActions.js`.
- Audio/voice: `src/audio/*`, `src/storage/generatedAudio/*`, `src/http/actions/audioActions.js`.
- Second Life bridge: `src/secondLife/*`, `src/channels/secondLifeAdapter.js`, `src/companion/secondLifeReplyGenerator.js`, `src/http/actions/secondLifeActions.js`.
- Prompt assembly/context: `src/chat/prompt/buildSystemPrompt.js`, `src/context/modelContextBuilder.js`, `src/chat/pipeline/buildChatRequest.js`, `src/companion/assembleCompanionPrompt.js`.
- Tests: Node test files under `src/**/__tests__`, `src/**/tests`, and `*.test.js`; script-based verifiers under `artifacts/ghostlight-bot/scripts` and root `scripts`.

## Legacy or experimental-looking areas
- Root-level `verify-norwegian-*.mjs` files were stale, unreferenced legacy verifier copies; active root scripts use `scripts/verify-norwegian-*.mjs` and bot scripts use `artifacts/ghostlight-bot/scripts`.
- `archive/planning` is historical documentation, not runtime.
- `artifacts/api-server/dist` is generated build output; keep until deployment ownership is confirmed.
