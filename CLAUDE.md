# Livability Scout — Project Guide

A decision tool for finding a US place to live part-time that reproduces the
lived feeling of Bled and Piran, Slovenia: walkable, nature-adjacent, real
public life, alive year-round. It ranks candidate places to **visit**, then
captures the owner's firsthand reaction after each visit. It does not certify
a winner — final judgment happens on the ground.

## The one rule that overrides everything

**Never invent data.** Every value is either (a) computed from a real, cited
source, or (b) explicitly empty/`null` ("not yet measured"). Hand-entered 0–10
"scores" dressed as measurements are the original sin this project exists to
correct. An honest blank beats a confident guess. If a thing can be quantified,
it must come from a cited source identical across all cities.

Corollary: do not attribute the model's outputs to the owner's gut. The owner's
judgment enters in exactly one place — the felt-score questionnaire (Track 2).

## The three data tracks (never blend them)

1. **Measured (objective)** — `cityItem.measuredMetrics`, defined by
   `metricTaxonomy` in `lib/planner-data.js`. ~20 metrics grouped under 5 axes,
   each with one canonical source (OSM, USGS/SRTM DEM, NOAA NCEI, Census ACS,
   Redfin, AirDNA, Walk Score). Filled only by the pipeline. Stored as
   `{ value, asOf }`. The 5 groups are: Setting, Aliveness, Fabric, Realness,
   January.

2. **Felt (subjective)** — `cityItem.survey`, defined by `surveyAxes`. The same
   5 axes the metrics roll up into, scored 1–5 against fixed anchors (places the
   owner has stood in), plus a 0–10 **Slovenia score** (the gut number — this is
   the regression *target*, the thing the measured metrics aim to predict) and a
   free note. Captured via the questionnaire (`SurveyFlow`), after a visit.
   Baselines are captured from memory on the Baseline tab.

   Why 5 felt axes but ~20 metrics: a machine measures many things cheaply and
   the regression decides which matter; a human can only *honestly* distinguish
   a handful from memory. More subjective sub-scores = false precision. The 5
   axes are the human-perceivable rollups of the metric families, so felt-vs-
   measured is legible per axis.

3. **Visit window** — `visitClimate` (NOAA normals), `crowdSeason` (qualitative
   0–5), `seasonNotes`. `cityVisitWindow()` computes two diagnostic trips:
   **Charm** (comfortable + crowds thinned) and **Truth** (the coldest month —
   the January test made literal). A candidate should pass both.

## App architecture (Next.js, app router)

- `lib/planner-data.js` — the data model + all derived helpers. Single source
  of truth for the taxonomy, survey, benchmarks, visit-window logic, and the
  city factory. **Most domain logic lives here.**
- `components/PlannerProvider.jsx` — React context; localStorage persistence
  (`planner`, `weights`, `references`); `imageState.version` cache-bust;
  `resolveImage` / `appendBust`.
- `components/AppShell.jsx` — top nav (workflow modes), city context strip.
- Workflow modes / routes:
  - `/board` — funnel kanban (all stages). `FunnelBoard.jsx`.
  - `/calibrate` — weighted ranking + collapsed weights strip. `Calibrate.jsx`.
  - `/visit` — trip queue. `VisitWorkspace.jsx`.
  - `/decide` — post-visit survey queue. `DecideWorkspace.jsx`.
  - `/decided` — verdict archive. `DecidedArchive.jsx`.
  - `/baseline` — rate known places from memory (Track 2 answer key). `Baseline.jsx`.
  - `/cities/[slug]` · `/visit` · `/images` · `/decide` — per-city pages,
    rendered through `CityDetailRoute` / `VisitPlanRoute` / `ImagesPageRoute` /
    `DecideRoute`, which wrap content sections still exported from
    `PlannerShell.jsx` (`CityDetail`, `VisitPlan`, `ImagesPage`).
- `SurveyFlow.jsx` — the facilitated questionnaire (used by both Decide and Baseline).
- `app/api/images/{search,save}/route.js` + `lib/image-manifest.js` — image
  search (Unsplash → Openverse → Commons) and content-addressable hero save.
  One hero per city; filename is `sha256(bytes).slice(0,12)`.

## Image model

One hero image per city. No slots, no choices array. Save writes a
content-addressable file and overwrites `manifest.images[query]`. The Images
tab offers search + paste-a-URL (the Google-Images workflow without an API).
`UNSPLASH_ACCESS_KEY` lives in `.env.local` (gitignored).

## The Python pipeline (separate from the app)

- `scripts/measure_places.py` — computes the objective metrics from cited
  sources. Edit `PLACES` (name, lat, lon, radius_m), run, get `measured_metrics.json`.
- `scripts/fit_weights.py` — learns Calibrate weights by ridge regression of
  the measured metrics against the owner's felt Slovenia scores (the answer
  key). Reports leave-one-out R² — if low, the metrics don't capture the
  feeling; add metrics, don't fudge weights. Needs ≥ ~8 baselined ratings.
- `scripts/import-scores.mjs` — imports pipeline output into app state.
- `_files_thread/HANDOFF.md` — the original methodology doc. Read it for the
  reasoning behind the no-fake-data rule and the metric taxonomy.

## Onboarding a new city

See **CITY_ONBOARDING.md** for the full procedure. Short version:
1. `city(...)` into `starterCities` (or **+ Add candidate** in the UI).
2. Geocode the heart into `measure_places.py` `PLACES`.
3. Run the pipeline → `import-scores.mjs`. Unmeasured metrics stay `null`.
4. Seed the visit window (NOAA climate + qualitative crowd/notes).
5. Set a hero on the Images tab.
6. Felt score comes later, from the post-visit questionnaire.

## Conventions

- Keep `lib/planner-data.js` the home for domain logic; components stay thin.
- Derived seed/reference data (visit climate, benchmark scores) lives in
  `lib/planner-data.js` and is re-applied on every `normalizeState` — the seed
  wins, so updating it updates all cities. User-entered data (surveys, trip
  details) is preserved and never overwritten by normalize.
- When adding a metric: add it to `metricTaxonomy` *with its source*, and the
  Detail page renders it automatically. Don't add a metric without a citation.
- Dev server: `npm run dev` (port 3000). The repo has no test suite; verify by
  hitting routes and checking the rendered pages.
