# Dependency Audit

**Package:** `artifacts/ghostlight-bot`
**Audit date:** 2026-06-27
**Package manager:** pnpm (workspace)

---

## Production Dependencies

6 production dependencies. All are used. None are duplicated.

| Package | Version | Used in | Purpose | Status |
|---------|---------|---------|---------|--------|
| `discord.js` | `^14.26.3` | `src/bot/createDiscordClient.js` | Discord gateway client, message events, channel API | ACTIVE |
| `dotenv` | `^17.3.1` | `src/index.js` | Load `.env` at startup | ACTIVE |
| `openai` | `^6.32.0` | `src/chat/pipeline/callModel.js`, `src/memory/embeddings.js`, `src/images/generateImage.js`, `src/audio/generateAudio.js` | LLM calls, embeddings, DALL-E 3, TTS | ACTIVE |
| `pg` | `^8.20.0` | `src/storage/postgres/createPostgresPool.js` | Postgres connection pool (86 tables) | ACTIVE |
| `sharp` | `^0.34.5` | `src/images/generateImage.js` | Image processing / resizing before upload | ACTIVE |
| `yazl` | `^3.3.1` | `src/http/actions/adminExportActions.js` | Create ZIP archives for admin export downloads | ACTIVE |

### Notes

- **No devDependencies** — the project has no build step; Node.js runs source directly. No transpiler, bundler, or test framework packages needed.
- **No duplicate packages** — no two packages serve the same purpose.
- **No unused packages** — all 6 are reachable from active source files.
- **No missing packages** — all `require()` calls to external packages are covered by the 6 above or Node.js built-ins.

---

## Node.js Built-in Modules Used

These are not in `package.json` — they ship with Node.js.

| Module | Used for |
|--------|---------|
| `node:path` | File path resolution |
| `node:fs` | Script file reads (verify scripts only — not in runtime src) |
| `node:test` | Test runner (`node --test`) |
| `node:assert/strict` | Test assertions |
| `node:crypto` | Hashing / UUID generation |
| `node:http` / `node:https` | Health server, HTTP fetch |
| `node:url` | URL parsing |
| `node:events` | EventEmitter usage |
| `node:timers/promises` | `setInterval` / timer utilities |

---

## External Services (Not npm Packages)

These are accessed via API, not installed as packages:

| Service | Purpose | Configured via |
|---------|---------|---------------|
| OpenAI API | LLM, embeddings, DALL-E 3 image generation | `OPENAI_API_KEY` |
| Fish Audio API | TTS voice generation | `FISH_AUDIO_API_KEY` |
| AWS S3 | Media storage (images, audio, ZIPs) | `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| Qdrant | Vector database for memory embeddings | `QDRANT_URL`, `QDRANT_API_KEY` |
| Spotify Web API | Music library integration | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |
| Brave Search API | Web search tool | `BRAVE_API_KEY` |
| Discord API | Bot gateway and REST | `DISCORD_TOKEN` |
| Railway / Postgres | Production database | `DATABASE_URL` |

---

## Findings

| Finding | Severity | Action |
|---------|----------|--------|
| No devDependencies defined | INFO | No action — no build step needed |
| `openai` `^6.32.0` — major version pinned to v6 | INFO | Monitor for v7 breaking changes before upgrading |
| `pg` `^8.20.0` — active LTS | INFO | No action required |
| `discord.js` `^14.26.3` — Discord.js v14 | INFO | v14 is current stable; monitor for v15 migration |
| All 6 packages are justified | PASS | No removals needed |

**Verdict: DEPENDENCY_AUDIT_PASS — 6 production deps, 0 unused, 0 missing, 0 duplicates.**
