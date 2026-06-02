// scripts/measure-cities.mjs
//
// Objective measurement pipeline (Track 1), node-only — no osmnx/Python.
// For each city: geocode the heart (Nominatim) → query OSM (Overpass) for
// POIs, street geometry, and nearest water → sample an elevation grid
// (Open-Meteo) for terrain relief → write measured_metrics + a composite
// `measured` (0-10) to Supabase via the service key (bypasses RLS).
//
// Every value is computed from a cited source. Metrics we can't get here
// (Walk Score, Census density, STR share, Redfin price, climate, viewshed)
// are left null — never faked.
//
//   node scripts/measure-cities.mjs
import pg from "pg";
import { execSync } from "node:child_process";

const UA = "livability-scout/1.0 (measurement; chris)";
const RADIUS = 700; // meters — ~10-min-walk core
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbpw = execSync("security find-generic-password -a livability-scout -s supabase-db-password -w", { encoding: "utf8" }).trim();

// ── geocode the heart intersection → lat/lon ────────────────────────────────
async function geocode(heart, name) {
  const [streetPart] = (heart || "").split("&");
  const street = (streetPart || "").trim();
  const cityName = name.split(",")[0].split("/")[0].trim();
  const state = (name.split(",")[1] || "").trim();
  const params = new URLSearchParams({ street, city: cityName, state, country: "USA", format: "json", limit: "1" });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": UA } });
  const d = await r.json();
  if (d?.[0]) return { lat: +d[0].lat, lon: +d[0].lon };
  // fallback: city center
  const p2 = new URLSearchParams({ city: cityName, state, country: "USA", format: "json", limit: "1" });
  const r2 = await fetch(`https://nominatim.openstreetmap.org/search?${p2}`, { headers: { "User-Agent": UA } });
  const d2 = await r2.json();
  return d2?.[0] ? { lat: +d2[0].lat, lon: +d2[0].lon } : null;
}

async function overpass(query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "User-Agent": UA, "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (r.status === 429 || r.status === 504) { await sleep(8000); continue; }
      return await r.json();
    } catch { await sleep(5000); }
  }
  return null;
}

function haversine(a, b, c, d) {
  const R = 6371000, p = (x) => x * Math.PI / 180;
  const dphi = p(c - a), dl = p(d - b);
  const x = Math.sin(dphi / 2) ** 2 + Math.cos(p(a)) * Math.cos(p(c)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ── elevation relief from a grid (Open-Meteo batch) ─────────────────────────
async function relief(lat, lon) {
  const n = 6, span = RADIUS / 111000;
  const lats = [], lons = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    lats.push((lat - span + 2 * span * i / (n - 1)).toFixed(5));
    lons.push((lon - span + 2 * span * j / (n - 1)).toFixed(5));
  }
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lons.join(",")}`);
    const d = await r.json();
    const e = (d.elevation || []).filter((x) => typeof x === "number");
    if (!e.length) return { std: null, range: null };
    const mean = e.reduce((s, v) => s + v, 0) / e.length;
    const std = Math.sqrt(e.reduce((s, v) => s + (v - mean) ** 2, 0) / e.length);
    return { std: Math.round(std * 10) / 10, range: Math.round(Math.max(...e) - Math.min(...e)) };
  } catch { return { std: null, range: null }; }
}

// ── POIs + street fabric + water, one Overpass call ─────────────────────────
async function osmMetrics(lat, lon) {
  const q = `[out:json][timeout:60];
    (node["amenity"~"^(cafe|restaurant|bar|pub|pharmacy)$"](around:${RADIUS},${lat},${lon});
     node["shop"~"^(bakery|butcher|greengrocer|supermarket|convenience)$"](around:${RADIUS},${lat},${lon}););
    out tags;
    way["highway"](around:${RADIUS},${lat},${lon});
    out geom;`;
  const d = await overpass(q);
  if (!d) return {};
  const out = {};
  // POIs
  let cafe = 0, rest = 0, bar = 0, pharm = 0, grocery = 0, daily = 0;
  for (const el of d.elements) {
    const a = el.tags?.amenity, s = el.tags?.shop;
    if (a === "cafe") cafe++;
    else if (a === "restaurant") rest++;
    else if (a === "bar" || a === "pub") bar++;
    else if (a === "pharmacy") { pharm++; daily++; }
    if (s === "supermarket" || s === "convenience" || s === "greengrocer") { grocery++; daily++; }
    if (s === "bakery" || s === "butcher") daily++;
  }
  out.cafe_n = cafe; out.rest_n = rest; out.bar_n = bar; out.daily_needs_n = daily;
  // Streets: length, mean block, car-free fraction, intersection density
  const ways = d.elements.filter((e) => e.type === "way" && e.geometry);
  let total = 0, carfree = 0; const lengths = [];
  const nodeUse = new Map();
  for (const w of ways) {
    let len = 0;
    for (let i = 1; i < w.geometry.length; i++) {
      len += haversine(w.geometry[i - 1].lat, w.geometry[i - 1].lon, w.geometry[i].lat, w.geometry[i].lon);
    }
    if (len === 0) continue;
    lengths.push(len); total += len;
    const hw = w.tags?.highway;
    if (["pedestrian", "footway", "living_street", "path", "steps"].includes(hw) || w.tags?.foot === "designated") carfree += len;
    for (const nd of w.nodes || []) nodeUse.set(nd, (nodeUse.get(nd) || 0) + 1);
  }
  const areaKm2 = Math.PI * (RADIUS / 1000) ** 2;
  const intersections = [...nodeUse.values()].filter((c) => c >= 3).length;
  out.street_km = Math.round(total / 10) / 100;
  out.mean_block_m = lengths.length ? Math.round(total / lengths.length) : null;
  out.carfree_frac = total ? Math.round((carfree / total) * 1000) / 1000 : null;
  out.intersection_den = Math.round(intersections / areaKm2 * 10) / 10;
  return out;
}

async function nearestWater(lat, lon) {
  const q = `[out:json][timeout:30];
    (way["natural"="water"](around:8000,${lat},${lon});
     way["natural"="coastline"](around:8000,${lat},${lon});
     relation["natural"="water"](around:8000,${lat},${lon}););
    out center 30;`;
  const d = await overpass(q);
  if (!d) return null;
  let best = null;
  for (const el of d.elements) {
    const c = el.center || (el.lat != null ? { lat: el.lat, lon: el.lon } : null);
    if (!c) continue;
    const dist = haversine(lat, lon, c.lat, c.lon);
    best = best == null ? dist : Math.min(best, dist);
  }
  return best == null ? null : Math.round(best);
}

// ── composite 0-10 from the metrics we have (band each, average) ────────────
function composite(m) {
  const band = (v, lo, hi) => v == null ? null : Math.max(0, Math.min(10, ((v - lo) / (hi - lo)) * 10));
  const parts = [
    band(m.relief_std_m, 2, 80),       // setting
    m.water_dist_m == null ? null : band(3000 - m.water_dist_m, 0, 3000),
    band(m.intersection_den, 40, 200), // fabric
    m.mean_block_m == null ? null : band(120 - m.mean_block_m, 0, 80),
    band(m.carfree_frac, 0, 0.5),
    band(m.cafe_n, 0, 25),             // aliveness
    band(m.daily_needs_n, 0, 12),      // realness
  ].filter((x) => x != null);
  if (!parts.length) return null;
  return Math.round(parts.reduce((s, v) => s + v, 0) / parts.length * 10) / 10;
}

async function main() {
  const c = new pg.Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", password: dbpw, database: "postgres", ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query("select id, name, heart_intersection, lat, lon from cities order by name");
  const asOf = new Date().toISOString().slice(0, 10);

  for (const city of rows) {
    process.stdout.write(`\n${city.name} … `);
    // Reuse persisted coords; only geocode (and persist) when missing.
    let geo = (city.lat != null && city.lon != null) ? { lat: city.lat, lon: city.lon } : null;
    if (!geo) {
      geo = await geocode(city.heart_intersection, city.name);
      await sleep(1100); // Nominatim: 1 req/sec
      if (!geo) { console.log("geocode failed — skipped"); continue; }
      await c.query("update cities set lat=$1, lon=$2, geo_source=$3, geocoded_at=$4 where id=$5",
        [geo.lat, geo.lon, "Nominatim (heart intersection)", asOf, city.id]);
    }

    const rel = await relief(geo.lat, geo.lon);
    const osm = await osmMetrics(geo.lat, geo.lon);
    await sleep(1500);
    const water = await nearestWater(geo.lat, geo.lon);
    await sleep(1500);

    const vals = {
      relief_std_m: rel.std, relief_range_m: rel.range, water_dist_m: water,
      cafe_n: osm.cafe_n, bar_n: osm.bar_n, rest_n: osm.rest_n,
      intersection_den: osm.intersection_den, mean_block_m: osm.mean_block_m,
      carfree_frac: osm.carfree_frac, street_km: osm.street_km,
      daily_needs_n: osm.daily_needs_n,
    };
    const metrics = {};
    for (const [k, v] of Object.entries(vals)) if (v != null) metrics[k] = { value: v, asOf };
    const measured = composite(vals);

    await c.query("update cities set measured_metrics = measured_metrics || $1::jsonb, measured = $2, measured_at = $3 where id = $4",
      [JSON.stringify(metrics), measured, asOf, city.id]);
    console.log(`✓ composite ${measured ?? "?"} | café ${osm.cafe_n ?? "?"} relief ${rel.std ?? "?"}m water ${water ?? "?"}m carfree ${osm.carfree_frac ?? "?"}`);
  }
  await c.end();
  console.log("\ndone.");
}
main();
