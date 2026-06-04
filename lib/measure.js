// lib/measure.js — the measurement ROUTINE, pure and reusable.
// No database, no Node-only APIs beyond fetch — so it runs in the batch
// script, in a Vercel API route, or anywhere. Give it a center point and it
// returns cited metrics + a composite. Sources: OSM (Overpass), Open-Meteo
// elevation. Anything it can't compute is simply omitted (never faked).

const UA = "livability-scout/1.0 (measurement)";
const RADIUS = 700; // meters — the ~10-min-walk core we judge
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function haversine(a, b, c, d) {
  const R = 6371000, p = (x) => (x * Math.PI) / 180;
  const dphi = p(c - a), dl = p(d - b);
  const x = Math.sin(dphi / 2) ** 2 + Math.cos(p(a)) * Math.cos(p(c)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Endpoint resolved at call time so a long-running batch can swap between a
// local Docker instance (OVERPASS_URL=http://localhost:12345/api/interpreter)
// and the public mirror between cities without restarting. Vercel never sets
// the env var, so prod stays on the public endpoint.
// Public Overpass endpoints we'll try in order. The main endpoint is the most
// authoritative but goes down / rate-limits regularly; the mirrors are
// volunteer-run but generally up. OVERPASS_URL env var (typically the local
// Docker instance) overrides everything when set.
const OVERPASS_PUBLIC = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
export async function overpass(query) {
  const urls = process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : OVERPASS_PUBLIC;
  // Try each endpoint up to twice before failing over to the next. A "soft
  // failure" (429, 504, connection refused, parse error) advances to retry;
  // exhausting both attempts on one endpoint advances to the next mirror.
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query),
        });
        if (r.status === 429 || r.status === 504) { await sleep(6000); continue; }
        if (!r.ok) break; // hard error on this endpoint — try the next mirror
        return await r.json();
      } catch { await sleep(2000); }
    }
  }
  return null;
}

// Geocode a heart intersection → rough anchor (Nominatim).
export async function geocodeHeart(heart, name) {
  const street = (heart || "").split("&")[0].trim();
  const cityName = name.split(",")[0].split("/")[0].trim();
  const state = (name.split(",")[1] || "").trim();
  for (const params of [
    new URLSearchParams({ street, city: cityName, state, country: "USA", format: "json", limit: "1" }),
    new URLSearchParams({ city: cityName, state, country: "USA", format: "json", limit: "1" }),
  ]) {
    try {
      const d = await (await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": UA } })).json();
      if (d?.[0]) return { lat: +d[0].lat, lon: +d[0].lon };
    } catch { /* try next */ }
  }
  return null;
}

// ── Stay-zone boundary policy ────────────────────────────────────────────────
//
// The stay zone is "the broader walkable area you'd consider staying in." The
// 700 m measurement field is then placed adaptively at the densest cluster
// INSIDE this polygon (see findVisitCenters + measureAround), so a generous
// boundary lets the measurement find the real hot spot. The score is then
// "best 700 m within the stay zone," not "700 m around whichever pin you
// happened to drop."
//
// fetchStayZoneBoundary tries authoritative sources in fall-through order,
// broadest first:
//   1. TIGER Census Place / CDP at the saved pin — for small towns the whole
//      town IS the stay zone (Lewes 13, Hood River 9, Lewisburg 10 km²).
//      Big cities (Portland ME 611, Boulder 65) fall through.
//   2. OSM (Nominatim) polygon from stay_zone tokens — downtown / named
//      neighborhood polygons.
//   3. OSM reverse-geocode neighborhood at the saved pin.
//   4. TIGER Census Tract at the pin — statistical neighborhood fallback.
//   5. NRHP historic district at (city, state) — small-town fallback.
//   6. Point-circle 700 m around the first OSM Point hit.
//   7. 2 km circle around the saved pin as last resort.
//
// Size filter uses TRUE polygon area (shoelace), not bbox — a long thin HD
// reads as small by polygon area but big by bbox. Polygons over 30 km² are
// rejected as "city-scale, not stay-zone."
const MIN_BOUNDARY_AREA_KM2 = 0.5;   // ~700×700m — below this is a single park
const MAX_BOUNDARY_AREA_KM2 = 30;    // above this is the whole city
const ANCHOR_CIRCLE_RADIUS_M = 2000; // last-resort circle around saved pin
const BBOX_CONTAINS_PAD_DEG = 0.0015; // ~150m fudge for "pin inside polygon"

// True polygon area (shoelace, equirectangular projection). Sums outer rings
// and subtracts holes. Use this for the size filter — bbox overestimates
// stretched shapes (e.g. Lewisburg WV historic district's 25 km² bbox covers
// a ~1 km² actual polygon).
export function polygonAreaKm2(geo) {
  if (!geo?.coordinates) return Infinity;
  const polys = geo.type === "MultiPolygon" ? geo.coordinates : [geo.coordinates];
  let total = 0;
  for (const rings of polys) {
    if (!rings.length) continue;
    let mnLat = Infinity, mxLat = -Infinity;
    for (const [, lat] of rings[0]) { if (lat < mnLat) mnLat = lat; if (lat > mxLat) mxLat = lat; }
    const refLat = (mnLat + mxLat) / 2;
    const mPerLon = 111320 * Math.cos((refLat * Math.PI) / 180);
    const mPerLat = 111320;
    const ringArea = (ring) => {
      let s = 0;
      for (let i = 0, n = ring.length; i < n - 1; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
        s += (x1 * mPerLon) * (y2 * mPerLat) - (x2 * mPerLon) * (y1 * mPerLat);
      }
      return Math.abs(s) / 2;
    };
    let polyArea = ringArea(rings[0]);
    for (let h = 1; h < rings.length; h++) polyArea -= ringArea(rings[h]);
    total += Math.max(0, polyArea);
  }
  return total / 1e6;
}

// Does this polygon's bbox contain (lat, lon)? Used to catch wrong-city matches
// — a query like "Downtown, VA" might silently return Roanoke's Downtown when
// we asked about Lexington. A small pad lets a pin just outside the polygon
// edge still count as "in the right place."
function bboxContains(geo, lat, lon) {
  if (!geo?.coordinates || lat == null || lon == null) return false;
  const polys = geo.type === "MultiPolygon" ? geo.coordinates : [geo.coordinates];
  let mnLat = Infinity, mxLat = -Infinity, mnLon = Infinity, mxLon = -Infinity;
  for (const rings of polys) for (const [x, y] of rings[0]) {
    if (y < mnLat) mnLat = y; if (y > mxLat) mxLat = y;
    if (x < mnLon) mnLon = x; if (x > mxLon) mxLon = x;
  }
  const p = BBOX_CONTAINS_PAD_DEG;
  return lat >= mnLat - p && lat <= mxLat + p && lon >= mnLon - p && lon <= mxLon + p;
}

// Hard-filter gate shared by every source: real polygon area in [MIN, MAX],
// AND the saved pin sits inside the bbox (with padding).
function acceptStayZonePoly(poly, anchor) {
  if (!poly) return false;
  const km2 = polygonAreaKm2(poly);
  if (km2 < MIN_BOUNDARY_AREA_KM2 || km2 > MAX_BOUNDARY_AREA_KM2) return false;
  if (!anchor) return true;
  return bboxContains(poly, anchor.lat, anchor.lon);
}

// Two-letter state abbreviation → uppercase state name (the form NRHP uses).
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
  VT: "VERMONT", VA: "VIRGINIA", WA: "WASHINGTON", WV: "WEST VIRGINIA", WI: "WISCONSIN",
  WY: "WYOMING", DC: "DISTRICT OF COLUMBIA",
};

async function jsonFetch(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    const text = await r.text();
    return JSON.parse(text);
  } catch { return null; }
}

// All NRHP polygons for (city, state). Skip buildings — too small to be a
// stay zone. Districts and sites are the candidates.
async function fetchNrhpPolygons(cityName) {
  const cityPart = (cityName || "").split(",")[0].replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const stateCode = ((cityName || "").split(",")[1] || "").trim().toUpperCase();
  const stateName = STATE_NAMES[stateCode];
  if (!cityPart || !stateName) return [];
  const where = `City = '${cityPart.replace(/'/g, "''")}' AND State = '${stateName}'`;
  const params = new URLSearchParams({
    where, outFields: "RESNAME,ResType",
    returnGeometry: "true", outSR: "4326", f: "geojson",
  });
  const d = await jsonFetch(`https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/1/query?${params}`);
  if (!d?.features) return [];
  return d.features
    .filter((f) => (f.properties?.ResType || "").toLowerCase() !== "building")
    .map((f) => ({ poly: f.geometry, name: f.properties?.RESNAME, type: f.properties?.ResType }));
}

// Census Tract containing (lat, lon). One result.
async function fetchTigerTract(lat, lon) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "GEOID,NAME",
    returnGeometry: "true", outSR: "4326", f: "geojson",
  });
  const d = await jsonFetch(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query?${params}`);
  const f = d?.features?.[0];
  return f ? { poly: f.geometry, name: f.properties.NAME, geoid: f.properties.GEOID } : null;
}

// Census Incorporated Place / CDP containing (lat, lon).
async function fetchTigerPlace(lat, lon) {
  for (const [layer, kind] of [[4, "place"], [5, "cdp"]]) {
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint", inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "NAME,GEOID",
      returnGeometry: "true", outSR: "4326", f: "geojson",
    });
    const d = await jsonFetch(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/${layer}/query?${params}`);
    const f = d?.features?.[0];
    if (f) return { poly: f.geometry, name: f.properties.NAME, kind };
  }
  return null;
}

// Build the ordered candidate-query list for the OSM Nominatim stage(s).
// Stay_zone strings are descriptive ("City Dock / Historic Core"), not direct
// place names — we try parenthetical city qualifier, each "/"-split token,
// and the whole string, scoped by city + state.
function buildOsmQueries(stayZone, cityName) {
  const cityPart = (cityName || "").split(",")[0].trim();
  const statePart = ((cityName || "").split(",")[1] || "").trim();
  const parenMatch = cityPart.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const bareCity = parenMatch ? parenMatch[1].trim() : cityPart;
  const parenName = parenMatch ? parenMatch[2].trim() : null;
  const scope = (s, c = bareCity) => `${s}, ${c}${statePart ? ", " + statePart : ""}`;
  const expand = (s) => s.replace(/\bTwp\b\.?/gi, "Township").replace(/\bSq\b\.?/gi, "Square").replace(/\bSt\b\.?/gi, "Street");
  const stripSuf = (s) => s.replace(/\s+(edge|area|neighbou?rhood|district|core|side)$/i, "").trim();
  const tokens = (stayZone || "").split(/\s*[/+]\s*/)
    .map((t) => stripSuf(expand(t.replace(/\s*\([^)]*\)\s*/g, " ").trim())))
    .filter(Boolean);
  const tries = [
    parenName ? scope(parenName) : null,
    ...tokens.map((t) => scope(t)),
    ...tokens.map((t) => `${t}${statePart ? ", " + statePart : ""}`),
    stayZone ? scope(stayZone) : null,
    stayZone ? `${stayZone}${statePart ? ", " + statePart : ""}` : null,
  ].filter(Boolean);
  const seen = new Set();
  return { queries: tries.filter((q) => (seen.has(q) ? false : (seen.add(q), true))), bareCity, statePart };
}

// Fetch the broadest sensible polygon for a city's stay zone. See the boundary
// policy doc-block above for the source ordering and rationale. The pin
// (anchor) gates "polygon must actually contain my pin" — without it we'd
// accept any same-named polygon anywhere in the state.
export async function fetchStayZoneBoundary(stayZone, cityName, anchor = null) {
  if (!stayZone && !cityName) return null;
  const hasAnchor = anchor && Number.isFinite(anchor.lat) && Number.isFinite(anchor.lon);

  // Stage 1: Census Place / CDP at the saved pin — "the town." For small
  // towns (Lewes, Hood River, Lewisburg) this IS the stay zone. Big cities
  // (Portland ME 611 km², Boulder 65) fail the size cap and fall through.
  if (hasAnchor) {
    const place = await fetchTigerPlace(anchor.lat, anchor.lon);
    if (place && acceptStayZonePoly(place.poly, anchor)) {
      return { poly: place.poly, source: `${place.kind}:${place.name}` };
    }
  }

  const { queries, bareCity, statePart } = buildOsmQueries(stayZone, cityName);

  // Stage 2: OSM (Nominatim) polygon from stay_zone tokens.
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await sleep(1100);
    const hit = await nominatimSearchPolygon(queries[i]);
    if (acceptStayZonePoly(hit, anchor)) return { poly: hit, source: `osm:${queries[i]}` };
  }

  // Stage 3: OSM reverse-geocode neighborhood at the pin.
  if (hasAnchor) {
    const names = await reverseNeighborhoodNames(anchor.lat, anchor.lon);
    for (const n of names) {
      await sleep(1100);
      const q = `${n}, ${bareCity}${statePart ? ", " + statePart : ""}`;
      const hit = await nominatimSearchPolygon(q);
      if (acceptStayZonePoly(hit, anchor)) return { poly: hit, source: `osm-reverse:${n}` };
    }
  }

  // Stage 4: Census Tract at the pin.
  if (hasAnchor) {
    const tract = await fetchTigerTract(anchor.lat, anchor.lon);
    if (tract && acceptStayZonePoly(tract.poly, anchor)) {
      return { poly: tract.poly, source: `tract:${tract.geoid}` };
    }
  }

  // Stage 5: NRHP — take the LARGEST passing district (umbrella HD over
  // sub-features).
  const nrhp = await fetchNrhpPolygons(cityName);
  const nrhpPass = nrhp.filter((n) => acceptStayZonePoly(n.poly, anchor))
    .sort((a, b) => polygonAreaKm2(b.poly) - polygonAreaKm2(a.poly));
  if (nrhpPass.length) {
    const pick = nrhpPass[0];
    return { poly: pick.poly, source: `nrhp:${pick.name}` };
  }

  // Stage 6: Point-circle 700 m around the first OSM Point hit for a token.
  // Require it within ~3 km of the saved pin — otherwise a same-named feature
  // in a different town could silently sit kilometers away.
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await sleep(1100);
    const pt = await nominatimSearchPoint(queries[i]);
    if (!pt) continue;
    if (hasAnchor && haversine(pt.lat, pt.lon, anchor.lat, anchor.lon) > 3000) continue;
    return { poly: circlePolygon(pt.lat, pt.lon, 700), source: `point-circle:${queries[i]}` };
  }

  // Stage 7: anchor-circle 2 km around the saved pin. Generous so the
  // adaptive measurement has room to find a real cluster.
  if (hasAnchor) {
    return { poly: circlePolygon(anchor.lat, anchor.lon, ANCHOR_CIRCLE_RADIUS_M), source: "anchor-circle" };
  }
  return null;
}

// Approximate a small circular polygon (24-vertex) around (lat,lon) with the
// given radius in meters. Lon scaling accounts for latitude; fine for our
// neighborhood-scale (≤1 km) circles where Earth curvature is negligible.
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

// Reverse-geocode a lat/lon and pull every neighborhood-ish name OSM has
// indexed at that point. Returns an ordered list, most-specific first:
// neighbourhood → quarter → suburb → city_district. Empty list on failure.
// Used as the "clear best neighborhood" fallback when the user's stay_zone
// string doesn't resolve to a polygon but OSM still knows the place name.
async function reverseNeighborhoodNames(lat, lon) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), format: "json", addressdetails: "1", zoom: "16" });
  const url = `https://nominatim.openstreetmap.org/reverse?${params}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.status === 429) { await sleep(30000); continue; }
      const text = await r.text();
      if (!text || text.trim().startsWith("<")) { await sleep(30000); continue; }
      const d = JSON.parse(text);
      const a = d?.address || {};
      const out = [];
      // Order matters: try the most-specific tag first so we don't accidentally
      // grab the city_district when a finer neighbourhood is sitting there.
      for (const k of ["neighbourhood", "quarter", "suburb", "city_district"]) {
        if (a[k] && !out.includes(a[k])) out.push(a[k]);
      }
      return out;
    } catch { return []; }
  }
  return [];
}

// Pull just lat/lon out of the first hit (any geometry type). Used by the
// Point fallback after polygon search exhausted.
async function nominatimSearchPoint(q) {
  const params = new URLSearchParams({ q, format: "json", limit: "10" });
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.status === 429) { await sleep(30000); continue; }
      const text = await r.text();
      if (!text || text.trim().startsWith("<")) { await sleep(30000); continue; }
      const d = JSON.parse(text);
      const hit = (Array.isArray(d) ? d : []).find((h) => h?.lat && h?.lon);
      if (hit) return { lat: +hit.lat, lon: +hit.lon };
      return null;
    } catch { return null; }
  }
  return null;
}

// Single Nominatim search with rate-limit retry. Asks for up to 10 results
// and returns the GeoJSON of the first one that has a Polygon / MultiPolygon
// — the top hit is often a Point (an OSM node tagged with the place name)
// even when a separate way/relation with the same name has a polygon. On
// HTTP 429 or non-JSON (Varnish error page) we sleep 30 s and retry once.
async function nominatimSearchPolygon(q) {
  const params = new URLSearchParams({ q, format: "json", polygon_geojson: "1", limit: "10" });
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.status === 429) { await sleep(30000); continue; }
      const text = await r.text();
      if (!text || text.trim().startsWith("<")) { await sleep(30000); continue; }
      const d = JSON.parse(text);
      for (const hit of (Array.isArray(d) ? d : [])) {
        if (hit?.geojson && (hit.geojson.type === "Polygon" || hit.geojson.type === "MultiPolygon")) {
          return hit.geojson;
        }
      }
      return null; // genuine "no polygon in any of the top hits"
    } catch { return null; }
  }
  return null;
}

// Ray-cast point-in-polygon for a single GeoJSON ring ([[lon,lat],...]).
// Standard even-odd test in lon/lat space — fine for neighborhood-scale
// polygons where the equirectangular distortion is negligible.
function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat))
      && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Test against a GeoJSON Polygon or MultiPolygon. A polygon counts if the
// point is inside the outer ring AND outside every hole.
export function pointInGeoJSON(lat, lon, geojson) {
  if (!geojson) return true; // no boundary → no constraint
  const polys = geojson.type === "MultiPolygon" ? geojson.coordinates : [geojson.coordinates];
  for (const rings of polys) {
    if (!rings?.length) continue;
    if (!pointInRing(lat, lon, rings[0])) continue;
    let inHole = false;
    for (let h = 1; h < rings.length; h++) {
      if (pointInRing(lat, lon, rings[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

// Visit-base finder. Casts a wide net (5km) for social POIs, then extracts the
// distinct density peaks — a town can have several real cores (a downtown, a
// waterfront, a university strip), and which one you'd base a visit around is a
// judgment call, not the algorithm's to silently make. So we surface the top
// few as *options*. The wide search discovers cores even when the rough geocode
// lands off to one side; mean-shift converges each onto its true density max.
const VC_SEARCH = 5000;  // wide net to discover clusters anywhere nearby
const VC_TIGHT = 500;    // radius that defines "a cluster" (the visit core)
const VC_SEP = 900;      // min separation between distinct cores

async function socialPoints(lat, lon) {
  const q = `[out:json][timeout:55];
    (nwr["amenity"~"^(cafe|restaurant|bar|pub|biergarten)$"](around:${VC_SEARCH},${lat},${lon});
     nwr["shop"~"^(coffee|bakery|deli|tea|pastry)$"](around:${VC_SEARCH},${lat},${lon}););
    out center;`;
  const d = await overpass(q);
  return (d?.elements || [])
    .map((el) => el.center || (el.lat != null ? { lat: el.lat, lon: el.lon } : null))
    .filter(Boolean);
}

// Mean-shift a center onto the local density peak of `pts` within VC_TIGHT.
function tighten(seed, pts) {
  let cen = { lat: seed.lat, lon: seed.lon };
  for (let it = 0; it < 8; it++) {
    const near = pts.filter((p) => haversine(cen.lat, cen.lon, p.lat, p.lon) <= VC_TIGHT);
    if (!near.length) break;
    const nlat = near.reduce((s, p) => s + p.lat, 0) / near.length;
    const nlon = near.reduce((s, p) => s + p.lon, 0) / near.length;
    const shift = haversine(cen.lat, cen.lon, nlat, nlon);
    cen = { lat: nlat, lon: nlon };
    if (shift < 15) break;
  }
  return cen;
}

// Top distinct candidate cores, ranked by how many social POIs sit within
// VC_TIGHT. Greedy peak extraction: find the densest cluster, record it, drop
// everything within VC_SEP, repeat. Returns [{lat,lon,n,moved}] best-first.
//
// `boundary` (GeoJSON Polygon/MultiPolygon) is the "stay inside the
// neighborhood I picked" constraint: candidate cores outside the polygon are
// dropped. Without it, a wide net around (say) South Side Slopes finds
// downtown Pittsburgh, which has more cafés but isn't what the user asked
// about. When no boundary is available, `maxDriftM` is the fallback cap.
export async function findVisitCenters(lat, lon, { max = 4, maxDriftM = 1200, boundary = null } = {}) {
  const all = await socialPoints(lat, lon);
  if (all.length < 6) return [{ lat, lon, n: all.length, moved: 0 }];

  const peaks = [];
  let pool = all.slice();
  while (pool.length >= 5 && peaks.length < max) {
    // Seed from the densest VC_TIGHT-cell of the remaining pool (O(n)).
    const mPerLon = 111320 * Math.cos((lat * Math.PI) / 180);
    const bins = new Map();
    for (const p of pool) {
      const k = `${Math.round(((p.lon - lon) * mPerLon) / VC_TIGHT)},${Math.round(((p.lat - lat) * 111320) / VC_TIGHT)}`;
      const b = bins.get(k) || { sx: 0, sy: 0, n: 0 };
      b.sx += p.lon; b.sy += p.lat; b.n += 1; bins.set(k, b);
    }
    let bestBin = null;
    for (const b of bins.values()) if (!bestBin || b.n > bestBin.n) bestBin = b;
    const cen = tighten({ lat: bestBin.sy / bestBin.n, lon: bestBin.sx / bestBin.n }, all);
    const n = all.filter((p) => haversine(cen.lat, cen.lon, p.lat, p.lon) <= VC_TIGHT).length;
    const drift = Math.round(haversine(lat, lon, cen.lat, cen.lon));

    // Stop once clusters get trivial (absolute floor, or <15% of the top core).
    const floor = peaks.length ? Math.max(6, peaks[0].n * 0.15) : 6;
    if (n < floor) break;

    // Always carve out the cluster from the pool so the next iteration finds a
    // genuinely different peak — but only KEEP it if it passes the constraint.
    // Polygon wins when present; otherwise the drift cap acts as a fallback.
    pool = pool.filter((p) => haversine(cen.lat, cen.lon, p.lat, p.lon) > VC_SEP);
    if (boundary) {
      if (!pointInGeoJSON(cen.lat, cen.lon, boundary)) continue;
    } else if (maxDriftM != null && drift > maxDriftM) {
      continue;
    }

    peaks.push({ lat: +cen.lat.toFixed(6), lon: +cen.lon.toFixed(6), n, moved: drift });
  }
  peaks.sort((a, b) => b.n - a.n);
  return peaks.length ? peaks : [{ lat, lon, n: 0, moved: 0 }];
}

// Single best center (auto mode / backward compatible): the densest core.
// No drift cap here — the auto path is for "I geocoded the whole city,
// now snap to its real downtown" and may legitimately move several km.
export async function findVisitCenter(lat, lon) {
  const [best] = await findVisitCenters(lat, lon, { max: 1, maxDriftM: null });
  return best;
}

async function relief(lat, lon) {
  const n = 6, span = RADIUS / 111000, lats = [], lons = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    lats.push((lat - span + (2 * span * i) / (n - 1)).toFixed(5));
    lons.push((lon - span + (2 * span * j) / (n - 1)).toFixed(5));
  }
  try {
    const d = await (await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lons.join(",")}`)).json();
    const e = (d.elevation || []).filter((x) => typeof x === "number");
    if (!e.length) return { std: null, range: null };
    const mean = e.reduce((s, v) => s + v, 0) / e.length;
    const std = Math.sqrt(e.reduce((s, v) => s + (v - mean) ** 2, 0) / e.length);
    return { std: Math.round(std * 10) / 10, range: Math.round(Math.max(...e) - Math.min(...e)) };
  } catch { return { std: null, range: null }; }
}

// Exported so the osm-core measurer (lib/measurers/osm-core.js) can call it
// directly without paying for measureAround's water + relief fetches it doesn't
// need. Routes through overpass(), so OVERPASS_URL is honored automatically.
export async function osmMetrics(lat, lon) {
  const q = `[out:json][timeout:90];
    (nwr["amenity"~"^(cafe|restaurant|bar|pub|biergarten|fast_food|ice_cream|food_court)$"](around:${RADIUS},${lat},${lon});
     nwr["shop"~"^(coffee|bakery|pastry|tea|deli|greengrocer|supermarket|convenience|butcher|chocolate)$"](around:${RADIUS},${lat},${lon});
     nwr["cuisine"~"coffee"](around:${RADIUS},${lat},${lon});
     nwr["amenity"="pharmacy"](around:${RADIUS},${lat},${lon}););
    out tags;
    way["highway"](around:${RADIUS},${lat},${lon});
    out geom;`;
  const d = await overpass(q);
  if (!d) return {};
  const out = {};
  let cafe = 0, rest = 0, bar = 0, daily = 0;
  for (const el of d.elements) {
    if (el.type === "way" && el.geometry) continue;
    const a = el.tags?.amenity, s = el.tags?.shop, cu = el.tags?.cuisine || "";
    const isCafe = a === "cafe" || s === "coffee" || s === "tea" || /coffee/.test(cu);
    if (isCafe) cafe++;
    else if (a === "restaurant" || a === "fast_food" || a === "food_court") rest++;
    else if (a === "bar" || a === "pub" || a === "biergarten") bar++;
    if (["bakery", "pastry", "deli", "greengrocer", "supermarket", "convenience", "butcher"].includes(s) || a === "pharmacy") daily++;
  }
  out.cafe_n = cafe; out.rest_n = rest; out.bar_n = bar; out.daily_needs_n = daily;
  const ways = d.elements.filter((e) => e.type === "way" && e.geometry);
  let total = 0, carfree = 0; const lengths = []; const nodeUse = new Map();
  for (const w of ways) {
    let len = 0;
    for (let i = 1; i < w.geometry.length; i++) len += haversine(w.geometry[i - 1].lat, w.geometry[i - 1].lon, w.geometry[i].lat, w.geometry[i].lon);
    if (len === 0) continue;
    lengths.push(len); total += len;
    const hw = w.tags?.highway;
    if (["pedestrian", "footway", "living_street", "path", "steps"].includes(hw) || w.tags?.foot === "designated") carfree += len;
    for (const nd of w.nodes || []) nodeUse.set(nd, (nodeUse.get(nd) || 0) + 1);
  }
  const areaKm2 = Math.PI * (RADIUS / 1000) ** 2;
  out.street_km = Math.round(total / 10) / 100;
  out.mean_block_m = lengths.length ? Math.round(total / lengths.length) : null;
  out.carfree_frac = total ? Math.round((carfree / total) * 1000) / 1000 : null;
  out.intersection_den = Math.round(([...nodeUse.values()].filter((c) => c >= 3).length / areaKm2) * 10) / 10;
  return out;
}

// Minimum surface area (m²) for a water polygon to count as "major" water.
// ~5 hectares: cleanly separates real lakes/rivers/reservoirs from ornamental
// park ponds, retention basins, and fountains (which are a fraction of this).
// The sea (coastline / bay / strait) always counts regardless of polygon area.
const MIN_WATER_AREA_M2 = 50000;

// Planar area (m²) of a closed ring via the shoelace formula, with a local
// equirectangular projection around the ring's latitude.
export function ringAreaM2(geom) {
  if (!geom || geom.length < 3) return 0;
  const lat0 = geom[0].lat * Math.PI / 180;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(lat0);
  let a = 0;
  for (let i = 0; i < geom.length; i++) {
    const j = (i + 1) % geom.length;
    const xi = geom[i].lon * mPerDegLon, yi = geom[i].lat * mPerDegLat;
    const xj = geom[j].lon * mPerDegLon, yj = geom[j].lat * mPerDegLat;
    a += xi * yj - xj * yi;
  }
  return Math.abs(a) / 2;
}

// Overpass query for major-water features within `r` metres.
//  • the sea — coastline / bay / strait
//  • named rivers — waterway=river / riverbank, water=river
//  • standing water — natural=water (area-filtered downstream)
// `out geom` returns per-way node coords and per-relation-member geometry.
function waterQuery(lat, lon, r) {
  return `[out:json][timeout:60];
    (way["natural"="coastline"](around:${r},${lat},${lon});
     way["natural"~"bay|strait"](around:${r},${lat},${lon});
     relation["natural"~"bay|strait"](around:${r},${lat},${lon});
     way["waterway"="river"](around:${r},${lat},${lon});
     way["waterway"="riverbank"](around:${r},${lat},${lon});
     relation["waterway"="riverbank"](around:${r},${lat},${lon});
     way["natural"="water"](around:${r},${lat},${lon});
     relation["natural"="water"](around:${r},${lat},${lon}););
    out geom;`;
}

// Collect the vertices of every MAJOR water body in an Overpass result. The sea
// (coastline/bay/strait) and named rivers (waterway=river/riverbank, water=
// river — OSM reserves "river" for real rivers; "stream"/ditch is excluded)
// always count; standing water (lakes/reservoirs) must clear MIN_WATER_AREA_M2,
// so a 0.2-hectare ornamental "turtle pond" can't masquerade as the waterfront.
function majorWaterVerts(elements) {
  const verts = [];
  const eat = (geom) => { for (const g of geom) verts.push(g); };
  for (const el of elements || []) {
    const nat = el.tags?.natural, ww = el.tags?.waterway, wt = el.tags?.water;
    const isSea = nat === "coastline" || nat === "bay" || nat === "strait";
    const isRiver = ww === "river" || ww === "riverbank" || wt === "river";
    const always = isSea || isRiver;
    if (el.members) {
      const outers = el.members.filter((m) => m.geometry && m.role !== "inner");
      const area = outers.reduce((s, m) => s + ringAreaM2(m.geometry), 0);
      if (always || area >= MIN_WATER_AREA_M2) for (const m of el.members) if (m.geometry) eat(m.geometry);
    } else if (el.geometry) {
      if (always || ringAreaM2(el.geometry) >= MIN_WATER_AREA_M2) eat(el.geometry);
    } else if (el.lat != null && isSea) {
      verts.push({ lat: el.lat, lon: el.lon });
    }
  }
  return verts;
}

// Nearest vertex to (lat,lon): { dist, point } (point is null when no verts).
function minDistToVerts(lat, lon, verts) {
  let best = null, bp = null;
  for (const g of verts) { const d = haversine(lat, lon, g.lat, g.lon); if (best == null || d < best) { best = d; bp = g; } }
  return best == null ? { dist: null, point: null } : { dist: Math.round(best), point: { lat: +bp.lat.toFixed(5), lon: +bp.lon.toFixed(5) } };
}

// Nearest major water EDGE — nearest shoreline vertex of the nearest BODY, not
// a far-offshore bay centroid. Returns { dist, point, extentKm2 } so callers
// can draw the line and credit the water's grandeur.
export async function nearestWater(lat, lon) {
  const d = await overpass(waterQuery(lat, lon, 15000));
  if (!d) return { dist: null, point: null, extentKm2: null, kind: null, name: null };
  // Distance is to the nearest body's edge; grandeur is the LARGEST body whose
  // edge is within 4km ("is there grand water near me?") — so a coastal town
  // whose nearest edge is a small river-mouth still gets credit for the ocean.
  const bodies = [...waterBodies(d.elements).values()];
  // Width-by-elevation pass: any line-mapped river without polygon gets a
  // chance to be measured by its physical channel width (perpendicular elev).
  await annotateRiverElevationWidths(bodies, lat, lon);
  let best = null, grand = 0;
  for (const b of bodies) {
    const r = minDistToVerts(lat, lon, b.verts);
    if (r.dist == null) continue;
    if (best == null || r.dist < best.dist) best = { ...r, body: b };
    if (r.dist <= 4000) grand = Math.max(grand, bodyGrandeurKm2(b, r.dist));
  }
  if (!best) return { dist: null, point: null, extentKm2: null, kind: null, name: null };
  // Surface body kind + name so chip rules can distinguish coast/river/lake/bay.
  return {
    dist: best.dist,
    point: best.point,
    extentKm2: grand || bodyGrandeurKm2(best.body, best.dist),
    kind: best.body.kind,            // "sea" | "river" | "lake"
    name: best.body.name || null,    // e.g. "Atlantic" / "Narragansett Bay" / "Hudson River"
  };
}

// Water distance for MANY nearby points in ONE Overpass call: fetch the water
// geometry once around the anchor (radius covers points up to ~5km out plus the
// water search reach), then compute each point's nearest-edge distance locally.
// Avoids firing N concurrent heavy queries — Overpass rate-limits concurrency,
// so parallel per-point calls mostly time out and return null.
export async function nearestWaterMulti(lat, lon, points) {
  const d = await overpass(waterQuery(lat, lon, 18000));
  if (!d) return points.map(() => null);
  const verts = majorWaterVerts(d.elements);
  return points.map((p) => minDistToVerts(p.lat, p.lon, verts).dist);
}

// Group major-water vertices into distinct BODIES so the user can target one.
//  • the sea — all coastline/bay/strait merged into one "Ocean / coast" body
//    (named after a bay/strait if one is tagged)
//  • rivers — grouped by name (one body per named river)
//  • lakes/reservoirs — grouped by name, else per-feature
// Returns Map(key → { name, kind, verts }).
function waterBodies(elements) {
  const bodies = new Map();
  const push = (key, name, kind, verts, areaM2, sea, centerline) => {
    let b = bodies.get(key);
    if (!b) { b = { name: null, kind, verts: [], areaM2: 0, isSea: false, centerlines: [] }; bodies.set(key, b); }
    if (!b.name && name) b.name = name;
    if (sea) b.isSea = true;
    b.areaM2 += areaM2 || 0;
    for (const g of verts) b.verts.push(g);
    // Preserve ordered per-way centerlines so we can sample perpendicular
    // elevation along the river to estimate width.
    if (centerline && centerline.length >= 2) b.centerlines.push(centerline);
  };
  // Surface area of a closed ring only (open lines — coastline, river
  // centerlines — contribute 0; the sea is credited via the sentinel below).
  const closedRingArea = (g) => (g && g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon ? ringAreaM2(g) : 0);
  for (const el of elements || []) {
    const nat = el.tags?.natural, ww = el.tags?.waterway, wt = el.tags?.water, name = el.tags?.name || null;
    const isSea = nat === "coastline" || nat === "bay" || nat === "strait";
    const isRiver = ww === "river" || ww === "riverbank" || wt === "river";
    // The OPEN line tag — these are centerlines we can sample perpendicular to.
    // Closed rings (water polygons) shouldn't be treated as centerlines.
    const isLineCenterline = ww === "river"; // waterway=river ways are centerlines
    let verts = [], elArea = 0, centerline = null;
    if (el.members) {
      const outers = el.members.filter((m) => m.geometry && m.role !== "inner");
      const inners = el.members.filter((m) => m.geometry && m.role === "inner");
      const area = outers.reduce((s, m) => s + closedRingArea(m.geometry), 0) - inners.reduce((s, m) => s + closedRingArea(m.geometry), 0);
      if (isSea || isRiver || area >= MIN_WATER_AREA_M2) { for (const m of el.members) if (m.geometry) verts.push(...m.geometry); elArea = Math.max(0, area); }
    } else if (el.geometry) {
      const a = closedRingArea(el.geometry);
      if (isSea || isRiver || a >= MIN_WATER_AREA_M2) {
        verts.push(...el.geometry);
        elArea = a;
        if (isLineCenterline && a === 0) centerline = el.geometry; // open river line
      }
    } else if (el.lat != null && isSea) {
      verts.push({ lat: el.lat, lon: el.lon });
    }
    if (!verts.length) continue;
    if (isSea) push("sea", nat === "bay" || nat === "strait" ? name : null, "sea", verts, elArea, true, null);
    else if (isRiver) push(`river:${name || el.type + el.id}`, name, "river", verts, elArea, false, centerline);
    else push(`lake:${name || el.type + el.id}`, name, "lake", verts, elArea, false, null);
  }
  for (const b of bodies.values()) {
    if (!b.name) b.name = b.kind === "sea" ? "Ocean / coast" : b.kind === "river" ? "Unnamed river" : "Unnamed lake";
  }

  // Post-pass: OSM frequently tags the named centerline of a river under one
  // body and its riverbank polygon under a separate "(unnamed)" body. The
  // Savannah River, French Broad, Petaluma River, Cooper River etc. all do
  // this. Without merging them, the named river reads polygon area 0 even
  // when the polygon clearly exists nearby. Here we fold any unnamed water
  // body's area into the nearest named river/lake whose centerline or vertex
  // is within MERGE_DIST_M of the unnamed polygon. The unnamed body is then
  // dropped from the result so it can't double-count.
  const MERGE_DIST_M = 250;
  const namedTargets = [...bodies.values()].filter((b) => !b.isSea && !/^(Unnamed )/.test(b.name));
  const orphans = [...bodies.entries()].filter(([, b]) => !b.isSea && /^(Unnamed )/.test(b.name) && b.areaM2 > 0);
  for (const [key, orphan] of orphans) {
    // Take a few sample vertices from the orphan to test against named bodies.
    const probes = orphan.verts.length <= 30 ? orphan.verts : orphan.verts.filter((_, i) => i % Math.ceil(orphan.verts.length / 30) === 0);
    let bestTarget = null, bestDist = Infinity;
    for (const target of namedTargets) {
      // Match against the centerline (rivers) or verts (lakes).
      const candidatePts = target.centerlines.length ? target.centerlines.flat() : target.verts;
      if (!candidatePts.length) continue;
      // Stop on the first close-enough match; otherwise track the closest.
      outer: for (const p of probes) {
        for (const c of candidatePts) {
          const d = haversine(p.lat, p.lon, c.lat, c.lon);
          if (d < bestDist) { bestDist = d; bestTarget = target; }
          if (d <= MERGE_DIST_M) break outer;
        }
      }
    }
    if (bestTarget && bestDist <= MERGE_DIST_M) {
      bestTarget.areaM2 += orphan.areaM2;
      for (const g of orphan.verts) bestTarget.verts.push(g);
      bodies.delete(key);
    }
  }

  return bodies;
}

// Grandeur (km²) of a water body. Three signals, take the max:
//   1) polygon surface area (when OSM mapped the body as a closed shape — the
//      common case for lakes, reservoirs, and well-mapped rivers)
//   2) for line-mapped rivers: width-by-elevation × centerline length, computed
//      separately and merged onto the body via .elevWidthKm2
//   3) named-major-river safety net: if the body's name is in MAJOR_RIVERS,
//      grandeur = cap. This catches huge rivers OSM hasn't polygon-mapped at a
//      given segment (the Columbia at Hood River is the canonical case where
//      polygon AND elevation both fail because of sparse OSM data + soft banks).
//
// MAJOR_RIVERS is the safety net: about 70 named rivers any reasonable American
// would call major. Erring inclusive ("more over less"), because the cost of
// over-counting a borderline river is much less than under-counting an
// obviously-major one. Only fires when the better signals miss.
const WATER_CAP_KM2 = 500;
const MAJOR_RIVERS = new Set([
  // National giants
  "Mississippi River", "Missouri River", "Ohio River", "Columbia River",
  "Yukon River", "Rio Grande", "Colorado River", "Snake River",
  "Saint Lawrence River", "Tennessee River", "Arkansas River",
  // Atlantic / mid-Atlantic / Southeast
  "Hudson River", "Mohawk River", "Connecticut River", "Merrimack River",
  "Kennebec River", "Penobscot River", "Androscoggin River",
  "Delaware River", "Schuylkill River", "Susquehanna River", "Potomac River",
  "Rappahannock River", "James River", "Roanoke River",
  "Cape Fear River", "Neuse River", "Pee Dee River", "Catawba River",
  "Savannah River", "Altamaha River", "Saint Johns River",
  // Gulf / Mississippi tributaries
  "Cumberland River", "Wabash River", "Illinois River", "Wisconsin River",
  "Saint Croix River", "Minnesota River", "Red River", "White River",
  "Ouachita River", "Apalachicola River", "Chattahoochee River",
  "Alabama River", "Mobile River", "Tombigbee River", "Pearl River",
  // Texas / Plains
  "Brazos River", "Trinity River", "Sabine River", "Guadalupe River",
  "Pecos River", "Canadian River", "Cimarron River", "Platte River",
  "North Platte River", "South Platte River", "Yellowstone River", "Powder River",
  // Western intermountain
  "Green River", "San Juan River", "Bighorn River",
  // Pacific Northwest
  "Willamette River", "Deschutes River", "Clark Fork", "Salmon River",
  "Clearwater River", "Pend Oreille River", "Spokane River",
  // California
  "Sacramento River", "San Joaquin River", "Klamath River", "Russian River",
  "Eel River", "Rogue River", "Umpqua River",
  // Great Lakes / Pittsburgh's three rivers
  "Detroit River", "Niagara River", "Genesee River",
  "Allegheny River", "Monongahela River",
  // OSM-data-gap rivers — verified that OSM has NO polygon mapped at the
  // city's location, so neither the polygon path nor the polygon-merge path
  // can catch them. These are the only true safety-net adds; if a river isn't
  // here, it should fall out of the algorithm naturally.
  "French Broad River", // Asheville — no riverbank polygon in OSM at Asheville
]);

// ── River width by elevation ─────────────────────────────────────────────
// For each river body that has a centerline but little/no polygon area, find
// the centerline vertex nearest the city, sample elevation perpendicular at
// several offsets, and infer width as the distance to the first significant
// rise above water level. Requires the BANKS to actually rise (≥50m within
// 1km on BOTH sides) so we don't over-count creek-rivers in floodplains.
// Returns area = width × in-window centerline length, stored as b.elevWidthKm2.
async function annotateRiverElevationWidths(bodies, cityLat, cityLon) {
  const MIN_BANK_M = 50;          // min elevation rise within 1km to qualify
  const MAX_PERP_M = 1000;        // search this far perpendicular
  const WIDTH_THRESHOLD_M = 5;    // metres above water to call something a bank
  const OFFSETS = [-MAX_PERP_M, -500, -200, -100, -50, -20, 0, 20, 50, 100, 200, 500, MAX_PERP_M];

  // OSM tagging is noisy: many small streams sit under waterway=river. The
  // human-given NAME is the more reliable signal — major water bodies named
  // "Creek", "Run", "Brook", "Branch", or "Fork" aren't what people mean by
  // grand water. Pine Creek (Pittsburgh) and Bear Creek (Ashland) are the
  // canonical false positives this filter kills.
  const NOT_REAL_RIVER = /(?:\s|^)(Creek|Run|Brook|Branch|Fork)$/i;
  const candidates = bodies.filter((b) =>
    b.kind === "river"
    && b.centerlines.length
    && (b.areaM2 / 1e6) < 1
    && b.name
    && !NOT_REAL_RIVER.test(b.name)
  );
  if (!candidates.length) return;

  // For each candidate, pick the nearest centerline vertex + a neighbor for direction.
  const probes = [];
  for (const b of candidates) {
    const allPts = b.centerlines.flat();
    let nearest = allPts[0], di = haversine(cityLat, cityLon, allPts[0].lat, allPts[0].lon), nearestLine = b.centerlines[0], nearestIdx = 0;
    for (const line of b.centerlines) {
      for (let i = 0; i < line.length; i++) {
        const d = haversine(cityLat, cityLon, line[i].lat, line[i].lon);
        if (d < di) { di = d; nearest = line[i]; nearestLine = line; nearestIdx = i; }
      }
    }
    if (di > 4000 || nearestLine.length < 2) continue; // too far to matter
    const neighbor = nearestLine[Math.min(nearestIdx + 1, nearestLine.length - 1)] === nearest
      ? nearestLine[Math.max(nearestIdx - 1, 0)]
      : nearestLine[Math.min(nearestIdx + 1, nearestLine.length - 1)];
    const az = (() => {
      const φ1 = nearest.lat * Math.PI / 180, φ2 = neighbor.lat * Math.PI / 180, dλ = (neighbor.lon - nearest.lon) * Math.PI / 180;
      return (Math.atan2(Math.sin(dλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)) * 180 / Math.PI + 360) % 360;
    })();
    const samples = OFFSETS.map((off) => {
      const a = off >= 0 ? (az + 90) % 360 : (az - 90 + 360) % 360;
      return destPoint(nearest.lat, nearest.lon, a, Math.abs(off));
    });
    // Length of river within 12km of city center
    let lenM = 0;
    for (const line of b.centerlines) {
      for (let i = 1; i < line.length; i++) {
        const d1 = haversine(cityLat, cityLon, line[i - 1].lat, line[i - 1].lon);
        const d2 = haversine(cityLat, cityLon, line[i].lat, line[i].lon);
        if (d1 <= 12000 && d2 <= 12000) lenM += haversine(line[i - 1].lat, line[i - 1].lon, line[i].lat, line[i].lon);
      }
    }
    probes.push({ b, samples, lenM });
  }
  if (!probes.length) return;
  // ONE batched elevation call for everything.
  const allCoords = probes.flatMap((p) => p.samples);
  const evs = await elevations(allCoords);
  // Walk back per-probe.
  let cursor = 0;
  for (const p of probes) {
    const e = evs.slice(cursor, cursor + p.samples.length);
    cursor += p.samples.length;
    const ci = OFFSETS.indexOf(0);
    const water = e[ci];
    if (water == null) continue;
    const leftIdx = OFFSETS.map((_, i) => i).filter((i) => OFFSETS[i] < 0);
    const rightIdx = OFFSETS.map((_, i) => i).filter((i) => OFFSETS[i] > 0);
    const leftMax = Math.max(...leftIdx.map((i) => e[i] ?? -Infinity)) - water;
    const rightMax = Math.max(...rightIdx.map((i) => e[i] ?? -Infinity)) - water;
    if (leftMax < MIN_BANK_M || rightMax < MIN_BANK_M) continue; // not a real channel
    // Width = distance to first significant bank rise on each side
    let leftW = MAX_PERP_M, rightW = MAX_PERP_M;
    for (let i = ci - 1; i >= 0; i--) { if ((e[i] ?? water) - water > WIDTH_THRESHOLD_M) { leftW = Math.abs(OFFSETS[i + 1] ?? OFFSETS[i]); break; } }
    for (let i = ci + 1; i < OFFSETS.length; i++) { if ((e[i] ?? water) - water > WIDTH_THRESHOLD_M) { rightW = OFFSETS[i - 1] ?? OFFSETS[i]; break; } }
    const width = leftW + rightW;
    if (width < 100) continue; // a real river is at least 100m wide
    p.b.elevWidthKm2 = (width * p.lenM) / 1e6;
  }
}

function bodyGrandeurKm2(b, nearestDistM = null) {
  if (!b) return null;
  if (b.isSea) return WATER_CAP_KM2;
  const polygonKm2 = b.areaM2 / 1e6;
  const elevKm2 = b.elevWidthKm2 || 0;
  let grandeur = Math.max(polygonKm2, elevKm2);
  // Safety net: a named-major river within 2 km gets the cap when other signals
  // are weak (OSM didn't draw the polygon AND elevation didn't see the channel).
  if (grandeur < WATER_CAP_KM2 && b.name && MAJOR_RIVERS.has(b.name) && (nearestDistM == null || nearestDistM <= 2000)) {
    grandeur = WATER_CAP_KM2;
  }
  return Math.min(WATER_CAP_KM2, Math.round(grandeur * 10) / 10);
}

// Ranked list of nearby major water bodies, nearest-first, each with the
// nearest-edge distance and the actual nearest point (for re-matching later).
export async function rankedWaterBodies(lat, lon, { max = 6 } = {}) {
  const d = await overpass(waterQuery(lat, lon, 18000));
  if (!d) return [];
  const out = [];
  for (const b of waterBodies(d.elements).values()) {
    let best = null, bp = null;
    for (const g of b.verts) { const dist = haversine(lat, lon, g.lat, g.lon); if (best == null || dist < best) { best = dist; bp = g; } }
    if (best == null) continue;
    out.push({ name: b.name, kind: b.kind, dist: Math.round(best), point: { lat: +bp.lat.toFixed(5), lon: +bp.lon.toFixed(5) }, extentKm2: bodyGrandeurKm2(b) });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, max);
}

// Distance (m) from (lat,lon) to a previously-chosen target body. We re-fetch
// and re-group around the current center, then match the target by the body
// holding a vertex nearest the stored target.point (robust to the center
// moving). Returns null if that body is no longer found nearby (caller falls
// back to auto-nearest).
export async function distanceToTarget(lat, lon, target) {
  if (!target?.point) return null;
  const d = await overpass(waterQuery(lat, lon, 18000));
  if (!d) return null;
  const bodies = [...waterBodies(d.elements).values()];
  let match = null, bestToPoint = Infinity;
  for (const b of bodies) {
    for (const g of b.verts) {
      const dd = haversine(target.point.lat, target.point.lon, g.lat, g.lon);
      if (dd < bestToPoint) { bestToPoint = dd; match = b; }
    }
  }
  if (!match || bestToPoint > 2000) return { dist: null, point: null, extentKm2: null }; // body not found nearby
  return { ...minDistToVerts(lat, lon, match.verts), extentKm2: bodyGrandeurKm2(match) };
}

// US Census ACS (tract-level): core population density, seasonal-vacancy
// share, and median home value. lat/lon → tract via the Census geocoder →
// ACS 5-yr detailed tables. US-only (all candidates are). Census encodes
// "not available" as large negative sentinels — those become null, not faked.
export async function measureCensus(lat, lon, apiKey, { asOf, year = 2023 } = {}) {
  const stamp = asOf || new Date().toISOString().slice(0, 10);
  const fetchJson = async (url) => {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA } });
        const txt = await r.text();
        if (txt.trim().startsWith("<")) { await sleep(2000); continue; } // HTML error page
        return JSON.parse(txt);
      } catch { await sleep(2000); }
    }
    return null;
  };
  // 1) coords → tract
  const g = await fetchJson(`https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json`);
  const t = g?.result?.geographies?.["Census Tracts"]?.[0];
  if (!t) return { metrics: {}, tract: null };
  // 2) ACS detailed tables for that tract
  //   B01003_001E — total population
  //   B08301_001E — workers 16+ (commute denominator)
  //   B08301_010E — workers commuting on foot
  //   B08301_011E — workers commuting by transit (incl. taxicab)
  //   B19013_001E — median household income (12-month, $)
  //   B25001_001E — total housing units
  //   B25003_001E — occupied housing units (denominator for owner-occ share)
  //   B25003_002E — owner-occupied housing units
  //   B25004_006E — seasonal / recreational vacant units
  //   B25034_001E — total units in structure (denominator for pre-1940 share)
  //   B25034_010E — units built 1939 or earlier
  //   B25077_001E — median home value (owner-occupied)
  const vars = "B01003_001E,B08301_001E,B08301_010E,B08301_011E,B19013_001E,B25001_001E,B25003_001E,B25003_002E,B25004_006E,B25034_001E,B25034_010E,B25077_001E";
  const a = await fetchJson(`https://api.census.gov/data/${year}/acs/acs5?get=${vars}&for=tract:${t.TRACT}&in=state:${t.STATE}%20county:${t.COUNTY}&key=${apiKey}`);
  if (!a || a.length < 2) return { metrics: {}, tract: t.GEOID };
  const m = Object.fromEntries(a[0].map((h, i) => [h, a[1][i]]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > -100000 ? n : null; };
  const pop = num(m.B01003_001E);
  const workers = num(m.B08301_001E);
  const walkCommute = num(m.B08301_010E);
  const transitCommute = num(m.B08301_011E);
  const medInc = num(m.B19013_001E);
  const units = num(m.B25001_001E);
  const occUnits = num(m.B25003_001E);
  const ownerOcc = num(m.B25003_002E);
  const seas = num(m.B25004_006E);
  const histTotal = num(m.B25034_001E);
  const pre1940 = num(m.B25034_010E);
  const val = num(m.B25077_001E);
  const sqmi = t.AREALAND ? t.AREALAND / 2589988.11 : null;
  const src = `US Census ACS 5-yr (${year - 4}–${year}), tract ${t.GEOID}`;
  const metrics = {};
  if (pop != null && sqmi) metrics.core_density = { value: Math.round(pop / sqmi), asOf: stamp, source: src };
  if (seas != null && units) metrics.seasonal_vac_pct = { value: Math.round((seas / units) * 1000) / 10, asOf: stamp, source: src };
  if (val != null) metrics.median_price_usd = { value: val, asOf: stamp, source: src };
  if (ownerOcc != null && occUnits) metrics.owner_occ_pct = { value: Math.round((ownerOcc / occUnits) * 1000) / 10, asOf: stamp, source: src };
  if (pre1940 != null && histTotal) metrics.pre1940_pct = { value: Math.round((pre1940 / histTotal) * 1000) / 10, asOf: stamp, source: src };
  if (medInc != null) metrics.median_income_usd = { value: medInc, asOf: stamp, source: src };
  // Walk + transit share — the "do people actually walk to work" companion
  // to Walk Score (which only measures destination density).
  if (workers && (walkCommute != null || transitCommute != null)) {
    const w = (walkCommute || 0) + (transitCommute || 0);
    metrics.walk_transit_commute_pct = { value: Math.round((w / workers) * 1000) / 10, asOf: stamp, source: src };
  }
  // Price-to-income — affordability for actual residents. A composed metric:
  // tract median home value ÷ tract median household income. Cap at 50 so a
  // tract with absurdly low income reporting doesn't yield a bogus 200x ratio.
  if (val != null && medInc != null && medInc > 0) {
    metrics.price_to_income_ratio = {
      value: Math.min(50, Math.round((val / medInc) * 10) / 10),
      asOf: stamp,
      source: src,
    };
  }
  return { metrics, tract: t.GEOID };
}

// Walk Score (0–100) for a point. Their API needs an address alongside
// lat/lon; the city name suffices. status 1 = success.
export async function measureWalkScore(lat, lon, address, apiKey, { asOf } = {}) {
  const stamp = asOf || new Date().toISOString().slice(0, 10);
  try {
    const url = `https://api.walkscore.com/score?format=json&lat=${lat}&lon=${lon}&address=${encodeURIComponent(address)}&wsapikey=${apiKey}`;
    const d = await (await fetch(url, { headers: { "User-Agent": UA } })).json();
    if (d?.status === 1 && Number.isFinite(d.walkscore)) {
      return { walk_score: { value: d.walkscore, asOf: stamp, source: "Walk Score (walkscore.com)" } };
    }
  } catch { /* leave unset */ }
  return {};
}

// Solar declination (radians) at day-of-year d. Spencer's Fourier series,
// accurate to ~0.0006 rad. Used for closed-form daylight hours per day, since
// NASA POWER doesn't expose daylight_duration the way Open-Meteo did.
function solarDeclinationRad(d) {
  const g = (2 * Math.PI / 365) * (d - 1);
  return 0.006918
    - 0.399912 * Math.cos(g)     + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.001480 * Math.sin(3 * g);
}

function daylightHrsAt(lat, dayOfYear) {
  const phi = lat * Math.PI / 180;
  const dec = solarDeclinationRad(dayOfYear);
  const arg = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(dec)));
  const h = Math.acos(arg);
  return (2 * h * 180 / Math.PI) / 15;
}

function dayOfYear(yyyymmdd) {
  // POWER returns "20230101"; produce day-of-year 1..365/366.
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const days = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let doy = d;
  for (let i = 0; i < m - 1; i++) doy += days[i];
  return doy;
}

// Climate (January axis): days/yr below freezing and clear days from
// NASA POWER's daily archive (MERRA-2 / GMAO, free, no key, no rate limit)
// averaged over recent years; plus December daylight from pure astronomy.
//
// Why POWER over Open-Meteo: Open-Meteo's free tier capped us at ~14 cities
// per hour during a full-corpus refresh. POWER has no hard rate limit (just
// a "please don't hammer" notice), global coverage, and gives the same
// fields we need with two substitutions:
//   - daily sunshine_duration → ALLSKY_SFC_SW_DWN / CLRSKY_SFC_SW_DWN ≥ 0.7
//     as the "clear day" criterion (actual ÷ clear-sky radiation ratio)
//   - daylight_duration is closed-form from latitude+day-of-year here
// POWER doesn't provide daily snowfall; annual snowfall lives in its own
// metric (`snowfall_in_yr`), sourced from NOAA NCEI 1991-2020 normals via
// lib/measurers/snowfall.js.
export async function measureClimate(lat, lon, { asOf, startYear = 2019, endYear = 2023 } = {}) {
  const stamp = asOf || new Date().toISOString().slice(0, 10);
  const metrics = {};
  // December daylight at the winter solstice — closed-form, no API.
  const decl = -23.44 * Math.PI / 180; // solstice solar declination
  const phi = lat * Math.PI / 180;
  let h = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl)))); // half-day angle
  const dayHrs = (2 * h * 180 / Math.PI) / 15;
  metrics.dec_daylight_hr = { value: Math.round(dayHrs * 10) / 10, asOf: stamp, source: "Solar geometry (latitude)" };
  // Freeze + clear days, 12-month normals, AND chip-driving extremes from the
  // archive — all in one fetch. Extremes (jan/jul means, jul dewpoint, annual
  // snow + precip) feed the climate chips in lib/chips.js; they don't appear
  // in the user-facing metricTaxonomy grid because they're derived signals,
  // not headline metrics. They land under `climate_extremes` so chip logic
  // reads them from one envelope.
  let visitClimate = null;
  try {
    const params = "T2M_MAX,T2M_MIN,T2M,PRECTOTCORR,T2MDEW,ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN";
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point` +
      `?parameters=${params}&community=AG` +
      `&latitude=${lat}&longitude=${lon}` +
      `&start=${startYear}0101&end=${endYear}1231&format=JSON`;
    const here = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    let body, attempt = 0;
    for (;;) {
      const resp = await fetch(url, { headers: { "User-Agent": UA } });
      const parsed = await resp.json().catch(() => null);
      // POWER's main throttle is per-IP burst; surface as 429 or 503. Back off
      // 30s up to 3 attempts. Other failures throw so the runner records the
      // city as failed rather than silently returning empty.
      if ((resp.status === 429 || resp.status === 503) && attempt < 3) {
        attempt += 1;
        console.warn(`[climate] rate-limited by NASA POWER at ${here} — HTTP ${resp.status}; backing off 30s (attempt ${attempt}/3)`);
        await sleep(30_000);
        continue;
      }
      if (!resp.ok) throw new Error(`NASA POWER HTTP ${resp.status} at ${here}`);
      if (!parsed) throw new Error(`NASA POWER: empty/unparseable body at ${here} (HTTP ${resp.status})`);
      body = parsed;
      break;
    }
    const param = body?.properties?.parameter;
    if (!param?.T2M_MAX || !Object.keys(param.T2M_MAX).length) {
      throw new Error(`NASA POWER returned no T2M_MAX at ${here} (keys: ${Object.keys(param || {}).join(",") || "none"})`);
    }
    {
      const years = endYear - startYear + 1;
      // POWER's missing-data sentinel is -999. Anything that low is invalid.
      const v = (x) => (x == null || x <= -900) ? null : x;
      let freeze = 0, clear = 0;
      // "Year-round" basket: pleasant (mean 55–80°F & dry), hot (high > 85°F).
      // Thresholds in Celsius (POWER serves Celsius). 55°F=12.78, 80°F=26.67,
      // 85°F=29.44. "Dry" reuses precip<1mm threshold inverted.
      let pleasant = 0, hot = 0;
      let annualPrecipMm = 0;
      const mo = Array.from({ length: 12 }, () => ({
        hi: 0, lo: 0, mean: 0, dew: 0,
        n: 0, nMean: 0, nDew: 0, wet: 0, day: 0, nDay: 0,
        precipMm: 0,
      }));
      // POWER returns each parameter as an object keyed by YYYYMMDD. Iterate
      // over T2M_MAX's keys as the canonical date set.
      for (const date of Object.keys(param.T2M_MAX).sort()) {
        const hi = v(param.T2M_MAX[date]);
        const lo = v(param.T2M_MIN[date]);
        const mean = v(param.T2M?.[date]);
        const dew = v(param.T2MDEW?.[date]);
        const precip = v(param.PRECTOTCORR?.[date]);
        const allsky = v(param.ALLSKY_SFC_SW_DWN?.[date]);
        const clrsky = v(param.CLRSKY_SFC_SW_DWN?.[date]);
        if (lo != null && lo < 0) freeze++;
        // Clear-day proxy: actual / clear-sky shortwave ≥ 0.7.
        if (allsky != null && clrsky != null && clrsky > 0 && allsky / clrsky >= 0.7) clear++;
        if (hi != null && hi > 29.44) hot++;
        if (mean != null && mean >= 12.78 && mean <= 26.67 && precip != null && precip < 1) pleasant++;
        const m = Number(date.slice(4, 6)) - 1;
        const doy = dayOfYear(date);
        const dayHrSec = daylightHrsAt(lat, doy) * 3600;
        if (hi != null && lo != null) {
          mo[m].hi += hi; mo[m].lo += lo; mo[m].n += 1;
          if (precip != null && precip >= 1) mo[m].wet += 1;
          if (precip != null) mo[m].precipMm += precip;
          mo[m].day += dayHrSec; mo[m].nDay += 1;
        }
        if (mean != null) { mo[m].mean += mean; mo[m].nMean += 1; }
        if (dew != null)  { mo[m].dew  += dew;  mo[m].nDew  += 1; }
        if (precip != null) annualPrecipMm += precip;
      }
      const src = `NASA POWER (MERRA-2) daily archive (${startYear}–${endYear})`;
      const srcUrl = "https://power.larc.nasa.gov/docs/services/api/temporal/daily/";
      metrics.days_below_freeze = { value: Math.round(freeze / years), asOf: stamp, source: src };
      metrics.clear_days = { value: Math.round(clear / years), asOf: stamp, source: src };
      metrics.pleasant_days = { value: Math.round(pleasant / years), asOf: stamp, source: src };
      metrics.hot_days = { value: Math.round(hot / years), asOf: stamp, source: src };
      // 12-month normals in °F (monthComfort uses °F thresholds).
      const cToF = (c) => Math.round((c * 9 / 5 + 32) * 10) / 10;
      const mmToIn = (mm) => Math.round((mm / 25.4) * 10) / 10;
      visitClimate = mo.map((x) => x.n ? {
        hi: cToF(x.hi / x.n), lo: cToF(x.lo / x.n),
        mean: x.nMean ? cToF(x.mean / x.nMean) : null,
        dewpoint: x.nDew ? cToF(x.dew / x.nDew) : null,
        precipDays: Math.round(x.wet / years),
        precipIn: mmToIn(x.precipMm / years),
        daylightHr: x.nDay ? Math.round((x.day / x.nDay / 3600) * 10) / 10 : null,
      } : null);
      if (visitClimate.every((m) => !m)) visitClimate = null;
      // Chip-driving extremes (one composite envelope under climate_extremes).
      // Annual snowfall is NOT in here — it has its own metric sourced from
      // NOAA NCEI normals (see lib/measurers/snowfall.js).
      const jan = visitClimate?.[0], jul = visitClimate?.[6];
      const extremes = {
        jan_mean_f: jan?.mean ?? null,
        jul_mean_f: jul?.mean ?? null,
        jul_dewpoint_f: jul?.dewpoint ?? null,
        annual_precip_in: annualPrecipMm > 0 ? mmToIn(annualPrecipMm / years) : 0,
      };
      if (Object.values(extremes).some((v) => v != null)) {
        metrics.climate_extremes = { value: extremes, asOf: stamp, source: src, sourceUrl: srcUrl };
      }
    }
  } catch (err) {
    // Surface the failure to the runner instead of returning empty metrics —
    // a partial result here used to silently mark cities ✓ without any
    // climate values. dec_daylight_hr above is astronomy-only and succeeds
    // even when the API is down, which was enough to fake an OK result.
    console.warn(`[climate] failed at ${lat.toFixed(3)},${lon.toFixed(3)}: ${err.message}`);
    throw err;
  }
  return { metrics, visitClimate };
}

// Visible mountain backdrop (Setting): the steepest skyline angle you'd see.
// March outward along many azimuths sampling ground elevation, correct for
// earth curvature + atmospheric refraction, and take the max elevation angle —
// a real line-of-sight skyline (a near ridge naturally occludes a far peak,
// since it presents a higher angle). Free, no key. Returns degrees.
const SKY_DIST_M = [1, 2, 3, 4, 5, 7, 10, 14, 18, 24, 30, 40, 55].map((k) => k * 1000);
const SKY_AZ = Array.from({ length: 24 }, (_, i) => i * 15);

export function destPoint(lat, lon, azDeg, dM) {
  const ad = dM / 6371000, a = azDeg * Math.PI / 180, la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  const la2 = Math.asin(Math.sin(la) * Math.cos(ad) + Math.cos(la) * Math.sin(ad) * Math.cos(a));
  const lo2 = lo + Math.atan2(Math.sin(a) * Math.sin(ad) * Math.cos(la), Math.cos(ad) - Math.sin(la) * Math.sin(la2));
  return [la2 * 180 / Math.PI, lo2 * 180 / Math.PI];
}

// Batch ground-elevation lookup. Primary source Open-Meteo (fast, generous);
// on failure or its daily-limit error, fall back to opentopodata (SRTM, a
// separate quota, ~1 req/sec). Keeps the elevation-based metrics (skyline,
// horizon peaks) working even when one source is exhausted.
// Exported for the terrain measurer (lib/measurers/terrain.js).
export async function elevations(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 100) {
    const c = points.slice(i, i + 100);
    let got = null, capped = false;
    const om = `https://api.open-meteo.com/v1/elevation?latitude=${c.map((p) => p[0].toFixed(5)).join(",")}&longitude=${c.map((p) => p[1].toFixed(5)).join(",")}`;
    for (let t = 0; t < 3 && !got && !capped; t++) {
      try {
        const d = await (await fetch(om, { headers: { "User-Agent": UA } })).json();
        if (Array.isArray(d.elevation)) got = d.elevation;
        else if (d.error) capped = true; // e.g. daily limit — don't retry, fall back
        else await sleep(1200);
      } catch { await sleep(1200); }
    }
    if (!got) {
      const otd = `https://api.opentopodata.org/v1/srtm30m?locations=${c.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join("|")}`;
      for (let t = 0; t < 3 && !got; t++) {
        try { const d = await (await fetch(otd)).json(); if (d.results) got = d.results.map((x) => x?.elevation ?? null); else await sleep(1500); }
        catch { await sleep(1500); }
      }
      await sleep(1100); // opentopodata fair-use ~1 req/sec
    } else {
      await sleep(300);
    }
    out.push(...(got || c.map(() => null)));
  }
  return out;
}

// Minimum elevation gain (m above observer) for a rise to count as a "mountain
// backdrop." Without this floor the metric mistakes urban hillsides for
// mountains — Mt. Washington (a 140m bluff above Pittsburgh's South Side)
// scored 7°+ skyline, indistinguishable from the Santa Ynez over Santa Barbara.
// A real mountain backdrop towers; a bluff just blocks the view. 400m cleanly
// excludes urban hillsides while passing every real mountain (Santa Ynez +1100m,
// Mt. Hood +3300m, Front Range +2400m, Smokies +1500m, etc.).
const MIN_BACKDROP_RISE_M = 400;

export async function measureSkyline(lat, lon, { asOf } = {}) {
  const stamp = asOf || new Date().toISOString().slice(0, 10);
  const R = 6371000, K = 0.87; // refraction-adjusted curvature
  const pts = [[lat, lon]];
  for (const az of SKY_AZ) for (const d of SKY_DIST_M) pts.push(destPoint(lat, lon, az, d));
  const e = await elevations(pts);
  const e0 = e[0];
  if (e0 == null) return { metrics: {} };
  let idx = 1, maxAngle = -90;
  for (let a = 0; a < SKY_AZ.length; a++) {
    let rayMax = -90;
    for (const d of SKY_DIST_M) {
      const ei = e[idx++];
      if (ei == null) continue;
      // Require the elevated point to be a real mountain (≥ MIN_BACKDROP_RISE_M
      // above observer). Skip everything else — a 140m bluff next door is not
      // a backdrop, regardless of how steep an angle it presents.
      if (ei - e0 < MIN_BACKDROP_RISE_M) continue;
      const rise = (ei - e0) - (d * d) / (2 * R) * K;
      const ang = Math.atan2(rise, d) * 180 / Math.PI;
      if (ang > rayMax) rayMax = ang;
    }
    if (rayMax > maxAngle) maxAngle = rayMax;
  }
  const deg = Math.max(0, Math.round(maxAngle * 10) / 10);
  return { metrics: { skyline_deg: { value: deg, asOf: stamp, source: "Open-Meteo elevation (line-of-sight skyline, min 400m rise)" } } };
}

// Named horizon peaks you can actually SEE from the center. Find OSM peaks
// (tagged with elevation) within a wide radius, compute each one's curvature-
// + refraction-corrected elevation angle, then occlusion-test it: march the
// terrain along its bearing — if a nearer ridge presents a higher angle, the
// peak is hidden. Returns the visible ones (name, elevation, distance, compass
// bearing, how many degrees it looms) plus how much of the horizon is filled.
function bearingDeg(aLat, aLon, bLat, bLon) {
  const φ1 = aLat * Math.PI / 180, φ2 = bLat * Math.PI / 180, dλ = (bLon - aLon) * Math.PI / 180;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const COMPASS16 = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const compassOf = (az) => COMPASS16[Math.round(az / 22.5) % 16];

export async function measureHorizonPeaks(lat, lon, { asOf } = {}) {
  const stamp = asOf || new Date().toISOString().slice(0, 10);
  const R = 6371000, K = 0.87;
  const ang = (ele, e0, d) => Math.atan2((ele - e0) - (d * d) / (2 * R) * K, d) * 180 / Math.PI;

  const q = `[out:json][timeout:60];
    (node["natural"="peak"]["ele"](around:90000,${lat},${lon});
     node["natural"="volcano"]["ele"](around:90000,${lat},${lon}););
    out;`;
  const d = await overpass(q);
  // Distinguish upstream failure (overpass() returns null) from a legitimate
  // empty result. Zero peaks within 90 km is the correct answer for coastal
  // plain / prairie cities — 0% occupancy, not null.
  if (!d) return null;
  if (!d.elements?.length) return { peaks: [], occupancyPct: 0, asOf: stamp };

  const e0 = (await elevations([[lat, lon]]))[0];
  if (e0 == null) return null;

  let cands = d.elements
    .map((e) => ({ name: e.tags?.name || null, ele: +e.tags.ele, lat: e.lat, lon: e.lon }))
    .filter((p) => Number.isFinite(p.ele) && p.name);
  for (const p of cands) {
    p.dist_m = Math.round(haversine(lat, lon, p.lat, p.lon));
    p.az = Math.round(bearingDeg(lat, lon, p.lat, p.lon));
    p.angle = ang(p.ele, e0, p.dist_m);
  }
  // Pre-filter to plausible skyline (rises >1.5°, beyond the core) and cap the
  // occlusion checks to the strongest candidates to bound API calls.
  cands = cands.filter((p) => p.angle > 1.5 && p.dist_m > 800).sort((a, b) => b.angle - a.angle).slice(0, 16);

  const visible = [];
  for (const p of cands) {
    const samples = [];
    for (let f = 0.18; f < 0.93; f += 0.15) samples.push([lat + (p.lat - lat) * f, lon + (p.lon - lon) * f]);
    const es = await elevations(samples);
    let blocked = false;
    for (let i = 0; i < samples.length; i++) {
      const di = p.dist_m * (0.18 + 0.15 * i);
      if (es[i] == null) continue;
      if (ang(es[i], e0, di) > p.angle + 0.3) { blocked = true; break; }
    }
    if (!blocked) visible.push(p);
  }
  visible.sort((a, b) => b.angle - a.angle);

  // Horizon occupancy: share of the 16 compass sectors holding a visible peak
  // that rises at least 2° — "how surrounded by mountains you are."
  const sectors = new Set(visible.filter((p) => p.angle >= 2).map((p) => Math.round(p.az / 22.5) % 16));
  const occupancyPct = Math.round((sectors.size / 16) * 100);

  const peaks = visible.slice(0, 8).map((p) => ({
    name: p.name, ele: p.ele, dist_m: p.dist_m, az: p.az, dir: compassOf(p.az),
    angle: Math.round(p.angle * 10) / 10, lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5),
  }));
  return { peaks, occupancyPct, asOf: stamp };
}

// Building coverage (Fabric): footprint area / core area, from OSM building
// polygons within the core. Local equirectangular projection + shoelace.
export async function measureBuildingCoverage(lat, lon) {
  const q = `[out:json][timeout:60];way["building"](around:${RADIUS},${lat},${lon});out geom;`;
  const d = await overpass(q);
  if (!d) return {};
  const lat0 = lat * Math.PI / 180;
  const mPerDegLat = 110540, mPerDegLon = 111320 * Math.cos(lat0);
  let sum = 0;
  for (const w of d.elements) {
    const g = w.geometry; if (!g || g.length < 3) continue;
    let a = 0;
    for (let i = 0; i < g.length; i++) {
      const j = (i + 1) % g.length;
      const xi = g[i].lon * mPerDegLon, yi = g[i].lat * mPerDegLat;
      const xj = g[j].lon * mPerDegLon, yj = g[j].lat * mPerDegLat;
      a += xi * yj - xj * yi;
    }
    sum += Math.abs(a) / 2;
  }
  const coreArea = Math.PI * RADIUS * RADIUS;
  return { bldg_coverage: { value: Math.min(1, Math.round((sum / coreArea) * 1000) / 1000) } };
}

// ONE city → ONE score. Computed transiently for /api/measure's response
// toast — NOT persisted. The runtime recomputes via weightedAxisScore in
// planner-data.js on every render, so a stored scalar would just lag behind
// measured_metrics (and the Calibrate page applies learned per-axis weights
// on top of the same rollups, so a single stored number can't match every
// view anyway). Equal weights here for the toast's quick "is it better"
// signal; the live UI applies whatever weights are active.
import { weightedAxisScore } from "./planner-data.js";
const EQUAL_WEIGHTS = { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 };
export function composite(raw) {
  const measuredMetrics = {};
  for (const [k, v] of Object.entries(raw || {})) if (v != null) measuredMetrics[k] = { value: v };
  return weightedAxisScore({ measuredMetrics }, EQUAL_WEIGHTS);
}

// THE ROUTINE: measure everything around a center. Returns raw values, the
// taxonomy-shaped {key:{value,asOf}} metrics, and the composite.
//
// When `boundary` is provided, the measurement is taken at the densest 700 m
// social-POI cluster INSIDE the boundary (via findVisitCenters) — so the
// composite score reflects "the best stay-zone-internal 700 m," not "700 m
// around whichever pin happened to be saved." Returns `center: {lat,lon}` so
// callers can persist where the measurement was actually taken.
export async function measureAround(lat, lon, { asOf, boundary = null } = {}) {
  const stamp = asOf || new Date().toISOString().slice(0, 10);
  let cLat = lat, cLon = lon, drift = 0, clusterN = null;
  if (boundary) {
    const [best] = await findVisitCenters(lat, lon, { max: 1, boundary });
    if (best && pointInGeoJSON(best.lat, best.lon, boundary)) {
      cLat = best.lat; cLon = best.lon;
      drift = best.moved || 0;
      clusterN = best.n;
    }
  }
  // Run the three independent fetches concurrently — wall-clock ≈ slowest one.
  const [rel, osm, water] = await Promise.all([relief(cLat, cLon), osmMetrics(cLat, cLon), nearestWater(cLat, cLon)]);
  const raw = {
    relief_std_m: rel.std, relief_range_m: rel.range, water_dist_m: water.dist,
    cafe_n: osm.cafe_n, bar_n: osm.bar_n, rest_n: osm.rest_n,
    intersection_den: osm.intersection_den, mean_block_m: osm.mean_block_m,
    carfree_frac: osm.carfree_frac, street_km: osm.street_km, daily_needs_n: osm.daily_needs_n,
  };
  raw.water_extent_km2 = water.extentKm2;
  const metrics = {};
  for (const [k, v] of Object.entries(raw)) if (v != null) metrics[k] = { value: v, asOf: stamp };
  // Stash the nearest-water point on its metric so the map can draw the line.
  if (metrics.water_dist_m && water.point) metrics.water_dist_m.point = water.point;
  if (metrics.water_extent_km2) metrics.water_extent_km2.source = "OpenStreetMap (Overpass)";
  return {
    raw, metrics, measured: composite(raw), asOf: stamp,
    center: { lat: cLat, lon: cLon },
    drift, clusterN,
  };
}
