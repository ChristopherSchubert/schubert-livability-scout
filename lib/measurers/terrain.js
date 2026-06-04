// lib/measurers/terrain.js — DEM-based terrain context.
//
// Samples elevation on a polar grid around the heart pin so the chip rules
// can tell mountain-IN from mountain-VIEWED (the existing skyline metric
// captures the latter). Powers Mountain / Foothills / Valley / Plateau /
// Plains chips.
//
//   heart_elev_m        — elevation of the heart pin
//   peak_15km_m         — max elevation within 15 km
//   peak_rise_15km_m    — peak_15km - heart_elev (the rise you see)
//   relief_10km_m       — max - min elevation within 10 km
//   slope_p90_deg       — 90th-percentile local slope between adjacent samples
//
// Source: Open-Meteo elevation (free, no key) with opentopodata SRTM fallback.

import { elevations, destPoint, haversine } from "../measure.js";

const SOURCE = "Open-Meteo elevation (SRTM)";
const SOURCE_URL = "https://open-meteo.com/en/docs/elevation-api";

// 16 azimuths × 5 distance rings (1, 3, 6, 10, 15 km) = 80 points + heart = 81.
// One batch under Open-Meteo's 100-point limit.
const AZ = Array.from({ length: 16 }, (_, i) => i * 22.5);
const DIST_M = [1000, 3000, 6000, 10000, 15000];

function p90(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(0.9 * s.length));
  return s[idx];
}

export default {
  id: "terrain",
  describe: "Heart elevation, nearby peak rise, local relief, slope distribution (DEM)",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["terrain"],
  },
  throttleMs: 1500,
  async run({ lat, lon, asOf }) {
    const points = [[lat, lon]];
    for (const az of AZ) for (const d of DIST_M) points.push(destPoint(lat, lon, az, d));
    const elev = await elevations(points);
    if (!elev[0] && elev[0] !== 0) return { notes: "no elevation for heart point" };

    const heart = elev[0];
    let max15 = -Infinity, min10 = Infinity, max10 = -Infinity;
    const slopes = [];
    for (let i = 1; i < points.length; i++) {
      const e = elev[i]; if (e == null) continue;
      const azIdx = Math.floor((i - 1) / DIST_M.length);
      const dIdx = (i - 1) % DIST_M.length;
      const dM = DIST_M[dIdx];
      max15 = Math.max(max15, e);
      if (dM <= 10000) { min10 = Math.min(min10, e); max10 = Math.max(max10, e); }
      // Slope between consecutive points along the same azimuth.
      if (dIdx > 0) {
        const prev = elev[i - 1];
        if (prev != null) {
          const dRing = DIST_M[dIdx] - DIST_M[dIdx - 1];
          const slope = Math.atan(Math.abs(e - prev) / dRing) * 180 / Math.PI;
          slopes.push(slope);
        }
      } else {
        // Innermost ring → slope from heart
        const slope = Math.atan(Math.abs(e - heart) / DIST_M[0]) * 180 / Math.PI;
        slopes.push(slope);
      }
    }

    if (!Number.isFinite(max15)) return { notes: "no terrain samples returned" };

    const terrain = {
      heart_elev_m: Math.round(heart),
      peak_15km_m: Math.round(max15),
      peak_rise_15km_m: Math.round(max15 - heart),
      relief_10km_m: Number.isFinite(min10) ? Math.round(max10 - min10) : null,
      slope_p90_deg: slopes.length ? Math.round(p90(slopes) * 10) / 10 : null,
    };
    return {
      measuredMetrics: {
        terrain: { value: terrain, asOf, source: SOURCE, sourceUrl: SOURCE_URL },
      },
      notes: `elev ${terrain.heart_elev_m}m | peak15 +${terrain.peak_rise_15km_m}m | ` +
             `relief10 ${terrain.relief_10km_m ?? "?"}m | slopeP90 ${terrain.slope_p90_deg ?? "?"}°`,
    };
  },
};
