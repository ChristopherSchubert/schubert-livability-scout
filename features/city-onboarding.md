# City onboarding

How a candidate place enters Livability Scout and graduates from "just a name"
to a fully-measured row that the rest of the app can rank, schedule, and
compare. Supabase-first: every step writes to the live `cities` row, no
intermediate files in the repo.

## The three data tracks a city must carry

| Track | Where it lives | Who fills it | Rule |
|---|---|---|---|
| **1. Measured** (objective) | `cities.measured_metrics` (jsonb) | the pipeline only | Every metric cited to one canonical source, or left `null` ("not yet measured"). Never hand-entered. |
| **2. Felt** (subjective) | `felt_surveys` (per-user) | the owner, via the *Decide* questionnaire | Filled only after a visit (or from memory on *Baseline*). Five anchored axes + the 0–10 Slovenia score. |
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
| `why` | 2–4 sentences: why this place belongs on the list | (prose) |
| `if_wins` / `if_fails` | gut gates — what would mean hit/miss | "A true harbor piazza." / "Dead off-season." |
| `blocks` | array of specific blocks/zones to walk | `["Main St between …", …]` |

### 2. Geocode the heart

The insert path geocodes the `heart_intersection` string and writes
`cities.lat` / `cities.lon` / `cities.geo_source`. Verify the pin landed on
the actual heart — a wrong pin measures the wrong place.

### 3. Run the measurement pipeline

Each script reads from / writes to Supabase directly. Run any subset; nothing
is order-dependent except that the city must already have `lat`/`lon`.

```bash
node scripts/onboard.mjs --slug <slug>    # runs every measurer in the registry
                                          # (climate, snowfall, water, osm-context,
                                          #  terrain, horizon, admin) — idempotent
node scripts/measure-cities.mjs           # OSM: cafe/bar/rest/fabric/water/daily-needs
node scripts/measure-walkscore.mjs        # walkscore.com
node scripts/measure-census.mjs           # ACS tract metrics
node scripts/measure-climate-bldg.mjs     # Open-Meteo + building coverage + visit_climate
node scripts/backfill-skyline-and-grandeur.mjs
```

The **snowfall** measurer is US-only (NOAA NCEI 1991-2020 normals); foreign
cities and a handful of warm-climate US stations without `ANN-SNOW-NORMAL`
will leave `snowfall_in_yr` as `null` — that is the correct outcome.

Anything the pipeline couldn't source stays `null`. **Do not hand-enter a
value to fill a gap.**

For the live per-metric coverage and which script fills which metric, see
[METRICS_COMPLETION.md](../METRICS_COMPLETION.md).

### 4. Seed the visit window if needed

`measure-climate-bldg.mjs` writes `visit_climate` (12 months of NOAA-derived
normals). If the city is foreign or coverage failed, write the months
directly into the row. Crowd season and notes are qualitative — they go in
the same row's `crowd_season` (12 ints 0–5) and `season_notes`
(`{ charm, truth }`).

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
- **Script add path** (`scripts/onboard.mjs`) — works.
- **Pipeline scripts** — most work; 44 of 78 cities still missing the OSM
  batch (blocked on TODO #1's local Nominatim/Overpass stack).
- **Hero image flow** — works.
- **Drive-hours hand-entry** — 18/78 seeded; remaining 60 need a person
  to make the call.

## TODOs / future direction

- **One-command onboarding.** Wrap insert + geocode + every measure-*.mjs +
  hero-search into a single `scripts/onboard.mjs <Name>, <ST>` invocation
  so a new city graduates to *complete* in one step.
- **Boundary auto-fetch on insert.** Boundaries are now lazy-fetched by
  `/api/measure` via `fetchStayZoneBoundary` in
  [lib/measure.js](../lib/measure.js) — Census Place → OSM → Tract → NRHP
  → fallback chain. New cities pick up a boundary the first time the API is
  hit for them; no separate batch script.
- **Drive-hours as a derived metric.** Could compute from `lat`/`lon` via a
  routing API (OSRM, Google Distance Matrix) instead of hand-entry — would
  eliminate the manual step and make it consistent. Trade-off: API cost +
  another external dependency.
- **Schema validation on `measured_metrics`.** Today it's a free-form jsonb
  bag — nothing prevents writing `cafe_n: 12` (bare) instead of
  `cafe_n: { value: 12, asOf: "2026-06-03" }`. A Postgres `check` constraint
  or a writer-side helper would lock the convention.
- **Felt score is per-user** but most of the rest is shared. For 2 users that's
  fine; if the slate grows past two, the Calibrate page's "whose felt scores
  are we regressing against" needs to be a setting.
