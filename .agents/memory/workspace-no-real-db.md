---
name: Workspace has no real Postgres — DATABASE_URL is a placeholder
description: Why DB-connecting tooling fails in the Replit workspace and how the post-merge script guards it.
---

This project (the Ghostlight bot mirror) deploys to **Railway** with Railway's own Postgres. The **Replit workspace has no real Postgres provisioned** — `DATABASE_URL` is present but set to an unresolved placeholder string like `{Postgres.DATABASE_URL}`.

**Consequence:** a non-empty `DATABASE_URL` does NOT mean a usable database. `test -n "$DATABASE_URL"` passes but the value is garbage, so anything that actually connects (e.g. `drizzle-kit push` for the template `@workspace/db`) hangs at "Pulling schema from database..." and fails.

**How to apply:** any workspace tooling that connects to Postgres must guard on a *real* URL, not just presence. The post-merge script (`scripts/post-merge.sh`) only runs the db push when `DATABASE_URL` matches `postgres://*` / `postgresql://*`, otherwise it skips with a log line. Do the same for any new DB-touching workspace step. The template `@workspace/db` Drizzle schema is unused by the actual product (the bot uses its own `pg` client against Railway's DB).
