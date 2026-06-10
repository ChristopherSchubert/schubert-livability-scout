#!/usr/bin/env node
// Enrich exactly the places a Trip actually touches: match the trip's entries
// (and its legs' lodging) against the cached pois by name, then fetch the
// cited-marker attributes (migration 0014) for ONLY those matches — a handful
// of Place Details calls, not a neighborhood sweep. Unmatched entries are
// reported, not invented (many entries aren't venues at all: "Wake up",
// travel legs, the balloon launch field).
//
// Usage: node scripts/enrich-trip-pois.mjs [trip-name]   (default "Slovenia")

import { Client } from "pg";
import { execFileSync } from "node:child_process";

const FIELD_MASK = [
  "allowsDogs", "servesVegetarianFood", "goodForChildren", "outdoorSeating",
  "accessibilityOptions", "paymentOptions", "regularOpeningHours.weekdayDescriptions",
].join(",");
const tripName = process.argv[2] || "Slovenia";

const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"]).toString().trim();
const gkey = process.env.GKEY || execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "google-places-api-key", "-w"]).toString().trim();
const c = new Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", database: "postgres", password: pw, ssl: { rejectUnauthorized: false } });
await c.connect();

const trip = (await c.query("select legs, entries from trips where name = $1 limit 1", [tripName])).rows[0];
if (!trip) { console.error(`trip "${tripName}" not found`); process.exit(1); }

// Venue-name candidates: entry titles with obvious non-venue prefixes stripped,
// plus each leg's lodging name from the per-city itinerary checkin entries.
function venueGuess(title) {
  return title
    .replace(/^(Lunch|Dinner|Breakfast|Check in|Check out|Check Out|Quick bite at|Dessert at|Sunset drinks)\s*[—·-]?\s*/i, "")
    .replace(/\s*\(.*\)$/, "")
    .trim();
}
const titles = [...new Set(trip.entries.map((e) => venueGuess(e.title)).filter((t) => t.length > 3))];

// Match each guess against pois INSIDE the trip legs' boxes only, and require
// substantial names both ways (≥5 chars) — a reverse match like "FRA" ⊂
// "Land in Frankfurt" or "Boarding" matching a bus stop on another continent
// is exactly the false positive this guards against (2026-06-09 first run).
const legCities = (await c.query("select lat, lon from cities where id = any($1)",
  [trip.legs.map((l) => l.cityId)])).rows;
const geoClauses = legCities.map((_, i) =>
  `(lat between $${i * 4 + 2} and $${i * 4 + 3} and lon between $${i * 4 + 4} and $${i * 4 + 5})`).join(" or ");
const geoParams = legCities.flatMap((l) => [l.lat - 0.03, l.lat + 0.03, l.lon - 0.045, l.lon + 0.045]);

const matches = new Map(); // place_id -> { poiName, matchedFrom }
const unmatched = [];
for (const t of titles) {
  if (t.length < 5) { unmatched.push(t); continue; }
  const r = await c.query(
    `select place_id, name from pois
     where (${geoClauses})
       and (name ilike '%' || $1 || '%' or ($1 ilike '%' || name || '%' and length(name) >= 5))
     order by user_rating_count desc nulls last limit 1`, [t, ...geoParams]);
  if (r.rows.length) {
    const { place_id, name } = r.rows[0];
    if (!matches.has(place_id)) matches.set(place_id, { poiName: name, matchedFrom: t });
  } else {
    unmatched.push(t);
  }
}

console.log(`Trip "${tripName}": ${trip.entries.length} entries → ${titles.length} venue guesses → ${matches.size} cache matches\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fetched = 0, skipped = 0;
for (const [placeId, m] of matches) {
  const fresh = (await c.query(
    "select 1 from pois where place_id = $1 and attributes_fetched_at > now() - interval '90 days'", [placeId])).rows.length;
  if (fresh) { skipped++; console.log(`  ↻ ${m.poiName} (fresh, skipped)`); continue; }
  const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: { "X-Goog-Api-Key": gkey, "X-Goog-FieldMask": FIELD_MASK },
  });
  if (!r.ok) { console.log(`  ✗ ${m.poiName}: HTTP ${r.status}`); continue; }
  const attrs = await r.json();
  await c.query("update pois set attributes = $1::jsonb, attributes_fetched_at = now() where place_id = $2",
    [JSON.stringify(attrs), placeId]);
  const flags = [
    attrs.allowsDogs === true && "dog",
    attrs.servesVegetarianFood === true && "veg",
    attrs.outdoorSeating === true && "patio",
    attrs.goodForChildren === true && "kid",
    attrs.paymentOptions?.acceptsCashOnly === true && "cashOnly",
  ].filter(Boolean);
  console.log(`  ✓ ${m.poiName} ← "${m.matchedFrom}" · markers: ${flags.join(" ") || "(none reported)"}`);
  fetched++;
  await sleep(120);
}

console.log(`\nfetched=${fetched} skipped(fresh)=${skipped}`);
console.log(`\nNot in the POI cache (no marker source — left null, not guessed):`);
for (const u of unmatched) console.log(`  – ${u}`);
await c.end();
