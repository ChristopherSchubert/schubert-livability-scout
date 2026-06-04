// lib/measurers/water.js — nearest major water body + grandeur of nearby water.
//
// Writes water_dist_m with meta = { kind, name } so chip rules can decide
// Coastal vs Riverfront vs Lakefront vs Bayfront without re-querying OSM.
// Bayfront/Harbor specifically read meta.name (matches /bay|sound|harbor/i)
// because OSM tags coast/bay/strait under one merged "sea" body — the name
// carries the specificity.
//
// TODO(local-overpass): nearestWater hits Overpass via lib/measure.js#overpass,
// which already respects OVERPASS_URL env. When the local container at
// localhost:12345 is healthy, this measurer transparently uses it; no change
// here needed.

import { nearestWater } from "../measure.js";

const SOURCE = "OpenStreetMap (Overpass)";
const SOURCE_URL = "https://overpass-api.de";

export default {
  id: "water",
  describe: "Nearest major water body (sea / river / lake) + grandeur",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["water_dist_m", "water_extent_km2"],
  },
  // Overpass is the bottleneck — pause after each call so we stay polite to
  // the public mirror. The local container ignores rate limits but the sleep
  // is cheap there.
  throttleMs: 1500,
  async run({ lat, lon, asOf }) {
    const w = await nearestWater(lat, lon);
    const measuredMetrics = {};
    if (w.dist != null) {
      measuredMetrics.water_dist_m = {
        value: Math.round(w.dist),
        asOf, source: SOURCE, sourceUrl: SOURCE_URL,
        // point preserved so the city map can draw the line to the water edge.
        point: w.point || undefined,
        meta: { kind: w.kind, name: w.name },
      };
    }
    if (w.extentKm2 != null) {
      measuredMetrics.water_extent_km2 = {
        value: Math.round(w.extentKm2 * 10) / 10,
        asOf, source: SOURCE, sourceUrl: SOURCE_URL,
      };
    }
    if (!Object.keys(measuredMetrics).length) return { notes: "no water within 15 km" };
    const m = measuredMetrics.water_dist_m;
    const note = m
      ? `${m.value}m to ${m.meta?.kind || "?"}${m.meta?.name ? ` "${m.meta.name}"` : ""}`
      : "extent only";
    return { measuredMetrics, notes: note };
  },
};
