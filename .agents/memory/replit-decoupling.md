---
name: Replit decoupling for Railway-only deploy
description: How this monorepo was stripped of Replit coupling, and what the platform won't let you remove.
---

This project deploys to Railway only. To keep it decoupled from Replit:

- **`.replit` and `.replitignore` are platform-protected — the agent CANNOT delete them, and `rm` on them aborts the whole command** ("Direct edits to .replit and replit.nix are not allowed"). `replit.md` and `.replitignore`'s sibling files are deletable, but `.replit`/`.replitignore` are not. **How to apply:** to keep them out of a deploy mirror, gitignore them (they're now in `.gitignore` under the `# Replit` section) AND exclude them in any rsync-to-clean-dir push. The user's push flow is clean-history (`rsync` to a scratch dir then fresh `git init`), so `.gitignore` makes `git add -A` skip them — that's sufficient there.

- **Deleting an artifact's `.replit-artifact/` dir deregisters the artifact** (auto-removes it from the registry and removes its workflow) **while leaving the package code intact.** This is how `api-server` was kept as the Railway entrypoint (`pnpm run start` → `artifacts/api-server/start.mjs`) without staying a registered Replit artifact. `removeWorkflow` itself is PROHIBITED on artifact-managed workflows — delete the artifact dir/config instead and the workflow goes with it.

- **The Railway build break was the root `build` script recursively building Replit-only Vite artifacts** (`ghostlight-preview`, `mockup-sandbox`) that require `PORT`/`BASE_PATH` at build time. Those were the only `@replit/*` consumers. Deleting them + removing `@replit/*` from `pnpm-workspace.yaml` (catalog + `minimumReleaseAgeExclude`) fixed it. **Why:** `pnpm run build` = `typecheck && pnpm -r --if-present run build`; a Vite artifact that throws without env vars fails the whole recursive build.
