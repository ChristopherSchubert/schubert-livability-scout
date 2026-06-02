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

export async function nearestWater(lat, lon) {
  // Distance to the nearest MAJOR body of water, measured to its actual edge.
  //
  // Two corrections baked in:
  //  1. Nearest-EDGE, not centroid — a bay/ocean centroid sits far offshore and
  //     wildly overstates distance for a beachfront town; the nearest shoreline
  //     vertex is what "how far is the water" actually means.
  //  2. MAJOR water only — the sea always counts, but inland polygons must clear
  //     MIN_WATER_AREA_M2, so a 0.2-hectare park "turtle pond" can't masquerade
  //     as the waterfront. This is a setting signal: real water you'd value.
  //
  // What counts as "major" water:
  //  • the sea — coastline / bay / strait (always)
  //  • named rivers — waterway=river / riverbank, water=river (always; OSM
  //    reserves "river" for real rivers and "stream"/"ditch" for creeks, which
  //    we deliberately exclude — a creek through a park isn't the waterfront)
  //  • standing water — lakes / reservoirs / lagoons, only above the area bar
  //    (so ornamental "turtle ponds" can't masquerade as a major body)
  // `out geom` returns per-way node coords and per-relation-member geometry.
  const q = `[out:json][timeout:55];
    (way["natural"="coastline"](around:15000,${lat},${lon});
     way["natural"~"bay|strait"](around:15000,${lat},${lon});
     relation["natural"~"bay|strait"](around:15000,${lat},${lon});
     way["waterway"="river"](around:12000,${lat},${lon});
     way["waterway"="riverbank"](around:12000,${lat},${lon});
     relation["waterway"="riverbank"](around:12000,${lat},${lon});
     way["natural"="water"](around:12000,${lat},${lon});
     relation["natural"="water"](around:12000,${lat},${lon}););
    out geom;`;
  const d = await overpass(q);
  if (!d) return null;
  let best = null;
  const consider = (la, lo) => { const dist = haversine(lat, lon, la, lo); if (best == null || dist < best) best = dist; };
  const eat = (geom) => { for (const g of geom) consider(g.lat, g.lon); };

  for (const el of d.elements) {
    const nat = el.tags?.natural;
    const ww = el.tags?.waterway;
    const wt = el.tags?.water;
    const isSea = nat === "coastline" || nat === "bay" || nat === "strait";
    const isRiver = ww === "river" || ww === "riverbank" || wt === "river";
    const always = isSea || isRiver; // sea + named rivers count regardless of size

    if (el.members) {
      // Relation (multipolygon). Always-count types pass; standing water must
      // clear the area threshold (combined outer-ring area).
      const outers = el.members.filter((m) => m.geometry && m.role !== "inner");
      const area = outers.reduce((s, m) => s + ringAreaM2(m.geometry), 0);
      if (always || area >= MIN_WATER_AREA_M2) for (const m of el.members) if (m.geometry) eat(m.geometry);
    } else if (el.geometry) {
      // Way. Coastline/river are open lines (no polygon area) → always; a
      // standing-water polygon must clear the threshold.
      if (always || ringAreaM2(el.geometry) >= MIN_WATER_AREA_M2) eat(el.geometry);
    } else if (el.lat != null && isSea) {
      consider(el.lat, el.lon);
    }
  }
  return best == null ? null : Math.round(best);
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
  // Freeze + clear days from the archive.
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&start_date=${startYear}-01-01&end_date=${endYear}-12-31` +
      `&daily=temperature_2m_min,sunshine_duration,daylight_duration&timezone=auto`;
    const d = await (await fetch(url, { headers: { "User-Agent": UA } })).json();
    const dd = d?.daily;
    if (dd?.time?.length) {
      const years = endYear - startYear + 1;
      let freeze = 0, clear = 0;
      for (let i = 0; i < dd.time.length; i++) {
        if (dd.temperature_2m_min[i] != null && dd.temperature_2m_min[i] < 0) freeze++;
        const sun = dd.sunshine_duration[i], day = dd.daylight_duration[i];
        if (sun != null && day && sun >= 0.6 * day) clear++;
      }
      const src = `NOAA/ERA5 via Open-Meteo archive (${startYear}–${endYear})`;
      metrics.days_below_freeze = { value: Math.round(freeze / years), asOf: stamp, source: src };
      metrics.clear_days = { value: Math.round(clear / years), asOf: stamp, source: src };
    }
  } catch { /* leave climate days unset */ }
  return { metrics };
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
    band(m.relief_std_m, 2, 80),
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
    relief_std_m: rel.std, relief_range_m: rel.range, water_dist_m: water,
    cafe_n: osm.cafe_n, bar_n: osm.bar_n, rest_n: osm.rest_n,
    intersection_den: osm.intersection_den, mean_block_m: osm.mean_block_m,
    carfree_frac: osm.carfree_frac, street_km: osm.street_km, daily_needs_n: osm.daily_needs_n,
  };
  const metrics = {};
  for (const [k, v] of Object.entries(raw)) if (v != null) metrics[k] = { value: v, asOf: stamp };
  return { raw, metrics, measured: composite(raw), asOf: stamp };
}
