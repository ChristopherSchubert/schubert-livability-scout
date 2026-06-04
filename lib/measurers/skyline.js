// lib/measurers/skyline.js — steepest visible horizon rise (degrees).
//
// Wraps measureSkyline from lib/measure.js. Uses Open-Meteo elevation
// (free, no key) with opentopodata SRTM fallback. Not OSM-backed, so
// OVERPASS_URL doesn't apply.
//
// The peer measurer is `horizon` (visible named peaks + horizon occupancy
// percent). They split because one is a single closed-form angle from a
// dense elevation grid and the other involves Overpass + occlusion testing.

import { measureSkyline } from "../measure.js";

export default {
  id: "skyline",
  describe: "Steepest visible mountain backdrop (line-of-sight + earth curvature)",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["skyline_deg"],
  },
  throttleMs: 1500,
  async run({ lat, lon, asOf }) {
    const { metrics } = await measureSkyline(lat, lon, { asOf });
    if (!metrics?.skyline_deg) return { notes: "no skyline angle (no DEM samples?)" };
    return {
      measuredMetrics: { skyline_deg: metrics.skyline_deg },
      notes: `${metrics.skyline_deg.value}° max backdrop`,
    };
  },
};
