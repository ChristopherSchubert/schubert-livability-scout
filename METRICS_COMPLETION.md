# Metrics Completion

The standing direction for this project: **every city should carry a complete,
cited measurement set**. This file is the running ledger of what's filled,
what's missing, and exactly which script fills each gap. Update it after every
backfill run.

**The rule that overrides everything still applies:** unmeasured stays `null`.
An honest blank beats a guess. Nothing in here is permission to fudge.

---

## Current coverage (78 cities)

Snapshot of `cities.measured_metrics` in Supabase. A metric counts as "filled"
when its `value` is non-null.

| Axis | Metric | Coverage | Source | Filler script |
|---|---|---|---|---|
| Setting | `skyline_deg` | **78/78** ✅ | Open-Meteo elevation (line-of-sight skyline) | `scripts/backfill-skyline-and-grandeur.mjs` |
| Setting | `mtn_horizon_pct` | **78/78** ✅ | Open-Meteo elevation + OSM peaks | `scripts/onboard.mjs --measurer horizon` |
| Setting | `water_dist_m` | 34/78 | OpenStreetMap (Overpass) | `scripts/measure-cities.mjs` (`measureAround`) |
| Setting | `water_extent_km2` | 34/78 | OpenStreetMap (Overpass) | `scripts/measure-cities.mjs` |
| Aliveness | `cafe_n` | 33/78 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Aliveness | `bar_n` | 33/78 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Aliveness | `rest_n` | 33/78 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Aliveness | `walk_score` | **78/78** ✅ | walkscore.com | `scripts/measure-walkscore.mjs` |
| Fabric | `intersection_den` | 33/78 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Fabric | `mean_block_m` | 33/78 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Fabric | `carfree_frac` | 33/78 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Fabric | `bldg_coverage` | 35/78 | OSM (osmnx) | `scripts/measure-climate-bldg.mjs` |
| _diagnostic_ | `street_km` | 33/78 | OSM (osmnx) | `scripts/measure-cities.mjs` — measured but not in the Fabric rollup (dropped 2026-06-04: penalized peninsula/lakeside/park-heavy cores by counting "missing streets on water" as a deficit). Kept as a stored diagnostic. |
| Realness | `daily_needs_n` | 33/78 | OSM (osmnx) | `scripts/measure-cities.mjs` |
| Realness | `core_density` | **78/78** ✅ | US Census ACS (tract) for US; Eurostat GISCO LAU 2021 for EU | `scripts/onboard.mjs --measurer census,eurostat_lau` |
| Realness | `owner_occ_pct` | **78/78** ✅ | US Census ACS (B25003) for US; SURS PxWeb table 0861102 (2021) for SI | `scripts/onboard.mjs --measurer census,surs_obcina` |
| Realness | `seasonal_vac_pct` | **78/78** ✅ | US Census ACS (B25004) for US; SURS PxWeb table 0861110 (2018 — most recent year with seasonal/secondary breakdown) for SI | `scripts/onboard.mjs --measurer census,surs_obcina`. Other EU countries still need per-NSO adapters |
| Realness | `median_price_usd` | **75/78** | US Census ACS (B25077) | `scripts/onboard.mjs --measurer census`. EU coverage: no pan-EU equivalent — needs per-country price registries (Slovenia: GURS ETN; France: DVF; UK: HMRC Price Paid) |
| Year-round | `pleasant_days` | 25/78 | Open-Meteo archive 2019–2023 | `scripts/measure-climate-bldg.mjs` |
| Year-round | `days_below_freeze` | **78/78** ✅ | Open-Meteo archive | `scripts/measure-climate-bldg.mjs` |
| Year-round | `hot_days` | 25/78 | Open-Meteo archive | `scripts/measure-climate-bldg.mjs` |
| Year-round | `clear_days` | **78/78** ✅ | Open-Meteo archive | `scripts/measure-climate-bldg.mjs` |
| Year-round | `snowfall_in_yr` | **76/78** | NOAA NCEI 1991-2020 Normals (US, when a station within 60 km carries `ANN-SNOW-NORMAL`); Open-Meteo archive ERA5 2019-2023 (global fallback) | `scripts/onboard.mjs --measurer snowfall,snowfall_open_meteo` |

Auxiliary fields (not in `measured_metrics`):

| Field | Coverage | Source |
|---|---|---|
| `lat` / `lon` (heart) | **78/78** ✅ | Geocoded once on insert |
| `visit_climate` (12-month normals) | **78/78** ✅ | `measure-climate-bldg.mjs` |
| `drive_hrs_from_pit` | **78/78** ✅ | OSRM public from PIT airport (40.4915, -80.2329). Anything outside CONUS bbox marked `'FLY'`. Script: `scripts/measure-drive-hrs.mjs` |

---

## What "complete" looks like

A city is complete when **every metric in `metricTaxonomy`** ([lib/planner-data.js:210](lib/planner-data.js)) has a non-null `value` AND its visit window is seeded. That gives:

- All 5 axis rollups score (`weightedAxisScore`)
- All chips in [lib/chips.js](lib/chips.js) can fire on real data
- Calibrate can learn weights from a regression that isn't crippled by NaNs

Today **no city is fully complete** — most are missing the OSM batch.

---

## Backfill plan (priority order)

### 1. OSM batch on the 44 unmeasured cities — biggest single gap

Affects 11 metrics (cafe_n, bar_n, rest_n, intersection_den, mean_block_m, carfree_frac, bldg_coverage, street_km, daily_needs_n, water_dist_m, water_extent_km2) and lights up the bulk of the chip vocabulary. Blocked on the local Nominatim/Overpass stack from TODO #1 — verify the import finished, then:

```bash
node scripts/measure-cities.mjs
```

### 2. Climate top-up (`pleasant_days`, `hot_days`) on 53 cities

Open-Meteo archive runs cheaply; not blocked on OSM. Should be a single re-run of:

```bash
node scripts/measure-climate-bldg.mjs
```

### 3. ~~Mountain horizon (34 → 78)~~ — DONE

Completed via `node scripts/onboard.mjs --measurer horizon` (against local
Overpass). The flatland-zero fix in `measureHorizonPeaks` means cities with
no peaks within 90 km now honestly record 0% instead of staying null.

### 4. Census top-up (3 cities)

The three holdouts likely lack a clean tract intersection or have stale ACS year. Inspect and re-run:

```bash
node scripts/measure-census.mjs
```

### 5. ~~Hand-fill `drive_hrs_from_pit`~~ — DONE

Replaced hand-entry with `scripts/measure-drive-hrs.mjs` (OSRM public,
PIT airport origin, CONUS-bbox guard for foreign cities). 78/78 now
populated. Run with `--refresh` to recompute.

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
