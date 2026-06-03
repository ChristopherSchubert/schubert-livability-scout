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
const OVERPASS_PUBLIC = "https://overpass-api.de/api/interpreter";
export async function overpass(query) {
  const url = process.env.OVERPASS_URL || OVERPASS_PUBLIC;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (r.status === 429 || r.status === 504) { await sleep(6000); continue; }
      return await r.json();
    } catch { await sleep(4000); }
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

// Fetch a polygon for a named stay zone from Nominatim. Returns a GeoJSON
// Polygon / MultiPolygon, or null if no candidate query yields a polygon.
//
// The stay_zone strings in this project are intentionally descriptive ("Pearl
// St / Mapleton Hill", "City Dock / Historic Core") — they encode "the spot,"
// not a queryable place name. So we generate a battery of candidate queries:
//   1. Parenthetical neighborhood lifted from the city name itself
//      (e.g. "Pittsburgh (Lawrenceville), PA" → "Lawrenceville, Pittsburgh, PA")
//   2. Each "/"-split token of the stay_zone, scoped by city + state
//   3. The full stay_zone string, scoped by city + state (and back-offs)
// First query that returns a polygon wins.
export async function fetchStayZoneBoundary(stayZone, cityName) {
  if (!stayZone && !cityName) return null;
  const cityPart = (cityName || "").split(",")[0].trim();
  const statePart = ((cityName || "").split(",")[1] || "").trim();
  // Pittsburgh (Lawrenceville), PA → bareCity="Pittsburgh", paren="Lawrenceville"
  const parenMatch = cityPart.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const bareCity = parenMatch ? parenMatch[1].trim() : cityPart;
  const parenName = parenMatch ? parenMatch[2].trim() : null;
  const scope = (s, c = bareCity) => `${s}, ${c}${statePart ? ", " + statePart : ""}`;
  // Tokens from the stay_zone, split on "/" — drop "downtown" since it's
  // generic and never resolves to a useful polygon.
  const zoneTokens = (stayZone || "")
    .split(/\s*\/\s*/)
    .map((t) => t.trim())
    .filter((t) => t && !/^downtown$/i.test(t));
  const tries = [
    parenName ? scope(parenName) : null,
    ...zoneTokens.map((t) => scope(t)),
    ...zoneTokens.map((t) => `${t}${statePart ? ", " + statePart : ""}`),
    stayZone ? scope(stayZone) : null,
    stayZone ? `${stayZone}${statePart ? ", " + statePart : ""}` : null,
    // Bare-city fallback ONLY for cities the user didn't disambiguate with a
    // parenthetical. For paren'd cities ("Pittsburgh (Lawrenceville), PA") the
    // whole-city polygon would be way too broad — better to leave null and
    // let the drift cap handle it than to silently constrain to all of
    // Pittsburgh.
    !parenName && bareCity ? `${bareCity}${statePart ? ", " + statePart : ""}` : null,
  ].filter(Boolean);
  // De-dupe while preserving order.
  const seen = new Set();
  const uniq = tries.filter((q) => (seen.has(q) ? false : (seen.add(q), true)));
  for (let i = 0; i < uniq.length; i++) {
    // Nominatim asks ≤1 req/sec; respect it between every internal attempt
    // (not just between cities) so back-to-back queries don't trip rate
    // limiting and silently return nothing.
    if (i > 0) await sleep(1100);
    const hit = await nominatimSearchPolygon(uniq[i]);
    if (hit) return hit;
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

async function osmMetrics(lat, lon) {
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
function ringAreaM2(geom) {
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
  if (!d) return { dist: null, point: null, extentKm2: null };
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
  if (!best) return { dist: null, point: null, extentKm2: null };
  return { dist: best.dist, point: best.point, extentKm2: grand || bodyGrandeurKm2(best.body, best.dist) };
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
  const vars = "B01003_001E,B25001_001E,B25004_006E,B25077_001E";
  const a = await fetchJson(`https://api.census.gov/data/${year}/acs/acs5?get=${vars}&for=tract:${t.TRACT}&in=state:${t.STATE}%20county:${t.COUNTY}&key=${apiKey}`);
  if (!a || a.length < 2) return { metrics: {}, tract: t.GEOID };
  const m = Object.fromEntries(a[0].map((h, i) => [h, a[1][i]]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > -100000 ? n : null; };
  const pop = num(m.B01003_001E), units = num(m.B25001_001E), seas = num(m.B25004_006E), val = num(m.B25077_001E);
  const sqmi = t.AREALAND ? t.AREALAND / 2589988.11 : null;
  const src = `US Census ACS 5-yr (${year - 4}–${year}), tract ${t.GEOID}`;
  const metrics = {};
  if (pop != null && sqmi) metrics.core_density = { value: Math.round(pop / sqmi), asOf: stamp, source: src };
  if (seas != null && units) metrics.seasonal_vac_pct = { value: Math.round((seas / units) * 1000) / 10, asOf: stamp, source: src };
  if (val != null) metrics.median_price_usd = { value: val, asOf: stamp, source: src };
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

// Climate (January axis): days/yr below freezing and clear days from
// Open-Meteo's ERA5 archive (free, no key) averaged over recent years; plus
// December daylight from pure astronomy (latitude only).
export async function measureClimate(lat, lon, { asOf, startYear = 2019, endYear = 2023 } = {}) {
  const stamp = asOf || new Date().toISOString().slice(0, 10);
  const metrics = {};
  // December daylight at the winter solstice — closed-form, no API.
  const decl = -23.44 * Math.PI / 180; // solstice solar declination
  const phi = lat * Math.PI / 180;
  let h = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl)))); // half-day angle
  const dayHrs = (2 * h * 180 / Math.PI) / 15;
  metrics.dec_daylight_hr = { value: Math.round(dayHrs * 10) / 10, asOf: stamp, source: "Solar geometry (latitude)" };
  // Freeze + clear days AND 12-month normals from the archive, one fetch.
  let visitClimate = null;
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&start_date=${startYear}-01-01&end_date=${endYear}-12-31` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,daylight_duration&timezone=auto`;
    const d = await (await fetch(url, { headers: { "User-Agent": UA } })).json();
    const dd = d?.daily;
    if (dd?.time?.length) {
      const years = endYear - startYear + 1;
      let freeze = 0, clear = 0;
      const mo = Array.from({ length: 12 }, () => ({ hi: 0, lo: 0, n: 0, wet: 0, day: 0 }));
      for (let i = 0; i < dd.time.length; i++) {
        if (dd.temperature_2m_min[i] != null && dd.temperature_2m_min[i] < 0) freeze++;
        const sun = dd.sunshine_duration[i], day = dd.daylight_duration[i];
        if (sun != null && day && sun >= 0.6 * day) clear++;
        const m = Number(dd.time[i].slice(5, 7)) - 1;
        const hi = dd.temperature_2m_max[i], lo = dd.temperature_2m_min[i];
        if (hi != null && lo != null) {
          mo[m].hi += hi; mo[m].lo += lo; mo[m].n += 1;
          if (dd.precipitation_sum[i] >= 1) mo[m].wet += 1;
          if (day != null) mo[m].day += day;
        }
      }
      const src = `NOAA/ERA5 via Open-Meteo archive (${startYear}–${endYear})`;
      metrics.days_below_freeze = { value: Math.round(freeze / years), asOf: stamp, source: src };
      metrics.clear_days = { value: Math.round(clear / years), asOf: stamp, source: src };
      // 12-month normals in °F (monthComfort uses °F thresholds).
      const cToF = (c) => Math.round((c * 9 / 5 + 32) * 10) / 10;
      visitClimate = mo.map((x) => x.n ? {
        hi: cToF(x.hi / x.n), lo: cToF(x.lo / x.n),
        precipDays: Math.round(x.wet / years), daylightHr: Math.round((x.day / x.n / 3600) * 10) / 10,
      } : null);
      if (visitClimate.every((m) => !m)) visitClimate = null;
    }
  } catch { /* leave climate days unset */ }
  return { metrics, visitClimate };
}

// Visible mountain backdrop (Setting): the steepest skyline angle you'd see.
// March outward along many azimuths sampling ground elevation, correct for
// earth curvature + atmospheric refraction, and take the max elevation angle —
// a real line-of-sight skyline (a near ridge naturally occludes a far peak,
// since it presents a higher angle). Free, no key. Returns degrees.
const SKY_DIST_M = [1, 2, 3, 4, 5, 7, 10, 14, 18, 24, 30, 40, 55].map((k) => k * 1000);
const SKY_AZ = Array.from({ length: 24 }, (_, i) => i * 15);

function destPoint(lat, lon, azDeg, dM) {
  const ad = dM / 6371000, a = azDeg * Math.PI / 180, la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  const la2 = Math.asin(Math.sin(la) * Math.cos(ad) + Math.cos(la) * Math.sin(ad) * Math.cos(a));
  const lo2 = lo + Math.atan2(Math.sin(a) * Math.sin(ad) * Math.cos(la), Math.cos(ad) - Math.sin(la) * Math.sin(la2));
  return [la2 * 180 / Math.PI, lo2 * 180 / Math.PI];
}

// Batch ground-elevation lookup. Primary source Open-Meteo (fast, generous);
// on failure or its daily-limit error, fall back to opentopodata (SRTM, a
// separate quota, ~1 req/sec). Keeps the elevation-based metrics (skyline,
// horizon peaks) working even when one source is exhausted.
async function elevations(points) {
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
  if (!d?.elements?.length) return null;

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

// ONE city → ONE score. Persisted to cities.measured at measurement time so
// the DB column matches whatever the UI's weightedAxisScore renders at
// runtime. Both code paths run the same logic in planner-data.js (axisRollup
// → weightedAxisScore), with equal weights here; Calibrate applies any
// learned per-axis weights on top of the same rollups.
import { weightedAxisScore } from "./planner-data.js";
const EQUAL_WEIGHTS = { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 };
export function composite(raw) {
  const measuredMetrics = {};
  for (const [k, v] of Object.entries(raw || {})) if (v != null) measuredMetrics[k] = { value: v };
  return weightedAxisScore({ measuredMetrics }, EQUAL_WEIGHTS);
}

// THE ROUTINE: measure everything around a center. Returns raw values, the
// taxonomy-shaped {key:{value,asOf}} metrics, and the composite.
export async function measureAround(lat, lon, { asOf } = {}) {
  const stamp = asOf || new Date().toISOString().slice(0, 10);
  // Run the three independent fetches concurrently — wall-clock ≈ slowest one.
  const [rel, osm, water] = await Promise.all([relief(lat, lon), osmMetrics(lat, lon), nearestWater(lat, lon)]);
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
  return { raw, metrics, measured: composite(raw), asOf: stamp };
}
