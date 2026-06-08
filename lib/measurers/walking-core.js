// lib/measurers/walking-core.js — the plateau-decay walking-core measurer.
//
// Replaces the 700 m hard ring (osm-core's cafe_n / bar_n / rest_n /
// daily_needs_n) with a soft-edged catchment whose weight as a function of
// distance from the anchor is:
//
//   w(d) = 1                              for d ≤ PLATEAU
//   w(d) = exp(−(d − PLATEAU) / D_HALF)   for PLATEAU < d ≤ MAX_RADIUS
//   w(d) = 0                              for d > MAX_RADIUS
//
// The three architectural reasons we made this change:
//   1. No cliff. The 700 m disk amputated POIs at exactly 700 m. Now the
//      transition is smooth.
//   2. Peninsulas and coastal towns don't pay a tax. The 700 m disk dropped
//      half its area into the sea for Piran / Bainbridge / etc., so they
//      undercounted; here the field tracks the POIs themselves.
//   3. Defensible in the literature. Plateau 500 m sits between the canonical
//      ¼-mile (~400 m) 5-min walk shed and the ½-mile (~800 m) 10-min walk
//      shed used in TOD planning. d_half 400 m gives ~37% weight at 800 m
//      and ~8% at 1500 m — long enough to capture nearby spines (Shadyside's
//      Walnut St) without rewarding things you'd never walk to.
//
// Parameters live as exported constants so the client viz and the measurer
// share one source of truth. Both render and measure should change together
// if these numbers ever change.
//
// POI source: the local `pois` table, populated by scripts/.fetch-pois.mjs
// from Google Places (New) — see migration 0008. We never hit Google from
// this measurer; the cache is already there. We DO need the cache to extend
// to at least MAX_RADIUS (1500 m); .fetch-pois.mjs was at 1000 m, bump it
// before running this measurer over a city whose cache is older than that.
//
// Writes:
//   measured_metrics.cafe_score          (float, weighted sum)
//   measured_metrics.bar_score           (float)
//   measured_metrics.rest_score          (float)
//   measured_metrics.daily_needs_score   (float)
//   columns.poi_positions                (array of {lat, lon, category, weight})
//
// The four `_score` envelopes also carry a meta breakdown of "in plateau /
// beyond plateau" counts per category, so the chapter panel can render
// "N in plateau · M beyond" without a second pass.
//
// We deliberately KEEP the legacy `_n` counts that osm-core writes — for one
// measurement cycle they double up as a sanity check, and dropping them is a
// separate follow-up commit. See features/walking-core.md.

import { haversine } from "../measure.js";

export const PLATEAU    = 500;   // meters — full credit inside this radius
export const D_HALF     = 400;   // meters — exponential decay constant past the plateau
export const MAX_RADIUS = 1500;  // meters — outer cutoff (zero credit beyond)

// Google Places primary_type → our 4 social categories. A POI not in any
// of these sets is dropped (Aliveness / Realness aren't about hotels, hair
// salons, etc.). Buckets match the chapter breakdown UI:
//
//   cafe      → café / coffee shop / bakery (drink + light morning)
//   bar       → bar / pub / wine bar / cocktail bar / brewery (evening)
//   rest      → restaurant + all cuisine variants + fast-food / takeaway
//   daily     → grocery / pharmacy / market / butcher (Realness axis input)
const CATEGORY_BY_TYPE = {
  // cafés (with bakery — the morning-pastry-and-coffee adjacency)
  cafe:               "cafe",
  coffee_shop:        "cafe",
  bakery:             "cafe",
  tea_house:          "cafe",

  // bars
  bar:                "bar",
  pub:                "bar",
  wine_bar:           "bar",
  cocktail_bar:       "bar",
  brewery:            "bar",
  bar_and_grill:      "bar",
  irish_pub:          "bar",

  // restaurants — generic + every *_restaurant the cache produces
  restaurant:                  "rest",
  american_restaurant:         "rest",
  italian_restaurant:          "rest",
  mexican_restaurant:          "rest",
  chinese_restaurant:          "rest",
  thai_restaurant:             "rest",
  japanese_restaurant:         "rest",
  indian_restaurant:           "rest",
  seafood_restaurant:          "rest",
  pizza_restaurant:            "rest",
  breakfast_restaurant:        "rest",
  brunch_restaurant:           "rest",
  steak_house:                 "rest",
  vegetarian_restaurant:       "rest",
  vegan_restaurant:            "rest",
  mediterranean_restaurant:    "rest",
  french_restaurant:           "rest",
  greek_restaurant:            "rest",
  korean_restaurant:           "rest",
  vietnamese_restaurant:       "rest",
  middle_eastern_restaurant:   "rest",
  spanish_restaurant:          "rest",
  ramen_restaurant:            "rest",
  sushi_restaurant:            "rest",
  fast_food_restaurant:        "rest",
  sandwich_shop:               "rest",
  meal_takeaway:               "rest",
  ice_cream_shop:              "rest",

  // daily-needs — groceries, pharmacy, market
  grocery_store:      "daily",
  supermarket:        "daily",
  convenience_store:  "daily",
  market:             "daily",
  drugstore:          "daily",
  pharmacy:           "daily",
  butcher_shop:       "daily",
  fish_market:        "daily",
  liquor_store:       "daily",
  greengrocer:        "daily",
};

const SOURCE = "Google Places (New) via local cache";
const SOURCE_URL = "https://developers.google.com/maps/documentation/places/web-service";

/**
 * Pure weight function — exported for tests and the client-side renderer so
 * both sides of the wire compute the same number.
 */
export function decayWeight(d) {
  if (d > MAX_RADIUS) return 0;
  if (d <= PLATEAU) return 1;
  return Math.exp(-(d - PLATEAU) / D_HALF);
}

export default {
  id: "walking_core",
  describe: "Plateau-decay weighted POI sums (Google Places cache)",
  needs: ["lat", "lon"],
  writes: {
    measuredMetrics: ["cafe_score", "bar_score", "rest_score", "daily_needs_score"],
    columns: ["poi_positions"],
  },
  throttleMs: 0, // local DB, no throttle needed
  async run({ lat, lon, asOf, db }) {
    if (!db) {
      // Defensive — every measurer in the registry runs through _runner.js,
      // which now passes `db`. If this ever fires it means somebody invoked
      // the measurer directly without setting up the context.
      throw new Error("walking-core measurer requires ctx.db (Postgres client)");
    }

    // Bbox prefilter: shrink the candidate set with the (lat, lon) index, then
    // refine with haversine. ~1700 m past the cutoff so dropped POIs stay in
    // the bbox; cleaner debugging than borderline misses.
    const padM = 200;
    const dLat = (MAX_RADIUS + padM) / 111320;
    const mPerLon = 111320 * Math.cos((lat * Math.PI) / 180);
    const dLon = (MAX_RADIUS + padM) / mPerLon;

    const { rows } = await db.query(
      `SELECT lat, lon, primary_type
         FROM pois
        WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4
          AND business_status IS DISTINCT FROM 'CLOSED_PERMANENTLY'`,
      [lat - dLat, lat + dLat, lon - dLon, lon + dLon],
    );

    // Compute distance + category + weight per POI. Drop everything past the
    // cutoff and anything whose primary_type doesn't bucket.
    const positions = [];
    const buckets = {
      cafe:  { score: 0, in_plateau: 0, beyond: 0 },
      bar:   { score: 0, in_plateau: 0, beyond: 0 },
      rest:  { score: 0, in_plateau: 0, beyond: 0 },
      daily: { score: 0, in_plateau: 0, beyond: 0 },
    };
    for (const r of rows) {
      const category = CATEGORY_BY_TYPE[r.primary_type];
      if (!category) continue;
      const d = haversine(lat, lon, r.lat, r.lon);
      if (d > MAX_RADIUS) continue;
      const weight = decayWeight(d);
      const b = buckets[category];
      b.score += weight;
      if (d <= PLATEAU) b.in_plateau += 1;
      else b.beyond += 1;
      positions.push({ lat: r.lat, lon: r.lon, category, weight: round3(weight) });
    }

    // Round scores to one decimal — enough resolution for the breakdown UI,
    // doesn't pretend more precision than the noisy POI set has.
    const round1 = (x) => Math.round(x * 10) / 10;
    const envelope = (category) => ({
      value: round1(buckets[category].score),
      asOf,
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      meta: {
        plateau_m: PLATEAU,
        d_half_m: D_HALF,
        max_radius_m: MAX_RADIUS,
        in_plateau: buckets[category].in_plateau,
        beyond:     buckets[category].beyond,
      },
    });

    const measuredMetrics = {
      cafe_score:        envelope("cafe"),
      bar_score:         envelope("bar"),
      rest_score:        envelope("rest"),
      daily_needs_score: envelope("daily"),
    };
    const columns = { poi_positions: positions };

    const note =
      `cafe ${round1(buckets.cafe.score)} (${buckets.cafe.in_plateau}+${buckets.cafe.beyond}) | ` +
      `bar ${round1(buckets.bar.score)} (${buckets.bar.in_plateau}+${buckets.bar.beyond}) | ` +
      `rest ${round1(buckets.rest.score)} (${buckets.rest.in_plateau}+${buckets.rest.beyond}) | ` +
      `daily ${round1(buckets.daily.score)} (${buckets.daily.in_plateau}+${buckets.daily.beyond}) | ` +
      `${positions.length} dots`;

    return { measuredMetrics, columns, notes: note };
  },
};

function round3(x) { return Math.round(x * 1000) / 1000; }
