// scripts/.cleanup-blocks.mjs — one-time corpus cleanup after the 1.5 km audit.
//  DROP: blocks that point to drive-to features (not walkable) or the wrong
//        district — removed from blocks, blocks_authored, and block_geometries.
//  REPIN_MID: "X between Y and Z" blocks the geocoder misplaced — re-pin to the
//        midpoint of their named neighbour blocks (already resolved nearby).
//  REPIN_GEO: bare/"through-downtown" blocks — re-geocode with a very tight bias
//        so they snap to the downtown one. Gate <= 1.2 km.
//
//   node scripts/.cleanup-blocks.mjs            # dry run
//   node scripts/.cleanup-blocks.mjs --commit

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
process.env.OVERPASS_URL ||= "http://localhost:12345/api/interpreter";
import { haversine, overpass } from "../lib/measure.js";
import { connect } from "../lib/measurers/_db.js";
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  .split(" ").map((t) => ({ st: "street", ave: "avenue", rd: "road", dr: "drive", blvd: "boulevard", n: "north", s: "south", e: "east", w: "west" }[t] || t)).join(" ");
function googleKey() {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  if (process.env.GKEY) return process.env.GKEY;
  return execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "google-places-api-key", "-w"], { encoding: "utf8" }).trim();
}
const GKEY = googleKey();
const commit = process.argv.includes("--commit");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DROP = {
  "litchfield-ct": ["Bantam Lake edge at Sandy Beach"],
  "northampton-ma": ["Mill River Greenway at Maines Field"],
  "hawley-pa": ["Lake Wallenpaupack Visitor Center at PA-507"],
  "honolulu-manoa-hi": ["Manoa Falls trail approach", "Lyon Arboretum trailhead", "Paradise Park Rd at valley head"],
  "cold-spring-ny": ["Constitution Marsh Audubon Center trailhead"],
  "saranac-lake-ny": ["Mt. Pisgah ski hill base"],
  "davis-wv": ["Blackwater Falls State Park overlook", "Canaan Valley Resort base"],
  "bellingham-wa": ["Bay St / Holly St downtown"],
};
const REPIN_MID = {
  "old-forge-ny": [{ block: "Main St between Park Ave and Crosby Blvd", between: ["Park Ave between Main St and the boat launch", "Crosby Blvd between Main St and Joy Tract Rd"] }],
  "berea-ky": [{ block: "Chestnut St between Main St and Center St", between: ["Main St between Prospect St and Estill St", "Center St between Chestnut St and Pine St"] }],
};
const REPIN_GEO = {
  "dunedin-fl": ["Pinellas Trail through downtown"],
  "lewisburg-wv": ["North Jefferson St"],
  "northampton-ma": ["Main St"],
};

// Nearest OSM intersection to the city pin that involves `streetName` (the lead
// street of the block). Deterministic, local — no Google. Falls back to the
// nearest any-intersection if the named street isn't found near the pin.
async function nearestStreetIntersection(streetName, lat, lon) {
  const d = await overpass(`[out:json][timeout:30];
    way["highway"~"^(residential|living_street|unclassified|tertiary|secondary|primary|pedestrian|footway|cycleway)$"]["name"](around:1200,${lat},${lon});
    out geom;`);
  const node = new Map();
  for (const w of d?.elements || []) {
    if (!w.tags?.name || !Array.isArray(w.geometry)) continue;
    for (const n of w.geometry) {
      const k = `${n.lat.toFixed(5)},${n.lon.toFixed(5)}`;
      const e = node.get(k) || { lat: n.lat, lon: n.lon, names: new Set() }; e.names.add(w.tags.name); node.set(k, e);
    }
  }
  const sN = norm(streetName);
  let onStreet = null, any = null;
  for (const e of node.values()) {
    if (e.names.size < 2) continue;
    const dist = haversine(lat, lon, e.lat, e.lon);
    if (!any || dist < any.dist) any = { ...e, dist };
    if ([...e.names].some((nm) => norm(nm) === sN) && (!onStreet || dist < onStreet.dist)) onStreet = { ...e, dist };
  }
  const best = onStreet || any;
  return best ? { lat: best.lat, lon: best.lon, name: [...best.names].slice(0, 2).join(" & "), dist: best.dist } : null;
}
// Lead street of a block: strip "between/through/near/at/along …".
const leadStreet = (block) => block.replace(/\s+(?:between|through|near|along|at|around)\b.*$/i, "").trim();

const client = await connect();
const { rows } = await client.query(`select slug, name, lat, lon, blocks, blocks_authored, block_geometries from cities where coalesce(jsonb_array_length(blocks),0) > 0 and lat is not null`);
let dropped = 0, repinned = 0;
for (const city of rows) {
  let blocks = (city.blocks || []).slice();
  let authored = (city.blocks_authored || []).slice();
  let geoms = (Array.isArray(city.block_geometries) ? city.block_geometries : []).slice();
  while (geoms.length < blocks.length) geoms.push({ name: blocks[geoms.length], lat: null, lon: null, accuracy: "unresolved" });
  let changed = false;
  const findGeom = (name) => { const i = blocks.indexOf(name); return i >= 0 ? geoms[i] : null; };

  // REPIN first (uses current indices), then DROP
  for (const r of REPIN_MID[city.slug] || []) {
    const i = blocks.indexOf(r.block); if (i < 0) continue;
    const a = findGeom(r.between[0]), b = findGeom(r.between[1]);
    if (a?.lat != null && b?.lat != null) {
      geoms[i] = { name: r.block, lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2, accuracy: "manual", source: "neighbor-midpoint", asOf: "2026-06-09" };
      repinned++; changed = true;
      console.log(`  REPIN-MID ${city.slug}: "${r.block}" → ${(haversine(city.lat, city.lon, geoms[i].lat, geoms[i].lon) / 1000).toFixed(2)}km`);
    }
  }
  for (const blk of REPIN_GEO[city.slug] || []) {
    const i = blocks.indexOf(blk); if (i < 0) continue;
    const x = await nearestStreetIntersection(leadStreet(blk), city.lat, city.lon); await sleep(100);
    if (x && x.dist / 1000 <= 1.2) {
      geoms[i] = { name: blk, lat: x.lat, lon: x.lon, accuracy: "manual", source: "intersection-snap", meta: { intersection: x.name }, asOf: "2026-06-09" };
      repinned++; changed = true;
      console.log(`  REPIN-GEO ${city.slug}: "${blk}" → ${(x.dist / 1000).toFixed(2)}km (${x.name})`);
    } else {
      console.log(`  REPIN-GEO ${city.slug}: "${blk}" → no close intersection (${x ? (x.dist / 1000).toFixed(1) + "km" : "none"})`);
    }
  }
  for (const blk of DROP[city.slug] || []) {
    const i = blocks.indexOf(blk); if (i < 0) continue;
    blocks.splice(i, 1); geoms.splice(i, 1);
    authored = authored.filter((b) => b !== blk);
    dropped++; changed = true;
    console.log(`  DROP ${city.slug}: "${blk}"`);
  }
  if (changed && commit) {
    await client.query(`update cities set blocks=$1::jsonb, blocks_authored=$2::jsonb, block_geometries=$3::jsonb where slug=$4`,
      [JSON.stringify(blocks), JSON.stringify(authored), JSON.stringify(geoms), city.slug]);
  }
}
console.log(`\n${commit ? "COMMITTED" : "DRY RUN"} — dropped ${dropped} blocks · re-pinned ${repinned}`);
await client.end();
