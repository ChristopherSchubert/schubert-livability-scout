// Measured-metrics core — taxonomy, scoring bands, axis rollups, learned
// weights — extracted from lib/planner-data.js (godfile split, #47).
// Isomorphic: no React, no DB. Re-exported from planner-data.js so existing
// import paths keep working. Guarded by test/scoring.test.mjs.
import { surveyComplete } from "./survey.js";

// Per-user Calibrate weights. Stored per-user in Supabase. Keyed by the five
// measured axes (Calibrate ranks on these); learned weights override them once
// enough gut ratings exist. Defaults to 1 per axis.
export function defaultWeights() {
  return Object.fromEntries(calibrateAxes.map(([key]) => [key, 1]));
}

// ── OBJECTIVE METRIC TAXONOMY ───────────────────────────────────────────
// Every granular data point from the measurement pipeline, grouped under the
// five axes (same axes the felt questionnaire uses, so felt vs measured are
// directly comparable). Each metric carries ONE canonical source — the
// handoff doc's hard rule: a value is either computed from a cited source or
// flagged unknown, never a hand-entered opinion. `dir: +1` means higher is
// better for the Slovenia feeling; `-1` means lower is better.
// `tagline` is the one-line "what this measures" subtitle the UI shows
// under each metric label. Short, concrete — units and thresholds, not
// methodology. The longer plain-language description still lives in
// `metricMethod` below and is surfaced in the detail accordion.
export const metricTaxonomy = [
  {
    axis: "setting", label: "Setting",
    metrics: [
      { key: "skyline_deg",      label: "Mountain backdrop",      tagline: "Steepest visible horizon rise",         unit: "°",   dir: +1, source: "Open-Meteo elevation (line-of-sight skyline)", sourceUrl: "https://open-meteo.com/en/docs/elevation-api" },
      { key: "mtn_horizon_pct",  label: "Mountains on the horizon", tagline: "Share of horizon ring with a visible peak silhouette", unit: "%",   dir: +1, source: "Open-Meteo elevation + OSM peaks", sourceUrl: "https://open-meteo.com/en/docs/elevation-api" },
      { key: "water_dist_m",     label: "Distance to water",      tagline: "To nearest sea, river, or lake edge",   unit: "m",   dir: -1, source: "OpenStreetMap (Overpass)",    sourceUrl: "https://overpass-api.de" },
      { key: "water_extent_km2", label: "Water grandeur",         tagline: "Size of the targeted body",             unit: "km²", dir: +1, source: "OpenStreetMap (Overpass)",    sourceUrl: "https://overpass-api.de" },
    ],
  },
  {
    axis: "aliveness", label: "Aliveness",
    metrics: [
      // New as of the walking-core rollout — plateau-decay weighted POI sums.
      // These supersede the cafe_n / bar_n / rest_n hard-700m counts and feed
      // the Aliveness composite. The _n counts below stay measured for one
      // cycle as a sanity check before being deprecated.
      { key: "cafe_score", label: "Cafés (weighted)", tagline: "Plateau-decay sum in 1500 m walking core", unit: "score", dir: +1, source: "Google Places (New) via local cache", sourceUrl: "https://developers.google.com/maps/documentation/places/web-service" },
      { key: "bar_score",  label: "Bars (weighted)",  tagline: "Plateau-decay sum in 1500 m walking core", unit: "score", dir: +1, source: "Google Places (New) via local cache", sourceUrl: "https://developers.google.com/maps/documentation/places/web-service" },
      { key: "rest_score", label: "Restaurants (weighted)", tagline: "Plateau-decay sum in 1500 m walking core", unit: "score", dir: +1, source: "Google Places (New) via local cache", sourceUrl: "https://developers.google.com/maps/documentation/places/web-service" },

      // Legacy hard-ring counts. Kept for one measurement cycle as a sanity
      // check; the Aliveness composite no longer reads from them. See
      // features/walking-core.md for the deprecation plan.
      { key: "cafe_n",     label: "Cafés (raw count)",       tagline: "Legacy: in 700 m hard ring",       unit: "count", dir: +1, source: "OpenStreetMap (Overpass)", sourceUrl: "https://www.openstreetmap.org", supersededBy: "cafe_score" },
      { key: "bar_n",      label: "Bars (raw count)",        tagline: "Legacy: in 700 m hard ring",       unit: "count", dir: +1, source: "OpenStreetMap (Overpass)", sourceUrl: "https://www.openstreetmap.org", supersededBy: "bar_score" },
      { key: "rest_n",     label: "Restaurants (raw count)", tagline: "Legacy: in 700 m hard ring",       unit: "count", dir: +1, source: "OpenStreetMap (Overpass)", sourceUrl: "https://www.openstreetmap.org", supersededBy: "rest_score" },

      { key: "walk_score", label: "Walk Score",  tagline: "Errand-walkability, 0–100",        unit: "0–100", dir: +1, source: "Walk Score (walkscore.com)", sourceUrl: "https://www.walkscore.com" },
      { key: "walk_transit_commute_pct", label: "Walk + transit commute", tagline: "Workers commuting on foot or transit", unit: "%", dir: +1, source: "US Census ACS (B08301)", sourceUrl: "https://data.census.gov" },
    ],
  },
  {
    axis: "fabric", label: "Fabric",
    metrics: [
      { key: "intersection_den", label: "Intersection density", tagline: "3+ way intersections / km² (fine grid)",  unit: "/km²", dir: +1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "mean_block_m",     label: "Mean block length",    tagline: "Shorter blocks = finer fabric",           unit: "m",    dir: -1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "carfree_frac",     label: "Car-free streets",     tagline: "Share of street length pedestrian-only",  unit: "frac", dir: +1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "bldg_coverage",    label: "Building coverage",    tagline: "Built footprint ÷ land area in 700 m core", unit: "frac", dir: +1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "pre1940_pct",      label: "Pre-1940 housing",     tagline: "Share of homes built before 1940",        unit: "%",    dir: +1, source: "US Census ACS (B25034)",  sourceUrl: "https://data.census.gov" },
    ],
  },
  {
    axis: "realness", label: "Realness",
    metrics: [
      { key: "daily_needs_score", label: "Daily-needs shops (weighted)", tagline: "Plateau-decay sum in 1500 m walking core", unit: "score", dir: +1, source: "Google Places (New) via local cache", sourceUrl: "https://developers.google.com/maps/documentation/places/web-service" },
      { key: "daily_needs_n",    label: "Daily-needs shops (raw count)", tagline: "Legacy: groceries, pharmacy, bakery in 700 m hard ring",   unit: "count", dir: +1, source: "OpenStreetMap (Overpass)",     sourceUrl: "https://www.openstreetmap.org", supersededBy: "daily_needs_score" },
      { key: "core_density",     label: "Core density",         tagline: "People per sq mi in the visit tract",     unit: "/sqmi", dir: +1, source: "US Census ACS (tract)",    sourceUrl: "https://data.census.gov" },
      { key: "owner_occ_pct",    label: "Owner-occupied",       tagline: "Share of occupied homes lived in by owner", unit: "%",   dir: +1, source: "US Census ACS (B25003)",  sourceUrl: "https://data.census.gov" },
      { key: "seasonal_vac_pct", label: "Seasonal-vacancy",     tagline: "Homes vacant for seasonal use",           unit: "%",     dir: -1, source: "US Census ACS (B25004)",   sourceUrl: "https://data.census.gov" },
      { key: "median_price_usd", label: "Median home value",    tagline: "Tract median — financial distortion",     unit: "$",     dir: -1, source: "US Census ACS (B25077)",    sourceUrl: "https://data.census.gov" },
      { key: "price_to_income_ratio", label: "Price-to-income",  tagline: "Median home value ÷ median household income", unit: "ratio", dir: -1, source: "US Census ACS (B25077 ÷ B19013)", sourceUrl: "https://data.census.gov" },
    ],
  },
  {
    axis: "january", label: "Year-round",
    metrics: [
      { key: "pleasant_days",     label: "Pleasant days / yr",  tagline: "Mean 55–80°F and dry",                    unit: "days",  dir: +1, source: "NASA POWER (MERRA-2) daily archive (2019–2023)", sourceUrl: "https://power.larc.nasa.gov/docs/services/api/temporal/daily/" },
      { key: "days_below_freeze", label: "Cold days / yr",      tagline: "Low temperature below 32°F",              unit: "days",  dir: -1, source: "NASA POWER (MERRA-2) daily archive (2019–2023)", sourceUrl: "https://power.larc.nasa.gov/docs/services/api/temporal/daily/" },
      { key: "hot_days",          label: "Hot days / yr",       tagline: "High temperature above 85°F",             unit: "days",  dir: -1, source: "NASA POWER (MERRA-2) daily archive (2019–2023)", sourceUrl: "https://power.larc.nasa.gov/docs/services/api/temporal/daily/" },
      { key: "clear_days",        label: "Sunny days / yr",     tagline: "Shortwave ≥ 70 % of clear-sky",           unit: "days",  dir: +1, source: "NASA POWER (MERRA-2) daily archive (2019–2023)", sourceUrl: "https://power.larc.nasa.gov/docs/services/api/temporal/daily/" },
    ],
  },
];

// Flat lookup of every metric definition by key.
export const metricByKey = Object.fromEntries(
  metricTaxonomy.flatMap((group) => group.metrics.map((m) => [m.key, { ...m, axis: group.axis }])),
);

// Plain-language "how this is computed" per metric — surfaced in the UI so the
// methodology is legible, not a black box.
export const metricMethod = {
  relief_std_m:    "Std-dev of ground elevation across a 6×6 grid over the 700m core. Higher = more dramatic terrain.",
  relief_range_m:  "Highest minus lowest elevation across that same grid.",
  water_dist_m:    "Straight-line distance to the nearest major water (sea / named river / sizable lake), measured to its actual edge, not the centroid — and to the body you've chosen as the target.",
  water_extent_km2:"How far the targeted water body spreads — the bounding-box area of its geometry (OpenStreetMap), capped at 500 km². The open ocean spans a huge box; a pond almost none; a lake or river between. Credits being near GRAND water (the Pacific) as great setting even when the distance is a kilometre or two — so a duck pond at 100 m can't out-score the sea.",
  skyline_deg:     "How high the visible land rises above your eyeline. Marches outward along 24 directions to ~55 km, corrects for earth curvature + refraction, and takes the steepest skyline angle you'd actually see. Captures a mountain backdrop (e.g. the Santa Ynez over Santa Barbara) that local relief misses.",
  mtn_horizon_pct: "Share of the surrounding horizon (16 compass sectors) where a visible peak presents a silhouette ≥ 0.5° — how much of the ring is filled by mountains, from a looming alpine wall to the distant skyline of a range across open water. Occlusion-tested against terrain rays starting at 500 m so close-foreground bluffs correctly block the ridges behind them.",
  cafe_score:      "Weighted café score: every café (incl. coffee shop, bakery) within 1500 m of the visit anchor, with weights decaying smoothly past a 500 m plateau. Full credit for spots inside the 5-min walk; gentle falloff out to ~15-min walk; zero beyond.",
  bar_score:       "Weighted bar score: same shape as cafe_score, applied to bars, pubs, wine bars, cocktail bars, breweries.",
  rest_score:      "Weighted restaurant score: same shape as cafe_score, applied to restaurants (all cuisines), fast food, sandwich shops, ice cream.",
  cafe_n:          "Legacy raw count of cafés within 700 m. Superseded by cafe_score; still measured for sanity checking, not used in the Aliveness composite.",
  bar_n:           "Legacy raw count of bars within 700 m. Superseded by bar_score.",
  rest_n:          "Legacy raw count of restaurants within 700 m. Superseded by rest_score.",
  walk_score:      "Walk Score® for the visit center — errand-walkability of the surrounding area.",
  intersection_den:"Street intersections (3+ ways meeting) per km² in the core. Higher = a finer, more connected grid.",
  mean_block_m:    "Mean street-segment length in the core. Shorter blocks = a more walkable, human-scaled grid.",
  carfree_frac:    "Share of street length that's pedestrian / footway / living-street in the core.",
  bldg_coverage:   "Building-footprint area ÷ land area within the 700 m core (water is subtracted from the denominator). How densely built the fabric is, fairly judged on peninsula and lakeside cores.",
  daily_needs_score: "Weighted daily-needs score: groceries, pharmacy, market, butcher within 1500 m, with weights decaying past a 500 m plateau — can you live day-to-day on foot.",
  daily_needs_n:   "Legacy raw count of daily-needs shops within 700 m. Superseded by daily_needs_score.",
  core_density:    "People per square mile in the Census tract holding the visit center. Higher = a lived-in core.",
  owner_occ_pct:   "Share of occupied homes lived in by their owner (tract-level). High = roots, not transient renters or absentee landlords.",
  pre1940_pct:     "Share of housing units in the tract built before 1940. Higher = an older, more historically continuous fabric.",
  walk_transit_commute_pct: "Share of workers (16+) commuting on foot or by transit (incl. taxicab). The 'people actually walk to work' companion to Walk Score's destination-density measurement.",
  price_to_income_ratio: "Tract median home value ÷ tract median household income. The direct affordability check — low means locals can still buy in; high means the market has detached from local incomes (a resort signal).",
  median_income_usd: "Median household income for the tract (12-month, dollars). Stored as the denominator for the price-to-income ratio; not surfaced as its own headline metric.",
  seasonal_vac_pct:"Share of homes vacant for seasonal/recreational use (tract-level). High = a resort that hollows out off-season.",
  median_price_usd:"Median home value for the tract. A read on how financially distorted the place is.",
  pleasant_days:   "Days per year with mean temperature between 55–80°F and no measurable precipitation — the year-round 'shirt-sleeve weather' count.",
  days_below_freeze:"Days per year the low drops below freezing (recent-years normal). Lower is better.",
  hot_days:        "Days per year the daily high exceeds 85°F. Lower is better.",
  clear_days:      "Days per year that are mostly sunny (sunshine ≥ 60% of daylight).",
  dec_daylight_hr: "Daylight hours at the winter solstice — how dark December gets.",
};

// ABSOLUTE scoring thresholds, not min-max normalization. Each metric maps to
// 0–10 between a "nothing" value and a "good as it matters" value, then
// SATURATES — appreciation has a ceiling, so a giant lake and the ocean both
// max out, and a place isn't punished for a rival being marginally bigger.
// [zeroAt, fullAt] — the value scoring 0 and the value scoring 10. Direction is
// encoded in the order (for "lower is better" metrics, zeroAt > fullAt).
export const metricScoreBands = {
  // Setting
  skyline_deg:      [0.5, 9],        // flat horizon → 0; ~9° dramatic backdrop → 10
  mtn_horizon_pct:  [0, 40],         // none → 0; mountains filling ~40%+ of the ring → 10
  water_dist_m:     [1200, 150],     // 1.2km+ → 0; within ~150m (on the water) → 10.
                                     //   Tightened 2026-06-08 from [3000, 250]: the old band scored a
                                     //   760m walk-through-the-grid to water (SoHo → the Hudson) at 8/10,
                                     //   indistinguishable from a town whose edge IS the water (Piran 47m,
                                     //   Greenport 95m, Camden 150m). The narrower band separates "on the
                                     //   water" (≤150m, still 10) from "a real walk to it" (~760m → ~4),
                                     //   the lived difference the Setting axis exists to capture. Mountain-led
                                     //   settings are unaffected (water is their minor pillar); the
                                     //   grand-water-nearby credit (water_extent_km2) is left intact.
  water_extent_km2: [1, 25],         // pond → 0; 25km²+ (big lake/bay/ocean) → 10 — ceiling: Erie ties the Pacific
  // Aliveness — weighted scores (current). Bands set from the calibration
  // run (scripts/calibrate-decay.mjs) against the owner's felt-Aliveness
  // baselines on 2026-06-08:
  //   Piran=48.3, Lawrenceville=55.0, Shadyside=43.1, Bled=42.9,
  //   Oakmont=18.2, Verona=11.9, Allison Park=0.8.
  // 0 = "no social life on foot"; full = ~comfortable urban density.
  cafe_score:       [0, 18],     // Piran ~16 cafés worth, plus partial neighbors → high
  bar_score:        [0, 12],     // bars saturate around a dense entertainment strip
  rest_score:       [0, 40],     // restaurants dominate the social-POI mix
  // Legacy hard-ring counts — kept for reference but no longer composing
  // Aliveness. Bands left intact so existing chips/UI don't break.
  cafe_n:           [0, 25],
  bar_n:            [0, 15],
  rest_n:           [0, 60],
  walk_score:       [45, 95],
  // Fabric
  intersection_den: [30, 150],
  mean_block_m:     [180, 70],       // shorter blocks better
  carfree_frac:     [0, 0.25],
  bldg_coverage:    [0.05, 0.45],
  daily_needs_score:[0, 10],     // bands from calibration; tightened later if needed
  daily_needs_n:    [0, 15],
  walk_transit_commute_pct: [0, 25], // 0% walk/transit → 0; 25%+ → 10 (genuinely walkable workforce)
  pre1940_pct:      [0, 60],         // none pre-1940 → 0; 60%+ → 10 (deep historic fabric)
  // Realness
  core_density:     [1000, 12000],
  owner_occ_pct:    [25, 75],        // 25% owner-occ → 0; 75%+ → 10 (genuine residents)
  seasonal_vac_pct: [45, 3],         // high seasonal vacancy = hollow resort
  median_price_usd: [1500000, 350000],
  price_to_income_ratio: [12, 3],    // 12× income → 0 (unaffordable); 3× → 10 (locals can buy)
  // Year-round
  pleasant_days:    [0, 250],        // 0 pleasant days → 0; 250 → 10
  days_below_freeze:[150, 0],        // 0 cold days → 10; 150+ → 0 (penalty axis)
  hot_days:         [120, 0],        // 0 hot days → 10; 120+ → 0 (penalty axis)
  clear_days:       [0, 310],        // 0 sunny days → 0; 310 → 10
  dec_daylight_hr:  [8.5, 10.5],
};

// Absolute 0–10 score for a metric value against its fixed threshold band.
export function metricScore(value, key) {
  const b = metricScoreBands[key];
  if (!b || value == null) return null;
  const [zeroAt, fullAt] = b;
  return Math.max(0, Math.min(10, ((value - zeroAt) / (fullAt - zeroAt)) * 10));
}

// The 5 measured axes [key, label] — Calibrate weights and ranks on these,
// using the absolute axis rollups (not the legacy hand-scored matrix).
export const calibrateAxes = metricTaxonomy.map((g) => [g.axis, g.label]);

// Weighted overall measured score 0–10: weighted average of a city's measured
// axis rollups. Returns null if the city has no measured metrics yet (so it
// sorts last rather than masquerading as a 0). Weights default to 1 per axis.
export function weightedAxisScore(cityItem, weights) {
  const roll = axisRollup(cityItem);
  let total = 0, wsum = 0;
  for (const [key] of calibrateAxes) {
    const s = roll[key];
    if (s == null) continue;
    const w = Number(weights?.[key] ?? 1);
    total += w * s; wsum += w;
  }
  return wsum ? Math.round((total / wsum) * 100) / 100 : null;
}

// Learn per-axis weights from the owner's gut: regress each axis's measured
// score against the felt Gut score across places that have BOTH (measured
// metrics + a completed survey). An axis that tracks your gut earns weight; one
// that doesn't earns ~none. Correlation-based (transparent), normalized to mean
// 1 so the overall stays on the familiar 0–10 scale. Needs ≥6 such places —
// fewer and it would be inventing weights, so it returns weights:null instead.
export const LEARN_MIN_SAMPLES = 6;
export function learnedAxisWeights(cities) {
  const samples = [];
  for (const c of cities || []) {
    if (!surveyComplete(c.survey)) continue;
    const roll = axisRollup(c);
    const x = calibrateAxes.map(([k]) => roll[k]);
    if (x.some((v) => v == null)) continue; // need every axis measured
    samples.push({ x, y: Number(c.survey.slovenia) });
  }
  if (samples.length < LEARN_MIN_SAMPLES) return { weights: null, n: samples.length, need: LEARN_MIN_SAMPLES };
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const ys = samples.map((s) => s.y), my = mean(ys);
  const weights = {};
  calibrateAxes.forEach(([key], i) => {
    const xs = samples.map((s) => s.x[i]), mx = mean(xs);
    let num = 0, dx = 0, dy = 0;
    for (let j = 0; j < samples.length; j++) { const a = xs[j] - mx, b = ys[j] - my; num += a * b; dx += a * a; dy += b * b; }
    const r = dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
    weights[key] = Math.max(0, r); // only positive predictors earn weight
  });
  const vals = Object.values(weights), avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (avg > 0) for (const k of Object.keys(weights)) weights[k] = Math.round((weights[k] / avg) * 100) / 100;
  return { weights, n: samples.length };
}

// Setting is disjunctive — mountain OR water gets you a great setting, and
// having both is objectively best. A flat mean of the 4 metrics misreads a
// Newport (great water, no mountains) as mediocre. Two-pillar formula:
// single pillar tops out at 8/10; the second pillar earns the last 2 points.
// An unmeasured pillar is treated as unknown (not zero), so a city that's
// only had its mountain pillar measured doesn't get falsely penalized for
// missing water data.
const SETTING_PILLARS = {
  mountain: ["skyline_deg", "mtn_horizon_pct"],
  water:    ["water_dist_m", "water_extent_km2"],
};
function settingPillar(cityItem, keys) {
  const scores = [];
  for (const k of keys) {
    const s = metricScore(cityItem.measuredMetrics?.[k]?.value, k);
    if (s != null) scores.push(s);
  }
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}
function settingScore(cityItem) {
  const m = settingPillar(cityItem, SETTING_PILLARS.mountain);
  const w = settingPillar(cityItem, SETTING_PILLARS.water);
  if (m == null && w == null) return null;
  if (m == null) return Math.round(w * 10) / 10;
  if (w == null) return Math.round(m * 10) / 10;
  // Default split — both pillars contribute meaningfully, so a dual-pillar
  // setting (lake + mountains) gets a small bonus over a single-pillar one.
  // Exception: when the dominant pillar is a literal SEA COAST, drop the
  // secondary weight. The Mediterranean / Pacific / Atlantic coast is a
  // categorically complete setting in a way a lake or river isn't —
  // Rovinj's coast doesn't need mountains to feel like heaven, and the
  // formula shouldn't penalize it for not having them. Mountain-led places
  // still get the dual-pillar credit because a great mountain setting
  // genuinely is improved by water nearby.
  const waterKind = cityItem.measuredMetrics?.water_dist_m?.kind;
  const seaIsDominant = w >= m && waterKind === "sea";
  const maxWeight = seaIsDominant ? 0.9 : 0.8;
  const minWeight = 1 - maxWeight;
  return Math.round((maxWeight * Math.max(m, w) + minWeight * Math.min(m, w)) * 10) / 10;
}

// Per-axis rollup 0–10. Most axes are the simple mean of their measured
// metric scores. Setting is special — see settingScore above.
//
// Superseded-metric handling:
//   A metric with `supersededBy: "<other_key>"` (e.g. cafe_n is superseded by
//   cafe_score) is dropped from the rollup ONLY when the superseding metric
//   has a measured value. Otherwise it falls back to the legacy metric so
//   cities that haven't been re-measured don't suddenly lose contribution.
//   This makes the cafe_n → cafe_score rollout safe: as each city gets
//   walking-core measured, its Aliveness silently swaps the source without
//   any zero-period in between.
export function axisRollup(cityItem) {
  const out = {};
  const mm = cityItem.measuredMetrics || {};
  for (const group of metricTaxonomy) {
    if (group.axis === "setting") {
      out.setting = settingScore(cityItem);
      continue;
    }
    const scores = [];
    for (const m of group.metrics) {
      if (m.supersededBy && mm[m.supersededBy]?.value != null) continue;
      const s = metricScore(mm[m.key]?.value, m.key);
      if (s != null) scores.push(s);
    }
    out[group.axis] = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  }
  return out;
}

// Empty measured record: every metric key present, all null with no source
// yet. A measured value is stored as { value, asOf, source } so each data
// point carries its own citation and as-of date — nothing is ever an
// uncited number.
export function emptyMeasured() {
  const out = {};
  for (const group of metricTaxonomy) {
    for (const m of group.metrics) out[m.key] = null; // { value, asOf } when measured
  }
  return out;
}
