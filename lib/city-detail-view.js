// Shared view-model for the magazine city-detail page.
//
// This is the single shaper that turns a city object (already mapped from a
// Supabase row via rowToCity) into the chapter-ready envelope the redesigned
// detail page consumes. Both code paths use it, so they produce byte-identical
// chapter props:
//
//   • app/api/mockup-data/route.js — server route the static mockup fetches
//     and (soon) any non-React consumer.
//   • the live React chapters at /cities/[slug] — call buildCityDetailView()
//     in-process from the already-loaded cityItem (no network hop).
//
// Pure + isomorphic: imports only domain helpers, no pg / next / fs. Every
// number here is computed from cited measured_metrics or visit-climate data —
// nothing hand-entered (see the project's no-fake-data rule).

import {
  axisRollup,
  weightedAxisScore,
  monthlyComfortScores,
  cityVisitWindow,
  metricTaxonomy,
  metricScore,
  metricScoreBands,
  MONTHS,
} from "./planner-data.js";
import { chipsFor } from "./chips.js";

// Equal-weight measured composite — same engine as the Detail / Board / Visit
// scores. Calibrate is the only surface that applies learned per-axis weights.
export const EQUAL_WEIGHTS = { setting: 1, aliveness: 1, fabric: 1, realness: 1, january: 1 };

// Walk a visit-climate series and return the month where `pickValue` is most
// extreme under `cmp` (e.g. coldest low, hottest high). Null if no data.
export function climateExtreme(visitClimate, pickValue, cmp) {
  if (!Array.isArray(visitClimate)) return null;
  let bestIdx = -1;
  let bestVal = null;
  for (let i = 0; i < visitClimate.length; i++) {
    const v = pickValue(visitClimate[i]);
    if (v == null) continue;
    if (bestVal == null || cmp(v, bestVal)) { bestVal = v; bestIdx = i; }
  }
  if (bestIdx < 0) return null;
  return { monthIdx: bestIdx, month: MONTHS[bestIdx], value: bestVal };
}

// The four worst-month-per-direction diagnostics the "When to go" chapter uses
// (coldest / hottest / wettest / darkest), each as { monthIdx, month, value }.
export function extremesFor(city) {
  return {
    coldest: climateExtreme(city.visitClimate, (m) => m?.lo, (a, b) => a < b),
    hottest: climateExtreme(city.visitClimate, (m) => m?.hi, (a, b) => a > b),
    wettest: climateExtreme(city.visitClimate, (m) => m?.precipIn, (a, b) => a > b),
    darkest: climateExtreme(city.visitClimate, (m) => m?.daylightHr, (a, b) => a < b),
  };
}

// One metric, shaped for the "By the numbers" chapter: raw value, its 0–10
// score against the fixed band, a 0–100 bar percentage, plus provenance
// (asOf / source) and the band edges so the UI can render "good as it matters."
export function metricSnapshot(city, m) {
  const dp = city.measuredMetrics?.[m.key];
  const value = dp?.value ?? null;
  const score = metricScore(value, m.key);
  const band = metricScoreBands[m.key];
  return {
    key: m.key,
    label: m.label,
    tagline: m.tagline || null,
    unit: m.unit,
    value,
    score: score != null ? Math.round(score * 10) / 10 : null,
    barPct: score != null ? Math.round(score * 10) : null,
    direction: m.dir,
    asOf: dp?.asOf ?? null,
    source: dp?.source || m.source,
    band: band ? { zeroAt: band[0], fullAt: band[1] } : null,
  };
}

// The five axes, each with its 0–10 rollup and its constituent metric snapshots.
export function axesSnapshot(city) {
  const rollup = axisRollup(city);
  return metricTaxonomy.map((group) => ({
    axis: group.axis,
    label: group.label,
    score: rollup[group.axis],
    metrics: group.metrics.map((m) => metricSnapshot(city, m)),
  }));
}

// The full chapter-ready view-model for one city. `city` is a rowToCity()
// object; `slug` is passed explicitly because the canonical city object derives
// its slug from the name, while the DB stores an explicit slug column.
export function buildCityDetailView(city, { slug } = {}) {
  return {
    ...city,
    slug: slug ?? city.slug ?? null,
    measuredScore: weightedAxisScore(city, EQUAL_WEIGHTS),
    monthlyComfort: monthlyComfortScores(city),
    visitWindow: cityVisitWindow(city),
    extremes: extremesFor(city),
    chips: chipsFor(city),
    axes: axesSnapshot(city),
    horizonFeatures: city.horizonFeatures ?? null,
  };
}

// The compact homebase (Allison Park) comparison the "When to go" chapter
// renders deltas against. Only the fields the chapter needs.
export function buildHomebaseView(homebase, { slug } = {}) {
  if (!homebase) return null;
  return {
    name: homebase.name,
    slug: slug ?? homebase.slug ?? null,
    visitClimate: homebase.visitClimate,
    extremes: extremesFor(homebase),
  };
}
