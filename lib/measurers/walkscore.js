// lib/measurers/walkscore.js — Walk Score (errand-walkability, 0–100).
//
// Wraps measureWalkScore from lib/measure.js. Needs WALKSCORE_API_KEY in env
// and the city's name as the address. The API's status code 1 = success;
// anything else (rate-limit, bad address, no key) yields no write rather
// than a bogus zero.

import { measureWalkScore, syntheticWalkScore, inWalkScoreCoverage } from "../measure.js";

// Reads the OSM-core metrics a synthetic Walk Score needs out of the run's
// merged metric state (prior DB values + anything osm_core emitted earlier
// THIS run — see _runner.js ctx.current). Returns the bare {key: value} shape
// syntheticWalkScore expects.
function osmInputs(current = {}) {
  const v = (k) => current?.[k]?.value ?? null;
  return {
    cafe_n: v("cafe_n"), bar_n: v("bar_n"), rest_n: v("rest_n"),
    daily_needs_n: v("daily_needs_n"), intersection_den: v("intersection_den"),
    mean_block_m: v("mean_block_m"), carfree_frac: v("carfree_frac"),
  };
}

export default {
  id: "walkscore",
  describe: "Walk Score 0–100 (real API in US/CA/AU/NZ; synthetic OSM proxy elsewhere)",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["walk_score"],
  },
  // Walk Score's free tier allows ~5000/day; 1s between calls keeps us well
  // under the per-second burst limit.
  throttleMs: 1000,
  async run({ lat, lon, name, asOf, env, current }) {
    const apiKey = env?.WALKSCORE_API_KEY;
    // Out of Walk Score's coverage → compute the synthetic proxy from OSM. This
    // path doesn't need an API key. (See measure.js: the real API returns junk
    // for non-US cities, e.g. Piran scoring 39.)
    if (!inWalkScoreCoverage(lat, lon)) {
      const inputs = osmInputs(current);
      if (inputs.intersection_den == null && inputs.cafe_n == null) {
        return { notes: "synthetic Walk Score deferred — run osm_core first" };
      }
      const value = syntheticWalkScore(inputs);
      return {
        measuredMetrics: { walk_score: {
          value, asOf,
          source: "synthetic OSM proxy (Walk Score-style)",
          sourceUrl: "https://www.openstreetmap.org",
          meta: { synthetic: true, reason: "outside Walk Score coverage (US/CA/AU/NZ)" },
        } },
        notes: `Walk Score ${value} (synthetic — out of coverage)`,
      };
    }
    if (!apiKey) return { notes: "WALKSCORE_API_KEY not set — skipped" };
    const address = name || `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const metrics = await measureWalkScore(lat, lon, address, apiKey, { asOf });
    if (!metrics.walk_score) return { notes: "Walk Score: no usable response" };
    return {
      measuredMetrics: { walk_score: metrics.walk_score },
      notes: `Walk Score ${metrics.walk_score.value}`,
    };
  },
};
