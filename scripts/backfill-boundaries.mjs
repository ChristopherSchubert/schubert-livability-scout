// scripts/backfill-boundaries.mjs — populate cities.stay_zone_boundary for
// every city by stitching together three authoritative polygon sources, each
// cached so re-runs are nearly free.
//
// Sources, in fall-through order:
//   1. OSM via Nominatim (volunteer-curated neighborhood polygons). Best for
//      big cities with active mapping communities — Pittsburgh, Cleveland,
//      Cincinnati, Columbus. Often empty for small US towns.
//   2. NRHP via NPS ArcGIS (National Register of Historic Places). The
//      polygon dataset includes historic districts ≥ 10 acres. Strong for
//      Newport / Charleston / Lewes / anywhere with a historic core.
//   3. TIGER via US Census ArcGIS — Census Tracts (always present) and
//      Incorporated Places / CDPs (when small enough). The statistical fallback.
//
//   ...then the existing Point→circle and anchor-circle fallbacks if no
//   source has a polygon that both contains the saved pin and passes the
//   size filter.
//
// Caches:
//   - nominatim_cache (existing) for Nominatim search/reverse responses.
//   - external_cache for NRHP + TIGER responses, keyed by (source, query).
//   Every API call goes through a cache layer; HTTP errors are NOT cached as
//   "no result" so transient blocks can't poison subsequent runs.
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

// Great-circle distance in meters between two lat/lon pairs.
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p = (x) => (x * Math.PI) / 180;
  const dphi = p(lat2 - lat1), dl = p(lon2 - lon1);
  const x = Math.sin(dphi / 2) ** 2 + Math.cos(p(lat1)) * Math.cos(p(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

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

// ── External polygon sources (NRHP + TIGER) ──────────────────────────────────

// Generic cache for non-Nominatim sources. Same shape as cacheGet/cachePut.
async function extGet(source, query) {
  const r = await c.query(
    "SELECT result FROM external_cache WHERE source=$1 AND query=$2",
    [source, query],
  );
  return r.rows.length ? r.rows[0].result : undefined;
}
async function extPut(source, query, result, httpStatus) {
  await c.query(
    `INSERT INTO external_cache (source, query, result, http_status)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (source, query) DO UPDATE SET result=$3, http_status=$4, fetched_at=now()`,
    [source, query, result == null ? null : JSON.stringify(result), httpStatus],
  );
}
// Fetch a URL, return parsed JSON, cache the result under (source, query).
async function cachedJSON(source, query, url) {
  const cached = await extGet(source, query);
  if (cached !== undefined) return cached;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const text = await r.text();
  let d = null;
  try { d = JSON.parse(text); } catch { d = null; }
  await extPut(source, query, d, r.status);
  return d;
}

// Two-letter state abbreviation → uppercase full name (the form NRHP uses).
const STATE_NAMES = {
  AL: "ALABAMA", AK: "ALASKA", AZ: "ARIZONA", AR: "ARKANSAS", CA: "CALIFORNIA",
  CO: "COLORADO", CT: "CONNECTICUT", DE: "DELAWARE", FL: "FLORIDA", GA: "GEORGIA",
  HI: "HAWAII", ID: "IDAHO", IL: "ILLINOIS", IN: "INDIANA", IA: "IOWA",
  KS: "KANSAS", KY: "KENTUCKY", LA: "LOUISIANA", ME: "MAINE", MD: "MARYLAND",
  MA: "MASSACHUSETTS", MI: "MICHIGAN", MN: "MINNESOTA", MS: "MISSISSIPPI", MO: "MISSOURI",
  MT: "MONTANA", NE: "NEBRASKA", NV: "NEVADA", NH: "NEW HAMPSHIRE", NJ: "NEW JERSEY",
  NM: "NEW MEXICO", NY: "NEW YORK", NC: "NORTH CAROLINA", ND: "NORTH DAKOTA",
  OH: "OHIO", OK: "OKLAHOMA", OR: "OREGON", PA: "PENNSYLVANIA", RI: "RHODE ISLAND",
  SC: "SOUTH CAROLINA", SD: "SOUTH DAKOTA", TN: "TENNESSEE", TX: "TEXAS", UT: "UTAH",
  VT: "VERMONT", VA: "VIRGINIA", WA: "WASHINGTON", WV: "WEST VIRGINIA", WI: "WISCONSIN", WY: "WYOMING",
  DC: "DISTRICT OF COLUMBIA",
};

// Pull the queryable bareCity + state code out of a "City (Neighborhood), ST"
// row name. Used as the shared key for external sources.
function cityKey(rowName) {
  const cityPart = (rowName || "").split(",")[0].replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const stateCode = ((rowName || "").split(",")[1] || "").trim().toUpperCase();
  return { city: cityPart, stateCode, stateName: STATE_NAMES[stateCode] || null };
}

// All National Register Historic Places polygons recorded for (city, state).
// We only keep districts/sites that survive the size + pin-containment filter.
async function fetchNrhpPolygons(rowName) {
  const { city, stateName } = cityKey(rowName);
  if (!city || !stateName) return [];
  const where = `City = '${city.replace(/'/g, "''")}' AND State = '${stateName}'`;
  const url = new URL("https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/1/query");
  url.search = new URLSearchParams({
    where, outFields: "RESNAME,ResType,Address",
    returnGeometry: "true", outSR: "4326", f: "geojson",
  });
  const d = await cachedJSON("nrhp_polygons", `${city}|${stateName}`, url.toString());
  if (!d?.features) return [];
  // Districts are the obvious stay-zone candidates; sites (parks, cemeteries)
  // sometimes work too. Buildings are individual structures — skip.
  return d.features
    .filter((f) => (f.properties?.ResType || "").toLowerCase() !== "building")
    .map((f) => ({ poly: f.geometry, name: f.properties?.RESNAME, type: f.properties?.ResType }));
}

// The Census Tract that contains (lat, lon). Tracts are statistical units
// (~4 k people) but match neighborhood scale in cities. One result.
async function fetchTigerTract(lat, lon) {
  const url = new URL("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query");
  url.search = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "GEOID,NAME,AREALAND",
    returnGeometry: "true", outSR: "4326", f: "geojson",
  });
  const d = await cachedJSON("tiger_tract", `${lat.toFixed(4)},${lon.toFixed(4)}`, url.toString());
  const f = d?.features?.[0];
  return f ? { poly: f.geometry, geoid: f.properties.GEOID, name: f.properties.NAME } : null;
}

// The Census Incorporated Place or CDP that contains (lat, lon). One result
// per layer — we query both because some rows are CDPs (no incorporation).
async function fetchTigerPlace(lat, lon) {
  for (const [layer, kind] of [[4, "place"], [5, "cdp"]]) {
    const url = new URL(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/${layer}/query`);
    url.search = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint", inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "NAME,AREALAND,GEOID",
      returnGeometry: "true", outSR: "4326", f: "geojson",
    });
    const d = await cachedJSON(`tiger_${kind}`, `${lat.toFixed(4)},${lon.toFixed(4)}`, url.toString());
    const f = d?.features?.[0];
    if (f) return { poly: f.geometry, name: f.properties.NAME, kind };
  }
  return null;
}

// Does this polygon pass our hard filters? Size in [MIN, MAX] km², AND the
// saved pin sits inside the bbox (with padding). Same gates whether the
// polygon came from OSM, NRHP, or TIGER.
function acceptPoly(poly, city) {
  if (!poly) return false;
  const km2 = bboxAreaKm2(poly);
  if (km2 < MIN_KM2 || km2 > MAX_KM2) return false;
  return bboxContains(poly, city.lat, city.lon);
}

// Decide the boundary for a single city. Order of preference:
//   1. OSM polygon from the user's stay_zone tokens or paren'd city name.
//   2. OSM polygon from a reverse-geocode neighborhood name at the saved pin.
//   3. NRHP district polygon at (city, state) — best for historic-core towns.
//   4. Census Tract containing the saved pin — statistical fallback.
//   5. Census Place / CDP containing the saved pin (only if small enough).
//   6. A 700 m circle around the first OSM Point hit for a stay_zone token.
//   7. An 800 m circle around the saved center as last resort.
async function pickBoundary(city) {
  const queries = buildQueries(city.stay_zone, city.name);
  for (const q of queries) {
    const poly = await searchPolygon(q);
    if (acceptPoly(poly, city)) return { poly, source: `polygon:${q}` };
  }
  // Stage 2: reverse geocode for a neighborhood OSM knows at the saved center
  if (city.lat != null && city.lon != null) {
    const names = await reverseNeighborhoodNames(city.lat, city.lon);
    const cityPart = (city.name || "").split(",")[0].replace(/\s*\([^)]*\)\s*/g, " ").trim();
    const statePart = ((city.name || "").split(",")[1] || "").trim();
    for (const n of names) {
      const q = `${n}, ${cityPart}${statePart ? ", " + statePart : ""}`;
      const poly = await searchPolygon(q);
      if (acceptPoly(poly, city)) return { poly, source: `reverse-geocode:${n}` };
    }
  }
  // Stage 3: NRHP. Among districts that contain the pin and pass the size
  // filter, prefer the LARGEST — that's typically the umbrella historic
  // district (e.g. "Newport Historic District" 2.71 km²) over a tiny
  // sub-feature (e.g. "Bellevue Avenue/Casino HD" 0.06 km²) and gives the
  // user a more permissive stay zone for Suggest cores to scan.
  const nrhp = await fetchNrhpPolygons(city.name);
  const nrhpPass = nrhp.filter((n) => acceptPoly(n.poly, city)).sort((a, b) => bboxAreaKm2(b.poly) - bboxAreaKm2(a.poly));
  if (nrhpPass.length) {
    const pick = nrhpPass[0];
    return { poly: pick.poly, source: `nrhp:${pick.name}` };
  }
  // Stage 4: Census Tract at the pin
  if (city.lat != null && city.lon != null) {
    const tract = await fetchTigerTract(city.lat, city.lon);
    if (tract && acceptPoly(tract.poly, city)) {
      return { poly: tract.poly, source: `tract:${tract.geoid}` };
    }
  }
  // Stage 5: Census Place / CDP — usually too big for a stay zone, but for
  // small towns (Newport, Lewes) the whole town genuinely IS the stay zone.
  if (city.lat != null && city.lon != null) {
    const place = await fetchTigerPlace(city.lat, city.lon);
    if (place && acceptPoly(place.poly, city)) {
      return { poly: place.poly, source: `${place.kind}:${place.name}` };
    }
  }
  // Stage 3: Point fallback (small circle around an OSM node for a token).
  // Require the Point to be within ~3 km of the saved center — otherwise
  // Nominatim's top hit for "Historic Hill, Newport, RI" silently lands on
  // a Historic Hill in some other Rhode Island town and we draw the boundary
  // 5 km from where the user actually pinned.
  const MAX_POINT_DIST_M = 3000;
  for (const q of queries) {
    const pt = await searchFirstPoint(q);
    if (!pt) continue;
    if (city.lat != null && city.lon != null) {
      const dist = haversine(pt.lat, pt.lon, city.lat, city.lon);
      if (dist > MAX_POINT_DIST_M) continue;
    }
    return { poly: circlePolygon(pt.lat, pt.lon, 700), source: `point-circle:${q}` };
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

const counters = { polygon: 0, "reverse-geocode": 0, nrhp: 0, tract: 0, place: 0, cdp: 0, "point-circle": 0, "anchor-circle": 0, none: 0 };
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
