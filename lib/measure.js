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

// LOCAL OVERPASS ONLY. Do not add public-mirror fallbacks here.
//
// We run a full Overpass Docker instance on localhost:12345 (the planet file is
// already downloaded). It is faster than every public mirror, has no rate
// limit, and — critically — does not silently truncate or 429 large queries
// the way the volunteer mirrors do. Public mirrors were the source of multiple
// "zero everything" bugs (Bled/Ljubljana/Piran on 2026-06-04; the 2026-06-05
// new-city audit). The policy is: if local is down, the measurement fails
// loudly. We do NOT degrade onto a public endpoint.
//
// OVERPASS_URL overrides the default if you point it somewhere else; default
// is the local Docker URL. There are no public fallbacks.
const OVERPASS_URL = process.env.OVERPASS_URL || "http://localhost:12345/api/interpreter";
let warnedNoLocal = false;
export async function overpass(query) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (r.status === 429 || r.status === 504) { await sleep(6000); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      if (!warnedNoLocal && /ECONNREFUSED|fetch failed/i.test(String(e))) {
        warnedNoLocal = true;
        console.error(`\n  !! Overpass at ${OVERPASS_URL} unreachable. Start the local Docker instance — DO NOT fall back to a public mirror. !!\n`);
      }
      await sleep(2000);
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
//
// `landFraction` (0–1) is used to clip the disk area for density metrics that
// depend on a fair denominator (intersection_den). Peninsula / lakeside cores
// would otherwise be punished for the share of their 700 m disk that's water.
// Defaults to 1.0 (full disk) so existing callers keep working unchanged.
export async function osmMetrics(lat, lon, { landFraction = 1.0 } = {}) {
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
  // Overpass sometimes returns 200 OK with a `remark` field indicating that
  // the query timed out, exceeded memory, or otherwise produced a degraded
  // result. The body may be partially populated or fully empty. Either way,
  // treat as a failure rather than letting zeros poison the DB. (This is the
  // bug that produced cafe_n=0, street_km=0 etc. for Bled / Ljubljana / Piran
  // on 2026-06-04 even though those cores are dense with amenities.)
  if (d.remark && /timeout|killed|memory|empty|runtime|out of|exceeded/i.test(d.remark)) {
    return {};
  }
  const out = {};
  let cafe = 0, rest = 0, bar = 0, daily = 0;
  for (const el of d.elements || []) {
    if (el.type === "way" && el.geometry) continue;
    const a = el.tags?.amenity, s = el.tags?.shop, cu = el.tags?.cuisine || "";
    const isCafe = a === "cafe" || s === "coffee" || s === "tea" || /coffee/.test(cu);
    if (isCafe) cafe++;
    else if (a === "restaurant" || a === "fast_food" || a === "food_court") rest++;
    else if (a === "bar" || a === "pub" || a === "biergarten") bar++;
    if (["bakery", "pastry", "deli", "greengrocer", "supermarket", "convenience", "butcher"].includes(s) || a === "pharmacy") daily++;
  }
  out.cafe_n = cafe; out.rest_n = rest; out.bar_n = bar; out.daily_needs_n = daily;
  const ways = (d.elements || []).filter((e) => e.type === "way" && e.geometry);
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
  const fullAreaKm2 = Math.PI * (RADIUS / 1000) ** 2;
  const landAreaKm2 = Math.max(0.05, landFraction) * fullAreaKm2;
  out.street_km = Math.round(total / 10) / 100;
  out.mean_block_m = lengths.length ? Math.round(total / lengths.length) : null;
  out.carfree_frac = total ? Math.round((carfree / total) * 1000) / 1000 : null;
  out.intersection_den = Math.round(([...nodeUse.values()].filter((c) => c >= 3).length / landAreaKm2) * 10) / 10;
  // Final sanity check: every real urban / suburban core has *some* streets in
  // 700 m. A street_km of exactly 0 means the highway portion of the query
  // returned nothing — usually because the response was silently truncated.
  // Don't write the bogus zeros; let the caller preserve the previous value
  // (or leave the field null until a clean retry).
  if (out.street_km === 0) return {};
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

// Stitch a multipolygon relation's member ways (line segments, possibly in any
// order or orientation) into closed rings by chaining at shared endpoints.
// Returns an array of rings, each an array of {lat,lon} where first === last.
// Big lakes (Champlain, Erie, Lake Bled, Narragansett Bay…) are encoded in
// OSM as relations whose outer boundary spans multiple ways; no single member
// is a closed ring on its own. Pre-stitching is required before any area or
// containment calculation against the polygon's boundary.
function assembleRings(members) {
  const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const segs = (members || [])
    .filter((m) => m.geometry && m.geometry.length >= 2)
    .map((m) => ({ pts: m.geometry, used: false }));
  const rings = [];
  for (const start of segs) {
    if (start.used) continue;
    start.used = true;
    const ring = [...start.pts];
    const startKey = key(ring[0]);
    let endKey = key(ring[ring.length - 1]);
    let safety = segs.length + 4;
    while (endKey !== startKey && safety-- > 0) {
      let next = null, reversed = false;
      for (const s of segs) {
        if (s.used) continue;
        if (key(s.pts[0]) === endKey) { next = s; reversed = false; break; }
        if (key(s.pts[s.pts.length - 1]) === endKey) { next = s; reversed = true; break; }
      }
      if (!next) break;
      next.used = true;
      const seq = reversed ? next.pts.slice().reverse() : next.pts;
      for (let i = 1; i < seq.length; i++) ring.push(seq[i]);
      endKey = key(ring[ring.length - 1]);
    }
    if (endKey === startKey && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

// Total m² of a water multipolygon: assembled outer rings minus inner rings.
// Replaces the per-member shoelace sum that silently returned 0 for any
// multipolygon whose outer boundary spans multiple non-closed ways.
function multipolygonAreaM2(el) {
  if (!el?.members) return 0;
  const outers = el.members.filter((m) => m.geometry && m.role !== "inner");
  const inners = el.members.filter((m) => m.geometry && m.role === "inner");
  const sum = (rings) => rings.reduce((s, r) => s + ringAreaM2(r), 0);
  return Math.max(0, sum(assembleRings(outers)) - sum(assembleRings(inners)));
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
     way["waterway"="stream"]["name"](around:${r},${lat},${lon});
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
    const nat = el.tags?.natural, ww = el.tags?.waterway, wt = el.tags?.water, nm = el.tags?.name;
    const isSea = nat === "coastline" || nat === "bay" || nat === "strait";
    const isRiver = ww === "river" || ww === "riverbank" || wt === "river" ||
                    (ww === "stream" && nm && STREAMS_AS_RIVERS.has(nm));
    const always = isSea || isRiver;
    if (el.members) {
      // multipolygonAreaM2 stitches multi-way outer/inner rings so large
      // lakes (Champlain, Erie, Bled, Narragansett Bay) don't get rejected
      // when their boundary spans several ways.
      const area = multipolygonAreaM2(el);
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

// Point-in-polygon (ray-casting) on a closed ring in the local equirectangular
// projection. Ring vertices are {lat, lon} objects, and px/py are already
// projected metres from the local origin. Used by landFractionInDisk.
function pointInRingProjected(px, py, ring, mPerDegLat, mPerDegLon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lon * mPerDegLon, yi = ring[i].lat * mPerDegLat;
    const xj = ring[j].lon * mPerDegLon, yj = ring[j].lat * mPerDegLat;
    const intersect = ((yi > py) !== (yj > py)) &&
                      (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Land area as a fraction (0–1) of a 700 m disk around (lat, lon).
//
// Why this exists: bldg_coverage and intersection_den both divide by the disk
// area. On peninsula / coastal / lakeside cores (Piran, Bled, Rovinj, Annapolis)
// half the disk is water — the buildings and intersections only exist on the
// land portion. Treating the whole disk as the denominator systematically
// underrates dense old towns whose geography is half sea.
//
// Method: query OSM for major-water features in a slightly extended disk
// (so coastline ways that cross the boundary are captured), sample a polar
// grid inside the actual disk, and classify each sample:
//   1. Inside any closed water polygon (lake, bay, riverbank multipolygon)? → water.
//   2. Else, on the sea side of the nearest coastline segment? → water.
//      OSM convention: walking a coastline way in its node order, the sea is
//      on the RIGHT. A negative cross-product (segment_dir × (sample - segment_start))
//      means the sample is on the right (sea) side.
//   3. Otherwise → land.
//
// Returns 1.0 (no water in disk) on any failure, so missing the helper can't
// make fabric scores WORSE than the pre-clip baseline — only better when it works.
export async function landFractionInDisk(lat, lon, radiusM = RADIUS) {
  // Extended radius so coastline ways crossing the disk boundary are captured.
  const d = await overpass(waterQuery(lat, lon, Math.round(radiusM * 1.5)));
  if (!d) return 1.0;
  const lat0 = lat * Math.PI / 180;
  const mPerDegLat = 110540, mPerDegLon = 111320 * Math.cos(lat0);
  const cx = lon * mPerDegLon, cy = lat * mPerDegLat;

  // Collect closed water polygons (lake/bay/riverbank). Multipolygon relations
  // are assembled via the existing ring stitcher; standalone closed ways too.
  const polys = [];
  // Collect coastline segments as projected line segments for sea-side test.
  const coastSegs = [];

  for (const el of d.elements || []) {
    const nat = el.tags?.natural, ww = el.tags?.waterway, wt = el.tags?.water, nm = el.tags?.name;
    const isCoast = nat === "coastline";
    const isClosedWaterTag = nat === "water" || nat === "bay" || nat === "strait" ||
                              ww === "riverbank" || wt === "river" ||
                              (ww === "river" && el.geometry && el.geometry.length >= 4);
    if (isCoast) {
      const g = el.geometry; if (!g) continue;
      for (let i = 1; i < g.length; i++) {
        coastSegs.push({
          x0: g[i - 1].lon * mPerDegLon, y0: g[i - 1].lat * mPerDegLat,
          x1: g[i].lon * mPerDegLon,     y1: g[i].lat * mPerDegLat,
        });
      }
      continue;
    }
    if (!isClosedWaterTag) continue;
    if (el.members) {
      const outers = el.members.filter((m) => m.geometry && m.role !== "inner");
      const inners = el.members.filter((m) => m.geometry && m.role === "inner");
      for (const r of assembleRings(outers)) polys.push({ ring: r, hole: false });
      for (const r of assembleRings(inners)) polys.push({ ring: r, hole: true });
    } else if (el.geometry && el.geometry.length >= 3) {
      // Closed standalone way (lake polygon, etc).
      polys.push({ ring: el.geometry, hole: false });
    }
  }

  // Polar grid: 16 rings × 32 angles = 512 samples + center. Uniform area-
  // weighted because we use sqrt(t) for the radial step.
  const RINGS = 16, ANGLES = 32;
  let landCount = 0, total = 0;
  const classify = (sx, sy) => {
    // 1. Hole-respecting point-in-polygon over all water polygons.
    let inWater = false;
    for (const p of polys) {
      if (pointInRingProjected(sx, sy, p.ring, mPerDegLat, mPerDegLon)) {
        inWater = !p.hole ? true : false; // inside outer → water; inside hole → land
      }
    }
    if (inWater) return false; // water
    // 2. Sea-side test against nearest coastline segment.
    if (coastSegs.length === 0) return true; // no coastline → land
    let bestD2 = Infinity, bestSide = 0;
    for (const s of coastSegs) {
      const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((sx - s.x0) * dx + (sy - s.y0) * dy) / len2));
      const px = s.x0 + t * dx, py = s.y0 + t * dy;
      const d2 = (sx - px) ** 2 + (sy - py) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        // Cross product: positive = left (land), negative = right (sea).
        bestSide = dx * (sy - s.y0) - dy * (sx - s.x0);
      }
    }
    return bestSide >= 0; // left/on the line → land
  };

  // Center sample
  if (classify(cx, cy)) landCount++;
  total++;
  for (let i = 1; i <= RINGS; i++) {
    const rNorm = Math.sqrt(i / RINGS); // area-uniform
    const r = rNorm * radiusM;
    for (let j = 0; j < ANGLES; j++) {
      const theta = (j / ANGLES) * 2 * Math.PI;
      const sx = cx + r * Math.cos(theta);
      const sy = cy + r * Math.sin(theta);
      if (classify(sx, sy)) landCount++;
      total++;
    }
  }
  // Floor at 5% — if a measurement says the core is essentially all water,
  // it's almost certainly a misclassification (we never measure POIs in the
  // open ocean), and dividing by ~0 would explode the score.
  return Math.max(0.05, landCount / total);
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
  const candidates = [];
  // Grandeur aggregation: seas and lakes take MAX (one Pacific is enough;
  // counting two nearby ponds twice would be silly). Major rivers within
  // ~1 km SUM, because at a confluence the visible water surface really
  // does add up — Pittsburgh's Point sees the Allegheny + Monongahela +
  // Ohio at once, and that's a categorically different view from any
  // single-river riverfront.
  let seaMax = 0, riverSum = 0;
  for (const b of bodies) {
    const r = minDistToVerts(lat, lon, b.verts);
    if (r.dist == null) continue;
    candidates.push({ ...r, body: b });
    const isConfluentMajor = b.kind === "river" && b.name && MAJOR_RIVERS.has(b.name) && r.dist <= 1000;
    if (isConfluentMajor) {
      riverSum += bodyGrandeurKm2(b, r.dist);
    } else if (r.dist <= 4000) {
      seaMax = Math.max(seaMax, bodyGrandeurKm2(b, r.dist));
    }
  }
  // Display value is capped at the sea ceiling so a four-river city can't
  // out-score the Pacific in raw km² (score saturates at 25 either way).
  const grand = Math.min(SEA_GRANDEUR_CAP_KM2, Math.max(seaMax, riverSum));
  if (!candidates.length) return { dist: null, point: null, extentKm2: null, kind: null, name: null };

  // Pure nearest-edge picks ornamental ponds and tiny named creeks over the
  // actual river/lake/sea a city is built on (Richmond/Carytown → Swan Lake
  // instead of the James; Knoxville → First Creek instead of the Tennessee).
  // Pick the nearest, then promote a "major" body if one is close enough.
  //
  // "Major" is defined by ACTUAL polygon area, not by kind. A named stream
  // with zero polygon area isn't major even though its kind is "river"; the
  // James River with a 4 km² riverbank polygon is major regardless of name.
  // Seas (ocean / bay / strait) are always major.
  const nearest = candidates.reduce((a, c) => (c.dist < a.dist ? c : a));
  // "Major" body — qualified for promotion past a tiny nearest. Three ways:
  //   1) Sea (ocean / bay / strait) — always major.
  //   2) River with ≥ 0.1 km² polygon area (real riverbank, not centerline).
  //   3) River whose NAME is in MAJOR_RIVERS (e.g. Allegheny / James / French
  //      Broad) — many major rivers are mapped as centerlines only and have
  //      zero polygon area; the name-list catches them.
  //   4) Lake with ≥ 1 km² polygon area.
  const isMajor = (b) =>
    b.kind === "sea" ||
    (b.kind === "river" && ((b.areaM2 || 0) >= 100_000 || (b.name && MAJOR_RIVERS.has(b.name)))) ||
    (b.kind === "lake"  && (b.areaM2 || 0) >= 1_000_000);
  // Score for picking among multiple majors. Seas score huge by default;
  // named-major rivers without polygon area still score above the 100K
  // qualifier; everything else scores by raw polygon area. We pick the
  // highest-scoring major because Buffalo's Lake Erie should beat a creek
  // with a 0.5 km² polygon even when the creek is a bit closer.
  const majorScore = (b) => {
    if (b.kind === "sea") return 1e12;
    // Named-major-river floor (50 km²) keeps the Mon from losing to a random
    // 16 km² tributary polygon (OSM tags some downstream water near Pittsburgh
    // as "Peters Creek" with a sizeable polygon). The Mon's own polygon area
    // at any given segment is often much smaller than that local tributary,
    // but it's still the city's river. Lake Erie (25 600 km²) still wins
    // when it's the right answer because its raw area is far above this floor.
    if (b.kind === "river" && b.name && MAJOR_RIVERS.has(b.name)) return Math.max(b.areaM2 || 0, 50_000_000);
    return b.areaM2 || 0;
  };
  // If the nearest body is itself major, keep it. Otherwise look for the
  // largest-scoring major within max(3 km, 2× nearest's edge). 3 km is the
  // "still arguably the city's water" radius — beyond that, defining-water
  // claims get implausible.
  const promoteReach = Math.max(3000, nearest.dist * 2);
  const promoted = isMajor(nearest.body)
    ? null
    : candidates
        .filter((c) => c !== nearest && isMajor(c.body) && c.dist <= promoteReach)
        .reduce((a, c) => (!a || majorScore(c.body) > majorScore(a.body) ? c : a), null);
  const best = promoted || nearest;

  // Surface body kind + name so chip rules can distinguish coast/river/lake/bay.
  return {
    dist: best.dist,
    point: best.point,
    extentKm2: grand || bodyGrandeurKm2(best.body, best.dist),
    kind: best.body.kind,            // "sea" | "river" | "lake" | "canal"
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
//  • canals — grouped by name; surfaced as their own kind so a working canal
//    (Lewes-Rehoboth, Erie Canal) doesn't get filed as a lake by accident
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
  // For SINGLE-WAY water polygons (no relation, geometry on the way itself)
  // require a properly closed ring before crediting area. Riverbank lines
  // and the like — open by definition — contribute 0; isRiver/isSea handle
  // those separately. Multi-way relations go through multipolygonAreaM2.
  const closedRingArea = (g) => (g && g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon ? ringAreaM2(g) : 0);
  for (const el of elements || []) {
    const nat = el.tags?.natural, ww = el.tags?.waterway, wt = el.tags?.water, name = el.tags?.name || null;
    const isSea = nat === "coastline" || nat === "bay" || nat === "strait";
    // Most `waterway=stream` features are genuinely small — upgrading them
    // all to river-class would let First Creek out-rank the Tennessee, etc.
    // STREAMS_AS_RIVERS is a TIGHT allowlist of the rare cases where the
    // local "creek" really is the city's defining water and OSM happens to
    // tag it as a stream (Boulder Creek, Lewis Creek).
    const isRiver = ww === "river" || ww === "riverbank" || wt === "river" ||
                    (ww === "stream" && name && STREAMS_AS_RIVERS.has(name));
    const isCanal = ww === "canal" || wt === "canal";
    // The OPEN line tag — these are centerlines we can sample perpendicular to.
    // Closed rings (water polygons) shouldn't be treated as centerlines.
    const isLineCenterline = ww === "river"; // waterway=river ways are centerlines
    let verts = [], elArea = 0, centerline = null;
    if (el.members) {
      // multipolygonAreaM2 stitches multi-way outer/inner rings — proper
      // area math for big lakes/bays encoded as multipolygon relations.
      const area = multipolygonAreaM2(el);
      if (isSea || isRiver || isCanal || area >= MIN_WATER_AREA_M2) { for (const m of el.members) if (m.geometry) verts.push(...m.geometry); elArea = area; }
    } else if (el.geometry) {
      const a = closedRingArea(el.geometry);
      if (isSea || isRiver || isCanal || a >= MIN_WATER_AREA_M2) {
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
    else if (isCanal) push(`canal:${name || el.type + el.id}`, name, "canal", verts, elArea, false, null);
    else push(`lake:${name || el.type + el.id}`, name, "lake", verts, elArea, false, null);
  }
  for (const b of bodies.values()) {
    if (!b.name) b.name = b.kind === "sea" ? "Ocean / coast" : b.kind === "river" ? "Unnamed river" : b.kind === "canal" ? "Unnamed canal" : "Unnamed lake";
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
// Sea ceiling — defensive only, not a scoring lever. The score saturates at
// 25 km² (see `water_extent_km2` range in lib/planner-data.js), so any sea
// already scores 10/10; this cap just keeps the displayed value sane.
const SEA_GRANDEUR_CAP_KM2 = 500;
// Floor for the MAJOR_RIVERS safety net. Lower than the sea cap on purpose:
// a 300m-wide working river is not equivalent to the Adriatic. 5 km² lands
// a single major-river city at ~1.7/10 on grandeur — a real but modest
// signal. The Allegheny is not the Mississippi. Confluences (the Point at
// Pittsburgh) recover their grandeur by summing across nearby rivers — see
// nearestWater. Polygon-measured rivers larger than this floor keep their
// real area.
const RIVER_FLOOR_KM2 = 5;
// Backwards-compat alias used elsewhere in this file.
const WATER_CAP_KM2 = SEA_GRANDEUR_CAP_KM2;
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

// Streams (OSM tag waterway=stream) that locals know as a city's defining
// water and should be promoted to river-class for ranking. Kept TIGHT — most
// waterway=stream features genuinely are streams. Add a name here only when
// it's verifiably the answer to "what's the water of <city>" and OSM has
// tagged it as stream rather than river.
const STREAMS_AS_RIVERS = new Set([
  "Boulder Creek", // Boulder, CO — runs through downtown; OSM tags as stream
  "Lewis Creek",   // Staunton, VA — runs through downtown
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
  if (b.isSea) return SEA_GRANDEUR_CAP_KM2;
  const polygonKm2 = b.areaM2 / 1e6;
  const elevKm2 = b.elevWidthKm2 || 0;
  let grandeur = Math.max(polygonKm2, elevKm2);
  // Safety net: a named-major river within 2 km gets a modest floor (not the
  // sea cap) when polygon + elev-width both fail to register a real channel
  // (OSM data gap). Caller separately handles confluences by summing across
  // multiple nearby major rivers — see nearestWater.
  if (grandeur < RIVER_FLOOR_KM2 && b.name && MAJOR_RIVERS.has(b.name) && (nearestDistM == null || nearestDistM <= 2000)) {
    grandeur = RIVER_FLOOR_KM2;
  }
  return Math.min(SEA_GRANDEUR_CAP_KM2, Math.round(grandeur * 10) / 10);
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

// City-wide total population from Census ACS, with a documented 3-tier
// fallback so cross-city per-capita comparisons stay legible. NOT the
// tract-level B01003 that measureCensus uses for core_density — that's the
// wrong unit (a Pittsburgh tract is ~5k people; the city is 302k). Returns
// { population, source } or { population: null, source: null }.
//
// Tiers (source string records which fired):
//   1. Incorporated Place / CDP — tightest fit for most US cities.
//   2. County subdivision — RI only (FIPS 44), where towns ARE the primary
//      subdivision and Census Places barely exist. Other states' cousubs
//      span far more than a village, so we don't fall through to them.
//   3. ZCTA (postal ZIP boundary) — last resort for unincorporated areas
//      with no Place (e.g. Deep Creek Lake / McHenry MD). Queried against
//      TIGERweb because the geocoder's Current_Current vintage omits ZCTA.
export async function measurePlacePopulation(lat, lon, apiKey) {
  const GEO = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";
  const ACS = "https://api.census.gov/data/2023/acs/acs5";
  const common = `x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const j = async (url) => {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      const t = await r.text();
      return t.trim().startsWith("<") ? null : JSON.parse(t);
    } catch { return null; }
  };
  const popOf = (a) => {
    const n = a && a.length >= 2 ? Number(a[1][0]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // Tier 1: Place (Incorporated or CDP)
  let g = await j(`${GEO}?${common}&layers=${encodeURIComponent("Incorporated Places,Census Designated Places")}`);
  let geos = g?.result?.geographies || {};
  let feat = geos["Incorporated Places"]?.[0] || geos["Census Designated Places"]?.[0];
  if (feat) {
    const { STATE: s, PLACE: p, NAME: name } = feat;
    const pop = popOf(await j(`${ACS}?get=B01003_001E&for=place:${p}&in=state:${s}&key=${apiKey}`));
    if (pop) return { population: pop, source: `census_acs5_2023_place_b01003:${s}${p}:${name}` };
  }

  // Tier 2: RI county subdivision (state FIPS 44)
  g = await j(`${GEO}?${common}&layers=${encodeURIComponent("County Subdivisions")}`);
  feat = g?.result?.geographies?.["County Subdivisions"]?.[0];
  if (feat && feat.STATE === "44") {
    const { STATE: s, COUNTY: c, COUSUB: cs, NAME: name } = feat;
    const pop = popOf(await j(`${ACS}?get=B01003_001E&for=${encodeURIComponent("county subdivision:" + cs)}&in=${encodeURIComponent("state:" + s + " county:" + c)}&key=${apiKey}`));
    if (pop) return { population: pop, source: `census_acs5_2023_cousub_b01003:${s}${c}${cs}:${name} (RI uses towns; no Place)` };
  }

  // Tier 3: ZCTA via TIGERweb point query
  const z = await j(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/11/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=ZCTA5&returnGeometry=false&f=json`);
  const zcta = z?.features?.[0]?.attributes?.ZCTA5;
  if (zcta) {
    const pop = popOf(await j(`${ACS}?get=B01003_001E&for=${encodeURIComponent("zip code tabulation area:" + zcta)}&key=${apiKey}`));
    if (pop) return { population: pop, source: `census_acs5_2023_zcta_b01003:${zcta}:ZCTA5 ${zcta} (no Place — ZCTA fallback)` };
  }

  return { population: null, source: null };
}

// Walk Score's documented coverage is the US, Canada, Australia, and New
// Zealand (walkscore.com/methodology.shtml — "the 50 largest U.S. cities" plus
// the international partners). OUTSIDE those countries the API still returns a
// number, but it's computed against sparse OSM data and is effectively noise:
// Piran — a fully car-free Adriatic old town — scored 39 (car-dependent),
// because the 30-minute walk radius Walk Score scans is half open sea, so it
// "finds no amenities" in most directions. We must not feed that number into
// the Aliveness rollup; for out-of-coverage cities we compute a synthetic
// proxy from the OSM signals we already measure (see syntheticWalkScore).
const WALKSCORE_BBOXES = [
  // [minLon, minLat, maxLon, maxLat]
  [-180, 18, -66, 72],   // USA (CONUS + Alaska + Hawaii, generous)
  [-141, 41, -52, 84],   // Canada
  [112, -44, 154, -10],  // Australia
  [166, -47, 179, -34],  // New Zealand
];
export function inWalkScoreCoverage(lat, lon) {
  return WALKSCORE_BBOXES.some(([x0, y0, x1, y1]) => lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1);
}

// A Walk Score-style 0–100 computed from the OSM signals we already measure,
// for cities outside Walk Score's coverage. Modeled on Walk Score's published
// methodology: amenity richness within walking distance, plus a pedestrian-
// friendliness bonus from block length and intersection density.
//
//   Amenity richness (0–60): saturating in the count of social + daily-needs
//     POIs in the 700 m core. exp saturation so a genuine high street tops out
//     rather than running away (Ljubljana's 360 POIs ≈ Piran's 65 — both are
//     unambiguous "everything's a short walk away").
//   Grid (0–25): mean of the intersection-density and block-length scores
//     (reuses the Fabric metric bands), the "fine connected grid" half of
//     Walk Score's pedestrian-friendliness term.
//   Pedestrianization (0–15): car-free street share.
//
// Calibrated against the real Walk Scores we trust for nearby in-coverage
// cities: this proxy lands Ljubljana ≈ 100 (real 97), and gives Piran ≈ 98 —
// the walker's paradise it obviously is, vs the API's nonsensical 39.
export function syntheticWalkScore({ cafe_n = 0, bar_n = 0, rest_n = 0, daily_needs_n = 0,
                                     intersection_den = null, mean_block_m = null, carfree_frac = null } = {}) {
  const band = (v, zeroAt, fullAt) => v == null ? null
    : Math.max(0, Math.min(1, (v - zeroAt) / (fullAt - zeroAt)));
  const totalPOI = (cafe_n || 0) + (bar_n || 0) + (rest_n || 0) + (daily_needs_n || 0);
  const amenity = 60 * (1 - Math.exp(-totalPOI / 20));
  const idn = band(intersection_den, 30, 150);   // same band as the Fabric metric
  const blk = band(mean_block_m, 180, 70);        // shorter block → higher
  const gridParts = [idn, blk].filter((x) => x != null);
  const grid = gridParts.length ? 25 * (gridParts.reduce((a, b) => a + b, 0) / gridParts.length) : 0;
  const ped = carfree_frac == null ? 0 : 15 * band(carfree_frac, 0, 0.25);
  return Math.round(Math.max(0, Math.min(100, amenity + grid + ped)));
}

// Walk Score (0–100) for a point. Their API needs an address alongside
// lat/lon; the city name suffices. status 1 = success.
//
// Coverage-gated: outside the US/CA/AU/NZ bboxes we do NOT call the API (its
// out-of-coverage numbers are noise — see WALKSCORE_BBOXES). The caller is
// expected to fall back to syntheticWalkScore for those cities; we signal that
// with { outOfCoverage: true } so it can branch without re-deriving geography.
export async function measureWalkScore(lat, lon, address, apiKey, { asOf } = {}) {
  const stamp = asOf || new Date().toISOString().slice(0, 10);
  if (!inWalkScoreCoverage(lat, lon)) return { outOfCoverage: true };
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
    const params = "T2M_MAX,T2M_MIN,T2M,PRECTOTCORR,T2MDEW,ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN,WS10M";
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
        hi: 0, lo: 0, mean: 0, dew: 0, felt: 0,
        n: 0, nMean: 0, nDew: 0, nFelt: 0, wet: 0, day: 0, nDay: 0,
        precipMm: 0,
      }));
      // Per-day "felt high" in °F — the daytime-high temperature corrected
      // for what it actually feels like:
      //   • heat index (NWS Rothfusz on T + RH via Magnus/dewpoint) when
      //     T ≥ 80°F and RH ≥ 40% — humid summer feels hotter than the
      //     thermometer reads.
      //   • wind chill (NWS 2001 formula on T + WS10M) when T ≤ 50°F and
      //     wind ≥ 3 mph — windy winter feels colder than the thermometer
      //     reads. WS10M is m/s in POWER; convert to mph for the formula.
      //   • otherwise the dry air temp.
      // Averaged daily over the month so the chart's "Feels" row pairs
      // cleanly against the daily-max "High" row.
      const feltHighF = (tcMax, tdC, ws10mps) => {
        if (tcMax == null) return null;
        const tF = tcMax * 9 / 5 + 32;
        // Heat index branch
        if (tF >= 80 && tdC != null) {
          const a = 17.625, b = 243.04;
          const es = Math.exp((a * tcMax) / (b + tcMax));
          const ed = Math.exp((a * tdC)   / (b + tdC));
          const rh = Math.max(0, Math.min(100, 100 * ed / es));
          if (rh >= 40) {
            const T = tF, R = rh;
            let hi = -42.379 + 2.04901523*T + 10.14333127*R
                   - 0.22475541*T*R - 0.00683783*T*T - 0.05481717*R*R
                   + 0.00122874*T*T*R + 0.00085282*T*R*R - 0.00000199*T*T*R*R;
            if (R < 13 && T >= 80 && T <= 112) hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
            else if (R > 85 && T >= 80 && T <= 87) hi += ((R - 85) / 10) * ((87 - T) / 5);
            return hi;
          }
        }
        // Wind chill branch
        if (tF <= 50 && ws10mps != null) {
          const vMph = ws10mps * 2.236936;
          if (vMph >= 3) {
            const v16 = Math.pow(vMph, 0.16);
            return 35.74 + 0.6215 * tF - 35.75 * v16 + 0.4275 * tF * v16;
          }
        }
        return tF;
      };
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
        const ws = v(param.WS10M?.[date]);
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
        const felt = feltHighF(hi, dew, ws);
        if (felt != null) { mo[m].felt += felt; mo[m].nFelt += 1; }
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
        feltHigh: x.nFelt ? Math.round((x.felt / x.nFelt) * 10) / 10 : null,
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

  // 150 km radius catches distant ranges that genuinely shape the view from
  // a place — Piran's Julian Alps (~110 km) and the Italian Dolomites across
  // the Adriatic (~140 km NW), Bled's farthest peaks, the Cascades from
  // anywhere on the Olympic Peninsula. Local-foreground occlusion below
  // correctly hides ranges that are blocked from sight (so Pittsburgh's
  // distant Appalachians don't sneak in past the Mt. Washington bluff).
  const q = `[out:json][timeout:90];
    (node["natural"="peak"]["ele"](around:150000,${lat},${lon});
     node["natural"="volcano"]["ele"](around:150000,${lat},${lon}););
    out;`;
  const d = await overpass(q);
  // Distinguish upstream failure (overpass() returns null) from a legitimate
  // empty result. Zero peaks within 150 km is the correct answer for coastal
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
  // Pre-filter to plausible skyline (rises >0.5°, beyond the core), then pick
  // candidates in a way that preserves directional coverage: the top peak in
  // each 22.5° sector first, then fill with the next-highest overall up to a
  // hard cap on occlusion-test API calls. A pure top-N-by-angle cull blinds
  // the algorithm in alpine basins — Bled has 1,500+ eligible peaks spanning
  // 15 of 16 sectors, but the 16 steepest are all in the Karavanke cluster
  // 8-12 km NNE→ENE; the Julian Alps to the W/SW/S (Triglav, Krn — further
  // out, shallower angle) never get the chance to occlusion-test.
  //
  // 0.5° threshold = "distant ridge silhouette" (Piran sees the Julian Alps
  // at ~110 km presenting ~0.9° after earth-curvature correction; Karst at
  // 30 km at 1.7°). The previous 1.5°/2° threshold defined "looming backdrop"
  // and threw away distant ranges that genuinely shape a place's horizon.
  // Local-foreground occlusion below correctly kills blocked ridges.
  cands = cands.filter((p) => p.angle > 0.5 && p.dist_m > 800).sort((a, b) => b.angle - a.angle);
  const bySector = new Map();
  for (const p of cands) {
    const k = Math.round(p.az / 22.5) % 16;
    if (!bySector.has(k)) bySector.set(k, p);
  }
  const seeded = new Set(bySector.values());
  const CAP = 32;
  const fillers = cands.filter((p) => !seeded.has(p)).slice(0, Math.max(0, CAP - seeded.size));
  cands = [...seeded, ...fillers];

  // Occlusion test: march terrain along the bearing and reject the peak if a
  // closer ridge presents a higher angle. Sample DENSELY at near distances
  // (500 m → 3 km in fixed steps) AND at fractional points further out. The
  // earlier fractional-only sampling (0.18..0.93) missed close-foreground
  // bluffs — for a 30 km peak its first sample was at 5.4 km, so a 1.5 km
  // hill (Pittsburgh's Mt. Washington over the Strip District) never got
  // checked, and distant Appalachian ridges falsely registered as visible
  // from valley-floor neighborhoods.
  const visible = [];
  for (const p of cands) {
    const nearM = [500, 1000, 1500, 2000, 3000].filter((d) => d < p.dist_m * 0.9);
    const farFracs = [0.15, 0.3, 0.5, 0.7, 0.9].filter((f) => f * p.dist_m > (nearM[nearM.length - 1] || 0));
    const sampleDists = [...nearM, ...farFracs.map((f) => f * p.dist_m)];
    const samples = sampleDists.map((d) => {
      const f = d / p.dist_m;
      return [lat + (p.lat - lat) * f, lon + (p.lon - lon) * f];
    });
    const es = await elevations(samples);
    let blocked = false;
    for (let i = 0; i < samples.length; i++) {
      if (es[i] == null) continue;
      if (ang(es[i], e0, sampleDists[i]) > p.angle + 0.3) { blocked = true; break; }
    }
    if (!blocked) visible.push(p);
  }
  visible.sort((a, b) => b.angle - a.angle);

  // Horizon occupancy: share of the 16 compass sectors holding a visible peak
  // that rises at least 0.5° — "how much of the horizon is filled by mountain
  // silhouette." 0.5° is roughly what the human eye picks up as a distinct
  // ridge against open sky (a fingertip at arm's length subtends ~1°).
  const sectors = new Set(visible.filter((p) => p.angle >= 0.5).map((p) => Math.round(p.az / 22.5) % 16));
  const occupancyPct = Math.round((sectors.size / 16) * 100);

  // Keep up to 20 visible peaks for the panoramic horizon strip — one per
  // 22.5° sector first (so a place ringed by mountains shows mountains all
  // around the strip), then the next-strongest overall as fillers. A flat
  // top-8 cull put Bled's 8 strongest in a single Karavanke cluster N→NE
  // and made the panorama lie about coverage.
  const byPeakSector = new Map();
  for (const p of visible) {
    const k = Math.round(p.az / 22.5) % 16;
    if (!byPeakSector.has(k)) byPeakSector.set(k, p);
  }
  const peakSeed = new Set(byPeakSector.values());
  const peakFill = visible.filter((p) => !peakSeed.has(p)).slice(0, Math.max(0, 20 - peakSeed.size));
  const peaks = [...peakSeed, ...peakFill].map((p) => ({
    name: p.name, ele: p.ele, dist_m: p.dist_m, az: p.az, dir: compassOf(p.az),
    angle: Math.round(p.angle * 10) / 10, lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5),
  }));
  // The single steepest visible MOUNTAIN peak — surfaced so callers can
  // upgrade skyline_deg. Restricted to peaks rising ≥ MIN_BACKDROP_RISE_M
  // above the observer, the same floor measureSkyline applies to its terrain
  // rays. Without this guard, Pittsburgh's Herron Hill (134 m rise above
  // Lawrenceville, presenting 6°) becomes "the mountain backdrop" — exactly
  // the urban-bluff false positive the floor exists to prevent.
  const backdropPeaks = visible.filter((p) => p.ele - e0 >= MIN_BACKDROP_RISE_M);
  const bestVisibleAngle = backdropPeaks.length ? Math.round(backdropPeaks[0].angle * 10) / 10 : 0;
  return { peaks, occupancyPct, bestVisibleAngle, asOf: stamp };
}

// Building coverage (Fabric): footprint area / land area, from OSM building
// polygons within the 700 m core. Local equirectangular projection + shoelace.
//
// `landFraction` (0–1) shrinks the denominator to exclude water in the disk
// (Adriatic, Lake Bled, Chesapeake, etc.) so peninsula and lakeside cores
// aren't punished for the geographic accident of being half sea. Defaults to
// 1.0 so legacy callers keep their prior behavior; the routine caller in
// measureAround now computes and passes a real fraction.
export async function measureBuildingCoverage(lat, lon, { landFraction = 1.0 } = {}) {
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
  const landArea = Math.max(0.05, landFraction) * Math.PI * RADIUS * RADIUS;
  return { bldg_coverage: { value: Math.min(1, Math.round((sum / landArea) * 1000) / 1000) } };
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
  // Fetch the land-fraction first so the OSM-density metrics divide by land,
  // not the full disk. Then run the rest concurrently — wall-clock ≈ slowest.
  const landFraction = await landFractionInDisk(cLat, cLon);
  const [rel, osm, water, bldg] = await Promise.all([
    relief(cLat, cLon),
    osmMetrics(cLat, cLon, { landFraction }),
    nearestWater(cLat, cLon),
    measureBuildingCoverage(cLat, cLon, { landFraction }),
  ]);
  const raw = {
    relief_std_m: rel.std, relief_range_m: rel.range, water_dist_m: water.dist,
    cafe_n: osm.cafe_n, bar_n: osm.bar_n, rest_n: osm.rest_n,
    intersection_den: osm.intersection_den, mean_block_m: osm.mean_block_m,
    carfree_frac: osm.carfree_frac, street_km: osm.street_km, daily_needs_n: osm.daily_needs_n,
    bldg_coverage: bldg.bldg_coverage?.value,
  };
  raw.water_extent_km2 = water.extentKm2;
  const metrics = {};
  for (const [k, v] of Object.entries(raw)) if (v != null) metrics[k] = { value: v, asOf: stamp };
  // Stamp land fraction on the two metrics whose denominators it changed, so
  // the detail page can surface "measured against X% land area" later.
  for (const k of ["bldg_coverage", "intersection_den"]) {
    if (metrics[k]) metrics[k].landFraction = Math.round(landFraction * 1000) / 1000;
  }
  // Stash the nearest-water point on its metric so the map can draw the line.
  if (metrics.water_dist_m && water.point) metrics.water_dist_m.point = water.point;
  // Persist body kind ("sea" | "river" | "lake" | "canal") on water_dist_m so
  // settingScore can apply the coast bonus — a literal sea coast is a
  // categorically different setting from a lake or river.
  if (metrics.water_dist_m && water.kind) metrics.water_dist_m.kind = water.kind;
  if (metrics.water_extent_km2) metrics.water_extent_km2.source = "OpenStreetMap (Overpass)";
  return {
    raw, metrics, measured: composite(raw), asOf: stamp,
    center: { lat: cLat, lon: cLon },
    drift, clusterN,
  };
}
