# Metrics Completion

The standing direction for this project: **every city should carry a complete,
cited measurement set**. This file is the running ledger of what's filled,
what's missing, and exactly which script fills each gap. Update it after every
backfill run.

**The rule that overrides everything still applies:** unmeasured stays `null`.
An honest blank beats a guess. Nothing in here is permission to fudge.

---

## Current coverage (103 cities)

Snapshot of `cities.measured_metrics` in Supabase as of 2026-06-04 (audit via
`scripts/.audit-metrics.mjs`). A metric counts as "filled" when its `value`
is non-null.

**79/103 cities are fully measured.** The 24-city gap is mostly the most
recently onboarded batch — running the standard onboarding fillers on them
should close most of it. See "Cities missing the OSM batch" below.

| Axis | Metric | Coverage | Source | Filler script |
|---|---|---|---|---|
| Setting | `skyline_deg` | 84/103 | Open-Meteo elevation (line-of-sight skyline) | `scripts/backfill-skyline-and-grandeur.mjs` |
| Setting | `mtn_horizon_pct` | 84/103 | Open-Meteo elevation + OSM peaks | `scripts/onboard.mjs --measurer horizon` |
| Setting | `water_dist_m` | 84/103 | OpenStreetMap (Overpass) | `scripts/measure-cities.mjs` (`measureAround`) |
| Setting | `water_extent_km2` | 84/103 | OpenStreetMap (Overpass) | `scripts/measure-cities.mjs` |
| Aliveness | `cafe_n` | 84/103 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Aliveness | `bar_n` | 84/103 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Aliveness | `rest_n` | 84/103 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Aliveness | `walk_score` | 84/103 | walkscore.com | `scripts/measure-walkscore.mjs` |
| Fabric | `intersection_den` | 84/103 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Fabric | `mean_block_m` | 84/103 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Fabric | `carfree_frac` | 84/103 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Fabric | `bldg_coverage` | 84/103 | OSM (osmnx) | `scripts/measure-climate-bldg.mjs` |
| _diagnostic_ | `street_km` | 84/103 | OSM (osmnx) | `scripts/measure-cities.mjs` — measured but not in the Fabric rollup (dropped 2026-06-04: penalized peninsula/lakeside/park-heavy cores by counting "missing streets on water" as a deficit). Kept as a stored diagnostic. |
| Realness | `daily_needs_n` | 84/103 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Realness | `core_density` | 84/103 | US Census ACS (tract) for US; Eurostat GISCO LAU 2021 for EU | `scripts/onboard.mjs --measurer census,eurostat_lau` |
| Realness | `owner_occ_pct` | 84/103 | US Census ACS (B25003) for US; SURS PxWeb table 0861102 (2021) for SI | `scripts/onboard.mjs --measurer census,surs_obcina` |
| Realness | `seasonal_vac_pct` | 84/103 | US Census ACS (B25004) for US; SURS PxWeb table 0861110 (2018 — most recent year with seasonal/secondary breakdown) for SI | `scripts/onboard.mjs --measurer census,surs_obcina`. Other EU countries still need per-NSO adapters |
| Realness | `median_price_usd` | 81/103 | US Census ACS (B25077) | `scripts/onboard.mjs --measurer census`. EU coverage: no pan-EU equivalent — needs per-country price registries (Slovenia: GURS ETN; France: DVF; UK: HMRC Price Paid) |
| Year-round | `pleasant_days` | 84/103 | Open-Meteo archive 2019–2023 | `scripts/measure-climate-bldg.mjs` |
| Year-round | `days_below_freeze` | 84/103 | Open-Meteo archive | `scripts/measure-climate-bldg.mjs` |
| Year-round | `hot_days` | 84/103 | Open-Meteo archive | `scripts/measure-climate-bldg.mjs` |
| Year-round | `clear_days` | 84/103 | Open-Meteo archive | `scripts/measure-climate-bldg.mjs` |
| Year-round | `snowfall_in_yr` | 82/103 | NOAA NCEI 1991-2020 Normals (US, when a station within 60 km carries `ANN-SNOW-NORMAL`); Open-Meteo archive ERA5 2019-2023 (global fallback) | `scripts/onboard.mjs --measurer snowfall,snowfall_open_meteo` |

Auxiliary fields (not in `measured_metrics`):

| Field | Coverage | Source |
|---|---|---|
| `lat` / `lon` (heart) | **103/103** ✅ | Geocoded once on insert |
| `visit_climate` (12-month normals) | 84/103 | `measure-climate-bldg.mjs` |
| `drive_hrs_from_pit` | 78/103 | OSRM public from PIT airport (40.4915, -80.2329). Anything outside CONUS bbox marked `'FLY'`. Script: `scripts/measure-drive-hrs.mjs` |
| `population_total` / `population_source` | 74/103 | Census ACS Place B01003_001E (city-wide, NOT tract). Script: `scripts/measure-crowd-season.py` pass 1 |
| `crowd_season` (12 ints 0–5, within-city shape) | 43/103 | Google Trends BLEND: `<city> hotels` (booking intent, shift +1mo, w=0.4) + `things to do in <city>` (presence, w=0.6), per-capita normalized. Script: `scripts/measure-crowd-season.py`. **Blocked by Google rate-limit** as of last check |
| `crowd_intensity` (0–5 scalar, cross-city magnitude) | 41/103 | log-scaled blended-peak per-capita, anchors floor=100/M ceil=10,000/M. Same script |

### Cities missing the OSM batch (19)

These cities have `cafe_n` (and the rest of the OSM-derived metrics) null —
they need `node scripts/measure-cities.mjs` against the local Overpass:

Carrboro / Chapel Hill NC · Cold Spring NY · Dunedin FL · Greenport NY ·
Honolulu (Kaimuki) HI · Honolulu (Manoa) HI · Kailua HI · La Jolla CA ·
Marblehead MA · Naples (5th Ave South) FL · Port Townsend WA · Princeton NJ ·
Rhinebeck NY · Salem MA · San Francisco (Noe Valley) CA ·
Sarasota (Burns Court) FL · Sausalito CA · Tucson (4th Avenue) AZ ·
Wilmington NC

The same 19 are also missing climate, walk score, census, and snowfall —
they were geocoded into the table but the post-onboard measurement passes
never ran on them.

### Other narrow gaps

- **`drive_hrs_from_pit` (25 missing)** = the 19 above + 6 of the recently
  onboarded West-Coast/Northeast cities (Anacortes, Astoria, Athens GA,
  Bainbridge Island, Boise North End, Camden ME). Run
  `node scripts/measure-drive-hrs.mjs`.
- **`population_total` (29 missing)** = the 25 above + Bristol RI +
  the 3 Slovenian cities (Bled, Ljubljana, Piran). Census ACS Place query
  doesn't cover EU; SI needs a SURS adapter.
- **`median_price_usd` (22 missing)** = the 19 above + 3 SI cities (no
  pan-EU price registry).
- **`snowfall_in_yr` (21 missing)** = the 19 above + Charleston SC +
  Eureka Springs AR. The Open-Meteo fallback should cover both; re-run
  `scripts/onboard.mjs --measurer snowfall_open_meteo`.

---

## What "complete" looks like

A city is complete when **every metric in `metricTaxonomy`** ([lib/planner-data.js:210](lib/planner-data.js)) has a non-null `value` AND its visit window is seeded. That gives:

- All 5 axis rollups score (`weightedAxisScore`)
- All chips in [lib/chips.js](lib/chips.js) can fire on real data
- Calibrate can learn weights from a regression that isn't crippled by NaNs

**79/103 cities are fully complete.** The remaining 24 are the recently
onboarded batch listed above plus a few EU/no-station holdouts.

---

## Backfill plan (priority order)

### 1. Run the post-onboard fillers on the 19 new cities — biggest single gap

These 19 cities have lat/lon but skipped every measurement pass. Running the
standard onboard chain on them closes 19 metrics × 19 cities in one go.
Equivalent to a one-time re-onboarding sweep:

```bash
# OSM batch (cafe_n, bar_n, rest_n, intersection_den, mean_block_m,
# carfree_frac, bldg_coverage, street_km, daily_needs_n, water_dist_m,
# water_extent_km2)
node scripts/measure-cities.mjs

# Walk Score
node scripts/measure-walkscore.mjs

# Climate (pleasant_days, hot_days, days_below_freeze, clear_days,
# visit_climate, bldg_coverage)
node scripts/measure-climate-bldg.mjs

# Census (core_density, owner_occ_pct, seasonal_vac_pct, median_price_usd)
node scripts/measure-census.mjs

# Skyline + horizon
node scripts/backfill-skyline-and-grandeur.mjs
node scripts/onboard.mjs --measurer horizon

# Snowfall (NOAA + Open-Meteo fallback)
node scripts/onboard.mjs --measurer snowfall,snowfall_open_meteo

# Drive hours
node scripts/measure-drive-hrs.mjs

# Population (needed for crowd-season per-capita normalization)
python scripts/measure-crowd-season.py  # pass 1 only
```

The 19 cities to target: Carrboro/Chapel Hill, Cold Spring, Dunedin, Greenport,
Honolulu (Kaimuki), Honolulu (Manoa), Kailua, La Jolla, Marblehead,
Naples (5th Ave South), Port Townsend, Princeton, Rhinebeck, Salem,
San Francisco (Noe Valley), Sarasota (Burns Court), Sausalito,
Tucson (4th Avenue), Wilmington.

### 2. Drive hours on the 6 newest West-Coast/Northeast onboards

Anacortes, Astoria, Athens GA, Bainbridge Island, Boise North End, Camden ME —
these have OSM/climate/etc. but `drive_hrs_from_pit` never ran:

```bash
node scripts/measure-drive-hrs.mjs
```

### 3. Snowfall fallback on Charleston SC + Eureka Springs AR

Both have no NOAA station within 60 km carrying `ANN-SNOW-NORMAL`. The
Open-Meteo ERA5 fallback should cover them:

```bash
node scripts/onboard.mjs --measurer snowfall_open_meteo
```

### 4. EU price + population adapters (3 SI cities)

Bled, Ljubljana, Piran lack `median_price_usd` and `population_total` because
the US Census paths don't apply. Needs SURS PxWeb adapters
(table 0861102 already used for `owner_occ_pct` — extend for price + pop).

---

## Onboarding a new city

See [features/city-onboarding.md](features/city-onboarding.md) for the
end-to-end Supabase-first procedure. Step 8 of that flow is "re-audit
METRICS_COMPLETION.md" — update the coverage table above when you finish.

---

## Source citation rule

Every column in the table above lists a single canonical source. **Never
substitute** a different source for the same metric — that would let two
cities be measured against incomparable rulers. If a source dies, retire the
metric, or version it (`walk_score_v2`) so the difference is visible.

If you find yourself reaching for a CSV to commit, an in-source seed map, or a
"close-enough" hand-entered value — stop. That is exactly the pattern
[CLAUDE.md](CLAUDE.md) tells you to break.
