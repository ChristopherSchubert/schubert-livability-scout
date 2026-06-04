// lib/measurers/osm-core.js — the 700 m walking core, OSM-derived.
//
// Wraps the existing osmMetrics + measureBuildingCoverage functions in
// lib/measure.js. Both go through overpass(), so OVERPASS_URL is honored —
// when the local container is up, this measurer transparently uses it
// instead of the public mirror.
//
// Writes 9 taxonomy metrics in one measurer:
//   Aliveness:  cafe_n, bar_n, rest_n
//   Realness:   daily_needs_n
//   Fabric:     intersection_den, mean_block_m, carfree_frac, street_km,
//               bldg_coverage
//
// Walk Score (also Aliveness) lives in its own measurer because it hits a
// different, key-gated API.

import { osmMetrics, measureBuildingCoverage, landFractionInDisk } from "../measure.js";

const SOURCE = "OpenStreetMap (Overpass)";
const SOURCE_URL = "https://overpass-api.de";
const KEYS = [
  "cafe_n", "bar_n", "rest_n", "daily_needs_n",
  "intersection_den", "mean_block_m", "carfree_frac", "street_km",
];

export default {
  id: "osm_core",
  describe: "OSM 700 m core: cafés, restaurants, daily needs, street fabric + building coverage",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: [...KEYS, "bldg_coverage"],
  },
  // Three Overpass calls per city (POIs+streets, buildings, water mask). Local
  // container shrugs this off; public mirror throttles at ~1 city / 5 s, which
  // is why this measurer is intended to be run with OVERPASS_URL pointing at
  // the local container.
  throttleMs: 800,
  async run({ lat, lon, asOf }) {
    // Compute land fraction first; the disk area for density metrics shrinks
    // accordingly for peninsula / lakeside cores. Defaults to 1.0 on failure.
    const landFraction = await landFractionInDisk(lat, lon);
    const [raw, bldg] = await Promise.all([
      osmMetrics(lat, lon, { landFraction }),
      measureBuildingCoverage(lat, lon, { landFraction }),
    ]);
    const measuredMetrics = {};
    for (const k of KEYS) {
      if (raw[k] != null) {
        measuredMetrics[k] = { value: raw[k], asOf, source: SOURCE, sourceUrl: SOURCE_URL };
      }
    }
    if (bldg.bldg_coverage?.value != null) {
      measuredMetrics.bldg_coverage = {
        value: bldg.bldg_coverage.value,
        asOf, source: SOURCE, sourceUrl: SOURCE_URL,
      };
    }
    if (!Object.keys(measuredMetrics).length) return { notes: "no OSM features in 700 m core" };
    const landPct = Math.round(landFraction * 100);
    const note = `cafe ${raw.cafe_n ?? "?"} | rest ${raw.rest_n ?? "?"} | bar ${raw.bar_n ?? "?"} | needs ${raw.daily_needs_n ?? "?"} | bldg ${bldg.bldg_coverage?.value ?? "?"} | land ${landPct}%`;
    return { measuredMetrics, notes: note };
  },
};
