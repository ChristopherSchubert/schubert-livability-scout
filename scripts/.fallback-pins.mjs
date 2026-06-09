// scripts/.fallback-pins.mjs — durable fallback pins for blocks the measurer
// can't resolve (named landmarks OSM under-maps: wharves, marinas, ski bases,
// college gates). Google text-search finds them; we write each as a
// block_geometries entry with accuracy "manual" so the measurer PRESERVES it
// across --force (Layer 0) — a permanent fallback, never recomputed.
//
// TIGHT gate: a block is walkable, so a hit must be inside the stay-zone polygon
// OR within GATE_KM of the pin. A wrong pin is worse than a placeholder.
//
//   node scripts/.fallback-pins.mjs            # dry run — shows proposed pins
//   node scripts/.fallback-pins.mjs --commit   # write them

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
{
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, "..", ".env.local");
  if (existsSync(envPath)) for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] == null) { let v = m[2]; if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); process.env[m[1]] = v; }
  }
}
import { haversine, pointInGeoJSON } from "../lib/measure.js";
import { connect } from "../lib/measurers/_db.js";

function googleKey() {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  if (process.env.GKEY) return process.env.GKEY;
  return execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "google-places-api-key", "-w"], { encoding: "utf8" }).trim();
}
const GKEY = googleKey();
const commit = process.argv.includes("--commit");
const GATE_M = 2500;          // walkable cap in METERS (haversine returns meters) —
                             //   well under the 5 km that's too loose for a block
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gQuery(query, lat, lon) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY, "X-Goog-FieldMask": "places.location,places.displayName" },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1, locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: 2500 } } }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  const p = (j.places || [])[0];
  return p?.location ? { lat: p.location.latitude, lon: p.location.longitude, name: p.displayName?.text } : null;
}

// Progressive simplification: the core feature, or the bounding streets.
function buildQueries(block) {
  const out = [];
  const add = (s) => { s = (s || "").replace(/\s+/g, " ").trim(); if (s.length >= 3 && !out.includes(s)) out.push(s); };
  const base = block.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  add(base);
  let m;
  if ((m = base.match(/^(.+?)\s+between\s+(.+?)\s+and\s+(.+)$/i))) { add(`${m[2]} and ${m[3]}`); add(m[1]); }
  else if ((m = base.match(/^(.+?)\s+(?:near|along|at|around|behind|toward|approaching|approach)\s+(.+)$/i))) { add(m[2]); add(m[1]); }
  else if ((m = base.match(/^(.+?)\s*[/&]\s*(.+)$/))) { add(m[1]); add(m[2]); }
  add(base.replace(/\s+(?:approach|base village|grounds|trailhead|boardwalk|promenade|overlooks?|edge|frame|area|block|village|base|gates?|courts?|depot|waterfront|lakefront|slope)\b.*$/i, ""));
  return out;
}

const isResolved = (g) => g && g.lat != null && g.accuracy !== "unresolved";

const client = await connect();
const { rows } = await client.query(
  `select slug, name, lat, lon, blocks, block_geometries, stay_zone_boundary
     from cities where coalesce(jsonb_array_length(blocks),0) > 0`);

let scanned = 0, pinned = 0, rejected = 0, miss = 0, changedCities = 0;
for (const city of rows) {
  const blocks = city.blocks || [];
  const geoms = Array.isArray(city.block_geometries) ? city.block_geometries.slice() : [];
  while (geoms.length < blocks.length) geoms.push({ name: blocks[geoms.length], lat: null, lon: null, accuracy: "unresolved" });
  let cityChanged = false;

  for (let i = 0; i < blocks.length; i++) {
    if (isResolved(geoms[i])) continue;
    scanned++;
    let best = null;
    for (const q of buildQueries(blocks[i])) {
      let hit = null;
      try { hit = await gQuery(`${q}, ${city.name}`, city.lat, city.lon); } catch (e) { console.error(`! ${city.slug} "${q}": ${e.message}`); }
      await sleep(45);
      if (hit) { const d = haversine(city.lat, city.lon, hit.lat, hit.lon); if (!best || d < best.d) best = { ...hit, d }; }
    }
    if (!best) { miss++; continue; }
    const inGate = best.d <= GATE_M || (city.stay_zone_boundary && pointInGeoJSON(best.lat, best.lon, city.stay_zone_boundary));
    if (!inGate) { rejected++; console.log(`  REJECT ${city.slug}: "${blocks[i]}" → ${best.name} (${(best.d/1000).toFixed(1)} km — too far)`); continue; }
    geoms[i] = { name: blocks[i], lat: best.lat, lon: best.lon, accuracy: "manual", source: "google-fallback", meta: { matched: best.name, km: +(best.d/1000).toFixed(2) }, asOf: "2026-06-09" };
    pinned++; cityChanged = true;
    console.log(`  PIN ${city.slug}: "${blocks[i]}" → ${best.lat.toFixed(4)},${best.lon.toFixed(4)} (${best.name}, ${(best.d/1000).toFixed(2)} km)`);
  }
  if (cityChanged) { changedCities++; if (commit) await client.query(`update cities set block_geometries=$1::jsonb where slug=$2`, [JSON.stringify(geoms), city.slug]); }
}
console.log(`\n${commit ? "COMMITTED" : "DRY RUN"} — scanned ${scanned} · pinned ${pinned} · rejected ${rejected} (too far) · no-match ${miss} · ${changedCities} cities`);
await client.end();
