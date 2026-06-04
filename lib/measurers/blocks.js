// lib/measurers/blocks.js — per-block coordinates for the "Six blocks"
// chapter of the magazine city detail. Each city has a `blocks` array
// of human-written stretch descriptions ("Thames St between Memorial
// Blvd and America's Cup Ave", "Lewes Beach boardwalk"). This measurer
// resolves each to a coordinate and writes the array (parallel to
// `blocks`) into `cities.block_geometries`:
//
//   [{ name, lat, lon, accuracy, source, meta?, asOf } | { name, lat: null, lon: null, accuracy: "unresolved", … }, …]
//
// ── Resolution chain (per block) ──────────────────────────────────────
// Each layer is tried in order; the first to succeed wins. After ANY
// success, the result must pass the integrity gate (below) or it gets
// demoted to "unresolved".
//
//   0. Manual override (existing entry with accuracy === "manual")
//      → preserved verbatim, never overwritten. Human judgment is
//      always above all other layers.
//
//   1. Heart-snap. If both anchor streets in a "between" or "pair"
//      block match the city's saved heart_intersection, snap directly
//      to (city.lat, city.lon) instead of re-geocoding. The heart was
//      already verified by a human at insert time, so we trust it.
//
//   2. Overpass intersection. Find the two named ways within bbox,
//      compute closest-pair node distance. Records "exact" if < 10 m,
//      "near" if 10–60 m. For "between" patterns, both flanking
//      intersections are resolved and the midpoint is taken
//      ("between" accuracy).
//
//   3. Overpass feature centroid. For non-street features (parks,
//      wharfs, plazas, beaches), look up the named OSM way/relation
//      and take its center. Records "feature".
//
//   4. Nominatim bbox-bounded fallback. For everything Overpass can't
//      find (often "X near Y", parenthesized annotations, or features
//      OSM has tagged differently), query Nominatim with viewbox +
//      bounded=1 around the city pin. Bounded=1 physically rules out
//      cross-county collisions — the failure mode that produced
//      "Main St, Ventura, CA" → a Castaic Main St 48 km away.
//      Records "nominatim".
//
// ── Integrity gate ───────────────────────────────────────────────────
// After any resolution, the point must be:
//   (a) inside city.stay_zone_boundary if that polygon is present, OR
//   (b) within INTEGRITY_KM (5 km default) of (city.lat, city.lon) if no
//       polygon is available.
// Otherwise the entry is demoted to { accuracy: "unresolved", lat: null,
// lon: null } so the renderer shows a placeholder card instead of a
// confidently-wrong pin. The original lat/lon and reason are preserved
// in meta.rejected for debugging — never silently dropped on the floor.
//
// This catches the failure mode both the old measurer (43 silent
// city-center fallbacks) and the early Nominatim work (12 wrong-segment
// hits at 5–55 km off) shared: appearing resolved while not being so.
//
// ── Idempotency ──────────────────────────────────────────────────────
// The runner skips this measurer when every block already has a
// non-null geometry. Use --force to re-run. Manual entries (layer 0)
// are preserved across --force.
//
// Set OVERPASS_URL=http://localhost:12345/api/interpreter to use the
// local Docker container instead of the public mirror.
//
// History: an earlier session introduced a parallel cities.block_coords
// column populated via Nominatim. That column is gone; lessons learned
// (bbox-bounding, integrity gate, honest unresolved instead of silent
// city-center) live in this measurer now.

import { overpass, pointInGeoJSON } from "../measure.js";

const SOURCE = "OpenStreetMap (Overpass)";
const SOURCE_URL = "https://overpass-api.de";
const NOMINATIM_SOURCE = "Nominatim";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const NOMINATIM_UA = "livability-scout/0.1 (blocks-measurer)";

// Half-width of the bbox around city.lat/lon used for every Overpass query.
// 0.05° ≈ 5.5 km at mid-latitudes. Generous enough to cover the stay zone
// without spilling into neighbor cities for most US cases.
const BBOX_DEG = 0.05;

// Tighter half-extent for Nominatim's viewbox+bounded fallback. The point
// of bounded=1 is to physically rule out cross-county collisions, so we
// want it tight enough to do that — 0.07° ≈ 7 km half-extent.
const NOMINATIM_BBOX_DEG = 0.07;

// Integrity gate: maximum acceptable distance from city pin when no
// stay_zone_boundary polygon is available. 5 km roughly matches the
// boundary cap policy in lib/measure.js. Cities whose stay zone is
// legitimately wider should have a boundary polygon — that's what it's for.
const INTEGRITY_KM = 5;

// Polite throttle between consecutive Overpass calls within a single city.
// The runner-level throttleMs (1500 ms) only pauses between cities, so this
// keeps us from flooding the public mirror on cities with many blocks.
const INNER_THROTTLE_MS = 700;

// Nominatim's public endpoint rate-limits at 1 req/s — be more careful.
const NOMINATIM_THROTTLE_MS = 1200;

export default {
  id: "blocks",
  describe: "Per-block coordinates for the Six Blocks chapter (Overpass + Nominatim, polygon-gated)",
  needs: ["lat", "lon"],
  writes: { columns: ["block_geometries"] },
  throttleMs: 1500,
  async run({ lat, lon, asOf }, city) {
    const blocks = city.blocks || [];
    if (!blocks.length) return { notes: "no blocks" };

    const bbox = [lat - BBOX_DEG, lon - BBOX_DEG, lat + BBOX_DEG, lon + BBOX_DEG];
    const cityCenter = { lat, lon };
    const boundary = city.stayZoneBoundary || city.stay_zone_boundary || null;
    const heart = parseHeartIntersection(city.heartIntersection || city.heart_intersection);
    const existing = Array.isArray(city.block_geometries) ? city.block_geometries : [];

    const geometries = [];
    const counts = { exact: 0, near: 0, between: 0, feature: 0, "heart-snap": 0, nominatim: 0, manual: 0, unresolved: 0 };

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const prior = existing[i];

      // Layer 0 — manual override. If a previous entry was hand-edited
      // (accuracy === "manual"), preserve it verbatim. Human judgment
      // is always above any geocoder.
      if (prior && prior.accuracy === "manual" && prior.lat != null) {
        geometries.push(prior);
        counts.manual++;
        continue;
      }

      const located = await locateBlock(block, bbox, cityCenter, { heart });
      const gated = enforceIntegrity(located, { cityCenter, boundary });
      geometries.push({ name: block, ...gated, asOf });
      counts[gated.accuracy] = (counts[gated.accuracy] || 0) + 1;
      await sleep(INNER_THROTTLE_MS);
    }

    const summary = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k}`)
      .join(", ");
    return {
      columns: { block_geometries: geometries },
      notes: `${blocks.length} blocks: ${summary}`,
    };
  },
};

// "Main St & California St" → { a: "Main St", b: "California St" }.
// Tolerates "and" or "/" instead of "&", and trims. Returns null if the
// heart string doesn't look like an intersection.
function parseHeartIntersection(heart) {
  if (!heart) return null;
  const m = String(heart).match(/^(.+?)\s*(?:&|\/|\sand\s)\s*(.+)$/i);
  if (!m) return null;
  return { a: m[1].trim(), b: m[2].trim() };
}

// True if the block's anchor street(s) match the heart intersection
// (order-insensitive, abbrev-tolerant). For "between" patterns, the
// main street must be one of the heart streets and at least one end
// street must be the other. For "pair" patterns, both sides must match.
function blockMatchesHeart(parsed, heart) {
  if (!heart) return false;
  const norm = (s) => expand(String(s || "")).toLowerCase().trim();
  const ha = norm(heart.a), hb = norm(heart.b);
  if (parsed.kind === "pair") {
    const a = norm(parsed.a), b = norm(parsed.b);
    return (a === ha && b === hb) || (a === hb && b === ha);
  }
  if (parsed.kind === "between") {
    const main = norm(parsed.main), endA = norm(parsed.endA), endB = norm(parsed.endB);
    if (main !== ha && main !== hb) return false;
    const other = main === ha ? hb : ha;
    return endA === other || endB === other;
  }
  return false;
}

// Post-resolve integrity gate. If a stay_zone_boundary polygon is set,
// the point must be inside it (no distance check needed — the polygon
// IS the meaning of "right place"). Otherwise, distance from city pin
// must be ≤ INTEGRITY_KM. Failures are demoted to "unresolved" with the
// rejected coord preserved in meta for debugging.
function enforceIntegrity(located, { cityCenter, boundary }) {
  if (located.accuracy === "unresolved" || located.lat == null) return located;
  if (boundary) {
    if (pointInGeoJSON(located.lat, located.lon, boundary)) return located;
    return {
      lat: null, lon: null,
      accuracy: "unresolved",
      source: located.source,
      meta: { ...(located.meta || {}), rejected: { lat: located.lat, lon: located.lon, reason: "outside stay_zone_boundary" } },
    };
  }
  const distKm = haversine(cityCenter.lat, cityCenter.lon, located.lat, located.lon);
  if (distKm <= INTEGRITY_KM) return located;
  return {
    lat: null, lon: null,
    accuracy: "unresolved",
    source: located.source,
    meta: { ...(located.meta || {}), rejected: { lat: located.lat, lon: located.lon, reason: `${distKm.toFixed(1)} km from city pin (> ${INTEGRITY_KM} km gate)` } },
  };
}

function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371, toR = (x) => x * Math.PI / 180;
  const dLat = toR(bLat - aLat), dLon = toR(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ── Parser ──────────────────────────────────────────────────────────────────
//
// Block strings come from human-written seed data, so we parse pragmatically
// rather than strictly. Patterns matched in priority order:
//
//   "X between Y and Z"   → between (two flanking intersections)
//   "X from Y to Z"       → between (equivalent phrasing)
//   "X along Y"           → landmark (pin at Y, X is the path)
//   "X around Y"          → landmark (pin at Y)
//   "X near Y"            → landmark
//   "X toward Y"          → landmark
//   "X into Y"            → landmark
//   "X at Y"              → pair (intersection)
//   "X & Y" / "X and Y"   → pair
//   "X / Y"               → pair
//   anything else         → single (a named feature in OSM)

function parseBlock(text) {
  // Drop trailing parentheticals: "Litchfield Green (Route 202 frame)" → "Litchfield Green"
  const t = text.replace(/\s*\([^)]*\)\s*$/, "").trim();

  let m;
  if ((m = t.match(/^(.+?)\s+between\s+(.+?)\s+and\s+(.+)$/i)))
    return { kind: "between", main: m[1], endA: m[2], endB: m[3] };
  if ((m = t.match(/^(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i)))
    return { kind: "between", main: m[1], endA: m[2], endB: m[3] };
  if ((m = t.match(/^(.+?)\s+(?:along|around|near|toward|into)\s+(.+)$/i)))
    return { kind: "landmark", path: m[1], target: m[2] };
  if ((m = t.match(/^(.+?)\s+at\s+(.+)$/i)))
    return { kind: "pair", a: m[1], b: m[2] };
  if ((m = t.match(/^(.+?)\s+&\s+(.+)$/)))
    return { kind: "pair", a: m[1], b: m[2] };
  if ((m = t.match(/^(.+?)\s+\/\s+(.+)$/)))
    return { kind: "pair", a: m[1], b: m[2] };
  if ((m = t.match(/^(.+?)\s+and\s+(.+)$/i)))
    return { kind: "pair", a: m[1], b: m[2] };
  return { kind: "single", name: t };
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

async function locateBlock(text, bbox, cityCenter, { heart } = {}) {
  const parsed = parseBlock(text);

  // Layer 1 — heart-snap. The heart_intersection was placed by a human
  // at insert time; if this block names the same two streets, trust it.
  if (blockMatchesHeart(parsed, heart)) {
    return {
      lat: cityCenter.lat,
      lon: cityCenter.lon,
      accuracy: "heart-snap",
      source: "city heart_intersection",
      meta: { heart: `${heart.a} & ${heart.b}` },
    };
  }

  try {
    if (parsed.kind === "between") {
      // Serialize so we don't fire concurrent Overpass queries — the public
      // mirror rate-limits aggressively (~2 RPS sustained).
      const a = await intersect(parsed.main, parsed.endA, bbox);
      const b = await intersect(parsed.main, parsed.endB, bbox);
      if (a && b) {
        return {
          lat: (a.lat + b.lat) / 2,
          lon: (a.lon + b.lon) / 2,
          accuracy: "between",
          source: SOURCE,
          sourceUrl: SOURCE_URL,
          meta: { ends: [a.meta?.matched || parsed.endA, b.meta?.matched || parsed.endB] },
        };
      }
      if (a || b) return { ...(a || b), accuracy: "near", meta: { ...(a || b).meta, partial: true } };
      const ff = await fallbackFeature(parsed.main, bbox, parsed.endA, parsed.endB);
      if (ff) return ff;
      return await nominatimFallback(text, parsed, bbox, cityCenter);
    }

    if (parsed.kind === "pair") {
      const r = await intersect(parsed.a, parsed.b, bbox);
      if (r) return r;
      // Either side might be a non-road feature (wharf, square, park).
      const fa = await featureCentroid(parsed.a, bbox);
      const fb = await featureCentroid(parsed.b, bbox);
      if (fa && fb) {
        return {
          lat: (fa.lat + fb.lat) / 2,
          lon: (fa.lon + fb.lon) / 2,
          accuracy: "near",
          source: SOURCE,
          sourceUrl: SOURCE_URL,
          meta: { feature: "midpoint", a: parsed.a, b: parsed.b },
        };
      }
      const ff = await fallbackFeature(parsed.a, bbox, parsed.b);
      if (ff) return ff;
      return await nominatimFallback(text, parsed, bbox, cityCenter);
    }

    if (parsed.kind === "landmark") {
      // Pin the landmark (Y in "X near Y") since it's the concrete destination.
      const r = await featureCentroid(parsed.target, bbox);
      if (r) return { ...r, meta: { ...r.meta, path: parsed.path, target: parsed.target } };
      const ff = await fallbackFeature(parsed.path, bbox, parsed.target);
      if (ff) return ff;
      return await nominatimFallback(text, parsed, bbox, cityCenter);
    }

    // single
    const r = await featureCentroid(parsed.name, bbox);
    if (r) return r;
    return await nominatimFallback(text, parsed, bbox, cityCenter);
  } catch (err) {
    return unresolved({ error: err?.message || String(err) });
  }
}

// Layer 4 — Nominatim bbox-bounded fallback. Used when Overpass exhausts
// every name-matching option. bounded=1 + viewbox physically constrain
// results to a ~7 km half-extent around the city pin, which rules out
// the cross-county collisions free-form Nominatim is prone to. Tries
// progressively simpler queries derived from the parsed block.
async function nominatimFallback(text, parsed, _bbox, cityCenter) {
  const queries = buildNominatimQueries(text, parsed);
  for (const q of queries) {
    const hit = await nominatimBounded(q, cityCenter);
    await sleep(NOMINATIM_THROTTLE_MS);
    if (hit) {
      return {
        lat: hit.lat,
        lon: hit.lon,
        accuracy: "nominatim",
        source: NOMINATIM_SOURCE,
        sourceUrl: NOMINATIM_URL,
        meta: { matched: q },
      };
    }
  }
  return unresolved({ tried: queries });
}

function unresolved(meta) {
  return { lat: null, lon: null, accuracy: "unresolved", source: null, meta };
}

// Ordered query list for the Nominatim fallback, from most specific to
// least. Each is paired with the city when called via nominatimBounded.
function buildNominatimQueries(text, parsed) {
  const out = new Set();
  const add = (s) => { if (s && s.trim().length >= 3) out.add(s.trim()); };

  if (parsed.kind === "between") {
    add(`${parsed.main} and ${parsed.endA}`);
    add(`${parsed.main} and ${parsed.endB}`);
    add(parsed.main);
    add(parsed.endA);
    add(parsed.endB);
  } else if (parsed.kind === "pair") {
    add(`${parsed.a} and ${parsed.b}`);
    add(`${parsed.b} and ${parsed.a}`);
    add(parsed.a);
    add(parsed.b);
  } else if (parsed.kind === "landmark") {
    add(parsed.target);
    add(parsed.path);
  } else {
    add(parsed.name);
  }
  // Cleanup pass: strip parens, "/", trailing descriptors
  const cleaned = String(text)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s*[/]\s*/g, " ")
    .replace(/\s+(?:downtown|edge|trailhead|area|district|corridor|loop|approach|boardwalk|pedestrian lane)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  add(cleaned);
  return [...out];
}

async function nominatimBounded(q, { lat, lon }) {
  // Nominatim viewbox: left,top,right,bottom (lon,lat,lon,lat)
  const left = lon - NOMINATIM_BBOX_DEG, right = lon + NOMINATIM_BBOX_DEG;
  const top = lat + NOMINATIM_BBOX_DEG, bottom = lat - NOMINATIM_BBOX_DEG;
  const params = new URLSearchParams({
    q, format: "json", limit: "1",
    viewbox: `${left},${top},${right},${bottom}`,
    bounded: "1",
  });
  const url = `${NOMINATIM_URL}/search?${params}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA } });
      if (r.status === 429) { await sleep(30000); continue; }
      const text = await r.text();
      if (!text || text.trim().startsWith("<")) { await sleep(30000); continue; }
      const d = JSON.parse(text);
      const hit = (Array.isArray(d) ? d : []).find((h) => h?.lat && h?.lon);
      return hit ? { lat: +hit.lat, lon: +hit.lon } : null;
    } catch { return null; }
  }
  return null;
}

// ── Overpass queries ────────────────────────────────────────────────────────

async function intersect(s1, s2, bbox) {
  // Try the form most likely to match OSM data first (expanded), then the
  // original (in case OSM has a less-common abbreviated form on file).
  const variants1 = nameVariants(s1.trim()).reverse();
  const variants2 = nameVariants(s2.trim()).reverse();
  // Match indices: try (expanded1, expanded2) first; only if both have an
  // expansion, fall back to the original pair as a second attempt.
  const attempts = [[variants1[0], variants2[0]]];
  if (variants1[1] || variants2[1]) attempts.push([variants1[1] || variants1[0], variants2[1] || variants2[0]]);
  for (const [n1, n2] of attempts) {
    const r = await tryIntersect(n1, n2, bbox);
    await sleep(INNER_THROTTLE_MS);
    if (r) return r;
  }
  return null;
}

async function tryIntersect(name1, name2, bbox) {
  // Serialized — Overpass public mirror prefers sequential requests.
  const A = await nodesOfWay(name1, bbox);
  await sleep(INNER_THROTTLE_MS);
  const B = await nodesOfWay(name2, bbox);
  if (!A.length || !B.length) return null;
  const best = closestPair(A, B);
  if (!best) return null;
  const distM = best.dist * 111000;
  if (distM < 10) {
    return {
      lat: best.midLat,
      lon: best.midLon,
      accuracy: "exact",
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      meta: { matched: `${name1} ∩ ${name2}` },
    };
  }
  if (distM < 60) {
    return {
      lat: best.midLat,
      lon: best.midLon,
      accuracy: "near",
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      meta: { matched: `${name1} ∩ ${name2}`, gapM: Math.round(distM) },
    };
  }
  return null;
}

async function nodesOfWay(name, bbox) {
  const q = `[out:json][timeout:25];
way["name"="${escapeOverpass(name)}"](${bbox.join(",")});
node(w);
out;`;
  const d = await overpass(q);
  if (!d?.elements) return [];
  return d.elements
    .filter((e) => e.type === "node" && typeof e.lat === "number")
    .map((n) => ({ lat: n.lat, lon: n.lon }));
}

async function featureCentroid(name, bbox) {
  for (const n of nameVariants(name.trim())) {
    const q = `[out:json][timeout:25];
nwr["name"="${escapeOverpass(n)}"](${bbox.join(",")});
out center 1;`;
    const d = await overpass(q);
    await sleep(INNER_THROTTLE_MS);
    if (!d?.elements?.length) continue;
    const el = d.elements[0];
    let lat, lon;
    if (el.type === "node") { lat = el.lat; lon = el.lon; }
    else if (el.center) { lat = el.center.lat; lon = el.center.lon; }
    if (lat != null && lon != null) {
      return {
        lat, lon,
        accuracy: "feature",
        source: SOURCE,
        sourceUrl: SOURCE_URL,
        meta: { osmType: el.type, osmId: el.id, matched: n },
      };
    }
  }
  return null;
}

// Layer 3 helper: try the main name as a feature centroid, then any
// alternate names. Returns null if Overpass can't match anything — the
// caller (locateBlock) then drops down to the Nominatim fallback layer.
// (No city-center fallback any more — that was the silent "looks
// resolved but is just the pin" failure mode the new gate fixes.)
async function fallbackFeature(name, bbox, ...alsoNames) {
  const r = await featureCentroid(name, bbox);
  if (r) return r;
  for (const alt of alsoNames) {
    if (!alt) continue;
    const r2 = await featureCentroid(alt, bbox);
    if (r2) return r2;
  }
  return null;
}

// ── Name normalization ─────────────────────────────────────────────────────
//
// OSM uses full street types ("Boulevard", "Avenue") while authors usually
// write abbreviations ("Blvd", "Ave"). Generate both spellings of each name
// so a single query attempt can match either form.

const ABBREV = {
  St: "Street",
  Ave: "Avenue",
  Blvd: "Boulevard",
  Rd: "Road",
  Dr: "Drive",
  Ln: "Lane",
  Sq: "Square",
  Ct: "Court",
  Pl: "Place",
  Pkwy: "Parkway",
  Hwy: "Highway",
  Ter: "Terrace",
  Mt: "Mount",
};

function expand(name) {
  let out = name;
  for (const [short, long] of Object.entries(ABBREV)) {
    out = out.replace(new RegExp(`\\b${short}\\.?\\b`, "g"), long);
  }
  return out;
}

function nameVariants(name) {
  const exp = expand(name);
  return exp === name ? [name] : [name, exp];
}

function namePairs(s1, s2) {
  const v1 = nameVariants(s1);
  const v2 = nameVariants(s2);
  const pairs = [];
  for (const a of v1) for (const b of v2) pairs.push([a, b]);
  return pairs;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeOverpass(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function closestPair(A, B) {
  let best = null;
  for (const a of A) {
    for (const b of B) {
      const d = Math.hypot(a.lat - b.lat, a.lon - b.lon);
      if (!best || d < best.dist) best = { dist: d, a, b };
    }
  }
  if (!best) return null;
  return {
    dist: best.dist,
    midLat: (best.a.lat + best.b.lat) / 2,
    midLon: (best.a.lon + best.b.lon) / 2,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
