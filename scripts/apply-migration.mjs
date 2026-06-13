// Apply a Supabase migration to production via the session pooler.
// Usage: node scripts/apply-migration.mjs supabase/migrations/00NN_name.sql
//
// The DB password comes from the macOS Keychain (account livability-scout,
// service supabase-db-password) — never hard-coded. Connects via the IPv4
// session pooler (see scripts/db-connection.md). Idempotent migrations only
// (the repo's migrations all use `if not exists` / `drop policy if exists`).
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-migration.mjs <path-to-migration.sql>");
  process.exit(1);
}

// execFile (no shell) with fixed args — no interpolation, no injection surface.
const pw = execFileSync("security", [
  "find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w",
], { encoding: "utf8" }).trim();
const sql = await readFile(file, "utf8");

const c = new pg.Client({
  host: "aws-1-us-west-2.pooler.supabase.com",
  port: 5432,
  user: "postgres.fitjkrmiwkdolxhitroc",
  password: pw,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();
await c.query(sql);
console.log(`✓ applied ${file}`);
await c.end();
