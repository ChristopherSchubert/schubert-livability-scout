# Metrics Completion

The standing direction for this project: **every city should carry a complete,
cited measurement set**. This file is the running ledger of what's filled,
what's missing, and exactly which script fills each gap. Update it after every
backfill run.

**The rule that overrides everything still applies:** unmeasured stays `null`.
An honest blank beats a guess. Nothing in here is permission to fudge.

---

## Current coverage (115 cities)

Snapshot of `cities.measured_metrics` in Supabase as of 2026-06-05 (audit via
`scripts/.audit-metrics.mjs`). A metric counts as "filled" when its `value`
is non-null.

**112/115 cities are fully measured.** The 3-city gap is the Slovenian
trio for `median_price_usd` (no pan-EU price registry). Population now
covers 111/115 — only the 3 SI cities and Deep Creek Lake (McHenry, MD,
genuinely unincorporated) remain.

| Axis | Metric | Coverage | Source | Filler script |
|---|---|---|---|---|
| Setting | `skyline_deg` | 115/115 | Open-Meteo elevation (line-of-sight skyline) | `scripts/backfill-skyline-and-grandeur.mjs` |
| Setting | `mtn_horizon_pct` | 115/115 | Open-Meteo elevation + OSM peaks | `scripts/onboard.mjs --measurer horizon` |
| Setting | `water_dist_m` | 115/115 | OpenStreetMap (Overpass) | `scripts/onboard.mjs --measurer water` |
| Setting | `water_extent_km2` | 115/115 | OpenStreetMap (Overpass) | `scripts/onboard.mjs --measurer water` |
| Aliveness | `cafe_n` | 115/115 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Aliveness | `bar_n` | 115/115 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Aliveness | `rest_n` | 115/115 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Aliveness | `walk_score` | 115/115 | walkscore.com | `scripts/onboard.mjs --measurer walkscore` |
| Fabric | `intersection_den` | 115/115 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Fabric | `mean_block_m` | 115/115 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Fabric | `carfree_frac` | 115/115 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Fabric | `bldg_coverage` | 115/115 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| _diagnostic_ | `street_km` | 115/115 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` — measured but not in the Fabric rollup (dropped 2026-06-04: penalized peninsula/lakeside/park-heavy cores by counting "missing streets on water" as a deficit). Kept as a stored diagnostic. |
| Realness | `daily_needs_n` | 115/115 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Realness | `core_density` | 115/115 | US Census ACS (tract) for US; Eurostat GISCO LAU 2021 for EU | `scripts/onboard.mjs --measurer census,eurostat_lau` |
| Realness | `owner_occ_pct` | 115/115 | US Census ACS (B25003) for US; SURS PxWeb table 0861102 (2021) for SI | `scripts/onboard.mjs --measurer census,surs_obcina` |
| Realness | `seasonal_vac_pct` | 115/115 | US Census ACS (B25004) for US; SURS PxWeb table 0861110 (2018 — most recent year with seasonal/secondary breakdown) for SI | `scripts/onboard.mjs --measurer census,surs_obcina`. Other EU countries still need per-NSO adapters |
| Realness | `median_price_usd` | 112/115 | US Census ACS (B25077) | `scripts/onboard.mjs --measurer census`. EU coverage: no pan-EU equivalent — needs per-country price registries (Slovenia: GURS ETN; France: DVF; UK: HMRC Price Paid) |
| Year-round | `pleasant_days` | 115/115 | Open-Meteo archive 2019–2023 | `scripts/onboard.mjs --measurer climate` |
| Year-round | `days_below_freeze` | 115/115 | Open-Meteo archive | `scripts/onboard.mjs --measurer climate` |
| Year-round | `hot_days` | 115/115 | Open-Meteo archive | `scripts/onboard.mjs --measurer climate` |
| Year-round | `clear_days` | 115/115 | Open-Meteo archive | `scripts/onboard.mjs --measurer climate` |
| Year-round | `snowfall_in_yr` | 115/115 | NOAA NCEI 1991-2020 Normals (US, when a station within 60 km carries `ANN-SNOW-NORMAL`); Open-Meteo archive ERA5 2019-2023 (global fallback) | `scripts/onboard.mjs --measurer snowfall,snowfall_open_meteo` |

Auxiliary fields (not in `measured_metrics`):

| Field | Coverage | Source |
|---|---|---|
| `lat` / `lon` (heart) | **115/115** ✅ | Geocoded once on insert |
| `visit_climate` (12-month normals) | 115/115 | `scripts/onboard.mjs --measurer climate` |
| `drive_hrs_from_pit` | **115/115** ✅ | OSRM public from PIT airport (40.4915, -80.2329). Anything outside CONUS bbox marked `'FLY'`. Script: `scripts/measure-drive-hrs.mjs` |
| `population_total` / `population_source` | 111/115 | Census ACS Place B01003_001E (city-wide, NOT tract); RI uses county-subdivision (town) since RI has no Census Places. Script: `scripts/measure-crowd-season.py --pop-only` |
| `crowd_season` (12 ints 0–5, within-city shape) | 43/115 | Google Trends BLEND: `<city> hotels` (booking intent, shift +1mo, w=0.4) + `things to do in <city>` (presence, w=0.6), per-capita normalized. Script: `scripts/measure-crowd-season.py`. **Blocked by Google rate-limit** as of last check |
| `crowd_intensity` (0–5 scalar, cross-city magnitude) | 41/115 | log-scaled blended-peak per-capita, anchors floor=100/M ceil=10,000/M. Same script |

### Remaining gaps

- **`median_price_usd` (3 missing)** — Bled, Ljubljana, Piran. No pan-EU
  price registry; would need a per-country adapter (Slovenia: GURS ETN).
- **`population_total` (4 missing)** — 3 SI cities (Bled, Ljubljana,
  Piran) need a SURS adapter; Deep Creek Lake (McHenry) MD is genuinely
  unincorporated and has no Census Place — the surrounding county
  subdivision spans an area too large to honestly call "the city's pop".
- **`crowd_season` / `crowd_intensity` (72 / 74 missing)** — Google Trends
  rate-limit blocks bulk runs. Needs an alternative pipeline or a different
  signal (Wikipedia pageviews, AirDNA seasonality) — see
  `scripts/measure-crowd-season.py`.

---

## What "complete" looks like

A city is complete when **every metric in `metricTaxonomy`** ([lib/planner-data.js:210](lib/planner-data.js)) has a non-null `value` AND its visit window is seeded. That gives:

- All 5 axis rollups score (`weightedAxisScore`)
- All chips in [lib/chips.js](lib/chips.js) can fire on real data
- Calibrate can learn weights from a regression that isn't crippled by NaNs

**112/115 cities are fully complete.** The remaining 3 are the Slovenian
trio for `median_price_usd` (no pan-EU price registry).

---

## Backfill plan (priority order)

### 1. EU price + population adapters (3 SI cities)

Bled, Ljubljana, Piran lack `median_price_usd` and `population_total` because
the US Census paths don't apply. Needs SURS PxWeb adapters
(table 0861102 already used for `owner_occ_pct` — extend for price + pop).

### 2. Crowd season pipeline replacement

Google Trends rate-limits bulk runs; only 43/115 cities are covered. Needs
either an unblock workaround (residential proxies, slower cadence) or a
swap to Wikipedia pageviews / AirDNA seasonality as the source.

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
