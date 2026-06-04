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

## Supabase is the source of truth

**All city/place data lives in Supabase.** No CSVs in the repo, no in-source
seed maps keyed by city name, no `const someThingByCity = { … }` literals in
JS modules. When you need to add a new per-city attribute:

1. Add a column (or table) in `supabase/schema.sql` + a one-off migration
   file in `supabase/migrations/`.
2. Round-trip it through `lib/city-row.js` (`rowToCity` / `cityToRow`) and
   add it to the `mapPatch` map in `lib/db.js` so updates persist.
3. The runtime reads it from the row at load time — never from a literal.

If you find yourself reaching for a CSV to commit, or typing
`{ "Annapolis, MD": 4.5, … }` into a JS file, stop. That's the anti-pattern
this rule exists to prevent. Existing in-source seeds (e.g.
`visitClimateSeed`) are debt to migrate, not a pattern to copy.

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
  of truth for the taxonomy, survey, visit-window logic, and the city factory.
  **Most domain logic lives here.** (Big godfile — split is the top architecture
  backlog item; see `ARCHITECTURE.md`.)
- `lib/city-detail-view.js` — the shared shaper (`buildCityDetailView`) that
  turns a `cityItem` into the chapter-ready envelope the magazine detail page
  consumes. Backs both the live page and `/api/mockup-data`, so they can't drift.
- `components/PlannerProvider.jsx` — React context. **Supabase is the system of
  record**: on mount it loads cities + per-user surveys/baselines/weights from
  Supabase and debounce-writes edits back (no localStorage persistence of
  planner state). Also `imageState.version` cache-bust; `resolveImage` /
  `appendBust`.
- `components/AppShell.jsx` — top nav (workflow modes), city context strip.
- Workflow modes / routes:
  - `/board` — funnel kanban (all stages). `FunnelBoard.jsx`.
  - `/calibrate` — weighted ranking + collapsed weights strip. `Calibrate.jsx`.
  - `/visit` — trip queue. `VisitWorkspace.jsx`.
  - `/decide` — post-visit survey queue. `DecideWorkspace.jsx`.
  - `/decided` — verdict archive. `DecidedArchive.jsx`.
  - `/baseline` — rate known places from memory (Track 2 answer key). `Baseline.jsx`.
  - `/cities/[slug]` — per-city detail, the **magazine chapter layout**
    (`CityDetailRoute` → `components/city-detail/MagazineDetail.jsx`, styled by
    `app/city-detail.css` scoped under `.cd-root`). See
    `features/magazine-detail.md`.
  - `/cities/[slug]/{visit,images,decide}` — per-city pages via `VisitPlanRoute`
    / `ImagesPageRoute` / `DecideRoute`, wrapping `VisitPlan` / `ImagesPage`
    (still in `PlannerShell.jsx`).
  - `/overview/board`, `/overview/matrix`, `/shortlist`,
    `/cities/[slug]/decision` — legacy URLs, now one-line `redirect()` shims to
    the routes above.
- `SurveyFlow.jsx` — the facilitated questionnaire (used by both Decide and Baseline).
- `app/api/images/{search,save}/route.js` + `lib/image-manifest.js` — image
  search (Unsplash → Openverse → Commons) and content-addressable hero save.
  One hero per city; filename is `sha256(bytes).slice(0,12)`.

## Image model

One hero image per city. No slots, no choices array. Save writes a
content-addressable file and overwrites `manifest.images[query]`. The Images
tab offers search + paste-a-URL (the Google-Images workflow without an API).
`UNSPLASH_ACCESS_KEY` lives in `.env.local` (gitignored).

## Stay-zone boundary + adaptive measurement

A city has a *stay zone* (broader walkable area, polygon stored in
`stay_zone_boundary`) and a *measurement field* (700 m around the densest
social-POI cluster *inside* the stay zone). The score is "best 700 m within
the stay zone," not "700 m around whichever pin was saved."

- **Boundary policy**: Census Place / CDP → OSM polygon → OSM reverse-geocode
  → Census Tract → NRHP historic district → point-circle → 2 km anchor circle.
  Filters: real polygon area (shoelace) in [0.5, 30] km², pin must be inside
  the bbox. Code lives in `lib/measure.js` (`fetchStayZoneBoundary`).
- **Measurement field**: `measureAround(lat, lon, { boundary })` calls
  `findVisitCenters` to find the densest 700 m cluster inside the polygon,
  then measures there. The saved pin is NOT moved by routine re-measure —
  only when the user explicitly drags it. The adaptive center is recorded in
  `geo_source` for transparency.
- **API cascade**: `POST /api/measure` ensures the boundary is current
  (lazy-fetches via the chain above, or `refreshBoundary: true` to force),
  then runs the boundary-aware measurement. No batch scripts needed for
  routine maintenance — boundaries and measurements update through the API.
- **One-time bulk migration** lives in `scripts/measure-cities.mjs` (run
  after a policy change like raising the boundary cap). Boundary metadata
  (`boundary_source`, `boundary_set_at`) is stored on the row so callers can
  detect "measurement stale vs boundary."

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

## Standing direction: complete every city's measurements

**Every city should carry a complete, cited measurement set.** Today no city
is fully complete — see **METRICS_COMPLETION.md** for the live coverage
table per metric, the gaps, and the exact script that fills each one. Treat
that file as the project's running ledger: when you backfill a metric,
update the coverage column so the next session sees an honest snapshot.

When the work in front of you isn't time-sensitive, the default productive
thing to do is move a row in that table closer to 78/78. The highest-value
gap right now is the OSM batch (44 cities). When you onboard a new city,
run the full pipeline (METRICS_COMPLETION § "Onboarding a new city") so it
lands measured, not waiting in queue.

## Feature documentation

Major features each get a markdown file under **`features/`**. See
**features/README.md** for the index. When you change a feature, update
its file in the same diff — including the TODOs / future-direction
section. Stale feature docs are worse than no feature docs; they actively
mislead the next session.

If you're touching a feature that doesn't have a doc yet (most don't), the
polite move is to write a stub before you leave so the next session starts
ahead of where you did. The stub should at minimum say what the feature is,
the entry-point files, and what state it's in.

Current docs (see `features/README.md` for the full index):
- **features/city-onboarding.md** — end-to-end Supabase-first procedure for
  adding a new city. Replaces the old `CITY_ONBOARDING.md`.
- **features/measurer-pipeline.md** — the measurer registry, runner, and
  the per-measurer contract. Per-key coverage in `METRICS_COMPLETION.md`.
- **features/chips.md** — the city attribute strip on the detail page:
  vocabulary, selection rules, current coverage, future direction.
- **features/magazine-detail.md** — the chapter-based city detail redesign
  (mockup at `public/city-detail-redesign.html`; live route not yet wired).
- **features/visit-window.md** — Charm + Truth windows, year-shape, curves.
- **features/stay-zone-map.md** — boundary cascade + adaptive measurement
  field; polygon-on-map UI still pending.
- **features/baseline-comparison.md** — the "always show vs Allison Park"
  pattern from the mockup; live route doesn't render deltas yet.
- **features/six-blocks.md** — curated walk list; data live, UI pending.
- **features/why-prose.md** — `why` / `if_wins` / `if_fails` editorial
  fields, the 2026-06-03 audit baseline.

## Conventions

- Keep `lib/planner-data.js` the home for domain logic; components stay thin.
- Per-city data lives in Supabase (see "Supabase is the source of truth").
  `normalizeState` only fills in missing top-level fields and defaults — it
  does not re-seed values from JS-side maps. User-entered data (surveys, trip
  details) is preserved and never overwritten by normalize.
- When adding a metric: add it to `metricTaxonomy` *with its source*, and the
  Detail page renders it automatically. Don't add a metric without a citation.
- Dev server: `npm run dev` (port 3000). The repo has no test suite; verify by
  hitting routes and checking the rendered pages.

## Verifying in the preview (auth bypass)

The app is auth-gated by Supabase. To drive the preview from `preview_*`
tools, use the local `/api/dev-login` endpoint — it's hard-disabled in
production and mints a real Supabase session from `DEV_LOGIN_EMAIL` /
`DEV_LOGIN_PASSWORD` (set in `.env.local`).

Two ways in, depending on whether the page has rendered:

1. **Form rendered** — wait for `button.auth-ghost` ("Dev sign-in
   (localhost only)") to appear, then `preview_click` it. AuthGate's
   `devSignIn()` handles the rest. Simplest path.
2. **Form never renders / page stuck on "Loading…"** — call the endpoint
   directly and adopt the session via the Supabase client:

   ```js
   const r = await fetch('/api/dev-login', { method: 'POST' });
   const { access_token, refresh_token } = await r.json();
   await window.__supabase?.auth.setSession({ access_token, refresh_token });
   location.reload();
   ```

   `window.__supabase` is only available if exposed; otherwise click the
   button (option 1). Do NOT hand-craft the `sb-<ref>-auth-token`
   localStorage entry — Supabase's `getSession()` will hang trying to
   refresh a session it didn't mint, leaving the page in permanent
   "Loading…".

Symptoms that the dev server is itself broken (not the auth path):
repeated `FATAL: Turbopack ... Next.js package not found` in
`preview_logs`. GET / still returns 200 (the SSR shell renders), but the
client chunks fail to build, so React never hydrates and no buttons appear.
Fix by restarting the dev server; auth bypass cannot work until that's
healthy.
