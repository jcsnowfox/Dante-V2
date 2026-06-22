# Railway fresh database deployment proof plan

This deployment must not patch stale Railway Postgres tables one column at a time. If startup fails because an expected column is missing from an existing table, treat the database as an old schema until proven otherwise.

## Guardrails

- Do **not** delete, truncate, detach, or overwrite the current Postgres service unless the owner explicitly approves data loss or migration.
- Do **not** add one-off migrations only to get past the next missing column in an old table.
- `DATABASE_URL` is the only database source used by the bot at runtime; it is read from `process.env.DATABASE_URL` during config loading.
- A PASS requires boot logs proving the app completes these startup steps on the new database:
  - `conversations.init`
  - `memoryStore.init`
  - `generatedAudio.init`
  - `musicStore.init`
  - `journalStore.init`
  - `heartbeatActionStore.init`

## Confirm the current DATABASE_URL source

1. In Railway, open the **Dante-V2 app service** (not the Postgres service).
2. Open **Variables**.
3. Locate `DATABASE_URL`.
4. Record whether it is:
   - a Railway reference such as `${{ Postgres.DATABASE_URL }}` / `${{ <service-name>.DATABASE_URL }}`, or
   - a literal `postgresql://...` URL.
5. Run the local/source inspection command against the exact value Railway injects:

```bash
DATABASE_URL='<redacted-current-url>' pnpm run inspect:database-source
```

The command prints the redacted host, database name, connection identity, public table list, and watched startup tables without dumping user data.

## Confirm whether it points to an old Postgres service

Treat the current DB as stale / old if any of these are true:

- `inspect:database-source` reports `verdictHint: "EXISTING_PUBLIC_SCHEMA_REVIEW_BEFORE_USING"` before this fresh Dante-V2 deployment has successfully booted.
- Existing public tables include startup tables such as `conversation_events`, `memories`, `generated_audio`, `music_tracks`, `journal_entries`, or `heartbeat_actions` before the new deployment created them.
- A watched table exists but is missing expected current columns, such as `heartbeat_actions.action_id`.
- Railway `DATABASE_URL` references a Postgres service created for an older app/deployment instead of a new Postgres service attached for this Dante-V2 clone.

If those conditions match the production logs showing earlier stores succeeded and `heartbeatActionStore.init` failed on missing `action_id`, the safe conclusion is **NO GO: app is attached to stale schema**.

## Attach a fresh Railway Postgres service

1. In the Railway project, click **New** → **Database** → **PostgreSQL**.
2. Give it an unmistakable fresh name, for example `dante-v2-fresh-postgres`.
3. Wait until Railway finishes provisioning the new Postgres service.
4. Open the **Dante-V2 app service** → **Variables**.
5. Update `DATABASE_URL` to reference the new service, for example:

```text
${{ dante-v2-fresh-postgres.DATABASE_URL }}
```

6. Do **not** remove the old Postgres service yet. Leave it intact until the owner approves archival, migration, or deletion.
7. Redeploy the Dante-V2 app service.

## Verify fresh schema before declaring PASS

After Railway injects the new `DATABASE_URL`, run:

```bash
DATABASE_URL='<redacted-new-url>' pnpm run inspect:database-source
```

Expected result before first boot: `publicTableCount` should be `0`, or only Railway/provider-owned objects if Railway adds any. The watched Dante tables should not already exist.

Then redeploy and fetch Railway logs. PASS requires log entries like:

```text
[app] Startup step completed { step: 'conversations.init' }
[app] Startup step completed { step: 'memoryStore.init' }
[app] Startup step completed { step: 'generatedAudio.init' }
[app] Startup step completed { step: 'musicStore.init' }
[app] Startup step completed { step: 'journalStore.init' }
[app] Startup step completed { step: 'heartbeatActionStore.init' }
```

Finally run:

```bash
DATABASE_URL='<redacted-new-url>' pnpm run verify:startup-schema
```

## Final decision rule

- **PASS**: `DATABASE_URL` points to the fresh Railway Postgres service, pre-boot inspection showed no stale Dante tables, the redeploy logs show all required startup steps completed through `heartbeatActionStore.init`, and `verify:startup-schema` passes.
- **NO GO**: `DATABASE_URL` still points to the old service, pre-boot inspection shows stale Dante tables, logs fail before or at `heartbeatActionStore.init`, or schema verification fails.
