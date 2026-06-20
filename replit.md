# Ghostlight — Project Overview

Self-hosted Discord AI companion bot, structured as a pnpm monorepo. The primary
artifact is `artifacts/ghostlight-bot` (the companion bot), alongside an
`api-server` and a `mockup-sandbox`. User-facing branding is **Ghostlight**;
the companion persona name is configured via `CHAT_PROMPT_PERSONA_NAME` (no
hardcoded default).

## Second Life bridge
A bridge that lets the companion operate inside Second Life in addition to
Discord. Stage 1 (shared `processCompanionEvent` brain entry, UI-editable prompt
profiles feeding one prompt builder, and the full Second Life data model) is
complete. Stage 2 and beyond follow the spec in
`attached_assets/Pasted-You-are-working-on-the-existing-Ghostlight-AI-companion_1781891537628.txt`.

## Repositories
- **`jcsnowfox/SecondLife-ghostlight`** (private) — the active repo. It holds a
  full mirror of the project plus the Second Life bridge, with clean history.
- **Belz-Lucien-New** — the original repo. Treat as frozen; do not write to it.

## User preferences
- **All future work — writing AND pushing — goes to `jcsnowfox/SecondLife-ghostlight` only.**
  Never touch or push to the Belz-Lucien-New repo.
- **No "Cadence" labels anywhere** — not in code, docs, or git history. Keep the
  repo and its history free of upstream Cadence attribution.
- Keep the bot non-breaking for Discord; use generic defaults, nothing
  customer-specific hardcoded.

## Notes for contributors
- The main agent cannot run `git push` (sandbox-blocked). To publish the working
  tree to the SecondLife repo, either run a real `git push` from a background
  task agent, or use the GitHub Git Data API publish path documented in
  `.agents/memory/git-workflow.md`.
