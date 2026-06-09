# Visit window (Prime + Off-season)

Two diagnostic trips computed per city from climate normals + crowd
season: **Prime** (the month that's comfortable *after* crowds thin) and
**Off-season** (the coldest month — the January test made literal). A
candidate should pass both before it advances.

## Crowd-season source cascade (current)

**Architecture — collectors vs. scorer.** The measurers
(`measure-crowd-{wiki,nps,season}.py`) are pure data collectors: each writes
its raw signals into `cities.crowd_raw.{wiki,trends,nps}` and **nothing else**.
A single master scorer, `scripts/score-crowd-season.py`, is the **only** thing
that writes `crowd_season` / `crowd_intensity` / `crowd_season_source` — it
reads `crowd_raw`, applies the cascade precedence below, and computes the
score. So the score is a deterministic function of `crowd_raw` (which lives in
Supabase), no collector can clobber a higher tier, and precedence lives in one
declarative place. Re-run the scorer (`--write`) any time raw changes.

`crowd_season` (the 12-month SHAPE) comes from the best available source
per city. Higher tiers win; `crowd_season_source` records which tier
produced each city's curve.

1. **NPS recreation-visits** (`nps_trv_v1:<UNIT>`, ground-truth *presence*) —
   6 towns where a National Park Service unit's visitors are the town's
   tourists on the same trip (St. Augustine/Castillo, Charleston/Fort Sumter,
   Savannah/Fort Pulaski, Salem/Salem Maritime, Manteo/Fort Raleigh,
   Astoria/Lewis & Clark). Monthly entrance counts → seasonality. The unit is
   stored in `cities.nps_unit_code`. Script: `scripts/measure-crowd-nps.py`.
   Data: `data/nps/` (see SOURCE.md). This is the most honest signal — actual
   bodies, not search interest — and notably beat Wikipedia where it matters
   (Salem's October Haunted-Happenings dominance; St. Augustine's
   Nights-of-Lights December surge).
2. **Google Trends** (`gtrends_pop_norm_v3_…`, tourism-coded *intent*) — the
   intended primary for the bulk of the corpus, but Google's compare-query
   quota rate-limits bulk runs. Engine is hardened + resumable
   (`scripts/measure-crowd-season.py`); run from fresh quota windows to
   upgrade cities. Not yet broadly applied.
3. **Wikipedia × Wikivoyage blend** (`wiki_blend_v1` / `wiki_wp_only_v1`,
   *interest* proxy) — the live fallback covering the remaining 115 cities.
   Traffic-gated geometric mean of within-city-normalized Wikipedia and
   Wikivoyage monthly pageviews: the two cancel each other's noise
   (Wikipedia's event/university contamination spikes vs Wikivoyage's
   low-traffic jitter). Script: `scripts/measure-crowd-wiki.py`.

`crowd_intensity` (cross-city MAGNITUDE, drives chart line-muting) is set by
whichever tier wrote the city; bases differ per tier (NPS leaves the Wiki
intensity in place; Wiki uses per-capita WP-peak log-scaled 50k/M–3M/M;
Trends uses hotel-search per-capita). Documented as tier-specific.

## How it works today

- **Data**:
  - `cities.visit_climate` — 12 monthly normals from NASA POWER.
  - `cities.crowd_season` — 12 ints 0–5 = within-city **SHAPE** of
    seasonality (when crowds peak). From Google Trends `<city> hotels`
    interest, per-capita-normalized.
  - `cities.crowd_intensity` — scalar 0–5 = cross-city **MAGNITUDE**
    (how dominated-by-tourists overall). Log-scaled per-capita peak.
    Pittsburgh ≈ 0; Bar Harbor ≈ 5; Mackinac Island clamps to 5.
  - `cities.crowd_season_source` — versioned method tag with anchors
    baked in (`gtrends_hotels_pop_norm_v2_…_floor=100_ceil=10000_anchor=mackinac_island`).
  - `cities.population_total` / `population_source` — city-wide
    population from Census ACS Place, the denominator for per-capita.
  - `cities.season_notes` — `{ prime, offSeason }` user-authored prose
    (legacy rows store `{ charm, truth }`, mapped on read in `lib/city-row.js`).

- **Logic**: `cityVisitWindow(cityItem)` in
  [lib/planner-data.js](../lib/planner-data.js) returns
  `{ prime: {idx, name}, offSeason: {idx, name}, notes, comfort[], crowd[] }`.

- **Render (live)**: `ChapterWhen` in
  [components/city-detail/ChapterWhen.jsx](../components/city-detail/ChapterWhen.jsx) — comfort + crowd ribbons,
  a visit-score line, prime + off-season annotations, climatology rows
  with home-base deltas, and extremes cards. The crowd line's prominence
  scales with `crowdIntensity`: low intensity (0–1) renders dashed and
  muted, high intensity (4–5) renders bolder. The legend names the
  saturation level.

## Methodology (crowd_season + crowd_intensity)

Captured in [scripts/measure-crowd-season.py](../scripts/measure-crowd-season.py),
versioned as `gtrends_pop_norm_v3_blend(hotels:lead=1m:w=0.4|things_to_do:lead=0:w=0.6)_anchor=myrtle_beach`.

1. **Population**: Census ACS 5-yr Place table B01003_001E → city-wide
   total population. NOT the tract-level pop (which is the wrong unit:
   Pittsburgh tract = ~5k people, Pittsburgh city = 302k).
2. **Two Google Trends passes per city** (this is the v3 change from v2's
   single-query approach — see "Why two queries" below):

   | Pass | Query                       | Captures             | Lead time | Weight |
   |------|-----------------------------|----------------------|-----------|--------|
   | A    | `<city> [state] hotels`     | Booking intent       | ~4 weeks  | 0.4    |
   | B    | `things to do in <city> [state]` | Presence (visitors only) | ~1 week | 0.6 |

   Each pass runs as 2-term compare queries (anchor + 1 city) — Google's
   compare-query quota for 3+ term batches is the bottleneck in practice
   (it returns persistent HTTP 500 once the daily 3+ term budget is spent;
   the 2-term budget is far more permissive).

   The anchor is **Myrtle Beach, SC** — chosen after two iterations:
   - *Mackinac Island* (pop 583): too little absolute search volume; its
     curve got crushed to low-resolution integers when paired with
     big-pop cities, hurting rescale precision.
   - *Newport, RI* (pop 25k): better resolution, but Newport RI + Newport
     VT are both in the corpus, so the anchor collided with measured rows.
   - *Myrtle Beach, SC* (pop 36k): mass-market beach destination whose
     pure-tourist "hotels" search volume actually *exceeds* even San
     Francisco's, so it stays pinned near 100 in every pairing (anchor
     never crushed, rescale drift ≈ 0). Not in the corpus (never a
     walkable candidate), so no collision. Stable seasonality, no viral
     spikes, no business-travel contamination.

   **Query phrasing**: cities use the bare natural query people actually
   type (`Asheville hotels`, `things to do in Asheville`). A state suffix
   is added *only* to bare names that collide across states in the corpus
   — currently just Newport (RI/VT) and Lewisburg (PA/WV). The collision
   set is computed live from the corpus, so it self-corrects as cities are
   added. Official names are also normalized to the colloquial search term
   algorithmically (`colloquial()`): `Carmel-by-the-Sea` → `Carmel`,
   twin-town slash names → first half (shared season), parentheticals
   stripped. No per-city alias map.
3. **Per-month median** over 5 years for each pass, suppresses one-off
   spikes (hurricanes, news events).
4. **Per-capita**: `per_million = monthly_median / population * 1e6` for
   each pass independently.
5. **Shift + blend**: each pass's curve gets shifted forward by its lead
   time (hotels: 1 month, things_to_do: 0) to align "search activity" with
   "estimated presence"; then weighted-average the two curves.
6. **SHAPE** (`crowd_season`): min-max scale within the city's blended
   per-capita curve to 0–5 ints. Anti-amplification floor on the absolute
   span prevents a Pittsburgh-tier flat city from being stretched into a
   fake mountain.
7. **MAGNITUDE** (`crowd_intensity`): log-scale peak per-capita to 0–5
   ints against fixed anchors: 100/M → 0 (no tourist signal),
   10,000/M → 5 (saturated). Above ceiling clamps to 5. Below floor → 0.

The floor (100), ceil (10,000), and per-pass anchors are all part of the
citation string and never shift as the corpus grows — that preserves the
project's "identical ruler across cities" rule.

### Calibration file — `lib/calibrations/crowd-season-v3.json`

The first full sweep dumps Mackinac's per-template anchor curves to this
file, alongside the method tag and an epoch date. Every subsequent run —
including per-city onboarding after the sweep — reads the file and
rescales using `stored_anchor_peak / current_anchor_peak`, so cities
measured years apart end up on the same ruler.

Without this file, every run would re-define the anchor from its own
batch-1 Mackinac fetch and the corpus would slowly drift. With it,
calibration is a one-time event tied to the epoch.

To force a fresh calibration (e.g., after a year or if Google's data
materially shifts):

```bash
python3 scripts/measure-crowd-season.py --recalibrate
```

The new file gets a new `epoch` date and the method tag gains a suffix
marking the new calibration generation.

### Why two queries

The v2 (hotels-only) methodology measured **booking intent**, not
**presence**. Vetting against known patterns revealed the bias:

- **Cape May, August** measured at 3/5 even though Cape May is at
  maximum crowd through Labor Day. Reason: by August nobody new is
  booking — peak August visitors booked their hotel in June or July.
  v2 only saw the booking signal.
- **Asheville, September vs October** measured as Sep=5, Oct=4, when
  reality is the opposite (October leaf season is bigger). Reason:
  October-trip searches happen *in* September.
- **Mackinac Island, February** had non-zero search interest in v2 even
  though the island is literally inaccessible from November–April. That
  was distant-future trip planning bleeding into off-season months.

The bias was asymmetric: pre-peak shoulder inflated, post-peak shoulder
deflated, sharp peaks blurred. Not fixable by a uniform calendar shift.

Adding `things to do in <city>` as a second signal addresses this because:

- The query is **tourist-coded** — locals don't search what to do in
  their own town, so the signal is overwhelmingly visitors.
- The lead time is much shorter — people search "things to do" days
  before the trip or while they're there deciding tomorrow's plan.
- Weighted at 0.6 (vs hotels at 0.4), it pulls post-peak months back up
  and trims the pre-peak overshoot.

Hotels still contributes because it covers the long-tail planners and
helps disambiguate intent-to-visit from same-city locals' tangential
searches.

### Why two outputs, not one

Earlier drafts conflated SHAPE and MAGNITUDE into a single 0–5 array. Two
failure modes emerged:

- **Within-city min-max only** (no per-capita): Pittsburgh's mild hotel
  seasonality (peak 139/M) looked indistinguishable from Bar Harbor's
  extreme one (4,200/M). The chart said "tourist town" everywhere.
- **Log-scaled per-capita only**: integer rounding crushed every
  mid-tier city to ~2 across all months, hiding the seasonality shape.

Split lets the chart show the time-of-year curve while honestly
communicating "this isn't really a tourist town" via line prominence
and a label.

## Status

- Prime + Off-season selection logic works against POWER-derived `visit_climate`.
- Notes: still qualitative; user-authored on the row.
- Crowd: measured for all 78 cities via the Google Trends pipeline.
- Chart honors `crowd_intensity` to render low-intensity lines muted.

## TODOs / future direction

- **Year-shape: worst-month-per-direction.** Mockup shows HIGH / LOW /
  PRECIP rows with the auto-pulled worst month in each direction vs
  Allison Park baseline. Methodology needs writing up — TODO #4 calls
  this out as "January-axis methodology proposal".
- **Query template robustness.** The current "<city> hotels" template
  may underweight Airbnb-driven beach towns and overweight business
  travel cities. Worth A/B-ing against "things to do in <city>" on the
  two cities we have human notes for (Santa Barbara, Savannah).
- **Population denominator: city vs metro.** ACS Place is fine for
  bounded small towns and incorporated cities, but for sprawled metros
  (Phoenix, Houston) "city proper" undercounts the real catchment.
  Consider switching to MSA or stay-zone-polygon-summed-tracts for
  cities flagged as "metro-scale."
- **Refresh cadence.** Google Trends data drifts (especially post-2020
  travel patterns). Quarterly or annual re-measure is probably right;
  the method is idempotent so the script can run cold.
- **Prime/Off-season annotations on the chart.** Now drawn; verify they
  still read correctly under the new intensity-muted rendering.
- **POWER-derived snowfall is null.** January chapter loses a signal until
  the NOAA NCEI snowfall measurer fills `snowfall_in_yr` for the rest of
  the corpus (in progress, 73/78).
