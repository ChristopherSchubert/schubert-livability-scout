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

export async function overpass(query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", {
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
export async function findVisitCenters(lat, lon, { max = 4 } = {}) {
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

    // Stop once clusters get trivial (absolute floor, or <15% of the top core).
    const floor = peaks.length ? Math.max(6, peaks[0].n * 0.15) : 6;
    if (n < floor) break;

    peaks.push({ lat: +cen.lat.toFixed(6), lon: +cen.lon.toFixed(6), n, moved: Math.round(haversine(lat, lon, cen.lat, cen.lon)) });
    pool = pool.filter((p) => haversine(cen.lat, cen.lon, p.lat, p.lon) > VC_SEP); // carve out this core
  }
  peaks.sort((a, b) => b.n - a.n);
  return peaks.length ? peaks : [{ lat, lon, n: 0, moved: 0 }];
}

// Single best center (auto mode / backward compatible): the densest core.
export async function findVisitCenter(lat, lon) {
  const [best] = await findVisitCenters(lat, lon, { max: 1 });
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
  let best = null, grand = 0;
  for (const b of waterBodies(d.elements).values()) {
    const r = minDistToVerts(lat, lon, b.verts);
    if (r.dist == null) continue;
    if (best == null || r.dist < best.dist) best = { ...r, body: b };
    if (r.dist <= 4000) grand = Math.max(grand, bodyGrandeurKm2(b));
  }
  if (!best) return { dist: null, point: null, extentKm2: null };
  return { dist: best.dist, point: best.point, extentKm2: grand || bodyGrandeurKm2(best.body) };
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
  const push = (key, name, kind, verts, areaM2, sea) => {
    let b = bodies.get(key);
    if (!b) { b = { name: null, kind, verts: [], areaM2: 0, isSea: false }; bodies.set(key, b); }
    if (!b.name && name) b.name = name;
    if (sea) b.isSea = true;
    b.areaM2 += areaM2 || 0;
    for (const g of verts) b.verts.push(g);
  };
  // Surface area of a closed ring only (open lines — coastline, river
  // centerlines — contribute 0; the sea is credited via the sentinel below).
  const closedRingArea = (g) => (g && g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon ? ringAreaM2(g) : 0);
  for (const el of elements || []) {
    const nat = el.tags?.natural, ww = el.tags?.waterway, wt = el.tags?.water, name = el.tags?.name || null;
    const isSea = nat === "coastline" || nat === "bay" || nat === "strait";
    const isRiver = ww === "river" || ww === "riverbank" || wt === "river";
    let verts = [], elArea = 0;
    if (el.members) {
      const outers = el.members.filter((m) => m.geometry && m.role !== "inner");
      const inners = el.members.filter((m) => m.geometry && m.role === "inner");
      const area = outers.reduce((s, m) => s + closedRingArea(m.geometry), 0) - inners.reduce((s, m) => s + closedRingArea(m.geometry), 0);
      if (isSea || isRiver || area >= MIN_WATER_AREA_M2) { for (const m of el.members) if (m.geometry) verts.push(...m.geometry); elArea = Math.max(0, area); }
    } else if (el.geometry) {
      const a = closedRingArea(el.geometry);
      if (isSea || isRiver || a >= MIN_WATER_AREA_M2) { verts.push(...el.geometry); elArea = a; }
    } else if (el.lat != null && isSea) {
      verts.push({ lat: el.lat, lon: el.lon });
    }
    if (!verts.length) continue;
    if (isSea) push("sea", nat === "bay" || nat === "strait" ? name : null, "sea", verts, elArea, true);
    else if (isRiver) push(`river:${name || el.type + el.id}`, name, "river", verts, elArea, false);
    else push(`lake:${name || el.type + el.id}`, name, "lake", verts, elArea, false);
  }
  for (const b of bodies.values()) {
    if (!b.name) b.name = b.kind === "sea" ? "Ocean / coast" : b.kind === "river" ? "Unnamed river" : "Unnamed lake";
  }
  return bodies;
}

// Grandeur (km²) of a water body = its real surface area, capped at 500. The
// sea is effectively unbounded → sentinel 500; lakes/reservoirs get their true
// polygon area; a thin river gets its (small) riverbank area, so it can't
// masquerade as a great body. Open ocean (coastline only, no polygon) → sentinel.
const WATER_CAP_KM2 = 500;
function bodyGrandeurKm2(b) {
  if (!b) return null;
  if (b.isSea) return WATER_CAP_KM2;
  return Math.min(WATER_CAP_KM2, Math.round((b.areaM2 / 1e6) * 10) / 10);
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
      const rise = (ei - e0) - (d * d) / (2 * R) * K;
      const ang = Math.atan2(rise, d) * 180 / Math.PI;
      if (ang > rayMax) rayMax = ang;
    }
    if (rayMax > maxAngle) maxAngle = rayMax;
  }
  const deg = Math.max(0, Math.round(maxAngle * 10) / 10);
  return { metrics: { skyline_deg: { value: deg, asOf: stamp, source: "Open-Meteo elevation (line-of-sight skyline)" } } };
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

// Water on the horizon: the share of the 16 compass sectors that face open
// major water (sea or a sizable lake, ≥5 km²) within ~12 km — the seaward arc
// you'd look out onto. Thin rivers don't count (not a horizon-filling view).
// First-cut: proximity + direction, no terrain occlusion (sea sits low and is
// usually visible from a coastal core); documented as such.
export async function measureWaterHorizon(lat, lon, { asOf } = {}) {
  const stamp = asOf || new Date().toISOString().slice(0, 10);
  const d = await overpass(waterQuery(lat, lon, 15000));
  if (!d) return { metrics: {} };
  // Qualifying open water:
  //  • the sea — always
  //  • a sizable lake (≥5 km²)
  //  • a named river running through the town — channel within 2.5 km of the
  //    center. We DON'T gate rivers on polygon area: OSM frequently maps even
  //    huge rivers (e.g. the Columbia at Hood River) as centerlines with no
  //    polygon, which would otherwise falsely exclude them. waterway=river is
  //    OSM's tag for real rivers (vs stream / ditch / drain), so the tag itself
  //    is the filter — narrow creeks like Greenville's Reedy stay out either by
  //    being tagged stream or by sitting outside the 2.5 km radius.
  const nearestVert = (b) => b.verts.reduce((m, g) => Math.min(m, haversine(lat, lon, g.lat, g.lon)), Infinity);
  const bodies = [...waterBodies(d.elements).values()].filter(
    (b) => b.isSea || b.areaM2 >= 5e6 || (b.kind === "river" && nearestVert(b) <= 2500),
  );
  const sectorHit = new Array(16).fill(false);
  for (const b of bodies) {
    const radius = b.isSea ? 12000 : 5000;
    for (const g of b.verts) {
      if (haversine(lat, lon, g.lat, g.lon) > radius) continue;
      sectorHit[Math.round(bearingDeg(lat, lon, g.lat, g.lon) / 22.5) % 16] = true;
    }
  }
  const open = sectorHit.filter(Boolean).length;
  return { metrics: { water_horizon_pct: { value: Math.round((open / 16) * 100), asOf: stamp, source: "OpenStreetMap (open-water directions)" } } };
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

export function composite(m) {
  const band = (v, lo, hi) => (v == null ? null : Math.max(0, Math.min(10, ((v - lo) / (hi - lo)) * 10)));
  const parts = [
    // Setting: visible mountain backdrop + water (proximity & grandeur).
    // Local core relief is intentionally NOT here — it penalized flat-but-
    // spectacular settings (Santa Barbara) and isn't what "well-set" means.
    band(m.skyline_deg, 0, 12),
    band(m.water_extent_km2, 0, 150),
    m.water_dist_m == null ? null : band(3000 - m.water_dist_m, 0, 3000),
    band(m.intersection_den, 40, 200),
    m.mean_block_m == null ? null : band(120 - m.mean_block_m, 0, 80),
    band(m.carfree_frac, 0, 0.5),
    band(m.cafe_n, 0, 25),
    band(m.daily_needs_n, 0, 12),
  ].filter((x) => x != null);
  if (!parts.length) return null;
  return Math.round((parts.reduce((s, v) => s + v, 0) / parts.length) * 10) / 10;
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
