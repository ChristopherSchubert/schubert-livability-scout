// scripts/backfill-boundaries.mjs — populate cities.stay_zone_boundary for
// every city, using a cached Nominatim layer so re-runs are nearly free.
//
// Architecture:
//   - nominatim_cache table is the single source of truth for "what did
//     Nominatim say about query X" — keyed by (endpoint, query, params).
//   - Every API call goes through cachedFetch(): cache hit returns
//     immediately; miss hits Nominatim, sleeps to respect the 1 req/sec
//     etiquette, persists the result, and returns it.
//   - HTTP 429 / non-JSON responses are NOT cached as "no result" — we sleep
//     and retry, so a transient rate-limit block can't poison the cache.
//   - Picking logic: walk a prioritized list of query candidates per city,
//     return the first polygon that's neighborhood-scale (≤ 10 km² bbox).
//     If none, try the reverse-geocode-discovered neighborhood at the saved
//     center, then Point→circle, then anchor circle as last resort.
//
// Usage:  SUPABASE_DB_PASSWORD=... node scripts/backfill-boundaries.mjs
// Options: --force  re-run for cities that already have a boundary
//          --only=Pittsburgh  filter to cities matching a substring

import pg from "pg";

const FORCE = process.argv.includes("--force");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const UA = "livability-scout/1.0 (boundary backfill)";
const NOMINATIM = "https://nominatim.openstreetmap.org";
const MAX_KM2 = 10;   // neighborhood-scale ceiling
const MIN_KM2 = 0.05; // ~220m × 220m — anything smaller is a single building
                      // (Pittsburgh (Lawrenceville) was getting "Industry Public
                      // House", a bar building, as its polygon), a plaza, or a
                      // dock, not a stay-zone-scale neighborhood.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const c = new pg.Client({
  host: "aws-1-us-west-2.pooler.supabase.com",
  port: 5432,
  user: "postgres.fitjkrmiwkdolxhitroc",
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// ── Cache layer ─────────────────────────────────────────────────────────────

// Look up the cached response for (endpoint, query, params). Returns the
// stored result (which may be null = "Nominatim returned no hits") or
// undefined if we've never asked this question. We deliberately distinguish
// "asked + nothing" from "never asked," so a cache hit short-circuits a real
// API call even when the answer was nothing.
async function cacheGet(endpoint, query, params) {
  const r = await c.query(
    "SELECT result FROM nominatim_cache WHERE endpoint=$1 AND query=$2 AND params=$3",
    [endpoint, query, JSON.stringify(params)],
  );
  if (r.rows.length === 0) return undefined;
  return r.rows[0].result; // may be null
}

async function cachePut(endpoint, query, params, result, httpStatus) {
  // pg won't serialize JS objects/arrays to jsonb automatically — stringify both.
  await c.query(
    `INSERT INTO nominatim_cache (endpoint, query, params, result, http_status)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint, query, params)
     DO UPDATE SET result=$4, http_status=$5, fetched_at=now()`,
    [endpoint, query, JSON.stringify(params), result == null ? null : JSON.stringify(result), httpStatus],
  );
}

// Nominatim wrapper that goes through the cache. Returns the parsed JSON
// (Array for /search, Object for /reverse) or null on "no result." Sleeps
// 1100 ms after every live API call. Retries 429/HTML once after 60s; if
// still throttled, throws so the caller can decide what to do.
async function cachedFetch(endpoint, query, params) {
  const cached = await cacheGet(endpoint, query, params);
  if (cached !== undefined) return cached;
  const url = `${NOMINATIM}/${endpoint}?${new URLSearchParams(params)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    await sleep(1100);
    if (r.status === 429) { console.log("  429, sleeping 60s…"); await sleep(60000); continue; }
    const text = await r.text();
    if (!text || text.trim().startsWith("<")) { console.log("  HTML err, sleeping 60s…"); await sleep(60000); continue; }
    let d = null;
    try { d = JSON.parse(text); } catch { d = null; }
    await cachePut(endpoint, query, params, d, r.status);
    return d;
  }
  throw new Error(`Nominatim still throttled after retries: ${query}`);
}

// ── Domain helpers ──────────────────────────────────────────────────────────

// Does this polygon's bbox contain (lat, lon)? We use bbox (not the precise
// rings) on purpose — Nominatim's saved center is often just outside the OSM
// boundary by a few meters but should still count as "in the right place."
// The point of this check is to catch wrong-city matches: when a query like
// "Downtown, VA" silently returns Roanoke's Downtown for all three Virginia
// cities, the saved center for Lexington / Staunton is hundreds of km away.
function bboxContains(geo, lat, lon) {
  if (!geo?.coordinates || lat == null || lon == null) return false;
  const polys = geo.type === "MultiPolygon" ? geo.coordinates : [geo.coordinates];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const rings of polys) for (const [x, y] of rings[0]) {
    if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
    if (x < minLon) minLon = x; if (x > maxLon) maxLon = x;
  }
  // Small fudge (~150 m) so a saved center sitting just outside the polygon
  // edge still passes.
  const pad = 0.0015;
  return lat >= minLat - pad && lat <= maxLat + pad && lon >= minLon - pad && lon <= maxLon + pad;
}

function bboxAreaKm2(geo) {
  if (!geo?.coordinates) return Infinity;
  const polys = geo.type === "MultiPolygon" ? geo.coordinates : [geo.coordinates];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const rings of polys) for (const [lon, lat] of rings[0]) {
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
  }
  const midLat = (minLat + maxLat) / 2;
  return (maxLat - minLat) * 111.32 * (maxLon - minLon) * 111.32 * Math.cos((midLat * Math.PI) / 180);
}

function circlePolygon(lat, lon, radiusM = 700) {
  const N = 24;
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring = [];
  for (let i = 0; i <= N; i++) {
    const a = (2 * Math.PI * i) / N;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

function buildQueries(stayZone, cityName) {
  const cityPart = (cityName || "").split(",")[0].trim();
  const statePart = ((cityName || "").split(",")[1] || "").trim();
  const parenMatch = cityPart.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const bareCity = parenMatch ? parenMatch[1].trim() : cityPart;
  const parenName = parenMatch ? parenMatch[2].trim() : null;
  const scope = (s, c = bareCity) => `${s}, ${c}${statePart ? ", " + statePart : ""}`;

  const expand = (s) => s
    .replace(/\bTwp\b\.?/gi, "Township")
    .replace(/\bSq\b\.?/gi, "Square")
    .replace(/\bSt\b\.?/gi, "Street");
  const stripSuf = (s) => s.replace(/\s+(edge|area|neighbou?rhood|district|core|side)$/i, "").trim();
  const zoneTokens = (stayZone || "")
    .split(/\s*[/+]\s*/)
    .map((t) => stripSuf(expand(t.replace(/\s*\([^)]*\)\s*/g, " ").trim())))
    .filter(Boolean);

  const tries = [
    parenName ? scope(parenName) : null,
    ...zoneTokens.map((t) => scope(t)),
    ...zoneTokens.map((t) => `${t}${statePart ? ", " + statePart : ""}`),
    stayZone ? scope(stayZone) : null,
    stayZone ? `${stayZone}${statePart ? ", " + statePart : ""}` : null,
  ].filter(Boolean);

  const seen = new Set();
  return tries.filter((q) => (seen.has(q) ? false : (seen.add(q), true)));
}

async function searchPolygon(query) {
  const params = { q: query, format: "json", polygon_geojson: "1", limit: "10" };
  const d = await cachedFetch("search", query, params);
  for (const hit of (Array.isArray(d) ? d : [])) {
    if (hit?.geojson && (hit.geojson.type === "Polygon" || hit.geojson.type === "MultiPolygon")) {
      return hit.geojson;
    }
  }
  return null;
}

async function searchFirstPoint(query) {
  const params = { q: query, format: "json", polygon_geojson: "1", limit: "10" };
  const d = await cachedFetch("search", query, params);
  const hit = (Array.isArray(d) ? d : []).find((h) => h?.lat && h?.lon);
  return hit ? { lat: +hit.lat, lon: +hit.lon } : null;
}

async function reverseNeighborhoodNames(lat, lon) {
  const params = { lat: String(lat), lon: String(lon), format: "json", addressdetails: "1", zoom: "16" };
  const d = await cachedFetch("reverse", `${lat},${lon}`, params);
  const a = d?.address || {};
  const out = [];
  for (const k of ["neighbourhood", "quarter", "suburb", "city_district"]) {
    if (a[k] && !out.includes(a[k])) out.push(a[k]);
  }
  return out;
}

// Decide the boundary for a single city. Order of preference:
//   1. Any polygon (≤ MAX_KM2) from the user's stay_zone tokens or paren'd
//      city name — these encode the user's intent.
//   2. Any polygon from a name OSM volunteers at the saved lat/lon via
//      reverse geocode (the "clear best neighborhood" the user asked for).
//   3. A 700 m circle around the first Point hit from the stay_zone tokens.
//   4. An 800 m circle around the saved center as last resort.
async function pickBoundary(city) {
  const queries = buildQueries(city.stay_zone, city.name);
  for (const q of queries) {
    const poly = await searchPolygon(q);
    if (poly) {
      const km2 = bboxAreaKm2(poly);
      const okSize = km2 >= MIN_KM2 && km2 <= MAX_KM2;
      const okLoc = bboxContains(poly, city.lat, city.lon);
      if (okSize && okLoc) return { poly, source: `polygon:${q}` };
    }
  }
  // Stage 2: reverse geocode for a neighborhood OSM knows at the saved center
  if (city.lat != null && city.lon != null) {
    const names = await reverseNeighborhoodNames(city.lat, city.lon);
    const cityPart = (city.name || "").split(",")[0].replace(/\s*\([^)]*\)\s*/g, " ").trim();
    const statePart = ((city.name || "").split(",")[1] || "").trim();
    for (const n of names) {
      const q = `${n}, ${cityPart}${statePart ? ", " + statePart : ""}`;
      const poly = await searchPolygon(q);
      if (poly && bboxAreaKm2(poly) <= MAX_KM2) return { poly, source: `reverse-geocode:${n}` };
    }
  }
  // Stage 3: Point fallback (small circle around an OSM node for a token)
  for (const q of queries) {
    const pt = await searchFirstPoint(q);
    if (pt) return { poly: circlePolygon(pt.lat, pt.lon, 700), source: `point-circle:${q}` };
  }
  // Stage 4: anchor circle (no constraint info found anywhere — keep cores
  // close to where the user pinned)
  if (city.lat != null && city.lon != null) {
    return { poly: circlePolygon(city.lat, city.lon, 800), source: "anchor-circle" };
  }
  return null;
}

// ── Main loop ───────────────────────────────────────────────────────────────

const where = FORCE ? "WHERE stay_zone IS NOT NULL AND stay_zone <> ''"
                    : "WHERE stay_zone_boundary IS NULL AND stay_zone IS NOT NULL AND stay_zone <> ''";
const r = await c.query(`SELECT id, name, stay_zone, lat, lon FROM cities ${where} ORDER BY name`);
const rows = ONLY ? r.rows.filter((row) => row.name.toLowerCase().includes(ONLY.toLowerCase())) : r.rows;
console.log(`processing ${rows.length} cities (force=${FORCE}, only=${ONLY || "none"})\n`);

const counters = { polygon: 0, "point-circle": 0, "anchor-circle": 0, "reverse-geocode": 0, none: 0 };
for (const city of rows) {
  try {
    const out = await pickBoundary(city);
    if (!out) { counters.none++; console.log(`- ${city.name} (no anchor)`); continue; }
    await c.query("UPDATE cities SET stay_zone_boundary = $1 WHERE id = $2", [out.poly, city.id]);
    const kind = out.source.split(":")[0];
    counters[kind]++;
    const km2 = bboxAreaKm2(out.poly);
    console.log(`+ ${city.name} · ${km2.toFixed(2)} km² · ${out.source}`);
  } catch (e) {
    console.log(`! ${city.name} — ${e.message}`);
  }
}

const final = await c.query("SELECT COUNT(*) FILTER (WHERE stay_zone_boundary IS NOT NULL) AS with_boundary, COUNT(*) AS total FROM cities");
console.log("\nresult:", final.rows[0]);
console.log("by source:", counters);

const cacheStats = await c.query("SELECT COUNT(*) FROM nominatim_cache");
console.log("nominatim_cache size:", cacheStats.rows[0].count, "queries");

await c.end();
