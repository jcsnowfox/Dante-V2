#!/bin/bash
set -e

pnpm install --frozen-lockfile

# The template Drizzle db (@workspace/db) push only applies when a real Postgres
# is provisioned in the workspace. This project deploys the Discord bot to Railway
# with its own database; the workspace DATABASE_URL is often unset or an unresolved
# placeholder (e.g. "{Postgres.DATABASE_URL}"), in which case drizzle-kit push would
# hang at "Pulling schema from database..." and fail. Only push for a real URL.
case "$DATABASE_URL" in
  postgres://*|postgresql://*)
    pnpm --filter @workspace/db run push-force
    ;;
  *)
    echo "[post-merge] Skipping @workspace/db push: DATABASE_URL is not a real Postgres URL."
    ;;
esac
