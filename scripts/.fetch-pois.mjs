// scripts/.fetch-pois.mjs — populate the local `pois` cache from Google Places.
//
// Hits Google Places (New) Nearby Search ONCE per city (tiled to beat the
// 20-result cap), and upserts every social POI into the `pois` table. After
// this, the block generator (and later the Aliveness metrics) read POIs from
// the local DB — Google is never called again unless we --force a refresh.
//
// Full Enterprise field mask: the call is already billed at Enterprise tier for
// addressComponents, so we capture the whole tier (rating, userRatingCount,
// types, priceLevel, businessStatus, formattedAddress) for free — richer cache,
// identical cost.
//
// Usage:
//   node scripts/.fetch-pois.mjs --slug burlington-vt
//   node scripts/.fetch-pois.mjs --all            # skips cities fetched recently
//   node scripts/.fetch-pois.mjs --all --force    # refetch everything

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
{
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, "..", ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] == null) process.env[m[1]] = v;
    }
  }
}
import { haversine } from "../lib/measure.js";
import { connect } from "../lib/measurers/_db.js";

function googleKey() {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  if (process.env.GKEY) return process.env.GKEY;
  return execFileSync("security",
    ["find-generic-password", "-a", "livability-scout", "-s", "google-places-api-key", "-w"],
    { encoding: "utf8" }).trim();
}
const GKEY = googleKey();

const RADIUS_M = 1000;   // gather radius around each city pin
const TILE_R = 350;
const TILE_STEP = 450;
const FIELD_MASK = [
  "places.id", "places.location", "places.displayName", "places.types",
  "places.primaryType", "places.rating", "places.userRatingCount",
  "places.priceLevel", "places.businessStatus", "places.formattedAddress",
  "places.addressComponents",
].join(",");
const GOOGLE_TYPES = [
  "restaurant", "cafe", "coffee_shop", "bakery", "bar", "pub", "wine_bar",
  "ice_cream_shop", "meal_takeaway", "art_gallery", "book_store", "clothing_store",
  "gift_shop", "jewelry_store", "shoe_store", "florist", "liquor_store", "market",
  "museum", "tourist_attraction", "performing_arts_theater", "movie_theater",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function googleNearby(lat, lon, radius) {
  const body = JSON.stringify({
    includedTypes: GOOGLE_TYPES, maxResultCount: 20,
    locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius } },
  });
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY, "X-Goog-FieldMask": FIELD_MASK },
        body,
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.places || [];
    } catch (e) { lastErr = e; await sleep(800 * (attempt + 1)); }
  }
  throw new Error(`Google Places (after retries): ${lastErr?.message || lastErr}`);
}

function toRow(p) {
  const route = (p.addressComponents || []).find((a) => (a.types || []).includes("route"));
  return {
    place_id: p.id,
    name: p.displayName?.text || null,
    lat: p.location?.latitude,
    lon: p.location?.longitude,
    primary_type: p.primaryType || null,
    types: p.types || null,
    rating: p.rating ?? null,
    user_rating_count: p.userRatingCount ?? null,
    price_level: p.priceLevel || null,
    business_status: p.businessStatus || null,
    street: route ? (route.shortText || route.longText) : null,
    formatted_address: p.formattedAddress || null,
  };
}

async function fetchCity(client, city) {
  const { lat, lon } = city;
  const mPerLat = 111320, mPerLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const seen = new Map();
  for (let dy = -RADIUS_M; dy <= RADIUS_M; dy += TILE_STEP) {
    for (let dx = -RADIUS_M; dx <= RADIUS_M; dx += TILE_STEP) {
      if (Math.hypot(dx, dy) > RADIUS_M + TILE_R) continue;
      const places = await googleNearby(lat + dy / mPerLat, lon + dx / mPerLon, TILE_R);
      for (const p of places) {
        if (!p.id || !p.location) continue;
        if (haversine(lat, lon, p.location.latitude, p.location.longitude) > RADIUS_M) continue;
        if (!seen.has(p.id)) seen.set(p.id, toRow(p));
      }
      await sleep(40);
    }
  }
  const rows = [...seen.values()];
  for (const r of rows) {
    await client.query(
      `insert into pois (place_id,name,lat,lon,primary_type,types,rating,user_rating_count,price_level,business_status,street,formatted_address,source,fetched_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'google_places',now())
       on conflict (place_id) do update set
         name=excluded.name, lat=excluded.lat, lon=excluded.lon, primary_type=excluded.primary_type,
         types=excluded.types, rating=excluded.rating, user_rating_count=excluded.user_rating_count,
         price_level=excluded.price_level, business_status=excluded.business_status,
         street=excluded.street, formatted_address=excluded.formatted_address, fetched_at=now()`,
      [r.place_id, r.name, r.lat, r.lon, r.primary_type, r.types, r.rating, r.user_rating_count,
       r.price_level, r.business_status, r.street, r.formatted_address],
    );
  }
  return rows.length;
}

// ── main ──
const argv = process.argv.slice(2);
const slugArg = argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : null;
const wantAll = argv.includes("--all");
const force = argv.includes("--force");

const client = await connect();
let cities;
if (slugArg) {
  const { rows } = await client.query(`select slug,name,lat,lon from cities where slug = any($1)`, [slugArg.split(",")]);
  cities = rows;
} else if (wantAll) {
  const { rows } = await client.query(`select slug,name,lat,lon from cities where lat is not null order by name`);
  cities = rows;
} else { console.error("pass --slug <slug[,slug]> or --all"); await client.end(); process.exit(2); }

// --skip-cached: opt-in resume. NOT the default — a bbox count includes POIs
// spilled in from an adjacent city's fetch, so auto-skipping silently left
// dense neighborhoods (Strip District, Squirrel Hill) with only partial data.
// Default is to (re)fetch every requested city; the upsert is idempotent.
const skipCached = argv.includes("--skip-cached");
let total = 0;
for (const city of cities) {
  if (skipCached && !force) {
    const { rows } = await client.query(
      `select count(*)::int n from pois where lat between $1 and $2 and lon between $3 and $4`,
      [city.lat - 0.012, city.lat + 0.012, city.lon - 0.012, city.lon + 0.012]);
    if (rows[0].n > 0) { console.log(`${city.slug}: ${rows[0].n} cached, skip`); continue; }
  }
  try {
    const n = await fetchCity(client, city);
    total += n;
    console.log(`${city.slug}: ${n} POIs cached`);
  } catch (e) { console.error(`! ${city.slug}: ${e.message}`); }
}
console.log(`\nDone — ${total} POIs upserted into pois.`);
await client.end();
