#!/usr/bin/env node
// Fetch the cited-marker attribute fields (dog/veg/kid/patio/accessible/payment
// + opening hours) for cached POIs near a trip leg, via Google Places (New)
// Place Details. Fills pois.attributes (migration 0014) so Gather's markers are
// sourced and cited — never guessed. Leg-scoped on purpose: ~hundreds of calls,
// not the whole 18k cache.
//
// Usage:
//   node scripts/fetch-poi-attributes.mjs "Bled, Slovenia" [...more city names]
//   node scripts/fetch-poi-attributes.mjs --slovenia   (the three trip legs)
//
// Skips POIs fetched within the last 90 days. Sequential with a small delay —
// politeness over speed; a leg of ~100–400 POIs takes a few minutes.

import { Client } from "pg";
import { execFileSync } from "node:child_process";

const FIELD_MASK = [
  "allowsDogs", "servesVegetarianFood", "goodForChildren", "outdoorSeating",
  "accessibilityOptions", "paymentOptions", "regularOpeningHours.weekdayDescriptions",
].join(",");
const BOX_LAT = 0.03, BOX_LON = 0.045;   // same box as the sourcing query
const REFRESH_DAYS = 90;
const DELAY_MS = 120;

const args = process.argv.slice(2);
const cityNames = args.includes("--slovenia")
  ? ["Ljubljana, Slovenia", "Bled, Slovenia", "Piran, Slovenia"]
  : args.filter((a) => !a.startsWith("--"));
if (!cityNames.length) {
  console.error("usage: fetch-poi-attributes.mjs <city name>... | --slovenia");
  process.exit(1);
}

const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"]).toString().trim();
const gkey = process.env.GKEY || execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "google-places-api-key", "-w"]).toString().trim();
const c = new Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", database: "postgres", password: pw, ssl: { rejectUnauthorized: false } });
await c.connect();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fetched = 0, skipped = 0, failed = 0;

for (const name of cityNames) {
  const city = (await c.query("select name, lat, lon from cities where name = $1", [name])).rows[0];
  if (!city) { console.log(`✗ ${name}: city not found`); continue; }

  const pois = (await c.query(
    `select place_id, name from pois
     where lat between $1 and $2 and lon between $3 and $4
       and (attributes_fetched_at is null or attributes_fetched_at < now() - interval '${REFRESH_DAYS} days')`,
    [city.lat - BOX_LAT, city.lat + BOX_LAT, city.lon - BOX_LON, city.lon + BOX_LON]
  )).rows;
  console.log(`${name}: ${pois.length} POIs to fetch`);

  for (const p of pois) {
    try {
      const r = await fetch(`https://places.googleapis.com/v1/places/${p.place_id}`, {
        headers: { "X-Goog-Api-Key": gkey, "X-Goog-FieldMask": FIELD_MASK },
      });
      if (!r.ok) {
        failed++;
        if (r.status === 429) { console.log("  rate-limited, backing off 5s"); await sleep(5000); }
        else console.log(`  ✗ ${p.name}: HTTP ${r.status}`);
        continue;
      }
      const attrs = await r.json();
      // {} is a legitimate answer ("Google has no attribute data for this
      // place") — store it WITH the timestamp so we don't refetch; markers
      // derived from it stay null, which is the honest reading.
      await c.query(
        "update pois set attributes = $1::jsonb, attributes_fetched_at = now() where place_id = $2",
        [JSON.stringify(attrs), p.place_id]
      );
      fetched++;
      if (fetched % 50 === 0) console.log(`  …${fetched} fetched`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${p.name}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
}

console.log(`\ndone. fetched=${fetched} skipped(fresh)=${skipped} failed=${failed}`);
await c.end();
