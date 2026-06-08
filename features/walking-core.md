# Walking core — the plateau-decay measurement field

The "Where you'd live" chapter on the city detail page used to draw a single
700 m circle around the visit pin and count the cafés, bars, restaurants, and
daily-needs shops inside it. That model had three problems:

1. **A cliff at exactly 700 m.** A café at 699 m counted fully; one at 701 m
   didn't count at all. Real walking experience doesn't snap like that.
2. **Peninsulas paid a tax.** For Piran, Bainbridge, Newport, Cape May —
   anywhere the pin sits near the water — half the disk fell into the sea,
   silently undercounting the social density that actually existed.
3. **No source for "why 700?"** The 700 m number was a midpoint between the
   canonical ¼-mile (~400 m, "5-min walk") and ½-mile (~800 m, "10-min walk")
   walking sheds used in transit-oriented design, but it wasn't anchored to
   anything specific.

The fix is a **plateau-decay weighting** applied to a richer POI signal
(Google Places, not OSM). Documented end-to-end here.

## The function

```
w(d) = 1                                  for d ≤ 500 m   (the plateau)
w(d) = exp(−(d − 500) / 400)              for 500 < d ≤ 1500 m
w(d) = 0                                  for d > 1500 m  (outer cutoff)
```

Three constants, exported from
[lib/measurers/walking-core.js](../lib/measurers/walking-core.js) as `PLATEAU`,
`D_HALF`, `MAX_RADIUS`, **one source of truth** shared by the server-side
measurer and every UI renderer. Change them in one place, both sides update.

- **`PLATEAU` (500 m).** Everything inside gets full credit. Sits between the
  literature's 5-min shed (400 m) and 10-min shed (800 m). The owner's gut
  was that "within walking distance is within walking distance — 2 min or
  5 min shouldn't matter," and the plateau encodes that.
- **`D_HALF` (400 m).** Exponential decay constant past the plateau. At 800 m
  the weight is `exp(-300/400) ≈ 0.47`; at 1200 m, `exp(-700/400) ≈ 0.17`;
  at 1500 m, `exp(-1000/400) ≈ 0.08`. The 10-min reference shed at 800 m
  retains real weight; the outer ring contributes a trickle.
- **`MAX_RADIUS` (1500 m).** Past this, zero. A 20-minute walk to a café
  doesn't read as "social density"; it reads as "a different neighborhood."

Calibration details in the [next section](#calibration).

## Calibration

The parameters were picked by sweeping `(plateau × d_half)` against the
owner's felt-Aliveness baselines using
[scripts/calibrate-decay.mjs](../scripts/calibrate-decay.mjs). On 7 rated
places (Piran, Bled, Lawrenceville, Shadyside, Oakmont, Allison Park,
Verona), 500/400 produces LOO R² ≈ 0.73 against felt Aliveness — slightly
worse than the empirical winner at 300/200 (R² ≈ 0.94), but with two
practical advantages:

1. **It's a sub-metric, not a felt-Aliveness predictor.** The walking-core
   score is one input to the Aliveness axis, which combines with
   `pedestrian_street_m`, `carfree_frac`, `intersection_den`,
   `mean_block_m` etc. before composing the felt score. The tight 300/200
   fits the OBSERVED felt scores because it captures only one component
   well; 500/400 captures the same component *honestly* without overfitting.
2. **It's literature-defensible.** 500 m sits in the canonical walking-shed
   range. 300 m would not (it's smaller than the "5-min shed" floor and
   would be hard to defend as "walkable" by any standard).

To re-run the calibration on a different baseline set, edit `PLACE_TO_SLUG`
in the script and run `node scripts/calibrate-decay.mjs`.

## POI source

The signal comes from **Google Places (New) Nearby Search**, cached locally
in the [`pois`](../supabase/migrations/0008_pois.sql) table. Fetch script:
[`scripts/.fetch-pois.mjs`](../scripts/.fetch-pois.mjs). Tile gather radius
is 1500 m (bumped from 1000 m alongside the walking-core rollout so the
cache extends to the outer cutoff).

OSM POI coverage was systematically too thin — see the project-memory note
on Google Places. We don't import Places data into OSM (license + ToS), and
we don't query Places at page-load time (cost + latency); the cache is the
durable bridge.

Categories used (from Google's `primary_type` field):

| Bucket | Counts toward | Includes |
|---|---|---|
| `cafe`  | `cafe_score`        | cafe, coffee_shop, bakery, tea_house |
| `bar`   | `bar_score`         | bar, pub, wine_bar, cocktail_bar, brewery, bar_and_grill, irish_pub |
| `rest`  | `rest_score`        | restaurant + every `*_restaurant` variant, fast_food_restaurant, sandwich_shop, meal_takeaway, ice_cream_shop |
| `daily` | `daily_needs_score` | grocery_store, supermarket, convenience_store, market, drugstore, pharmacy, butcher_shop, fish_market, liquor_store, greengrocer |

Full bucket table in
[lib/measurers/walking-core.js](../lib/measurers/walking-core.js)
(`CATEGORY_BY_TYPE`). POIs whose `primary_type` doesn't match any bucket
(hair salons, hotels, etc.) are dropped — they aren't Aliveness or Realness
inputs.

## What gets written

The measurer writes four envelope metrics and one top-level column:

```js
measured_metrics.cafe_score        // float, weighted sum
measured_metrics.bar_score         // float
measured_metrics.rest_score        // float
measured_metrics.daily_needs_score // float
columns.poi_positions              // array of {lat, lon, category, weight}
```

Each envelope's `meta` carries the breakdown the chapter panel needs:

```js
{
  value: 16.3,
  asOf: "2026-06-08",
  source: "Google Places (New) via local cache",
  meta: {
    plateau_m: 500,
    d_half_m: 400,
    max_radius_m: 1500,
    in_plateau: 14,    // # POIs at d ≤ 500 m
    beyond: 9,         // # POIs at 500 < d ≤ 1500 m
  },
}
```

The `poi_positions` column ([migration 0010](../supabase/migrations/0010_poi_positions.sql))
is what makes the map dots possible without a page-load Places call. Format:
`[{ lat, lon, category, weight }, …]`, written by the measurer alongside the
score sums.

## Where it shows up

- **Chapter III, "Where you'd live"** ([components/city-detail/MagazineDetail.jsx](../components/city-detail/MagazineDetail.jsx)
  → `WalkabilityBreakdown`). Inside the stay-zone overlay panel: three rows
  (Cafés / Bars & pubs / Restaurants) with `N in plateau · M beyond` and the
  weighted score. Daily-needs is intentionally NOT shown here; it belongs on
  the Realness axis and renders in Chapter IV.
- **Chapter III map** ([components/city-detail/WhereMap.jsx](../components/city-detail/WhereMap.jsx)).
  Plateau disk, 800 m reference ring, 1500 m outer ring, POI dots with
  opacity = weight. Reads `poiPositions` from `cityItem` (which round-trips
  through [lib/city-row.js](../lib/city-row.js) ↔
  [lib/db.js](../lib/db.js)).
- **Full-screen view** at `/cities/[slug]/walking-core`
  ([components/walking-core/WalkingCoreView.jsx](../components/walking-core/WalkingCoreView.jsx)).
  Atlas spread with floating city headline, parameter spec, formula, the
  full four-row breakdown including daily_needs, a back pill to the
  referring page.

## Legacy `_n` counts

The OSM 700 m hard-ring counts (`cafe_n` / `bar_n` / `rest_n` /
`daily_needs_n`) are still measured by
[lib/measurers/osm-core.js](../lib/measurers/osm-core.js) for one
measurement cycle as a sanity check. In
[lib/planner-data.js](../lib/planner-data.js) the taxonomy entries carry
`supersededBy: "<key>_score"` and `axisRollup` skips them when the
superseding metric has a value. Migration plan:

1. **One full cycle** (current state): both `_n` and `_score` are measured;
   `_score` drives the rollup whenever it's present.
2. **Spot-check** the first 20 cities by comparing `_n` to `_score` in
   [METRICS_COMPLETION.md](../METRICS_COMPLETION.md). Outliers worth
   investigating (e.g., a city where `cafe_score > 2 × cafe_n` probably
   means the Places cache and OSM disagree about what's there — Places
   usually wins).
3. **Drop the `_n` measurers and taxonomy entries.** Separate follow-up
   commit. Until then both round-trip transparently.

## Re-running the measurement

After [bumping the POI cache to 1500 m](../scripts/.fetch-pois.mjs) (one-time):

```sh
node scripts/.fetch-pois.mjs --all              # refreshes Places cache
node scripts/measure-cities.mjs --measurer walking_core --all
```

Single city:

```sh
node scripts/measure-cities.mjs --measurer walking_core --slug piran-slovenia
```

Watch for "no anchor near pin" errors — those mean the city has 0 social
POIs within the bbox, almost always because its pin is in suburbia or off
the main grid. Allison Park sits in this state legitimately; for any other
city it usually means the pin is in the wrong place.

## TODOs

- [ ] Adaptive centering. The measurer currently uses the saved visit pin
  directly. The osm-core measurer uses `findVisitCenters` to slide to the
  densest 700 m cluster inside the stay-zone polygon — walking-core should
  do the same. ([lib/measure.js](../lib/measure.js#findVisitCenters))
- [ ] Drop the legacy `_n` measurers + taxonomy entries after one
  measurement cycle confirms the new scores look right (see above).
- [ ] Region label per city for the full-screen view. Currently the
  subtitle is synthesized from the city name (Slovenia / Pennsylvania); a
  curated `nearby_feature` column would let us render "Adriatic Sea" /
  "Lake Bled" / "Walnut Street" properly.
- [ ] Re-run [`fit_weights.py`](../scripts/fit_weights.py) once every city
  has `_score` values, to absorb the new metric scale into the calibrate
  weights.
