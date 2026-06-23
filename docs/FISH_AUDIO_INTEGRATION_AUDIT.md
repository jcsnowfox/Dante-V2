# Fish Audio Integration Audit

Created: 2026-06-23  
Scope: `artifacts/ghostlight-bot`  
Branch: `claude/elegant-hamilton-ms83ld`

---

## Purpose

Add Fish Audio as a second TTS provider alongside ElevenLabs. Operators can choose ElevenLabs, Fish Audio, or Disabled from the dashboard. The runtime `generate_audio` tool routes to whichever provider is configured.

---

## Existing ElevenLabs Integration — Touch Map

| File | Role | Change needed |
|------|------|---------------|
| `src/config/env.js` | Reads `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, sets `config.elevenlabs.*` and `config.audio.*` | Add `config.fishAudio.*`, `config.audio.ttsProvider`, `config.audio.fishVoiceId`, `config.audio.fishModelId` |
| `src/config/runtimeSettings.js` | `EDITABLE_RUNTIME_SETTINGS` list; `applyRuntimeSettings`; `extractRuntimeSettings` | Add `audio.ttsProvider`, `audio.fishVoiceId`, `audio.fishModelId` settings |
| `src/audio/generateAudio.js` | `canGenerateAudio(config)`, `createAudioGenerationService({config,…})`, `generate()` | Add `resolveTtsProvider()`, update `canGenerateAudio()` for both providers, branch `generate()` to Fish Audio or ElevenLabs |
| `src/audio/providers/fishAudioProvider.js` | **NEW** — Fish Audio TTS implementation | Create file; inline msgpack encoder; `POST /v1/tts` with `Authorization: Bearer {key}` |
| `src/http/adminSettingsParsers.js` | `parseAudioSettingsFields(fields)` | Add `audioTtsProvider`, `audioFishVoiceId`, `audioFishModelId` fields; derive `ttsEnabled` from provider radio |
| `src/http/renderAdminPages/shared.js` | `getRuntimeState({config,…})` | Add `audioTtsProvider`, `audioFishVoiceId`, `audioFishModelId`, `fishAudioApiKeyConfigured` |
| `src/http/renderAdminPages/audioPages.js` | `renderAudioSettingsPage(…)` | Replace enable-toggle with 3-way provider radio (Disabled / ElevenLabs / Fish Audio); add Fish Audio section |
| `src/http/adminPageHandlers/imagesPageHandler.js` | `handleAudioPageRequest` | No structural change needed; ElevenLabs voice list still loads for ElevenLabs provider |
| `src/http/actions/audioActions.js` | Audio gallery actions | Add `POST /admin/actions/audio-test-fish` route |
| `src/tools/registry.js` | Tool registration + gate logging | Update gate logging to show provider and provider-specific gate values |
| `src/tools/mediaTools.js` | `createAudioGenerationTool(…)` | Update description (provider-agnostic); fix `voiceId` in error-path `recordAudio` to be provider-aware |
| `src/storage/generatedAudio/index.js` | DB table creation, `recordAudio` INSERT | Add `provider`, `provider_voice_id`, `provider_model_id` columns; add `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migration |
| `scripts/verify-audio-generation.mjs` | Schema verifier | Add new column checks |
| `scripts/verify-fish-audio.mjs` | **NEW** — Fish Audio credential + schema verifier | Create file |
| `scripts/verify-dashboard-audio-settings.mjs` | **NEW** — Dashboard settings verifier | Create file |
| `.env.example` | Env var documentation | Add `FISH_AUDIO_API_KEY`, `FISH_AUDIO_VOICE_ID`, `FISH_AUDIO_MODEL_ID`, `FISH_AUDIO_ENABLED`, `AUDIO_TTS_PROVIDER` |
| `package.json` | npm scripts | Add `verify:fish-audio`, `verify:dashboard-audio-settings` |

---

## Fish Audio API Contract

- **Endpoint:** `POST https://api.fish.audio/v1/tts`
- **Auth:** `Authorization: Bearer {FISH_AUDIO_API_KEY}`
- **Content-Type:** `application/msgpack`
- **Request body (msgpack-encoded):**
  ```
  {
    text:         string  (required) — text to synthesize
    reference_id: string  (required) — voice model reference ID
    format:       string  (optional, default "mp3")
    latency:      string  (optional: "normal" | "balanced")
    model:        string  (optional) — Fish Audio model override
  }
  ```
- **Response:** Raw audio bytes (MP3 by default); non-2xx → error (may be JSON `{message}` or plain text)
- **No voices listing API** — voices are user-created and referenced by ID; admin enters ID manually

We implement a minimal inline msgpack encoder (no extra npm dependency) covering the fixed-map + string values needed for TTS requests.

---

## Security Constraints

| Constraint | Implementation |
|------------|----------------|
| Never log `FISH_AUDIO_API_KEY` value | Only log key presence (`Boolean(apiKey)`) |
| Mask key in dashboard | Show "●●●● Configured" or "Not configured" indicator |
| Never expose key in dashboard reads | `fishAudioApiKeyConfigured: Boolean(String(config.fishAudio?.apiKey \|\| "").trim())` |
| No fallback to ElevenLabs on Fish failure | Throw error; no silent provider switching |
| Adult/private channel gates unchanged | `canGenerateAudio` still gated by `hasStorageConfig`; channel gate logic in bot layer unchanged |

---

## DB Migration Strategy

The `generated_audio` table is created with `CREATE TABLE IF NOT EXISTS` in `generatedAudio/index.js` `init()`. For new installs the columns are included in the `CREATE TABLE` statement. For existing installs, the `init()` function also runs:

```sql
ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'elevenlabs';
ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS provider_voice_id TEXT;
ALTER TABLE generated_audio ADD COLUMN IF NOT EXISTS provider_model_id TEXT;
```

Existing rows will get `provider = 'elevenlabs'` (the default), `provider_voice_id = NULL`, `provider_model_id = NULL`.

---

## Gate Logic

```
canGenerateAudio(config):
  ttsEnabled = false → false
  hasStorageConfig = false → false
  ttsProvider = "fish":
    fishAudio.apiKey set AND (audio.fishVoiceId OR fishAudio.voiceId) set → true
    else → false
  ttsProvider = "elevenlabs" (default):
    elevenlabs.apiKey set AND audio.elevenlabsVoiceId set → true
    else → false
```

---

## NO-GO Conditions

1. ElevenLabs breaks — all existing ElevenLabs code paths preserved
2. Fish Audio only in UI but runtime ignores it — `canGenerateAudio` and `generate()` both use provider routing
3. Fish Audio tests pass but doesn't work through normal `generate_audio` flow — same code path
4. API keys exposed in logs or dashboard — never logged; masked in UI
5. `generated_audio` persistence skipped — `provider`, `provider_voice_id`, `provider_model_id` always recorded
6. Storage gates bypassed — `hasStorageConfig(config)` check preserved in `canGenerateAudio`
7. Voice notes bypass adult/private channel rules — gate logic unchanged
8. Build fails — `pnpm run build` must pass
9. Claims without evidence — `verify:audio-generation`, `verify:fish-audio`, `verify:dashboard-audio-settings` all must pass