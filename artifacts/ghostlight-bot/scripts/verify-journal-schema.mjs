#!/usr/bin/env node
import pg from "pg";
import { journalSchema } from "./startup-schema-spec.mjs";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[verify:journal-schema] DATABASE_URL is required.");
  process.exit(1);
}
const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } });
let failed = false;
try {
  for (const [table, spec] of Object.entries(journalSchema.tables)) {
    const tableResult = await pool.query("SELECT to_regclass($1) AS table_name", [table]);
    if (!tableResult.rows[0]?.table_name) {
      console.error(`[verify:journal-schema] missing table ${table}`);
      failed = true;
      continue;
    }
    const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [table]);
    const haveColumns = new Set(columns.rows.map((row) => row.column_name));
    for (const column of spec.columns) {
      if (!haveColumns.has(column)) {
        console.error(`[verify:journal-schema] missing column ${table}.${column}`);
        failed = true;
      }
    }
    for (const index of spec.indexes) {
      const indexResult = await pool.query("SELECT to_regclass($1) AS index_name", [index]);
      if (!indexResult.rows[0]?.index_name) {
        console.error(`[verify:journal-schema] missing index ${index}`);
        failed = true;
      }
    }
  }
} finally {
  await pool.end();
}
if (failed) process.exit(1);
console.log("[verify:journal-schema] ok table=journal_entries");
