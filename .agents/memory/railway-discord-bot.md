---
name: Railway "online but offline" Discord bot
description: Root-cause pattern when a Discord bot shows online on the host (Railway) but offline in Discord.
---

# Railway online, Discord offline

**Symptom:** the host platform (Railway) reports the service as running/online, but
the bot appears offline in Discord.

**Root cause (common):** the deploy's start command runs a *placeholder web
server* (e.g. a scaffold Express health server) that binds `PORT` and passes
health checks, while the actual bot login code is never started. The host stays
"online" purely because something answers on `PORT`.

**Fix pattern:** make the deploy entrypoint run the **bot** process, whose own
HTTP/health server binds `PORT` (keeps the host online) *and* which logs into the
Discord gateway in the same process — one process serving "both" web + Discord.

**How to apply:**
- Check what the host's start command actually launches vs. where the bot code
  lives. A bot shipped only inside an attached OCI/Docker image (never invoked by
  the start command) is a tell.
- Point the root `start` script at the bot entry, and ensure the host's custom
  start command is cleared or set to `pnpm start`.
- Required runtime env for a Discord bot: a valid `DISCORD_TOKEN` (plus client/
  guild/channel IDs and any LLM/DB keys). Without `DISCORD_TOKEN` the web server
  still runs but the bot cannot log in — which reproduces this exact symptom.

# Railway "Application failed to respond" with a healthy bot

**Symptom:** the bot's deploy logs show a clean startup (Discord logged in, HTTP
server "listening on 0.0.0.0:<X>"), yet the Railway public URL returns
"Application failed to respond."

**Root cause:** port mismatch. Railway *Public Networking* forwards the domain to
a fixed **target port** (often `8080`), but the app bound a different port. An app
that reads `process.env.PORT` (default 3000) will bind 3000 whenever a Railway
**`PORT` variable** is set to 3000 (a common template default) — which won't equal
the 8080 target. Railway does NOT auto-inject `PORT`; the public target and the
bound port are configured independently and can drift apart.

**Why:** "failed to respond" here is a routing miss, not a crash — the process is
up, just listening where the edge proxy isn't forwarding.

**How to apply:** make the bound port equal the public target. Either set the
Railway `PORT` variable to the target value, or change the public target to the
bound port. Confirm with the startup log `listening on 0.0.0.0:<port>` and the
"Port N" shown under Public Networking — they must match.
