// scripts/.reresolve-far.mjs — re-resolve block pins that landed OUTSIDE the
// walkable circle. The measurer's 5 km integrity gate accepted same-named
// streets/features up to 5 km away (Salem's downtown "Washington St" pinned
// 4 km out). Re-geocode each far pin with a TIGHT bias around the city center,
// and only accept a result that's inside the stay-zone polygon OR ≤ GATE_KM of
// the center AND closer than the current pin — so a misplaced pin snaps to the
// correct downtown spot. Anything still far after that is a genuine distant
// feature (a long coastal walk, or a drive-to non-block) — reported, not moved.
//
//   node scripts/.reresolve-far.mjs            # dry run
//   node scripts/.reresolve-far.mjs --commit

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
const FAR_KM = 1.5;        // a pin beyond this from center is "outside the circle"
const GATE_KM = 1.8;       // accept a re-resolved pin only within this (or in zone)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gQuery(query, lat, lon) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY, "X-Goog-FieldMask": "places.location,places.displayName" },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1, locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: 1100 } } }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  const p = (j.places || [])[0];
  return p?.location ? { lat: p.location.latitude, lon: p.location.longitude, name: p.displayName?.text } : null;
}
function buildQueries(block) {
  const out = []; const add = (s) => { s = (s || "").replace(/\s+/g, " ").trim(); if (s.length >= 3 && !out.includes(s)) out.push(s); };
  const base = block.replace(/\s*\([^)]*\)\s*/g, " ").trim(); add(base);
  let m;
  if ((m = base.match(/^(.+?)\s+between\s+(.+?)\s+and\s+(.+)$/i))) { add(`${m[1]} and ${m[2]}`); add(m[1]); }
  else if ((m = base.match(/^(.+?)\s+(?:near|along|at|around|behind|toward|approaching|approach)\s+(.+)$/i))) { add(m[1]); add(m[2]); }
  else if ((m = base.match(/^(.+?)\s*[/&]\s*(.+)$/))) { add(m[1]); add(m[2]); }
  add(base.replace(/\s+(?:approach|grounds|trailhead|boardwalk|promenade|overlooks?|edge|area|block|gates?|depot|waterfront|lakefront|downtown)\b.*$/i, ""));
  return out;
}

const client = await connect();
const { rows } = await client.query(
  `select slug, name, lat, lon, blocks, block_geometries, stay_zone_boundary from cities where coalesce(jsonb_array_length(blocks),0) > 0 and lat is not null`);

let far = 0, fixed = 0, stillFar = [];
for (const city of rows) {
  const blocks = city.blocks || [];
  const geoms = Array.isArray(city.block_geometries) ? city.block_geometries.slice() : [];
  let cityChanged = false;
  for (let i = 0; i < blocks.length; i++) {
    const x = geoms[i];
    if (!(x && x.lat != null && x.accuracy !== "unresolved")) continue;
    const curKm = haversine(city.lat, city.lon, x.lat, x.lon) / 1000;
    if (curKm <= FAR_KM) continue;
    far++;
    let best = null;
    for (const q of buildQueries(blocks[i])) {
      let hit = null; try { hit = await gQuery(`${q}, ${city.name}`, city.lat, city.lon); } catch {}
      await sleep(45);
      if (hit) { const d = haversine(city.lat, city.lon, hit.lat, hit.lon) / 1000; if (!best || d < best.km) best = { ...hit, km: d }; }
    }
    const inZone = best && (best.km <= GATE_KM || (city.stay_zone_boundary && pointInGeoJSON(best.lat, best.lon, city.stay_zone_boundary)));
    if (best && inZone && best.km < curKm - 0.2) {
      geoms[i] = { name: blocks[i], lat: best.lat, lon: best.lon, accuracy: "manual", source: "tight-reresolve", meta: { matched: best.name, km: +best.km.toFixed(2), wasKm: +curKm.toFixed(2) }, asOf: "2026-06-09" };
      fixed++; cityChanged = true;
      console.log(`  FIX ${city.slug}: "${blocks[i]}"  ${curKm.toFixed(1)}km → ${best.km.toFixed(2)}km (${best.name})`);
    } else {
      stillFar.push(`${curKm.toFixed(1)}km ${city.slug}: ${blocks[i]}${best ? ` (nearest match still ${best.km.toFixed(1)}km)` : " (no closer match)"}`);
    }
  }
  if (cityChanged && commit) await client.query(`update cities set block_geometries=$1::jsonb where slug=$2`, [JSON.stringify(geoms), city.slug]);
}
console.log(`\n${commit ? "COMMITTED" : "DRY RUN"} — far pins ${far} · fixed (snapped into circle) ${fixed} · still far ${stillFar.length}`);
console.log("\nSTILL FAR (genuine distant features — long walks or drive-to non-blocks):");
for (const s of stillFar.sort((a, b) => parseFloat(b) - parseFloat(a))) console.log("  " + s);
await client.end();
