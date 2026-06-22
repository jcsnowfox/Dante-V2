#!/usr/bin/env node
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[inspect:database-source] DATABASE_URL is required.");
  process.exit(1);
}

function redactUrl(value) {
  const url = new URL(value);
  return {
    protocol: url.protocol.replace(":", ""),
    host: url.host,
    database: url.pathname.replace(/^\//, ""),
    username: url.username || "",
    search: url.search || "",
  };
}

const watchedTables = [
  "conversation_events",
  "memories",
  "generated_audio",
  "music_tracks",
  "journal_entries",
  "heartbeat_actions",
];

const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

try {
  const identity = await pool.query(`
    SELECT
      current_database() AS database,
      current_user AS username,
      inet_server_addr()::text AS server_addr,
      inet_server_port() AS server_port,
      version() AS version
  `);
  const created = await pool.query(
    "SELECT pg_postmaster_start_time() AS postmaster_start_time",
  );
  const tables = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );

  const tableDetails = [];
  for (const table of watchedTables) {
    const existsResult = await pool.query(
      "SELECT to_regclass($1) AS table_name",
      [table],
    );
    const exists = Boolean(existsResult.rows[0]?.table_name);
    let rowEstimate = null;
    let columns = [];
    if (exists) {
      const estimate = await pool.query(
        "SELECT reltuples::bigint AS estimate FROM pg_class WHERE oid = to_regclass($1)",
        [table],
      );
      rowEstimate = Number(estimate.rows[0]?.estimate ?? 0);
      const columnResult = await pool.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`,
        [table],
      );
      columns = columnResult.rows.map((row) => row.column_name);
    }
    tableDetails.push({ table, exists, rowEstimate, columns });
  }

  const payload = {
    databaseUrlSource: "process.env.DATABASE_URL",
    databaseUrlTarget: redactUrl(databaseUrl),
    connectionIdentity: identity.rows[0],
    postmaster: created.rows[0],
    publicTableCount: tables.rowCount,
    publicTables: tables.rows.map((row) => row.table_name),
    watchedTables: tableDetails,
    verdictHint:
      tables.rowCount === 0
        ? "FRESH_EMPTY_PUBLIC_SCHEMA"
        : "EXISTING_PUBLIC_SCHEMA_REVIEW_BEFORE_USING",
  };

  console.log(JSON.stringify(payload, null, 2));
} finally {
  await pool.end();
}
