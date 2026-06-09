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

import { overpass, haversine } from "../lib/measure.js";
import { connect } from "../lib/measurers/_db.js";

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
const SPOT_SEP = 250;      // distinct spots sit at least this far apart. This is
                           //   the whole anti-clustering mechanism: no per-street
                           //   cap — a long spine (a mile of Main St) earns as
                           //   many spots as it has, they just can't be
                           //   contiguous. ~250 m ≈ a couple blocks between stops.
                           //   Compact downtowns honestly land below 6 (they
                           //   don't hold six non-contiguous spots) — that's fine.
const SPOT_FLOOR = 3;      // a spot still needs this many POIs within DENS_R
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
    `select slug, name, lat, lon, blocks, blocks_authored, block_geometries
       from cities where slug = $1`, [slug]);
  return rows[0] || null;
}
async function allSlugs(client) {
  // n = how many human-authored blocks the city has (the regeneration baseline),
  // NOT how many it currently renders — so a re-run tops up from the baseline.
  const { rows } = await client.query(
    `select slug, coalesce(jsonb_array_length(blocks_authored), 0) as n
       from cities order by name`);
  return rows;
}

// ── POI gather: local `pois` cache (populated from Google Places) ─────────────
// The social-POI signal lives in the local `pois` table — fetched from Google
// Places once per city by scripts/.fetch-pois.mjs, queried offline here. OSM was
// too thin (zero of The Wine Cave / Tú y Yo / Barrel Junction; Lewisburg read as
// near-empty), so OSM is kept only for street geometry + parks. Permanently/
// temporarily closed places are excluded — we're caching, so a shuttered spot
// shouldn't seed a block.
async function socialPois(client, lat, lon) {
  const d = 0.013; // ~1.4 km bbox prefilter; haversine refine below
  const { rows } = await client.query(
    `select lat, lon, name, street, user_rating_count, business_status
       from pois
      where lat between $1 and $2 and lon between $3 and $4`,
    [lat - d, lat + d, lon - d, lon + d]);
  // Cache-miss guard: zero rows in the bbox means this city was never fetched
  // (not that it's genuinely empty — even sparse places have a few). Fail LOUD
  // instead of silently returning 0 blocks. CLAUDE.md: zero is not null.
  if (rows.length === 0) {
    throw new Error("no cached POIs in range — run `node scripts/.fetch-pois.mjs --slug <slug>` first");
  }
  return rows
    .filter((r) => !r.business_status || r.business_status === "OPERATIONAL")
    .filter((r) => haversine(lat, lon, r.lat, r.lon) <= RADIUS_M)
    .map((r) => ({ lat: r.lat, lon: r.lon, name: r.name, street: r.street, reviews: r.user_rating_count ?? 0 }));
}

// Retry an Overpass query until it returns a non-empty body. A populated area
// ALWAYS has named roads (CLAUDE.md Corollary 2: zero of those means the query
// lied) — under the rapid --all load the local container intermittently returns
// an empty 200, which silently degraded random cities to bare-street names. Treat
// empty as a transient failure and retry with backoff.
async function overpassNonEmpty(q, { minElements = 1, tries = 5 } = {}) {
  let last = [];
  for (let i = 0; i < tries; i++) {
    try {
      const d = await overpass(q);
      const els = d?.elements || [];
      if (els.length >= minElements) return els;
      last = els;
    } catch { /* retry */ }
    await sleep(600 * (i + 1));
  }
  return last; // give up after retries; caller still proceeds with what it has
}

async function namedRoads(lat, lon) {
  const q = `[out:json][timeout:60];
    way["highway"~"^(residential|living_street|unclassified|tertiary|secondary|primary|pedestrian)$"]["name"](around:${RADIUS_M},${lat},${lon});
    out geom;`;
  const els = await overpassNonEmpty(q); // a real city center always has named roads
  return els
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
  // 0 features is legitimate (not every core has a named park), so don't force
  // non-empty — but retry on an actual throw so a transient hiccup isn't a zero.
  let els = [];
  for (let i = 0; i < 3; i++) {
    try { els = (await overpass(q))?.elements || []; break; } catch { await sleep(600 * (i + 1)); }
  }
  return els.map((el) => {
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

  // name every spot, add densest-first. Spacing (SPOT_SEP, enforced in
  // spotsInRegion) already guarantees spots aren't contiguous, so there's no
  // per-street cap — a long spine earns as many well-spread stops as it has.
  const named = spots.map((s) => ({ s, n: nameSpot(s, s.members, ctx.feats, ctx.roadIndex, ctx.roads) }))
    .filter((x) => x.n)
    .sort((a, b) => b.s.density - a.s.density);

  const seen = new Set(existingNorms);
  const out = [];
  for (const { s, n } of named) {
    if (out.length >= TARGET) break;
    const k = norm(n.block);
    if (!k || seen.has(k)) continue;
    // overlap guard: skip "A & B" if a hand-authored block already names both
    if (n.block.includes(" & ")) {
      const [a, b] = n.block.split(" & ").map(norm);
      if (existingNorms.some((e) => e.includes(a) && e.includes(b))) continue;
    }
    seen.add(k);
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
// A real street name has a word OR an ordinal-number component. Strip directions
// + street-type words, then accept if anything left is a ≥3-letter word
// ("Walker St" → "walker" ✓) or an ordinal ("5th St" → "5th" ✓). Reject bad
// address fragments ("1 62a" → "1","62a" → neither → reject).
const TYPE_WORDS = new Set(["street", "avenue", "boulevard", "road", "drive",
  "lane", "square", "court", "place", "parkway", "highway", "terrace", "trail", "circle"]);
function isPlausibleStreet(name) {
  const core = norm(name).split(" ").filter((t) => t && !DIR_FULL[t] && !TYPE_WORDS.has(t));
  return core.some((t) => /[a-z]{3,}/.test(t) || /^\d+(st|nd|rd|th)$/.test(t));
}

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
  if (!street || !isPlausibleStreet(street)) return null;
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

async function generate(client, city, originalBlocks) {
  const { lat, lon } = city;
  const pois = await socialPois(client, lat, lon);
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

const client = await connect();
let targets = [];
if (slugArg) targets = slugArg.split(",").map((s) => s.trim());
else if (wantAll) {
  // base the "needs blocks" filter on the human-authored baseline count
  const rows = await allSlugs(client);
  targets = rows.filter((r) => r.n < TARGET).map((r) => r.slug);
} else { console.error("pass --slug <slug[,slug]> or --all"); await client.end(); process.exit(2); }

const out = {};
for (const slug of targets) {
  const city = await loadCity(client, slug);
  if (!city) { console.error(`! no city ${slug}`); continue; }
  // The regeneration baseline is the human-authored blocks (durable column),
  // never the current merged `blocks` — so a re-run tops up from the baseline
  // and can't compound. Falls back to current blocks only if the column is
  // unset (a city onboarded before migration 0009).
  const original = (Array.isArray(city.blocks_authored) ? city.blocks_authored : null) ?? city.blocks ?? [];
  try {
    const res = await generate(client, city, original);
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
