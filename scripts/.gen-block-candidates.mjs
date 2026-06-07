// scripts/.gen-block-candidates.mjs — propose "Six blocks" candidates for a
// city from OpenStreetMap, grounded in real social-POI density inside the stay
// zone. NEVER saves: prints proposals for human review. After approval, the
// chosen strings go into cities.blocks and `onboard.mjs --measurer blocks`
// resolves their map coordinates.
//
// Method (mirrors lib/measure.js#findVisitCenter philosophy — "best 700 m
// within the stay zone"):
//   1. Pull social POIs (cafe/restaurant/bar/bakery/market/…) within the stay
//      zone (boundary-gated when a polygon exists, else a radius around the pin).
//   2. Pull named social *features* (parks, squares, plazas, piers, markets,
//      waterfront promenades) — these make the strongest standalone blocks.
//   3. Rank streets by how many social POIs carry that `addr:street`. For each
//      top street, bound the commercial stretch with the two cross-streets that
//      flank the POI extent → "Main St between A and B".
//   4. Dedupe against the city's existing blocks; emit what's needed.
//
// Usage:
//   node scripts/.gen-block-candidates.mjs --slug essex-ct
//   node scripts/.gen-block-candidates.mjs --slug essex-ct --json
//   node scripts/.gen-block-candidates.mjs --all --json > /tmp/proposals.json

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
process.env.OVERPASS_URL ||= "http://localhost:12345/api/interpreter";

import { overpass, haversine, pointInGeoJSON } from "../lib/measure.js";
import { connect } from "../lib/measurers/_db.js";

const TARGET = 6;                 // blocks we want each city to carry
const RADIUS_M = 900;             // search radius when no boundary polygon
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── street-type abbreviation, matching blocks.js authoring style ──────────────
const ABBR = [
  [/\bStreet\b/g, "St"], [/\bAvenue\b/g, "Ave"], [/\bBoulevard\b/g, "Blvd"],
  [/\bRoad\b/g, "Rd"], [/\bDrive\b/g, "Dr"], [/\bLane\b/g, "Ln"],
  [/\bSquare\b/g, "Sq"], [/\bCourt\b/g, "Ct"], [/\bPlace\b/g, "Pl"],
  [/\bParkway\b/g, "Pkwy"], [/\bHighway\b/g, "Hwy"], [/\bTerrace\b/g, "Ter"],
];
const abbr = (s) => ABBR.reduce((acc, [re, r]) => acc.replace(re, r), s || "");
const norm = (s) => abbr(String(s || "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function loadCity(client, slug) {
  const { rows } = await client.query(
    `select slug, name, lat, lon, stay_zone_boundary, blocks
       from cities where slug = $1`, [slug]);
  return rows[0] || null;
}
async function allSlugs(client) {
  const { rows } = await client.query(
    `select slug, coalesce(jsonb_array_length(blocks), 0) as n
       from cities order by name`);
  return rows;
}

// All social POIs in range, with their addr:street and a point.
async function socialPois(lat, lon) {
  const q = `[out:json][timeout:60];
    (nwr["amenity"~"^(cafe|restaurant|bar|pub|biergarten|ice_cream|marketplace|food_court)$"](around:${RADIUS_M},${lat},${lon});
     nwr["shop"~"^(coffee|bakery|deli|tea|pastry|greengrocer|books|wine|cheese|chocolate|farm|butcher)$"](around:${RADIUS_M},${lat},${lon}););
    out center tags;`;
  const d = await overpass(q);
  return (d?.elements || []).map((el) => {
    const p = el.center || (el.lat != null ? { lat: el.lat, lon: el.lon } : null);
    if (!p) return null;
    return { lat: p.lat, lon: p.lon, street: el.tags?.["addr:street"] || null, name: el.tags?.name || null };
  }).filter(Boolean);
}

// All named roads in range, with geometry — used to attach a street to social
// POIs that lack an addr:street tag (OSM coverage is patchy). One query per
// city beats one per POI.
async function namedRoads(lat, lon) {
  const q = `[out:json][timeout:60];
    way["highway"~"^(residential|living_street|unclassified|tertiary|secondary|primary|pedestrian)$"]["name"](around:${RADIUS_M},${lat},${lon});
    out geom;`;
  const d = await overpass(q);
  return (d?.elements || [])
    .filter((w) => w.tags?.name && Array.isArray(w.geometry))
    .map((w) => ({ name: w.tags.name, geom: w.geometry }));
}

// Nearest named road to a point, if within `maxM` of any of its vertices.
function nearestRoad(p, roads, maxM = 45) {
  let best = { d: Infinity, name: null };
  for (const r of roads) {
    for (const n of r.geom) {
      const d = haversine(p.lat, p.lon, n.lat, n.lon);
      if (d < best.d) best = { d, name: r.name };
    }
  }
  return best.d <= maxM ? best.name : null;
}

// Named social features that read well as standalone blocks.
async function namedFeatures(lat, lon) {
  const q = `[out:json][timeout:60];
    (way["leisure"="park"]["name"](around:${RADIUS_M},${lat},${lon});
     relation["leisure"="park"]["name"](around:${RADIUS_M},${lat},${lon});
     nwr["place"="square"]["name"](around:${RADIUS_M},${lat},${lon});
     nwr["leisure"="common"]["name"](around:${RADIUS_M},${lat},${lon});
     way["man_made"="pier"]["name"](around:${RADIUS_M},${lat},${lon});
     way["leisure"="marina"]["name"](around:${RADIUS_M},${lat},${lon});
     nwr["amenity"="marketplace"]["name"](around:${RADIUS_M},${lat},${lon});
     nwr["tourism"="attraction"]["name"]["historic"](around:${RADIUS_M},${lat},${lon});
     way["highway"="pedestrian"]["area"="yes"]["name"](around:${RADIUS_M},${lat},${lon});
     way["leisure"="garden"]["name"]["garden:type"!="residential"](around:${RADIUS_M},${lat},${lon}););
    out center tags;`;
  const d = await overpass(q);
  return (d?.elements || []).map((el) => {
    const p = el.center || (el.lat != null ? { lat: el.lat, lon: el.lon } : null);
    if (!p || !el.tags?.name) return null;
    const kind = el.tags.leisure === "park" || el.tags.leisure === "garden" || el.tags.leisure === "common" ? "park"
      : el.tags.place === "square" ? "square"
      : el.tags.man_made === "pier" ? "pier"
      : el.tags.leisure === "marina" ? "marina"
      : el.tags.amenity === "marketplace" ? "market"
      : el.tags.highway === "pedestrian" ? "plaza"
      : "landmark";
    return { lat: p.lat, lon: p.lon, name: el.tags.name, kind };
  }).filter(Boolean);
}

// For a named street, bound the social stretch with the two cross-streets that
// flank the POI extent along the street. Returns "Main St between A and B" or,
// if cross-streets can't be resolved, just the street name.
async function streetStretch(streetName, poisOnStreet, lat, lon) {
  const bbox = [lat - 0.012, lon - 0.012, lat + 0.012, lon + 0.012];
  const q = `[out:json][timeout:60];
    way["name"="${esc(streetName)}"]["highway"](${bbox.join(",")})->.main;
    .main out geom;
    node(w.main)->.mn;
    way(bn.mn)["highway"]["name"]->.cross;
    .cross out geom;`;
  let d;
  try { d = await overpass(q); } catch { return abbr(streetName); }
  const ways = d?.elements || [];
  const mainWays = ways.filter((w) => norm(w.tags?.name) === norm(streetName) && Array.isArray(w.geometry));
  if (!mainWays.length) return abbr(streetName);

  // Build an ordered centerline of the main street, then a 1-D coordinate
  // (cumulative metres) for projecting POIs and cross-streets onto it.
  const line = mainWays.flatMap((w) => w.geometry);
  if (line.length < 2) return abbr(streetName);
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum[i] = cum[i - 1] + haversine(line[i - 1].lat, line[i - 1].lon, line[i].lat, line[i].lon);
  const project = (p) => {
    let best = { d: Infinity, s: 0 };
    for (let i = 0; i < line.length; i++) {
      const dd = haversine(p.lat, p.lon, line[i].lat, line[i].lon);
      if (dd < best.d) best = { d: dd, s: cum[i] };
    }
    return best.s;
  };

  const mainNodeKeys = new Set(line.map((n) => `${n.lat.toFixed(6)},${n.lon.toFixed(6)}`));
  const crosses = [];
  for (const w of ways) {
    if (!Array.isArray(w.geometry) || norm(w.tags?.name) === norm(streetName) || !w.tags?.name) continue;
    const shared = w.geometry.find((n) => mainNodeKeys.has(`${n.lat.toFixed(6)},${n.lon.toFixed(6)}`));
    if (!shared) continue;
    crosses.push({ name: w.tags.name, s: project(shared) });
  }
  if (crosses.length < 2) return abbr(streetName);

  const poiS = poisOnStreet.map(project).sort((a, b) => a - b);
  const lo = poiS[0], hi = poiS[poiS.length - 1];
  // nearest cross below lo, nearest cross above hi (fallback: extremes)
  const below = crosses.filter((c) => c.s <= lo + 30).sort((a, b) => b.s - a.s)[0] || crosses.slice().sort((a, b) => a.s - b.s)[0];
  const above = crosses.filter((c) => c.s >= hi - 30).sort((a, b) => a.s - b.s)[0] || crosses.slice().sort((a, b) => b.s - a.s)[0];
  if (!below || !above || norm(below.name) === norm(above.name)) return abbr(streetName);
  return `${abbr(streetName)} between ${abbr(below.name)} and ${abbr(above.name)}`;
}

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// Normalized base street name from a block string: the part before "between"/
// "from"/"at"/"along", with "Mall"/"Pedestrian" suffixes folded out so
// "Pearl St Mall" and "Pearl St" collapse to one. Empty for pure features.
function streetBase(text) {
  const head = String(text || "").split(/\s+(?:between|from|at|along|near|around)\s+/i)[0];
  const n = norm(head).replace(/\b(mall|pedestrian|promenade)\b/g, "").replace(/\s+/g, " ").trim();
  // Only treat as a street if it ends in a street type; otherwise it's a feature name.
  return /\b(st|ave|blvd|rd|dr|ln|pkwy|hwy|ter|pl|ct|sq|broadway)$/.test(n) ? n : "";
}

async function generate(city) {
  const { lat, lon } = city;
  const boundary = city.stay_zone_boundary || null;
  const inZone = (p) => (boundary ? pointInGeoJSON(p.lat, p.lon, boundary) : haversine(lat, lon, p.lat, p.lon) <= RADIUS_M);

  const pois = (await socialPois(lat, lon)).filter(inZone);
  await sleep(300);
  // Attach a street to POIs lacking an addr:street tag via nearest named road.
  if (pois.some((p) => !p.street)) {
    const roads = await namedRoads(lat, lon);
    await sleep(300);
    for (const p of pois) if (!p.street) p.street = nearestRoad(p, roads);
  }
  const feats = (await namedFeatures(lat, lon)).filter(inZone);

  const existing = new Set((city.blocks || []).map(norm));
  const candidates = [];
  const seen = new Set(existing);
  // Track the base street name (token before "between") so we don't propose
  // both "Pearl St between 5th and 17th" and "Pearl St Mall between …".
  const baseStreets = new Set();
  for (const b of city.blocks || []) baseStreets.add(streetBase(b));
  const add = (text, why) => {
    const k = norm(text);
    if (!k || seen.has(k)) return;
    const base = streetBase(text);
    if (base && baseStreets.has(base)) return;
    seen.add(k);
    if (base) baseStreets.add(base);
    candidates.push({ block: text, why });
  };

  // 1) Streets ranked by social-POI count.
  const byStreet = new Map();
  for (const p of pois) {
    if (!p.street) continue;
    const k = norm(p.street);
    const e = byStreet.get(k) || { name: p.street, pts: [] };
    e.pts.push(p); byStreet.set(k, e);
  }
  const streetsRanked = [...byStreet.values()].filter((s) => s.pts.length >= 2).sort((a, b) => b.pts.length - a.pts.length);

  // 2) Features ranked by surrounding social density — a square ringed by
  // cafés earns its place; a tennis court with nothing around it is dead
  // weight, so drop features with no social POIs within 150 m. Kind breaks
  // ties (a market/square/pier reads better than a generic park).
  const kindRank = { square: 0, market: 1, pier: 2, plaza: 3, marina: 4, park: 5, landmark: 6 };
  const featsRanked = feats
    .map((f) => ({ ...f, near: nearbyPoiCount(f, pois) }))
    .filter((f) => f.near >= 1)
    .sort((a, b) => b.near - a.near || (kindRank[a.kind] - kindRank[b.kind]));

  // Interleave: best street, best feature, next street, next feature… so the
  // proposed set has both a commercial spine and a public-realm anchor. A
  // feature needs ≥2 nearby social POIs to compete for a pick slot; weaker
  // ones (a quiet pocket park) drop to the back so they only surface as
  // alternates / small-town last resorts, never crowding out a live street.
  const need = Math.max(0, TARGET - (city.blocks || []).length);
  const primaryFeats = featsRanked.filter((f) => f.near >= 2);
  const weakFeats = featsRanked.filter((f) => f.near < 2);
  const queue = [];
  let si = 0, fi = 0;
  while (queue.length < need + 4 && (si < streetsRanked.length || fi < primaryFeats.length)) {
    if (si < streetsRanked.length) queue.push({ type: "street", v: streetsRanked[si++] });
    if (fi < primaryFeats.length) queue.push({ type: "feat", v: primaryFeats[fi++] });
  }
  // Leftovers as fallback, streets before weak features.
  while (si < streetsRanked.length) queue.push({ type: "street", v: streetsRanked[si++] });
  for (const f of weakFeats) queue.push({ type: "feat", v: f });

  for (const item of queue) {
    if (candidates.length >= need + 3) break;
    if (item.type === "feat") {
      add(item.v.name, `${item.v.kind}, ${item.v.near} social POIs within 150 m`);
    } else {
      const stretch = await streetStretch(item.v.name, item.v.pts, lat, lon);
      await sleep(250);
      add(stretch, `${item.v.pts.length} social POIs on this street`);
    }
  }

  return { need, poiCount: pois.length, featCount: feats.length, candidates };
}

function nearbyPoiCount(feat, pois) {
  return pois.filter((p) => haversine(feat.lat, feat.lon, p.lat, p.lon) <= 150).length;
}

// ── main ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const slugArg = argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : null;
const wantAll = argv.includes("--all");
const asJson = argv.includes("--json");

const client = await connect();
let targets = [];
if (slugArg) {
  targets = slugArg.split(",").map((s) => s.trim());
} else if (wantAll) {
  const rows = await allSlugs(client);
  targets = rows.filter((r) => r.n < TARGET).map((r) => r.slug);
} else {
  console.error("pass --slug <slug[,slug]> or --all");
  await client.end(); process.exit(2);
}

const out = {};
for (const slug of targets) {
  const city = await loadCity(client, slug);
  if (!city) { console.error(`! no city ${slug}`); continue; }
  try {
    const res = await generate(city);
    out[slug] = { name: city.name, existing: city.blocks || [], ...res };
    if (!asJson) {
      console.log(`\n## ${city.name} (${slug}) — have ${(city.blocks||[]).length}, need ${res.need} more  [${res.poiCount} POIs, ${res.featCount} features]`);
      (city.blocks || []).forEach((b, i) => console.log(`   ${i + 1}. ${b}  (existing)`));
      res.candidates.forEach((c, i) => console.log(`   +  ${c.block}   — ${c.why}`));
    }
  } catch (e) {
    console.error(`! ${slug}: ${e.message}`);
    out[slug] = { name: city.name, error: e.message };
  }
}
if (asJson) console.log(JSON.stringify(out, null, 2));
await client.end();
