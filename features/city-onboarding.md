# City onboarding

How a candidate place enters Livability Scout and graduates from "just a name"
to a fully-measured row that the rest of the app can rank, schedule, and
compare. Supabase-first: every step writes to the live `cities` row, no
intermediate files in the repo.

## The three data tracks a city must carry

| Track | Where it lives | Who fills it | Rule |
|---|---|---|---|
| **1. Measured** (objective) | `cities.measured_metrics` (jsonb) | the pipeline only | Every metric cited to one canonical source, or left `null` ("not yet measured"). Never hand-entered. |
| **2. Felt** (subjective) | `felt_surveys` (per-user) | the owner, via the *Decide* questionnaire | Filled only after a visit (or from memory on *Baseline*). Five anchored axes + the 0–10 Gut score. |
| **3. Visit window** | `cities.visit_climate`, `crowd_season`, `season_notes` | climate from NOAA; crowd/notes qualitative | Climate is cited data; crowd season is an observed qualitative read. |

A new city starts with **all three empty** and graduates as data arrives.

## Steps

### 1. Insert the row

Two paths:
- **UI**: *+ Add candidate* button on the *Board*. Drops the city in as `Idea`
  with empty metrics.
- **Script**: `node scripts/onboard.mjs` for a batch add. Talks straight to
  Supabase.

Do **not** edit `starterCities` in [lib/planner-data.js](../lib/planner-data.js)
for a new city. That array is only a fallback seed on first boot of an empty
DB — the runtime reads from Supabase, and changes there don't propagate.

Required fields at insert time:

| Field | What it is | Example |
|---|---|---|
| `name` | "City, ST" — unique, drives the slug | `Annapolis, MD` |
| `stay_zone` | the neighborhood you'd actually live in | `City Dock / Eastport` |
| `heart_intersection` | the single corner that is the heart | `Main St & Randall St` |
| `why` | 2-paragraph editorial (orientation + case/tradeoff) | (prose) |
| `blocks` | array of specific blocks/zones to walk | `["Main St between …", …]` |

### 2. Geocode the heart

The insert path geocodes the `heart_intersection` string and writes
`cities.lat` / `cities.lon` / `cities.geo_source`. Verify the pin landed on
the actual heart — a wrong pin measures the wrong place.

### 3. Run the measurement pipeline

**Prerequisite — populate the POI cache (FREE for US cities).** The
`walking_core` measurer reads POIs from the unified `pois` cache; it does
**not** fetch them. Fill a new US city for **$0** from local Overpass first:

```bash
node scripts/.fetch-pois-osm.mjs --slug <slug>     # source='osm', one query, free
```

⚠️ Do **not** reach for `scripts/.fetch-pois.mjs` (Google Places) by habit —
it costs ~$3.22/city at the Enterprise SKU and is now behind a $25 cost gate.
Use it only when you specifically want the trip UI's ratings/price for a city
you're planning a trip to. The OSM populator skips any city already cached, so
it's safe to re-run. Non-US places (Slovenia anchors) get zero from local
Overpass — leave them on their existing Google cache. See
[walking-core.md](walking-core.md#populating-the-poi-cache-cost-matters).

One command, one entrypoint. The script iterates the measurer registry
([lib/measurers/_registry.js](../lib/measurers/_registry.js)) and runs every
measurer for the city, idempotently — anything already populated is
skipped, anything missing is computed and merged into the row. Order isn't
sensitive except that `lat`/`lon` must already be set.

```bash
# everything missing, all measurers, this one city
OVERPASS_URL=http://localhost:12345/api/interpreter \
DBPW=$(security find-generic-password -a livability-scout -s supabase-db-password -w) \
node scripts/onboard.mjs --slug <slug>
```

`OVERPASS_URL` routes every OSM call (water, osm_context, osm_core,
horizon, blocks) through the local container — required for a corpus run
since public mirrors throttle at ~1 query / 5 s. For a single-city onboard
you can omit it and the public mirrors will work, just slower.

The 12 measurers in the registry collectively cover every taxonomy key plus
the chip / sidecar layer. See
[features/measurer-pipeline.md](measurer-pipeline.md) for the full
contract, the registry table, and how the runner decides what to skip.

The **snowfall** measurer is US-only (NOAA NCEI 1991-2020 normals); foreign
cities and a handful of warm-climate US stations without `ANN-SNOW-NORMAL`
will leave `snowfall_in_yr` as `null` — that is the correct outcome.

Anything the pipeline couldn't source stays `null`. **Do not hand-enter a
value to fill a gap.**

After the JS measurers, a **full onboard (`--measurer all`, the default) also
runs the crowd_season pipeline** — it's not a JS measurer because its signals
come from Python (Wikimedia + Google Trends). `onboard.mjs` shells out to:

```
measure-crowd-wiki.py        # collect WP+WV raw → cities.crowd_raw.wiki
score-crowd-season.py --write  # crowd_raw → crowd_season (NPS>Trends>Wiki cascade)
```

So a newly-onboarded city gets a `crowd_season` (Wiki tier) automatically. The
NPS tier (curated park towns) and the Trends tier (rate-limited windowed sweep,
`measure-crowd-season.py`) layer on later and re-score via the same scorer. Pass
`--no-crowd` to skip this. The crowd pipeline runs *after* the census measurer
so `population_total` (the scorer's per-capita denominator) is already set.

For the live per-metric coverage table and which measurer fills which key,
see [METRICS_COMPLETION.md](../METRICS_COMPLETION.md).

### 4. Seed the visit window if needed

The `climate` measurer writes `visit_climate` (12 months of NASA-POWER-derived
normals) as part of step 3. If a city is somewhere POWER can't reach (very
small islands, etc.) the column stays null and you write the months directly
into the row. `crowd_season` is now measured by the crowd pipeline above (not
qualitative); only `season_notes` (`{ prime, offSeason }`) is hand-authored prose.

### 5. Set `drive_hrs_from_pit`

Computed via OSRM public, origin PIT airport (40.4915, -80.2329). Run
after the row has `lat`/`lon`:

```bash
node scripts/measure-drive-hrs.mjs --only <city-substring>
```

The script's CONUS-bbox guard (24–50°N, -125 to -66°W) marks anything
foreign as `'FLY'` — OSRM would otherwise route across the Atlantic by
snapping to the nearest road on each side and give a nonsense duration.

### 6. Hero image

*Images* tab → search (Unsplash → Openverse → Commons) or paste a URL → Save.
Writes a content-addressable file to Supabase Storage and overwrites
`cities.hero_image`.

### 7. Felt score — later

Comes from the *Decide* questionnaire after an actual visit. Requires the
owner to have rated the reference places (Bled, Piran, Shadyside, …) on the
*Baseline* tab first — that's the answer key the felt scores are compared
against.

### 8. Re-audit METRICS_COMPLETION.md

Update the coverage column there so the next session sees an honest snapshot.

## Status

- **UI add path** — works.
- **Script add path** (`scripts/onboard.mjs`) — works; one entrypoint covers
  every measurer (see [measurer-pipeline.md](measurer-pipeline.md)).
- **Pipeline coverage** — every taxonomy key has a registry measurer; corpus
  population is tracked in [METRICS_COMPLETION.md](../METRICS_COMPLETION.md).
- **Hero image flow** — works.
- **Drive-hours hand-entry** — 18/78 seeded; remaining 60 need a person to
  make the call (or the derived-metric idea below).

## TODOs / future direction

- **Single-command bootstrap.** Today `onboard.mjs` handles the measurement
  step but row insert + geocode + hero-search are still separate. Wrap them
  into one invocation: `scripts/onboard.mjs --new "Annapolis, MD" --stay-zone "..." --heart "..."` →
  insert → geocode → measure → suggest hero.
- **Boundary auto-fetch on insert.** Boundaries are now lazy-fetched by
  `/api/measure` via `fetchStayZoneBoundary` in
  [lib/measure.js](../lib/measure.js) — Census Place → OSM → Tract → NRHP
  → fallback chain. New cities pick up a boundary the first time the API is
  hit for them; no separate batch script.
- **Drive-hours as a derived metric.** Could compute from `lat`/`lon` via a
  routing API (OSRM, Google Distance Matrix) instead of hand-entry — would
  eliminate the manual step and make it consistent. Trade-off: API cost +
  another external dependency.
- **Felt score is per-user** but most of the rest is shared. For 2 users
  that's fine; if the slate grows past two, the Calibrate page's "whose felt
  scores are we regressing against" needs to be a setting.
