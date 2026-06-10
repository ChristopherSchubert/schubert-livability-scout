#!/usr/bin/env node
// Fold the seeded per-city Slovenia itineraries (Ljubljana / Bled / Piran rows,
// cities.itinerary from migration 0012) into ONE Trip row (migration 0013) — the
// first real exercise of the multi-city Trip model (lib/trip.js). The per-city
// itinerary column is left in place as the migration source (deprecated, not
// dropped). Idempotent: removes any prior "Slovenia" trip for the owner first.
//
// Writes via the IPv4 session pooler; password from the macOS Keychain.

import { Client } from "pg";
import { execFileSync } from "node:child_process";

const LEG_NAMES = ["Ljubljana, Slovenia", "Bled, Slovenia", "Piran, Slovenia"];

const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"]).toString().trim();
const c = new Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", database: "postgres", password: pw, ssl: { rejectUnauthorized: false } });
await c.connect();

// Owner — first profile (solo workspace).
const prof = await c.query("select id from profiles order by id limit 1");
const userId = prof.rows[0]?.id;
if (!userId) { console.error("no profile found"); process.exit(1); }

// Pull the three legs' itineraries + dates + ids.
const rows = (await c.query(
  "select id, name, arrive_date, depart_date, itinerary from cities where name = any($1)",
  [LEG_NAMES]
)).rows;
const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

const legs = [];
const entries = [];
let start = null, end = null;

for (const name of LEG_NAMES) {
  const row = byName[name];
  if (!row?.itinerary) { console.log(`  ⚠ ${name}: no itinerary, skipping`); continue; }
  const arrive = String(row.arrive_date), depart = String(row.depart_date);
  legs.push({ cityId: row.id, name, arrive, depart });
  if (!start || arrive < start) start = arrive;
  if (!end || depart > end) end = depart;

  for (const e of row.itinerary.entries || []) {
    const role = e.kind === "travel" || e.kind === "checkin" ? "connective" : "anchor";
    const markers = [];
    if (e.cost?.cashOnly) markers.push({ type: "cashOnly" });
    if (e.prepaid) markers.push({ type: "prepaid" });
    const booking = {};
    if (e.confirmation) booking.confirmation = e.confirmation;
    if (e.prepaid) booking.prepaid = true;
    entries.push({
      id: e.id,
      day: e.day,
      cityId: row.id,
      time: { start: e.start, end: e.end },
      kind: e.kind,
      role,
      title: e.title,
      ...(e.note ? { note: e.note } : {}),
      ...(e.contact ? { contact: e.contact } : {}),
      ...(e.url ? { url: e.url } : {}),
      ...(e.cost ? { cost: e.cost } : {}),
      ...(Object.keys(booking).length ? { booking } : {}),
      ...(markers.length ? { markers } : {}),
    });
  }
}

const trip = {
  user_id: userId,
  name: "Slovenia",
  theme: "🇸🇮 Ljubljana · Bled · Piran",
  start_date: start,
  end_date: end,
  glance: { diet: "Vegetarian", travelers: ["Janice", "Chris"], theme: "🇸🇮 Slovenia" },
  pre_trip: {},
  legs,
  options: {},
  entries,
};

// Idempotent: clear any prior Slovenia trip for this owner.
await c.query("delete from trips where user_id = $1 and name = $2", [userId, "Slovenia"]);
const res = await c.query(
  `insert into trips (user_id, name, theme, start_date, end_date, glance, pre_trip, legs, options, entries)
   values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb) returning id`,
  [trip.user_id, trip.name, trip.theme, trip.start_date, trip.end_date,
   JSON.stringify(trip.glance), JSON.stringify(trip.pre_trip), JSON.stringify(trip.legs),
   JSON.stringify(trip.options), JSON.stringify(trip.entries)]
);

console.log(`  ✓ Trip "${trip.name}" ${trip.start_date}→${trip.end_date}`);
console.log(`    id=${res.rows[0].id} | legs=${legs.length} | entries=${entries.length}`);
await c.end();
console.log("done.");
