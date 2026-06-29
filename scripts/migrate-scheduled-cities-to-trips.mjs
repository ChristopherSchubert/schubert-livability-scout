#!/usr/bin/env node
// migrate-scheduled-cities-to-trips.mjs — #112: one-time backfill that retires
// the pre-#108 legacy "Planned" bridge. Every city carrying status='Scheduled'
// + arrive_date + depart_date that is NOT already a leg in any trip becomes a
// single-city trip; then its city-row schedule fields are cleared. After this
// runs, "Planned" derives ONLY from trip membership and the legacy fallback in
// lib/stages.js can be deleted.
//
// Idempotent: skips cities already represented as a trip leg.
// Reversible: see the rollback note at the bottom of this file.
//
// Modes:
//   node scripts/migrate-scheduled-cities-to-trips.mjs            # dry plan
//   node scripts/migrate-scheduled-cities-to-trips.mjs --apply    # write
//
// Owner: defaults to the first member in platform.member (today: Chris). Pass
// --owner=<member.id> to override (e.g. for a future Janice-owned row).
//
// Creds: macOS Keychain (account `livability-scout`), session pooler — same
// pattern as scripts/migrate-travel-data.mjs.

import pg from "pg";
import { execFileSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");
const ownerFlag = process.argv.find((a) => a.startsWith("--owner="));
const OWNER_OVERRIDE = ownerFlag?.split("=", 2)[1] ?? null;

function keychain(slot) {
  return execFileSync(
    "security",
    ["find-generic-password", "-a", "livability-scout", "-s", slot, "-w"],
    { encoding: "utf8" },
  ).trim();
}

const db = new pg.Client({
  host: "aws-1-us-east-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.cigsjmoornigndaygqua",
  password: keychain("supabase-family-db-password"),
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const ownerId = OWNER_OVERRIDE
  ?? (await db.query("select id from platform.member order by created_at limit 1")).rows[0]?.id;
if (!ownerId) {
  console.error("✗ no member found and no --owner flag");
  process.exit(1);
}

const legacy = (await db.query(`
  select id, name, status, arrive_date, depart_date
  from travel.cities
  where status = 'Scheduled'
    and arrive_date is not null
    and depart_date is not null
    and not exists (
      select 1
      from travel.trips t,
           jsonb_array_elements(coalesce(t.legs, '[]'::jsonb)) leg
      where leg->>'cityId' = travel.cities.id::text
    )
  order by arrive_date
`)).rows;

console.log(`mode:       ${APPLY ? "APPLY" : "DRY (no writes)"}`);
console.log(`owner:      ${ownerId}`);
console.log(`legacy-path cities: ${legacy.length}`);
if (legacy.length === 0) {
  console.log("nothing to migrate — already clean.");
  await db.end();
  process.exit(0);
}

const ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const plan = legacy.map((row) => {
  const arrive = ymd(row.arrive_date);
  const depart = ymd(row.depart_date);
  const shortName = String(row.name).split(",")[0].trim();
  const year = arrive.slice(0, 4);
  const tripName = `${shortName} ${year}`;
  const leg = { cityId: row.id, name: row.name, arrive, depart };
  return { cityId: row.id, cityName: row.name, tripName, arrive, depart, leg };
});

console.log("\nplan:");
for (const p of plan) {
  console.log(`  + trip "${p.tripName}"  ${p.arrive} → ${p.depart}  (leg: ${p.cityName})`);
  console.log(`    then clear ${p.cityName}.status / arrive_date / depart_date`);
}

if (!APPLY) {
  console.log("\nDRY run. Re-run with --apply to write.");
  await db.end();
  process.exit(0);
}

// Single transaction — all or nothing.
await db.query("begin");
try {
  for (const p of plan) {
    await db.query(
      `insert into travel.trips
         (user_id, name, theme, start_date, end_date,
          glance, pre_trip, legs, options, entries)
       values ($1, $2, null, $3, $4,
               '{}'::jsonb, '{}'::jsonb, $5::jsonb, '{}'::jsonb, '[]'::jsonb)`,
      [ownerId, p.tripName, p.arrive, p.depart, JSON.stringify([p.leg])],
    );
    await db.query(
      `update travel.cities
         set status = null, arrive_date = null, depart_date = null
       where id = $1`,
      [p.cityId],
    );
    console.log(`  ✓ ${p.tripName}`);
  }
  await db.query("commit");
} catch (err) {
  await db.query("rollback");
  console.error("✗ rolled back:", err.message);
  process.exit(1);
}

// Post-condition: count of legacy-path cities = 0.
const after = (await db.query(`
  select count(*)::int n
  from travel.cities
  where status = 'Scheduled' and arrive_date is not null and depart_date is not null
    and not exists (
      select 1 from travel.trips t,
                 jsonb_array_elements(coalesce(t.legs, '[]'::jsonb)) leg
      where leg->>'cityId' = travel.cities.id::text
    )
`)).rows[0].n;
console.log(`\npost-check: legacy-path cities now ${after} (expect 0)`);
if (after !== 0) {
  console.error("✗ post-check failed");
  process.exit(1);
}

await db.end();
console.log("done.");

// Rollback (if ever needed):
//   begin;
//   update travel.cities set status='Scheduled', arrive_date=<saved>, depart_date=<saved> where id=<saved>;
//   delete from travel.trips where id=<just-created-id>;
//   commit;
