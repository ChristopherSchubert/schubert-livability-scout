// lib/measurers/census.js — US Census ACS tract-level metrics.
//
// Wraps measureCensus from lib/measure.js. Needs CENSUS_API_KEY in env.
// Two-step: (1) reverse-geocode coords to a tract, then (2) pull ACS 5-yr
// detailed tables for that tract. Per-city tract id is saved on each metric's
// envelope as a meta field so provenance is auditable.
//
// Five taxonomy metrics under Realness + Fabric:
//   Realness: core_density, owner_occ_pct, seasonal_vac_pct, median_price_usd
//   Fabric:   pre1940_pct
// Plus three bonus metrics that don't appear in the headline taxonomy but feed
// chips / detail page: median_income_usd, walk_transit_commute_pct,
// price_to_income_ratio.

import { measureCensus } from "../measure.js";

const TAXONOMY_KEYS = [
  "core_density", "owner_occ_pct", "seasonal_vac_pct", "median_price_usd", "pre1940_pct",
];
const BONUS_KEYS = [
  "median_income_usd", "walk_transit_commute_pct", "price_to_income_ratio",
];

export default {
  id: "census",
  describe: "US Census ACS tract (density, owner/seasonal/pre1940 shares, median price + income)",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: [...TAXONOMY_KEYS, ...BONUS_KEYS],
  },
  // Census Geocoder + ACS API are both generous (10k+/day). 800ms is a polite
  // floor.
  throttleMs: 800,
  async run({ lat, lon, asOf, env }) {
    const apiKey = env?.CENSUS_API_KEY;
    if (!apiKey) return { notes: "CENSUS_API_KEY not set — skipped" };
    const { metrics, tract } = await measureCensus(lat, lon, apiKey, { asOf });
    if (!Object.keys(metrics).length) return { notes: tract ? `tract ${tract} returned no metrics` : "no tract for these coords" };
    // measureCensus already returns envelopes; just merge.
    return {
      measuredMetrics: metrics,
      notes: `tract ${tract} | dens ${metrics.core_density?.value ?? "?"}/sqmi | owner ${metrics.owner_occ_pct?.value ?? "?"}% | seasonal ${metrics.seasonal_vac_pct?.value ?? "?"}%`,
    };
  },
};
