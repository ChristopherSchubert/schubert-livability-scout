// lib/measurers/osm-context.js — chip-driving OSM signals in one Overpass pass.
//
// Single query with per-tag radii so the response stays manageable. Each
// signal lands as a flat key under measured_metrics.osm_context.value:
//
//   {
//     coastline_dist_m,        // null if no coast within 5 km
//     coastline_bearings,      // array of compass sectors (N|E|S|W) with coast within 5 km
//     is_island,               // contained by an OSM place=island polygon
//     harbour_within_1km,
//     forest_frac_10km,        // OSM forest+wood area / 10 km circle area
//     historic_count_2km,
//     pedestrian_street_m,     // total highway=pedestrian length within 700 m core
//     place_square_within_1km,
//     university_within_2km,
//     hiking_route_within_5km,
//     ski_resort_within_50km,
//     cycleway_km_within_700m,
//   }
//
// Per-radius sub-queries are inside one (...); so the whole thing is one
// Overpass request, run against the local Docker container.
//
// Overpass source: localhost only via lib/measure.js#overpass (CLAUDE.md —
// no public mirror; mirrors silently truncate bodies and poison the DB).
// A 200-OK-with-`remark` (timeout/OOM/killed) is rejected in run() rather than
// written as fabricated zeros.
//
// TODO(intersection-entropy): grid-vs-organic plan needs intersection angle
// distribution (osmnx territory). Skipped here; add a separate measurer that
// uses python osmnx through a sidecar script if we want this chip later.

import { overpass, haversine, ringAreaM2, overpassRemarkFailed } from "../measure.js";

const SOURCE = "OpenStreetMap (Overpass)";
const SOURCE_URL = "https://overpass-api.de";

function osmContextQuery(lat, lon) {
  // Build the multi-radius single-pass query. Output `geom` so we get
  // coordinates for distance/area/length math without a second fetch.
  return `[out:json][timeout:60];
(
  // Coastline within 5 km — for Coastal + Peninsula
  way["natural"="coastline"](around:5000,${lat},${lon});

  // Island containment (1 km is plenty — the heart pin sits on land, we only
  // care whether the surrounding feature is an island polygon)
  node["place"="island"](around:1000,${lat},${lon});
  way["place"="island"](around:5000,${lat},${lon});
  relation["place"="island"](around:5000,${lat},${lon});

  // Harbor within 1 km
  node["harbour"](around:1000,${lat},${lon});
  way["harbour"](around:1000,${lat},${lon});
  way["landuse"="harbour"](around:1000,${lat},${lon});

  // Forest + wood within 10 km — for Forested chip (area fraction)
  way["landuse"="forest"](around:10000,${lat},${lon});
  way["natural"="wood"](around:10000,${lat},${lon});
  relation["landuse"="forest"](around:10000,${lat},${lon});
  relation["natural"="wood"](around:10000,${lat},${lon});

  // Historic tags within 2 km — for Historic fabric chip
  node["historic"](around:2000,${lat},${lon});
  way["historic"](around:2000,${lat},${lon});

  // Pedestrian street within 700 m core
  way["highway"="pedestrian"](around:700,${lat},${lon});

  // Square within 1 km
  way["place"="square"](around:1000,${lat},${lon});
  node["place"="square"](around:1000,${lat},${lon});

  // University within 2 km — for College town (combined with population cap)
  way["amenity"="university"](around:2000,${lat},${lon});
  node["amenity"="university"](around:2000,${lat},${lon});
  relation["amenity"="university"](around:2000,${lat},${lon});

  // Hiking route within 5 km
  relation["route"="hiking"](around:5000,${lat},${lon});

  // Ski resort within 50 km
  way["landuse"="winter_sports"](around:50000,${lat},${lon});
  way["sport"="skiing"](around:50000,${lat},${lon});
  relation["sport"="skiing"](around:50000,${lat},${lon});

  // Cycleway within 700 m core
  way["highway"="cycleway"](around:700,${lat},${lon});
);
out geom;`;
}

// Length of a polyline (one OSM `way` geometry) in meters.
function lineLengthM(geom) {
  if (!geom || geom.length < 2) return 0;
  let s = 0;
  for (let i = 1; i < geom.length; i++) {
    s += haversine(geom[i - 1].lat, geom[i - 1].lon, geom[i].lat, geom[i].lon);
  }
  return s;
}

// Closed-ring area only — open lines (coastline, pedestrian street) contribute 0.
function closedRingArea(geom) {
  if (!geom || geom.length < 4) return 0;
  const first = geom[0], last = geom[geom.length - 1];
  if (first.lat !== last.lat || first.lon !== last.lon) return 0;
  return ringAreaM2(geom);
}

// True if (lat, lon) lies inside a GeoJSON-ish ring (array of {lat,lon}).
function pointInRing(lat, lon, ring) {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat, xi = ring[i].lon, yj = ring[j].lat, xj = ring[j].lon;
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Compass sector (N|E|S|W) for an azimuth in degrees from the heart pin.
function sectorOf(azDeg) {
  const a = ((azDeg % 360) + 360) % 360;
  if (a >= 315 || a < 45) return "N";
  if (a < 135) return "E";
  if (a < 225) return "S";
  return "W";
}

function bearing(latA, lonA, latB, lonB) {
  const φ1 = latA * Math.PI / 180, φ2 = latB * Math.PI / 180;
  const Δλ = (lonB - lonA) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x) * 180 / Math.PI;
}

function computeContext(lat, lon, elements) {
  // Bucket elements by their relevant tag so per-signal logic is straightforward.
  const ctx = {
    coastline_dist_m: null,
    coastline_bearings: [],
    is_island: false,
    harbour_within_1km: false,
    forest_frac_10km: null,
    historic_count_2km: 0,
    pedestrian_street_m: 0,
    place_square_within_1km: false,
    university_within_2km: false,
    hiking_route_within_5km: false,
    ski_resort_within_50km: false,
    cycleway_km_within_700m: 0,
  };
  let coastBest = Infinity;
  const coastSectors = new Set();
  let forestArea = 0;
  const tenKmCircleArea = Math.PI * 10000 * 10000;

  const islandPolys = []; // array of rings (lat/lon) to test heart containment.

  for (const el of elements || []) {
    const t = el.tags || {};
    // Centerline / ring geometry — relations come back with `members` having geometry.
    const lines = [];
    if (el.geometry) lines.push(el.geometry);
    if (el.members) for (const m of el.members) if (m.geometry) lines.push(m.geometry);

    // Coastline — point distance from heart to nearest line vertex.
    if (t.natural === "coastline") {
      for (const g of lines) {
        for (const p of g) {
          const d = haversine(lat, lon, p.lat, p.lon);
          if (d < coastBest) coastBest = d;
          if (d <= 5000) coastSectors.add(sectorOf(bearing(lat, lon, p.lat, p.lon)));
        }
      }
    }

    // Island — does the heart sit inside an island polygon?
    if (t.place === "island") {
      for (const g of lines) islandPolys.push(g);
      if (el.lat != null && el.lon != null) {
        // node-tagged island: treat as island if within 200m
        if (haversine(lat, lon, el.lat, el.lon) < 200) ctx.is_island = true;
      }
    }

    if (t.harbour || t.landuse === "harbour") {
      const probe = el.lat != null ? { lat: el.lat, lon: el.lon } : (lines[0]?.[0] || null);
      if (probe && haversine(lat, lon, probe.lat, probe.lon) <= 1000) ctx.harbour_within_1km = true;
    }

    if (t.landuse === "forest" || t.natural === "wood") {
      for (const g of lines) forestArea += closedRingArea(g);
    }

    if (t.historic) ctx.historic_count_2km += 1;

    if (t.highway === "pedestrian") {
      for (const g of lines) ctx.pedestrian_street_m += lineLengthM(g);
    }

    if (t.place === "square") ctx.place_square_within_1km = true;

    if (t.amenity === "university") ctx.university_within_2km = true;

    if (t.route === "hiking") ctx.hiking_route_within_5km = true;

    if (t.landuse === "winter_sports" || t.sport === "skiing") ctx.ski_resort_within_50km = true;

    if (t.highway === "cycleway") {
      for (const g of lines) ctx.cycleway_km_within_700m += lineLengthM(g) / 1000;
    }
  }

  if (Number.isFinite(coastBest)) ctx.coastline_dist_m = Math.round(coastBest);
  ctx.coastline_bearings = [...coastSectors];
  ctx.forest_frac_10km = forestArea > 0
    ? Math.round((forestArea / tenKmCircleArea) * 1000) / 1000
    : 0;
  ctx.pedestrian_street_m = Math.round(ctx.pedestrian_street_m);
  ctx.cycleway_km_within_700m = Math.round(ctx.cycleway_km_within_700m * 10) / 10;

  if (!ctx.is_island) {
    for (const ring of islandPolys) {
      if (pointInRing(lat, lon, ring)) { ctx.is_island = true; break; }
    }
  }

  return ctx;
}

export default {
  id: "osm_context",
  describe: "OSM chip signals: coast/bearings, island, harbour, forest, historic, pedestrian, square, university, hiking, ski, cycleway",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["osm_context"],
  },
  // Single heavy Overpass call against the local Docker (CLAUDE.md: localhost
  // only, no public mirror) — no throttle needed for the local container.
  throttleMs: 0,
  async run({ lat, lon, asOf }) {
    const d = await overpass(osmContextQuery(lat, lon));
    if (!d) return { notes: "Overpass returned nothing (down or empty)" };
    // 200-OK-with-remark = a timed-out / killed / OOM query. The body is partial
    // or empty; computing context from it would write fabricated zeros as if
    // measured (CLAUDE.md Corollary 2, "zero is not null"). Fail loud, write nothing.
    if (overpassRemarkFailed(d)) return { notes: `Overpass degraded (remark: ${d.remark})` };
    const ctx = computeContext(lat, lon, d.elements);
    const measuredMetrics = {
      osm_context: { value: ctx, asOf, source: SOURCE, sourceUrl: SOURCE_URL },
    };
    const flags = [];
    if (ctx.coastline_dist_m != null) flags.push(`coast ${ctx.coastline_dist_m}m [${ctx.coastline_bearings.join("")||"-"}]`);
    if (ctx.is_island) flags.push("island");
    if (ctx.harbour_within_1km) flags.push("harbour");
    if (ctx.forest_frac_10km > 0.05) flags.push(`forest ${(ctx.forest_frac_10km * 100).toFixed(1)}%`);
    if (ctx.historic_count_2km > 0) flags.push(`hist ${ctx.historic_count_2km}`);
    if (ctx.pedestrian_street_m > 100) flags.push(`ped ${ctx.pedestrian_street_m}m`);
    if (ctx.place_square_within_1km) flags.push("square");
    if (ctx.university_within_2km) flags.push("uni");
    if (ctx.hiking_route_within_5km) flags.push("hike");
    if (ctx.ski_resort_within_50km) flags.push("ski");
    if (ctx.cycleway_km_within_700m > 0) flags.push(`bike ${ctx.cycleway_km_within_700m}km`);
    return { measuredMetrics, notes: flags.join(" · ") || "no chip signals" };
  },
};
