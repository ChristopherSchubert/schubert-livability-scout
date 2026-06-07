# Architecture review

A standing assessment of where the codebase is and the sequenced path to
excellent architecture + code quality. Update the "Done" section as items land;
re-prioritise the backlog as the shape changes.

## Guiding constraints (don't regress these)

- **Supabase is the system of record.** No CSVs, no in-source `{ "City, ST": … }`
  seed maps feeding runtime values. (See CLAUDE.md.)
- **Never invent data.** Every displayed number is computed from a cited source
  or shown as an honest blank.
- **Domain logic in `lib/`, components stay thin.**

## Current state (snapshot)

Largest modules, by lines:

| File | Lines | Assessment |
|---|---|---|
| `lib/planner-data.js` | ~1520 | **Godfile.** Taxonomy + survey + scoring + visit-window + city factory + starter seed + two legacy seed maps + ~30 helpers. The #1 split target. |
| `lib/measure.js` | ~1514 | Large but cohesive (the measurement routine). Deliberately isomorphic — imported by Node `.mjs` scripts AND the API route, so it must NOT take a `server-only` guard. |
| `lib/image-manifest.js` | ~636 | Image search/save cascade. Self-contained. |
| `components/PlannerShell.jsx` | ~532 | Down from 912 after the magazine wire-up. Now only `VisitPlan` + `ImagesPage` + their helpers. Split next. |
| `components/PlannerProvider.jsx` | ~286 | Healthy. Supabase-first context. |

What's healthy: the measurer registry (`lib/measurers/*`, one file per source),
the Supabase-first provider, the new `lib/city-detail-view.js` shared shaper,
the magazine chapter components (each < 230 lines).

## Done this session

- **Removed the legacy hand-scored `matrix` system end-to-end** — the "score
  dressed as a measurement" that violated the prime rule. Dropped from
  `planner-data.js`, two components, the provider, `city-row.js`, `db.js`,
  schema; migration `0003_drop_matrix_column.sql`. Everything now scores via
  `weightedAxisScore` over cited `measured_metrics`.
- **Extracted `lib/city-detail-view.js`** so the `/api/mockup-data` route and
  the live React detail page share one envelope shaper (no drift).
- **Wired the magazine detail layout** into `/cities/[slug]`; deleted the
  orphaned `CityDetail` + its dead helpers from `PlannerShell.jsx` (912 → 532).
- **Aligned the dashboard palette + typography** with the editorial detail page.
- **Fixed CLAUDE.md** (it claimed localStorage persistence; it's Supabase-first.
  Added the redirect routes, the shared shaper, and the magazine route.)

## Backlog (prioritised)

### P1 — Split `lib/planner-data.js`
The single highest-leverage refactor. Proposed modules (keep the public export
surface identical via a barrel so the migration is a series of safe moves):
- `lib/domain/taxonomy.js` — `metricTaxonomy`, `metricMethod`, `metricScore`,
  `metricScoreBands`, `metricByKey`.
- `lib/domain/survey.js` — `surveyAxes`, `feltScore`, `surveyComplete`,
  `emptySurvey`.
- `lib/domain/scoring.js` — `axisRollup`, `weightedAxisScore`,
  `learnedAxisWeights`, `calibrateAxes`, `defaultWeights`, `visitNowScore`.
- `lib/domain/visit-window.js` — `cityVisitWindow`, `monthlyComfortScores`,
  `monthComfort`, `MONTHS`.
- `lib/domain/city.js` — the `cityItem` shape, `city()` factory, `cityZones`,
  `citySlug`, `cityImageQuery`, `normalizeState`.
- `lib/seeds/` — `starter-cities.js`, and the two legacy maps below.
- `lib/format.js` — `formatDriveFromPit`, `formatMapSearchQuery`, slug helpers.
Risk: medium (many importers). Mitigate with a re-export barrel + one module per
PR + `next build` after each.

### P2 — Purge the remaining in-source seed maps
`planner-data.js` still holds `visitClimateSeed` and `CITY_IMAGE_QUERY_OVERRIDES`
(~139 city-keyed literals total, incl. `starterCities`). CLAUDE.md flags these as
debt. Move `image_query_override` and the visit-climate seed onto Supabase
columns/tables; backfill in a one-off migration; delete the maps. Add a CI lint
that fails on `"[A-Z][a-z]+, [A-Z]{2}":` literals under `lib/`. (The worst
offender — `matrixSeedScores`, which fed a *rendered score* — is already gone.)
Risk: medium (needs a backfill run against the DB). `starterCities` can stay as
the empty-DB bootstrap fallback, or move to a seed SQL file.

### P3 — Split `components/PlannerShell.jsx`
Move `VisitPlan` → `components/city-visit/VisitPlan.jsx`, `ImagesPage` →
`components/city-images/ImagesPage.jsx`, shared atoms (`Field`, `defaultSearch`,
`moveItem`, `PasteByUrlPanel`) into colocated files. Then `PlannerShell.jsx`
disappears. Risk: low (only two route wrappers import it).

### P4 — Type the data shape (incremental TS in `lib/`)
Convert `lib/` to TypeScript starting with `domain/*` after the P1 split; check
in `supabase gen types`. Components stay JSX initially. Locks `cityItem.*`
access against one definition — the precondition that makes every later refactor
safe. Risk: low-medium; do it module-by-module.

### P5 — Tests (there are none)
- Unit: `lib/domain/scoring.js` (`metricScore` threshold/ceiling math,
  `axisRollup`, `weightedAxisScore`) and `visit-window.js` (charm/truth pick).
  Pure functions — cheap, high-value. Vitest.
- Snapshot: freeze one city's measurer output against a recorded Overpass dump.
- Playwright visual snapshots of each route via the dev-login bypass (3 cities ×
  6 pages) — replaces the current "load it and look" loop, the biggest source of
  regression risk.

### P6 — Surface candidate cores on the detail map
`findVisitCenters` runs server-side and isn't in the envelope, so the magazine
Where-map shows boundary + pin + field but not the ranked-core picker from the
mockup. Add a `visit_cores jsonb` column (refreshed by `/api/measure`) or a
client compute, then restore the candidate list + click-to-reselect.

## Explicitly out of scope (don't do these now)

- No UI framework (shadcn/Radix) — the editorial style is bespoke and a
  component library would fight it.
- No state-management library — Context + Supabase is right for this scale.
- No `server-only` on `lib/measure.js` — it's intentionally isomorphic and
  reused by Node scripts; the guard would break them.
- No CMS — `why` belongs in a Supabase column, edited in the app.
