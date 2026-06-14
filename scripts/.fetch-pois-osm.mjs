// scripts/.fetch-pois-osm.mjs — populate the SHARED `pois` cache for FREE from
// local Overpass (OSM). Sibling of .fetch-pois.mjs (Google); both write the
// same unified `pois` table, the score reads it source-agnostically.
//
// Why this exists: the walking-core SCORE only needs {location, category} per
// POI — it never uses rating/price (those are Google-only, for the trip UI).
// For US cities, OSM coverage ≈ Google (median 0.95×, see
// scripts/.compare-osm-vs-google.mjs), so a NEW city can be cached for $0
// instead of ~$3.22 of Google Nearby Search. Existing paid Google rows are
// never touched — we already paid for them and they stay.
//
// ⚠️ Double-count guard: a city must be filled from EXACTLY ONE source. Adding
// OSM rows to a city that already has Google rows would count the same café
// twice in the score. So by default we SKIP any city whose cache is non-empty;
// --force overrides only after you've cleared that city's rows yourself.
//
// ⚠️ Local Overpass is US-ONLY (geofabrik us-updates). Non-US cities (the
// Slovenia anchors) return zero here — keep them on their Google cache.
//
// Usage:
//   node scripts/.fetch-pois-osm.mjs --slug camden-me
//   node scripts/.fetch-pois-osm.mjs --all            # fills only empty cities
//   node scripts/.fetch-pois-osm.mjs --slug x --dry-run   # report, don't write

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
{
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, "..", ".env.local");
  if (existsSync(envPath)) for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
process.env.OVERPASS_URL ||= "http://localhost:12345/api/interpreter";

import { overpass, haversine } from "../lib/measure.js";
import { MAX_RADIUS } from "../lib/measurers/walking-core.js";
import { connect } from "../lib/measurers/_db.js";

const R = MAX_RADIUS; // 1500 m — match the score's outer cutoff

// OSM element tags → a Google-style primary_type that walking-core.js
// CATEGORY_BY_TYPE recognizes. Returning null drops the element (not a social
// POI). Mirrors the bucket logic in lib/measure.js osmMetrics so OSM-cached and
// Google-cached cities bucket the same way.
function osmPrimaryType(t = {}) {
  const a = t.amenity, s = t.shop, cu = t.cuisine || "";
  // cafés (incl. coffee/tea shops and any coffee-cuisine place)
  if (a === "cafe" || /coffee/.test(cu)) return "cafe";
  if (s === "coffee") return "coffee_shop";
  if (s === "tea") return "tea_house";
  if (s === "bakery" || s === "pastry") return "bakery";
  // bars
  if (a === "bar") return "bar";
  if (a === "pub") return "pub";
  if (a === "biergarten") return "bar";
  // restaurants
  if (a === "restaurant" || a === "food_court") return "restaurant";
  if (a === "fast_food") return "fast_food_restaurant";
  if (a === "ice_cream" || s === "ice_cream") return "ice_cream_shop";
  // daily needs
  if (s === "supermarket") return "supermarket";
  if (s === "convenience") return "convenience_store";
  if (s === "greengrocer") return "greengrocer";
  if (s === "butcher") return "butcher_shop";
  if (s === "deli") return "grocery_store";
  if (a === "pharmacy") return "pharmacy";
  return null;
}

async function osmCity(lat, lon) {
  const q = `[out:json][timeout:90];
    (nwr["amenity"~"^(cafe|restaurant|bar|pub|biergarten|fast_food|ice_cream|food_court)$"](around:${R},${lat},${lon});
     nwr["shop"~"^(coffee|bakery|pastry|tea|deli|greengrocer|supermarket|convenience|butcher)$"](around:${R},${lat},${lon});
     nwr["cuisine"~"coffee"](around:${R},${lat},${lon});
     nwr["amenity"="pharmacy"](around:${R},${lat},${lon}););
    out center tags;`;
  const d = await overpass(q);
  if (!d || !Array.isArray(d.elements)) throw new Error("Overpass returned no elements array");
  const rows = [];
  for (const el of d.elements) {
    const primary = osmPrimaryType(el.tags);
    if (!primary) continue;
    const plat = el.lat ?? el.center?.lat, plon = el.lon ?? el.center?.lon;
    if (plat == null || plon == null) continue;
    if (haversine(lat, lon, plat, plon) > R) continue;
    rows.push({
      place_id: `osm:${el.type}/${el.id}`,
      name: el.tags?.name || null,
      lat: plat, lon: plon,
      primary_type: primary,
      types: [primary],
    });
  }
  return rows;
}

// ── main ──
const argv = process.argv.slice(2);
const slugArg = argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : null;
const wantAll = argv.includes("--all");
const force = argv.includes("--force");
const dryRun = argv.includes("--dry-run");

const client = await connect();
let cities;
if (slugArg) {
  ({ rows: cities } = await client.query(
    `select slug,name,lat,lon from cities where slug = any($1)`, [slugArg.split(",")]));
} else if (wantAll) {
  ({ rows: cities } = await client.query(
    `select slug,name,lat,lon from cities where lat is not null order by name`));
} else { console.error("pass --slug <slug[,slug]> or --all"); await client.end(); process.exit(2); }

let total = 0, filled = 0, skipped = 0;
for (const city of cities) {
  // Double-count guard: only fill an empty city (unless --force after manual clear).
  const dLat = (R + 100) / 111320, dLon = (R + 100) / (111320 * Math.cos(city.lat * Math.PI / 180));
  const { rows: have } = await client.query(
    `select count(*)::int n from pois where lat between $1 and $2 and lon between $3 and $4`,
    [city.lat - dLat, city.lat + dLat, city.lon - dLon, city.lon + dLon]);
  if (have[0].n > 0 && !force) {
    console.log(`${city.slug}: ${have[0].n} already cached — skip (already paid / avoid double-count)`);
    skipped++; continue;
  }

  let rows;
  try { rows = await osmCity(city.lat, city.lon); }
  catch (e) { console.error(`! ${city.slug}: ${e.message}`); continue; }

  if (rows.length === 0) {
    console.log(`${city.slug}: 0 OSM POIs (non-US? local Overpass is US-only) — left empty, no zeros written`);
    continue;
  }
  if (dryRun) {
    const by = rows.reduce((m, r) => ((m[r.primary_type] = (m[r.primary_type] || 0) + 1), m), {});
    console.log(`${city.slug}: would write ${rows.length} OSM POIs`, by);
    continue;
  }
  for (const r of rows) {
    await client.query(
      `insert into pois (place_id,name,lat,lon,primary_type,types,source,fetched_at)
       values ($1,$2,$3,$4,$5,$6,'osm',now())
       on conflict (place_id) do update set
         name=excluded.name, lat=excluded.lat, lon=excluded.lon,
         primary_type=excluded.primary_type, types=excluded.types, fetched_at=now()`,
      [r.place_id, r.name, r.lat, r.lon, r.primary_type, r.types]);
  }
  total += rows.length; filled++;
  console.log(`${city.slug}: ${rows.length} OSM POIs cached (source=osm, $0)`);
}
console.log(`\nDone — ${filled} cit${filled === 1 ? "y" : "ies"} filled, ${skipped} skipped, ${total} OSM POIs upserted.`);
await client.end();
