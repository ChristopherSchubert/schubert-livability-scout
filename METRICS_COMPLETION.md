# Metrics Completion

The standing direction for this project: **every city should carry a complete,
cited measurement set**. This file is the running ledger of what's filled,
what's missing, and exactly which script fills each gap. Update it after every
backfill run.

**The rule that overrides everything still applies:** unmeasured stays `null`.
An honest blank beats a guess. Nothing in here is permission to fudge.

---

## Current coverage (122 cities)

Snapshot of `cities.measured_metrics` in Supabase as of 2026-06-08 (audit via
`scripts/.audit-metrics.mjs`). A metric counts as "filled" when its `value`
is non-null.

**119/122 cities are fully measured.** The 3-city gap is the Slovenian
trio (Bled, Ljubljana, Piran), which lack the four US-only Census-derived
metrics — `median_price_usd`, `price_to_income_ratio`,
`walk_transit_commute_pct`, `pre1940_pct` (no pan-EU registry). Every other
metric, including the Google-Places walking-core scores, is 122/122.
Population is now 122/122. New York (SoHo), NY was onboarded 2026-06-08 and
is complete on every track.

| Axis | Metric | Coverage | Source | Filler script |
|---|---|---|---|---|
| Setting | `skyline_deg` | 122/122 | Open-Meteo elevation (line-of-sight skyline) | `scripts/backfill-skyline-and-grandeur.mjs` |
| Setting | `mtn_horizon_pct` | 122/122 | Open-Meteo elevation + OSM peaks | `scripts/onboard.mjs --measurer horizon` |
| Setting | `water_dist_m` | 122/122 | OpenStreetMap (Overpass) | `scripts/onboard.mjs --measurer water` |
| Setting | `water_extent_km2` | 122/122 | OpenStreetMap (Overpass) | `scripts/onboard.mjs --measurer water` |
| Aliveness | `cafe_score` | 122/122 | Google Places (New) via local `pois` cache | `scripts/onboard.mjs --measurer walking_core` — plateau-decay weighted sum, 500 m plateau + 400 m d_half + 1500 m cutoff. See [features/walking-core.md](features/walking-core.md). |
| Aliveness | `bar_score` | 122/122 | Google Places (New) via local `pois` cache | `scripts/onboard.mjs --measurer walking_core` |
| Aliveness | `rest_score` | 122/122 | Google Places (New) via local `pois` cache | `scripts/onboard.mjs --measurer walking_core` |
| Aliveness | `cafe_n` | 122/122 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` — legacy 700 m hard ring; superseded by `cafe_score`, kept as a sanity check |
| Aliveness | `bar_n` | 122/122 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` — legacy 700 m hard ring; superseded by `bar_score` |
| Aliveness | `rest_n` | 122/122 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` — legacy 700 m hard ring; superseded by `rest_score` |
| Aliveness | `walk_score` | 122/122 | walkscore.com | `scripts/onboard.mjs --measurer walkscore` |
| Aliveness | `walk_transit_commute_pct` | 119/122 | US Census ACS — walked (B08301_019E) + public transit (B08301_010E) ÷ workers (B08301_001E) | `scripts/onboard.mjs --measurer census`. US-only |
| Fabric | `intersection_den` | 122/122 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Fabric | `mean_block_m` | 122/122 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Fabric | `carfree_frac` | 122/122 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Fabric | `bldg_coverage` | 122/122 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` |
| Fabric | `pre1940_pct` | 119/122 | US Census ACS — units built 1939 or earlier (B25034_011E ÷ B25034_001E) | `scripts/onboard.mjs --measurer census`. US-only |
| _diagnostic_ | `street_km` | 122/122 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` — measured but not in the Fabric rollup (dropped 2026-06-04: penalized peninsula/lakeside/park-heavy cores by counting "missing streets on water" as a deficit). Kept as a stored diagnostic. |
| Realness | `daily_needs_score` | 122/122 | Google Places (New) via local `pois` cache | `scripts/onboard.mjs --measurer walking_core` |
| Realness | `daily_needs_n` | 122/122 | OSM (osmnx) | `scripts/onboard.mjs --measurer osm_core` — legacy 700 m hard ring; superseded by `daily_needs_score` |
| Realness | `core_density` | 122/122 | US Census ACS (tract) for US; Eurostat GISCO LAU 2021 for EU | `scripts/onboard.mjs --measurer census,eurostat_lau` |
| Realness | `owner_occ_pct` | 122/122 | US Census ACS (B25003) for US; SURS PxWeb table 0861102 (2021) for SI | `scripts/onboard.mjs --measurer census,surs_obcina` |
| Realness | `seasonal_vac_pct` | 122/122 | US Census ACS (B25004) for US; SURS PxWeb table 0861110 (2018 — most recent year with seasonal/secondary breakdown) for SI | `scripts/onboard.mjs --measurer census,surs_obcina`. Other EU countries still need per-NSO adapters |
| Realness | `median_price_usd` | 119/122 | US Census ACS (B25077) | `scripts/onboard.mjs --measurer census`. EU coverage: no pan-EU equivalent — needs per-country price registries (Slovenia: GURS ETN; France: DVF; UK: HMRC Price Paid) |
| Realness | `price_to_income_ratio` | 119/122 | US Census ACS (B25077 ÷ B19013), capped at 50 | `scripts/onboard.mjs --measurer census`. US-only (depends on `median_price_usd`) |
| _helper_ | `median_income_usd` | 119/122 | US Census ACS (B19013) | `scripts/onboard.mjs --measurer census`. Stored to compose `price_to_income_ratio`; not a taxonomy metric itself |
| Off-season ¹ | `pleasant_days` | 122/122 | Open-Meteo archive 2019–2023 | `scripts/onboard.mjs --measurer climate` |
| Off-season ¹ | `days_below_freeze` | 122/122 | Open-Meteo archive | `scripts/onboard.mjs --measurer climate` |
| Off-season ¹ | `hot_days` | 122/122 | Open-Meteo archive | `scripts/onboard.mjs --measurer climate` |
| Off-season ¹ | `clear_days` | 122/122 | Open-Meteo archive | `scripts/onboard.mjs --measurer climate` |
| Off-season ¹ | `snowfall_in_yr` | 122/122 | NOAA NCEI 1991-2020 Normals (US, when a station within 60 km carries `ANN-SNOW-NORMAL`); Open-Meteo archive ERA5 2019-2023 (global fallback) | `scripts/onboard.mjs --measurer snowfall,snowfall_open_meteo` |

¹ **Off-season** (renamed from "Year-round", #105 — 2026-06-27) is `excludeFromScoring: true` in the metric taxonomy and does **not** roll into the vacation Fit composite. The measurements stay populated and visible on the city detail page as informational context ("how bad is the off season"). A future livability-decision mode would re-weight it. Internal taxonomy key kept as `axis: "january"` to avoid a survey-data migration.

Auxiliary fields (not in `measured_metrics`):

| Field | Coverage | Source |
|---|---|---|
| `lat` / `lon` (heart) | **122/122** ✅ | Geocoded once on insert |
| `visit_climate` (12-month normals) | 122/122 | `scripts/onboard.mjs --measurer climate` |
| `drive_hrs_from_pit` | **122/122** ✅ | OSRM public from PIT airport (40.4915, -80.2329). Anything outside CONUS bbox marked `'FLY'`. Script: `scripts/measure-drive-hrs.mjs` |
| `population_total` / `population_source` | **all** ✅ | US: Census ACS B01003_001E with 3-tier fallback — (1) Incorporated Place / CDP; (2) county-subdivision (RI, no Places); (3) ZCTA (unincorporated, e.g. Deep Creek Lake). EU: Eurostat GISCO LAU 2021 municipality population. Now filled by the JS measurer pipeline (`lib/measurers/census.js` US, `eurostat-lau.js` EU) so onboarding fills it automatically. Tier/source recorded in `population_source` |
| `crowd_season` (12 ints 0–5, within-city shape) | **all** ✅ | CASCADE, all tiers live: **6 NPS** ground-truth recreation-visits (`scripts/measure-crowd-nps.py`; in-town/adjacent units whose visitors are the town's tourists — St. Augustine/Castillo, Charleston/Fort Sumter, Savannah/Fort Pulaski, Salem/Salem Maritime, Manteo/Fort Raleigh, Astoria/Lewis & Clark — unit recorded in `nps_unit_code`) > Google Trends > **Wikipedia×Wikivoyage blend** (`scripts/measure-crowd-wiki.py`; traffic-gated geomean). Tiers as of 2026-06-08: **6 NPS + 3 Trends + 113 Wiki = 122**; a 15-city Trends upgrade batch is in progress. Tier recorded in `crowd_season_source` |
| `crowd_intensity` (0–5 scalar, cross-city magnitude) | **122/122** ✅ | Wiki tier: per-capita WP-peak, log-scaled, fixed anchors 50k/M–3M/M. Trends tier uses its own hotel-search anchors. Drives chart line-muting for low-tourism cities. NOTE: for neighborhood-in-metropolis entries (SoHo etc.) the per-capita denominator is the whole metro's population, so intensity under-reads — see the un-Trendsable note below |

### Remaining gaps

- **`median_price_usd` (3 missing)** — Bled, Ljubljana, Piran. No pan-EU
  price registry. **Resolved 2026-06-27 (#104) as honest-null** — the
  owner chose accept-the-blank over building a per-country adapter
  (`scripts/.audit-metrics.mjs` won't flag these). Same applies to the
  other three US-only Census metrics on those rows
  (`price_to_income_ratio`, `walk_transit_commute_pct`, `pre1940_pct`).
- **`population_total`** — RESOLVED (122/122). Bled/Ljubljana/Piran now use
  the Eurostat GISCO LAU municipality population the `eurostat_lau` measurer
  already fetched for `core_density`.
- **`crowd_season` / `crowd_intensity`** — RESOLVED for full coverage via
  the Wikipedia×Wikivoyage blend tier (`scripts/measure-crowd-wiki.py`).
  Remaining work is *quality upgrades*, not coverage: (1) Trends-v3 is the
  cleaner tourism-coded signal but is Google-rate-limit-bound — run it from
  fresh quota windows to upgrade cities per the cascade; (2) NPS monthly
  recreation-visits (`data/nps/`) is ground-truth presence for ~10–15
  curated park/monument towns — overrides the Wiki shape where the unit's
  visitors are the town's tourists; (3) some mid-intensity non-tourist
  towns (e.g. Roanoke, Pittsburgh, Sewickley) still carry residual
  Wikipedia contamination in their shape — these are largely muted by low
  `crowd_intensity` and will be corrected by tiers (1)/(2); (4) the **23
  parenthetical neighborhood entries** (SoHo, the Pittsburgh / Columbus /
  Cleveland / Honolulu / Buffalo neighborhoods, Noe Valley, Tucson 4th Ave,
  etc.) are **structurally un-Trendsable** — `parse_name` strips the
  parenthetical and queries the parent metro, and the per-capita intensity
  denominator is the whole metro's population, so both the shape and the
  magnitude describe the city, not the neighborhood. These stay on the Wiki
  fallback by necessity; a real fix needs neighborhood-scale foot-traffic
  data (SafeGraph/Placer-class), which isn't in the pipeline. (Verified
  2026-06-08 by probing `SoHo hotels` / `things to do in SoHo` — both return
  the Trends noise floor.)

---

## What "complete" looks like

A city is complete when **every metric in `metricTaxonomy`** ([lib/planner-data.js:210](lib/planner-data.js)) has a non-null `value` AND its visit window is seeded. That gives:

- All 5 axis rollups score (`weightedAxisScore`)
- All chips in [lib/chips.js](lib/chips.js) can fire on real data
- Calibrate can learn weights from a regression that isn't crippled by NaNs

**119/122 cities are fully complete.** The remaining 3 are the Slovenian
trio for `median_price_usd` — **accepted as honest-null** per #104 (no
pan-EU price registry; built-the-adapter was the alternative, owner
chose not-to). Coverage is effectively closed for the US metric set.

---

## Backfill plan (priority order)

### ~~1. EU price adapter (3 SI cities)~~ — CLOSED 2026-06-27 (#104)

Owner chose to accept the Slovenia trio's `median_price_usd` /
`price_to_income_ratio` / `walk_transit_commute_pct` / `pre1940_pct` as
honest blanks rather than build a SURS PxWeb / EU registry adapter. The
metric taxonomy notes these as US-only by design.

### 1. Crowd season pipeline replacement

Google Trends rate-limits bulk runs; only 3/122 cities sit on the Trends
tier, with a 15-city upgrade batch running 2026-06-08 (`measure-crowd-season.py`,
conservative cooldowns). The 23 parenthetical neighborhood entries can't use
Trends at all (parent-metro query problem above); everything else falls back
to the Wikipedia×Wikivoyage blend.

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
