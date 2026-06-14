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
// POI source: the unified local `pois` table — see migration 0008. This
// measurer is source-agnostic: it reads {location, category} per row and never
// hits a network API. Rows come from either populator — scripts/.fetch-pois-osm.mjs
// (free, OSM, source='osm') for US cities, or scripts/.fetch-pois.mjs (paid,
// Google) — and a city is filled from exactly one source. We label each
// metric's `source` from the rows actually counted, so an OSM-scored city is
// never mis-cited as Google. Do NOT "refresh" a cache that already has the
// city: it's durable, we already paid for the Google rows, and a radius/decay
// change just re-reads the same cache (the 2026-06-14 ~$300 incident was a
// needless --all re-fetch).
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

import { haversine, pointInGeoJSON } from "../measure.js";

export const PLATEAU    = 500;   // meters — full credit inside this radius
export const D_HALF     = 400;   // meters — exponential decay constant past the plateau
export const MAX_RADIUS = 1500;  // meters — outer cutoff (zero credit beyond)

// Adaptive measurement-center search (#1). The PIN never moves; we score at the
// densest point within RECENTER_MAX of it. The cap is small on purpose: the
// pin-keyed Google cache only reaches ~MAX_RADIUS from the pin, so a larger move
// would undercount the new center's far side — that case is the pin-recenter
// pass's job (it refetches). MIN_GAIN stops us chasing grid noise.
const RECENTER_MAX = 250;        // meters — max drift from the pin (cache-safe)
const RECENTER_STEP = 50;        // meters — grid resolution
const RECENTER_MIN_GAIN = 0.05;  // only move for ≥5% more weighted density …
const RECENTER_MIN_ABS = 1.5;    // … AND ≥1.5 absolute, so a near-zero residential
                                 // pin (Allison Park) isn't relocated to double a
                                 // trivial score — its honest reading is the pin.

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

// Cite the metric's real provenance from the `pois.source` of the rows we
// actually counted — never a hardcoded provider (#1 rule: cite the real source).
const SOURCE_BY_ROW = {
  osm:           { source: "OpenStreetMap (Overpass) via local cache", url: "https://www.openstreetmap.org/copyright" },
  google_places: { source: "Google Places (New) via local cache",     url: "https://developers.google.com/maps/documentation/places/web-service" },
};

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
    columns: ["poi_positions", "walking_core_center"],
  },
  throttleMs: 0, // local DB, no throttle needed
  async run({ lat, lon, asOf, db }, city) {
    if (!db) {
      // Defensive — every measurer in the registry runs through _runner.js,
      // which now passes `db`. If this ever fires it means somebody invoked
      // the measurer directly without setting up the context.
      throw new Error("walking-core measurer requires ctx.db (Postgres client)");
    }

    // Bbox prefilter around the PIN, padded by the recenter cap so any candidate
    // center still has its full MAX_RADIUS neighbourhood inside what we fetched.
    const padM = 200;
    const reach = MAX_RADIUS + padM + RECENTER_MAX;
    const dLat = reach / 111320;
    const mPerLonPin = 111320 * Math.cos((lat * Math.PI) / 180);
    const dLon = reach / mPerLonPin;

    const { rows } = await db.query(
      `SELECT lat, lon, primary_type, source
         FROM pois
        WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4
          AND business_status IS DISTINCT FROM 'CLOSED_PERMANENTLY'`,
      [lat - dLat, lat + dLat, lon - dLon, lon + dLon],
    );

    // Adaptive measurement center (#1): the PIN stays put; we score at the point
    // (within RECENTER_MAX of the pin, inside the stay zone) that maximises the
    // weighted POI density — so a pin that geocoded just off the commercial
    // spine no longer undercounts. We optimise the SAME Google-cache quantity we
    // score (not OSM density), and only move when it's a real gain, so the score
    // can only rise or hold — never regress. The cap is deliberate: bigger
    // off-centeredness needs a pois REFETCH at the new point (the pin-keyed cache
    // can't reach), which is the pin-recenter pass's job, not a measure-time move.
    const boundary = city?.stay_zone_boundary || null;
    const totalDensityAt = (clat, clon) => {
      let s = 0;
      for (const r of rows) {
        if (!CATEGORY_BY_TYPE[r.primary_type]) continue;
        const d = haversine(clat, clon, r.lat, r.lon);
        if (d <= MAX_RADIUS) s += decayWeight(d);
      }
      return s;
    };
    const pinDensity = totalDensityAt(lat, lon);
    let mlat = lat, mlon = lon, bestDensity = pinDensity;
    const lonM = 111320 * Math.cos((lat * Math.PI) / 180);
    for (let di = -RECENTER_MAX; di <= RECENTER_MAX; di += RECENTER_STEP) {
      for (let dj = -RECENTER_MAX; dj <= RECENTER_MAX; dj += RECENTER_STEP) {
        if (Math.hypot(di, dj) > RECENTER_MAX) continue;
        const clat = lat + di / 111320, clon = lon + dj / lonM;
        if (boundary && !pointInGeoJSON(clat, clon, boundary)) continue;
        const s = totalDensityAt(clat, clon);
        if (s > bestDensity) { bestDensity = s; mlat = clat; mlon = clon; }
      }
    }
    // Only relocate for a gain that's meaningful both relatively AND absolutely
    // — never chase grid noise, never inflate a near-zero baseline.
    if (bestDensity < pinDensity * (1 + RECENTER_MIN_GAIN) || bestDensity - pinDensity < RECENTER_MIN_ABS) {
      mlat = lat; mlon = lon;
    }
    const moved = haversine(lat, lon, mlat, mlon);

    // Compute distance + category + weight per POI. Drop everything past the
    // cutoff and anything whose primary_type doesn't bucket.
    const positions = [];
    const buckets = {
      cafe:  { score: 0, in_plateau: 0, beyond: 0 },
      bar:   { score: 0, in_plateau: 0, beyond: 0 },
      rest:  { score: 0, in_plateau: 0, beyond: 0 },
      daily: { score: 0, in_plateau: 0, beyond: 0 },
    };
    const srcSeen = new Set();
    for (const r of rows) {
      const category = CATEGORY_BY_TYPE[r.primary_type];
      if (!category) continue;
      const d = haversine(mlat, mlon, r.lat, r.lon);
      if (d > MAX_RADIUS) continue;
      const weight = decayWeight(d);
      const b = buckets[category];
      b.score += weight;
      if (d <= PLATEAU) b.in_plateau += 1;
      else b.beyond += 1;
      if (r.source) srcSeen.add(r.source);
      positions.push({ lat: r.lat, lon: r.lon, category, weight: round3(weight) });
    }

    // Provenance from the rows actually counted. A city is single-source by the
    // populators' double-count guard; "mixed" can only appear if that's violated
    // — surface it honestly rather than silently picking one provider.
    const srcKey = srcSeen.size === 1 ? [...srcSeen][0] : null;
    const src = SOURCE_BY_ROW[srcKey] || {
      source: srcSeen.size > 1 ? `mixed (${[...srcSeen].join(" + ")}) via local cache` : "local pois cache",
      url: SOURCE_BY_ROW.osm.url,
    };

    // Round scores to one decimal — enough resolution for the breakdown UI,
    // doesn't pretend more precision than the noisy POI set has.
    const round1 = (x) => Math.round(x * 10) / 10;
    const envelope = (category) => ({
      value: round1(buckets[category].score),
      asOf,
      source: src.source,
      sourceUrl: src.url,
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
    // Persist the adaptive center so the chapter map draws the core circle +
    // plateau where we actually measured (pin marker stays at lat/lon). When the
    // center didn't move (pin already on the cluster), this equals the pin.
    const columns = {
      poi_positions: positions,
      walking_core_center: { lat: round6(mlat), lon: round6(mlon), moved: Math.round(moved) },
    };

    const note =
      `cafe ${round1(buckets.cafe.score)} (${buckets.cafe.in_plateau}+${buckets.cafe.beyond}) | ` +
      `bar ${round1(buckets.bar.score)} (${buckets.bar.in_plateau}+${buckets.bar.beyond}) | ` +
      `rest ${round1(buckets.rest.score)} (${buckets.rest.in_plateau}+${buckets.rest.beyond}) | ` +
      `daily ${round1(buckets.daily.score)} (${buckets.daily.in_plateau}+${buckets.daily.beyond}) | ` +
      `${positions.length} dots${moved >= 1 ? ` | center +${Math.round(moved)}m` : ""}`;

    return { measuredMetrics, columns, notes: note };
  },
};

function round3(x) { return Math.round(x * 1000) / 1000; }
function round6(x) { return Math.round(x * 1e6) / 1e6; }
