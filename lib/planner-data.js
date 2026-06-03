export const STORAGE_KEY = "city-trial-planner-v1";

// Per-city overrides for the image search query, curated by hand so the
// app's Images-tab pre-fill (and the manifest key) actually fits each place.
// Append entries as heroes are sourced; falls back to the legacy template.
// Declared up here so cityImageQuery() can read it during module init
// (starterCities calls it before the function declaration is reached).
export const CITY_IMAGE_QUERY_OVERRIDES = {
  "Allison Park, PA": "Hampton Township Allison Park PA",
  "Annapolis, MD": "Annapolis City Dock historic",
  "Asheville, NC": "Asheville NC downtown Pack Square",
  "Ashland, OR": "Ashland Oregon Lithia Park plaza",
  "Beacon, NY": "Beacon NY Main Street",
  "Beaufort, SC": "Beaufort SC Bay Street waterfront",
  "Bellefonte, PA": "Bellefonte PA downtown Victorian",
  "Bellingham, WA": "Bellingham Fairhaven downtown",
  "Bend, OR": "Bend Oregon downtown Drake Park",
  "Bethlehem, PA": "Bethlehem PA downtown",
  "Bled, Slovenia": "Bled Slovenia lake town",
  "Boulder, CO": "Boulder CO downtown",
  "Bristol, RI": "Bristol RI downtown",
  "Buffalo (Allentown), NY": "Buffalo Allentown neighborhood",
  "Buffalo (Elmwood), NY": "Buffalo Elmwood Village neighborhood",
  "Burlington, VT": "Burlington VT downtown",
  "Cape May, NJ": "Cape May Washington Street Mall",
  "Carmel-by-the-Sea, CA": "Carmel-by-the-Sea Ocean Avenue",
  "Charleston, SC": "Charleston King Street historic",
  "Charlottesville, VA": "Charlottesville Downtown Mall",
  "Chattanooga, TN": "Chattanooga TN downtown",
  "Cincinnati (Over-the-Rhine), OH": "Cincinnati Over-the-Rhine",
  "Cleveland (Ohio City), OH": "Cleveland Ohio City neighborhood",
  "Cleveland (Tremont), OH": "Cleveland Tremont neighborhood",
  "Columbus (German Village), OH": "Columbus German Village neighborhood",
  "Columbus (Short North), OH": "Columbus Short North neighborhood",
  "Durango, CO": "Durango Main Avenue downtown",
  "Easton, PA": "Easton PA downtown",
  "Essex, CT": "Essex CT village",
  "Eureka Springs, AR": "Eureka Springs historic downtown",
  "Frederick, MD": "Frederick MD downtown",
  "Greenville, SC": "Greenville SC Main Street Falls Park",
  "Harrisonburg, VA": "Harrisonburg VA downtown",
  "Hood River, OR": "Hood River Oregon downtown",
  "Hudson, NY": "Hudson NY downtown",
  "Ithaca, NY": "Ithaca NY downtown",
  "Jim Thorpe, PA": "Jim Thorpe PA downtown",
  "Kingston, NY": "Kingston NY downtown",
  "Knoxville, TN": "Knoxville TN downtown",
  "Lancaster, PA": "Lancaster PA downtown",
  "Lewes, DE": "Lewes Delaware downtown",
  "Lewisburg, PA": "Lewisburg PA downtown",
  "Lewisburg, WV": "Lewisburg WV downtown",
  "Lexington, VA": "Lexington VA downtown",
  "Litchfield, CT": "Litchfield CT green",
  "Ljubljana, Slovenia": "Ljubljana old town Prešeren Square",
  "Monterey / Pacific Grove, CA": "Pacific Grove California downtown",
  "Morgantown, WV": "Morgantown WV downtown",
  "Mystic, CT": "Mystic CT downtown",
  "New Castle, DE": "New Castle Delaware historic district",
  "Newburyport, MA": "Newburyport Market Square waterfront",
  "Newport, RI": "Newport RI downtown",
  "Northampton, MA": "Northampton MA downtown",
  "Oakmont, PA": "Oakmont PA downtown",
  "Old Town Alexandria, VA": "Old Town Alexandria VA",
  "Petaluma, CA": "Petaluma historic downtown",
  "Piran, Slovenia": "Piran Slovenia old town",
  "Pittsburgh (Squirrel Hill), PA": "Pittsburgh Squirrel Hill",
  "Pittsburgh (Strip District), PA": "Pittsburgh Strip District",
  "Portland, ME": "Portland Maine downtown",
  "Richmond, VA": "Richmond VA downtown",
  "Roanoke, VA": "Roanoke VA downtown",
  "Rochester (Park Ave), NY": "Rochester NY Park Avenue",
  "Santa Cruz, CA": "Santa Cruz Pacific Avenue downtown",
  "Santa Fe, NM": "Santa Fe NM downtown",
  "Saratoga Springs, NY": "Saratoga Springs NY downtown",
  "Savannah, GA": "Savannah Georgia historic squares",
  "St. Augustine, FL": "St Augustine historic St George Street",
  "St. Petersburg, FL": "St Petersburg Florida Beach Drive waterfront",
  "Staunton, VA": "Staunton VA downtown",
  "Verona, PA": "Verona PA downtown",
};

// Funnel stages — the new IA spine. A city's stage is derived from the
// existing status/decision/date fields so no schema migration is required.
export const STAGES = [
  { id: "shortlist", label: "Shortlist", help: "Intake. Does this place even belong on the list?" },
  { id: "calibrate", label: "Calibrate", help: "Compare against the benchmarks. Tune the weights." },
  { id: "visit",     label: "Visit",     help: "Trip planned or under way. Logistics and itinerary." },
  { id: "decide",    label: "Decide",    help: "Back from the trip. Hold it against your gates." },
  { id: "decided",   label: "Decided",   help: "Verdict in. Advance, winter revisit, or eliminate." },
];

export const STAGE_INDEX = Object.fromEntries(STAGES.map((stage, index) => [stage.id, index]));

export function cityStage(cityItem, today = new Date()) {
  const decision = cityItem.decision || "Undecided";
  if (decision === "Advance" || decision === "Eliminate" || decision === "Winter Revisit") return "decided";
  if (cityItem.status === "Eliminated") return "decided";
  if (cityItem.status === "Visited") return "decide";
  const arrive = parseDate(cityItem.arriveDate);
  const depart = parseDate(cityItem.departDate);
  if (arrive && depart && today >= arrive && today <= depart) return "visit";
  if (cityItem.status === "Scheduled" || arrive) return "visit";
  if (cityItem.status === "Shortlist") return "calibrate";
  return "shortlist";
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Weights for the Calibrate ranking. Defaults to 1 per dimension; user tunes
// them with sliders. Stored alongside the planner state.
export function defaultWeights() {
  return Object.fromEntries(matrixDimensions.map(([key]) => [key, 1]));
}

export function normalizeWeights(weights) {
  const base = defaultWeights();
  if (!weights || typeof weights !== "object") return base;
  matrixDimensions.forEach(([key]) => {
    const value = Number(weights[key]);
    base[key] = Number.isFinite(value) && value >= 0 ? value : 1;
  });
  return base;
}

export function weightedScore(matrix, weights) {
  let totalWeight = 0;
  let totalScore = 0;
  matrixDimensions.forEach(([key]) => {
    const weight = Number(weights?.[key] ?? 1);
    if (weight <= 0) return;
    totalWeight += weight;
    totalScore += weight * Number(matrix?.[key] || 0);
  });
  if (totalWeight === 0) return 0;
  return totalScore / totalWeight;
}

// Find the benchmark place that most resembles the candidate's profile.
// Uses cosine similarity across the 8 dimensions; returns the benchmark
// plus the dimensions where the candidate beats / trails it the most.
export function closestBenchmark(cityMatrix, benchmarks) {
  let best = null;
  let bestScore = -Infinity;
  benchmarks.forEach((bench) => {
    const score = cosineSimilarity(cityMatrix, bench.matrix);
    if (score > bestScore) {
      bestScore = score;
      best = bench;
    }
  });
  if (!best) return null;
  const diffs = matrixDimensions.map(([key, label]) => {
    const delta = Number(cityMatrix[key] || 0) - Number(best.matrix[key] || 0);
    return { key, label, delta };
  });
  const wins = diffs.filter((item) => item.delta > 0).sort((a, b) => b.delta - a.delta);
  const losses = diffs.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta);
  return {
    benchmark: best,
    similarity: bestScore,
    bestDim: wins[0] || null,
    worstDim: losses[0] || null,
  };
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  matrixDimensions.forEach(([key]) => {
    const av = Number(a?.[key] || 0);
    const bv = Number(b?.[key] || 0);
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  });
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}


export const matrixDimensions = [
  ["publicRealm", "Public realm", "Squares, promenades, pedestrian streets, and everyday street life."],
  ["settingDrama", "Setting drama", "Water, mountains, cliffs, islands, views, and immediate landscape power."],
  ["walkableDaily", "Walkable daily life", "Whether normal errands and routines work on foot from the heart."],
  ["cafeCulture", "Cafe culture", "Lingering, terraces, evening life, and third places."],
  ["winterLife", "Winter public life", "Mild enough, or socially resilient enough, to stay outside the house."],
  ["authenticity", "Realness", "Local texture and civic life instead of pure resort wealth."],
  ["natureAccess", "Nature access", "High-value walks, water, trails, and landscape within an easy daily loop."],
  ["valueFit", "Value fit", "How well the place avoids feeling hyper-wealthy or financially distorted."],
];

export const benchmarkPlaces = [
  benchmark("Bled, Slovenia", "Benchmark", "Lake, castle, alpine paths, compact village life", [8, 10, 7, 7, 4, 8, 10, 6]),
  benchmark("Piran, Slovenia", "Benchmark", "Tartini Square / Punta / Hotel Piran waterfront", [10, 10, 9, 9, 7, 8, 8, 6]),
  benchmark("Galway, Ireland", "Benchmark", "Latin Quarter / Quay Street / Spanish Arch", [9, 6, 8, 10, 5, 9, 7, 5]),
];

// ── OBJECTIVE METRIC TAXONOMY ───────────────────────────────────────────
// Every granular data point from the measurement pipeline, grouped under the
// five axes (same axes the felt questionnaire uses, so felt vs measured are
// directly comparable). Each metric carries ONE canonical source — the
// handoff doc's hard rule: a value is either computed from a cited source or
// flagged unknown, never a hand-entered opinion. `dir: +1` means higher is
// better for the Slovenia feeling; `-1` means lower is better.
export const metricTaxonomy = [
  {
    axis: "setting", label: "Setting",
    metrics: [
      { key: "skyline_deg",     label: "Mountain backdrop (rise)",  unit: "°",   dir: +1, source: "Open-Meteo elevation (line-of-sight skyline)", sourceUrl: "https://open-meteo.com/en/docs/elevation-api" },
      { key: "mtn_horizon_pct", label: "Mountains on the horizon",  unit: "%",   dir: +1, source: "Open-Meteo elevation + OSM peaks", sourceUrl: "https://open-meteo.com/en/docs/elevation-api" },
      { key: "water_dist_m",    label: "Distance to major water",   unit: "m",   dir: -1, source: "OpenStreetMap (Overpass)",    sourceUrl: "https://overpass-api.de" },
      { key: "water_extent_km2", label: "Water grandeur (size)",    unit: "km²", dir: +1, source: "OpenStreetMap (Overpass)",    sourceUrl: "https://overpass-api.de" },
    ],
  },
  {
    axis: "aliveness", label: "Aliveness",
    metrics: [
      { key: "cafe_n",     label: "Cafés",            unit: "count", dir: +1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "bar_n",      label: "Bars / pubs",      unit: "count", dir: +1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "rest_n",     label: "Restaurants",      unit: "count", dir: +1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "walk_score", label: "Walk Score",       unit: "0–100", dir: +1, source: "Walk Score (walkscore.com)", sourceUrl: "https://www.walkscore.com" },
    ],
  },
  {
    axis: "fabric", label: "Fabric",
    metrics: [
      { key: "intersection_den", label: "Intersection density", unit: "/km²", dir: +1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "mean_block_m",     label: "Mean block length",    unit: "m",    dir: -1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "carfree_frac",     label: "Car-free street share", unit: "frac", dir: +1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "bldg_coverage",    label: "Building coverage",     unit: "frac", dir: +1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
      { key: "street_km",        label: "Street length in core", unit: "km",   dir: +1, source: "OpenStreetMap (osmnx)", sourceUrl: "https://www.openstreetmap.org" },
    ],
  },
  {
    axis: "realness", label: "Realness",
    metrics: [
      { key: "daily_needs_n",    label: "Daily-needs businesses", unit: "count", dir: +1, source: "OpenStreetMap (osmnx)",     sourceUrl: "https://www.openstreetmap.org" },
      { key: "core_density",     label: "Core population density", unit: "/sqmi", dir: +1, source: "US Census ACS (tract)",    sourceUrl: "https://data.census.gov" },
      { key: "seasonal_vac_pct", label: "Seasonal-vacancy share",  unit: "%",     dir: -1, source: "US Census ACS (B25004)",   sourceUrl: "https://data.census.gov" },
      { key: "str_share_pct",    label: "Short-term-rental share", unit: "%",     dir: -1, source: "AirDNA / Census ACS",      sourceUrl: "https://www.airdna.co" },
      { key: "median_price_usd", label: "Median home value",        unit: "$",     dir: -1, source: "US Census ACS (B25077)",    sourceUrl: "https://data.census.gov" },
    ],
  },
  {
    axis: "january", label: "January test",
    metrics: [
      { key: "days_below_freeze", label: "Days/yr below freezing", unit: "days",  dir: -1, source: "NOAA NCEI Climate Normals", sourceUrl: "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals" },
      { key: "clear_days",        label: "Clear/sunny days/yr",    unit: "days",  dir: +1, source: "NOAA NCEI Climate Normals", sourceUrl: "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals" },
      { key: "dec_daylight_hr",   label: "December daylight",       unit: "hr",    dir: +1, source: "NOAA Solar Calculator (computed)", sourceUrl: "https://gml.noaa.gov/grad/solcalc/" },
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
  mtn_horizon_pct: "Share of the surrounding horizon (16 compass sectors) where a visible peak rises 2°+ — how surrounded by mountains you are, not just the single highest one.",
  cafe_n:          "Count of cafés / coffee / tea spots within 700 m of the visit center.",
  bar_n:           "Count of bars and pubs within 700 m.",
  rest_n:          "Count of restaurants within 700 m.",
  walk_score:      "Walk Score® for the visit center — errand-walkability of the surrounding area.",
  intersection_den:"Street intersections (3+ ways meeting) per km² in the core. Higher = a finer, more connected grid.",
  mean_block_m:    "Mean street-segment length in the core. Shorter blocks = a more walkable, human-scaled grid.",
  carfree_frac:    "Share of street length that's pedestrian / footway / living-street in the core.",
  bldg_coverage:   "Building-footprint area ÷ core area — how densely built the fabric is.",
  street_km:       "Total street length within the 700 m core.",
  daily_needs_n:   "Groceries, pharmacy, bakery, butcher and the like within 700 m — can you live day-to-day on foot.",
  core_density:    "People per square mile in the Census tract holding the visit center. Higher = a lived-in core.",
  seasonal_vac_pct:"Share of homes vacant for seasonal/recreational use (tract-level). High = a resort that hollows out off-season.",
  str_share_pct:   "Short-term-rental share of housing. Not yet computed (paid source); seasonal-vacancy is the standing proxy.",
  median_price_usd:"Median home value for the tract. A read on how financially distorted the place is.",
  days_below_freeze:"Days per year the low drops below freezing (recent-years normal).",
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
  water_dist_m:     [3000, 250],     // 3km+ → 0; within ~250m (on the water) → 10
  water_extent_km2: [1, 25],         // pond → 0; 25km²+ (big lake/bay/ocean) → 10 — ceiling: Erie ties the Pacific
  // Aliveness
  cafe_n:           [0, 25],
  bar_n:            [0, 15],
  rest_n:           [0, 60],
  walk_score:       [45, 95],
  // Fabric
  intersection_den: [30, 150],
  mean_block_m:     [180, 70],       // shorter blocks better
  carfree_frac:     [0, 0.25],
  bldg_coverage:    [0.10, 0.45],
  street_km:        [5, 55],
  daily_needs_n:    [0, 15],
  // Realness
  core_density:     [1000, 12000],
  seasonal_vac_pct: [45, 3],         // high seasonal vacancy = hollow resort
  median_price_usd: [1500000, 350000],
  str_share_pct:    [40, 2],
  // January
  days_below_freeze:[70, 3],
  clear_days:       [80, 260],
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
// score against the felt Slovenia score across places that have BOTH (measured
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

// Per-axis rollup 0–10: average of the axis's measured metric scores, each on
// its own absolute threshold. No dependence on the candidate field.
export function axisRollup(cityItem) {
  const out = {};
  for (const group of metricTaxonomy) {
    const scores = [];
    for (const m of group.metrics) {
      const s = metricScore(cityItem.measuredMetrics?.[m.key]?.value, m.key);
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

// ── VISIT WINDOW ────────────────────────────────────────────────────────
// "Perfect time to visit" — quantitative climate × qualitative crowd. For
// this project the best visit isn't peak season (which flatters everything);
// it's the most diagnostic window. We compute two:
//   • CHARM  — comfortable weather AFTER the crowds thin (is it lovely when
//              you can breathe?)
//   • TRUTH  — deliberately off-season, the January test made literal (does
//              real life persist when tourists are gone?)
// A candidate should pass both before it advances.
export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Seed climate normals (°F highs/lows, rainy days/mo, daylight hrs) + crowd
// season (0–5, 5 = peak tourist). Climate: NOAA NCEI 1991–2020 normals.
// Crowd: qualitative, from known tourist-season patterns. Two cities seeded
// to demonstrate contrasting visit-window stories; the pipeline fills the
// rest. m(hi,lo,precipDays,daylight).
const m = (hi, lo, precipDays, daylightHr) => ({ hi, lo, precipDays, daylightHr });
const visitClimateSeed = {
  // Mild year-round; summer crowds; best window is the warm-dry shoulder.
  "Santa Barbara, CA": {
    climate: [m(65,43,6,10),m(65,45,6,11),m(66,46,5,12),m(68,48,3,13),m(69,52,1,14),m(72,55,0,14.5),m(75,58,0,14),m(76,59,0,13),m(76,57,1,12),m(73,52,2,11),m(69,47,3,10),m(64,43,5,9.7)],
    crowd: [2,2,3,3,4,5,5,5,4,3,2,3],
    notes: {
      charm: "Still warm and dry, but the summer crowds have cleared — the town returns to locals.",
      truth: "Mild, but the quiet test: is downtown alive on a gray winter weekday, or just coasting on summer?",
    },
  },
  // Brutal humid summer; spring & late fall are the livable windows.
  "Savannah, GA": {
    climate: [m(61,39,9,10),m(64,42,8,11),m(71,48,8,12),m(78,54,6,13),m(85,63,7,14),m(90,70,11,14.3),m(92,73,13,14),m(91,73,13,13),m(87,68,9,12),m(79,57,5,11),m(71,48,6,10.3),m(63,41,8,9.8)],
    crowd: [2,3,5,5,4,3,3,3,3,4,3,3],
    notes: {
      charm: "The heat and humidity break, the squares are perfect, and the spring-festival crowds are long gone.",
      truth: "Cool and damp — do the squares hold their public life, or empty out?",
    },
  },
};

// Comfort 0–5 from a month's climate normals. Smooth distance from an ideal
// outdoor-living profile (daytime high ~74°F, night low ~56°F) so months
// gradate cleanly instead of all maxing out across a flat band — that lets
// genuine shoulder season beat a merely-mild winter month.
export function monthComfort(m) {
  if (!m || m.hi == null) return null;
  let s = 5;
  s -= Math.abs(m.hi - 74) / 7;
  if (m.lo != null) s -= Math.abs(m.lo - 56) / 12;
  if (m.precipDays != null) s -= Math.max(0, m.precipDays - 8) / 6;
  if (m.daylightHr != null && m.daylightHr < 10) s -= (10 - m.daylightHr) / 2;
  return Math.max(0, Math.min(5, s));
}

// 12-month comfort series (0–10 per month), aligned with calendar months.
// Null entries are months with no climate data. This is what the city page
// renders as a full year-at-a-glance bar.
export function monthlyComfortScores(cityItem) {
  const vc = cityItem.visitClimate;
  if (!Array.isArray(vc) || vc.length !== 12) return null;
  return vc.map((m) => {
    const c = monthComfort(m);
    return c == null ? null : Math.round(c * 2 * 10) / 10;
  });
}

// "Visit now" — how good THIS month is to visit, with a "don't miss it" boost
// when the next two months trend DOWN. So a city in its prime month (good now,
// dropping fast) ranks above one that's merely fine year-round.
//
// Formula (0–10):
//   base       = this month's comfort
//   urgency    = avg drop into the next 2 months, capped at +2 (0 if rising)
//   visitNow   = base + urgency, clamped 0–10
// Informational, NOT folded into the measured fit.
export function visitNowScore(cityItem, monthIndex) {
  const series = monthlyComfortScores(cityItem);
  if (!series || series[monthIndex] == null) return null;
  const base = series[monthIndex];
  const next1 = series[(monthIndex + 1) % 12];
  const next2 = series[(monthIndex + 2) % 12];
  const drops = [next1, next2].filter((v) => v != null).map((v) => base - v);
  const avgDrop = drops.length ? drops.reduce((a, b) => a + b, 0) / drops.length : 0;
  const urgency = Math.max(0, Math.min(2, avgDrop)); // only downward, capped +2
  return Math.round(Math.min(10, base + urgency) * 10) / 10;
}

// Returns the full 12-month read plus the two recommended windows, or null
// if the city has no climate data yet (never faked — pipeline fills it).
export function cityVisitWindow(cityItem) {
  const climate = cityItem.visitClimate;       // [12] of {hi,lo,precipDays,daylightHr} | null
  const crowd = cityItem.crowdSeason || [];     // [12] of 0–5 (5 = peak tourist) qualitative
  if (!Array.isArray(climate) || climate.length !== 12 || climate.every((m) => !m)) return null;

  const months = MONTHS.map((name, i) => {
    const comfort = monthComfort(climate[i]);
    const c = Number.isFinite(crowd[i]) ? crowd[i] : null;
    // Charm wants crowds at the SHOULDER (~2.5) — not peak (overrun) and not
    // dead-empty (which signals the place shuts down, the truth test). Bell
    // around 2.5 rather than monotonic "fewer = better."
    const crowdScore = c == null ? 3 : 5 - Math.abs(c - 2.5) * 1.5;
    const charmFit = comfort == null ? null : comfort * 0.65 + crowdScore * 0.35;
    return { name, idx: i, climate: climate[i], comfort, crowd: c, charmFit };
  });

  const withFit = months.filter((m) => m.charmFit != null);

  // TRUTH first: the winter test, literally — coldest month (lowest daytime
  // high). Where "does it die off-season" actually gets tested.
  const truth = withFit.slice().sort((a, b) => a.climate.hi - b.climate.hi)[0] || null;

  // CHARM: among genuinely comfortable months, excluding the truth month so
  // the two windows are always distinct, the best shoulder-season fit.
  const comfortable = withFit.filter((mo) => mo.comfort >= 3.5 && (!truth || mo.idx !== truth.idx));
  const charmPool = comfortable.length ? comfortable : withFit.filter((mo) => !truth || mo.idx !== truth.idx);
  const charm = charmPool.slice().sort((a, b) => b.charmFit - a.charmFit)[0] || null;

  return { months, charm, truth, notes: cityItem.seasonNotes || {} };
}

// ── FELT-SCORE QUESTIONNAIRE ────────────────────────────────────────────
// The subjective track. Five independent failure-mode axes, each scored 1–5
// against fixed anchors drawn from places the owner has actually stood in,
// plus a 0–10 gut "Slovenia score" (the regression target) and a free note.
// Every axis option is anchored so nothing is rated in the abstract.
export const surveyAxes = [
  {
    key: "setting",
    label: "Setting",
    prompt: "Does where you are press in on you — water, terrain, prospect, a view that reorients you?",
    anchors: [
      { value: 1, label: "Flat, no prospect — could be anywhere (Allison Park, Shadyside)" },
      { value: 2, label: "Pleasant street, but no landscape force" },
      { value: 3, label: "Some setting — a river, a hill — present but quiet" },
      { value: 4, label: "Strong setting you feel from the core (Ljubljana)" },
      { value: 5, label: "The setting IS the place; you can't ignore it (Bled, Piran)" },
    ],
  },
  {
    key: "aliveness",
    label: "Aliveness",
    prompt: "On an ordinary weekday — not events, not weekends — are people out and lingering with no errand?",
    anchors: [
      { value: 1, label: "Dead; people transit between car and door" },
      { value: 2, label: "Foot traffic exists but it's shopping, not living (Shadyside)" },
      { value: 3, label: "Some terrace life, people pause" },
      { value: 4, label: "Steady public life; people stay put" },
      { value: 5, label: "The public space is the living room (Tartini Square at dusk)" },
    ],
  },
  {
    key: "fabric",
    label: "Fabric",
    prompt: "Does the built fabric close around you — enclosure, human scale, a core that holds together?",
    anchors: [
      { value: 1, label: "Strip: parking, gaps, nothing encloses you" },
      { value: 2, label: "A few good blocks that then break apart" },
      { value: 3, label: "Coherent walkable core for a real distance" },
      { value: 4, label: "Continuous, dense, enclosing (good Shadyside blocks)" },
      { value: 5, label: "A maze that wraps around you (Rovinj old town)" },
    ],
  },
  {
    key: "realness",
    label: "Realness",
    prompt: "Is it a working resident town, or a resort / tourist set / trophy enclave?",
    anchors: [
      { value: 1, label: "Pure resort or theme-town; nobody lives the year here" },
      { value: 2, label: "Mostly visitors, thin resident layer" },
      { value: 3, label: "Real town with a visitor economy on top" },
      { value: 4, label: "Clearly lived-in; tourists are incidental" },
      { value: 5, label: "Unmistakably a working town, hardware stores and laundromats" },
    ],
  },
  {
    key: "january",
    label: "January test",
    prompt: "The dealbreaker. Would there be outdoor public life on a gray Tuesday in February — or does it shutter?",
    anchors: [
      { value: 1, label: "Boarded up out of season; summer-only" },
      { value: 2, label: "Limps through winter, much closes" },
      { value: 3, label: "Quieter but alive; locals keep it going" },
      { value: 4, label: "Holds its rhythm through the cold months" },
      { value: 5, label: "Full year-round life regardless of season" },
    ],
  },
];

export const SLOVENIA_ANCHORS = [
  { value: 0, label: "Allison Park — left me cold" },
  { value: 3, label: "Shadyside — passed the tests, felt dead" },
  { value: 5, label: "Pleasant but forgettable" },
  { value: 8, label: "Strong, not transcendent" },
  { value: 10, label: "Piran" },
];

export function emptySurvey() {
  return {
    setting: null, aliveness: null, fabric: null, realness: null, january: null,
    slovenia: null,
    note: "",
    context: "",       // "memory" | "visited"
    takenAt: "",
  };
}

export function surveyComplete(survey) {
  if (!survey) return false;
  return surveyAxes.every((axis) => Number.isFinite(survey[axis.key]))
    && Number.isFinite(survey.slovenia);
}

// Felt score = the gut Slovenia number (0–10) when present. The five axes are
// diagnostic predictors, not a blended average — we never average them into
// the headline, by design (the gut number is the target, the axes explain it).
export function feltScore(survey) {
  if (!survey || !Number.isFinite(survey.slovenia)) return null;
  return Number(survey.slovenia);
}

// Places the owner already knows deeply. Surveyed from memory first to
// calibrate the whole system — the answer key, not candidates.
export const baselineReferences = [
  { name: "Bled, Slovenia",   note: "Loved it — the gold standard." },
  { name: "Piran, Slovenia",  note: "Loved it — the gold standard." },
  { name: "Ljubljana, Slovenia", note: "Strong, but bigger than ideal." },
  { name: "Shadyside, Pittsburgh", note: "Passed every urban metric, left him cold." },
  { name: "Lawrenceville, Pittsburgh", note: "Butler St — left him cold." },
  { name: "Sewickley, PA",    note: "Beaver St downtown — control." },
  { name: "Oakmont, PA",      note: "Allegheny River Blvd — control." },
  { name: "Verona, PA",       note: "Control." },
  { name: "Allison Park, PA", note: "His own car-dependent suburb — should score lowest." },
];

const matrixSeedScores = {
  "Santa Barbara, CA": [9, 10, 8, 9, 10, 6, 10, 3],
  "Ventura, CA": [8, 8, 8, 7, 10, 8, 8, 7],
  "San Luis Obispo, CA": [8, 7, 9, 9, 9, 8, 7, 7],
  "Santa Cruz, CA": [9, 10, 8, 8, 8, 7, 10, 4],
  "Monterey / Pacific Grove, CA": [8, 10, 8, 7, 8, 6, 10, 4],
  "Hood River, OR": [7, 10, 7, 7, 5, 8, 10, 6],
  "Bellingham, WA": [8, 8, 8, 8, 4, 9, 9, 7],
  "Ashland, OR": [8, 8, 8, 8, 7, 7, 8, 6],
  "Annapolis, MD": [9, 8, 9, 8, 7, 8, 7, 4],
  "Savannah, GA": [10, 7, 9, 8, 9, 8, 6, 7],
  "Charleston, SC": [9, 8, 8, 9, 9, 5, 7, 3],
  "St. Petersburg, FL": [9, 8, 8, 8, 10, 7, 8, 6],
  "Beaufort, SC": [8, 8, 8, 7, 9, 8, 7, 8],
  "St. Augustine, FL": [9, 8, 8, 8, 10, 5, 7, 6],
  "Greenville, SC": [9, 7, 8, 8, 8, 7, 8, 7],
  "Petaluma, CA": [8, 7, 8, 8, 9, 8, 7, 6],
  "Carmel-by-the-Sea, CA": [8, 10, 9, 7, 9, 4, 10, 1],
  "Newburyport, MA": [8, 8, 8, 8, 4, 8, 7, 5],
  "Cape May, NJ": [8, 9, 8, 7, 4, 6, 8, 5],
  "Durango, CO": [8, 10, 7, 7, 4, 8, 10, 6],
  "Charlottesville, VA": [9, 7, 8, 8, 7, 7, 7, 6],
  "Eureka Springs, AR": [7, 8, 7, 7, 7, 8, 8, 8],
};

export const legacyWhyByCity = {
  "Santa Barbara, CA": "Best U.S. calibration point for ocean, mountains, public life, cafes, train access, and a daily pedestrian field.",
  "Ventura, CA": "A grounded coastal downtown with a pedestrianized Main Street, beach access, and less polished social texture.",
  "San Luis Obispo, CA": "Compact, sunny, civic, and cafe-heavy, with a strong downtown market and easy access to coastal nature.",
  "Santa Cruz, CA": "Surf-town public life, dramatic coast, cafes, and everyday weirdness with real nature at the edge.",
  "Monterey / Pacific Grove, CA": "Piran-like coastline, walkable village blocks, bay trails, and a calmer civic rhythm.",
  "Hood River, OR": "Alpine-waterfront village energy, Columbia River views, active streets, and huge nature access.",
  "Bellingham, WA": "Coastal, real, unflashy, trail-rich, and less performative than many high-income walkable towns.",
  "Ashland, OR": "A tiny city with a real center, creekside public life, cafes, theater energy, and Lithia Park directly attached.",
  "Annapolis, MD": "A true harbor piazza candidate with year-round civic life, compact streets, and Eastport within walking reach.",
  "Savannah, GA": "World-class squares, shade, walkability, and public rooms that make daily wandering feel structured and social.",
  "Charleston, SC": "Dense public life, restaurants, architecture, and mild winters, with real questions around wealth and flooding.",
  "St. Petersburg, FL": "A complete Florida urban-waterfront test with parks, restaurants, museums, the pier, and year-round outdoor life.",
  "Beaufort, SC": "A small Lowcountry waterfront town with a true social heart at Henry C. Chambers Waterfront Park and a compact downtown grid.",
  "St. Augustine, FL": "A rare U.S. town with a pedestrian spine, waterfront walks, courtyards, plazas, and mild winter street life.",
  "Greenville, SC": "A polished, walkable downtown with a real park-and-waterfall centerpiece, mild winters, and a useful Main Street corridor.",
  "Petaluma, CA": "A working Sonoma river town with historic blocks, a real downtown, train access, and less trophy-town energy than Healdsburg.",
  "Carmel-by-the-Sea, CA": "An almost absurdly walkable village above a world-class beach, included as a beauty calibration despite the wealth problem.",
  "Newburyport, MA": "A compact riverfront New England city with Market Square, the Harborwalk, commuter rail, and a strong local downtown.",
  "Cape May, NJ": "A small seaside town with a pedestrian mall, beach promenade, and strong place identity, but seasonality must be tested hard.",
  "Durango, CO": "A mountain river town with a real historic downtown, Animas River Trail, trains, cafes, and deep outdoor access.",
  "Charlottesville, VA": "One of the strongest pedestrian-mall tests in a mild-ish college town with cafes, music, restaurants, and nearby Blue Ridge access.",
  "Eureka Springs, AR": "A strange, walkable Ozark hillside town with texture, affordability, and strong small-place identity.",
};

export const cityWhyByCity = {
  "Santa Barbara, CA": "Santa Barbara belongs because it is one of the few U.S. places where daily life can happen inside a setting that still feels cinematic. You get a real pedestrian spine, strong cafe and restaurant energy, the beach and waterfront close enough to fold into an ordinary afternoon, and mountains looming behind the whole thing so the city never feels flat or generic. The test here is not whether it is beautiful, because it obviously is; it is whether that beauty still holds up once you are doing coffee, errands, work, dinner, and a normal Wednesday walk instead of treating it like a postcard.",
  "Ventura, CA": "Ventura belongs because it offers a looser, more lived-in version of the Southern California coastal town idea. The downtown has a genuine Main Street rhythm, the pier and shoreline are directly tied into the center, and the whole place feels less polished and less status-soaked than Santa Barbara while still giving you public life, weather, and walkability. If Santa Barbara is the dream calibrated at its most refined, Ventura is the version worth testing to see whether a slightly rougher edge actually makes everyday life feel more believable.",
  "San Luis Obispo, CA": "San Luis Obispo belongs because it compresses a surprising amount of public life into a small, usable, everyday core. Mission Plaza, Higuera, and the surrounding blocks create a civic room that can support markets, coffee, dinner, errands, and casual looping walks without needing a big-city scale to feel alive. It does not have the same direct water drama as the coastal candidates, but it may compensate with ease, climate, coherence, and the rare feeling that the best part of town is built for repeated ordinary use rather than occasional spectacle.",
  "Santa Cruz, CA": "Santa Cruz belongs because it combines genuine public life with a level of nature access and coastal drama that most walkable U.S. towns cannot touch. Downtown gives you cafes, bookstores, bars, and a real street scene, while West Cliff, the wharf, and the beach put daily ocean contact right at the edge of normal routine. The question here is whether the city's surf-town energy and slight disorder feel invigorating and alive, or whether they start to read as chaos once you imagine living inside them full-time.",
  "Monterey / Pacific Grove, CA": "Monterey and Pacific Grove belong because together they create one of the strongest U.S. versions of a small walkable place tied directly to the sea. Pacific Grove has village-scale blocks, slower rhythm, and a softer residential texture, while Monterey adds more restaurants, history, and waterfront movement; between them you get bay trails, rocky coastline, and everyday access to world-class scenery. This is less about nightlife or urban intensity and more about whether calm, beauty, and repeated water-edge walking can create the same magnetic pull that places like Piran and Rovinj have.",
  "Hood River, OR": "Hood River belongs because it is one of the clearest U.S. substitutes for the mountain-and-water charge that makes Bled feel so memorable. The town itself has a compact center with restaurants, breweries, and a real street presence, but the bigger story is how immediately the Columbia, the Gorge, and the surrounding landscape press into daily life. The test is whether that outdoor drama truly enriches an ordinary week in town, or whether winter weather, wind, and small-town limits make the magic feel more episodic than sustainable.",
  "Bellingham, WA": "Bellingham belongs because it offers something many prettier or richer towns do not: texture that feels local, unperformed, and structurally real. Fairhaven, downtown, the waterfront, and the trail network give you multiple centers of activity, and the city has enough student, port, and working-town energy to avoid feeling curated for visitors alone. This is a place to test whether a slightly grayer, more grounded, more North Pacific version of public life might actually satisfy more deeply than a sunnier but more polished candidate.",
  "Ashland, OR": "Ashland belongs because it punches far above its size as a civic place. The plaza, creek, cafes, bookstore-and-theater energy, and direct connection to Lithia Park create a downtown that can feel intimate without feeling dead, and the town has a rare sense that culture and landscape are physically interwoven. The real test is whether that charm remains rich enough over time, or whether the scale, seasonality, and visitor economy start to feel too small once the novelty burns off.",
  "Annapolis, MD": "Annapolis belongs because its harbor core behaves more like a true waterfront public room than most American downtowns do. Main Street spills into City Dock, Eastport is walkably adjacent, boats and promenades keep the setting active, and there is enough density of restaurants, movement, and civic presence to create an all-day rhythm rather than a decorative center. What makes it compelling is not just that it is pretty, but that the beauty is attached to a place where people actually circulate, gather, and pass through in ordinary life.",
  "Savannah, GA": "Savannah belongs because its public realm is so strong that it changes the texture of daily walking. The squares are not just pretty set pieces; they structure movement, create shade, slow you down, and make wandering through the city feel social even when nothing dramatic is happening. If the benchmark is the sensation of being held inside a place rather than merely visiting it, Savannah deserves serious attention because so much of its identity is built from public rooms, rhythm, and repeated on-foot discovery.",
  "Charleston, SC": "Charleston belongs because it has one of the richest concentrations of walkable street life, architecture, restaurants, and mild-weather public energy in the country. King Street, the surrounding neighborhoods, and the water-adjacent edges give you multiple versions of outdoor life, from shopping and dining to simple wandering through beautiful blocks. The reason to test it is not whether it works for a weekend, but whether its wealth, visitor intensity, and climate risks undermine the daily-life version of the magic.",
  "St. Petersburg, FL": "St. Petersburg belongs because it may be the most complete warm-weather test of urban waterfront life on this list. The downtown core, parks, museums, pier, beach-adjacent atmosphere, and year-round outdoor culture create a city where being outside is not a special event but part of the default pattern of life. It does not offer old-world romance in the same way as Piran, but it does offer a serious experiment in whether sun, water, movement, and an active public edge can build a different kind of attachment.",
  "Beaufort, SC": "Beaufort belongs because it may be one of the best small-scale U.S. tests for waterfront intimacy. The downtown is compact enough to read as a real social core, Henry C. Chambers Waterfront Park gives the town a proper communal front porch, and the pace can feel more human than in larger Southern destinations. This is the kind of place where the question is whether a smaller, quieter setting can still generate enough daily pull, enough lingering, and enough repeated satisfaction to compete with the more dramatic candidates.",
  "St. Augustine, FL": "St. Augustine belongs because very few American places offer this combination of pedestrian fabric, public squares, waterfront walking, courtyards, and mild-weather outdoor life. The historic center has enough narrow-street texture and enough spatial compression to create flashes of the old-world feeling you are chasing, especially when you move between the plaza, St. George Street, and the water. The key test is whether the place still works once you strip away the tourist lens and ask whether it can support ordinary routines with the same charm.",
  "Greenville, SC": "Greenville belongs because it is one of the strongest examples of intentional modern public realm done well in a smaller U.S. city. Main Street has enough continuity to feel useful, Falls Park gives the center a memorable natural anchor, and the whole downtown is set up for strolling, eating, and lingering without much friction. It may lack the elemental coastal or alpine drama of the benchmark places, but it deserves a look because the everyday urban experience could be smoother and more livable than some more famous towns.",
  "Petaluma, CA": "Petaluma belongs because it offers a version of Northern California that still feels like a working town rather than a pure lifestyle performance. The downtown has historic bones, the river and turning basin give it structure, the train adds a layer of practical connection, and the social texture feels more grounded than in many nearby prestige towns. If climate, walkability, and texture matter more than maximum scenery, Petaluma is exactly the kind of place that can quietly overperform once you stop comparing it only to postcard destinations.",
  "Carmel-by-the-Sea, CA": "Carmel belongs because it is such an extreme beauty calibration that it is useful even if it ultimately proves emotionally wrong. The village is almost absurdly walkable, the streets are intimate and lush, the architecture is tightly curated, and Carmel Beach delivers immediate world-class scenery at the end of an ordinary stroll. The point of testing it is not to pretend the wealth signal is absent; it is to find out whether sheer beauty and ease can overcome that discomfort, or whether they only sharpen it.",
  "Newburyport, MA": "Newburyport belongs because it offers one of the cleaner New England models of a compact, harbor-facing, highly walkable small city. Market Square, the waterfront, and the surrounding downtown blocks give it a real social core, and the commuter-rail connection adds a layer of practicality that many charming towns do not have. It is worth testing not because it is the most dramatic candidate, but because it may deliver a durable rhythm of cafes, walking, water, and local life with more substance than flash.",
  "Cape May, NJ": "Cape May belongs because it is one of the rare American beach towns where the center is actually walkable and spatially memorable rather than just stripy and seasonal. The pedestrian mall, old houses, beach promenade, and strong local identity make it feel more like a real place than a generic shore destination. The question is whether that character survives outside peak visitor periods in a way that still feels emotionally alive, or whether the town becomes too quiet once the resort cycle recedes.",
  "Durango, CO": "Durango belongs because it brings together a real historic main street, river access, mountain backdrop, trail life, and enough commercial density to keep the center from feeling like a facade. There is a strong sense here that nature is not a side trip but part of the daily geometry of the town, with the Animas and surrounding peaks always pressing close. If Bled changed your bar for landscape drama, Durango is one of the more serious American tests of whether mountain-town life can remain socially and practically satisfying through an ordinary year.",
  "Charlottesville, VA": "Charlottesville belongs because the Downtown Mall remains one of the most persuasive pedestrian-room experiments in the country. It offers cafes, restaurants, music, bookstore energy, and enough foot traffic to create a genuine sense of shared public life, while the surrounding region adds hills, vineyards, and Blue Ridge access without being the whole story. The real issue to test is whether the magic extends beyond the mall itself, turning the broader city into a place you would want to inhabit rather than merely revisit.",
  "Eureka Springs, AR": "Eureka Springs belongs because it is weird in a way that can be either deeply charming or completely impractical, and that makes it worth testing rather than dismissing. The hills, porches, winding streets, compact historic center, and strong independent character create a place that feels unlike almost anything else in the U.S. It may never compete on polish or infrastructure, but it might compete on intimacy, memory, and the feeling that a place has its own internal logic instead of borrowing someone else's formula.",
};

export const starterCities = [
  city("Santa Barbara, CA", "Lower State / Funk Zone / West Beach", "State St & Yanonali St", "Jun week 1", cityWhyByCity["Santa Barbara, CA"], "You want beauty and daily walkability more than anti-wealth vibes.", "It feels too polished, expensive, or resort-adjacent.", [
    "State St between Gutierrez St and Yanonali St",
    "Yanonali St between State St and Anacapa St",
    "Anacapa St between Yanonali St and Mason St",
    "Cabrillo Blvd around Stearns Wharf",
    "Helena Ave / Santa Barbara St in the Funk Zone",
  ]),
  city("Ventura, CA", "Downtown Ventura / Pier", "Main St & California St", "Jun week 3", cityWhyByCity["Ventura, CA"], "You found the less-grand, more usable Santa Barbara.", "It feels too casual or thin after Slovenia.", [
    "Main St between Figueroa St and Fir St",
    "California St between Main St and Santa Clara St",
    "Main St between Oak St and California St",
    "Palm St between Main St and Santa Clara St",
    "Ventura Pier / Promenade at California St",
  ]),
  city("San Luis Obispo, CA", "Mission Plaza / Higuera / Garden", "Higuera St & Chorro St", "Jul week 1", cityWhyByCity["San Luis Obispo, CA"], "You want compact daily ease more than direct ocean drama.", "It feels too inland or college-town small.", [
    "Higuera St between Nipomo St and Osos St",
    "Garden St between Higuera St and Marsh St",
    "Chorro St between Monterey St and Higuera St",
    "Monterey St around Mission Plaza",
    "Broad St between Monterey St and Higuera St",
  ]),
  city("Santa Cruz, CA", "Downtown / Beach Hill edge", "Pacific Ave & Cooper St", "Jul week 3", cityWhyByCity["Santa Cruz, CA"], "You like a little edge with your beauty.", "It feels too studenty, chaotic, or expensive for the polish level.", [
    "Pacific Ave between Cathcart St and Cooper St",
    "Cooper St / Abbott Square",
    "Front St near Abbott Square",
    "West Cliff Dr around Lighthouse Point",
    "Beach St near the Boardwalk / Wharf",
  ]),
  city("Monterey / Pacific Grove, CA", "Pacific Grove downtown", "Lighthouse Ave & 17th St", "Aug week 1", cityWhyByCity["Monterey / Pacific Grove, CA"], "Coastal-town feeling matters more than nightlife.", "It feels too sleepy or retiree-coded.", [
    "Lighthouse Ave between 16th St and Fountain Ave",
    "Forest Ave between Lighthouse Ave and Central Ave",
    "Ocean View Blvd near Lovers Point",
    "Cannery Row near Prescott Ave",
    "Alvarado St between Pearl St and Franklin St",
  ]),
  city("Hood River, OR", "Downtown Hood River", "Oak St & 2nd St", "Aug week 3", cityWhyByCity["Hood River, OR"], "Mountain-water-sport energy is your Bled substitute.", "Winter wind, gray, or housing scarcity dulls the everyday appeal.", [
    "Oak St between 1st St and 6th St",
    "2nd St between State St and Cascade Ave",
    "Cascade Ave between 1st St and 5th St",
    "Front St / waterfront trail near 2nd St",
    "Portway Ave near Waterfront Park",
  ]),
  city("Bellingham, WA", "Fairhaven + downtown", "Harris Ave & 11th St", "Sep week 1", cityWhyByCity["Bellingham, WA"], "You want realness, water, trails, and texture.", "The winter darkness or split between Fairhaven and downtown wears on you.", [
    "Harris Ave between 10th St and 12th St",
    "11th St between Harris Ave and Mill Ave",
    "Taylor Dock / South Bay Trail",
    "Bay St / Holly St downtown",
    "Railroad Ave between Holly St and Magnolia St",
  ]),
  city("Ashland, OR", "Plaza / Lithia Park edge", "N Main St & E Main St", "Sep week 3", cityWhyByCity["Ashland, OR"], "You want a small civic place with nature touching downtown.", "It feels too small or too dependent on visitor seasons.", [
    "Ashland Plaza",
    "N Main St between Plaza and Lithia Way",
    "E Main St between 1st St and 3rd St",
    "Calle Guanajuato along Ashland Creek",
    "Winburn Way into Lithia Park",
  ]),
  city("Annapolis, MD", "City Dock / Historic Core", "Main St & Dock St", "Oct week 1", cityWhyByCity["Annapolis, MD"], "Harbor public life matters more than West Coast nature.", "Humidity, tourism, or mid-Atlantic dampness takes it down.", [
    "Main St between Church Circle and City Dock",
    "Dock St / Ego Alley",
    "Maryland Ave between State Circle and Prince George St",
    "State Circle",
    "Severn Ave near Fourth St in Eastport",
  ]),
  city("Savannah, GA", "Historic District north of Forsyth", "Bull St & Broughton St", "Oct week 3", cityWhyByCity["Savannah, GA"], "Squares, shade, walking, and atmosphere beat mountain drama.", "Summer heat and tourism overwhelm livability.", [
    "Bull St from Johnson Square to Chippewa Square",
    "Broughton St between Whitaker St and Drayton St",
    "Jones St between Bull St and Abercorn St",
    "Forsyth Park north edge at Gaston St",
    "River St / Factors Walk near Barnard Ramp",
  ]),
  city("Charleston, SC", "Cannonborough / Elliotborough", "King St & Cannon St", "Nov week 1", cityWhyByCity["Charleston, SC"], "You want Southern urban energy with year-round outdoor life.", "Wealth, tourist pressure, flooding, or heat makes it feel wrong.", [
    "King St between Spring St and Calhoun St",
    "Cannon St between Coming St and King St",
    "Coming St near Cannon / Spring",
    "Broad St between King St and Meeting St",
    "Colonial Lake / Rutledge Ave edge",
  ]),
  city("St. Petersburg, FL", "Downtown Waterfront / Edge District", "Beach Dr NE & 2nd Ave NE", "Nov week 3", cityWhyByCity["St. Petersburg, FL"], "Waterfront urbanism and winter public life beat old-world charm.", "Heat, insurance, or Florida car culture outside the core becomes too much.", [
    "Beach Dr NE between 1st Ave N and 5th Ave NE",
    "Central Ave between 2nd St and 11th St",
    "St. Pete Pier approach",
    "Bayshore Dr NE along Vinoy / North Straub Park",
    "1st Ave N / Baum Ave in the Edge District",
  ]),
  city("Beaufort, SC", "Bay Street / Waterfront Park", "Bay St & West St", "Unscheduled", cityWhyByCity["Beaufort, SC"], "You want Piran-scale waterfront public life without needing a big-city backdrop.", "It feels too quiet, too humid, or too retirement-oriented outside the best blocks.", [
    "Bay St between West St and Carteret St",
    "Henry C. Chambers Waterfront Park",
    "West St between Bay St and Craven St",
    "Carteret St between Bay St and Craven St",
    "Port Republic St between West St and Carteret St",
  ]),
  city("St. Augustine, FL", "Historic Downtown / Bridge of Lions", "St George St & Hypolita St", "Unscheduled", cityWhyByCity["St. Augustine, FL"], "You want the closest Florida version of an old-world walking town.", "The tourist concentration overwhelms normal daily life or grocery-level practicality.", [
    "St George St between City Gate and Cathedral Pl",
    "Aviles St between King St and Charlotte St",
    "Cathedral Pl between St George St and Charlotte St",
    "Avenida Menendez along Matanzas Bay",
    "Bridge of Lions approach / Plaza de la Constitucion",
  ]),
  city("Greenville, SC", "Main Street / Falls Park", "S Main St & Falls Park Dr", "Unscheduled", cityWhyByCity["Greenville, SC"], "You want public realm, restaurants, and easier cost structure more than coastal romance.", "It feels too engineered, too inland, or too conventional compared with Slovenia.", [
    "S Main St between Broad St and Falls Park Dr",
    "Falls Park Dr / Liberty Bridge",
    "River St between Broad St and Falls Park Dr",
    "Augusta St near RiverPlace",
    "N Main St between Coffee St and Washington St",
  ]),
  city("Petaluma, CA", "Historic Downtown / Turning Basin", "Petaluma Blvd N & Western Ave", "Unscheduled", cityWhyByCity["Petaluma, CA"], "You want California climate and texture without fully entering resort wealth.", "It does not have enough setting drama to compete with the benchmark towns.", [
    "Petaluma Blvd N between Washington St and Western Ave",
    "Western Ave between Petaluma Blvd N and Keller St",
    "Kentucky St between Washington St and Western Ave",
    "Water St / Turning Basin",
    "B St between 4th St and Petaluma Blvd S",
  ]),
  city("Carmel-by-the-Sea, CA", "Ocean Ave / Carmel Beach", "Ocean Ave & Dolores St", "Unscheduled", cityWhyByCity["Carmel-by-the-Sea, CA"], "Beauty, walkability, and winter climate outweigh discomfort with moneyed polish.", "It confirms that hyper-wealthy resort perfection is not the life you want.", [
    "Ocean Ave between Junipero St and Monte Verde St",
    "Dolores St between 5th Ave and 7th Ave",
    "San Carlos St between 5th Ave and 7th Ave",
    "Lincoln St between Ocean Ave and 7th Ave",
    "Scenic Rd / Carmel Beach at Ocean Ave",
  ]),
  city("Newburyport, MA", "Market Square / Waterfront", "State St & Water St", "Unscheduled", cityWhyByCity["Newburyport, MA"], "You want harbor-town public life and Boston access more than mild winter perfection.", "Winter damp/cold shrinks public life too much.", [
    "State St between Pleasant St and Water St",
    "Market Square",
    "Water St between State St and Green St",
    "Inn St pedestrian lane",
    "Merrimac St / Waterfront Park boardwalk",
  ]),
  city("Cape May, NJ", "Washington Street Mall / Beach Ave", "Washington St & Decatur St", "Unscheduled", cityWhyByCity["Cape May, NJ"], "You want a compact seaside walking town and can tolerate shoulder-season quiet.", "It empties out too much after holidays and becomes more resort than home.", [
    "Washington Street Mall between Ocean St and Perry St",
    "Carpenter Ln near Washington St",
    "Decatur St between Washington St and Beach Ave",
    "Beach Ave promenade at Convention Hall",
    "Jackson St between Beach Ave and Carpenter Ln",
  ]),
  city("Durango, CO", "Main Avenue / Animas River", "Main Ave & 9th St", "Unscheduled", cityWhyByCity["Durango, CO"], "You want Bled's mountain energy more than coastal softness.", "Winter still makes the rhythm feel too cold or too seasonal.", [
    "Main Ave between 8th St and 11th St",
    "E 2nd Ave between 8th St and 11th St",
    "Animas River Trail near 9th St",
    "Main Ave near the Durango & Silverton depot",
    "College Dr between Main Ave and E 2nd Ave",
  ]),
  city("Charlottesville, VA", "Downtown Mall / Court Square", "E Main St & 2nd St SE", "Unscheduled", cityWhyByCity["Charlottesville, VA"], "You want a pedestrian public room with intellectual/cultural life.", "The surrounding city does not live up to the mall, or the college-town politics feel heavy.", [
    "Downtown Mall between 1st St N and 4th St NE",
    "2nd St SE between Market St and Water St",
    "Market St near Court Square",
    "Water St between 2nd St SE and 4th St SE",
    "W Main St near Dairy Market",
  ]),
  city("Eureka Springs, AR", "Historic Downtown", "Spring St & Center St", "Unscheduled", cityWhyByCity["Eureka Springs, AR"], "You want character, hills, porches, and local weirdness more than polish.", "The town is too small, too tourist-dependent, or too disconnected from larger systems.", [
    "Spring St between Center St and Main St",
    "Main St between Spring St and North Main St",
    "Center St between Spring St and Mountain St",
    "Basin Spring Park",
    "N Main St near the trolley depot",
  ]),
];

export function benchmark(name, type, note, scores) {
  return {
    id: `benchmark-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`,
    name,
    type,
    note,
    matrix: scoresToMatrix(scores),
  };
}

export function city(name, stayZone, heartIntersection, tripWeek, why, ifWins, ifFails, blocks) {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${slugify(name)}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    heroImage: autoImage(cityImageQuery(name, stayZone, heartIntersection)),
    stayZoneImage: autoImage(stayZoneImageQuery(name, stayZone)),
    status: tripWeek ? "Shortlist" : "Idea",
    tripWeek,
    stayZone,
    heartIntersection,
    why,
    ifWins,
    ifFails,
    matrix: matrixFor(name),
    arriveDate: "",
    departDate: "",
    tripLength: "7 nights",
    flightDetails: "",
    carDetails: "",
    lodgingDetails: "",
    logisticsNotes: "",
    blocks,
    blockImages: blocks.map((block) => autoImage(blockImageQuery(name, block))),
    days: [
      { title: "Arrival rhythm", plan: "Check in, walk the heart intersection, find an ordinary dinner, and note whether the place feels alive after dark." },
      { title: "Normal weekday", plan: "Coffee, grocery run, work block, neighborhood walk, casual dinner. Watch who is outside and why." },
      { title: "Nature day", plan: "Test the closest high-value nature access without making it feel like a vacation production." },
    ],
    checklists: {
      before: [
        { text: "Book lodging within a 10-minute walk of the heart intersection", done: false },
        { text: "Confirm direct flight and realistic drive time", done: false },
        { text: "Check winter weather and flood/fire/insurance risks", done: false },
      ],
      during: [
        { text: "Walk the core exploration zones at morning, afternoon, and evening", done: false },
        { text: "Work remotely from two cafes or coworking spots", done: false },
        { text: "Do grocery, pharmacy, gym, and dinner without using the car", done: false },
      ],
      after: [
        { text: "Write a 24-hour gut memo before comparing numbers", done: false },
        { text: "Score against Bled/Piran feeling, not generic livability", done: false },
        { text: "Decide advance, winter revisit, or eliminate", done: false },
      ],
    },
    firstImpressions: "",
    dailyLife: "",
    concerns: "",
    decisionMemo: "",
    finalRating: "",
    revisit: "Unknown",
    decision: "Undecided",
    // Calibration/baseline place (a known reference or control), not a real
    // candidate to visit — can be hidden from the ranking.
    isCalibration: false,
    // Felt-score questionnaire result. Null until surveyed.
    survey: emptySurvey(),
    // Objective/measured score (0–10) from the data pipeline. Null until a
    // city has actually been run through measurement — never faked.
    measured: null,
    // Per-metric data points, each { value, asOf } once measured (null until
    // then). Every key from metricTaxonomy is present, so the UI can show the
    // full cited taxonomy with "not yet measured" where data is missing.
    measuredMetrics: emptyMeasured(),
  };
}

export function matrixFor(name) {
  return scoresToMatrix(matrixSeedScores[name] || [7, 7, 7, 7, 7, 7, 7, 7]);
}

export function scoresToMatrix(scores) {
  return Object.fromEntries(matrixDimensions.map(([key], index) => [key, String(scores[index] ?? 7)]));
}

export function normalizeMatrix(matrix, name) {
  const fallback = matrixFor(name);
  return Object.fromEntries(matrixDimensions.map(([key]) => [key, String(matrix?.[key] ?? fallback[key] ?? 7)]));
}

export function averageScore(matrix) {
  const scores = matrixDimensions.map(([key]) => Number(matrix?.[key] || 0));
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 110);
}

export function citySlug(cityItem) {
  return slugify(cityItem.name);
}

export function autoImage(query) {
  return `commons-search:${query}`;
}

export function cityImageQuery(name) {
  if (CITY_IMAGE_QUERY_OVERRIDES[name]) return CITY_IMAGE_QUERY_OVERRIDES[name];
  return `${name} downtown main street public life people color photo`;
}

export function stayZoneImageQuery(name, stayZone) {
  return `${name} ${cleanSearchPlace(stayZone || "downtown")} street life people color photo`;
}

export function blockImageQuery(name, block) {
  return `${name} ${focusAreaSearchSubject(block)} street life people outdoor dining public place color photo`;
}

export function blockMapQuery(name, block) {
  return formatMapSearchQuery(name, block);
}

export function cleanSearchPlace(value) {
  return String(value || "")
    .replaceAll("/", " ")
    .replaceAll("&", " ")
    .replace(/\bbetween\b.*$/i, "")
    .replace(/\bfrom\b.*$/i, "")
    .replace(/\baround\b/i, "")
    .replace(/\bnear\b/i, "")
    .replace(/\bat\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function blockEvidenceSubject(block) {
  return block
    .replace(/\bbetween\b.*$/i, "")
    .replace(/\bfrom\b.*$/i, "")
    .replace(/\baround\b/i, "")
    .replace(/\bnear\b/i, "")
    .replace(/\bat\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function focusAreaSearchSubject(block) {
  const clean = cleanSearchPlace(block);
  const landmark = landmarkSearchSubject(clean);
  if (landmark) {
    const anchor = leadingPlaceAnchor(block);
    return anchor && !new RegExp(`\\b${escapeRegExp(landmark)}\\b`, "i").test(anchor) ? `${anchor} ${landmark}` : landmark;
  }
  const segment = streetSegmentSubject(block);
  if (segment) return segment;
  return blockEvidenceSubject(clean);
}

export function streetSegmentSubject(block) {
  const match = String(block || "").match(/^(.+?)\s+between\s+(.+?)(?:\s+and\s+|$)/i);
  if (!match) return "";
  return cleanSearchPlace(`${match[1]} ${match[2]}`);
}

export function leadingPlaceAnchor(block) {
  return cleanSearchPlace(String(block || "").split(/\s+\/\s+|\s+near\s+|\s+around\s+|\s+at\s+/i)[0]);
}

export function landmarkSearchSubject(value) {
  const landmarks = [
    "Stearns Wharf", "Mission Plaza", "Abbott Square", "Lovers Point", "Cannery Row", "Waterfront Park", "Taylor Dock",
    "South Bay Trail", "Ashland Plaza", "Lithia Park", "City Dock", "Ego Alley", "State Circle", "Forsyth Park",
    "River Street", "Colonial Lake", "St. Pete Pier", "North Straub Park", "Henry C. Chambers Waterfront Park",
    "Bridge of Lions", "Plaza de la Constitucion", "Falls Park", "Liberty Bridge", "Turning Basin", "Carmel Beach",
    "Washington Street Mall", "Convention Hall", "Animas River Trail", "Downtown Mall", "Court Square", "Dairy Market",
    "Basin Spring Park",
  ];
  return landmarks.find((landmark) => new RegExp(`\\b${escapeRegExp(landmark)}\\b`, "i").test(value)) || "";
}

export function blockRepresentativeSubject(block) {
  const clean = blockEvidenceSubject(block);
  if (/\byanonali|helena|funk zone\b/i.test(clean)) return "Funk Zone restaurants wine tasting street scene";
  if (/\banacapa\b/i.test(clean)) return "Anacapa Street courthouse downtown street scene";
  if (/\bstate st|state street\b/i.test(clean)) return "Lower State Street downtown outdoor dining pedestrians";
  if (/\bstearns wharf|cabrillo|wharf\b/i.test(clean)) return "Stearns Wharf waterfront promenade beach";
  if (/\bmission plaza|plaza|square|state circle|court square|market square\b/i.test(block)) return `${clean} plaza public square people`;
  if (/\bwaterfront|harbor|dock|pier|promenade|bay|river|turning basin|ego alley\b/i.test(block)) return `${clean} waterfront promenade people`;
  if (/\bpark|trail|beach|bridge|lighthouse|falls|creek\b/i.test(block)) return `${clean} public outdoor gathering`;
  if (/\bmall|market|main st|main street|avenue|ave|street|st\b/i.test(block)) return `${clean} street life outdoor dining shops`;
  return `${clean} public life street scene`;
}

const focusAreaAnchorByCity = {
  "Santa Barbara, CA": {
    "State St between Gutierrez St and Yanonali St": "State Street Promenade",
    "Yanonali St between State St and Anacapa St": "Funk Zone",
    "Anacapa St between Yanonali St and Mason St": "Santa Barbara County Courthouse",
    "Cabrillo Blvd around Stearns Wharf": "Stearns Wharf",
    "Helena Ave / Santa Barbara St in the Funk Zone": "Funk Zone",
  },
  "Ventura, CA": {
    "Main St between Figueroa St and Fir St": "Downtown Ventura",
    "California St between Main St and Santa Clara St": "Ventura City Hall",
    "Main St between Oak St and California St": "Mission Park",
    "Palm St between Main St and Santa Clara St": "Ventura Botanical Gardens gateway",
    "Ventura Pier / Promenade at California St": "Ventura Pier",
  },
  "San Luis Obispo, CA": {
    "Higuera St between Nipomo St and Osos St": "Downtown SLO Farmers' Market zone",
    "Garden St between Higuera St and Marsh St": "Hotel SLO / Garden Street terraces",
    "Chorro St between Monterey St and Higuera St": "Mission Plaza",
    "Monterey St around Mission Plaza": "Mission Plaza",
    "Broad St between Monterey St and Higuera St": "Downtown Creamery / Broad Street district",
  },
  "Santa Cruz, CA": {
    "Pacific Ave between Cathcart St and Cooper St": "Pacific Avenue",
    "Cooper St / Abbott Square": "Abbott Square Market",
    "Front St near Abbott Square": "Abbott Square",
    "West Cliff Dr around Lighthouse Point": "Lighthouse Point",
    "Beach St near the Boardwalk / Wharf": "Santa Cruz Beach Boardwalk",
  },
  "Monterey / Pacific Grove, CA": {
    "Lighthouse Ave between 16th St and Fountain Ave": "Downtown Pacific Grove",
    "Forest Ave between Lighthouse Ave and Central Ave": "Pacific Grove Museum of Natural History district",
    "Ocean View Blvd near Lovers Point": "Lovers Point",
    "Cannery Row near Prescott Ave": "Cannery Row",
    "Alvarado St between Pearl St and Franklin St": "Alvarado Street",
  },
  "Hood River, OR": {
    "Oak St between 1st St and 6th St": "Downtown Hood River",
    "2nd St between State St and Cascade Ave": "Pacific Central Station / downtown Hood River",
    "Cascade Ave between 1st St and 5th St": "Hood River Hotel district",
    "Front St / waterfront trail near 2nd St": "Hood River Waterfront Park",
    "Portway Ave near Waterfront Park": "Waterfront Park",
  },
  "Bellingham, WA": {
    "Harris Ave between 10th St and 12th St": "Fairhaven Village Green",
    "11th St between Harris Ave and Mill Ave": "Historic Fairhaven",
    "Taylor Dock / South Bay Trail": "Taylor Dock",
    "Bay St / Holly St downtown": "Bellingham Downtown Station district",
    "Railroad Ave between Holly St and Magnolia St": "Railroad Avenue",
  },
  "Ashland, OR": {
    "Ashland Plaza": "Ashland Plaza",
    "N Main St between Plaza and Lithia Way": "Ashland Plaza",
    "E Main St between 1st St and 3rd St": "Lithia Springs Hotel district",
    "Calle Guanajuato along Ashland Creek": "Calle Guanajuato",
    "Winburn Way into Lithia Park": "Lithia Park",
  },
  "Annapolis, MD": {
    "Main St between Church Circle and City Dock": "Main Street Annapolis",
    "Dock St / Ego Alley": "Ego Alley",
    "Maryland Ave between State Circle and Prince George St": "Maryland Avenue",
    "State Circle": "Maryland State House",
    "Severn Ave near Fourth St in Eastport": "Eastport waterfront",
  },
  "Savannah, GA": {
    "Bull St from Johnson Square to Chippewa Square": "Chippewa Square",
    "Broughton St between Whitaker St and Drayton St": "Broughton Street",
    "Jones St between Bull St and Abercorn St": "Jones Street",
    "Forsyth Park north edge at Gaston St": "Forsyth Park fountain",
    "River St / Factors Walk near Barnard Ramp": "River Street",
  },
  "Charleston, SC": {
    "King St between Spring St and Calhoun St": "Upper King",
    "Cannon St between Coming St and King St": "Cannonborough-Elliotborough",
    "Coming St near Cannon / Spring": "The Daily / Upper King side streets",
    "Broad St between King St and Meeting St": "Broad Street",
    "Colonial Lake / Rutledge Ave edge": "Colonial Lake",
  },
  "St. Petersburg, FL": {
    "Beach Dr NE between 1st Ave N and 5th Ave NE": "Beach Drive",
    "Central Ave between 2nd St and 11th St": "Central Avenue",
    "St. Pete Pier approach": "St. Pete Pier",
    "Bayshore Dr NE along Vinoy / North Straub Park": "North Straub Park",
    "1st Ave N / Baum Ave in the Edge District": "EDGE District",
  },
  "Beaufort, SC": {
    "Bay St between West St and Carteret St": "Henry C. Chambers Waterfront Park",
    "Henry C. Chambers Waterfront Park": "Henry C. Chambers Waterfront Park",
    "West St between Bay St and Craven St": "Downtown Beaufort",
    "Carteret St between Bay St and Craven St": "Downtown Beaufort",
    "Port Republic St between West St and Carteret St": "Historic Beaufort",
  },
  "St. Augustine, FL": {
    "St George St between City Gate and Cathedral Pl": "St. George Street",
    "Aviles St between King St and Charlotte St": "Aviles Street",
    "Cathedral Pl between St George St and Charlotte St": "Plaza de la Constitucion",
    "Avenida Menendez along Matanzas Bay": "Bayfront / Castillo de San Marcos",
    "Bridge of Lions approach / Plaza de la Constitucion": "Bridge of Lions",
  },
  "Greenville, SC": {
    "S Main St between Broad St and Falls Park Dr": "Main Street Greenville",
    "Falls Park Dr / Liberty Bridge": "Falls Park on the Reedy",
    "River St between Broad St and Falls Park Dr": "RiverPlace",
    "Augusta St near RiverPlace": "RiverPlace",
    "N Main St between Coffee St and Washington St": "NOMA Square",
  },
  "Petaluma, CA": {
    "Petaluma Blvd N between Washington St and Western Ave": "Petaluma Theatre District",
    "Western Ave between Petaluma Blvd N and Keller St": "Historic Downtown Petaluma",
    "Kentucky St between Washington St and Western Ave": "Theater Square",
    "Water St / Turning Basin": "Petaluma Turning Basin",
    "B St between 4th St and Petaluma Blvd S": "Petaluma Arts Center district",
  },
  "Carmel-by-the-Sea, CA": {
    "Ocean Ave between Junipero St and Monte Verde St": "Ocean Avenue",
    "Dolores St between 5th Ave and 7th Ave": "Carmel Plaza district",
    "San Carlos St between 5th Ave and 7th Ave": "Downtown Carmel",
    "Lincoln St between Ocean Ave and 7th Ave": "Carmel-by-the-Sea village center",
    "Scenic Rd / Carmel Beach at Ocean Ave": "Carmel Beach",
  },
  "Newburyport, MA": {
    "State St between Pleasant St and Water St": "Market Square",
    "Market Square": "Market Square",
    "Water St between State St and Green St": "Newburyport waterfront",
    "Inn St pedestrian lane": "Inn Street",
    "Merrimac St / Waterfront Park boardwalk": "Waterfront Park",
  },
  "Cape May, NJ": {
    "Washington Street Mall between Ocean St and Perry St": "Washington Street Mall",
    "Carpenter Ln near Washington St": "Washington Street Mall",
    "Decatur St between Washington St and Beach Ave": "Congress Hall / Decatur Street",
    "Beach Ave promenade at Convention Hall": "Cape May Promenade",
    "Jackson St between Beach Ave and Carpenter Ln": "Jackson Street",
  },
  "Durango, CO": {
    "Main Ave between 8th St and 11th St": "Historic Downtown Durango",
    "E 2nd Ave between 8th St and 11th St": "Downtown Durango side streets",
    "Animas River Trail near 9th St": "Animas River Trail",
    "Main Ave near the Durango & Silverton depot": "Durango & Silverton Depot",
    "College Dr between Main Ave and E 2nd Ave": "Fort Lewis / north downtown edge",
  },
  "Charlottesville, VA": {
    "Downtown Mall between 1st St N and 4th St NE": "Downtown Mall",
    "2nd St SE between Market St and Water St": "IX Art Park / east Downtown Mall edge",
    "Market St near Court Square": "Court Square",
    "Water St between 2nd St SE and 4th St SE": "Water Street district",
    "W Main St near Dairy Market": "Dairy Market",
  },
  "Eureka Springs, AR": {
    "Spring St between Center St and Main St": "Basin Spring Park",
    "Main St between Spring St and North Main St": "Historic Downtown Eureka Springs",
    "Center St between Spring St and Mountain St": "Basin Spring Park",
    "Basin Spring Park": "Basin Spring Park",
    "N Main St near the trolley depot": "Eureka Springs Transit Center",
  },
};

const stayZoneAnchorByCity = {
  "Santa Barbara, CA": "Funk Zone",
  "Ventura, CA": "Downtown Ventura",
  "San Luis Obispo, CA": "Mission Plaza",
  "Santa Cruz, CA": "Abbott Square",
  "Monterey / Pacific Grove, CA": "Lovers Point",
  "Hood River, OR": "Waterfront Park",
  "Bellingham, WA": "Historic Fairhaven",
  "Ashland, OR": "Ashland Plaza",
  "Annapolis, MD": "City Dock",
  "Savannah, GA": "Chippewa Square",
  "Charleston, SC": "Upper King",
  "St. Petersburg, FL": "Beach Drive",
  "Beaufort, SC": "Henry C. Chambers Waterfront Park",
  "St. Augustine, FL": "Plaza de la Constitucion",
  "Greenville, SC": "Falls Park on the Reedy",
  "Petaluma, CA": "Petaluma Turning Basin",
  "Carmel-by-the-Sea, CA": "Ocean Avenue",
  "Newburyport, MA": "Market Square",
  "Cape May, NJ": "Washington Street Mall",
  "Durango, CO": "Historic Downtown Durango",
  "Charlottesville, VA": "Downtown Mall",
  "Eureka Springs, AR": "Basin Spring Park",
};

const cityImageAnchorByCity = {
  "Santa Barbara, CA": "Santa Barbara waterfront",
  "Ventura, CA": "Ventura Pier",
  "San Luis Obispo, CA": "Mission Plaza",
  "Santa Cruz, CA": "West Cliff Drive",
  "Monterey / Pacific Grove, CA": "Lovers Point",
  "Hood River, OR": "Columbia River waterfront",
  "Bellingham, WA": "Fairhaven waterfront",
  "Ashland, OR": "Ashland Plaza",
  "Annapolis, MD": "City Dock",
  "Savannah, GA": "Forsyth Park",
  "Charleston, SC": "Charleston waterfront",
  "St. Petersburg, FL": "St. Pete Pier",
  "Beaufort, SC": "Waterfront Park",
  "St. Augustine, FL": "Bridge of Lions",
  "Greenville, SC": "Falls Park on the Reedy",
  "Petaluma, CA": "Petaluma riverfront",
  "Carmel-by-the-Sea, CA": "Carmel Beach",
  "Newburyport, MA": "Newburyport waterfront",
  "Cape May, NJ": "Cape May Promenade",
  "Durango, CO": "Historic Downtown Durango",
  "Charlottesville, VA": "Downtown Mall",
  "Eureka Springs, AR": "Basin Spring Park",
};

export function focusAreaAnchor(cityItem, block) {
  return focusAreaAnchorByCity[cityItem.name]?.[block]
    || landmarkSearchSubject(block)
    || focusAreaSearchSubject(block)
    || cleanSearchPlace(block);
}

export function stayZoneAnchor(cityItem) {
  return stayZoneAnchorByCity[cityItem.name]
    || landmarkSearchSubject(cityItem.stayZone || "")
    || cleanSearchPlace(cityItem.stayZone || cityItem.heartIntersection || cityItem.name);
}

export function cityImageAnchor(cityItem) {
  return cityImageAnchorByCity[cityItem.name]
    || cleanSearchPlace(cityItem.name);
}

export function googleMapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function googleImageSearchUrl(query) {
  return `https://www.google.com/search?udm=2&hl=en&q=${encodeURIComponent(query)}`;
}

function splitCityState(cityName) {
  const [cityPart, statePart] = String(cityName || "").split(",").map((part) => part.trim());
  return {
    cityPart: cityPart || String(cityName || "").trim(),
    statePart: statePart || "",
  };
}

function stripDirectionalLead(value) {
  return String(value || "")
    .replace(/^\b(the)\b\s+/i, "")
    .trim();
}

function blockToMapSubject(block) {
  const raw = String(block || "").trim();
  const betweenMatch = raw.match(/^(.+?)\s+between\s+(.+?)\s+and\s+(.+)$/i);
  if (betweenMatch) {
    return `${stripDirectionalLead(betweenMatch[1])} & ${stripDirectionalLead(betweenMatch[3])}`;
  }
  const fromMatch = raw.match(/^(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i);
  if (fromMatch) {
    return `${stripDirectionalLead(fromMatch[1])} & ${stripDirectionalLead(fromMatch[3])}`;
  }
  if (/\s+\/\s+/i.test(raw)) {
    return raw.replace(/\s*\/\s*/g, " & ").trim();
  }
  const nearLike = raw.match(/^(.+?)\s+(?:near|around|at)\s+(.+)$/i);
  if (nearLike) {
    return stripDirectionalLead(nearLike[2]);
  }
  return raw;
}

export function formatMapSearchQuery(cityName, subject) {
  const { cityPart, statePart } = splitCityState(cityName);
  const place = blockToMapSubject(subject);
  return [place, cityPart, statePart].filter(Boolean).join(", ");
}

export function formatImageSearchQuery(cityName, anchor) {
  const { cityPart, statePart } = splitCityState(cityName);
  const subject = stripDirectionalLead(anchor || cityPart);
  return [subject, `${cityPart}${statePart ? ` ${statePart}` : ""}`].filter(Boolean).join(", ");
}

export function imageResearchBrief(cityItem, kind, block = "") {
  if (kind === "hero") {
    const anchor = cityImageAnchor(cityItem);
    return {
      target: cityItem.name,
      anchor,
      mapsQuery: formatMapSearchQuery(cityItem.name, anchor),
      imageQuery: formatImageSearchQuery(cityItem.name, anchor),
      rationale: "Use the city-scale anchor that best compresses the overall setting and public life into one frame.",
    };
  }
  if (kind === "stay") {
    const anchor = stayZoneAnchor(cityItem);
    return {
      target: cityItem.stayZone || cityItem.heartIntersection || cityItem.name,
      anchor,
      mapsQuery: formatMapSearchQuery(cityItem.name, cityItem.heartIntersection || cityItem.stayZone || cityItem.name),
      imageQuery: formatImageSearchQuery(cityItem.name, anchor),
      rationale: "Use the nearest public anchor that explains why staying in this zone would feel alive day to day.",
    };
  }
  const anchor = focusAreaAnchor(cityItem, block);
  return {
    target: block,
    anchor,
    mapsQuery: formatMapSearchQuery(cityItem.name, block),
    imageQuery: formatImageSearchQuery(cityItem.name, anchor),
    rationale: "Start from the actual block in Maps, then use the nearest meaningful public anchor to find a representative image.",
  };
}

export function cityZones(cityItem) {
  const zoneMap = new Map();
  (cityItem.blocks || []).forEach((block, index) => {
    const anchor = focusAreaAnchor(cityItem, block);
    const key = `${slugify(anchor)}::${slugify(cityItem.name)}`;
    const brief = testSpotBrief(cityItem, block);
    const entry = zoneMap.get(key) || {
      id: `${cityItem.id || slugify(cityItem.name)}-zone-${zoneMap.size + 1}`,
      key,
      anchor,
      name: zoneName(anchor, block),
      blocks: [],
      attractions: [],
      startingPoint: formatMapSearchQuery(cityItem.name, block),
      pathway: "",
      knownFor: zoneKnownFor(cityItem.name, anchor, brief.knownFor),
      imageIntent: brief.imageIntent,
      imageQuery: formatImageSearchQuery(cityItem.name, anchor),
      mapQuery: formatMapSearchQuery(cityItem.name, block),
      firstIndex: index,
    };
    entry.blocks.push(block);
    entry.attractions = uniqueList([...entry.attractions, ...zoneAttractions(cityItem, block, anchor)]);
    entry.pathway = zonePathway(cityItem.name, entry.blocks);
    zoneMap.set(key, entry);
  });
  return Array.from(zoneMap.values());
}

export function blockImageIntent(block) {
  if (/\bplaza|square|park|waterfront|pier|promenade|wharf|dock|trail|beach|bridge|mall|market\b/i.test(block)) {
    return "Show the public place that would make you linger here.";
  }
  return "Show the street life, cafe row, event, or anchor business that gives this place a real pulse.";
}

function zoneName(anchor, block) {
  if (/\bfunk zone\b/i.test(anchor)) return "Funk Zone";
  if (/\bstate street promenade\b/i.test(anchor)) return "Lower State Promenade";
  if (/\bcourthouse\b/i.test(anchor)) return "Courthouse + Civic Core";
  if (/\bstearns wharf\b/i.test(anchor)) return "Waterfront + Wharf";
  if (/\bmission plaza\b/i.test(anchor)) return "Mission Plaza Core";
  if (/\babbott square\b/i.test(anchor)) return "Abbott Square + Pacific";
  if (/\blovers point\b/i.test(anchor)) return "Lovers Point Waterfront";
  if (/\bwaterfront park\b/i.test(anchor)) return "Waterfront Park";
  if (/\bcity dock\b/i.test(anchor)) return "City Dock";
  if (/\bforsyth park\b/i.test(anchor)) return "Forsyth + Bull Street";
  if (/\bbeach drive\b/i.test(anchor)) return "Beach Drive Waterfront";
  if (/\bplaza de la constitucion\b/i.test(anchor)) return "Plaza + Bayfront";
  return anchor || cleanSearchPlace(block);
}

function zoneAttractions(cityItem, block, anchor) {
  const attractions = [anchor];
  const landmark = landmarkSearchSubject(block);
  if (landmark && landmark !== anchor) attractions.push(landmark);
  if (/\bfunk zone\b/i.test(anchor)) attractions.push("The Lark", "Helena Avenue tasting rooms");
  if (/\bstate street promenade\b/i.test(anchor)) attractions.push("State Street cafes", "Lower State storefronts");
  if (/\bcourthouse\b/i.test(anchor)) attractions.push("County Courthouse", "Anacapa Street");
  if (/\bstearns wharf\b/i.test(anchor)) attractions.push("Stearns Wharf", "Cabrillo promenade");
  return uniqueList(attractions.filter(Boolean));
}

function zoneKnownFor(cityName, anchor, fallback) {
  if (/\bfunk zone\b/i.test(anchor)) return "This is the loose, social, food-and-wine zone between downtown and the water: patios, tasting rooms, galleries, and the kind of casual public spillover that makes a place feel used rather than merely admired.";
  if (/\bstate street promenade\b/i.test(anchor)) return "This is the main all-day pedestrian zone: cafes, storefronts, meals, errands, and the strongest test of whether the city can carry ordinary life on foot from morning through evening.";
  if (/\bcourthouse\b/i.test(anchor)) return "This is the civic and architectural zone: slower blocks, courthouse texture, shaded edges, and a good test of whether beauty and public life still hold once you step away from the busiest commercial strip.";
  if (/\bstearns wharf\b/i.test(anchor)) return "This is the waterfront zone: promenade, pier, beach edge, and the daily test of whether the ocean-facing public realm feels like part of life instead of just the scenic reward.";
  if (/\bmission plaza\b/i.test(anchor)) return "This is the civic-room zone: the plaza, its adjacent restaurant blocks, and the part of town most likely to tell you whether people actually linger and loop here in normal life.";
  if (/\babbott square\b/i.test(anchor)) return "This is the social core zone: market, food, patios, and the blocks where downtown energy condenses most clearly into visible public life.";
  if (/\blovers point\b/i.test(anchor)) return "This is the water-edge village zone: coastal path, gathering spots, and the blocks that test whether the place feels magnetic in everyday repetition rather than just in scenic flashes.";
  if (/\bcity dock\b/i.test(anchor)) return "This is the harbor-room zone: boats, promenades, restaurants, and the blocks where the town most clearly behaves like a real waterfront public square.";
  if (/\bforsyth park\b/i.test(anchor)) return "This is the public-room zone: the park and its adjacent streets where Savannah's walking rhythm, shade, and social life become easiest to feel in your body.";
  if (/\bbeach drive\b/i.test(anchor)) return "This is the waterfront urban zone: parks, restaurants, museums, and the stretch where outdoor life, strolling, and city energy overlap most naturally.";
  return fallback || `${anchor} is one of the main zones worth testing on foot in ${cityName}.`;
}

function zonePathway(cityName, blocks) {
  const [first, ...rest] = blocks;
  if (!first) return "";
  const subjects = [first, ...rest].map((item) => blockToMapSubject(item));
  if (subjects.length === 1) {
    return `Start at ${formatMapSearchQuery(cityName, first)} and loop the zone until the social rhythm becomes clear.`;
  }
  return `Start at ${formatMapSearchQuery(cityName, first)}, then continue through ${subjects.slice(1).join(" -> ")} before looping back.`;
}

function uniqueList(items) {
  return [...new Set((items || []).filter(Boolean))];
}

export function testSpotBrief(cityItem, block) {
  const cityName = cityItem.name;
  const clean = blockEvidenceSubject(block);
  let knownFor = `${clean} is one of the core walk-test areas in ${cityName}, useful for seeing whether the center has everyday foot traffic beyond the prettiest view.`;
  let whatToWatch = "Walk it once during coffee hours, once around dinner, and once after dark; look for locals, open doors, outdoor seating, errands, and whether lingering feels natural.";

  if (/\bstate st|state street\b/i.test(block)) {
    knownFor = "Lower State is the main downtown-to-waterfront spine: restaurants, bars, storefronts, hotels, and the daily test of whether Santa Barbara feels like a real pedestrian city.";
    whatToWatch = "Check whether the street has all-day rhythm, not just visitor traffic: coffee, lunch, after-work patios, evening strolling, and how comfortable the walk feels toward the beach.";
  } else if (/\byanonali|helena|funk zone\b/i.test(block)) {
    knownFor = "This is the Funk Zone edge: wine rooms, food, galleries, converted industrial buildings, and the less-formal social texture between downtown and the waterfront.";
    whatToWatch = "Look for casual spillover into the street: groups moving between places, patios that stay active, gallery or tasting-room energy, and whether it feels useful on a normal weekday.";
  } else if (/\banacapa\b/i.test(block)) {
    knownFor = "Anacapa gives you the civic and architectural side of downtown: courthouse texture, older buildings, side-street calm, and a useful contrast to State Street.";
    whatToWatch = "Test whether the side streets feel connected or dead: office workers, locals crossing between errands, quiet shade, and whether the beauty supports daily life or just photographs.";
  } else if (/\bstearns wharf|cabrillo|wharf\b/i.test(block)) {
    knownFor = "This is the waterfront test: beach promenade, pier, harbor views, mountains over the water, and the strongest public-room feeling near the ocean.";
    whatToWatch = "Separate beauty from livability: morning walkers, bike traffic, casual meals, sunset crowds, and whether you would actually return weekly instead of treating it as a vacation set piece.";
  } else if (/\bplaza|square|state circle|court square|market square|mission plaza\b/i.test(block)) {
    knownFor = `${clean} is the civic-room test: the place most likely to behave like a piazza, with sitting, crossing paths, events, and spontaneous lingering.`;
    whatToWatch = "Spend time without a plan. Watch whether people naturally pause, meet, sit, eat, and pass through, or whether it only works during programmed events.";
  } else if (/\bwaterfront|harbor|dock|pier|promenade|bay|river|turning basin|ego alley\b/i.test(block)) {
    knownFor = `${clean} is the water-edge test: views, walking loops, restaurants or benches, and the chance for public life to gather around the setting.`;
    whatToWatch = "Check morning, afternoon, and evening use. The question is whether the water creates a daily ritual, not just a scenic stop.";
  } else if (/\bpark|trail|beach|bridge|lighthouse|falls|creek\b/i.test(block)) {
    knownFor = `${clean} tests whether nature is directly attached to ordinary life rather than separated into weekend excursions.`;
    whatToWatch = "Look for people using it casually: short walks, benches, dogs, lunch breaks, commuting paths, and easy transitions back into cafes or errands.";
  } else if (/\bmall|market|main st|main street|avenue|ave|street|st\b/i.test(block)) {
    knownFor = `${clean} is a street-life test: shops, cafes, errands, small businesses, and the density of reasons to keep walking.`;
    whatToWatch = "Watch storefront continuity, patio life, local errands, evening lights, and whether the block still has pulse when nothing special is happening.";
  }

  const imageIntent = `${blockImageIntent(block)} Search for ${blockRepresentativeSubject(block).toLowerCase()}, not the literal intersection.`;
  return { knownFor, whatToWatch, imageIntent };
}

export function normalizeState(nextState) {
  const state = structuredClone(nextState);
  const existingNames = new Set(state.cities.map((item) => item.name));
  starterCities.forEach((starter) => {
    if (!existingNames.has(starter.name)) state.cities.push(structuredClone(starter));
  });

  state.cities.forEach((cityItem) => {
    cityItem.blocks ||= [];
    if (!cityItem.why || cityItem.why === legacyWhyByCity[cityItem.name]) {
      cityItem.why = cityWhyByCity[cityItem.name] || cityItem.why || "";
    }
    cityItem.heroImage ||= autoImage(cityImageQuery(cityItem.name, cityItem.stayZone, cityItem.heartIntersection));
    cityItem.stayZoneImage ||= autoImage(stayZoneImageQuery(cityItem.name, cityItem.stayZone));
    cityItem.blockImages ||= cityItem.blocks.map((block) => autoImage(blockImageQuery(cityItem.name, block)));
    cityItem.days ||= [];
    cityItem.checklists ||= {};
    ["before", "during", "after"].forEach((key) => {
      cityItem.checklists[key] ||= [];
    });
    cityItem.matrix = normalizeMatrix(cityItem.matrix, cityItem.name);
    cityItem.revisit ||= "Unknown";
    cityItem.decision ||= "Undecided";
    cityItem.tripLength ||= "7 nights";
    cityItem.status ||= cityItem.tripWeek ? "Shortlist" : "Idea";

    // Felt-score questionnaire + objective measured score.
    cityItem.survey = { ...emptySurvey(), ...(cityItem.survey || {}) };
    if (cityItem.measured === undefined) cityItem.measured = null;
    cityItem.measuredMetrics = { ...emptyMeasured(), ...(cityItem.measuredMetrics || {}) };

    // Visit window: climate + crowd season. Derived reference/seed data (not
    // user input), so the seed always wins on load — keeps it correct when
    // the seed is updated. Pipeline-measured climate will supersede this.
    const seed = visitClimateSeed[cityItem.name];
    if (seed) {
      cityItem.visitClimate = seed.climate;
      cityItem.crowdSeason = seed.crowd;
      cityItem.seasonNotes = seed.notes;
    } else {
      cityItem.visitClimate ??= null;
      cityItem.crowdSeason ??= null;
      cityItem.seasonNotes ??= null;
    }
  });

  state.selectedId ||= state.cities[0]?.id;
  return state;
}

export function defaultState() {
  return normalizeState({ cities: structuredClone(starterCities), selectedId: starterCities[0].id });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
