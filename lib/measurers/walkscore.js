// lib/measurers/walkscore.js — Walk Score (errand-walkability, 0–100).
//
// Wraps measureWalkScore from lib/measure.js. Needs WALKSCORE_API_KEY in env
// and the city's name as the address. The API's status code 1 = success;
// anything else (rate-limit, bad address, no key) yields no write rather
// than a bogus zero.

import { measureWalkScore } from "../measure.js";

export default {
  id: "walkscore",
  describe: "Walk Score 0–100 (errand walkability, address-aware)",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["walk_score"],
  },
  // Walk Score's free tier allows ~5000/day; 1s between calls keeps us well
  // under the per-second burst limit.
  throttleMs: 1000,
  async run({ lat, lon, name, asOf, env }) {
    const apiKey = env?.WALKSCORE_API_KEY;
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
