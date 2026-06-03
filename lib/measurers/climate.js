// lib/measurers/climate.js — NASA POWER (MERRA-2) daily archive.
//
// Reuses lib/measure.js#measureClimate, which computes days_below_freeze,
// clear_days, dec_daylight_hr, pleasant_days, hot_days, and the
// climate_extremes envelope (jan_mean_f, jul_mean_f, jul_dewpoint_f,
// annual_precip_in) plus the 12-month normals written into
// cities.visit_climate. Annual snowfall is a sibling metric filled by the
// snowfall measurer from NOAA NCEI normals (POWER has no daily snow).

import { measureClimate } from "../measure.js";

export default {
  id: "climate",
  describe: "NASA POWER (MERRA-2) — freeze + clear days, monthly normals, extremes",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["days_below_freeze", "clear_days", "dec_daylight_hr", "pleasant_days", "hot_days", "climate_extremes"],
    columns: ["visit_climate"],
  },
  // POWER has no published rate limit, only a "don't hammer the same point"
  // warning. 800ms is conservative and matches the throttle used elsewhere.
  throttleMs: 800,
  async run({ lat, lon, asOf }) {
    const { metrics, visitClimate } = await measureClimate(lat, lon, { asOf });
    const patch = { measuredMetrics: {}, notes: null };
    for (const [k, v] of Object.entries(metrics || {})) {
      if (v != null) patch.measuredMetrics[k] = v;
    }
    if (visitClimate) patch.visitClimate = visitClimate;
    const ext = metrics.climate_extremes?.value;
    if (ext) {
      patch.notes = `jan ${ext.jan_mean_f ?? "?"}°F | jul ${ext.jul_mean_f ?? "?"}°F | ` +
        `precip ${ext.annual_precip_in ?? "?"}in`;
    }
    return patch;
  },
};
