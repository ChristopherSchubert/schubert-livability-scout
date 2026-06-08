// scripts/calibrate-decay.mjs
//
// Sweep (plateau, d_half) and pick the pair that best predicts the owner's
// felt-Aliveness baselines, using POIs from the local `pois` cache (Google
// Places). This script answers: "is a 500 m plateau with d_half=400 m a
// defensible choice, or does some other pair fit the felt scores better?"
//
// Method:
//   1. Pull `baseline_ratings` for the user with the most rated places (the
//      owner). Each row gives a place_name and a felt Aliveness 1–5.
//   2. Map place_name → cities row (lat/lon). Hand mapping for the seven
//      reference cities; fail loudly if any are missing.
//   3. For each city, pull every social POI from `pois` within 1600 m
//      haversine of the saved pin (cafés / bars / restaurants / bakeries
//      / coffee shops / meal_takeaway / ice_cream / brewery).
//   4. For each (plateau, d_half) grid cell, compute the weighted sum
//      Σ w(d_i) per city, then run leave-one-out linear regression of
//      Aliveness ~ weighted_sum. Report LOO R².
//   5. Compare against the baseline model — current 700 m hard count —
//      so we know how much better (or not) the new shape is.
//
// Caveat we accept: the calibration uses the SAVED PIN, not the adaptive
// findVisitCenters center. Calling findVisitCenters requires Overpass
// (heavy) and shifts at most a couple hundred meters; the relative ranking
// of cells against each other is robust to that.
//
// Usage:  node scripts/calibrate-decay.mjs

import pg from "pg";
import { execFileSync } from "node:child_process";

const dbpw = execFileSync(
  "security",
  ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"],
  { encoding: "utf8" },
).trim();

const client = new pg.Client({
  host: "aws-1-us-west-2.pooler.supabase.com",
  port: 5432,
  user: "postgres.fitjkrmiwkdolxhitroc",
  password: dbpw,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

// Hand mapping place_name → slug. Fail loud if the baseline names a place
// we don't recognize; better than silently dropping rows.
const PLACE_TO_SLUG = {
  "Piran, Slovenia":           "piran-slovenia",
  "Bled, Slovenia":            "bled-slovenia",
  "Lawrenceville, Pittsburgh": "pittsburgh-lawrenceville-pa",
  "Shadyside, Pittsburgh":     "pittsburgh-shadyside-pa",
  "Oakmont, PA":               "oakmont-pa",
  "Allison Park, PA":          "allison-park-pa",
  "Verona, PA":                "verona-pa",
};

// Google Places primary_type buckets that count as "social life" for the
// Aliveness axis. Matches the mockup's cafés / bars / restaurants split,
// broadened to include the _restaurant suffix variants Places returns.
const SOCIAL_TYPES = new Set([
  "cafe", "coffee_shop", "bakery",
  "bar", "pub", "wine_bar", "cocktail_bar", "brewery", "bar_and_grill",
  "restaurant",
  "american_restaurant", "italian_restaurant", "mexican_restaurant",
  "chinese_restaurant", "thai_restaurant", "japanese_restaurant",
  "indian_restaurant", "seafood_restaurant", "pizza_restaurant",
  "breakfast_restaurant", "fast_food_restaurant",
  "sandwich_shop", "meal_takeaway", "ice_cream_shop",
]);

const SWEEP_PLATEAU = [300, 400, 500, 600, 700];
const SWEEP_DHALF   = [200, 300, 400, 500, 600];
const OUTER_CUTOFF  = 1500;
const HARD_BASELINE = 700; // the model we're trying to beat

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function weightFn(plateau, dHalf, d) {
  if (d > OUTER_CUTOFF) return 0;
  if (d <= plateau) return 1;
  return Math.exp(-(d - plateau) / dHalf);
}

// Leave-one-out linear regression — predict y from x, return LOO R².
// With N points we fit on N-1 each fold and accumulate squared residual.
function looR2(xs, ys) {
  const n = xs.length;
  if (n < 3) return NaN;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const totalSS = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  let residSS = 0;
  for (let h = 0; h < n; h++) {
    const xT = xs.filter((_, i) => i !== h);
    const yT = ys.filter((_, i) => i !== h);
    const m = xT.length;
    const xMean = xT.reduce((a, b) => a + b, 0) / m;
    const yMeanT = yT.reduce((a, b) => a + b, 0) / m;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < m; i++) {
      sxy += (xT[i] - xMean) * (yT[i] - yMeanT);
      sxx += (xT[i] - xMean) ** 2;
    }
    const slope = sxx === 0 ? 0 : sxy / sxx;
    const intercept = yMeanT - slope * xMean;
    const pred = intercept + slope * xs[h];
    residSS += (ys[h] - pred) ** 2;
  }
  return totalSS === 0 ? NaN : 1 - residSS / totalSS;
}

// Pearson correlation as a quick robustness check alongside R².
function pearson(xs, ys) {
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - xMean) * (ys[i] - yMean);
    sxx += (xs[i] - xMean) ** 2;
    syy += (ys[i] - yMean) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

await client.connect();

// 1. Find the owner — whichever user has the most baseline ratings.
const ownerQ = await client.query(`
  SELECT user_id, COUNT(*)::int n
  FROM baseline_ratings
  GROUP BY user_id
  ORDER BY n DESC
  LIMIT 1
`);
if (ownerQ.rowCount === 0) {
  console.error("No baseline_ratings rows. Has the owner filled in baselines yet?");
  process.exit(1);
}
const ownerId = ownerQ.rows[0].user_id;
console.log(`Owner: ${ownerId} (${ownerQ.rows[0].n} baselines)\n`);

// 2. Pull (place_name, aliveness) for the owner.
const baselinesQ = await client.query(
  `SELECT place_name, aliveness FROM baseline_ratings
   WHERE user_id = $1 AND aliveness IS NOT NULL
   ORDER BY aliveness DESC, place_name`,
  [ownerId],
);
const baselines = baselinesQ.rows;
console.log("Baselines:");
console.table(baselines);

// 3. Map place_name → city row (lat/lon). Fail loud on misses.
const slugs = baselines.map((b) => {
  const slug = PLACE_TO_SLUG[b.place_name];
  if (!slug) {
    console.error(`No slug mapping for baseline "${b.place_name}". Update PLACE_TO_SLUG.`);
    process.exit(1);
  }
  return slug;
});
const citiesQ = await client.query(
  `SELECT slug, name, lat, lon FROM cities WHERE slug = ANY($1)`,
  [slugs],
);
const citiesBySlug = Object.fromEntries(citiesQ.rows.map((r) => [r.slug, r]));
for (const slug of slugs) {
  if (!citiesBySlug[slug]) {
    console.error(`City row missing for slug "${slug}". Add it to cities table.`);
    process.exit(1);
  }
}

// 4. For each baseline city, pull every social POI within 1600 m of the pin
// (a hair past the outer cutoff so dropped POIs are obvious in inspection).
const pointsBySlug = {};
for (let i = 0; i < baselines.length; i++) {
  const slug = slugs[i];
  const city = citiesBySlug[slug];
  // Pre-filter by bounding box to leverage the (lat, lon) index, then
  // refine with haversine in JS.
  const dLat = 1700 / 111320; // ~1700 m N/S
  const mPerLon = 111320 * Math.cos((city.lat * Math.PI) / 180);
  const dLon = 1700 / mPerLon;
  const poiQ = await client.query(
    `SELECT lat, lon, primary_type FROM pois
      WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4`,
    [city.lat - dLat, city.lat + dLat, city.lon - dLon, city.lon + dLon],
  );
  const pts = poiQ.rows
    .filter((p) => SOCIAL_TYPES.has(p.primary_type))
    .map((p) => ({ d: haversineM(city.lat, city.lon, p.lat, p.lon), type: p.primary_type }))
    .filter((p) => p.d <= OUTER_CUTOFF + 100);
  pointsBySlug[slug] = pts;
  console.log(
    `  ${city.name.padEnd(34)} aliveness=${baselines[i].aliveness}  ` +
      `social POIs ≤1500 m: ${pts.filter((p) => p.d <= OUTER_CUTOFF).length}  ` +
      `(in 700 m hard ring: ${pts.filter((p) => p.d <= HARD_BASELINE).length})`,
  );
}

const ys = baselines.map((b) => b.aliveness);

// 5. Baseline: current 700 m hard count.
const xsHard = slugs.map((slug) =>
  pointsBySlug[slug].filter((p) => p.d <= HARD_BASELINE).length,
);
const r2Hard = looR2(xsHard, ys);
const corrHard = pearson(xsHard, ys);
console.log(`\nBaseline model — 700 m hard count`);
console.log(`  LOO R²: ${r2Hard.toFixed(3)}    Pearson r: ${corrHard.toFixed(3)}`);

// 6. Sweep (plateau, d_half) and tabulate LOO R².
console.log("\nLOO R² by (plateau × d_half):\n");
const header = ["plateau↓  d_half→", ...SWEEP_DHALF.map((d) => String(d).padStart(7))];
console.log(header.join(""));
let bestCell = { r2: -Infinity, plateau: null, dHalf: null };
for (const plateau of SWEEP_PLATEAU) {
  const row = [String(plateau).padStart(8) + "       "];
  for (const dHalf of SWEEP_DHALF) {
    const xs = slugs.map((slug) =>
      pointsBySlug[slug].reduce((s, p) => s + weightFn(plateau, dHalf, p.d), 0),
    );
    const r2 = looR2(xs, ys);
    row.push((isNaN(r2) ? " n/a" : r2.toFixed(3)).padStart(7));
    if (r2 > bestCell.r2) bestCell = { r2, plateau, dHalf };
  }
  console.log(row.join(""));
}

console.log(
  `\nBest: plateau=${bestCell.plateau} m, d_half=${bestCell.dHalf} m  →  LOO R² ${bestCell.r2.toFixed(3)}`,
);
console.log(`Beats baseline by: ΔR² = ${(bestCell.r2 - r2Hard).toFixed(3)}`);

// 7. Print the predicted vs actual table for the proposed cell (500/400) and
// the winning cell, so the result is inspectable, not just a number.
function predTable(plateau, dHalf) {
  const xs = slugs.map((slug) =>
    pointsBySlug[slug].reduce((s, p) => s + weightFn(plateau, dHalf, p.d), 0),
  );
  // Single OLS fit on all points (LOO is internal; this is just for inspection).
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - xMean) * (ys[i] - yMean);
    sxx += (xs[i] - xMean) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = yMean - slope * xMean;
  return baselines.map((b, i) => ({
    place: b.place_name,
    actual: b.aliveness,
    weighted_sum: xs[i].toFixed(1),
    predicted: (intercept + slope * xs[i]).toFixed(2),
  }));
}

console.log(`\nDetails — proposed cell (plateau=500, d_half=400):`);
console.table(predTable(500, 400));

if (bestCell.plateau !== 500 || bestCell.dHalf !== 400) {
  console.log(`\nDetails — winning cell (plateau=${bestCell.plateau}, d_half=${bestCell.dHalf}):`);
  console.table(predTable(bestCell.plateau, bestCell.dHalf));
}

await client.end();
