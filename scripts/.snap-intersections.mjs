// scripts/.snap-intersections.mjs — lock any still-unresolved block to the
// NEAREST real street intersection to its best-estimate location. Don't pin to a
// random business and don't leave a placeholder: estimate where the block is
// (Google text-search), then snap to the closest OSM intersection (two named
// roads sharing a node). Keeps the editorial block name; the pin is a real
// corner. Writes accuracy "manual" so the measurer preserves it across --force.
//
//   node scripts/.snap-intersections.mjs            # dry run
//   node scripts/.snap-intersections.mjs --commit

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
import { overpass, haversine } from "../lib/measure.js";
import { connect } from "../lib/measurers/_db.js";

function googleKey() {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  if (process.env.GKEY) return process.env.GKEY;
  return execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "google-places-api-key", "-w"], { encoding: "utf8" }).trim();
}
const GKEY = googleKey();
const commit = process.argv.includes("--commit");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function estimate(block, cityName, lat, lon) {
  const q = block.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY, "X-Goog-FieldMask": "places.location,places.displayName" },
    body: JSON.stringify({ textQuery: `${q}, ${cityName}`, maxResultCount: 1, locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: 4000 } } }),
  });
  const j = await r.json();
  const p = (j.places || [])[0];
  return p?.location ? { lat: p.location.latitude, lon: p.location.longitude, name: p.displayName?.text } : null;
}

// Nearest OSM intersection (two named roads sharing a node) to a point.
async function nearestIntersection(lat, lon, r = 500) {
  const q = `[out:json][timeout:30];
    way["highway"~"^(residential|living_street|unclassified|tertiary|secondary|primary|pedestrian)$"]["name"](around:${r},${lat},${lon});
    out geom;`;
  const d = await overpass(q);
  const node = new Map();
  for (const w of d?.elements || []) {
    if (!w.tags?.name || !Array.isArray(w.geometry)) continue;
    for (const n of w.geometry) {
      const k = `${n.lat.toFixed(5)},${n.lon.toFixed(5)}`;
      const e = node.get(k) || { lat: n.lat, lon: n.lon, names: new Set() };
      e.names.add(w.tags.name); node.set(k, e);
    }
  }
  let best = null;
  for (const e of node.values()) {
    if (e.names.size < 2) continue;
    const dist = haversine(lat, lon, e.lat, e.lon);
    if (!best || dist < best.dist) best = { lat: e.lat, lon: e.lon, names: [...e.names], dist };
  }
  return best;
}

const isResolved = (g) => g && g.lat != null && g.accuracy !== "unresolved";

const client = await connect();
const { rows } = await client.query(
  `select slug, name, lat, lon, blocks, block_geometries from cities where coalesce(jsonb_array_length(blocks),0) > 0`);

let scanned = 0, snapped = 0, changed = 0;
for (const city of rows) {
  const blocks = city.blocks || [];
  const geoms = Array.isArray(city.block_geometries) ? city.block_geometries.slice() : [];
  while (geoms.length < blocks.length) geoms.push({ name: blocks[geoms.length], lat: null, lon: null, accuracy: "unresolved" });
  let cityChanged = false;
  for (let i = 0; i < blocks.length; i++) {
    if (isResolved(geoms[i])) continue;
    scanned++;
    const est = await estimate(blocks[i], city.name, city.lat, city.lon); await sleep(60);
    if (!est) { console.log(`  no estimate: ${city.slug} "${blocks[i]}"`); continue; }
    const x = await nearestIntersection(est.lat, est.lon); await sleep(200);
    const pin = x || est; // fall back to the estimate itself if no intersection nearby
    const km = (haversine(city.lat, city.lon, pin.lat, pin.lon) / 1000).toFixed(2);
    geoms[i] = { name: blocks[i], lat: pin.lat, lon: pin.lon, accuracy: "manual",
      source: x ? "intersection-snap" : "google-fallback",
      meta: { estimate: est.name, intersection: x ? x.names.slice(0, 2).join(" & ") : null, km: +km }, asOf: "2026-06-09" };
    snapped++; cityChanged = true;
    console.log(`  ${city.slug}: "${blocks[i]}"  est=${est.name}  →  ${x ? x.names.slice(0,2).join(" & ") : "(no intersection, used estimate)"}  [${km} km, ${pin.lat.toFixed(4)},${pin.lon.toFixed(4)}]`);
  }
  if (cityChanged) { changed++; if (commit) await client.query(`update cities set block_geometries=$1::jsonb where slug=$2`, [JSON.stringify(geoms), city.slug]); }
}
console.log(`\n${commit ? "COMMITTED" : "DRY RUN"} — scanned ${scanned} · snapped ${snapped} · ${changed} cities`);
await client.end();
