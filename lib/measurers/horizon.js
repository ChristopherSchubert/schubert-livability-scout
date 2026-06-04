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
    measuredMetrics: ["mtn_horizon_pct", "skyline_deg"],
    columns: ["horizon_features"],
  },
  // Open-Meteo + opentopodata fair-use — keep gentle.
  throttleMs: 1500,
  async run({ lat, lon, asOf, current }) {
    const horizon = await measureHorizonPeaks(lat, lon, { asOf });
    if (!horizon) return { notes: "horizon peaks fetch failed" };
    const measuredMetrics = {
      mtn_horizon_pct: { value: horizon.occupancyPct, asOf, source: SOURCE, sourceUrl: SOURCE_URL },
    };
    // Upgrade skyline_deg if the steepest visible named peak beats the
    // ray-sampled value the skyline measurer found. Ray sampling lands on
    // whatever ground each azimuth intersects and routinely misses the
    // actual summit by hundreds of metres of horizontal offset (Bled: rays
    // hit 7.2°; Stol summit presents 11.3°).
    const raySkyline = current?.skyline_deg?.value ?? 0;
    if (horizon.bestVisibleAngle > raySkyline) {
      measuredMetrics.skyline_deg = {
        value: horizon.bestVisibleAngle,
        asOf,
        source: "Open-Meteo elevation + OSM peaks (best visible summit, occlusion-tested)",
        sourceUrl: SOURCE_URL,
      };
    }
    return {
      measuredMetrics,
      columns: { horizon_features: horizon },
      notes: `${horizon.peaks.length} peaks, ${horizon.occupancyPct}% occ, best ${horizon.bestVisibleAngle}°`,
    };
  },
};
