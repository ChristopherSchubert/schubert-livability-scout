// lib/measurers/horizon.js — visible named peaks + horizon occupancy.
//
// Computes how much of the surrounding horizon is filled by mountains you can
// actually see from the heart. Writes two outputs:
//   • measured_metrics.mtn_horizon_pct — share of 16 compass sectors with a
//     visible peak rising ≥ 2° (the Setting axis input)
//   • horizon_features (column)        — the visible peak list itself (name,
//     elevation, distance, bearing, looms-angle) for the city detail page
//
// Source: OSM peaks (Overpass) + Open-Meteo elevation, with opentopodata SRTM
// fallback handled inside measure.js#elevations. Flatland cities (zero peaks
// within 90 km) record 0% rather than null — see measureHorizonPeaks.

import { measureHorizonPeaks } from "../measure.js";

const SOURCE = "Open-Meteo elevation + OSM peaks";
const SOURCE_URL = "https://open-meteo.com/en/docs/elevation-api";

export default {
  id: "horizon",
  describe: "Visible named peaks + horizon occupancy (line-of-sight, occlusion-tested)",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["mtn_horizon_pct"],
    columns: ["horizon_features"],
  },
  // Open-Meteo + opentopodata fair-use — keep gentle.
  throttleMs: 1500,
  async run({ lat, lon, asOf }) {
    const horizon = await measureHorizonPeaks(lat, lon, { asOf });
    if (!horizon) return { notes: "horizon peaks fetch failed" };
    return {
      measuredMetrics: {
        mtn_horizon_pct: { value: horizon.occupancyPct, asOf, source: SOURCE, sourceUrl: SOURCE_URL },
      },
      columns: {
        horizon_features: horizon,
      },
      notes: `${horizon.peaks.length} peaks, ${horizon.occupancyPct}% occ`,
    };
  },
};
