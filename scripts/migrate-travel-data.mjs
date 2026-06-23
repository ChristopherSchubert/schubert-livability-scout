// migrate-travel-data.mjs — #89 data copy (epic #84): schubert-travel.public →
// schubert-family.travel. Idempotent (upsert on PK), so it doubles as the
// cutover delta re-sync. ADDITIVE — only reads schubert-travel; never writes it.
//
// Mechanism: read each row as to_jsonb on the source, insert on the target via
// jsonb_populate_recordset(null::travel.<t>, $1) so every type (jsonb, text[],
// dates, uuids) round-trips correctly. Per-user owner columns are remapped
// old schubert-travel auth uid → platform.member.id by email; rows owned by
// non-member (dev/test) accounts are SKIPPED (never invent an owner), and their
// child rows (trip_entries / fork comments on skipped trips) are skipped too.
//
// Creds: macOS Keychain (account `livability-scout`), session pooler — same as
// lib/measurers/_db.js. Run: node scripts/migrate-travel-data.mjs
import pg from "pg";
import { execFileSync } from "node:child_process";

function keychain(slot) {
  return execFileSync("security",
    ["find-generic-password", "-a", "livability-scout", "-s", slot, "-w"],
    { encoding: "utf8" }).trim();
}
const travel = new pg.Client({
  host: "aws-1-us-west-2.pooler.supabase.com", port: 5432,
  user: "postgres.fitjkrmiwkdolxhitroc", password: keychain("supabase-db-password"),
  database: "postgres", ssl: { rejectUnauthorized: false },
});
const family = new pg.Client({
  host: "aws-1-us-east-1.pooler.supabase.com", port: 5432,
  user: "postgres.cigsjmoornigndaygqua", password: keychain("supabase-family-db-password"),
  database: "postgres", ssl: { rejectUnauthorized: false },
});

// old schubert-travel auth uid → platform.member.id (by email; verified via MCP)
const MEMBER = {
  "0ec0da34-ac78-4f88-be3b-01e4ed9eabe4": "533f32e5-421a-4358-a385-d18873cd74e1", // chris
  "6c3c7361-53db-4649-a3ac-6f8cfb5ea8d0": "9ce60e24-2957-4c74-ab0e-40e80c780b93", // janice
};

const copiedTripIds = new Set();

// Pull all rows of a public table as JS objects (to_jsonb → clean typed JSON).
async function read(table) {
  const { rows } = await travel.query(`select to_jsonb(t) as j from public.${table} t`);
  return rows.map((r) => r.j);
}

// Upsert a batch of row-objects into travel.<table> via jsonb_populate_recordset.
async function writeBatch(table, pkCols, rowObjs) {
  if (!rowObjs.length) return;
  const cols = Object.keys(rowObjs[0]);
  const nonPk = cols.filter((c) => !pkCols.includes(c));
  const setClause = nonPk.length
    ? "do update set " + nonPk.map((c) => `"${c}"=excluded."${c}"`).join(", ")
    : "do nothing";
  const sql = `insert into travel.${table}
    select * from jsonb_populate_recordset(null::travel.${table}, $1::jsonb)
    on conflict (${pkCols.map((c) => `"${c}"`).join(",")}) ${setClause}`;
  // chunk so any single statement stays modest
  const SIZE = table === "pois" ? 1000 : 500;
  for (let i = 0; i < rowObjs.length; i += SIZE) {
    await family.query(sql, [JSON.stringify(rowObjs.slice(i, i + SIZE))]);
  }
}

async function copyTable(table, pkCols, { ownerCol, filter } = {}) {
  let rows = await read(table);
  const srcTotal = rows.length;
  let skipped = 0;
  if (filter) rows = rows.filter((r) => { const keep = filter(r); if (!keep) skipped++; return keep; });
  if (ownerCol) {
    rows = rows.filter((r) => {
      const mapped = MEMBER[r[ownerCol]];
      if (!mapped) { skipped++; return false; }
      r[ownerCol] = mapped;
      return true;
    });
  }
  if (table === "trips") rows.forEach((r) => copiedTripIds.add(r.id));
  await writeBatch(table, pkCols, rows);
  const { rows: cnt } = await family.query(`select count(*)::int n from travel.${table}`);
  console.log(`  ${table.padEnd(22)} src=${srcTotal} copied=${rows.length} skipped=${skipped} → travel=${cnt[0].n}`);
}

async function main() {
  await travel.connect();
  await family.connect();
  console.log("copying schubert-travel.public → schubert-family.travel …");

  // Reference / shared (no owner remap)
  await copyTable("cities", ["id"]);
  await copyTable("pois", ["place_id"]);
  await copyTable("nominatim_cache", ["endpoint", "query", "params"]);
  await copyTable("external_cache", ["source", "query"]);
  await copyTable("walkthrough_feedback", ["id"]);

  // Owner-scoped (remap; skip dev/test owners). trips first to seed copiedTripIds.
  await copyTable("trips", ["id"], { ownerCol: "user_id" });
  await copyTable("trip_entries", ["id"], { filter: (r) => copiedTripIds.has(r.trip_id) });
  await copyTable("baseline_ratings", ["id"], { ownerCol: "user_id" });
  await copyTable("felt_surveys", ["id"], { ownerCol: "user_id" });
  await copyTable("journal_entries", ["id"], { ownerCol: "user_id" });
  await copyTable("user_weights", ["user_id"], { ownerCol: "user_id" });
  await copyTable("trip_fork_comments", ["id"], { ownerCol: "author_id", filter: (r) => copiedTripIds.has(r.trip_id) });

  await travel.end();
  await family.end();
  console.log("done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
