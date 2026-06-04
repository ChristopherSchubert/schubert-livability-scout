// lib/measurers/blocks.js — per-block intersection coordinates from OSM.
//
// Each city has a `blocks` array — short stretch descriptions like
// "Thames St between Memorial Blvd and America's Cup Ave" or
// "Lewes Beach boardwalk". This measurer parses each string, queries
// Overpass for the named features within a city-centered bbox, and writes
// `block_geometries` — an array parallel to `blocks`:
//
//   [{ name, lat, lon, accuracy, source, meta? }, ...]
//
// `accuracy` is one of:
//   "exact"   — true shared node between two named ways (gap < 10 m)
//   "near"    — closest nodes between two named ways are 10–60 m apart
//   "between" — midpoint of two intersections along a stretch
//   "feature" — centroid of a single named OSM feature (no intersection)
//   "fallback"— Overpass returned nothing useful; pin at city.lat/lon
//
// Idempotent through the standard hasAllOutputs check on `block_geometries`.
//
// Set OVERPASS_URL=http://localhost:12345/api/interpreter to use the local
// Docker container instead of the public mirror.

import { overpass } from "../measure.js";

const SOURCE = "OpenStreetMap (Overpass)";
const SOURCE_URL = "https://overpass-api.de";

// Half-width of the bbox around city.lat/lon used for every Overpass query.
// 0.05° ≈ 5.5 km at mid-latitudes. Generous enough to cover the stay zone
// without spilling into neighbor cities for most US cases.
const BBOX_DEG = 0.05;

// Polite throttle between consecutive Overpass calls within a single city.
// The runner-level throttleMs (1500 ms) only pauses between cities, so this
// keeps us from flooding the public mirror on cities with many blocks.
const INNER_THROTTLE_MS = 700;

export default {
  id: "blocks",
  describe: "Per-block intersection coordinates from OSM (Overpass)",
  needs: ["lat", "lon"],
  writes: { columns: ["block_geometries"] },
  throttleMs: 1500,
  async run({ lat, lon, asOf }, city) {
    const blocks = city.blocks || [];
    if (!blocks.length) return { notes: "no blocks" };

    const bbox = [lat - BBOX_DEG, lon - BBOX_DEG, lat + BBOX_DEG, lon + BBOX_DEG];
    const geometries = [];
    const counts = { exact: 0, near: 0, between: 0, feature: 0, fallback: 0 };

    for (const block of blocks) {
      const located = await locateBlock(block, bbox, { lat, lon });
      geometries.push({ name: block, ...located, asOf });
      counts[located.accuracy] = (counts[located.accuracy] || 0) + 1;
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

async function locateBlock(text, bbox, cityCenter) {
  const parsed = parseBlock(text);

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
      return await fallbackFeature(parsed.main, bbox, cityCenter);
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
      return await fallbackFeature(parsed.a, bbox, cityCenter, parsed.b);
    }

    if (parsed.kind === "landmark") {
      // Pin the landmark (Y in "X near Y") since it's the concrete destination.
      const r = await featureCentroid(parsed.target, bbox);
      if (r) return { ...r, meta: { ...r.meta, path: parsed.path, target: parsed.target } };
      return await fallbackFeature(parsed.path, bbox, cityCenter, parsed.target);
    }

    // single
    const r = await featureCentroid(parsed.name, bbox);
    if (r) return r;
    return cityCenterFallback(cityCenter, { tried: parsed.name });
  } catch (err) {
    return cityCenterFallback(cityCenter, { error: err?.message || String(err) });
  }
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

async function fallbackFeature(name, bbox, cityCenter, also) {
  const r = await featureCentroid(name, bbox);
  if (r) return r;
  if (also) {
    const r2 = await featureCentroid(also, bbox);
    if (r2) return r2;
  }
  return cityCenterFallback(cityCenter, { tried: name, alsoTried: also });
}

function cityCenterFallback({ lat, lon }, meta) {
  return {
    lat, lon,
    accuracy: "fallback",
    source: "city-center",
    meta,
  };
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
