// scripts/.gen-block-candidates.mjs — propose "Six blocks" candidates for a
// city from OpenStreetMap, grounded in real social-POI density. NEVER saves:
// prints proposals for human review. After approval the chosen strings go into
// cities.blocks and `onboard.mjs --measurer blocks` resolves their map coords.
//
// MODEL: a block is a SPOT (an intersection / a named place), not a whole
// street. Found with a principled two-layer algorithm, not hand-tuned knobs:
//
//   1. Gather social POIs (cafe/restaurant/bar/bakery/market/…) within ~1 km
//      of the pin. NO polygon clip — the saved stay_zone_boundary is often
//      mis-sized (too tight amputates the core: Saratoga clipped 69 of 95;
//      too big scatters density: Kingston). We work from the density itself.
//   2. DBSCAN (eps ~75 m, minPts 4) finds the genuine dense region(s) and
//      labels everything sparser as noise → dropped. This is the cut-losses
//      rule: a town with no real cluster honestly yields nothing.
//   3. Within each region, sample spaced spots: densest point → snap to local
//      centroid → drop within SPOT_SEP (~140 m) → repeat until below SPOT_FLOOR.
//      Small spacing keeps adjacent streets distinct (Broadway vs Caroline);
//      a per-street cap (3) stops one spine being sampled six times. A wide
//      downtown blob thus becomes several spots, a long strip a few corners.
//   4. Name each spot from the majority addr:street of its POIs (works on
//      pedestrian malls) crossed with the nearest intersecting street, or the
//      named feature there. Rank by density, cap at six. The count is whatever
//      the data supports (Kingston 1, Lewisburg WV 0, a rich core 6).
//
// Usage:
//   node scripts/.gen-block-candidates.mjs --slug pittsburgh-south-side-pa
//   node scripts/.gen-block-candidates.mjs --all --json > /tmp/block-proposals.json

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

import { execFileSync } from "node:child_process";
import { overpass, haversine } from "../lib/measure.js";
import { connect } from "../lib/measurers/_db.js";

// Google Places API key — env override, else macOS Keychain (account
// livability-scout, like the DB password). The pipeline runs locally only.
function googleKey() {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  if (process.env.GKEY) return process.env.GKEY;
  return execFileSync("security",
    ["find-generic-password", "-a", "livability-scout", "-s", "google-places-api-key", "-w"],
    { encoding: "utf8" }).trim();
}
const GKEY = googleKey();

const TARGET = 6;          // cap on blocks shown per city; the real count is
                           //   whatever DBSCAN finds (often fewer). Dynamic header.
const RADIUS_M = 1000;     // POI / road gather radius around the pin
// DBSCAN — density-based clustering. Two physically-meaningful params instead of
// a pile of hand-tuned knobs:
const EPS_M = 85;          // two social POIs within this are "connected"; chains
                           //   of connections form a cluster (a walkable strip)
const MIN_PTS = 3;         // a cluster needs this many POIs; sparser is noise.
                           //   3 (not 4) so a tiny real downtown still clusters —
                           //   Lewisburg WV's Washington St shouldn't read as empty
// Within a dense region, blocks are spaced spots, not the whole blob:
const DENS_R = 80;         // radius that defines one spot's local density
const SPOT_SEP = 140;      // distinct spots sit at least this far apart — small
                           //   enough to tell adjacent streets apart (Saratoga's
                           //   Broadway vs Caroline), with the per-street cap
                           //   (below) doing the don't-resample-one-spine job
const SPOT_FLOOR = 3;      // a spot still needs this many POIs within DENS_R
const MAX_PER_STREET = 3;  // one street contributes at most this many stretches —
                           //   so Carson gives a few distinct corners, not six
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── street-name normalization ─────────────────────────────────────────────────
// Google ("E Carson St", "Washington St W") and OSM ("East Carson Street") spell
// the same street differently, which broke cross-street matching. norm() expands
// every token to a canonical full form so the two compare equal; tidyStreet()
// renders a clean display ("East Carson St", direction as a prefix) matching the
// hand-authored block style.
const EXPAND = {
  st: "street", ave: "avenue", av: "avenue", blvd: "boulevard", rd: "road",
  dr: "drive", ln: "lane", sq: "square", ct: "court", pl: "place", pkwy: "parkway",
  hwy: "highway", ter: "terrace", trl: "trail", cir: "circle", mt: "mount",
  n: "north", s: "south", e: "east", w: "west",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  .split(" ").filter(Boolean).map((t) => EXPAND[t] || t).join(" ");

const TYPE_ABBR = {
  street: "St", avenue: "Ave", boulevard: "Blvd", road: "Rd", drive: "Dr",
  lane: "Ln", square: "Sq", court: "Ct", place: "Pl", parkway: "Pkwy",
  highway: "Hwy", terrace: "Ter", trail: "Trl", circle: "Cir",
};
const DIR_FULL = { north: "North", south: "South", east: "East", west: "West",
  northeast: "Northeast", northwest: "Northwest", southeast: "Southeast", southwest: "Southwest" };
// Clean display name: pull a leading/trailing direction to the front as a full
// word, abbreviate the street type. "Washington St W" → "West Washington St".
function tidyStreet(name) {
  let toks = norm(name).split(" ").filter(Boolean);
  if (!toks.length) return String(name || "");
  let dir = null;
  if (DIR_FULL[toks[0]]) { dir = DIR_FULL[toks[0]]; toks = toks.slice(1); }
  else if (toks.length > 1 && DIR_FULL[toks[toks.length - 1]]) { dir = DIR_FULL[toks[toks.length - 1]]; toks = toks.slice(0, -1); }
  const core = toks.map((t, i) => {
    if (i === toks.length - 1 && TYPE_ABBR[t]) return TYPE_ABBR[t];
    return t.charAt(0).toUpperCase() + t.slice(1);
  }).join(" ");
  return dir ? `${dir} ${core}` : core;
}

async function loadCity(client, slug) {
  const { rows } = await client.query(
    `select slug, name, lat, lon, blocks, block_geometries
       from cities where slug = $1`, [slug]);
  return rows[0] || null;
}
async function allSlugs(client) {
  const { rows } = await client.query(
    `select slug, coalesce(jsonb_array_length(blocks), 0) as n
       from cities order by name`);
  return rows;
}

// ── POI gather: Google Places (New), tiled ────────────────────────────────────
// OSM POI coverage is too thin for this — it had ZERO of The Wine Cave, Tú y Yo,
// Barrel Junction (all real, hundreds of Google reviews), and showed Lewisburg
// WV / Verona as near-empty when Google finds 20+. So the *social-POI signal*
// comes from Google; OSM stays only for street geometry + parks (well-mapped).
//
// "Social POI" = what creates street life: food & drink, stroll retail, arts &
// culture. Car/big-box types are simply omitted from includedTypes so suburbs
// don't false-inflate. Nearby Search (New) caps at 20 results/call, so we tile a
// grid of small-radius searches over the gather area and dedupe by place id.
const GOOGLE_TYPES = [
  "restaurant", "cafe", "coffee_shop", "bakery", "bar", "pub", "wine_bar",
  "ice_cream_shop", "meal_takeaway", "art_gallery", "book_store", "clothing_store",
  "gift_shop", "jewelry_store", "shoe_store", "florist", "liquor_store", "market",
  "museum", "tourist_attraction", "performing_arts_theater", "movie_theater",
];
const TILE_R = 350;   // radius of each Nearby search
const TILE_STEP = 450; // grid spacing (< 2·TILE_R so circles overlap, no holes)

async function googleNearby(lat, lon, radius) {
  const body = JSON.stringify({
    includedTypes: GOOGLE_TYPES,
    maxResultCount: 20,
    locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius } },
  });
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GKEY,
          "X-Goog-FieldMask": "places.id,places.location,places.displayName,places.addressComponents",
        },
        body,
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.places || [];
    } catch (e) { lastErr = e; await sleep(800 * (attempt + 1)); }
  }
  throw new Error(`Google Places (after retries): ${lastErr?.message || lastErr}`);
}

async function socialPois(lat, lon) {
  const mPerLat = 111320, mPerLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const seen = new Map();
  for (let dy = -RADIUS_M; dy <= RADIUS_M; dy += TILE_STEP) {
    for (let dx = -RADIUS_M; dx <= RADIUS_M; dx += TILE_STEP) {
      if (Math.hypot(dx, dy) > RADIUS_M + TILE_R) continue; // skip corners outside the disk
      const tlat = lat + dy / mPerLat, tlon = lon + dx / mPerLon;
      const places = await googleNearby(tlat, tlon, TILE_R);
      for (const p of places) {
        if (!p.id || !p.location) continue;
        if (haversine(lat, lon, p.location.latitude, p.location.longitude) > RADIUS_M) continue;
        const route = (p.addressComponents || []).find((a) => (a.types || []).includes("route"));
        if (!seen.has(p.id)) seen.set(p.id, {
          lat: p.location.latitude, lon: p.location.longitude,
          name: p.displayName?.text || null,
          street: route ? (route.shortText || route.longText) : null,
        });
      }
      await sleep(40);
    }
  }
  return [...seen.values()];
}

async function namedRoads(lat, lon) {
  const q = `[out:json][timeout:60];
    way["highway"~"^(residential|living_street|unclassified|tertiary|secondary|primary|pedestrian)$"]["name"](around:${RADIUS_M},${lat},${lon});
    out geom;`;
  const d = await overpass(q);
  return (d?.elements || [])
    .filter((w) => w.tags?.name && Array.isArray(w.geometry))
    .map((w) => ({ name: w.tags.name, geom: w.geometry }));
}

async function namedFeatures(lat, lon) {
  const q = `[out:json][timeout:60];
    (way["leisure"="park"]["name"](around:${RADIUS_M},${lat},${lon});
     relation["leisure"="park"]["name"](around:${RADIUS_M},${lat},${lon});
     nwr["place"="square"]["name"](around:${RADIUS_M},${lat},${lon});
     nwr["leisure"="common"]["name"](around:${RADIUS_M},${lat},${lon});
     way["man_made"="pier"]["name"](around:${RADIUS_M},${lat},${lon});
     way["leisure"="marina"]["name"](around:${RADIUS_M},${lat},${lon});
     nwr["amenity"="marketplace"]["name"](around:${RADIUS_M},${lat},${lon});
     way["highway"="pedestrian"]["area"="yes"]["name"](around:${RADIUS_M},${lat},${lon}););
    out center tags;`;
  const d = await overpass(q);
  return (d?.elements || []).map((el) => {
    const p = el.center || (el.lat != null ? { lat: el.lat, lon: el.lon } : null);
    if (!p || !el.tags?.name) return null;
    const kind = el.tags.place === "square" ? "square"
      : el.tags.man_made === "pier" ? "pier"
      : el.tags.leisure === "marina" ? "marina"
      : el.tags.amenity === "marketplace" ? "market"
      : el.tags.highway === "pedestrian" ? "plaza"
      : "park";
    return { lat: p.lat, lon: p.lon, name: el.tags.name, kind };
  }).filter(Boolean);
}

// ── DBSCAN ────────────────────────────────────────────────────────────────────
// Standard density-based clustering. Points within EPS_M are neighbors; a point
// with ≥ MIN_PTS neighbors is a "core point" that seeds/grows a cluster; points
// reachable from a core join it; everything else is noise (dropped). Returns an
// array of clusters, each an array of points. No preset cluster count.
function dbscan(pts) {
  const n = pts.length;
  const label = new Array(n).fill(0); // 0 = unvisited, -1 = noise, >0 = cluster id
  const neighbors = (i) => {
    const out = [];
    for (let j = 0; j < n; j++) if (i !== j && haversine(pts[i].lat, pts[i].lon, pts[j].lat, pts[j].lon) <= EPS_M) out.push(j);
    return out;
  };
  let cid = 0;
  for (let i = 0; i < n; i++) {
    if (label[i] !== 0) continue;
    const nb = neighbors(i);
    if (nb.length + 1 < MIN_PTS) { label[i] = -1; continue; } // not a core point → noise (may be claimed later)
    cid++;
    label[i] = cid;
    const queue = [...nb];
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q];
      if (label[j] === -1) label[j] = cid;      // noise becomes a border point
      if (label[j] !== 0) continue;
      label[j] = cid;
      const nb2 = neighbors(j);
      if (nb2.length + 1 >= MIN_PTS) for (const k of nb2) if (label[k] <= 0) queue.push(k);
    }
  }
  const clusters = [];
  for (let c = 1; c <= cid; c++) {
    const members = [];
    for (let i = 0; i < n; i++) if (label[i] === c) members.push(pts[i]);
    if (members.length) clusters.push(members);
  }
  return clusters;
}

const countWithin = (c, pts, r) => pts.reduce((n, p) => n + (haversine(c.lat, c.lon, p.lat, p.lon) <= r ? 1 : 0), 0);

// Within one dense region, place spaced spots: take the densest point, snap to
// its local centroid, record it, drop everything within SPOT_SEP, repeat until
// the densest remaining point falls below SPOT_FLOOR. Returns spot groups (the
// POIs within DENS_R of each chosen center). This turns a long strip into a few
// distinct corners and a wide downtown blob into several spots — instead of one
// mega-cluster — without any street/drift heuristics.
function spotsInRegion(region) {
  let pool = region.slice();
  const spots = [];
  while (pool.length) {
    let best = null;
    for (const p of pool) {
      const n = countWithin(p, pool, DENS_R);
      if (!best || n > best.n) best = { ...p, n };
    }
    if (!best || best.n < SPOT_FLOOR) break;
    // snap to local centroid
    let c = { lat: best.lat, lon: best.lon };
    for (let it = 0; it < 5; it++) {
      const near = pool.filter((p) => haversine(c.lat, c.lon, p.lat, p.lon) <= DENS_R);
      const nl = near.reduce((s, p) => s + p.lat, 0) / near.length;
      const no = near.reduce((s, p) => s + p.lon, 0) / near.length;
      if (haversine(c.lat, c.lon, nl, no) < 8) { c = { lat: nl, lon: no }; break; }
      c = { lat: nl, lon: no };
    }
    const members = region.filter((p) => haversine(c.lat, c.lon, p.lat, p.lon) <= DENS_R);
    spots.push({ ...c, members, density: members.length });
    pool = pool.filter((p) => haversine(c.lat, c.lon, p.lat, p.lon) > SPOT_SEP);
  }
  return spots;
}

// Two layers: DBSCAN finds the genuine dense region(s) and drops noise (the
// principled cut-losses), then spaced spots are sampled inside each region.
// Every spot is named, deduped against originals, ranked by density, capped.
function pickBlocks(pois, _occupied, ctx, existingNorms) {
  const regions = dbscan(pois);
  const spots = regions.flatMap(spotsInRegion);

  // name every spot, then add densest-first respecting the per-street cap
  const named = spots.map((s) => ({ s, n: nameSpot(s, s.members, ctx.feats, ctx.roadIndex, ctx.roads) }))
    .filter((x) => x.n)
    .sort((a, b) => b.s.density - a.s.density);

  const seen = new Set(existingNorms);
  const streetCount = new Map();
  const out = [];
  for (const { s, n } of named) {
    if (out.length >= TARGET) break;
    const k = norm(n.block);
    if (!k || seen.has(k)) continue;
    if (n.street && (streetCount.get(n.street) || 0) >= MAX_PER_STREET) continue;
    // overlap guard: skip "A & B" if a hand-authored block already names both
    if (n.block.includes(" & ")) {
      const [a, b] = n.block.split(" & ").map(norm);
      if (existingNorms.some((e) => e.includes(a) && e.includes(b))) continue;
    }
    seen.add(k);
    if (n.street) streetCount.set(n.street, (streetCount.get(n.street) || 0) + 1);
    const why = n.why ? `${n.why}, ${s.density} social POIs within ${DENS_R} m`
                      : `${s.density} social POIs within ${DENS_R} m`;
    out.push({ block: n.block, why, density: s.density });
  }
  return out;
}

// ── naming ────────────────────────────────────────────────────────────────────
// Coordinate-hash the road geometry: any node shared by ≥2 distinct roads is an
// intersection. Also tally how many social POIs sit nearest each road so we can
// call the busier one the "primary" street in "A & B".
function buildRoadIndex(roads, pois) {
  const node = new Map(); // coordKey -> { lat, lon, names:Set }
  const key = (la, lo) => `${la.toFixed(5)},${lo.toFixed(5)}`;
  for (const r of roads) {
    for (const n of r.geom) {
      const k = key(n.lat, n.lon);
      const e = node.get(k) || { lat: n.lat, lon: n.lon, names: new Set() };
      e.names.add(r.name); node.set(k, e);
    }
  }
  const intersections = [];
  for (const e of node.values()) if (e.names.size >= 2) intersections.push({ lat: e.lat, lon: e.lon, names: [...e.names] });

  const roadPoi = new Map();
  for (const p of pois) {
    let best = { d: Infinity, name: null };
    for (const r of roads) for (const n of r.geom) {
      const d = haversine(p.lat, p.lon, n.lat, n.lon);
      if (d < best.d) best = { d, name: r.name };
    }
    if (best.name && best.d <= 45) roadPoi.set(best.name, (roadPoi.get(best.name) || 0) + 1);
  }
  return { intersections, roadPoi };
}

// Nearest road name to a point (within maxM).
function nearestRoadName(c, roads, maxM = 50) {
  let best = { d: Infinity, name: null };
  for (const r of roads) for (const n of r.geom) {
    const d = haversine(c.lat, c.lon, n.lat, n.lon);
    if (d < best.d) best = { d, name: r.name };
  }
  return best.d <= maxM ? best.name : null;
}

// Majority addr:street among a spot's member POIs — the most reliable signal of
// which street a spot belongs to (works even on pedestrian malls where the road
// geometry has no detectable intersections).
function majorityStreet(members) {
  const tally = new Map();
  for (const m of members) if (m.street) tally.set(m.street, (tally.get(m.street) || 0) + 1);
  let best = null;
  for (const [name, n] of tally) if (!best || n > best.n) best = { name, n };
  return best?.name || null;
}

// Name a spot. Priority: a named feature right at it → the street it sits on
// (from member POIs) crossed with the nearest intersecting street → the bare
// street. Returns { block, why, street } where `street` drives the per-street cap.
function nameSpot(c, members, feats, roadIndex, roads) {
  let bf = { d: Infinity, f: null };
  for (const f of feats) {
    const d = haversine(c.lat, c.lon, f.lat, f.lon);
    if (d < bf.d) bf = { d, f };
  }
  if (bf.f && bf.d <= 80) return { block: bf.f.name, why: `${bf.f.kind} at this spot`, street: null };

  const street = majorityStreet(members) || nearestRoadName(c, roads, 60);
  if (!street) return null;
  const sN = norm(street);

  // nearest intersection that involves this street, to name the cross-street
  let bi = { d: Infinity, cross: null };
  for (const x of roadIndex.intersections) {
    if (!x.names.some((nm) => norm(nm) === sN)) continue;
    const d = haversine(c.lat, c.lon, x.lat, x.lon);
    if (d < bi.d) bi = { d, cross: x.names.find((nm) => norm(nm) !== sN) };
  }
  if (bi.cross && bi.d <= 160) return { block: `${tidyStreet(street)} & ${tidyStreet(bi.cross)}`, why: null, street: sN };
  return { block: tidyStreet(street), why: null, street: sN };
}

async function generate(city, originalBlocks) {
  const { lat, lon } = city;
  const pois = await socialPois(lat, lon);
  await sleep(250);
  const roads = await namedRoads(lat, lon);
  await sleep(250);
  const feats = await namedFeatures(lat, lon);

  // Ignore DB block_geometries as "occupied": the DB currently holds an
  // over-eager earlier save (its restore was blocked), so it's unreliable.
  // We avoid duplicating real originals by name instead (existingNorms +
  // the "A & B" overlap guard in pickBlocks).
  const roadIndex = buildRoadIndex(roads, pois);
  const existingNorms = (originalBlocks || []).map(norm);

  const candidates = pickBlocks(pois, [], { feats, roadIndex, roads }, existingNorms);
  const need = Math.max(0, TARGET - (originalBlocks || []).length);
  return { need, poiCount: pois.length, candidates };
}

// ── main ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const slugArg = argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : null;
const wantAll = argv.includes("--all");
const asJson = argv.includes("--json");

// True pre-session blocks, captured before the old-style save was applied, so
// generation ignores whatever auto-blocks currently sit in the DB.
const ORIGINALS = existsSync("/tmp/original-blocks.json")
  ? JSON.parse(readFileSync("/tmp/original-blocks.json", "utf8")) : {};

const client = await connect();
let targets = [];
if (slugArg) targets = slugArg.split(",").map((s) => s.trim());
else if (wantAll) {
  // base the "needs blocks" filter on ORIGINAL counts, not current DB state
  const rows = await allSlugs(client);
  targets = rows.filter((r) => (ORIGINALS[r.slug]?.length ?? r.n) < TARGET).map((r) => r.slug);
} else { console.error("pass --slug <slug[,slug]> or --all"); await client.end(); process.exit(2); }

const out = {};
for (const slug of targets) {
  const city = await loadCity(client, slug);
  if (!city) { console.error(`! no city ${slug}`); continue; }
  const original = ORIGINALS[slug] ?? city.blocks ?? [];
  try {
    const res = await generate(city, original);
    out[slug] = { name: city.name, existing: original, ...res };
    if (!asJson) {
      console.log(`\n## ${city.name} (${slug}) — have ${original.length}, need ${res.need}  [${res.poiCount} POIs]`);
      original.forEach((b, i) => console.log(`   ${i + 1}. ${b}  (existing)`));
      res.candidates.forEach((c) => console.log(`   +  ${c.block}   — ${c.why}`));
    }
  } catch (e) {
    console.error(`! ${slug}: ${e.message}`);
    out[slug] = { name: city.name, error: e.message };
  }
}
if (asJson) console.log(JSON.stringify(out, null, 2));
await client.end();
