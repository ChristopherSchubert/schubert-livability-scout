#!/usr/bin/env node
// Migrate the real Slovenia trip v1 → v2 (#14). The 79 entries live in the
// trips.entries blob in v1 atom shape; the v2 UI (locked decision #2) needs
// them as one-row-per-entry in trip_entries with the v2 atom: kind → (category,
// status), time → {range|point}, cost → structured, place → resolved place_id
// (or honest null), plus backfilled travelers + passes on the frame.
//
// Idempotent: delete-then-insert this trip's trip_entries. Runs AFTER migrations
// 0016 + 0017 are applied. pg + Keychain (the agent runs measurement/migration
// scripts; the owner never does). Place resolution is cache-first against pois
// (never a fabricated id).
//
// Usage: node scripts/migrate-slovenia-v2.mjs [trip-name]   (default "Slovenia")

import { Client } from "pg";
import { execFileSync } from "node:child_process";

const tripName = process.argv[2] || "Slovenia";
const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"]).toString().trim();
const c = new Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", database: "postgres", password: pw, ssl: { rejectUnauthorized: false } });
await c.connect();

const trip = (await c.query("select id, legs, entries from trips where name = $1 limit 1", [tripName])).rows[0];
if (!trip) { console.error(`trip "${tripName}" not found`); process.exit(1); }
const v1 = trip.entries || [];
if (!v1.length) { console.error(`trip "${tripName}" has no v1 entries to migrate`); process.exit(1); }

// kind → (category, default status). Per-entry signals (confirmation/prepaid/
// cashOnly) refine status below. Spec: features/trip-planner-components.md §3.
const KIND = {
  booked:   { category: "activity", status: "booked" },
  meal:     { category: "meal",     status: "none" },
  travel:   { category: "travel",   status: "none" },
  checkin:  { category: "stay",     status: "reserved" },
  todo:     { category: "errand",   status: "none" },
  flexible: { category: "activity", status: "none" },
};

function v2Status(e, base) {
  if (e.booking?.confirmation) return "booked";
  if (e.cost?.cashOnly) return "reserved";     // held/owed but not prepaid (paid on site)
  if (e.booking?.prepaid) return "booked";
  return base;
}
function v2Time(e) {
  const t = e.time || {};
  if (t.start && t.end) return { mode: "range", start: t.start, end: t.end };
  if (t.start) return { mode: "point", at: t.start };
  return { mode: "bucket", bucket: "flex" };
}
function v2Cost(e) {
  if (!e.cost || e.cost.amount == null) return undefined;
  const cashOnly = !!e.cost.cashOnly;
  return {
    amount: e.cost.amount,
    currency: e.cost.currency || "EUR",
    per: e.cost.per || "total",
    estimate: !!e.cost.estimate,
    payment: cashOnly ? "onSite" : (e.booking?.prepaid ? "prepaid" : "prepaid"),
    cashOnly,
  };
}

// Place resolution: match an entry title against pois INSIDE the legs' boxes
// (the enrich-trip-pois matcher — substantial names both ways to avoid the
// "FRA" ⊂ "Land in Frankfurt" false positive). Unmatched → null, never guessed.
const legCities = (await c.query("select lat, lon from cities where id = any($1)", [trip.legs.map((l) => l.cityId)])).rows;
const geoClauses = legCities.map((_, i) => `(lat between $${i * 4 + 2} and $${i * 4 + 3} and lon between $${i * 4 + 4} and $${i * 4 + 5})`).join(" or ");
const geoParams = legCities.flatMap((l) => [l.lat - 0.03, l.lat + 0.03, l.lon - 0.045, l.lon + 0.045]);
function venueGuess(title) {
  return title.replace(/^(Lunch|Dinner|Breakfast|Check in|Check out|Quick bite at|Dessert at|Sunset drinks)\s*[—·-]?\s*/i, "").replace(/\s*\(.*\)$/, "").trim();
}
async function resolvePlace(title) {
  const g = venueGuess(title);
  if (g.length < 5) return null;
  const r = await c.query(
    `select place_id, name, lat, lon, formatted_address from pois
     where (${geoClauses})
       and (name ilike '%' || $1 || '%' or ($1 ilike '%' || name || '%' and length(name) >= 5))
     order by user_rating_count desc nulls last limit 1`, [g, ...geoParams]);
  if (!r.rows.length) return null;
  const p = r.rows[0];
  return { placeId: p.place_id, name: p.name, lat: p.lat, lon: p.lon, address: p.formatted_address || null };
}

// Build v2 entry rows.
let resolved = 0;
const rows = [];
for (let i = 0; i < v1.length; i++) {
  const e = v1[i];
  const base = KIND[e.kind] || { category: "activity", status: "none" };
  const place = await resolvePlace(e.title || "");
  if (place) resolved++;
  const payload = {
    role: e.role || (e.kind === "travel" || e.kind === "checkin" ? "connective" : "anchor"),
    category: base.category,
    status: v2Status(e, base.status),
    time: v2Time(e),
    title: e.title,
    ...(e.note ? { note: e.note } : {}),
    ...(place ? { place } : {}),
    ...(e.contact ? { contact: e.contact } : {}),
    ...(e.url ? { url: e.url } : {}),
    ...(v2Cost(e) ? { cost: v2Cost(e) } : {}),
    ...(e.booking && Object.keys(e.booking).length ? { booking: e.booking } : {}),
    ...(e.markers?.length ? { markers: e.markers } : {}),
  };
  rows.push({ day: e.day, sort: i, payload });
}

// travelers + passes (frame backfill). Diet derives from chips (veg).
const travelers = [
  { name: "Janice", kind: "person", chips: ["veg"] },
  { name: "Chris", kind: "person", chips: ["veg"] },
];
const passes = [
  { id: "ljubljana-card", name: "Ljubljana City Card", cost: null },
  { id: "julian-alps-card", name: "Julian Alps Card", cost: null },
  { id: "venice-day-visitor", name: "Venice day-visitor contribution", cost: null },
];

// Idempotent write: clear this trip's entries, insert the v2 set, backfill frame.
await c.query("delete from trip_entries where trip_id = $1", [trip.id]);
for (const r of rows) {
  await c.query(
    "insert into trip_entries (trip_id, day, payload, sort) values ($1, $2, $3::jsonb, $4)",
    [trip.id, r.day || null, JSON.stringify(r.payload), r.sort]);
}
await c.query("update trips set travelers = $2::jsonb, passes = $3::jsonb, updated_at = now() where id = $1",
  [trip.id, JSON.stringify(travelers), JSON.stringify(passes)]);

console.log(`✓ ${tripName}: ${rows.length} v2 entries → trip_entries (${resolved} with a resolved place_id)`);
console.log(`  travelers: ${travelers.length} · passes: ${passes.length}`);
await c.end();
console.log("done.");
