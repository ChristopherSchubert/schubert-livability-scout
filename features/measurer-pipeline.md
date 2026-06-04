# Measurer pipeline

How objective data (every key in `cities.measured_metrics`, plus a few
sidecar columns like `visit_climate` and `horizon_features`) gets computed,
written, and refreshed. Single entrypoint, idempotent, every value cited.

This is the layer that makes "Track 1 — Measured" honest. The project rule
is **never invent data**; this pipeline enforces it by leaving any unknown
value as `null` and routing every successful write through an envelope that
carries `source` + `sourceUrl`.

## What a measurer is

A measurer is a tiny declarative module under
[lib/measurers/](../lib/measurers). Each one knows how to compute one
coherent slice of objective data for a single city:

```js
// lib/measurers/<id>.js
export default {
  id: "climate",                              // unique selector key
  describe: "NASA POWER (MERRA-2) ...",       // one line, shown in --help
  needs: ["lat", "lon"],                      // fields the runner must supply
  writes: {                                   // declared outputs
    measuredMetrics: ["days_below_freeze", "clear_days", ...],
    columns: ["visit_climate"],
  },
  throttleMs: 800,                            // sleep after run() to be polite
  async run({ lat, lon, name, asOf, prior, env }) {
    // ... fetch, compute, return envelope-wrapped values ...
    return {
      measuredMetrics: { days_below_freeze: { value: 23, asOf, source, sourceUrl } },
      columns:         { visit_climate: [...] },     // optional
      notes:           "jan 33.6°F | jul 73.6°F",    // optional, per-city log
    };
  },
};
```

Every value written into `measuredMetrics` is wrapped in the canonical
envelope `{ value, asOf, source, sourceUrl, meta? }`. Bare scalars are
forbidden by convention — the next page that reads the value expects to
display the citation alongside it.

## The pieces

| File | Role |
|---|---|
| [lib/measurers/_registry.js](../lib/measurers/_registry.js) | Imports every measurer and exports the ordered `REGISTRY` array. `pickMeasurers(selection)` resolves `--measurer climate,water` to a subset. |
| [lib/measurers/_runner.js](../lib/measurers/_runner.js) | `runForCity(client, city, measurers, opts)` — iterates measurers for one city, applies idempotency, merges results, writes to Supabase in one statement per city. |
| [lib/measurers/_db.js](../lib/measurers/_db.js) | Postgres client connect, `listCities` query, and the `applyPatch` write that merges `measured_metrics` and updates sidecar columns. |
| [scripts/onboard.mjs](../scripts/onboard.mjs) | The CLI. Loads `.env.local`, parses args, iterates cities. Single entrypoint for all measurement work. |
| [lib/measure.js](../lib/measure.js) | The fat module of source-specific implementations (`measureClimate`, `osmMetrics`, `measureCensus`, `measureSkyline`, `measureWalkScore`, `measureBuildingCoverage`, `measureHorizonPeaks`, …). Measurers are thin adapters over these. |

## The registry today

Order in the registry matters only for the per-city log; the runner doesn't
do dependency ordering past `needs`. Free + slow first (fail fast on
outages); key-gated measurers (Census, Walk Score) last so an API-key issue
doesn't block the cheap ones.

| Measurer | Source | Taxonomy keys filled | Other writes |
|---|---|---|---|
| `climate` | NASA POWER (MERRA-2) | `pleasant_days`, `days_below_freeze`, `hot_days`, `clear_days` | `climate_extremes`, `visit_climate` |
| `snowfall` | NOAA NCEI 1991–2020 Normals | `snowfall_in_yr` (US only — no-output when no nearby station) | — |
| `snowfall_open_meteo` | Open-Meteo archive (ERA5) 2019–2023 | `snowfall_in_yr` (global fallback — runs only when `snowfall` left it null) | — |
| `water` | OSM (Overpass) | `water_dist_m`, `water_extent_km2` | — |
| `osm_context` | OSM (Overpass) | — | `osm_context` envelope (chip signals: coastline, island, harbour, forest, historic, pedestrian, square, university, hiking, ski, cycleway) |
| `osm_core` | OSM (Overpass) | `cafe_n`, `bar_n`, `rest_n`, `daily_needs_n`, `intersection_den`, `mean_block_m`, `carfree_frac`, `street_km`, `bldg_coverage` | — |
| `terrain` | Open-Meteo elevation (SRTM) | — | `terrain` envelope (heart_elev_m, peak_rise_15km_m, relief_10km_m, slope_p90_deg) |
| `horizon` | Open-Meteo elev + OSM peaks | `mtn_horizon_pct` | `horizon_features` |
| `skyline` | Open-Meteo elevation | `skyline_deg` | — |
| `admin` | hand-coded + Census | — | `admin` envelope (state capital flag; population TODO) |
| `blocks` | OSM (Overpass) + Nominatim fallback | — | `block_geometries` (per-block coords for the map, polygon-gated; see [features/six-blocks.md](six-blocks.md)) |
| `census` | US Census ACS 5-year | `core_density`, `owner_occ_pct`, `seasonal_vac_pct`, `median_price_usd`, `pre1940_pct` | `median_income_usd`, `walk_transit_commute_pct`, `price_to_income_ratio` |
| `eurostat_lau` | Eurostat GISCO LAU 2021 (Nominatim reverse-geocode) | `core_density` (EU only — self-skips US coords) | `eu_lau` envelope (LAU id, name, population, area, density per km²) |
| `walkscore` | walkscore.com | `walk_score` | — |

That covers **23 of 23** taxonomy keys plus the chip / sidecar layer.

## The runner contract

For each (city, measurer) pair, the runner asks four questions in order:

1. **Already populated?** If every key declared in `writes` is non-null on the
   city row (and `--force` wasn't passed), the measurer is **skipped** with
   `· already populated (use --force to refresh)`.
2. **Missing inputs?** If anything in `needs` is null (typically `lat`/`lon`),
   marked `· missing-inputs`. Measurer doesn't run.
3. **Run.** Calls `m.run({ lat, lon, name, asOf, prior, env })`. `prior` is
   the city's current `measured_metrics` (read-only); `env` is `process.env`.
4. **No output?** If `run()` returns no `measuredMetrics`, `visitClimate`, or
   `columns`, marked `· no-output` with the measurer's optional note.

All successful writes for a city are merged and applied in **one Supabase
update per city** at the end. Crashes mid-run leave whatever previously-
written cities committed; the city in flight is left untouched.

## Idempotency

The default mode (`--missing-only`, the default; no flag needed) skips any
measurer whose declared outputs are already populated. `--force` ignores
that and re-runs every measurer. A new city naturally gets the full run;
a measurer added later (or a key added to an existing measurer's `writes`)
gets backfilled on the next run because the new keys are still null.

## Routing OSM through the local container

Every OSM-touching measurer (water, osm_context, osm_core, horizon, blocks)
goes through the single `overpass(query)` helper in
[lib/measure.js](../lib/measure.js). That helper checks
`process.env.OVERPASS_URL` first and uses it if present, otherwise falls
through to a small list of public mirrors with retry.

So:

```bash
OVERPASS_URL=http://localhost:12345/api/interpreter node scripts/onboard.mjs
```

routes every OSM call through the local container. No measurer code knows
about this; it's transparent.

The public mirrors throttle at roughly 1 query per 5 seconds; the local
container is unbounded. For a full-corpus refresh, OVERPASS_URL is more or
less required.

## Secrets

`scripts/onboard.mjs` auto-loads `.env.local` on startup (mirroring Next.js
behavior so the API route and the CLI see the same secrets). Already-set
env vars win, so Keychain-sourced overrides still work:

```bash
DBPW=$(security find-generic-password -a livability-scout -s supabase-db-password -w) \
OVERPASS_URL=http://localhost:12345/api/interpreter \
node scripts/onboard.mjs --slug newport-ri --force
```

Required for full coverage:

- `DBPW` — Supabase Postgres password (lives in macOS Keychain)
- `CENSUS_API_KEY` — used by the `census` measurer (free, in `.env.local`)
- `WALKSCORE_API_KEY` — used by the `walkscore` measurer (free tier, in `.env.local`)

Missing keys cause the relevant measurer to self-skip with a clear note
rather than failing the whole run.

## CLI usage

```bash
# every measurer on every city, missing-only (idempotent)
node scripts/onboard.mjs

# one city, refresh everything
node scripts/onboard.mjs --slug newport-ri --force

# subset of measurers on one city
node scripts/onboard.mjs --slug newport-ri --measurer climate,water --force

# safe dry-run: compute + log, no DB write
node scripts/onboard.mjs --slug newport-ri --dry-run

# cap city count for test runs
node scripts/onboard.mjs --limit 3
```

## Adding a new measurer

1. Write the module under `lib/measurers/<id>.js`. Follow the shape of
   `water.js` or `skyline.js` for thin wrappers, or `climate.js` /
   `osm-context.js` for self-contained ones.
2. Decide whether your data fits the taxonomy. If yes, add the keys to
   `metricTaxonomy` in [lib/planner-data.js](../lib/planner-data.js) with
   `source` + `sourceUrl` — the city detail page renders them automatically.
   If they're chip signals or sidecar data, store them under a composite
   envelope key (like `terrain` or `osm_context`) instead.
3. Import + add to the `REGISTRY` array in `_registry.js`. Position in
   the array determines log order, not dependency order.
4. Verify on a dry run:
   `node scripts/onboard.mjs --slug <test-city> --measurer <id> --force --dry-run`

If your measurer hits OSM, route through `overpass()` and you inherit
local-container support for free. If it needs an API key, pull it from
`env.YOUR_KEY` and self-skip with a `notes` string when it's missing.

## Status

Working. The 12 measurers above collectively cover every taxonomy key. The
single-entrypoint promise (`scripts/onboard.mjs` replaces every older
`measure-*.mjs` / `backfill-*.mjs` script) is now true; the legacy scripts
in [scripts/](../scripts) are vestigial and slated for deletion once the
team is comfortable with the unified runner.

## TODOs / future direction

- **Delete the legacy scripts.** `scripts/measure-cities.mjs`,
  `scripts/measure-walkscore.mjs`, etc. are now redundant. Keep them for
  one more round of full-corpus runs as a safety net, then remove.
- **Intersection-angle entropy.** Grid-vs-organic plan distinction; needs
  `osmnx`. Park as a sidecar Python step that writes back to Supabase or
  fold into `osm_core` via a heuristic on `osmMetrics`.
- **Viewshed (`viewshed_km2`).** Not yet sourced. DEM-based ray-casting
  measurer over the same elevation grid `terrain` uses; meaningful work,
  separate slice.
- **`str_share_pct`** was retired (no source met the "identical ruler"
  bar). `seasonal_vac_pct` from `census` is the canonical hollowing
  signal now.
- **EU realness beyond `core_density`.** `eurostat_lau` fills density
  for any EU municipality, but the other realness metrics
  (`owner_occ_pct`, `seasonal_vac_pct`, `median_price_usd`,
  `price_to_income_ratio`) currently land empty for EU cities.
  Eurostat Census 2021 publishes tenure and vacancy at NUTS region —
  too coarse to map cleanly to LAU. The realistic fill path is one
  per-country adapter at a time: Slovenia via SURS pxweb (housing
  tenure by občina) and GURS ETN (€/m² transactions), with similar
  per-country sources elsewhere.
- **GEOSTAT 1 km grid for densest-cluster density.** Today's
  `eurostat_lau` returns whole-LAU density, which understates dense
  in-town cores in rural communes like Bled (294 /sqmi LAU-wide vs
  much denser in the actual town centre). A follow-up could sample
  the Eurostat 1 km grid inside the stay-zone polygon and return the
  busiest cell, matching the US ACS tract-of-the-cluster approach.
  Needs a ~100 MB download + per-cell spatial lookup.
- **Schema validation on `measured_metrics`.** Today it's free-form jsonb;
  a Postgres `check` constraint or a writer-side schema validator would
  prevent bare scalars from sneaking in.
